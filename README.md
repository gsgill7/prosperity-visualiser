# Prosperity Visualizer

A tick-level L2 order book replay and analytics dashboard for the [IMC Prosperity](https://prosperity.imc.com/) algorithmic trading competition.

Upload a backtest log to scrub through every tick and analyse market microstructure. Alternatively, submit a `Trader` class directly in the browser — the server runs the backtest against real competition data and loads the results into the visualizer without any local Python setup.

**Live:** [prosperity-visualizer.vercel.app](https://prosperity-visualizer.vercel.app) — click **Use Demo Trader**, then **Run Backtest** to see the chart populated immediately.

---

## Analysis Tabs

| Tab | Description |
|-----|-------------|
| **Time-Series** | Candlestick price chart with own-trade overlays and signal annotations (fair value, EMA, wall mid). Toggleable overlays for Bid, Ask, Mid, Orders, and BB Bands (auto-detected when `bb_mid`/`bb_upper`/`bb_lower` SIG signals are present). Tick-scrubber replays the full L2 order book snapshot at any timestamp. Supports multi-run PnL comparison. |
| **Flow Analysis** | NPC lot-size distribution. Identifies which market-making bots are active based on their deterministic order sizes. |
| **Seasonality** | Mid-price by intra-day timestamp, split across multiple days. Surfaces recurring intra-day price patterns. |
| **Volume Profile** | Price-volume histogram of own fills. Shows where execution is concentrated relative to the price distribution. |
| **Stochastic** | Hurst exponent via Rescaled Range and radix-2 FFT. Classifies the instrument as mean-reverting (H < 0.5), random walk (H ≈ 0.5), or trending (H > 0.5), with dominant period annotation. |
| **Microstructure** | Engine liquidity walls plotted against execution prices. Computes edge-vs-wall-mid per fill. Requires `SIG` signal logging (see below). |
| **Bot Patterns** | Maker/taker classification of NPC bots. Equidistant simultaneous multi-lot prints are classified as market makers; directional single-lot prints as takers. |
| **Imbalance** | Order Book Imbalance (OBI), wall-mid skew, tape velocity, and Pearson correlation between OBI and subsequent price change. |

---

## In-Browser Backtest

The sidebar includes a one-click backtest runner. Clicking **Use Demo Trader** loads the bundled `demo_trader.py` market-making strategy, selects both Round 0 days, and enables PnL merging. Clicking **Run Backtest** sends the trader source to a Vercel Python serverless function (`api/backtest.py`), which:

1. Writes the trader code to `/tmp` and imports the `Trader` class dynamically via `importlib`.
2. Runs the backtester against bundled Round 0 market data CSVs using `FileSystemReader`.
3. Merges multi-day results with timestamp offsetting and optional PnL continuity.
4. Serializes the `BacktestResult` to the standard `.log` format and returns it as `text/plain`.

The browser receives the log and passes it through the same `parseFile()` pipeline used for manually uploaded files — no separate code path.

Only Round 0 data is bundled on the server. For later rounds, run the backtester locally and upload the resulting `.log` file. Traders that depend on `numpy`, `pandas`, or other third-party packages must also be run locally, as the serverless environment provides only the standard library and `datamodel`.

---

## Running the Backtester Locally

```bash
pip install -e backtester/

# Backtest on Round 0, days -1 and -2, with merged PnL
prosperity4bt demo_trader.py 0--1 0--2 --merge-pnl --out my_run.log

# Open the visualizer and drag my_run.log onto the page
python -m http.server 8000
```

### Logger

To populate own-trade overlays, position tracking, and sandbox logs in the visualizer, call `logger.flush()` at the end of every `Trader.run()` invocation:

```python
from demo_trader import Logger

logger = Logger()

class Trader:
    def run(self, state: TradingState):
        orders = {}
        # ... strategy logic ...
        logger.flush(state, orders, conversions=0, trader_data="")
        return orders, 0, ""
```

### SIG Signal Logging

To unlock the Microstructure and Imbalance tabs, emit structured signal lines from inside `Trader.run()`:

```python
print(f"SIG|{product}|fair_value={fair:.1f}|bid_wall={bid}|ask_wall={ask}|obi={obi:.3f}")
```

The parser reads `SIG|SYMBOL|key=value|...` lines from the lambda log. Supported keys:

| Key | Effect |
|-----|--------|
| `wall_mid` | Always-on white dashed line — primary fair value anchor |
| `bid_wall` | Teal line, shown when **Bid** overlay is toggled on |
| `ask_wall` | Red line, shown when **Ask** overlay is toggled on |
| `fair_value` | Blue line |
| `ema` | Orange dotted line |
| `obi`, `tape_vel`, `position` | Microstructure / Imbalance tabs |
| `bb_mid` | Purple dotted midline — shown when **BB Bands** toggle is on |
| `bb_upper`, `bb_lower` | Purple shaded Bollinger Band — shown when **BB Bands** toggle is on; toggle auto-appears when these signals are detected |

---

## Architecture

```
index.html          Static HTML/CSS shell — no framework, no build step
src/parser.js       All parsing and analytics, running client-side:
                      parseBT()        — backtester .log (three-section format)
                      parseLambdaLog() — submission JSON / lambda log arrays
                      computeHurst()   — Rescaled Range via log-log polyfit
                      computeFFT()     — radix-2 Cooley-Tukey in-place DFT
                      OBI and tape velocity from L2 order depth snapshots
src/charts.js       Plotly.js renderers for all eight tabs
src/app.js          Application state, file handling, playback controls,
                      tab routing, and postBacktest() fetch/parse pipeline
api/backtest.py     Vercel Python serverless function — runs Trader class
                      against bundled CSVs, returns serialized .log text
backtester/         prosperity4bt backtester (see credits below)
datamodel.py        Official Prosperity 4 datamodel
```

The entire analytics pipeline — Hurst exponent, FFT, OBI, tape velocity, and maker/taker classification — runs in the browser as plain ES modules. No build tooling, no bundler, no server required for local use.

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

Lambda log array format:
```json
[[timestamp, traderData, listings, orderDepths, ownTrades, marketTrades, position, observations], submittedOrders, conversions, traderData, logString]
```

---

## Analytics Reference

| Metric | Implementation |
|--------|----------------|
| Hurst exponent | Log-log polyfit of lagged standard deviations multiplied by 2.0 |
| FFT | Radix-2 Cooley-Tukey; period = (n × 100 ms) / k, matching `scipy.rfftfreq(n, d=100)` |
| OBI | `(bidVol - askVol) / (bidVol + askVol)` computed per tick from L2 depth |
| Tape velocity | Net signed taker volume per tick; sign determined by position relative to mid |
| Maker/taker | Equidistant multi-lot simultaneous prints classified as makers; directional single-lot as takers |
| Day rollover | `timestamp < prevTimestamp` triggers `goff += 1,000,000`; PnL offset accumulated per symbol |

---

## Deploying

```bash
npm i -g vercel
vercel deploy --prod
```

Vercel detects the static site and the `api/backtest.py` serverless function automatically. Dependencies are installed from `api/requirements.txt`. No build step is required.

---

## Credits

`backtester/` is a fork of [jmerle/imc-prosperity-3-backtester](https://github.com/jmerle/imc-prosperity-3-backtester), adapted for Prosperity 4.
