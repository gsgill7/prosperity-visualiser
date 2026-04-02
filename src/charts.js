// charts.js — Chart renderers for all 8 tabs

// ─── Plotly layout helper ─────────────────────────────────────────────────────
function BL(h = 500, x = {}) {
  return Object.assign({
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent', height: h,
    font: { family: 'inherit', color: '#6e6f78', size: 11 },
    margin: { l: 50, r: 16, t: 8, b: 32 },
    xaxis: { gridcolor: '#2a2b30', zerolinecolor: '#2a2b30', tickfont: { size: 10, color: '#45464d' } },
    yaxis: { gridcolor: '#2a2b30', zerolinecolor: '#2a2b30', tickfont: { size: 10, color: '#45464d' } },
    hoverlabel: { bgcolor: '#1f2023', bordercolor: '#35363c', font: { family: 'inherit', color: '#f0f0f2', size: 11 } },
    legend: { bgcolor: 'transparent', font: { size: 10, color: '#6e6f78' }, orientation: 'h', y: 1.06, x: 1, xanchor: 'right' },
  }, x);
}

const GR = '#2a2b30';
const PC = { displayModeBar: false };
const C = {
  mid: '#35363c', green: '#22c55e', red: '#ef4444', blue: '#3b82f6',
  gold: '#f59e0b', purple: '#a855f7', orange: '#f97316', pink: '#ec4899',
  white: '#f0f0f2', dim: '#6e6f78', teal: '#14b8a6', mf: 'rgba(110,111,120,0.06)',
};
const PAL  = ['#3b82f6', '#ec4899', '#f59e0b', '#a855f7', '#22c55e', '#f97316', '#14b8a6', '#ef4444'];
const RPAL = ['#f0f0f2', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#ef4444'];

function fmt(n) { return n != null ? n.toLocaleString() : '—'; }

// ─── wmFilter: filter trades by distance from Wall Mid signal ─────────────────
function wmFilter(trades, d, dist) {
  if (dist == null || !d.signals || !d.signals.wall_mid) return trades;
  const lk = {};
  d.signals.wall_mid.forEach(v => { lk[v[0]] = v[1]; });
  return trades.filter(t => { const wm = lk[t[0]]; return wm != null && Math.abs(t[1] - wm) <= dist; });
}

// ─── Order Book live display ──────────────────────────────────────────────────
function rOBi(bi, as) {
  if (!bi.length && !as.length)
    return '<div style="font-size:11px;color:var(--t3);text-align:center;padding:20px">No L2 data</div>';
  const mx = Math.max(...bi.map(b => Math.abs(b[1])), ...as.map(a => Math.abs(a[1])), 1);
  const bb = bi[0] ? bi[0][0] : 0, ba = as[0] ? as[0][0] : 0;
  const sp = ba && bb ? ba - bb : 0, mid = ba && bb ? (ba + bb) / 2 : 0;
  let h = `<div style="display:flex;justify-content:space-between;font-size:9px;font-weight:700;color:var(--t2);margin-bottom:4px"><span>ORDER BOOK: ${window.S.prod}</span><span>SPREAD: ${sp.toFixed(1)}</span></div><div class="ob-cols"><div>Size</div><div style="text-align:right;padding-right:6px">Price</div><div style="padding-left:6px">Price</div><div style="text-align:right">Size</div></div>`;
  [...as].reverse().forEach(a => {
    const p = Math.abs(a[1]) / mx * 100;
    h += `<div class="ob-r"><div></div><div></div><div class="ob-ap">${a[0].toLocaleString()}</div><div style="display:flex"><div class="ob-bar ob-ab" style="width:${p}%"></div></div><div class="ob-as" style="text-align:right">${Math.abs(a[1])}</div></div>`;
  });
  h += `<div class="ob-mid">MID: ${mid.toFixed(1)}</div>`;
  bi.forEach(b => {
    const p = Math.abs(b[1]) / mx * 100;
    h += `<div class="ob-r"><div class="ob-bs">${Math.abs(b[1])}</div><div style="display:flex;justify-content:flex-end"><div class="ob-bar ob-bb" style="width:${p}%"></div></div><div class="ob-bp">${b[0].toLocaleString()}</div><div></div><div></div></div>`;
  });
  return h;
}

// ─── Tick-level cards (submitted orders, own fills, market trades) ────────────
function rTkCards(d, tsVal) {
  const tsK = '' + tsVal;
  const buys  = (d.buy_by_ts  && d.buy_by_ts[tsK])  || [];
  const sells = (d.sell_by_ts && d.sell_by_ts[tsK]) || [];
  const mkts  = (d.mkt_by_ts  && d.mkt_by_ts[tsK])  || [];
  const subs  = (d.sub_by_ts  && d.sub_by_ts[tsK])  || [];
  const fills = [
    ...buys.map(t  => ({ side: 'BUY',  price: t[1], vol: t[2], cp: t[3] })),
    ...sells.map(t => ({ side: 'SELL', price: t[1], vol: t[2], cp: t[3] })),
  ];
  const fillPrices = new Set(fills.map(f => f.price + '_' + f.vol));
  let h = '<div class="tk-cards">';

  h += '<div class="tk-card"><div class="tk-card-h"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Submitted Orders</div>';
  if (!subs.length) h += '<div class="tk-card-empty">No orders submitted' + (d.total_submitted === 0 ? ' (backtester log required)' : '') + '</div>';
  else subs.forEach(o => {
    const isBuy = o[2] > 0, vol = Math.abs(o[2]), price = o[1];
    const matched = fillPrices.has(price + '_' + vol);
    h += `<div class="tk-row"><span style="color:${isBuy ? 'var(--green)' : 'var(--red)'};font-weight:600">${isBuy ? 'BUY' : 'SELL'}</span><span>${vol} @ ${fmt(price)}</span><span style="font-size:9px;font-weight:700;${matched ? 'color:var(--green)' : 'color:var(--t3)'}">${matched ? 'FILLED' : 'UNFILLED'}</span></div>`;
  });
  h += '</div>';

  h += '<div class="tk-card"><div class="tk-card-h"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>Own Fills at This Tick</div>';
  if (!fills.length) h += '<div class="tk-card-empty">No fills</div>';
  else fills.forEach(f => {
    h += `<div class="tk-row"><span style="color:${f.side === 'BUY' ? 'var(--green)' : 'var(--red)'};font-weight:600">${f.side}</span><span>${f.vol} @ ${fmt(f.price)}</span><span style="font-size:9px;color:var(--t3)">${f.cp}</span></div>`;
  });
  h += '</div>';

  h += '<div class="tk-card"><div class="tk-card-h"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1014.85-3.36L3.51 10"/></svg>Market Trades at This Tick</div>';
  if (!mkts.length) h += '<div class="tk-card-empty">No trades</div>';
  else mkts.forEach(t => {
    h += `<div class="tk-row"><span>${t[2]} @ ${fmt(t[1])}</span><span style="color:var(--t3);font-size:10px">${t[3]} &#x2192; ${t[4]}</span></div>`;
  });
  h += '</div></div>';
  return h;
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────────
function rMP(d) {
  const bv = d.buy_trades.reduce((s, t) => s + t[2], 0);
  const sv = d.sell_trades.reduce((s, t) => s + t[2], 0);
  const tot = bv + sv || 1, pct = Math.round(bv / tot * 100);
  return `<div class="mp"><div class="mp-h"><div class="mp-hl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Market Pressure</div><div class="mp-pct" style="color:${pct >= 50 ? 'var(--green)' : 'var(--red)'}"> ${pct.toFixed(1)}%</div></div><div class="mp-bar"><div class="mp-fill" style="width:${pct}%"></div></div><div class="mp-lab"><span>Bids Heavy</span><span>Asks Heavy</span></div></div>`;
}

function rPS(d, tk) {
  let dp = 0;
  if (d.pnl.length && tk < d.pnl.length) dp = d.pnl[tk][1] - (d.pnl[0] ? d.pnl[0][1] : 0);
  const lm = tk < d.mid_prices.length ? d.mid_prices[tk] : 0;
  const sp = d.spreads && d.spreads[tk] != null ? d.spreads[tk] : 0;
  return `<div class="ps"><div class="ps-h">Product Summary: ${window.S.prod}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10m6 10V4M6 20v-4"/></svg></div><div class="ps-grid"><div><div class="ps-k">PnL</div><div class="ps-v ${dp >= 0 ? 'g' : 'r'}">${dp >= 0 ? '+' : ''}${fmt(Math.round(dp))}</div></div><div><div class="ps-k">Mid Price</div><div class="ps-v">${fmt(Math.round(lm))}</div></div><div><div class="ps-k">Spread</div><div class="ps-v">${sp.toFixed(1)}</div></div><div><div class="ps-k">Trades</div><div class="ps-v">${d.buy_trades.length + d.sell_trades.length}</div></div></div></div>`;
}

function rCPnl(d) {
  const cp = {};
  d.buy_trades.forEach(t => { const c = t[3]; if (!cp[c]) cp[c] = { vol: 0, pnl: 0, n: 0 }; cp[c].vol += t[2]; cp[c].n++; cp[c].pnl -= t[1] * t[2]; });
  d.sell_trades.forEach(t => { const c = t[3]; if (!cp[c]) cp[c] = { vol: 0, pnl: 0, n: 0 }; cp[c].vol += t[2]; cp[c].n++; cp[c].pnl += t[1] * t[2]; });
  const entries = Object.entries(cp).sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl));
  if (!entries.length) return '';
  let h = '<div class="md"><div class="md-h">Counterparty Breakdown<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div>';
  entries.slice(0, 6).forEach(([name, s]) => {
    const pnlCol = s.pnl >= 0 ? 'var(--green)' : 'var(--red)';
    h += `<div class="md-r"><span class="md-k">${name} <span style="color:var(--t3);font-size:9px">(${s.n} trades)</span></span><span class="md-v" style="color:${pnlCol}">${s.pnl >= 0 ? '+' : ''}${fmt(Math.round(s.pnl))}</span></div>`;
  });
  return h + '</div>';
}

