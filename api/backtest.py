"""
Vercel Python serverless function — POST /api/backtest

Accepts:
    { "trader_code": str, "days": ["0--1", "0--2"], "merge_pnl": bool }

Returns:
    200 text/plain  — log file content (Sandbox logs / Activities log / Trade History)
    400 application/json — { "error": "..." }

The returned log is in the exact .log format that the frontend's parseFile() already
understands — no frontend changes needed to the parser.
"""

import io
import json
import os
import sys
import uuid
import importlib.util
from collections import defaultdict
from functools import reduce
from http.server import BaseHTTPRequestHandler

# ── Make backtester importable ────────────────────────────────────────────────
# repo root/backtester/ contains the prosperity4bt package
_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(_ROOT, "backtester"))

from prosperity4bt.runner import run_backtest          # noqa: E402
from prosperity4bt.file_reader import PackageResourcesReader  # noqa: E402
from prosperity4bt.models import BacktestResult, TradeMatchingMode  # noqa: E402


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_day(spec: str) -> tuple[int, int]:
    """'0--1' → (0, -1);  '0-1' → (0, 1);  '0-0' → (0, 0)"""
    round_str, day_str = spec.split("-", 1)
    return int(round_str), int(day_str)


def _merge(a: BacktestResult, b: BacktestResult, merge_pnl: bool) -> BacktestResult:
    """Combine two BacktestResult objects with timestamp offset."""
    a_last_ts = a.activity_logs[-1].timestamp
    ts_offset = a_last_ts + 100

    sandbox_logs  = a.sandbox_logs[:]  + [r.with_offset(ts_offset) for r in b.sandbox_logs]
    trades        = a.trades[:]        + [r.with_offset(ts_offset) for r in b.trades]

    if merge_pnl:
        pnl_off: dict[str, float] = defaultdict(float)
        for row in reversed(a.activity_logs):
            if row.timestamp != a_last_ts:
                break
            pnl_off[row.columns[2]] = row.columns[-1]
        act = a.activity_logs[:] + [r.with_offset(ts_offset, pnl_off[r.columns[2]]) for r in b.activity_logs]
    else:
        act = a.activity_logs[:] + [r.with_offset(ts_offset, 0) for r in b.activity_logs]

    return BacktestResult(a.round_num, a.day_num, sandbox_logs, act, trades)


def _serialize(result: BacktestResult) -> str:
    """
    Serialize BacktestResult to the .log text format that parseBT() in parser.js expects.
    Mirrors write_output() from __main__.py exactly.
    """
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

    buf.write("\n\n\n\n\nTrade History:\n")
    buf.write("[\n")
    buf.write(",\n".join(map(str, result.trades)))
    buf.write("]")

    return buf.getvalue()


# ── Vercel handler ────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # suppress default access logs in Vercel output

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
            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length))

            trader_code: str       = body.get("trader_code", "").strip()
            days:        list[str] = body.get("days", ["0--1"])
            merge_pnl:   bool      = bool(body.get("merge_pnl", False))

            if not trader_code:
                raise ValueError("trader_code is empty")
            if not days:
                raise ValueError("at least one day must be specified")

            # ── Write trader code to /tmp ────────────────────────────────────
            uid          = uuid.uuid4().hex
            trader_path  = f"/tmp/trader_{uid}.py"
            with open(trader_path, "w", encoding="utf-8") as fh:
                fh.write(trader_code)

            # ── Dynamically import Trader class ──────────────────────────────
            spec = importlib.util.spec_from_file_location(f"_trader_{uid}", trader_path)
            mod  = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)  # type: ignore[union-attr]

            if not hasattr(mod, "Trader"):
                raise ValueError("trader.py must define a Trader class with a run() method")

            # ── Run backtest for each requested day ──────────────────────────
            file_reader = PackageResourcesReader()
            results: list[BacktestResult] = []

            for day_spec in days:
                rnd, day = _parse_day(day_spec)
                res = run_backtest(
                    mod.Trader(),
                    file_reader,
                    rnd,
                    day,
                    print_output=False,
                    trade_matching_mode=TradeMatchingMode.all,
                    no_names=True,
                    show_progress_bar=False,
                )
                results.append(res)

            if not results:
                raise ValueError("No backtest results produced — check the day specification")

            merged    = reduce(lambda a, b: _merge(a, b, merge_pnl), results)
            log_text  = _serialize(merged)

            payload = log_text.encode("utf-8")
            self._cors(200)
            self.send_header("Content-Type",   "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        except Exception as exc:
            err = json.dumps({"error": str(exc)}).encode("utf-8")
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
