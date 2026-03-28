# Prosperity Visualizer

**A tick-level L2 order book replay and analytics dashboard for the [IMC Prosperity](https://prosperity.imc.com/) algorithmic trading competition.**

Upload a backtest log → scrub through every tick → analyse market microstructure. Or paste your `Trader` class, click **Run Backtest**, and results load instantly in the browser — no local Python required.

---

## Live Demo

🚀 **[prosperity-visualizer.vercel.app](https://prosperity-visualizer.vercel.app)** — drag in `sample/demo.log` to try it immediately.

---

## Features

### 8 Analysis Tabs

| Tab | What it shows |
|-----|---------------|
| **Time-Series** | Price + own trades + signal overlays (wall_mid, bid/ask walls, fair_value, EMA). Tick-scrubber replays the L2 order book snapshot at any timestamp. Multi-run PnL comparison overlay. |
| **Flow Analysis** | NPC lot-size distribution — identifies which bots are active by their deterministic order sizes. |
| **Seasonality** | Mid-price by intra-day timestamp split across multiple days — reveals recurring price patterns. |
| **Volume Profile** | Price-volume histogram of your own fills — where you're getting size done. |
| **Stochastic** | Hurst exponent (Rescaled Range, radix-2 FFT) classifies the instrument as mean-reverting, random, or trending. Dominant period annotation. |
| **Microstructure** | Engine liquidity walls vs your execution prices. Edge vs Wall Mid per fill. Requires `SIG` logging. |
| **Bot Patterns** | Maker/taker classification of NPC bots — equidistant simultaneous prints = market makers (■), directional = takers (▲▼). |
| **Imbalance** | Order Book Imbalance (OBI), Wall Mid skew, tape velocity, Pearson correlation OBI → ΔPrice. |

### In-Browser Backtester
Upload a `Trader` class, select Round 0 days, click **Run Backtest** — the server runs your strategy against real competition data and streams the log back. Results load into the visualizer exactly like a manually uploaded file.

### Log Formats Supported
- Backtester `.log` (Sandbox logs / Activities log / Trade History)
- IMC submission `.json` (lambda log array)
- `.zip` archives of either

---

## Quick Start

```bash
# No installation needed — open directly
open index.html

# Or start a local server (avoids ES-module CORS on file://)
python -m http.server 8000
```

Drag `sample/demo.log` onto the page, or click **Upload New Logs**. Use the playback bar to scrub through ticks.

---

## In-Browser Backtest (Vercel deployment)

```
1. Deploy to Vercel (see below)
2. Click "Select trader.py" in the sidebar → choose your trader file
3. Pick days (Round 0 Day -1 and/or Day -2 are bundled)
4. Click "Run Backtest"
```

The Vercel serverless function (`api/backtest.py`) executes your `Trader` class against bundled market data, serializes the result in the standard `.log` format, and returns it for the frontend parser to ingest. No data leaves your browser except the code you upload.

> **Note:** Only Round 0 data is bundled in the hosted version. For other rounds, run the backtester locally and upload the `.log` file.

---

## Running the Backtester Locally

```bash
pip install -e backtester/

# Backtest your trader on round 0, days -1 and -2 with merged PnL
prosperity4bt example_trader.py 0--1 0--2 --merge-pnl --out my_run.log

# Load in the visualizer
open index.html  # then drag my_run.log onto the page
```

### Logger class

To get full visualizer output (own-trade overlays, position chart, sandbox logs), use the `Logger` class from `example_trader.py`:

```python
from example_trader import Logger

logger = Logger()

class Trader:
    def run(self, state: TradingState):
        orders = {}
        # ... your logic ...
        logger.flush(state, orders, conversions=0, trader_data="")
        return orders, 0, ""
```

### SIG signals (optional)

Emit structured signals from your trader to unlock the Microstructure and Imbalance tabs:

```python
# Inside Trader.run():
print(f"SIG|{product}|wall_mid={fair_value}|bid_wall={best_bid}|ask_wall={best_ask}|obi={obi:.3f}")
```

The dashboard parses `SIG|SYMBOL|key=val|...` lines from lambda logs. Supported keys:
`wall_mid`, `bid_wall`, `ask_wall`, `fair_value`, `ema`, `obi`, `tape_vel`, `position`.

---

## Log Format Reference

### Backtester `.log`

```
Sandbox logs:
{"sandboxLog":"","lambdaLog":"[[ts,traderData,...]]","timestamp":0}

Activities log:
day;timestamp;product;bid_price_1;bid_volume_1;...;mid_price;profit_and_loss
0;0;KELP;9997;30;9996;25;9995;18;10003;22;10004;15;10005;10;10000.0;0.0

Trade History:
[{"timestamp":0,"buyer":"SUBMISSION","seller":"Adam","symbol":"KELP","currency":"SEASHELLS","price":9997,"quantity":5}]
```

### Submission `.json`

Array of lambda log rows:
```json
[[timestamp, traderData, listings, orderDepths, ownTrades, marketTrades, position, observations], submittedOrders, conversions, traderData, logString]
```

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel deploy --prod
```

Vercel auto-detects the static site. The `api/backtest.py` serverless function is picked up automatically. No build step required.

**Requirements:** The Python function uses `jsonpickle`, `orjson`, and `tqdm` — installed from `api/requirements.txt` by Vercel automatically.

---

## Architecture

```
index.html          Pure HTML/CSS shell — no framework, no build step
src/parser.js       Client-side port of all parsing and analytics:
                      parseBT()        — backtester .log (3-section format)
                      parseLambdaLog() — submission JSON / lambda logs
                      computeHurst()   — Rescaled Range via polyfit
                      computeFFT()     — radix-2 Cooley-Tukey in-place
                      OBI / tape velocity computed from L2 order depths
src/charts.js       Plotly.js renderers for all 8 tabs
src/app.js          State machine, file handling, playback, tab routing,
                      postBacktest() → POST /api/backtest → parseFile()
api/backtest.py     Vercel Python serverless function:
                      imports backtester programmatically (no CLI),
                      runs Trader against bundled CSVs,
                      serializes BacktestResult → .log text → browser
backtester/         prosperity4bt — open-source IMC backtester
datamodel.py        Official Prosperity 4 datamodel (data classes only)
```

**No build step. No framework. No server for local use.** The entire parsing pipeline — including Hurst, FFT, OBI, and maker/taker classification — runs in the browser via plain ES modules.

---

## Analytics Reference

| Metric | Method |
|--------|--------|
| Hurst exponent | Polyfit on log-log of lagged std deviations × 2.0; H < 0.5 = mean-reverting, H > 0.5 = trending |
| FFT | Radix-2 Cooley-Tukey; period = (n × 100ms) / k to match `scipy.rfftfreq(n, d=100)` |
| OBI | `(bidVol − askVol) / (bidVol + askVol)` per tick from L2 data |
| Tape velocity | Net signed taker volume per tick (above/below mid = buy/sell) |
| Maker/taker | Equidistant multi-lot trades at same timestamp = makers; single/directional = takers |
| Day rollover | `timestamp < prevTimestamp → goff += 1,000,000`; PnL offset accumulated per symbol |

---

## Sample Data

`sample/demo.log` — 300 ticks of KELP and SQUID_INK from Round 0 Day -1, generated from bundled CSVs. Sufficient for Hurst and FFT analysis (> 100 ticks required).

---

## Backtester Credit

`backtester/` is a fork of [jmerle/imc-prosperity-3-backtester](https://github.com/jmerle/imc-prosperity-3-backtester), adapted for Prosperity 4.