function rMD(d) {
  const dy = d.dynamics || {};
  const frC = d.fill_rate_count != null ? d.fill_rate_count : d.fill_rate;
  const frQ = d.fill_rate_qty  != null ? d.fill_rate_qty  : null;
  let h = `<div class="md"><div class="md-h">Market Dynamics: ${window.S.prod}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></div>`;
  h += `<div class="md-r"><span class="md-k">Volatility</span><span class="md-v">${dy.volatility || 0} PTS</span></div>`;
  h += `<div class="md-r"><span class="md-k">Trade Momentum</span><span class="md-v">${fmt(dy.momentum || 0)} VOL</span></div>`;
  h += `<div class="md-r"><span class="md-k">Spread Efficiency</span><span class="md-v">${(dy.spread_eff || 0).toFixed(3)}%</span></div>`;
  if (frC != null && d.total_submitted > 0) h += `<div class="md-r"><span class="md-k">Fill Rate (Count)</span><span class="md-v">${frC}%</span></div>`;
  if (frQ != null && d.submitted_qty > 0)   h += `<div class="md-r"><span class="md-k">Fill Rate (Qty)</span><span class="md-v">${frQ}%</span></div>`;
  h += '</div>';
  return h;
}

function rStrat() {
  const rids = Object.keys(window.S.runs);
  if (rids.length < 2) return '';
  let h = '<div class="strat"><div class="strat-h">Run Comparison<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg></div>';
  rids.forEach((rid, i) => {
    const r = window.S.runs[rid], isCmp = window.S.comparing.has(rid);
    h += `<div class="strat-row"><div class="strat-dot" style="background:${RPAL[i % RPAL.length]}"></div><div class="strat-name">${r.name}</div><div class="strat-badge" onclick="togCmp('${rid}')" style="${isCmp ? '' : 'background:var(--bg3);color:var(--t1)'}">${isCmp ? 'Comparing' : 'Compare'}</div><span class="strat-x" onclick="delRun('${rid}')">&#x2715;</span></div>`;
  });
  h += '<div style="font-size:9px;color:var(--t3);margin-top:4px">Click Compare to overlay PnL on the chart.</div></div>';
  return h;
}

