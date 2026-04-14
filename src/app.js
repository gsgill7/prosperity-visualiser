// app.js — Application state, file handling, playback, and tab routing

// ─── Global state ─────────────────────────────────────────────────────────────
window.S = {
  data: null, prod: null, prods: [], tick: 0, maxTick: 0,
  playing: false, speed: 1, timer: null, tab: 0, npc: false, fn: '',
  cMode: 'prices', ov: { bid: false, mid: false, ask: false, orders: false, bb: false },
  runs: {}, activeRun: null, comparing: new Set(),
  _runCounter: 0,
  wallMidDist: null,
  botOv: { bid: false, mid: false, ask: false, mine: true },
  _bv: null,
  // Backtest panel state
  btFile: null,
  btDays: new Set(['0--1', '0--2']),
};

const TABS = ['Time-Series'];
const PC = { displayModeBar: false };
const ICO = {
  t: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  d: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
  b: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>',
  p: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>',
  $: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
};

function fmt(n) { return n != null ? n.toLocaleString() : '—'; }

// ─── File handling ────────────────────────────────────────────────────────────
const fi = document.getElementById('fi');
fi.addEventListener('change', e => { if (e.target.files[0]) proc(e.target.files[0]); });
document.getElementById('ubtn').addEventListener('dragover', e => e.preventDefault());
document.getElementById('ubtn').addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) proc(e.dataTransfer.files[0]); });
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) proc(e.dataTransfer.files[0]); });

function initRunData(data) {
  for (const sym in data) {
    const d = data[sym];
    d.buy_by_ts = {}; d.sell_by_ts = {}; d.mkt_by_ts = {}; d.sub_by_ts = {};
    d.buy_trades.forEach(t  => { (d.buy_by_ts[t[0]]  = d.buy_by_ts[t[0]]  || []).push(t); });
    d.sell_trades.forEach(t => { (d.sell_by_ts[t[0]] = d.sell_by_ts[t[0]] || []).push(t); });
    d.market_trades.forEach(t => { (d.mkt_by_ts[t[0]] = d.mkt_by_ts[t[0]] || []).push(t); });
    (d.submitted || []).forEach(o => { (d.sub_by_ts[o[0]] = d.sub_by_ts[o[0]] || []).push(o); });
  }
}

async function parseWithWorker(content) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('src/worker.js');
    worker.onmessage = (e) => {
      if (e.data.success) resolve(e.data.data);
      else reject(new Error(e.data.error));
      worker.terminate();
    };
    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };
    worker.postMessage(content);
  });
}

async function proc(file) {
  window.S.fn = file.name;
  document.getElementById('ld').classList.add('on');
  await new Promise(r => setTimeout(r, 10));
  try {
    let content;
    if (file.name.endsWith('.zip')) {
      const buf = await file.arrayBuffer();
      content = await window.extractZip(buf);
    } else {
      content = await file.text();
    }
    const data = await parseWithWorker(content);
    const runId = String(++window.S._runCounter);
    const name  = file.name.replace(/\.(zip|log|json)$/, '');
    initRunData(data);
    window.S.runs[runId]   = { name, data };
    window.S.activeRun     = runId;
    window.S.comparing.add(runId);
    window.S.data  = data;
    window.S.prods = Object.keys(data).sort();
    fi.value = '';
    init();
  } catch (err) {
    alert(String(err));
  } finally {
    document.getElementById('ld').classList.remove('on');
  }
}

