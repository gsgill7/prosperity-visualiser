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
    <div class="card"><div class="card-h"><div class="card-t">Price &amp; Liquidity: ${S.prod}</div><div class="card-leg">${ov.ask || m === 'prices' ? '<div class="lg"><div class="lg-d" style="background:var(--red)"></div>ASK</div>' : ''}${ov.mid ? '<div class="lg"><div class="lg-d" style="background:var(--t0)"></div>MID</div>' : ''}${ov.bid || m === 'prices' ? '<div class="lg"><div class="lg-d" style="background:var(--teal)"></div>BID</div>' : ''}</div></div><div class="pill-row"><span style="font-size:9px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:0.04em">View</span><div class="pill ${m === 'prices' ? 'on' : ''}" onclick="setCM('prices')">Prices</div><div class="pill ${m === 'spread' ? 'on' : ''}" onclick="setCM('spread')">Spread</div><div class="pill ${m === 'volume' ? 'on' : ''}" onclick="setCM('volume')">Volume</div><div class="pill-sep"></div><span style="font-size:9px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Overlays</span><div class="pill ${ov.bid ? 'on' : ''}" onclick="togOv('bid')">Bid</div><div class="pill ${ov.mid ? 'on' : ''}" onclick="togOv('mid')">Mid</div><div class="pill ${ov.ask ? 'on' : ''}" onclick="togOv('ask')">Ask</div><div class="pill ${ov.orders ? 'on' : ''}" onclick="togOv('orders')">Orders (All)</div>${d.signals && (d.signals.bb_mid || d.signals.bb_upper) ? `<div class="pill ${ov.bb ? 'on' : ''}" onclick="togOv('bb')">BB Bands</div>` : ''}${wmPills}</div><div id="c0a"></div></div>
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

// Expose for app.js and inline onclick handlers
window.t0 = t0;
window.rOBi     = rOBi;
window.rTkCards = rTkCards;
window.BL       = BL;
