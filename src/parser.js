// parser.js — Client-side log parsing + analytics
// Supports: Prosperity ZIP, backtest .log, submission .json

const globalScope = typeof self !== 'undefined' ? self : window;
globalScope.parseFile  = parseFile;
globalScope.extractZip = extractZip;

// ─── Activities CSV ───────────────────────────────────────────────────────────
function parseActivitiesCSV(text) {
  const entries = [];
  for (const line of text.trim().split('\n')) {
    if (line.startsWith('day;') || !line.trim()) continue;
    const p = line.split(';');
    if (p.length < 17) continue;
    try {
      const day = parseInt(p[0]), ts = parseInt(p[1]), sym = p[2];
      const bids = [], asks = [];
      if (p[3])  bids.push([parseInt(p[3]),  parseInt(p[4])]);
      if (p[5])  bids.push([parseInt(p[5]),  parseInt(p[6])]);
      if (p[7])  bids.push([parseInt(p[7]),  parseInt(p[8])]);
      if (p[9])  asks.push([parseInt(p[9]),  parseInt(p[10])]);
      if (p[11]) asks.push([parseInt(p[11]), parseInt(p[12])]);
      if (p[13]) asks.push([parseInt(p[13]), parseInt(p[14])]);
      const bidMap = {}, askMap = {};
      bids.forEach(([pr, v]) => { bidMap[pr] = v; });
      asks.forEach(([pr, v]) => { askMap[pr] = v; });
      entries.push({ day, timestamp: ts, symbol: sym,
        order_depths: { [sym]: [bidMap, askMap] },
        mid: parseFloat(p[15]), pnl: parseFloat(p[16]),
        own_trades: [], market_trades: [], position: { [sym]: 0 }, logs: '' });
    } catch (_) {}
  }
  return entries;
}

// ─── Lambda log line ──────────────────────────────────────────────────────────
function parseLambdaLog(llVal) {
  try {
    const ll = JSON.parse(llVal);
    if (!Array.isArray(ll) || ll.length < 5) return null;
    const s = ll[0];
    if (!Array.isArray(s) || s.length < 7) return null;
    const orders = (ll.length > 1 && (typeof ll[1] === 'object' || Array.isArray(ll[1]))) ? ll[1] : {};
    return {
      timestamp:        s[0],
      order_depths:     (s[3] && typeof s[3] === 'object') ? s[3] : {},
      position:         (s[6] && typeof s[6] === 'object') ? s[6] : {},
      own_trades:       Array.isArray(s[4]) ? s[4] : [],
      market_trades:    Array.isArray(s[5]) ? s[5] : [],
      submitted_orders: orders,
      logs:             (ll.length > 4 && typeof ll[4] === 'string') ? ll[4] : '',
      symbol:           null,
    };
  } catch (_) { return null; }
}

// ─── Submission JSON format ───────────────────────────────────────────────────
function parseJSON(content) {
  const d = JSON.parse(content);
  let entries = [], th = [];
  if (d.activitiesLog) entries = parseActivitiesCSV(d.activitiesLog);
  const rl = d.logs || d.sandboxLogs || [];
  if (Array.isArray(rl) && rl.length) {
    const lam = rl.filter(lo => lo.lambdaLog).map(lo => parseLambdaLog(lo.lambdaLog)).filter(Boolean);
    if (entries.length) merge(entries, lam);
    else if (lam.length) entries = lam;
  }
  th = d.tradeHistory || [];
  return [entries, th];
}