// ─── Clear all runs ───────────────────────────────────────────────────────────
function cf() {
  window.S.runs = {}; window.S.data = null; window.S.prod = null;
  window.S.prods = []; window.S.comparing.clear(); stopPlay();
  document.getElementById('da').style.display    = 'none';
  document.getElementById('wl').style.display    = 'flex';
  document.getElementById('pbr').style.display   = 'none';
  ['sp', 'so', 'sRuns'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('pl').innerHTML = '';
  document.getElementById('runList').innerHTML = '';
  fi.value = '';
}

// ─── Init after file load ─────────────────────────────────────────────────────
function init() {
  document.getElementById('wl').style.display  = 'none';
  document.getElementById('da').style.display  = '';
  document.getElementById('pbr').style.display = 'flex';
  ['sp', 'so', 'sRuns'].forEach(id => document.getElementById(id).style.display = '');
  updRuns();
  document.getElementById('pl').innerHTML = window.S.prods
    .map(p => `<div class="prod" data-p="${p}" onclick="sel('${p}')">${p}</div>`).join('');
  const TAB_SEP = '<div class="tab-sep"></div>';
  document.getElementById('tabs').innerHTML = TABS
    .map((t, i) => (i === 3 || i === 6 ? TAB_SEP : '') + `<div class="tab${i === 0 ? ' on' : ''}" onclick="stab(${i})">${t}</div>`).join('');
  document.getElementById('pns').innerHTML = TABS
    .map((_, i) => `<div class="tc${i === 0 ? ' on' : ''}" id="p${i}"></div>`).join('');
  sel(window.S.prods[0]);
}

// ─── Run list management ──────────────────────────────────────────────────────
function updRuns() {
  const rids = Object.keys(window.S.runs);
  document.getElementById('runHdr').textContent = `Runs  ${rids.length}`;
  document.getElementById('runList').innerHTML = rids.map(rid => {
    const r = window.S.runs[rid], isCmp = window.S.comparing.has(rid), isAct = rid === window.S.activeRun;
    const nA = Object.keys(r.data).length;
    const nT = r.data[Object.keys(r.data)[0]] ? r.data[Object.keys(r.data)[0]].timestamps.length : 0;
    return `<div class="run ${isAct ? 'active' : ''}" onclick="switchRun('${rid}')"><div class="run-l"><div class="run-name">${r.name}</div><div class="run-info">${nA} assets &middot; ${fmt(nT)} ticks</div></div><div class="run-r"><span class="run-badge upload">Log</span>${rids.length > 1 ? `<span class="run-badge cmp" onclick="event.stopPropagation();togCmp('${rid}')">${isCmp ? 'Comparing' : 'Compare'}</span>` : ''}<span class="run-x" onclick="event.stopPropagation();delRun('${rid}')">&#x2715;</span></div></div>`;
  }).join('');
}

function switchRun(rid) {
  if (!window.S.runs[rid]) return;
  window.S.activeRun = rid; window.S.data = window.S.runs[rid].data;
  window.S.prods = Object.keys(window.S.data).sort(); updRuns();
  document.getElementById('pl').innerHTML = window.S.prods
    .map(p => `<div class="prod" data-p="${p}" onclick="sel('${p}')">${p}</div>`).join('');
  if (window.S.prods.includes(window.S.prod)) sel(window.S.prod);
  else sel(window.S.prods[0]);
}

function togCmp(rid) {
  if (window.S.comparing.has(rid)) window.S.comparing.delete(rid);
  else window.S.comparing.add(rid);
  updRuns();
  if (window.S.tab === 0) rTab(0);
}

function delRun(rid) {
  delete window.S.runs[rid]; window.S.comparing.delete(rid);
  const rids = Object.keys(window.S.runs);
  if (!rids.length) { cf(); return; }
  if (rid === window.S.activeRun) switchRun(rids[0]); else updRuns();
}

// ─── Product selection ────────────────────────────────────────────────────────
function sel(p) {
  window.S.prod = p;
  const d = window.S.data[p];
  stopPlay();
  document.querySelectorAll('.prod').forEach(el => el.classList.toggle('on', el.dataset.p === p));
  window.S.maxTick = d.timestamps.length - 1;
  window.S.tick    = window.S.maxTick;
  const sl = document.getElementById('psl');
  sl.max = window.S.maxTick; sl.value = window.S.maxTick;
  document.getElementById('pmx').textContent = fmt(window.S.maxTick);
  render();
}

function togN() {
  window.S.npc = !window.S.npc;
  document.getElementById('tn').classList.toggle('on', window.S.npc);
  if (window.S.tab === 0) rTab(0);
}

function stab(i) {
  window.S.tab = i;
  document.querySelectorAll('.tab').forEach((b, j) => b.classList.toggle('on', j === i));
  document.querySelectorAll('.tc').forEach((c, j) => c.classList.toggle('on', j === i));
  rTab(i);
}

// ─── Playback controls ────────────────────────────────────────────────────────
function togPlay() { window.S.playing ? stopPlay() : startPlay(); }
function startPlay() {
  if (window.S.tick >= window.S.maxTick) window.S.tick = 0;
  window.S.playing = true;
  document.getElementById('pbP').textContent = '\u23F8';
  window.S.timer = setInterval(() => {
    window.S.tick += window.S.speed;
    if (window.S.tick >= window.S.maxTick) { window.S.tick = window.S.maxTick; stopPlay(); }
    document.getElementById('psl').value = window.S.tick;
    updateTick();
  }, 50);
}
function stopPlay() {
  window.S.playing = false;
  if (window.S.timer) { clearInterval(window.S.timer); window.S.timer = null; }
  document.getElementById('pbP').textContent = '\u25B6';
}
function stepF() { stopPlay(); window.S.tick = Math.min(window.S.tick + 1, window.S.maxTick); document.getElementById('psl').value = window.S.tick; updateTick(); }
function stepB() { stopPlay(); window.S.tick = Math.max(window.S.tick - 1, 0);               document.getElementById('psl').value = window.S.tick; updateTick(); }
function setSpd(s) { window.S.speed = s; document.querySelectorAll('.pb-spd').forEach(el => el.classList.toggle('on', +el.dataset.s === s)); }
function onScrub(v) {
  stopPlay();
  window.S.tick = +v;
  if (window.S._scrubTick) cancelAnimationFrame(window.S._scrubTick);
  window.S._scrubTick = requestAnimationFrame(() => updateTick());
}
function onTsInp(v) {
  const d = window.S.data[window.S.prod], ts = d.timestamps, val = +v;
  let best = 0; for (let i = 0; i < ts.length; i++) { if (ts[i] <= val) best = i; else break; }
  stopPlay(); window.S.tick = best; document.getElementById('psl').value = window.S.tick; updateTick();
}
function tsSpin(dir) {
  let t = window.S.tick + dir;
  if (t < 0) t = 0; if (t > window.S.maxTick) t = window.S.maxTick;
  stopPlay(); window.S.tick = t; document.getElementById('psl').value = t; updateTick();
}

// ─── Tick update ──────────────────────────────────────────────────────────────
function updateTick() {
  const S = window.S, d = S.data[S.prod];
  document.getElementById('ptk').textContent  = fmt(S.tick);
  document.getElementById('ppct').textContent = Math.round(S.tick / Math.max(S.maxTick, 1) * 100) + '%';
  const tsVal = d.timestamps[S.tick];
  document.getElementById('tsInp').value = tsVal != null ? tsVal : '';

  const obEl = document.getElementById('ob-live');
  if (obEl && d.l2_bids && d.l2_bids[S.tick] && d.l2_asks && d.l2_asks[S.tick])
    obEl.innerHTML = window.rOBi(d.l2_bids[S.tick], d.l2_asks[S.tick]);

  const tcEl = document.getElementById('tk-cards-live');
  if (tcEl && tsVal != null) tcEl.innerHTML = window.rTkCards(d, tsVal);

  updateMet();
}

function render() { updateTick(); updateMet(); rTab(window.S.tab); }

function updateMet() {
  const S = window.S, d = S.data[S.prod], tk = S.tick, pnl = d.pnl;
  let dp = 0;
  if (pnl.length && tk < pnl.length) dp = pnl[tk][1] - (pnl[0] ? pnl[0][1] : 0);
  const lm = tk < d.mid_prices.length ? d.mid_prices[tk] : 0;
  const dps = dp >= 0;

  const container = document.getElementById('met');
  const hasNodes = !!document.getElementById('metric-pnl');

  if (!hasNodes || container.dataset.prod !== S.prod) {
    container.dataset.prod = S.prod;
    container.innerHTML =
      `<div class="mc"><div class="mc-i">${ICO.t}</div><div class="mc-l">Total PnL</div><div class="mc-v ${dps ? 'g' : 'r'}" id="metric-pnl">${dps ? '+' : ''}${fmt(Math.round(dp))}</div><div class="mc-sub">Cumulative</div></div>` +
      `<div class="mc"><div class="mc-i">${ICO.d}</div><div class="mc-l">Max Drawdown</div><div class="mc-v r" id="metric-dd">${fmt(Math.round(d.max_drawdown))}</div><div class="mc-sub">Peak-to-Trough</div></div>` +
      `<div class="mc"><div class="mc-i">${ICO.b}</div><div class="mc-l">${S.prod} PnL</div><div class="mc-v ${dps ? 'g' : 'r'}" id="metric-prod-pnl">${dps ? '+' : ''}${fmt(Math.round(dp))}</div><div class="mc-sub">By Product</div></div>` +
      `<div class="mc"><div class="mc-i">${ICO.p}</div><div class="mc-l">Trades</div><div class="mc-v" id="metric-trades">${d.buy_trades.length + d.sell_trades.length}</div><div class="mc-sub">Total Fills</div></div>` +
      `<div class="mc"><div class="mc-i">${ICO.$}</div><div class="mc-l">Mid Price</div><div class="mc-v" id="metric-mid">${lm.toFixed(2)}</div><div class="mc-sub">Current</div></div>`;
  } else {
    const pnlEl = document.getElementById('metric-pnl');
    pnlEl.textContent = `${dps ? '+' : ''}${fmt(Math.round(dp))}`;
    pnlEl.className = `mc-v ${dps ? 'g' : 'r'}`;

    const prodPnlEl = document.getElementById('metric-prod-pnl');
    prodPnlEl.textContent = `${dps ? '+' : ''}${fmt(Math.round(dp))}`;
    prodPnlEl.className = `mc-v ${dps ? 'g' : 'r'}`;

    document.getElementById('metric-dd').textContent = fmt(Math.round(d.max_drawdown));
    document.getElementById('metric-trades').textContent = String(d.buy_trades.length + d.sell_trades.length);
    document.getElementById('metric-mid').textContent = lm.toFixed(2);
  }
}

// ─── Tab routing ─────────────────────────────────────────────────────────────
function rTab(i) { window.t0(); }

// ─── Price chart view mode / overlays ────────────────────────────────────────
function setCM(m) { window.S.cMode = m; window.t0(); }
function togOv(k)  { window.S.ov[k] = !window.S.ov[k]; window.t0(); }
function setWMD(v) {
  window.S.wallMidDist = window.S.wallMidDist === v ? null : v;
  window.t0();
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if      (e.key === ' ')           { e.preventDefault(); togPlay(); }
  else if (e.key === 'ArrowRight')  stepF();
  else if (e.key === 'ArrowLeft')   stepB();
  else { const n = +e.key; if (n >= 1 && n <= TABS.length) stab(n - 1); }
});

