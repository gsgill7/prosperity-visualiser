"""
Vercel Python serverless function — POST /api/backtest

Accepts:
    { "trader_code": str, "days": ["0--1", "0--2"], "merge_pnl": bool }

Returns:
    200 text/plain  — log file content (Sandbox / Activities / Trade History)
    400 application/json — { "error": "...", "detail": "<traceback>" }
"""

import io
import json
import os
import sys
import traceback
import uuid
import importlib.util
from collections import defaultdict
from functools import reduce
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# ── Resolve repo root from this file's location ───────────────────────────────
# api/backtest.py  →  parent = repo root
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT    = os.path.normpath(os.path.join(_API_DIR, ".."))
_BT_DIR  = os.path.join(_ROOT, "backtester")

# Add to sys.path so imports work:
#   _ROOT    → `from datamodel import ...`  (root-level datamodel.py)
#   _BT_DIR  → `from prosperity4bt.xxx import ...`
for p in (_ROOT, _BT_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from prosperity4bt.runner import run_backtest                     # noqa: E402
from prosperity4bt.file_reader import FileSystemReader            # noqa: E402
from prosperity4bt.models import BacktestResult, TradeMatchingMode  # noqa: E402

# Use FileSystemReader with a concrete path — much more reliable in serverless
# than PackageResourcesReader (which depends on importlib.resources pkg lookup)
_RESOURCES = Path(_BT_DIR) / "prosperity4bt" / "resources"


# ── Day parsing ───────────────────────────────────────────────────────────────

def _parse_day(spec: str) -> tuple[int, int]:
    """'0--1' → (0, -1),  '0--2' → (0, -2),  '0-1' → (0, 1)"""
    round_str, day_str = spec.split("-", 1)
    return int(round_str), int(day_str)


# ── Result merging (mirrors __main__.merge_results) ───────────────────────────

def _merge(a: BacktestResult, b: BacktestResult, merge_pnl: bool) -> BacktestResult:
    a_last_ts = a.activity_logs[-1].timestamp
    ts_offset = a_last_ts + 100
    sandbox   = a.sandbox_logs[:] + [r.with_offset(ts_offset) for r in b.sandbox_logs]
    trades    = a.trades[:]       + [r.with_offset(ts_offset) for r in b.trades]
    if merge_pnl:
        pnl_off: dict[str, float] = defaultdict(float)
        for row in reversed(a.activity_logs):
            if row.timestamp != a_last_ts:
                break
            pnl_off[row.columns[2]] = row.columns[-1]
        act = a.activity_logs[:] + [
            r.with_offset(ts_offset, pnl_off[r.columns[2]]) for r in b.activity_logs
        ]
    else:
        act = a.activity_logs[:] + [r.with_offset(ts_offset, 0) for r in b.activity_logs]
    return BacktestResult(a.round_num, a.day_num, sandbox, act, trades)


# ── Serialise to .log format (mirrors __main__.write_output) ──────────────────

def _serialize(result: BacktestResult) -> str:
    buf = io.StringIO()
    buf.write("Sandbox logs:\n")
    for row in result.sandbox_logs:
        buf.write(str(row))
    buf.write("\n\n\nActivities log:\n")
    buf.write(
        "day;timestamp;product;"
        "bid_price_1;bid_volume_1;bid_price_2;bid_volume_2;bid_price_3;bid_volume_3;"
        "ask_price_1;ask_volume_1;ask_price_2;ask_volume_2;ask_price_3;ask_volume_3;"
        "mid_price;profit_and_loss\n"
    )
    buf.write("\n".join(map(str, result.activity_logs)))
    buf.write("\n\n\n\n\nTrade History:\n[\n")
    buf.write(",\n".join(map(str, result.trades)))
    buf.write("]")
    return buf.getvalue()


# ── Vercel handler ────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # suppress stdout noise in Vercel logs

    def _cors(self, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self._cors(204)
        self.end_headers()

    def do_POST(self):
        trader_path: str | None = None
        try:
            length       = int(self.headers.get("Content-Length", 0))
            body         = json.loads(self.rfile.read(length))
            trader_code  = body.get("trader_code", "").strip()
            days         = body.get("days", ["0--1"])
            merge_pnl    = bool(body.get("merge_pnl", False))

            if not trader_code:
                raise ValueError("No trader code received — select a .py file first")
            if not days:
                raise ValueError("Select at least one day to backtest")

            # ── Write trader to /tmp ─────────────────────────────────────────
            uid         = uuid.uuid4().hex
            trader_path = f"/tmp/trader_{uid}.py"
            with open(trader_path, "w", encoding="utf-8") as fh:
                fh.write(trader_code)

            # Make /tmp importable (helps if trader does relative imports)
            if "/tmp" not in sys.path:
                sys.path.insert(0, "/tmp")

            # ── Import Trader class ──────────────────────────────────────────
            spec = importlib.util.spec_from_file_location(f"_trader_{uid}", trader_path)
            mod  = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)   # type: ignore[union-attr]
            except ImportError as exc:
                raise ImportError(
                    f"Import error in your trader: {exc}\n\n"
                    "The server only has access to the Python standard library and "
                    "'datamodel'. If your trader uses numpy, pandas, or custom modules, "
                    "run the backtester locally and upload the .log file instead."
                ) from exc

            if not hasattr(mod, "Trader"):
                raise ValueError("Your file must define a class named 'Trader'")

            # ── Sanity-check data path ───────────────────────────────────────
            if not _RESOURCES.is_dir():
                raise RuntimeError(
                    f"Data directory not found at {_RESOURCES}. "
                    "This is a server configuration issue."
                )

            # ── Run backtest ─────────────────────────────────────────────────
            file_reader = FileSystemReader(_RESOURCES)
            results: list[BacktestResult] = []
            for day_spec in sorted(days, key=lambda s: _parse_day(s)):
                rnd, day = _parse_day(day_spec)
                results.append(run_backtest(
                    mod.Trader(),
                    file_reader,
                    rnd,
                    day,
                    print_output=False,
                    trade_matching_mode=TradeMatchingMode.all,
                    no_names=True,
                    show_progress_bar=False,
                ))

            if not results:
                raise ValueError("No results — check your day selection")

            merged  = reduce(lambda a, b: _merge(a, b, merge_pnl), results)
            payload = _serialize(merged).encode("utf-8")

            self._cors(200)
            self.send_header("Content-Type",   "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        except Exception:
            tb  = traceback.format_exc()
            msg = tb.strip().splitlines()[-1]   # last line = the actual exception
            err = json.dumps({"error": msg, "detail": tb}).encode("utf-8")
            self._cors(400)
            self.send_header("Content-Type",   "application/json")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)

        finally:
            if trader_path and os.path.exists(trader_path):
                try:
                    os.unlink(trader_path)
                except OSError:
                    pass
