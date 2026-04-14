# Prosperity Visualizer 


SETUP

To use this please insert the following logger class into your trader file:
'''python

    from datamodel import *
    import json
    from typing import Any
    class Logger:
        def __init__(self) -> None:
            self.logs: str = ""
            self.max_log_length: int = 7500
    
        def print(self, *objects: Any, sep: str = " ", end: str = "\n") -> None:
            log_line = sep.join(map(str, objects)) + end
            if len(self.logs) + len(log_line) < self.max_log_length - 500:
                self.logs += log_line
            elif not self.logs.endswith("...\n"):
                self.logs += "...\n"
    
        def flush(
            self,
            state: TradingState,
            orders: dict[Symbol, list[Order]],
            conversions: int,
            trader_data: str,
        ) -> None:
            print(self.to_json([
                self.compress_state(state, trader_data),
                self.compress_orders(orders),
                conversions,
                trader_data,
                self.logs,
            ]))
            self.logs = ""
    
        def compress_state(self, state: TradingState, trader_data: str) -> list[Any]:
            return [
                state.timestamp,
                trader_data,
                self.compress_listings(state.listings),
                self.compress_order_depths(state.order_depths),
                self.compress_trades(state.own_trades),
                self.compress_trades(state.market_trades),
                state.position,
                self.compress_observations(state.observations),
            ]
    
        def compress_listings(self, listings: dict[Symbol, Listing]) -> list[list[Any]]:
            return [[l.symbol, l.product, l.denomination] for l in listings.values()] if listings else []
    
        def compress_order_depths(self, order_depths: dict[Symbol, OrderDepth]) -> dict[Symbol, list[Any]]:
            return {s: [od.buy_orders or {}, od.sell_orders or {}] for s, od in order_depths.items()} if order_depths else {}
    
        def compress_trades(self, trades: dict[Symbol, list[Trade]]) -> list[list[Any]]:
            return [[t.symbol, t.price, t.quantity, t.buyer, t.seller, t.timestamp]
                    for arr in trades.values() for t in arr] if trades else []
    
        def compress_observations(self, observations: Observation) -> list[Any]:
            if not observations:
                return [{}, {}]
            conv = {}
            if hasattr(observations, "conversionObservations") and observations.conversionObservations:
                for p, o in observations.conversionObservations.items():
                    conv[p] = [
                        getattr(o, "bidPrice", None), getattr(o, "askPrice", None),
                        getattr(o, "transportFees", None), getattr(o, "exportTariff", None),
                        getattr(o, "importTariff", None),
                    ]
            plain = getattr(observations, "plainValueObservations", {}) or {}
            return [plain, conv]
    
        def compress_orders(self, orders: dict[Symbol, list[Order]]) -> list[list[Any]]:
            return [[o.symbol, o.price, o.quantity] for arr in orders.values() for o in arr] if orders else []
    
        def to_json(self, value: Any) -> str:
            return json.dumps(value, cls=ProsperityEncoder, separators=(",", ":"), default=str)


    logger = Logger()
   
    class Trader:
        def run(self, state: TradingState) -> tuple[dict[Symbol, list[Order]], int, str]:
            orders = {}
            conversions = 0
            trader_data = state.traderData
   
            # ... YOUR TRADING LOGIC HERE ...
            # (e.g., populate the orders dictionary)
   
            # 1. Log your custom signals so they draw on the chart!
            logger.print(f"SIG|AMETHYSTS|fair_value=10000|ema=9998.5")
   
            # 2. Flush the logger at the very end to serialize the state
            logger.flush(state, orders, conversions, trader_data)
   
            return orders, conversions, trader_data

'''


A tick-level L2 order book replay and analytics dashboard for the [IMC Prosperity](https://prosperity.imc.com/) algorithmic trading competition.

Upload a backtest log to scrub through every tick and analyse market microstructure. Alternatively, submit a `Trader` class directly in the browser — the server runs the backtest against real competition data and loads the results into the visualizer without any local Python setup.

**Live:** [https://prosperity-visualizer-public.vercel.app](https://prosperity-visualiser-public.vercel.app/) — click **Use Demo Trader**, then **Run Backtest** to see the chart populated immediately.

---

## 🚀 Quickstart: Custom Logger & Chart Signals

To get the visualizer to show all its features—overlaying your exact buy/sell orders, plotting your position, and drawing custom signal lines like fair value or EMAs—you must use a specific `Logger` class.

**1. Copy the `Logger` class** from [`example_trader.py`](./example_trader.py) into your own `trader.py` file.
**2. Call `logger.flush()`** at the very end of your `Trader.run()` method.
**3. (Optional) Log custom signals** by printing `SIG|PRODUCT|key=value` strings. The visualizer will automatically graph these values as lines on your candlestick chart!

```python
from datamodel import *
import json
from typing import Any

# Copy the entire Logger class from example_trader.py here...
class Logger:
    # ...
    pass

logger = Logger()

class Trader:
    def run(self, state: TradingState) -> tuple[dict[Symbol, list[Order]], int, str]:
        orders = {}
        conversions = 0
        trader_data = state.traderData
        
        # ... YOUR TRADING LOGIC HERE ...
        
        # Log custom signals to draw on the chart (e.g., fair value, EMA)
        logger.print(f"SIG|AMETHYSTS|fair_value=10000|ema=9998.5")
        
        # Flush at the end of every tick to serialize the state
        logger.flush(state, orders, conversions, trader_data)
        
        return orders, conversions, trader_data
```

---

## Analysis Tabs

| Tab | Description |
|-----|-------------|
| **Time-Series** | Candlestick price chart with own-trade overlays and signal annotations (fair value, EMA, wall mid). Toggleable overlays for Bid, Ask, Mid, Orders, and BB Bands (auto-detected when `bb_mid`/`bb_upper`/`bb_lower` SIG signals are present). Tick-scrubber replays the full L2 order book snapshot at any timestamp. Supports multi-run PnL comparison. |


---

## In-Browser Backtest

The sidebar includes a one-click backtest runner. Clicking **Use Demo Trader** loads the bundled `demo_trader.py` market-making strategy and selects both Round 0 days. Clicking **Run Backtest** sends the trader source to a Vercel Python serverless function (`api/backtest.py`), which:

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

# Backtest on Round 0, days -1 and -2
prosperity4bt demo_trader.py 0--1 0--2 --out my_run.log

# Open the visualizer and drag my_run.log onto the page
python -m http.server 8000
```

---

## Architecture

```
index.html          Static HTML/CSS shell — no framework, no build step
src/parser.js       All parsing and analytics, running client-side:
                      parseBT()        — backtester .log (three-section format)
                      parseLambdaLog() — submission JSON / lambda log arrays
src/charts.js       Plotly.js renderers for all tabs
src/app.js          Application state, file handling, playback controls,
                      tab routing, and postBacktest() fetch/parse pipeline
api/backtest.py     Vercel Python serverless function — runs Trader class
                      against bundled CSVs, returns serialized .log text
backtester/         prosperity4bt backtester (see credits below)
datamodel.py        Official Prosperity 4 datamodel
```

The entire analytics pipeline runs in the browser as plain ES modules. No build tooling, no bundler, no server required for local use.

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

## Deploying

```bash
npm i -g vercel
vercel deploy --prod
```

Vercel detects the static site and the `api/backtest.py` serverless function automatically. Dependencies are installed from `api/requirements.txt`. No build step is required.

---

## Credits

`backtester/` is a fork of [jmerle/imc-prosperity-3-backtester](https://github.com/jmerle/imc-prosperity-3-backtester), adapted for Prosperity 4.