// ─── Backtest panel ───────────────────────────────────────────────────────────
async function useDemoTrader() {
  try {
    const resp = await fetch('/demo_trader.py');
    if (!resp.ok) throw new Error('Could not load demo_trader.py');
    const text = await resp.text();
    const file = new File([text], 'demo_trader.py', { type: 'text/x-python' });
    btSelFile(file);
    // Auto-select both days for best demo experience
    const S = window.S;
    S.btDays = new Set(['0--1', '0--2']);
    ['0--1', '0--2'].forEach(d => {
      const el = document.getElementById('btd-' + d);
      if (el) el.classList.add('on');
    });
  } catch (err) {
    alert('Failed to load demo trader: ' + err.message);
  }
}

function btSelFile(file) {
  if (!file) return;
  window.S.btFile = file;
  document.getElementById('bt-fname').textContent = file.name;
}

function btTogDay(day) {
  const S = window.S;
  if (S.btDays.has(day)) S.btDays.delete(day); else S.btDays.add(day);
  const el = document.getElementById('btd-' + day);
  if (el) el.classList.toggle('on', S.btDays.has(day));
}

async function postBacktest() {
  const S = window.S;
  if (!S.btFile) { alert('Select a trader.py file first.'); return; }
  if (!S.btDays.size) { alert('Select at least one day to backtest.'); return; }

  const ld = document.getElementById('ld');
  const ldT = ld.querySelector('.ld-t');
  if (ldT) ldT.textContent = 'Running backtest…';
  ld.classList.add('on');

  try {
    const code = await S.btFile.text();
    const resp = await fetch('/api/backtest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trader_code: code,
        days: [...S.btDays].sort(),
      }),
    });

    if (!resp.ok) {
      let msg = resp.statusText;
      try {
        const e = await resp.json();
        msg = e.error || msg;
        // Show traceback in console for debugging
        if (e.detail) console.error('[backtest detail]\n' + e.detail);
      } catch (_) { /* ignore */ }
      throw new Error(msg);
    }

    const logText = await resp.text();
    const data = await parseWithWorker(logText);
    const runId = String(++S._runCounter);
    const name  = S.btFile.name.replace(/\.py$/i, '') + ' [bt]';
    initRunData(data);
    S.runs[runId]  = { name, data };
    S.activeRun    = runId;
    S.comparing.add(runId);
    S.data  = data;
    S.prods = Object.keys(data).sort();
    document.getElementById('bfi').value = '';
    init();
  } catch (err) {
    alert('Backtest failed: ' + err.message);
  } finally {
    if (ldT) ldT.textContent = 'Parsing…';
    ld.classList.remove('on');
  }
}

// Expose globals used by inline onclick handlers in charts.js / index.html
window.cf         = cf;
window.init       = init;
window.sel        = sel;
window.stab       = stab;
window.togN       = togN;
window.togPlay    = togPlay;
window.stepF      = stepF;
window.stepB      = stepB;
window.setSpd     = setSpd;
window.onScrub    = onScrub;
window.onTsInp    = onTsInp;
window.tsSpin     = tsSpin;
window.togCmp     = togCmp;
window.delRun     = delRun;
window.switchRun  = switchRun;
window.setCM      = setCM;
window.togOv      = togOv;
window.setWMD     = setWMD;
window.proc       = proc;
window.useDemoTrader = useDemoTrader;
window.btSelFile  = btSelFile;
window.btTogDay   = btTogDay;
window.postBacktest = postBacktest;