// ─── T0: Time-Series ──────────────────────────────────────────────────────────
function t0() {
  const S = window.S;
  const d = S.data[S.prod], ts = d.timestamps, mp = d.mid_prices;
  const tr = [], m = S.cMode, ov = S.ov;
  const fBuy  = wmFilter(d.buy_trades,    d, S.wallMidDist);
  const fSell = wmFilter(d.sell_trades,   d, S.wallMidDist);

  if (m === 'prices') {
    tr.push({ x: ts, y: mp, name: 'Mid', type: 'scattergl', mode: 'lines', line: { color: '#8b8fa3', width: 1.5 } });

    if (S.npc && d.market_trades.length) {
      const mts = wmFilter(d.market_trades, d, S.wallMidDist);
      const midLk = {};
      d.timestamps.forEach((t, i) => { midLk[t] = d.mid_prices[i]; });
      const nB = [], nS = [];
      mts.forEach(t => { const mid = midLk[t[0]]; if (mid != null && t[1] >= mid) nB.push(t); else nS.push(t); });
      if (nB.length) tr.push({ x: nB.map(t => t[0]), y: nB.map(t => t[1]), type: 'scattergl', mode: 'markers', name: 'NPC Buy',  marker: { size: nB.map(t => Math.max(3, Math.min(8, t[2]))), color: 'rgba(34,197,94,0.4)',  symbol: 'triangle-up'   }, hoverinfo: 'skip' });
      if (nS.length) tr.push({ x: nS.map(t => t[0]), y: nS.map(t => t[1]), type: 'scattergl', mode: 'markers', name: 'NPC Sell', marker: { size: nS.map(t => Math.max(3, Math.min(8, t[2]))), color: 'rgba(239,68,68,0.4)', symbol: 'triangle-down'  }, hoverinfo: 'skip' });
    }

    // Signal overlays (wall_mid, bid_wall, ask_wall, fair_value, ema)
    if (d.signals) {
      const sty = {
        wall_mid:   { color: C.white,  width: 1.5, dash: 'dash' },
        bid_wall:   { color: C.teal,   width: 1 },
        ask_wall:   { color: C.red,    width: 1 },
        fair_value: { color: C.blue,   width: 1.5 },
        ema:        { color: C.orange, width: 1, dash: 'dot' },
      };
      ['wall_mid', 'bid_wall', 'ask_wall', 'fair_value', 'ema'].forEach(k => {
        if (!d.signals[k]) return;
        if (k === 'bid_wall' && !ov.bid) return;
        if (k === 'ask_wall' && !ov.ask) return;
        tr.push({ x: d.signals[k].map(p => p[0]), y: d.signals[k].map(p => p[1]), name: k, type: 'scattergl', mode: 'lines', line: sty[k] || { color: C.dim, width: 1 } });
      });

      // Bollinger Band overlay — gated behind BB Bands toggle
      if (ov.bb) {
        if (d.signals.bb_lower && d.signals.bb_upper) {
          tr.push({ x: d.signals.bb_lower.map(p => p[0]), y: d.signals.bb_lower.map(p => p[1]), name: 'BB Lower', type: 'scatter', mode: 'lines', line: { color: 'rgba(168,85,247,0.85)', width: 1.5 }, showlegend: false, hoverinfo: 'skip' });
          tr.push({ x: d.signals.bb_upper.map(p => p[0]), y: d.signals.bb_upper.map(p => p[1]), name: 'BB Band',  type: 'scatter', mode: 'lines', line: { color: 'rgba(168,85,247,0.85)', width: 1.5 }, fill: 'tonexty', fillcolor: 'rgba(168,85,247,0.15)' });
        }
        if (d.signals.bb_mid) {
          tr.push({ x: d.signals.bb_mid.map(p => p[0]), y: d.signals.bb_mid.map(p => p[1]), name: 'BB Mid', type: 'scattergl', mode: 'lines', line: { color: C.purple, width: 2, dash: 'dot' } });
        }
      }
    }

    // Own trades grouped by counterparty
    const cpS = new Set();
    fBuy.forEach(t => cpS.add(t[3])); fSell.forEach(t => cpS.add(t[3]));
    const cps = [...cpS].sort(), cpC = Object.fromEntries(cps.map((c, i) => [c, PAL[i % PAL.length]]));
    const bCP = {};
    fBuy.forEach(t => { (bCP[t[3]] = bCP[t[3]] || []).push(t); });
    Object.entries(bCP).forEach(([cp, td]) => {
      tr.push({ x: td.map(t => t[0]), y: td.map(t => t[1]), name: 'Buy \u2190 ' + cp, type: 'scattergl', mode: 'markers', marker: { color: cpC[cp] || C.green, symbol: 'triangle-up',   size: 7 } });
    });
    const sCP = {};
    fSell.forEach(t => { (sCP[t[3]] = sCP[t[3]] || []).push(t); });
    Object.entries(sCP).forEach(([cp, td]) => {
      tr.push({ x: td.map(t => t[0]), y: td.map(t => t[1]), name: 'Sell \u2192 ' + cp, type: 'scattergl', mode: 'markers', marker: { color: cpC[cp] || C.red,   symbol: 'triangle-down', size: 7 } });
    });

    if (ov.orders && d.sub_by_ts) {
      const subB = [], subS = [];
      Object.keys(d.sub_by_ts).forEach(t => {
        const time = parseInt(t);
        d.sub_by_ts[t].forEach(o => {
          if (o[2] > 0) subB.push({ x: time, y: o[1], vol: o[2] });
          else          subS.push({ x: time, y: o[1], vol: Math.abs(o[2]) });
        });
      });
      if (subB.length) tr.push({ x: subB.map(o => o.x), y: subB.map(o => o.y), name: 'Submitted Buy',  type: 'scattergl', mode: 'markers', marker: { color: 'rgba(34,197,94,0.18)',  symbol: 'circle-open', size: 9, line: { width: 2, color: C.green } }, text: subB.map(o => `Sub Buy Vol: ${o.vol}`),  hovertemplate: '%{text}<br>Price: %{y}<extra></extra>' });
      if (subS.length) tr.push({ x: subS.map(o => o.x), y: subS.map(o => o.y), name: 'Submitted Sell', type: 'scattergl', mode: 'markers', marker: { color: 'rgba(239,68,68,0.18)', symbol: 'circle-open', size: 9, line: { width: 2, color: C.red   } }, text: subS.map(o => `Sub Sell Vol: ${o.vol}`), hovertemplate: '%{text}<br>Price: %{y}<extra></extra>' });
    }

  } else if (m === 'spread') {
    tr.push({ x: ts, y: d.spreads, name: 'Spread', type: 'scattergl', mode: 'lines', line: { color: C.gold, width: 1.5 } });
  } else if (m === 'volume') {
    const mt = d.market_trades, vB = {};
    mt.forEach(t => { const b = Math.round(t[0] / 1000) * 1000; vB[b] = (vB[b] || 0) + t[2]; });
    const bx = Object.keys(vB).map(Number).sort((a, b) => a - b);
    tr.push({ x: bx, y: bx.map(k => vB[k]), name: 'Volume', type: 'bar', marker: { color: C.teal, opacity: 0.8 } });
  }

  if (ov.bid) tr.push({ x: ts, y: d.best_bids, name: 'Bid', type: 'scattergl', mode: 'lines', line: { color: C.teal, width: 1.5 } });
  if (ov.mid) tr.push({ x: ts, y: mp,          name: 'Mid', type: 'scattergl', mode: 'lines', line: { color: C.white, width: 2 } });
  if (ov.ask) tr.push({ x: ts, y: d.best_asks, name: 'Ask', type: 'scattergl', mode: 'lines', line: { color: C.red, width: 1.5 } });

  const pnlTr = [];
  [...S.comparing].forEach((rid, i) => {
    const rd = S.runs[rid];
    if (!rd || !rd.data[S.prod]) return;
    const rpnl = rd.data[S.prod].pnl;
    if (!rpnl.length) return;
    const col = RPAL[Object.keys(S.runs).indexOf(rid) % RPAL.length];
    const isActive = rid === S.activeRun;
    pnlTr.push({ x: rpnl.map(p => p[0]), y: rpnl.map(p => p[1]), name: rd.name, type: 'scattergl', mode: 'lines', line: { color: col, width: isActive ? 2 : 1.5, dash: isActive ? 'solid' : 'dot' }, fill: isActive ? 'tozeroy' : undefined, fillcolor: isActive ? 'rgba(34,197,94,0.04)' : undefined });
  });
  if (!pnlTr.length && d.pnl.length) {
    const l = d.pnl[d.pnl.length - 1][1], f = d.pnl[0][1];
    pnlTr.push({ x: d.pnl.map(p => p[0]), y: d.pnl.map(p => p[1]), name: S.prod, type: 'scattergl', fill: 'tozeroy', fillcolor: l >= f ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', line: { color: l >= f ? C.green : C.red, width: 1.5 } });
  }

  const posArr = (d.signals && d.signals.position) || [];
  const snap   = (d.l2_bids && d.l2_bids[S.tick] && d.l2_asks && d.l2_asks[S.tick]) ? [d.l2_bids[S.tick], d.l2_asks[S.tick]] : [[], []];
  const tsVal  = d.timestamps[S.tick];
  const allTr  = [...fBuy.map(t => ({ ts: t[0], side: 'BUY',  price: t[1], vol: t[2], cp: t[3] })),
                   ...fSell.map(t => ({ ts: t[0], side: 'SELL', price: t[1], vol: t[2], cp: t[3] }))].sort((a, b) => a.ts - b.ts);
  let exH = '';
  if (allTr.length) {
    exH = `<div class="card"><div class="card-h"><div class="card-t">Order Execution Details</div></div><div style="max-height:180px;overflow-y:auto"><table class="ex-tbl"><thead><tr><th>Timestamp</th><th>Asset</th><th>Side</th><th>Price</th><th>Vol</th><th>Status</th></tr></thead><tbody>`;
    allTr.filter(t => t.ts <= tsVal).slice(-40).forEach(t => {
      exH += `<tr><td>${fmt(t.ts)}</td><td>${S.prod}</td><td class="${t.side.toLowerCase()}">${t.side}</td><td>${fmt(t.price)}</td><td>${t.vol}</td><td class="filled">Filled</td></tr>`;
    });
    exH += '</tbody></table></div></div>';
  }

  const logH = `<div class="lv"><div class="lv-tabs"><div class="lv-tab on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>Sandbox Logs</div></div><div class="lv-body">Logs from tick ${S.tick} will appear here.</div></div>`;

  const wmPills = d.signals && d.signals.wall_mid
    ? `<div class="pill-sep"></div><span style="font-size:9px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Wall Mid ±</span>${[1,2,3,5].map(v=>`<div class="pill ${S.wallMidDist===v?'on':''}" onclick="setWMD(${v})">±${v}</div>`).join('')}`
    : '';

  const el = document.getElementById('p0');
  el.innerHTML = `<div class="g2"><div class="g2l">
    <div class="card"><div class="card-h"><div class="card-t">Price &amp; Liquidity: ${S.prod}</div><div class="card-leg">${ov.ask || m === 'prices' ? '<div class="lg"><div class="lg-d" style="background:var(--red)"></div>ASK</div>' : ''}${ov.mid ? '<div class="lg"><div class="lg-d" style="background:var(--t0)"></div>MID</div>' : ''}${ov.bid || m === 'prices' ? '<div class="lg"><div class="lg-d" style="background:var(--teal)"></div>BID</div>' : ''}</div></div><div class="pill-row"><div class="pill ${m === 'prices' ? 'on' : ''}" onclick="setCM('prices')">Prices</div><div class="pill ${m === 'spread' ? 'on' : ''}" onclick="setCM('spread')">Spread</div><div class="pill ${m === 'volume' ? 'on' : ''}" onclick="setCM('volume')">Volume</div><div class="pill-sep"></div><div class="pill ${ov.bid ? 'on' : ''}" onclick="togOv('bid')">Bid</div><div class="pill ${ov.mid ? 'on' : ''}" onclick="togOv('mid')">Mid</div><div class="pill ${ov.ask ? 'on' : ''}" onclick="togOv('ask')">Ask</div><div class="pill ${ov.orders ? 'on' : ''}" onclick="togOv('orders')">Orders (All)</div>${d.signals && (d.signals.bb_mid || d.signals.bb_upper) ? `<div class="pill ${ov.bb ? 'on' : ''}" onclick="togOv('bb')">BB Bands</div>` : ''}${wmPills}</div><div id="c0a"></div></div>
    <div class="card"><div class="card-h"><div class="card-t">PnL Performance</div><div class="card-leg">${pnlTr.map(t => `<div class="lg"><div class="lg-d" style="background:${t.line.color}"></div>${t.name}</div>`).join('')}</div></div><div id="c0b"></div></div>
    ${d.spreads ? `<div class="card"><div class="card-h"><div class="card-t">Spread: ${S.prod}</div></div><div id="c0s"></div></div>` : ''}
    ${posArr.length ? `<div class="card"><div class="card-h"><div class="card-t">Position: ${S.prod}</div></div><div id="c0c"></div></div>` : ''}
    <div id="tk-cards-live">${rTkCards(d, tsVal)}</div>${exH}${logH}
  </div><div class="g2r"><div class="ob"><div id="ob-live">${rOBi(snap[0], snap[1])}</div></div>${rStrat()}${rMP(d)}${rPS(d, S.tick)}${rCPnl(d)}${rMD(d)}</div></div>`;

  Plotly.newPlot('c0a', tr, BL(400, { hovermode: 'x unified', showlegend: true }), PC);
  if (pnlTr.length) Plotly.newPlot('c0b', pnlTr, BL(200, { hovermode: 'x unified', showlegend: true }), PC);
  if (d.spreads) {
    const spV = d.spreads.filter(s => s != null);
    if (spV.length) Plotly.newPlot('c0s', [{ x: d.timestamps, y: d.spreads, name: 'Spread', type: 'scattergl', mode: 'lines', line: { color: C.gold, width: 1 }, fill: 'tozeroy', fillcolor: 'rgba(245,158,11,0.06)' }], BL(120, { hovermode: 'x unified', margin: { l: 50, r: 16, t: 4, b: 24 } }), PC);
  }
  if (posArr.length) Plotly.newPlot('c0c', [{ x: posArr.map(p => p[0]), y: posArr.map(p => p[1]), name: 'Position', type: 'scattergl', mode: 'lines', line: { color: C.blue, width: 1.5 } }], BL(160, { hovermode: 'x unified' }), PC);
}

// ─── T1: Flow Analysis — NPC lot size distribution ────────────────────────────
function t1() {
  const d = window.S.data[window.S.prod], mt = d.market_trades, dist = {};
  mt.forEach(t => { dist[t[2]] = (dist[t[2]] || 0) + 1; });
  const sz = Object.keys(dist).map(Number).sort((a, b) => a - b);
  const el = document.getElementById('p1');
  if (!sz.length) { el.innerHTML = '<div class="note">No market trades.</div>'; return; }
  el.innerHTML = '<div class="note">NPC bots use deterministic order sizes.</div><div class="card"><div id="c1"></div></div>';
  Plotly.newPlot('c1', [{ x: sz, y: sz.map(s => dist[s]), type: 'bar', marker: { color: C.blue } }], BL(360, { xaxis: { title: { text: 'Lot Size', font: { size: 10 } }, gridcolor: GR }, yaxis: { title: { text: 'Count', font: { size: 10 } }, gridcolor: GR } }), PC);
}

// ─── T2: Seasonality — price by day ──────────────────────────────────────────
function t2() {
  const d = window.S.data[window.S.prod], days = {};
  d.timestamps.forEach((t, i) => {
    const di = Math.floor(t / 1e6), it = t % 1e6;
    if (!days[di]) days[di] = { t: [], m: [] };
    days[di].t.push(it); days[di].m.push(d.mid_prices[i]);
  });
  const tr = Object.keys(days).sort().map((di, i) => ({
    x: days[di].t, y: days[di].m, type: 'scattergl', mode: 'lines',
    name: 'Day ' + (+di + 1), line: { color: PAL[i % PAL.length], width: 1.5 }, opacity: 0.85,
  }));
  document.getElementById('p2').innerHTML = '<div class="card"><div id="c2"></div></div>';
  Plotly.newPlot('c2', tr, BL(440, { hovermode: 'x unified', xaxis: { gridcolor: GR }, yaxis: { gridcolor: GR } }), PC);
}

// ─── T3: Volume Profile ───────────────────────────────────────────────────────
function t3() {
  const d = window.S.data[window.S.prod];
  const vp = {};
  d.buy_trades.forEach(t => { vp[t[1]] = (vp[t[1]] || 0) + t[2]; });
  d.sell_trades.forEach(t => { vp[t[1]] = (vp[t[1]] || 0) + t[2]; });
  const pr = Object.keys(vp).map(Number).sort((a, b) => a - b);
  const el = document.getElementById('p3');
  if (!pr.length) { el.innerHTML = '<div class="note">No trade volume data. Upload a log with own trades to see volume profile.</div>'; return; }
  el.innerHTML = '<div class="card"><div class="card-h"><div class="card-t">Volume Profile</div></div><div id="c3"></div></div>';
  Plotly.newPlot('c3', [{ y: pr, x: pr.map(p => vp[p]), type: 'bar', orientation: 'h', marker: { color: C.blue } }], BL(440, { xaxis: { gridcolor: GR, title: { text: 'Volume', font: { size: 10 } } }, yaxis: { gridcolor: GR, title: { text: 'Price', font: { size: 10 } } } }), PC);
}

// ─── T4: Stochastic — Hurst exponent + FFT ───────────────────────────────────
function t4() {
  const d = window.S.data[window.S.prod], st = d.stochastic, el = document.getElementById('p4');
  if (!st || st.hurst === null) { el.innerHTML = '<div class="note">Need 100+ ticks.</div>'; return; }
  let h = `<div class="sr"><div class="mc"><div class="mc-l">Hurst</div><div class="mc-v">${st.hurst}</div><div class="mc-sub">${st.hurst_label}</div></div><div class="card" style="padding:0"><div id="c4h" style="height:100%"></div></div></div>`;
  if (st.fft_periods && st.fft_periods.length) h += '<div class="card"><div class="card-t" style="margin-bottom:8px">Fourier Transform</div><div id="c4f"></div></div>';
  el.innerHTML = h;
  if (st.log_returns && st.log_returns.length)
    Plotly.newPlot('c4h', [{ x: st.log_returns, type: 'histogram', nbinsx: 60, marker: { color: C.blue } }], BL(130, { margin: { l: 30, r: 10, t: 4, b: 24 }, xaxis: { gridcolor: GR }, yaxis: { gridcolor: GR }, showlegend: false }), PC);
  if (st.fft_periods && st.fft_periods.length) {
    const ann = st.dominant_period ? [{ x: Math.log10(st.dominant_period), y: Math.max(...st.fft_amplitudes), text: st.dominant_period + ' ticks', showarrow: true, arrowhead: 1, ax: 40, ay: -30, font: { color: C.blue, size: 10 }, arrowcolor: C.blue }] : [];
    Plotly.newPlot('c4f', [{ x: st.fft_periods, y: st.fft_amplitudes, type: 'scattergl', mode: 'lines', line: { color: C.gold, width: 1 } }], BL(280, { xaxis: { type: 'log', gridcolor: GR }, yaxis: { gridcolor: GR }, annotations: ann }), PC);
  }
}

// ─── T5: Microstructure — engine walls vs executions ─────────────────────────
function t5() {
  const S = window.S;
  const d = S.data[S.prod], el = document.getElementById('p5');
  if (!d.signals || !d.signals.wall_mid || !d.signals.bid_wall || !d.signals.ask_wall) {
    el.innerHTML = '<div class="note">Log SIG|product|wall_mid=X|bid_wall=Y|ask_wall=Z to unlock this view. The microstructure tab shows the engine\'s hidden liquidity walls vs your execution prices, letting you see if you\'re capturing or paying spread.</div>';
    return;
  }
  const wm = d.signals.wall_mid, wb = d.signals.bid_wall, wa = d.signals.ask_wall;
  const tr = [
    { x: wm.map(v => v[0]), y: wm.map(v => v[1]), name: 'Wall Mid',  type: 'scattergl', line: { color: C.white, width: 1.5, dash: 'dash' } },
    { x: wb.map(v => v[0]), y: wb.map(v => v[1]), name: 'Bid Wall',  type: 'scattergl', line: { color: C.teal,  width: 1   }, fill: 'tonexty', fillcolor: 'rgba(20,184,166,0.04)' },
    { x: wa.map(v => v[0]), y: wa.map(v => v[1]), name: 'Ask Wall',  type: 'scattergl', line: { color: C.red,   width: 1   }, fill: 'tonexty', fillcolor: 'rgba(239,68,68,0.04)'  },
  ];
  const spreadMid = d.timestamps.map((_, i) => d.best_bids[i] != null && d.best_asks[i] != null ? (d.best_bids[i] + d.best_asks[i]) / 2 : null);
  if (spreadMid.some(v => v != null)) tr.push({ x: d.timestamps, y: spreadMid, name: 'Spread Mid', type: 'scattergl', mode: 'lines', line: { color: C.blue, width: 1, dash: 'dot' } });
  const t5Buy = wmFilter(d.buy_trades, d, S.wallMidDist), t5Sell = wmFilter(d.sell_trades, d, S.wallMidDist);
  if (t5Buy.length)  tr.push({ x: t5Buy.map(t => t[0]),  y: t5Buy.map(t => t[1]),  name: 'Buys',  type: 'scattergl', mode: 'markers', marker: { color: C.green, symbol: 'triangle-up',   size: 7 } });
  if (t5Sell.length) tr.push({ x: t5Sell.map(t => t[0]), y: t5Sell.map(t => t[1]), name: 'Sells', type: 'scattergl', mode: 'markers', marker: { color: C.red,   symbol: 'triangle-down', size: 7 } });

  const wmD = Object.fromEntries(wm.map(v => [v[0], v[1]])), eT = [], eV = [], eC = [];
  t5Buy.forEach(t  => { if (wmD[t[0]] != null) { const e = wmD[t[0]] - t[1]; eT.push(t[0]); eV.push(e);  eC.push(e >= 0 ? C.green : '#065f46'); } });
  t5Sell.forEach(t => { if (wmD[t[0]] != null) { const e = t[1] - wmD[t[0]]; eT.push(t[0]); eV.push(e);  eC.push(e >= 0 ? C.red   : '#991b1b'); } });

  let mh = '';
  if (eV.length) {
    const avg = eV.reduce((a, b) => a + b, 0) / eV.length, wr = eV.filter(e => e > 0).length / eV.length * 100;
    mh = `<div class="sr"><div class="mc"><div class="mc-l">Avg Edge</div><div class="mc-v ${avg >= 0 ? 'g' : 'r'}">${avg >= 0 ? '+' : ''}${avg.toFixed(2)}</div><div class="mc-sub">Vs Wall Mid</div></div><div class="mc"><div class="mc-l">Edge Win Rate</div><div class="mc-v">${wr.toFixed(1)}%</div><div class="mc-sub">Positive edge fills</div></div></div>`;
  }

  // Distance chart
  const midL = {}; d.timestamps.forEach((t, i) => midL[t] = d.mid_prices[i]);
  const mt = wmFilter(d.market_trades || [], d, S.wallMidDist);
  const npcB = [], npcS = [];
  mt.forEach(t => {
    const wmV = wmD[t[0]], mid = midL[t[0]];
    if (wmV != null && mid != null) { if (t[1] >= mid) npcB.push(t); else npcS.push(t); }
  });
  const dTr = [];
  if (npcB.length) dTr.push({ x: npcB.map(t => t[0]), y: npcB.map(t => t[1]), name: 'NPC Buy',  type: 'scattergl', mode: 'markers', marker: { color: C.green, symbol: 'triangle-up',   size: 6, opacity: 0.4 } });
  if (npcS.length) dTr.push({ x: npcS.map(t => t[0]), y: npcS.map(t => t[1]), name: 'NPC Sell', type: 'scattergl', mode: 'markers', marker: { color: C.red,   symbol: 'triangle-down', size: 6, opacity: 0.4 } });
  const myB = [], myS = [];
  t5Buy.forEach(t  => { if (wmD[t[0]] != null) myB.push({ x: t[0], y: t[1] - wmD[t[0]] }); });
  t5Sell.forEach(t => { if (wmD[t[0]] != null) myS.push({ x: t[0], y: t[1] - wmD[t[0]] }); });
  if (myB.length) dTr.push({ x: myB.map(o => o.x), y: myB.map(o => o.y), name: 'My Buys',  type: 'scattergl', mode: 'markers', marker: { color: C.green, symbol: 'diamond', size: 8, line: { width: 1, color: '#000' } } });
  if (myS.length) dTr.push({ x: myS.map(o => o.x), y: myS.map(o => o.y), name: 'My Sells', type: 'scattergl', mode: 'markers', marker: { color: C.red,   symbol: 'diamond', size: 8, line: { width: 1, color: '#000' } } });
  dTr.push({ x: [Math.min(...d.timestamps), Math.max(...d.timestamps)], y: [0, 0], mode: 'lines', line: { color: C.white, width: 1, dash: 'dash' }, showlegend: false, hoverinfo: 'skip' });

  const wmPills = '<div class="pill-row"><span style="font-size:9px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Wall Mid ±</span>' + [1, 2, 3, 5].map(v => `<div class="pill ${S.wallMidDist === v ? 'on' : ''}" onclick="setWMD(${v})">±${v}</div>`).join('') + '</div>';
  el.innerHTML = `${mh}${wmPills}<div class="card"><div class="card-t" style="margin-bottom:8px">Engine Walls vs Executions</div><div id="c5a"></div></div><div class="card"><div class="card-t" style="margin-bottom:8px">Trade Distance from Wall Mid (Positive = Above Wall Mid)</div><div id="c5c"></div></div>${eV.length ? '<div class="card"><div class="card-t" style="margin-bottom:8px">Execution Edge</div><div id="c5b"></div></div>' : ''}`;
  Plotly.newPlot('c5a', tr, BL(400, { hovermode: 'x unified', showlegend: true }), PC);
  Plotly.newPlot('c5c', dTr, BL(250, { hovermode: 'closest', showlegend: true }), PC);
  if (eV.length) Plotly.newPlot('c5b', [{ x: eT, y: eV, type: 'bar', marker: { color: eC } }], BL(180, { hovermode: 'closest' }), PC);
}

// ─── T6: Bot Patterns — Maker vs Taker classification ────────────────────────
function t6() {
  const S = window.S;
  const d = S.data[S.prod], mt = d.market_trades, el = document.getElementById('p6');
  if (!mt.length && !d.buy_trades.length && !d.sell_trades.length) { el.innerHTML = '<div class="note">No market trades.</div>'; return; }
  const allTrades = [...mt, ...d.buy_trades, ...d.sell_trades];
  const vols = [...new Set(allTrades.map(t => t[2]))].sort((a, b) => a - b);
  if (!S._bv) S._bv = new Set(vols.slice(0, 10));
  const bov = S.botOv, hasWM = d.signals && d.signals.wall_mid && d.signals.wall_mid.length;
  let h = '<div class="note">NPC Maker bots (simultaneous equidistant trades) = Squares. NPC Taker bots (directional) = Triangles (\u25b2 uptick, \u25bc downtick). Your trades = \u25c6 diamonds. Toggle overlays for context.</div>';
  h += '<div class="pill-row">';
  h += `<div class="pill ${bov.bid ? 'on' : ''}" onclick="togBotOv('bid')">Bid</div>`;
  h += `<div class="pill ${bov.mid ? 'on' : ''}" onclick="togBotOv('mid')">Mid</div>`;
  h += `<div class="pill ${bov.ask ? 'on' : ''}" onclick="togBotOv('ask')">Ask</div>`;
  h += '<div class="pill-sep"></div>';
  h += `<div class="pill ${bov.mine ? 'on' : ''}" onclick="togBotOv('mine')">My Trades</div>`;
  if (hasWM) {
    h += '<div class="pill-sep"></div><span style="font-size:9px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Wall Mid \u00b1</span>';
    h += [1, 2, 3, 5].map(v => `<div class="pill ${S.wallMidDist === v ? 'on' : ''}" onclick="setWMD(${v})">\u00b1${v}</div>`).join('');
  }
  h += '<div class="pill-sep"></div>';
  h += vols.map(v => `<div class="vc${S._bv.has(v) ? ' on' : ''}" onclick="tv(${v})">${v}</div>`).join('');
  h += '</div><div class="card"><div id="c6"></div></div>';
  el.innerHTML = h;

  const f = wmFilter(mt.filter(t => S._bv.has(t[2])), d, S.wallMidDist);
  if (!f.length && !bov.mine) return;
  const tr = [];
  if (bov.bid && d.best_bids) tr.push({ x: d.timestamps, y: d.best_bids, name: 'Bid', type: 'scattergl', mode: 'lines', line: { color: C.teal, width: 1 } });
  if (bov.mid) tr.push({ x: d.timestamps, y: d.mid_prices, name: 'Mid', type: 'scattergl', mode: 'lines', line: { color: 'rgba(240,240,242,0.4)', width: 1 } });
  if (bov.ask && d.best_asks) tr.push({ x: d.timestamps, y: d.best_asks, name: 'Ask', type: 'scattergl', mode: 'lines', line: { color: C.red, width: 1 } });

  if (f.length) {
    const midLookup = {}; d.timestamps.forEach((t, i) => { midLookup[t] = d.mid_prices[i]; });
    const wmLookup = {};
    if (d.signals && d.signals.wall_mid) d.signals.wall_mid.forEach(v => { wmLookup[v[0]] = v[1]; });
    const tradesByTimeVol = {};
    f.forEach(t => { const k = `${t[0]}_${t[2]}`; if (!tradesByTimeVol[k]) tradesByTimeVol[k] = []; tradesByTimeVol[k].push(t); });
    const makerAsks = [], makerBids = [], takerBuys = [], takerSells = [];
    Object.values(tradesByTimeVol).forEach(group => {
      if (group.length >= 2) {
        const ts0 = group[0][0];
        const anchor = wmLookup[ts0] != null ? wmLookup[ts0] : midLookup[ts0];
        let isMaker = false;
        if (anchor != null) {
          const prices = group.map(t => t[1]);
          const maxP = Math.max(...prices), minP = Math.min(...prices);
          const distHigh = maxP - anchor, distLow = anchor - minP;
          if (Math.abs(distHigh - distLow) <= 1 && distHigh > 0 && distLow > 0) isMaker = true;
        }
        group.forEach(t => {
          const anchorForDir = midLookup[t[0]];
          const isHigh = anchorForDir != null ? (t[1] >= anchorForDir) : false;
          if (isMaker) { if (isHigh) makerAsks.push(t); else makerBids.push(t); }
          else         { if (isHigh) takerBuys.push(t); else takerSells.push(t); }
        });
      } else {
        const t = group[0], anchorForDir = midLookup[t[0]];
        if (anchorForDir != null && t[1] >= anchorForDir) takerBuys.push(t); else takerSells.push(t);
      }
    });
    const mksz = t => Math.max(8, Math.min(22, t[2] * 2));
    if (makerAsks.length) tr.push({ x: makerAsks.map(t => t[0]), y: makerAsks.map(t => t[1]), type: 'scattergl', mode: 'markers', name: 'Maker Ask (Taker Buy)',  marker: { size: makerAsks.map(mksz),  color: C.red,   symbol: 'square',        opacity: 0.85, line: { width: 1, color: 'rgba(0,0,0,0.4)' } }, text: makerAsks.map(t  => `Maker Ask Filled<br>Vol:${t[2]} P:${fmt(t[1])}`),  hovertemplate: '%{text}' });
    if (makerBids.length) tr.push({ x: makerBids.map(t => t[0]), y: makerBids.map(t => t[1]), type: 'scattergl', mode: 'markers', name: 'Maker Bid (Taker Sell)', marker: { size: makerBids.map(mksz),  color: C.green, symbol: 'square',        opacity: 0.85, line: { width: 1, color: 'rgba(0,0,0,0.4)' } }, text: makerBids.map(t  => `Maker Bid Filled<br>Vol:${t[2]} P:${fmt(t[1])}`),  hovertemplate: '%{text}' });
    if (takerBuys.length) tr.push({ x: takerBuys.map(t => t[0]), y: takerBuys.map(t => t[1]), type: 'scattergl', mode: 'markers', name: 'Taker Buy',              marker: { size: takerBuys.map(mksz), color: C.green, symbol: 'triangle-up',   opacity: 0.85, line: { width: 1, color: 'rgba(0,0,0,0.4)' } }, text: takerBuys.map(t  => `Taker Buy<br>Vol:${t[2]} P:${fmt(t[1])}`),          hovertemplate: '%{text}' });
    if (takerSells.length) tr.push({ x: takerSells.map(t => t[0]), y: takerSells.map(t => t[1]), type: 'scattergl', mode: 'markers', name: 'Taker Sell',           marker: { size: takerSells.map(mksz), color: C.red,   symbol: 'triangle-down', opacity: 0.85, line: { width: 1, color: 'rgba(0,0,0,0.4)' } }, text: takerSells.map(t => `Taker Sell<br>Vol:${t[2]} P:${fmt(t[1])}`),         hovertemplate: '%{text}' });
  }

  if (bov.mine) {
    const myBuys  = wmFilter(d.buy_trades.filter(t  => S._bv.has(t[2])), d, S.wallMidDist);
    const mySells = wmFilter(d.sell_trades.filter(t => S._bv.has(t[2])), d, S.wallMidDist);
    if (myBuys.length)  tr.push({ x: myBuys.map(t  => t[0]), y: myBuys.map(t  => t[1]), type: 'scattergl', mode: 'markers', name: 'Your Buys',  marker: { size: 10, color: C.green, symbol: 'diamond', line: { width: 1.5, color: '#fff' } }, text: myBuys.map(t  => `BUY ${t[2]} @ ${fmt(t[1])} from ${t[3]}`),  hovertemplate: '%{text}' });
    if (mySells.length) tr.push({ x: mySells.map(t => t[0]), y: mySells.map(t => t[1]), type: 'scattergl', mode: 'markers', name: 'Your Sells', marker: { size: 10, color: C.red,   symbol: 'diamond', line: { width: 1.5, color: '#fff' } }, text: mySells.map(t => `SELL ${t[2]} @ ${fmt(t[1])} to ${t[3]}`),   hovertemplate: '%{text}' });
  }
  Plotly.newPlot('c6', tr, BL(480, { hovermode: 'closest', xaxis: { gridcolor: GR }, yaxis: { gridcolor: GR } }), PC);
}

// Toggle a bot pattern overlay key and re-render t6
function togBotOv(k) { window.S.botOv[k] = !window.S.botOv[k]; t6(); }

// Toggle a volume filter in t6
function tv(v) {
  if (!window.S._bv) window.S._bv = new Set();
  if (window.S._bv.has(v)) window.S._bv.delete(v); else window.S._bv.add(v);
  t6();
}

// ─── T7: Imbalance — OBI + tape velocity + wall mid skew + correlation ────────
function t7() {
  const S = window.S;
  const d = S.data[S.prod], el = document.getElementById('p7'), ts = d.timestamps;
  const obi = d.obi || [], tape = d.tape_velocity || [];
  let sigObi = [], sigTape = [], sigWm = [];
  if (d.signals) {
    if (d.signals.obi)      sigObi  = d.signals.obi.map(s => s[1]);
    if (d.signals.tape_vel) sigTape = d.signals.tape_vel.map(s => s[1]);
    if (d.signals.wall_mid) sigWm   = d.signals.wall_mid.map(s => s[1]);
  }
  const finalObi  = obi.length  ? obi  : (sigObi.length  ? sigObi  : []);
  const finalTape = tape.length ? tape : (sigTape.length ? sigTape : []);

  if (!finalObi.length && !finalTape.length && !sigWm.length) {
    el.innerHTML = '<div class="note">No order book imbalance or Wall Mid data. Upload a log with L2 order book data or SIG signals (obi, tape_vel, wall_mid).</div>';
    return;
  }

  // Wall Mid Skew
  const wmSkew = [], mp = d.mid_prices, wmByTs = {};
  if (d.signals && d.signals.wall_mid) d.signals.wall_mid.forEach(v => { wmByTs[v[0]] = v[1]; });
  const spreadMid = ts.map((_, i) => d.best_bids && d.best_asks && d.best_bids[i] != null && d.best_asks[i] != null ? ((d.best_bids[i] + d.best_asks[i]) / 2) : null);
  for (let i = 0; i < ts.length; i++) {
    const wmV = wmByTs[ts[i]], sm = spreadMid[i];
    wmSkew.push(wmV != null && sm != null ? wmV - sm : null);
  }

  // Correlation (OBI vs next-tick price change)
  let corrRObi = null, corrNObi = 0;
  if (finalObi.length > 2 && mp.length > 2) {
    const n = Math.min(finalObi.length, mp.length) - 1, xs = [], ys = [];
    for (let i = 0; i < n; i++) { if (finalObi[i] != null && mp[i + 1] != null && mp[i] != null) { xs.push(finalObi[i]); ys.push(mp[i + 1] - mp[i]); } }
    corrNObi = xs.length;
    if (corrNObi > 10) {
      const mx = xs.reduce((a, b) => a + b, 0) / corrNObi, my = ys.reduce((a, b) => a + b, 0) / corrNObi;
      let num = 0, dx = 0, dy = 0;
      for (let i = 0; i < corrNObi; i++) { const x = xs[i] - mx, y = ys[i] - my; num += x * y; dx += x * x; dy += y * y; }
      const den = Math.sqrt(dx * dy); corrRObi = den > 0 ? num / den : 0;
    }
  }

  // Correlation (Wall Skew vs next-tick price change)
  let corrRSkew = null, corrNSkew = 0;
  if (wmSkew.length > 2 && mp.length > 2) {
    const n = Math.min(wmSkew.length, mp.length) - 1, xs = [], ys = [];
    for (let i = 0; i < n; i++) { if (wmSkew[i] != null && mp[i + 1] != null && mp[i] != null) { xs.push(wmSkew[i]); ys.push(mp[i + 1] - mp[i]); } }
    corrNSkew = xs.length;
    if (corrNSkew > 10) {
      const mx = xs.reduce((a, b) => a + b, 0) / corrNSkew, my = ys.reduce((a, b) => a + b, 0) / corrNSkew;
      let num = 0, dx = 0, dy = 0;
      for (let i = 0; i < corrNSkew; i++) { const x = xs[i] - mx, y = ys[i] - my; num += x * y; dx += x * x; dy += y * y; }
      const den = Math.sqrt(dx * dy); corrRSkew = den > 0 ? num / den : 0;
    }
  }

  // Rolling tape sum (10-tick window)
  const tapeRoll = [];
  for (let i = 0; i < finalTape.length; i++) {
    let s = 0; for (let j = Math.max(0, i - 9); j <= i; j++) s += finalTape[j] || 0;
    tapeRoll.push(s);
  }

  // OBI threshold + shaded zones
  const OBI_THRESH = 0.65, shapes = [];
  let inZone = false, zStart = 0, zDir = 0;
  for (let i = 0; i < finalObi.length; i++) {
    const v = finalObi[i] || 0;
    if (Math.abs(v) > OBI_THRESH) {
      if (!inZone) { inZone = true; zStart = ts[i]; zDir = v > 0 ? 1 : -1; }
    } else {
      if (inZone) { shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: zStart, x1: ts[i], y0: 0, y1: 1, fillcolor: zDir > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', line: { width: 0 } }); inZone = false; }
    }
  }
  if (inZone) shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: zStart, x1: ts[ts.length - 1], y0: 0, y1: 1, fillcolor: zDir > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', line: { width: 0 } });

  const obiColors  = finalObi.map(v  => (v  || 0) >= 0 ? C.green : C.red);
  const tapeColors = finalTape.map(v => (v  || 0) >= 0 ? C.green : C.red);
  const skewColors = wmSkew.map(v    => (v  || 0) >= 0 ? C.green : C.red);
  const obiMax  = finalObi.length  ? Math.max(...finalObi.map(Math.abs)) : 0;
  const obiAvg  = finalObi.length  ? (finalObi.reduce((a, b) => a + (b || 0), 0) / finalObi.length) : 0;
  const tapeMax = finalTape.length ? Math.max(...finalTape.map(Math.abs)) : 0;
  const toxicTicks = finalObi.filter(v => Math.abs(v || 0) > OBI_THRESH).length;

  let metricsH = '<div class="sr">';
  metricsH += `<div class="mc"><div class="mc-l">OBI Corr (r)</div><div class="mc-v ${corrRObi != null ? (corrRObi > 0 ? 'g' : 'r') : ''}">${corrRObi != null ? corrRObi.toFixed(4) : 'N/A'}</div><div class="mc-sub">OBI \u2192 \u0394Price (n=${corrNObi})</div></div>`;
  if (corrRSkew != null) metricsH += `<div class="mc"><div class="mc-l">Wall Skew Corr (r)</div><div class="mc-v ${corrRSkew > 0 ? 'g' : 'r'}">${corrRSkew.toFixed(4)}</div><div class="mc-sub">Skew \u2192 \u0394Price</div></div>`;
  metricsH += `<div class="mc"><div class="mc-l">Max |OBI|</div><div class="mc-v">${obiMax.toFixed(3)}</div><div class="mc-sub">Avg: ${obiAvg.toFixed(3)}</div></div>`;
  metricsH += `<div class="mc"><div class="mc-l">Max Tape Vol</div><div class="mc-v">${tapeMax}</div><div class="mc-sub">Single-tick peak</div></div>`;
  metricsH += '</div>';

  let layoutHTML = metricsH;
  if (finalObi.length > 0) layoutHTML += '<div class="card"><div class="card-h"><div class="card-t">Order Book Imbalance (OBI)</div><div class="card-leg"><div class="lg"><div class="lg-d" style="background:var(--green)"></div>Bid Heavy</div><div class="lg"><div class="lg-d" style="background:var(--red)"></div>Ask Heavy</div><div class="lg"><div class="lg-d" style="background:var(--t3);width:20px;border-top:1px dashed var(--t2)"></div>\u00b10.65 Threshold</div></div></div><div id="c7a"></div></div>';
  if (wmSkew.some(v => v != null)) layoutHTML += '<div class="card"><div class="card-h"><div class="card-t">Wall Mid Skew (Wall Mid \u2212 Spread Mid)</div><div class="card-leg"><div class="lg"><div class="lg-d" style="background:var(--green)"></div>Walls &gt; Spread Mid</div><div class="lg"><div class="lg-d" style="background:var(--red)"></div>Walls &lt; Spread Mid</div></div></div><div id="c7d"></div></div>';
  if (finalTape.length > 0) layoutHTML += '<div class="card"><div class="card-h"><div class="card-t">Trade Tape Velocity</div><div class="card-leg"><div class="lg"><div class="lg-d" style="background:var(--green)"></div>Net Buy</div><div class="lg"><div class="lg-d" style="background:var(--red)"></div>Net Sell</div><div class="lg"><div class="lg-d" style="background:var(--gold)"></div>10-Tick Rolling</div></div></div><div id="c7b"></div></div>';
  layoutHTML += '<div class="card"><div class="card-h"><div class="card-t">Price + Imbalance Zones</div><div class="card-leg"><div class="lg"><div class="lg-d" style="background:var(--t1)"></div>Mid Price</div><div class="lg"><div class="lg-d" style="background:rgba(34,197,94,0.3);width:14px;height:8px"></div>Bid Heavy Zone</div><div class="lg"><div class="lg-d" style="background:rgba(239,68,68,0.3);width:14px;height:8px"></div>Ask Heavy Zone</div></div></div><div id="c7c"></div></div>';
  el.innerHTML = layoutHTML;

  if (finalObi.length > 0) Plotly.newPlot('c7a', [
    { x: ts, y: finalObi, type: 'bar', marker: { color: obiColors, opacity: 0.7 }, name: 'OBI', hovertemplate: 'OBI: %{y:.3f}<extra></extra>' },
    { x: [ts[0], ts[ts.length-1]], y: [OBI_THRESH, OBI_THRESH],   type: 'scattergl', mode: 'lines', line: { color: C.dim, width: 1, dash: 'dash' }, showlegend: false },
    { x: [ts[0], ts[ts.length-1]], y: [-OBI_THRESH, -OBI_THRESH], type: 'scattergl', mode: 'lines', line: { color: C.dim, width: 1, dash: 'dash' }, showlegend: false },
  ], BL(220, { hovermode: 'x unified', yaxis: { range: [-1.05, 1.05], gridcolor: GR }, margin: { l: 50, r: 16, t: 4, b: 24 }, showlegend: false }), PC);

  if (wmSkew.some(v => v != null)) Plotly.newPlot('c7d', [
    { x: ts, y: wmSkew, type: 'bar', marker: { color: skewColors, opacity: 0.7 }, name: 'Wall Skew', hovertemplate: 'Skew: %{y:.3f}<extra></extra>' },
  ], BL(200, { hovermode: 'x unified', yaxis: { gridcolor: GR }, margin: { l: 50, r: 16, t: 4, b: 24 }, showlegend: false }), PC);

  if (finalTape.length > 0) Plotly.newPlot('c7b', [
    { x: ts, y: finalTape, type: 'bar', marker: { color: tapeColors, opacity: 0.6 }, name: 'Net Tape' },
    { x: ts, y: tapeRoll, type: 'scattergl', mode: 'lines', line: { color: C.gold, width: 1.5 }, name: '10-Tick Roll' },
  ], BL(200, { hovermode: 'x unified', margin: { l: 50, r: 16, t: 4, b: 24 }, showlegend: false, barmode: 'overlay' }), PC);

  const priceTr = [{ x: ts, y: mp, type: 'scattergl', mode: 'lines', line: { color: '#8b8fa3', width: 1.5 }, name: 'Mid Price' }];
  if (d.buy_trades.length)  priceTr.push({ x: d.buy_trades.map(t  => t[0]), y: d.buy_trades.map(t  => t[1]), type: 'scattergl', mode: 'markers', marker: { color: C.green, symbol: 'triangle-up',   size: 7 }, name: 'Buys'  });
  if (d.sell_trades.length) priceTr.push({ x: d.sell_trades.map(t => t[0]), y: d.sell_trades.map(t => t[1]), type: 'scattergl', mode: 'markers', marker: { color: C.red,   symbol: 'triangle-down', size: 7 }, name: 'Sells' });
  Plotly.newPlot('c7c', priceTr, BL(300, { hovermode: 'x unified', shapes, showlegend: true }), PC);
}

// Expose for app.js and inline onclick handlers
window.t0 = t0; window.t1 = t1; window.t2 = t2; window.t3 = t3;
window.t4 = t4; window.t5 = t5; window.t6 = t6; window.t7 = t7;
window.rOBi     = rOBi;
window.rTkCards = rTkCards;
window.BL       = BL;
window.togBotOv = togBotOv;
window.tv       = tv;
