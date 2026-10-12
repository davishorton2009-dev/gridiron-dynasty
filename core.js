/* =====================================================================
   GRIDIRON DYNASTY · CORE
   ---------------------------------------------------------------------
   The frame around the game: your money, saving (in this browser),
   toasts, the tab bar, and small view helpers. The game itself
   (gridiron-game.js) plugs in with GM.register(api => ({ ...the game... })).
   ===================================================================== */
(function (root) {
const C = root.GRID || {};
const KEY = 'gridiron-dynasty';
const q = s => document.querySelector(s);
const h = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;
const num = v => { v = +v; return Number.isFinite(v) && v > 0 ? v : 0; };
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const money = n => `$${Math.floor(n).toLocaleString('en-US')}`;

/* ---------------- state ---------------- */
let GAME = null;
const fresh = () => ({ v: 1, cash: C.startCash || 120, earned: 0, t: 0, games: {} });
function norm(g) {
  const o = fresh();
  if (!g || typeof g !== 'object') return o;
  o.cash = Number.isFinite(+g.cash) ? +g.cash : o.cash;   /* can be below zero when payroll breaks you */
  o.earned = num(g.earned); o.t = num(g.t); o.games = obj(g.games);
  return o;
}
let G = (() => { try { return norm(JSON.parse(lsGet(KEY) || 'null')); } catch (e) { return fresh(); } })();
const CV = { tab: null, imp: null, impErr: '' };
const state = id => G.games[id];
const earn = n => { G.cash += n; G.earned += n; };
function save() { G.t = Date.now(); lsSet(KEY, JSON.stringify(G)); }

/* ---------------- backups: download the save as a file, load one back ---------------- */
const PREV = KEY + '-before-import';   /* the career an import replaced, so it can be undone */
const stamp = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const when = t => t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unknown time';
function exportSave() {
  save();
  const text = JSON.stringify({ app: KEY, exported: Date.now(), save: G });
  const tag = GAME && GAME.fileTag ? GAME.fileTag() : '';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = `${KEY}${tag ? '-' + tag : ''}-${stamp(Date.now())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded.<small>Keep the file somewhere safe. Load it here (or in another browser) with “Load a backup”.</small>', 'cash');
}
/* A save file is data, not code: no saved text ever needs < > " or `, so strip them from
   every string and key in case someone hands you a tampered file */
function clean(v, depth) {
  if (depth > 40) return null;
  if (typeof v === 'string') return v.replace(/[<>"`]/g, '');
  if (Array.isArray(v)) return v.map(x => clean(x, depth + 1));
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k.replace(/[<>"`]/g, '')] = clean(v[k], depth + 1); }); return o; }
  return typeof v === 'number' || typeof v === 'boolean' ? v : null;
}
/* read a picked file and, if it's a real career, hold it for you to confirm */
function readImport(input, done) {
  const f = input.files && input.files[0]; input.value = '';
  if (!f || !GAME) return;
  CV.imp = null; CV.impErr = '';
  const fail = msg => { CV.impErr = msg; done(); };
  if (f.size > 5e6) return fail('That file is too big to be a save.');
  const r = new FileReader();
  r.onerror = () => fail('Couldn’t read that file.');
  r.onload = () => {
    let raw;
    try { raw = JSON.parse(r.result); } catch (e) { return fail(`“${h(f.name)}” isn’t a save file.`); }
    raw = clean(raw && raw.save && raw.app === KEY ? raw.save : raw, 0);
    if (!raw || typeof raw !== 'object' || !obj(raw.games)[GAME.id]) return fail(`“${h(f.name)}” isn’t a ${h(GAME.gk || 'game')} save.`);
    const g = norm(raw); g.games[GAME.id] = GAME.norm(g.games[GAME.id]);
    if (GAME.validSave && !GAME.validSave(g.games[GAME.id])) return fail(`“${h(f.name)}” is damaged or from an unfinished career, so it can’t be loaded.`);
    CV.imp = { G: g, file: f.name, info: GAME.describe ? GAME.describe(g.games[GAME.id]) : '' };
    done();
  };
  r.readAsText(f);
}
function swapIn(g) {
  G = g; CV.imp = null; CV.impErr = '';
  CV.tab = GAME ? GAME.tabs[0][0] : null;
  if (GAME && GAME.loaded) GAME.loaded();
  save();
}
function applyImport() {
  if (!CV.imp) return;
  save(); lsSet(PREV, JSON.stringify(G));
  const file = CV.imp.file; swapIn(CV.imp.G);
  toast(`Save loaded from ${h(file)}.<small>Your old career is kept until the next import: “Undo load” on the Home tab brings it back.</small>`, 'cash');
}
function undoImport() {
  let prev = null; try { prev = JSON.parse(lsGet(PREV) || 'null'); } catch (e) {}
  if (!prev || !GAME) return;
  const back = norm(prev); back.games[GAME.id] = GAME.norm(back.games[GAME.id]);
  save(); lsSet(PREV, JSON.stringify(G));   /* so undo can be undone */
  swapIn(back);
  toast('Switched back to your previous career.', 'note');
}
function saveBox() {
  const prev = lsGet(PREV);
  const imp = CV.imp ? `<div class="bb-next sv-confirm"><p class="label">Load this save?</p><p class="small-note"><b>${h(CV.imp.file)}</b><br>${CV.imp.info}<br><span class="muted">Saved ${when(CV.imp.G.t)} · ${money(CV.imp.G.cash)} cash</span></p>
      <p class="small-note bb-warn">It replaces the career in this browser. Download a backup first if you want to keep it.</p>
      <div class="buy2 left"><button type="button" class="btn small primary" data-gm="save-load">Load it</button><button type="button" class="btn small" data-gm="save-export">Back up current first</button><button type="button" class="btn small quiet" data-gm="save-cancel">Cancel</button></div></div>` : '';
  return `<div class="farm-sec">${secHead('Your save', 'kept in this browser only')}
    <p class="small-note muted">Download a backup file to keep your career safe, or to move it to another browser or device. Only load files you trust.</p>
    <div class="buy2 left"><button type="button" class="btn small" data-gm="save-export">Download backup</button><button type="button" class="btn small" data-gm="save-pick">Load a backup…</button>${prev ? '<button type="button" class="btn small quiet" data-gm="save-undo">Undo load</button>' : ''}</div>
    <input type="file" id="save-file" accept=".json,application/json" data-gm-file="import" hidden>
    ${CV.impErr ? `<p class="small-note bb-warn" role="alert">${CV.impErr}</p>` : ''}${imp}</div>`;
}

/* ---------------- toasts: tap one to dismiss it ---------------- */
function toast(html, kind) {
  const box = q('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.innerHTML = html;
  el.title = 'Tap to dismiss';
  el.addEventListener('click', () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); });
  box.appendChild(el);
  while (box.children.length > 5) box.firstElementChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 7500);
}

/* ---------------- shared view bits ---------------- */
const row = (thumb, body, act, cls) => `<li class="shop-row ${cls || ''}">${thumb ? `<div class="thumb">${thumb}</div>` : ''}<div class="sr-body">${body}</div>${act}</li>`;
const secHead = (label, note, btn) => `<div class="sec-head"><p class="label">${label}</p>${note ? `<span class="muted">${note}</span>` : ''}${btn || ''}</div>`;
const cashBtn = (gm, id, cost, extra, text) => `<button type="button" class="btn small ${G.cash >= cost ? 'primary' : ''}" data-gm="${gm}" data-id="${id}" ${G.cash >= cost ? '' : 'disabled'} ${extra || ''}>${text ? text + ' · ' : ''}${money(cost)}</button>`;
const bar = (v, n) => `<div class="gbar"><i style="width:${(Math.max(0, Math.min(1, n ? v / n : 0)) * 100).toFixed(0)}%"></i></div>`;

/* ---------------- the game page ---------------- */
function gameView() {
  const g = GAME;
  if (!g) return '<p class="muted">The game didn’t load.</p>';
  const tabs = g.tabs;
  if (!tabs.some(([id]) => id === CV.tab)) CV.tab = tabs[0][0];
  const badge = id => g.badge ? g.badge(id) : 0;
  const seg = `<div class="seg farmtabs" role="group" aria-label="Game sections">${tabs.map(([id, name]) => `<button type="button" data-gm="tab" data-tab="${id}" aria-pressed="${CV.tab === id}">${name}${badge(id) ? ` <span class="tbadge">${badge(id)}</span>` : ''}</button>`).join('')}</div>`;
  const body = g.view(CV.tab);
  return `<div class="farm"><div class="farm-head"><div><p class="eyebrow">${h(g.title || g.name)}</p><h2>${h(g.gk || '')}</h2></div>${g.headBtn ? g.headBtn() : ''}</div>
    ${seg}
    ${g.top ? g.top(CV.tab) : ''}
    <p class="farm-purse"><span><b class="${G.cash < 0 ? 'neg' : ''}">${money(G.cash)}</b> cash</span>${g.purse ? g.purse() : ''}</p>
    ${body}<p class="foot sync">Saved in this browser.</p></div>`;
}

/* ---------------- input ---------------- */
function click(t) {
  const a = t.dataset.gm;
  if (a === 'tab') { CV.tab = t.dataset.tab; CV.imp = null; CV.impErr = ''; if (GAME && GAME.onTab) GAME.onTab(CV.tab); return 'top-sec'; }
  if (a === 'save-export') { exportSave(); return; }
  if (a === 'save-pick') { CV.impErr = ''; const f = q('#save-file'); if (f) f.click(); return; }
  if (a === 'save-load') { applyImport(); return 'top-sec'; }
  if (a === 'save-cancel') { CV.imp = null; return; }
  if (a === 'save-undo') { undoImport(); return 'top-sec'; }
  return GAME && GAME.click ? GAME.click(a, t) : undefined;
}
/* a file picked for import: reading it is async, so redraw when it's done */
function file(input, redraw) { if (input.dataset.gmFile === 'import') readImport(input, redraw); }
function change(el) { if (GAME && GAME.change) GAME.change(el); }
function submit(form) { if (GAME && GAME.submit) GAME.submit(form); }

/* ---------------- plugging the game in ---------------- */
const API = {
  get G() { return G; }, state, save, toast, earn, h, plural, num, obj, money, row, secHead, cashBtn, bar, saveBox,
  get tab() { return CV.tab; }, setTab(t) { CV.tab = t; },
  /* a brand-new career: fresh money, fresh team */
  reset() { G = fresh(); if (GAME) G.games[GAME.id] = GAME.norm(null); CV.tab = GAME ? GAME.tabs[0][0] : null; save(); },
};
function register(factory) {
  const g = factory(API);
  if (!g || !g.id) return;
  GAME = g; G.games[g.id] = g.norm(G.games[g.id]);
}

root.GM = {
  register, gameView, click, change, submit, file,
  init() { if (GAME && GAME.start) GAME.start(); },
  _state: () => G, _api: API,
};
})(window);