// ─── Backtest .log format ─────────────────────────────────────────────────────
function parseBT(content) {
  const lam = [], entries = [];
  let th = [], sec = null;
  const sbLines = [], actLines = [], trLines = [];
  for (const line of content.split('\n')) {
    const s = line.trim();
    if      (s === 'Sandbox logs:')   { sec = 's'; continue; }
    else if (s === 'Activities log:') { sec = 'a'; continue; }
    else if (s === 'Trade History:')  { sec = 't'; continue; }
    if      (sec === 's') sbLines.push(line);
    else if (sec === 'a') actLines.push(line);
    else if (sec === 't') trLines.push(line);
  }
  if (sbLines.some(l => l.trim())) {
    let depth = 0, curLines = [];
    const tryParse = lines => {
      if (!lines.length) return;
      try { const o = JSON.parse(lines.join('\n')); if (o.lambdaLog) { const p = parseLambdaLog(o.lambdaLog); if (p) lam.push(p); } } catch (_) {}
    };
    for (const line of sbLines) {
      const s = line.trim();
      if (!s) { if (curLines.length) { tryParse(curLines); curLines = []; depth = 0; } continue; }
      curLines.push(line);
      depth += (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
      if (depth === 0 && curLines.length) { tryParse(curLines); curLines = []; }
    }
    if (curLines.length) tryParse(curLines);
  }
  const csvEntries = actLines.join('\n').trim() ? parseActivitiesCSV(actLines.join('\n')) : [];
  if (csvEntries.length) { entries.push(...csvEntries); if (lam.length) merge(entries, lam); }
  else if (lam.length) entries.push(...lam);
  const trText = trLines.join('\n').trim();
  if (trText) { try { th = JSON.parse(trText); } catch (_) {} }
  return [entries, th];
}

// ─── Merge activities with lambda logs ───────────────────────────────────────
function merge(entries, lam) {
  const m = new Map(lam.map(l => [l.timestamp, l]));
  for (const e of entries) {
    const l = m.get(e.timestamp);
    if (l) {
      e.position = l.position; e.own_trades = l.own_trades;
      e.market_trades = l.market_trades; e.logs = l.logs;
      if (l.submitted_orders !== undefined) e.submitted_orders = l.submitted_orders;
    }
  }
}

// ─── Build per-symbol data ────────────────────────────────────────────────────
function build(entries, th) {
  const dm = {};
  const getOrCreate = sym => {
    if (!dm[sym]) dm[sym] = {
      timestamps: [], mid_prices: [], l2_bids: [], l2_asks: [],
      signals: {}, buy_trades: [], sell_trades: [], market_trades: [],
      pnl: [], cash: 0, submitted: [], _pm: null, _pp: 0,
    };
    return dm[sym];
  };
  const seen = new Set();
  let goff = 0, pts = -1, prevDay = null;
  const pnlEndOfDay = {}, pnlOffset = {};

  for (const entry of entries) {
    const rt = entry.timestamp, day = entry.day !== undefined ? entry.day : null;
    const dayChanged = day !== null && prevDay !== null && day !== prevDay;
    if (rt < pts || dayChanged) {
      if (rt < pts) goff += 1_000_000;
      for (const sy in pnlEndOfDay) { pnlOffset[sy] = (pnlOffset[sy] || 0) + pnlEndOfDay[sy]; delete pnlEndOfDay[sy]; }
    }
    if (day !== null) prevDay = day;
    pts = rt;
    const ts = rt + goff, epc = {};

    for (const t of (entry.own_trades || [])) {
      if (t.length >= 6) {
        const [sy, pr, q, b, s, tt] = t;
        const k = `${sy}|${pr}|${q}|${b}|${s}|${tt}`;
        if (!seen.has(k)) {
          seen.add(k);
          const d = getOrCreate(sy);
          if      (b === 'SUBMISSION') { d.buy_trades.push([ts, pr, q, s || 'Anon']); d.cash -= pr * q; epc[sy] = (epc[sy] || 0) + q; }
          else if (s === 'SUBMISSION') { d.sell_trades.push([ts, pr, q, b || 'Anon']); d.cash += pr * q; epc[sy] = (epc[sy] || 0) - q; }
        }
      }
    }
    for (const t of (entry.market_trades || [])) {
      if (t.length >= 3) {
        const sy = t[0], pr = t[1], q = t[2], b = t[3] || '', s = t[4] || '';
        const d = getOrCreate(sy);
        if      (b === 'SUBMISSION') d.buy_trades.push([ts, pr, q, s || 'Anon']);
        else if (s === 'SUBMISSION') d.sell_trades.push([ts, pr, q, b || 'Anon']);
        else                         d.market_trades.push([ts, pr, q, b || 'Anon', s || 'Anon']);
      }
    }

    const syms = entry.symbol ? [entry.symbol] : Object.keys(entry.order_depths || {});
    for (const sym of syms) {
      const dep = (entry.order_depths || {})[sym];
      let mid = entry.mid !== undefined ? entry.mid : null;
      let bids = [], asks = [];
      if (Array.isArray(dep) && dep.length >= 2) {
        const [bu, se] = dep;
        if (bu && typeof bu === 'object') bids = Object.entries(bu).map(([p, v]) => [parseInt(p), v]).sort((a, b) => b[0] - a[0]);
        if (se && typeof se === 'object') asks = Object.entries(se).map(([p, v]) => [parseInt(p), Math.abs(v)]).sort((a, b) => a[0] - b[0]);
        if (mid === null && bids.length && asks.length) mid = (bids[0][0] + asks[0][0]) / 2;
      }
      const d = getOrCreate(sym);
      if (mid === null) mid = d._pm;
      if (mid !== null) {
        d.timestamps.push(ts); d.mid_prices.push(mid);
        d.l2_bids.push(bids.slice(0, 3)); d.l2_asks.push(asks.slice(0, 3));
        d._pm = mid;
        if (entry.pnl !== undefined) {
          pnlEndOfDay[sym] = entry.pnl;
          d.pnl.push([ts, entry.pnl + (pnlOffset[sym] || 0)]);
        } else {
          const cp = (entry.position || {})[sym] || 0;
          const ud = (cp - d._pp) - (epc[sym] || 0);
          if (ud !== 0) d.cash -= ud * mid;
          d._pp = cp; d.pnl.push([ts, d.cash + cp * mid]);
        }
      }
    }

    // Signal lines: SIG|SYMBOL|key=val|...
    const logs = entry.logs || '';
    if (logs) {
      for (const line of logs.split('\n')) {
        if (!line.startsWith('SIG|')) continue;
        const parts = line.trim().split('|');
        if (parts.length < 3) continue;
        const sy = parts[1];
        const d = getOrCreate(sy);
        for (const kv of parts.slice(2)) {
          if (kv.includes('=')) {
            const [k, v] = kv.split('=', 2);
            try { if (!d.signals[k]) d.signals[k] = []; d.signals[k].push([ts, parseFloat(v)]); } catch (_) {}
          }
        }
      }
    }

    // Submitted orders
    const sub = entry.submitted_orders;
    if (sub) {
      if (Array.isArray(sub)) {
        for (const o of sub) { if (Array.isArray(o) && o.length >= 3) { getOrCreate(o[0]).submitted.push([ts, o[1], o[2]]); } }
      } else if (typeof sub === 'object') {
        for (const [sy, orders] of Object.entries(sub)) {
          const d = getOrCreate(sy);
          if (Array.isArray(orders)) {
            for (const o of orders) {
              if (Array.isArray(o) && o.length >= 3)      d.submitted.push([ts, o[1], o[2]]);
              else if (o && typeof o === 'object')         d.submitted.push([ts, o.price || 0, o.quantity || 0]);
            }
          }
        }
      }
    }
  }

  // Threshold signal → mirror as -threshold
  for (const sym in dm) {
    const d = dm[sym];
    if (d.signals.threshold) d.signals['-threshold'] = d.signals.threshold.map(([t, v]) => [t, -v]);
  }

  // Trade History
  for (const t of (th || [])) {
    const sy = t.symbol; if (!sy) continue;
    const tv = t.timestamp || 0, pr = t.price || 0, q = t.quantity || 0;
    const b = t.buyer || '', s = t.seller || '';
    const d = getOrCreate(sy);
    if      (b === 'SUBMISSION') d.buy_trades.push([tv, pr, q, s || 'Anon']);
    else if (s === 'SUBMISSION') d.sell_trades.push([tv, pr, q, b || 'Anon']);
    else                         d.market_trades.push([tv, pr, q, b || 'Anon', s || 'Anon']);
  }
  return dm;
}

// ─── Top-level file parser ────────────────────────────────────────────────────
function parseFile(content) {
  const s = content.trim();
  let entries = [], th = [];
  if      (s.startsWith('{'))             { [entries, th] = parseJSON(s); }
  else if (s.startsWith('Sandbox logs:')) { [entries, th] = parseBT(s); }
  else { try { [entries, th] = parseJSON(s); } catch (_) { [entries, th] = parseBT(s); } }

  const dm = build(entries, th);
  const out = {};

  for (const [sym, d] of Object.entries(dm)) {
    // Max drawdown
    const pnlVals = d.pnl.map(p => p[1]);
    let maxDd = 0;
    if (pnlVals.length) {
      let peak = pnlVals[0];
      for (const v of pnlVals) { if (v > peak) peak = v; const dd = peak - v; if (dd > maxDd) maxDd = dd; }
    }
    const lastBids = d.l2_bids.length ? d.l2_bids[d.l2_bids.length - 1] : [];
    const lastAsks = d.l2_asks.length ? d.l2_asks[d.l2_asks.length - 1] : [];

    // Per-tick spreads, best bid/ask, OBI, tape velocity
    const spreads = [], bbids = [], basks = [];
    const mktByTs = {};
    for (const mt of d.market_trades) { (mktByTs[mt[0]] = mktByTs[mt[0]] || []).push(mt); }
    for (let i = 0; i < d.timestamps.length; i++) {
      const tsI = d.timestamps[i], midI = d.mid_prices[i];
      const bi = d.l2_bids[i] || [], ai = d.l2_asks[i] || [];
      const bb = bi.length ? bi[0][0] : null, ba = ai.length ? ai[0][0] : null;
      bbids.push(bb); basks.push(ba);
      spreads.push(bb !== null && ba !== null ? Math.round((ba - bb) * 100) / 100 : null);
      const bv = bi.reduce((s, b) => s + Math.abs(b[1]), 0);
      const av = ai.reduce((s, a) => s + Math.abs(a[1]), 0);
      const tot = bv + av;
      let netTape = 0;
      for (const mt of (mktByTs[tsI] || [])) { if (midI !== null) { netTape += mt[1] >= midI ? mt[2] : -mt[2]; } }
    }

    // Market dynamics
    let vol = 0;
    if (d.mid_prices.length > 1) {
      const diffs = []; for (let i = 1; i < d.mid_prices.length; i++) diffs.push(d.mid_prices[i] - d.mid_prices[i-1]);
      const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      vol = Math.round(Math.sqrt(diffs.reduce((s, x) => s + (x - mean) ** 2, 0) / diffs.length) * 1000) / 1000;
    }
    const bvol = d.buy_trades.reduce((s, t) => s + t[2], 0);
    const svol = d.sell_trades.reduce((s, t) => s + t[2], 0);
    const validSp = spreads.filter(s => s !== null && s > 0);
    const midMean = d.mid_prices.length ? d.mid_prices.reduce((a, b) => a + b, 0) / d.mid_prices.length : 0;
    const spEff = (validSp.length && midMean > 0) ? Math.round((validSp.reduce((a, b) => a + b, 0) / validSp.length) / midMean * 100 * 1000) / 1000 : 0;
    const totalSubmitted = d.submitted.length, totalFilled = d.buy_trades.length + d.sell_trades.length;
    const submittedQty = d.submitted.reduce((s, o) => s + Math.abs(o[2]), 0), filledQty = bvol + svol;
    const fillRateCount = totalSubmitted > 0 ? Math.round(totalFilled / totalSubmitted * 1000) / 10 : 0;
    const fillRateQty   = submittedQty  > 0 ? Math.round(filledQty  / submittedQty  * 1000) / 10 : 0;

    out[sym] = {
      timestamps: d.timestamps, mid_prices: d.mid_prices, signals: d.signals,
      buy_trades: d.buy_trades, sell_trades: d.sell_trades, market_trades: d.market_trades,
      pnl: d.pnl, 
      max_drawdown: Math.round(maxDd * 100) / 100,
      last_bids: lastBids.map(([p, v]) => [p, v]), last_asks: lastAsks.map(([p, v]) => [p, v]),
      spreads, best_bids: bbids, best_asks: basks, l2_bids: d.l2_bids, l2_asks: d.l2_asks,
      
      submitted: d.submitted, total_submitted: totalSubmitted, total_filled: totalFilled,
      submitted_qty: submittedQty, filled_qty: filledQty,
      fill_rate: fillRateCount, fill_rate_count: fillRateCount, fill_rate_qty: fillRateQty,
      dynamics: { volatility: vol, momentum: bvol - svol, spread_eff: spEff },
    };
  }
  return out;
}

// ─── ZIP extraction ───────────────────────────────────────────────────────────
async function extractZip(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const names = Object.keys(zip.files);
  const target = names.find(n => n.endsWith('.log')) || names.find(n => n.endsWith('.json'));
  if (!target) throw new Error(`No .log/.json found in ZIP: ${names.join(', ')}`);
  return zip.files[target].async('string');
}
