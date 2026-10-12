/* =====================================================================
   GRIDIRON DYNASTY
   ---------------------------------------------------------------------
   You are the Offensive AND Defensive Coordinator. Every snap you pick
   one of three calls; the players do the rest. The AI coordinator on
   the other sideline has a style (shown in the scouting report) and
   adjusts to whatever you keep calling.

   Each call is graded against the other two choices you had: how much
   it was worth on average against what the other team was likely to
   call, given down, distance, field position and the player matchups.
   Smart calls raise team chemistry (every player plays better) and
   earn player XP. Bad calls do the opposite. Every team in the league
   starts at exactly the same overall, so how good you get is up to you.

   Rules and numbers: gridiron.js. Commentary: gridiron-lines.js.
   ===================================================================== */
GM.register(api => {
const C = window.GRID || {}, LINES = window.GRID_LINES || {};
const { h, plural, num, obj, money } = api;
const G = () => api.G;
const H = () => api.state('grid');
const byId = list => { const m = {}; (list || []).forEach(x => { if (x && x.id) m[x.id] = x; }); return m; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pickM = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const rerender = () => { if (typeof render === 'function') render(); };
const str = (v, d) => typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : d;

const SLOTS = C.slots.map(s => s[0]), SPOS = {}; C.slots.forEach(([s, p]) => { SPOS[s] = p; });
const OFF_SLOTS = SLOTS.slice(0, 8), DEF_SLOTS = SLOTS.slice(8);
const POS = C.positions, ABN = C.abilities;
const PLAY = byId(C.plays), DEFC = byId(C.defs), DIDS = C.defs.map(d => d.id), PIDS = C.plays.map(p => p.id);
/* every play runs like one of the eight core plays, every defense like one of the five core calls */
const baseOf = id => (PLAY[id] && PLAY[id].base) || id, dbase = id => (DEFC[id] && DEFC[id].base) || id;
const PBASES = Object.keys(C.matrix), DBASES = Object.keys(C.matrix.dive);
const PFAM = C.playFam || {}, DFAM = C.defFam || {};
const MX = {};
C.plays.forEach(p => { MX[p.id] = {}; C.defs.forEach(d => { const pb = baseOf(p.id), db = dbase(d.id); MX[p.id][d.id] = clamp(((C.matrix[pb] || {})[db] || 0) + ((p.adj || {})[db] || 0) + ((d.adj || {})[pb] || 0), -2, 2); }); });
/* how a play does against a whole family of defenses (and a defense against a family of plays) */
const famAvg = (ids, f) => avg(ids.map(f));
const vsDefFam = (pid, fam) => famAvg(DIDS.filter(d => dbase(d) === fam), d => MX[pid][d]);
const vsPlayFam = (did, fam) => famAvg(PIDS.filter(p => baseOf(p) === fam), p => MX[p][did]);
const PB = C.playbook || {}, BOOK_MIN = PB.min || 3, BOOK_MAX = PB.max || 6;
const COLOR = byId(C.colors);
const Q = C.quarterSec || 300;
const N = C.names || {};
const M = C.market || {};
const ORD = ['', '1st', '2nd', '3rd', '4th'];

/* ---------------- state ---------------- */
function normP(p) {
  if (!p || typeof p !== 'object' || !POS[p.pos] || !p.ab) return null;
  const ab = {}; POS[p.pos].ab.forEach(k => { ab[k] = clamp(Math.round(+p.ab[k] || 50), 1, 99); });
  const o = { id: num(p.id), name: str(p.name, 'Nobody'), num: clamp(Math.round(+p.num || 0), 0, 99), pos: p.pos, ab, lvl: clamp(Math.round(+p.lvl || 1), 1, 10), px: num(p.px) };
  if (num(p.pot)) o.pot = clamp(Math.round(p.pot), 1, 99);
  if (num(p.rk)) o.rk = num(p.rk);
  if (typeof p.col === 'string') o.col = p.col.slice(0, 30);
  if (p.inj && num(p.inj.g)) o.inj = { g: clamp(Math.round(p.inj.g), 1, 99), what: str(p.inj.what, 'Injured') };
  if (p.camp && num(p.camp.g) && C.camp.levels[p.camp.n]) o.camp = { g: clamp(Math.round(p.camp.g), 1, 4), n: p.camp.n };
  return o;
}
/* your playbook: 3 to 6 known plays per side */
function normBook(b) {
  b = obj(b);
  const one = (list, valid, def) => {
    let a = (Array.isArray(list) ? list : []).filter((id, i, all) => valid[id] && all.indexOf(id) === i).slice(0, BOOK_MAX);
    if (a.length < BOOK_MIN) (def || []).concat(Object.keys(valid)).forEach(id => { if (a.length < BOOK_MIN && valid[id] && !a.includes(id)) a.push(id); });
    return a;
  };
  return { off: one(b.off || PB.off, PLAY, PB.off), def: one(b.def || PB.def, DEFC, PB.def) };
}
const normBench = a => (Array.isArray(a) ? a : []).map(normP).filter(Boolean).slice(0, 40);
function normRoster(r) {
  if (!r || typeof r !== 'object') return null;
  const o = {};
  for (const [s, pos] of C.slots) { const p = normP(r[s]); if (!p || p.pos !== pos) return null; o[s] = p; }
  return o;
}
function norm(raw) {
  const o = obj(raw), t = obj(o.team);
  const roster = normRoster(o.roster);
  const league = (Array.isArray(o.league) ? o.league : []).map(x => {
    x = obj(x); const r = normRoster(x.roster), s = obj(x.style); if (!r || !x.id) return null;
    return { id: String(x.id), name: str(x.name, 'Team'), color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : '#c8332f',
      style: { off: C.offStyles[s.off] ? s.off : 'balanced', def: C.defStyles[s.def] ? s.def : 'balanced' }, roster: r, bench: normBench(x.bench) };
  }).filter(Boolean);
  const ok = !!o.started && !!roster && league.length === 7 && o.season && typeof o.season === 'object' && Array.isArray(o.season.sched) && Array.isArray(o.season.res);
  return {
    v: 1, started: ok,
    team: { name: str(t.name, 'Springfield Gridders'), color: COLOR[t.color] ? t.color : 'blue' },
    roster: ok ? roster : null, bench: ok ? normBench(o.bench) : [],
    picks: ok && Array.isArray(o.picks) ? o.picks.filter(x => x && num(x.yr) && num(x.rd) && x.orig && x.owner) : [],
    draft: ok && o.draft && typeof o.draft === 'object' && Array.isArray(o.draft.slots) && Array.isArray(o.draft.pool) ? o.draft : null,
    chem: Number.isFinite(+o.chem) && o.chem !== null ? clamp(+o.chem, 0, 100) : (C.chemStart || 50),
    league: ok ? league : [], season: ok ? o.season : null,
    market: (Array.isArray(o.market) ? o.market : []).map(normP).filter(Boolean),
    live: ok && o.live && typeof o.live === 'object' && Array.isArray(o.live.T) && Array.isArray(o.live.opts) ? o.live : null,
    last: o.last && typeof o.last === 'object' ? o.last : null,
    stats: obj(o.stats), over: o.over && typeof o.over === 'object' && o.over.why ? o.over : null,
    book: normBook(o.book),
    nextPid: Math.max(1, num(o.nextPid)), fast: !!o.fast, askThrow: o.askThrow !== false, snapTiming: o.snapTiming !== false, kickGame: o.kickGame !== false, hist: Array.isArray(o.hist) ? o.hist.slice(-30) : [],
  };
}
const HV = { snap: null, kick: null, camp: null, rename: false, release: null, confirmAuto: false, confirmReset: false, showBox: true, bkOff: '', bkDef: '', tr: { team: null, give: [], get: [], gp: [], tp: [], dr: 0, msg: null } };
const stat = k => +(H().stats[k] || 0);
const bump = (k, n) => { H().stats[k] = stat(k) + (n == null ? 1 : n); };

/* ---------------- players ---------------- */
function effAb(p, bonus) { const o = {}; POS[p.pos].ab.forEach(k => { o[k] = clamp(p.ab[k] + (p.lvl - 1) + (bonus || 0), 1, 99); }); return o; }
const ovr = p => Math.round(avg(Object.values(effAb(p))));
const teamOvr = r => Math.round(avg(SLOTS.map(s => r && r[s] ? ovr(r[s]) : 0)));
const chemMod = c => Math.round((c - 50) / 50 * (C.chemPts || 7));
function usedNames() {
  const s = new Set(), st = H(), add = r => r && SLOTS.forEach(k => r[k] && s.add(r[k].name)), addL = a => (a || []).forEach(p => s.add(p.name));
  add(st.roster); addL(st.bench); st.league.forEach(t => { add(t.roster); addL(t.bench); }); addL(st.market); if (st.draft) addL(st.draft.pool);
  return s;
}
function makeName(used) {
  for (let i = 0; i < 60; i++) {
    const r = Math.random();
    const n = r < .2 ? `${pickM(N.nick)} ${pickM(N.alt)}` : r < .55 ? `${pickM(N.alt)} ${pickM(N.last)}` : `${pickM(N.first)} ${pickM(N.last)}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  return `${pickM(N.first)} ${pickM(N.last)} ${ri(2, 9)}`;
}
function jersey(pos, taken) {
  const all = []; POS[pos].nums.forEach(([a, b]) => { for (let n = a; n <= b; n++) if (!taken.has(n)) all.push(n); });
  const n = all.length ? pickM(all) : ri(1, 99); taken.add(n); return n;
}
function makePlayer(pos, o, used, taken) {
  const ks = POS[pos].ab, ab = {};
  ks.forEach(k => { ab[k] = o + ri(-8, 8); });
  const shift = o - avg(ks.map(k => ab[k]));
  ks.forEach(k => { ab[k] = clamp(Math.round(ab[k] + shift), 25, 99); });
  return { id: H().nextPid++, name: makeName(used || usedNames()), num: jersey(pos, taken || new Set()), pos, ab, lvl: 1, px: 0 };
}
function makeRoster(level, used, spread) {
  const taken = new Set(), r = {}, off = {};
  /* three strong positions, three weak ones, three in between */
  if (spread) shuffle(Object.keys(POS)).forEach((p, i) => { off[p] = i < 3 ? ri(5, 10) : i < 6 ? -ri(5, 10) : ri(-2, 2); });
  C.slots.forEach(([s, pos]) => { r[s] = makePlayer(pos, level + (off[pos] || 0) + ri(-4, 4), used, taken); });
  /* every team starts at exactly the same overall */
  for (let i = 0; i < 80 && teamOvr(r) !== level; i++) {
    const d = level > teamOvr(r) ? 1 : -1, p = r[pickM(SLOTS)];
    POS[p.pos].ab.forEach(k => { p.ab[k] = clamp(p.ab[k] + d, 25, 99); });
  }
  return r;
}
const lvlAt = px => { let l = 1; (C.levels || []).forEach((need, i) => { if (px >= need) l = i + 1; }); return Math.min(l, (C.levels || [0]).length); };
function giveXp(p, n) { const before = p.lvl; p.px += Math.max(0, Math.round(n)); p.lvl = lvlAt(p.px); return p.lvl > before; }
const nextLvl = p => (C.levels || [])[p.lvl] || null;
const price = p => Math.round((M.base || 30) * Math.pow(M.grow || 1.1, ovr(p) - 60));
const releasePay = p => Math.max(1, Math.round(price(p) * (C.releaseShare || .4)));
const baseOvr = p => Math.round(avg(POS[p.pos].ab.map(k => p.ab[k])));
const allOf = t => SLOTS.map(s => t.roster[s]).concat(t.bench || []);
const NEED = {}; C.slots.forEach(([, p]) => { NEED[p] = (NEED[p] || 0) + 1; });
function canField(list) { const c = {}; list.forEach(p => { c[p.pos] = (c[p.pos] || 0) + 1; }); return Object.keys(NEED).every(k => (c[k] || 0) >= NEED[k]); }
const shortOf = list => { const c = {}; list.forEach(p => { c[p.pos] = (c[p.pos] || 0) + 1; }); return Object.keys(NEED).filter(k => (c[k] || 0) < NEED[k]); };
const benchMax = () => C.benchMax || 12;
/* AI teams always start their best players */
function bestLineup(t) { setLineup(t, allOf(t)); }
function setLineup(t, list) {
  const pool = list.slice().sort((a, b) => (out(a) ? 1 : 0) - (out(b) ? 1 : 0) || ovr(b) - ovr(a)), r = {};
  C.slots.forEach(([s, pos]) => { const i = pool.findIndex(p => p.pos === pos); r[s] = pool.splice(i, 1)[0]; });
  t.roster = r; t.bench = pool;
  if (t.bench.length > benchMax()) t.bench = t.bench.sort((a, b) => pVal(b) - pVal(a)).slice(0, benchMax());
}
/* your team: fill any empty starting spot from the bench, best player first;
   newcomers start right away if they're better than the weakest starter at their spot */
function fillYou(gotten) {
  const st = H(); gotten = gotten || [];
  C.slots.forEach(([s, pos]) => {
    if (st.roster[s]) return;
    const c = st.bench.filter(p => p.pos === pos).sort((a, b) => (out(a) ? 1 : 0) - (out(b) ? 1 : 0) || ovr(b) - ovr(a))[0];
    st.roster[s] = c; st.bench = st.bench.filter(p => p !== c);
  });
  gotten.forEach(p => {
    if (!st.bench.includes(p)) return;
    const sl = SLOTS.filter(s => SPOS[s] === p.pos).sort((a, b) => ovr(st.roster[a]) - ovr(st.roster[b]))[0];
    if (sl && ovr(p) > ovr(st.roster[sl])) { st.bench = st.bench.filter(x => x !== p).concat(st.roster[sl]); st.roster[sl] = p; }
  });
  const taken = new Set();
  allOf(you()).forEach(p => { if (taken.has(p.num)) p.num = jersey(p.pos, taken); else taken.add(p.num); });
}
/* ---------------- training camp ---------------- */
const atCamp = () => allOf(you()).filter(p => p.camp);
const campRange = n => C.camp.levels[n] || [4, 6];
/* who can go: not hurt, not already away, and with levels left to gain */
const campable = p => !p.inj && !p.camp && p.lvl < (C.levels || []).length;
function sendToCamp() {
  const st = H(), K = C.camp, cp = HV.camp; if (!cp || (st.live && !st.live.done) || atCamp().length || G().cash < K.price) return;
  const list = allOf(you()).filter(p => cp.pick.includes(p.id) && campable(p));
  if (!list.length || list.length > K.max) return;
  G().cash -= K.price;
  list.forEach(p => { p.camp = { g: cp.n, n: cp.n }; });
  fixLineup(); HV.camp = null; api.save();
  api.toast(`🏕 ${plural(list.length, 'player')} off to camp for ${cp.n} games. Back ${campRange(cp.n).join('–')} levels higher.`, 'note');
}
/* one of your games passes: campers get a game closer to coming back, and the ones who return level up.
   all: the season is over, so everyone still away comes back now */
function campTick(all) {
  const back = [], top = (C.levels || []).length;
  allOf(you()).forEach(p => {
    if (!p.camp || (--p.camp.g > 0 && !all)) return;
    const [a, b] = campRange(p.camp.n), lv = Math.min(top, p.lvl + ri(a, b)), before = p.lvl;
    delete p.camp;
    if (lv > before) giveXp(p, C.levels[lv - 1] - p.px);
    back.push([p, p.lvl - before]);
  });
  return back;
}
const campToast = ([p, n]) => api.toast(`🏕 <b>${h(p.name)}</b> (${p.pos}) is back from camp: ${n ? `+${plural(n, 'level')}, now level ${p.lvl}` : 'already at the top level'}.`, 'rank');
function campSec() {
  const st = H(), K = C.camp, away = atCamp(), cp = HV.camp, live = !!(st.live && !st.live.done), top = (C.levels || []).length;
  if (away.length) return `<div class="farm-sec">${api.secHead('Training camp', `back in ${plural(away[0].camp.g, 'game')}`)}
    <p class="small-note">🏕 ${away.map(p => `<b>${h(p.name)}</b> <span class="muted">(${p.pos}, Lv ${p.lvl})</span>`).join(', ')}. Each comes back ${campRange(away[0].camp.n).join('–')} levels higher (or when the season ends, if that comes first). Until then they can’t play, be traded, trained or released.</p></div>`;
  if (!cp) return `<div class="farm-sec">${api.secHead('Training camp', '')}
    <p class="small-note">Send up to ${K.max} players away for 2–4 games, ${money(K.price)} total. They come back 4–10 levels higher (top level ${top}), but miss those games and can’t be traded while they’re gone.</p>
    <div class="buy2 left"><button type="button" class="btn small" data-gm="camp-open" ${live ? 'disabled' : ''}>Pick players for camp</button>${live ? ' <span class="muted small-note">Not during a game.</span>' : ''}</div></div>`;
  const [a, b] = campRange(cp.n), going = allOf(you()).filter(p => cp.pick.includes(p.id));
  /* positions that would be down to a walk-on with these picks */
  const left = allOf(you()).filter(p => !out(p) && !cp.pick.includes(p.id)), short = Object.keys(NEED).filter(pos => left.filter(p => p.pos === pos).length < NEED[pos]);
  const rows = allOf(you()).map(p => {
    const on = cp.pick.includes(p.id), slot = SLOTS.find(s => st.roster[s] === p), why = p.inj ? 'injured' : p.lvl >= top ? 'top level' : '';
    const full = cp.pick.length >= K.max && !on;
    return `<li class="fb-trow ${on ? 'on' : ''}">${dotSvg(p.num, myHex(), 26)}<span class="fb-tn"><b>${h(p.name)}</b> <span class="muted">${slot || `${p.pos} · bench`} · Lv ${p.lvl}${why ? '' : ` · +${Math.min(a, top - p.lvl)}${Math.min(b, top - p.lvl) > Math.min(a, top - p.lvl) ? `–${Math.min(b, top - p.lvl)}` : ''} levels`}</span></span><b class="fb-to">${ovr(p)}</b>
      ${why ? `<span class="muted small-note">${why}</span>` : `<button type="button" class="btn small ${on ? 'primary' : ''}" data-gm="camp-pick" data-id="${p.id}" aria-pressed="${on}" ${full ? 'disabled' : ''}>${on ? 'Going' : 'Send'}</button>`}</li>`;
  }).join('');
  return `<div class="farm-sec">${api.secHead('Training camp', `${going.length} of ${K.max} picked`)}
    <div class="bb-ctl">${Object.keys(K.levels).map(n => `<button type="button" class="btn small ${cp.n === +n ? 'primary' : 'quiet'}" data-gm="camp-len" data-id="${n}" aria-pressed="${cp.n === +n}">${n} games · +${campRange(n).join('–')} levels</button>`).join('')}</div>
    <p class="small-note">Each player comes back ${a}–${b} levels higher. Starters you send miss ${cp.n} games: their backups start instead.${short.length ? ` <span class="badt">Nobody left at ${short.join(', ')}: a walk-on (about 42 overall) would start there.</span>` : ''}</p>
    <ul class="fb-tlist">${rows}</ul>
    <div class="buy2 left">${api.cashBtn('camp-go', 0, K.price, going.length ? '' : 'disabled', going.length ? `Send ${going.length} to camp` : 'Send to camp')}<button type="button" class="btn small quiet" data-gm="camp-close">Cancel</button></div></div>`;
}
/* growing into potential: young players with room to grow get better every off-season */
/* ---------------- injuries ---------------- */
const INJ = C.injury || {};
function rollInjury() {
  const ks = INJ.kinds || [{ w: 1, g: [1, 1], names: ['Injured'] }];
  let x = Math.random() * ks.reduce((a, k) => a + k.w, 0), k = ks[ks.length - 1];
  for (const c of ks) { x -= c.w; if (x <= 0) { k = c; break; } }
  return { g: ri(k.g[0], k.g[1]), what: pickM(k.names) };
}
const injTxt = inj => inj.g >= 99 ? 'out for the season' : `out ${plural(inj.g, 'game')}`;
/* can't play right now: hurt, or away at training camp */
const out = p => !!(p.inj || p.camp);
/* one game passes: injured players get a game closer to coming back */
function healTick(list) {
  const healed = [];
  list.forEach(p => { if (!p.inj || p.inj.g >= 99) return; p.inj.g--; if (p.inj.g <= 0) { delete p.inj; healed.push(p); } });
  return healed;
}
/* a fill-in off the street when nobody healthy is left at a position */
function walkOn(pos) {
  const ab = {}; POS[pos].ab.forEach(k => { ab[k] = 42 + ri(-3, 3); });
  return { id: -ri(1, 1e9), name: `${pickM(N.first)} ${pickM(N.last)}`, num: jersey(pos, new Set()), pos, ab, lvl: 1, px: 0, walk: true };
}
/* the best healthy backup at a position who isn't already playing */
function subFor(t, pos, used) {
  return (t.bench || []).filter(p => p.pos === pos && !out(p) && !used.has(p.id)).sort((a, b) => ovr(b) - ovr(a))[0] || walkOn(pos);
}
/* your team: an injured (or away) starter goes to the bench and the best available backup starts */
function fixLineup() {
  const st = H(), moved = [];
  C.slots.forEach(([s, pos]) => {
    const p = st.roster[s]; if (!p || !out(p)) return;
    const c = st.bench.filter(x => x.pos === pos && !out(x)).sort((a, b) => ovr(b) - ovr(a))[0];
    if (c) { st.roster[s] = c; st.bench = st.bench.filter(x => x !== c).concat(p); moved.push([p, c, s]); }
  });
  return moved;
}
/* starting slots where an injured (or away) player has nobody available behind him */
const holes = () => { const st = H(); return SLOTS.filter(s => out(st.roster[s])); };
function potGrow(p) { if (!p.pot) return 0; const b = baseOvr(p); if (b >= p.pot) return 0; const g = Math.min(4, Math.ceil((p.pot - b) / 3)); POS[p.pos].ab.forEach(k => { p.ab[k] = clamp(p.ab[k] + g, 25, 99); }); return g; }

/* ---------------- what players and picks are worth (trades, the draft) ---------------- */
function pVal(p, t) {
  let v = Math.pow(1.12, ovr(p) - 60) * (p.pos === 'QB' ? 1.5 : p.pos === 'K' ? .5 : 1);
  const b = baseOvr(p); if (p.pot && p.pot > b) v *= Math.pow(1.12, (p.pot - b) * .4);
  if (p.inj) v *= p.inj.g >= 4 ? .6 : .85;
  if (t) {
    const starters = SLOTS.filter(s => SPOS[s] === p.pos).map(s => t.roster[s]);
    if (!starters.includes(p)) v *= ovr(p) > Math.min(...starters.map(ovr)) ? 1.15 : .6;
  }
  return v;
}
const pkKey = pk => `${pk.yr}-${pk.rd}-${pk.orig}`;
function pickIdx(pk) {
  const D = H().draft, n = 8;
  if (D && D.yr === pk.yr && !D.done) return { i: (pk.rd - 1) * n + D.order.indexOf(pk.orig), known: true };
  return { i: (pk.rd - 1) * n + 3.5, known: false };
}
const pickVal = pk => { const x = pickIdx(pk); return 3 * Math.pow(.955, x.i) * (x.known ? 1 : .9); };
function pickUsed(pk) { const D = H().draft; return !!(D && D.yr === pk.yr && D.slots.some(s => s.rd === pk.rd && s.orig === pk.orig && s.pid != null)); }
function pickName(pk) {
  const x = pickIdx(pk), t = teamById(pk.orig), S = H().season;
  return `${pk.yr === 0 ? 'Opening draft' : S && pk.yr === S.n ? 'This year' : `After season ${pk.yr}`}, round ${pk.rd}${x.known ? ` (#${Math.round(x.i) + 1} overall)` : ''}${pk.orig !== pk.owner ? `, from ${t ? t.name : '?'}` : ''}`;
}
const picksOf = id => H().picks.filter(pk => pk.owner === id && !pickUsed(pk)).sort((a, b) => a.yr - b.yr || a.rd - b.rd || pickIdx(a).i - pickIdx(b).i);
function makePicks(yr) {
  const st = H();
  ['you'].concat(st.league.map(t => t.id)).forEach(id => { for (let rd = 1; rd <= ((C.draft || {}).rounds || 7); rd++) if (!st.picks.some(p => p.yr === yr && p.rd === rd && p.orig === id)) st.picks.push({ yr, rd, orig: id, owner: id }); });
}

/* ---------------- teams, league, season ---------------- */
const myHex = () => (COLOR[H().team.color] || C.colors[0]).hex;
const you = () => ({ id: 'you', name: H().team.name, color: myHex(), roster: H().roster, bench: H().bench, style: null });
const teamById = id => id === 'you' ? you() : H().league.find(t => t.id === id) || null;
function makeLeague(used) {
  const names = shuffle(C.teams).slice(0, 7), cols = shuffle(C.teamColors);
  const offs = shuffle(Object.keys(C.offStyles)), defs = shuffle(Object.keys(C.defStyles));
  const [lo, hi] = C.startRange || [50, 62];
  return names.map((name, i) => ({ id: 'a' + i, name, color: cols[i % cols.length], style: { off: offs[i % offs.length], def: defs[(i + 1) % defs.length] }, roster: makeRoster(ri(lo, hi), used, true), bench: [] }));
}
function roundRobin(ids) {
  const a = ids.slice(), n = a.length, weeks = [];
  for (let w = 0; w < n - 1; w++) {
    const gm = []; for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; gm.push(w % 2 ? [y, x] : [x, y]); }
    weeks.push(gm); a.splice(1, 0, a.pop());
  }
  return shuffle(weeks);
}
function newSeason() {
  const st = H(), n = (st.season ? st.season.n : 0) + 1;
  /* everyone heals over the off-season, and anyone still at training camp comes back */
  if (st.roster) { const back = campTick(true); back.forEach(([p]) => { if (!SLOTS.some(s => st.roster[s] === p)) fillYou([p]); }); back.forEach(campToast); }
  if (st.roster) { allOf(you()).forEach(p => { delete p.inj; }); st.league.forEach(t => { allOf(t).forEach(p => { delete p.inj; }); bestLineup(t); }); }
  st.season = { n, wk: 0, sched: roundRobin(['you'].concat(shuffle(st.league.map(t => t.id)))), res: [], po: null, done: false, champ: null, grow: 0 };
}
function newMarket() {
  const used = usedNames(), pool = C.slots.map(s => s[1]);
  H().market = Array.from({ length: M.size || 6 }, () => makePlayer(pickM(pool), ri(55, 65) + (Math.random() < .4 ? ri(4, 13) : 0), used, new Set()));
}
function ensure() {
  const st = H();
  if (!st.started) {
    st.started = true; st.nextPid = 1; st.live = null; st.over = null; st.last = null; st.hist = [];
    const used = new Set();
    const [lo, hi] = C.startRange || [50, 62];
    st.roster = makeRoster(ri(lo, hi), used, true);
    st.league = makeLeague(used); st.chem = C.chemStart || 50; st.season = null; st.market = [];
    st.bench = []; st.picks = []; st.draft = null;
    newSeason(); makePicks(0); makePicks(1); makePicks(2); newMarket(); openingDraft(); api.save();
  }
  /* saves from before the draft existed */
  if (!st.picks.length) { const n = st.season.n; makePicks(n); makePicks(n + 1); api.save(); }
  if (st.season.done && !st.draft) { buildDraft(); api.save(); }
}
function standings() {
  const S = H().season, tb = {};
  ['you'].concat(H().league.map(t => t.id)).forEach(id => { tb[id] = { id, w: 0, l: 0, t: 0, pf: 0, pa: 0 }; });
  (S ? S.res : []).forEach(g => {
    const A = tb[g.a], B = tb[g.b]; if (!A || !B) return;
    A.pf += g.sa; A.pa += g.sb; B.pf += g.sb; B.pa += g.sa;
    if (g.sa > g.sb) { A.w++; B.l++; } else if (g.sa < g.sb) { B.w++; A.l++; } else { A.t++; B.t++; }
  });
  return Object.values(tb).sort((x, y) => (y.w + y.t / 2) - (x.w + x.t / 2) || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf);
}
const SCORES = [0, 3, 6, 7, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31, 34, 35, 38, 41, 42];
function quickGame(x, y) {
  const str_ = id => { const t = teamById(id); return teamOvr(t.roster) + (id === 'you' ? chemMod(H().chem) : 0); };
  const p = 1 / (1 + Math.exp(-(str_(x) - str_(y)) / 4));
  const hi = pickM(SCORES.slice(6)), lo = pickM(SCORES.filter(s => s < hi));
  return Math.random() < p ? [hi, lo] : [lo, hi];
}
function yourNext() {
  const S = H().season; if (!S || S.done) return null;
  if (!S.po) {
    const wk = S.sched[S.wk]; if (!wk) return null;
    const m = wk.find(m => m.includes('you'));
    return { kind: 'reg', wk: S.wk, opp: m[0] === 'you' ? m[1] : m[0], label: `Week ${S.wk + 1} of ${S.sched.length}` };
  }
  const po = S.po, si = po.semi.findIndex(m => m.w == null && (m.a === 'you' || m.b === 'you'));
  if (si >= 0) { const m = po.semi[si]; return { kind: 'po', round: 'semi', i: si, opp: m.a === 'you' ? m.b : m.a, label: 'Playoff semifinal' }; }
  const f = po.fin;
  if (f && f.w == null && (f.a === 'you' || f.b === 'you')) return { kind: 'po', round: 'fin', opp: f.a === 'you' ? f.b : f.a, label: 'Championship game' };
  return null;
}
function simPO(m) { const g = quickGame(m.a, m.b); m.sa = g[0]; m.sb = g[1]; m.w = g[0] > g[1] ? m.a : m.b; }
function startPlayoffs() {
  const S = H().season, top = standings().slice(0, C.playoffTeams || 4).map(x => x.id);
  S.po = { seeds: top, semi: [{ a: top[0], b: top[3] }, { a: top[1], b: top[2] }], fin: null };
  advancePlayoffs();
}
function advancePlayoffs() {
  const S = H().season, po = S.po;
  po.semi.forEach(m => { if (m.w == null && m.a !== 'you' && m.b !== 'you') simPO(m); });
  if (!po.fin && po.semi.every(m => m.w)) po.fin = { a: po.semi[0].w, b: po.semi[1].w };
  if (po.fin && po.fin.w == null && po.fin.a !== 'you' && po.fin.b !== 'you') simPO(po.fin);
  if (po.fin && po.fin.w) endSeason(po.fin.w);
}
/* a week passes for the AI teams: injuries heal, and now and then someone gets hurt
   (the team you just played had its injuries happen for real, in your game) */
function aiWeek(skip) {
  H().league.forEach(t => {
    let ch = healTick(allOf(t)).length > 0;
    if (t.id !== skip && Math.random() < (INJ.aiWeekly != null ? INJ.aiWeekly : .3)) {
      const p = t.roster[pickM(SLOTS.filter(s => s !== 'K'))]; if (!p.inj) { p.inj = rollInjury(); ch = true; }
    }
    if (ch) bestLineup(t);
  });
}
function recordResult(nx, sa, sb) {
  const S = H().season;
  aiWeek(nx.opp);
  if (nx.kind === 'reg') {
    S.res.push({ wk: nx.wk, a: 'you', b: nx.opp, sa, sb });
    S.sched[nx.wk].forEach(([x, y]) => { if (x === 'you' || y === 'you') return; const g = quickGame(x, y); S.res.push({ wk: nx.wk, a: x, b: y, sa: g[0], sb: g[1] }); });
    S.wk++;
    H().league.forEach(t => { SLOTS.forEach(s => giveXp(t.roster[s], C.aiXpPerGame || 20)); t.bench.forEach(p => giveXp(p, (C.aiXpPerGame || 20) / 4)); });
    if (S.wk >= S.sched.length) startPlayoffs();
  } else {
    const m = nx.round === 'semi' ? S.po.semi[nx.i] : S.po.fin;
    const youA = m.a === 'you';
    m.sa = youA ? sa : sb; m.sb = youA ? sb : sa; m.w = sa > sb ? 'you' : nx.opp;
    advancePlayoffs();
  }
}
function endSeason(champ) {
  const st = H(), S = st.season; if (S.done) return;
  S.done = true; S.champ = champ;
  const me = standings().find(x => x.id === 'you'), made = S.po && S.po.seeds.includes('you');
  if (champ === 'you') { bump('titles'); api.earn((C.pay || {}).title || 200); }
  bump('seasons');
  /* the locker room: a happy team grows over the off-season, a miserable one shrinks */
  const g = Math.round((st.chem - 50) / (C.seasonGrowDiv || 10));
  S.grow = g;
  if (g) allOf(you()).forEach(p => { POS[p.pos].ab.forEach(k => { p.ab[k] = clamp(p.ab[k] + g, 25, 99); }); });
  st.league.forEach(t => allOf(t).forEach(p => { const d = ri(-1, 2); POS[p.pos].ab.forEach(k => { p.ab[k] = clamp(p.ab[k] + d, 25, 99); }); }));
  const grew = allOf(you()).filter(p => potGrow(p) > 0);
  st.league.forEach(t => { allOf(t).forEach(potGrow); bestLineup(t); });
  buildDraft();
  if (me.w < (C.hotSeatWins || 2)) bump('hot'); else st.stats.hot = 0;
  const champT = teamById(champ);
  st.hist.push({ n: S.n, w: me.w, l: me.l, t: me.t, po: !!made, champ: champ === 'you', champName: champT ? champT.name : '', grow: g });
  if (stat('hot') >= 2) st.over = { why: 'fired', seasons: stat('seasons'), titles: stat('titles'), w: stat('w'), l: stat('l'), t: stat('t') };
  ANIM.after.push(() => {
    api.toast(champ === 'you' ? `<b>🏆 CHAMPIONS!</b><small>Season ${S.n} is yours. +${money((C.pay || {}).title || 200)}</small>` : `Season ${S.n} is over<small>Champions: ${h(champT ? champT.name : '')}</small>`, champ === 'you' ? 'rank' : 'note');
    if (g) api.toast(g > 0 ? `Off-season: your happy locker room trained hard. Every player +${g}.` : `Off-season: bad chemistry. Every player ${g}.`, g > 0 ? 'cash' : 'note');
    if (grew.length) api.toast(`Young players developing: ${h(grew.map(p => p.name).join(', '))}.`, 'rank');
    if (!st.over) api.toast('The draft is on! Head to the <b>Draft</b> tab.', 'rank');
    if (st.over) api.toast('<b>Two terrible seasons in a row. The owner has fired you.</b>', 'note');
    else if (stat('hot') === 1) api.toast('The owner is not happy. Another season like that and you’re gone.', 'note');
  });
}
function nextSeason() {
  const st = H(); if (st.live && st.live.done) closeGame();
  if (!st.season || !st.season.done || st.over || st.live || (st.draft && !st.draft.done)) return;
  st.draft = null; newSeason(); newMarket(); api.save();
}

/* ---------------- the draft ---------------- */
const DR = C.draft || {};
/* NFL order: teams that missed the playoffs (worst first), then playoff teams
   by how early they went out; the runner-up picks second to last, the champion last */
function draftOrder() {
  const S = H().season, tab = standings(), po = S.po, rank = id => tab.findIndex(x => x.id === id);
  const seeds = po ? po.seeds : [];
  const non = tab.filter(x => !seeds.includes(x.id)).map(x => x.id).reverse();
  const semiL = po ? po.semi.map(m => m.w === m.a ? m.b : m.a).sort((a, b) => rank(b) - rank(a)) : [];
  const fin = po && po.fin ? [po.fin.w === po.fin.a ? po.fin.b : po.fin.a, po.fin.w] : [];
  return non.concat(semiL, fin);
}
const boardVal = p => p.so + .5 * (p.sp - p.so);
const potGrade = v => v >= 86 ? 'A+' : v >= 82 ? 'A' : v >= 78 ? 'B+' : v >= 74 ? 'B' : v >= 70 ? 'C+' : v >= 66 ? 'C' : 'D';
function makeClass(yr, size, boost) {
  const n = size || DR.poolSize || 72, used = usedNames(), pool = C.slots.map(s => s[1]), out = [];
  for (let i = 0; i < n; i++) {
    const q = Math.pow(1 - i / n, 1.3), pos = pickM(pool);
    const o = clamp(Math.round(46 + (boost || 0) + 22 * q + gauss(Math.random) * 3), 40, 80);
    const pot = clamp(Math.round(o + 4 + 14 * q * Math.random() + 7 * Math.random()), o + 1, 94);
    const p = makePlayer(pos, o, used, new Set());
    p.pot = pot; p.rk = yr; p.col = pickM(DR.colleges || ['State']);
    /* what your scouts think: close, not exact */
    p.so = clamp(Math.round(o + gauss(Math.random) * (DR.scoutOvr || 3)), 35, 90);
    p.sp = Math.max(p.so + 1, clamp(Math.round(pot + gauss(Math.random) * (DR.scoutPot || 4)), 40, 97));
    out.push(p);
  }
  return out.sort((a, b) => boardVal(b) - boardVal(a));
}
/* before season 1: every team drafts, weakest team (by power ranking) first */
function powerOrder() { return shuffle(['you'].concat(H().league.map(t => t.id))).sort((a, b) => teamOvr(teamById(a).roster) - teamOvr(teamById(b).roster)); }
function openingDraft() {
  const st = H(), order = powerOrder(), OD = C.openingDraft || {};
  const slots = [];
  for (let rd = 1; rd <= (DR.rounds || 7); rd++) order.forEach((orig, i) => slots.push({ rd, i: i + 1, orig, pid: null }));
  st.draft = { yr: 0, order, slots, cur: 0, pool: makeClass(0, OD.poolSize || 90, OD.boost || 3), done: false, log: [] };
}
function buildDraft() {
  const st = H(), S = st.season, yr = S.n, order = draftOrder();
  makePicks(yr); makePicks(yr + 1); makePicks(yr + 2);
  const slots = [];
  for (let rd = 1; rd <= (DR.rounds || 7); rd++) order.forEach((orig, i) => slots.push({ rd, i: i + 1, orig, pid: null }));
  st.draft = { yr, order, slots, cur: 0, pool: makeClass(yr), done: false, log: [] };
}
const slotOwner = sl => { const D = H().draft, pk = H().picks.find(p => p.yr === D.yr && p.rd === sl.rd && p.orig === sl.orig); return pk ? pk.owner : sl.orig; };
const onClock = () => { const D = H().draft; return D && !D.done ? D.slots[D.cur] : null; };
/* an AI team picks: its own (imperfect) read of the board plus what it needs */
function aiChoose(t) {
  const D = H().draft;
  let best = null, bv = -1e9;
  D.pool.forEach(p => {
    const weak = Math.min(...SLOTS.filter(s => SPOS[s] === p.pos).map(s => ovr(t.roster[s])));
    const v = boardVal(p) + gauss(Math.random) * 2.5 + (p.so > weak ? 4 : 0) + (p.pos === 'QB' ? 2 : p.pos === 'K' ? -6 : 0);
    if (v > bv) { bv = v; best = p; }
  });
  return best;
}
function draftOne(p) {
  const st = H(), D = st.draft, sl = D.slots[D.cur], who = slotOwner(sl);
  D.pool = D.pool.filter(x => x !== p); sl.pid = p.id;
  D.log.push({ n: D.cur + 1, rd: sl.rd, i: sl.i, team: who, name: p.name, pos: p.pos, col: p.col, so: p.so, sp: p.sp, o: baseOvr(p), pot: p.pot });
  const keep = { id: p.id, name: p.name, num: p.num, pos: p.pos, ab: p.ab, lvl: 1, px: 0, pot: p.pot, rk: p.rk, col: p.col };
  if (who === 'you') {
    if (st.bench.length >= benchMax()) {
      /* never someone away at training camp, unless that's everybody */
      const low = l => l.slice().sort((a, b) => pVal(a) - pVal(b))[0], cut = low(st.bench.filter(x => !x.camp)) || low(st.bench), back = releasePay(cut);
      st.bench = st.bench.filter(x => x !== cut); G().cash += back;
      api.toast(`Bench full: ${h(cut.name)} was released to make room (+${money(back)}).`, 'note');
    }
    st.bench.push(keep); fillYou([keep]);
    api.toast(`You drafted <b>${h(p.name)}</b> (${p.pos}, ${h(p.col)}). Real ratings: ${baseOvr(p)} overall, ${p.pot} potential.`, 'rank');
  } else { const t = teamById(who); t.bench.push(keep); bestLineup(t); }
  D.cur++;
  if (D.cur >= D.slots.length) finishDraft();
}
function finishDraft() {
  const st = H(), D = st.draft; D.done = true;
  st.picks = st.picks.filter(p => p.yr !== D.yr);
  makePicks(D.yr + 1); makePicks(D.yr + 2);
  /* the best players nobody drafted try out as free agents */
  D.pool.slice(0, 3).forEach(p => { st.market.push({ id: p.id, name: p.name, num: p.num, pos: p.pos, ab: p.ab, lvl: 1, px: 0, pot: p.pot, rk: p.rk, col: p.col }); });
  D.pool = [];
}
/* AI teams pick until it's your turn (or, with toEnd, your picks go best-available too) */
function draftRun(toEnd) {
  const D = H().draft; if (!D || D.done) return;
  let guard = 0;
  while (!D.done && guard++ < 200) {
    const who = slotOwner(onClock());
    if (who === 'you') { if (!toEnd) return; draftOne(aiChoose(you())); }
    else draftOne(aiChoose(teamById(who)));
  }
}

/* ---------------- trades ---------------- */
const TR = C.trade || {};
function tradeCheck(t, give, get, gp, tp) {
  const away = give.filter(p => p.camp);
  if (away.length) return { bad: `${away.map(p => p.name).join(', ')} ${away.length > 1 ? 'are' : 'is'} away at training camp and can’t be traded until ${away.length > 1 ? 'they’re' : 'he’s'} back.` };
  const mine = allOf(you()).filter(p => !give.includes(p)).concat(get), theirs = allOf(t).filter(p => !get.includes(p)).concat(give);
  if (!canField(mine)) return { bad: `You’d have no starter at ${shortOf(mine).join(', ')}. Get one back in the deal.` };
  if (!canField(theirs)) return { bad: `${t.name} would have no starter at ${shortOf(theirs).join(', ')}. Send them one back.` };
  if (mine.length - SLOTS.length > benchMax()) return { bad: `Your bench only holds ${benchMax()}. Release someone first, or send more players.` };
  const giveV = get.reduce((a, p) => a + pVal(p, t), 0) + tp.reduce((a, pk) => a + pickVal(pk), 0);
  const getV = give.reduce((a, p) => a + pVal(p, t), 0) + gp.reduce((a, pk) => a + pickVal(pk), 0) + HV.tr.dr / (TR.drPerUnit || 40);
  return { giveV, getV, ok: getV >= giveV * (TR.edge || 1.06) && (get.length + give.length + gp.length + tp.length) > 0 };
}
function trade() {
  const st = H(), tr = HV.tr, t = teamById(tr.team); if (!t) return;
  if (st.live && !st.live.done) { tr.msg = { ok: false, text: 'No trades during a game.' }; return; }
  const give = allOf(you()).filter(p => tr.give.includes(p.id)), get = allOf(t).filter(p => tr.get.includes(p.id));
  const gp = picksOf('you').filter(pk => tr.gp.includes(pkKey(pk))), tp = picksOf(t.id).filter(pk => tr.tp.includes(pkKey(pk)));
  if (G().cash < tr.dr) { tr.msg = { ok: false, text: 'You don’t have that much cash.' }; return; }
  const c = tradeCheck(t, give, get, gp, tp);
  if (c.bad) { tr.msg = { ok: false, text: c.bad }; return; }
  if (!c.ok) {
    const need = Math.ceil((c.giveV * (TR.edge || 1.06) - c.getV) * (TR.drPerUnit || 40)) + tr.dr;
    const sw = (TR.sweeteners || []).find(v => v >= need && v <= G().cash);
    tr.msg = { ok: false, text: `${t.name} say no. ${sw ? `Make the cash sweetener ${money(sw)}, or add more talent or picks, and they’d take it.` : 'You’re asking for a lot more than you’re giving.'} Players who’d only be backups for them are worth less to them.` };
    return;
  }
  st.roster = Object.fromEntries(SLOTS.map(s => [s, give.includes(st.roster[s]) ? null : st.roster[s]]));
  st.bench = st.bench.filter(p => !give.includes(p)).concat(get);
  setLineup(t, allOf(t).filter(p => !get.includes(p)).concat(give));
  fillYou(get);
  gp.forEach(pk => { pk.owner = t.id; }); tp.forEach(pk => { pk.owner = 'you'; });
  G().cash -= tr.dr;
  const what = a => a.length ? a.join(', ') : 'nothing';
  tr.msg = { ok: true, text: `Deal! You get ${what(get.map(p => p.name).concat(tp.map(pickName)))}. ${t.name} get ${what(give.map(p => p.name).concat(gp.map(pickName)).concat(tr.dr ? [money(tr.dr)] : []))}.` };
  tr.give = []; tr.get = []; tr.gp = []; tr.tp = []; tr.dr = 0;
  api.save();
}
/* =====================================================================
   THE FOOTBALL
   A game state S has: T (both teams' ratings), poss (0 = you), ball
   (yards from the offense's own goal line), down, togo, runs (rushing
   so far, for play-action). resolve() plays one snap and never changes
   S; trans() says what that snap does to the drive.
   ===================================================================== */
const COVER = { WR1: 'CB1', WR2: 'CB2', WR3: 'S', TE: 'LB1', RB1: 'LB2', RB2: 'LB2', QB: 'LB1' };
function abOf(P, s, k) { const x = P[s]; if (!x) return 60; if (x.ab[k] != null) return x.ab[k]; return avg(Object.values(x.ab)); }
/* the matchup on a play: the offense's number against the defense's */
function comp(id, slot, oP, dP) {
  const g = abOf, cov = COVER[slot] || 'LB1';
  switch (baseOf(id)) {
    case 'dive': return { off: g(oP, slot, 'pow') * .6 + g(oP, slot, 'spd') * .2 + g(oP, 'TE', 'block') * .2, def: (g(dP, 'DL1', 'runD') + g(dP, 'DL2', 'runD')) * .3 + g(dP, 'LB1', 'runD') * .4, dslot: 'LB1' };
    case 'sweep': return { off: g(oP, slot, 'spd') * .7 + g(oP, 'TE', 'block') * .3, def: g(dP, 'LB2', 'runD') * .4 + g(dP, 'S', 'tackle') * .3 + (g(dP, 'CB1', 'spd') + g(dP, 'CB2', 'spd')) * .15, dslot: 'LB2' };
    case 'sneak': return { off: g(oP, 'QB', 'mob') * .5 + g(oP, 'TE', 'block') * .5, def: (g(dP, 'DL1', 'runD') + g(dP, 'DL2', 'runD')) / 2, dslot: 'DL1' };
    case 'slant': return { off: g(oP, slot, 'route') * .5 + g(oP, slot, 'hands') * .2 + g(oP, 'QB', 'acc') * .3, def: g(dP, cov, 'cover') * .7 + g(dP, cov, 'spd') * .3, dslot: cov };
    case 'screen': return { off: g(oP, slot, 'spd') * .5 + g(oP, slot, 'hands') * .3 + g(oP, 'QB', 'acc') * .2, def: g(dP, 'LB2', 'cover') * .5 + g(dP, 'LB1', 'tackle') * .5, dslot: 'LB2' };
    case 'seam': return { off: g(oP, 'TE', 'route') * .5 + g(oP, 'TE', 'hands') * .3 + g(oP, 'QB', 'acc') * .2, def: g(dP, 'LB1', 'cover') * .6 + g(dP, 'S', 'cover') * .4, dslot: 'LB1' };
    default: return { off: g(oP, slot, slot === 'TE' ? 'route' : 'spd') * .4 + g(oP, slot, 'hands') * .2 + g(oP, 'QB', 'arm') * .4, def: g(dP, cov, 'cover') * .5 + g(dP, 'S', 'cover') * .3 + g(dP, cov, 'spd') * .2, dslot: cov };
  }
}
function gauss(R) { let u = 0; while (!u) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); }
const RUNS = { dive: [3.6, 2.6], sweep: [3.3, 4.4], sneak: [1.6, 1.2] };
const SACK = { slant: .03, screen: .015, seam: .05, bomb: .085, pa: .07 };
/* a field goal: is it straight enough (accuracy), and does it have the leg (power past his range) */
const fgAim = (k, dist) => 1 - Math.max(0, dist - 25) * .013 + (k.kacc - 60) / 160;
const fgRange = k => 50 + (k.kpow - 60) / 3;
const fgLegs = (k, dist) => dist > fgRange(k) ? Math.max(.08, 1 - (dist - fgRange(k)) * .12) : 1;
function fgChance(k, dist) { return clamp(fgAim(k, dist) * fgLegs(k, dist), .02, .99); }
function yac(id, A, R) {
  id = baseOf(id);
  const big = (p, a, b) => R() < Math.max(0, p) ? a + Math.floor(R() * (b - a)) : 0;
  if (id === 'slant') return Math.max(0, Math.round(1.5 + 1.5 * A + gauss(R) * 3)) + big(.04 + .02 * A, 10, 40);
  if (id === 'screen') return Math.round(4 + 1.8 * A + gauss(R) * 4.5) + big(.06 + .03 * A, 10, 40);
  if (id === 'seam') return Math.max(0, Math.round(2 + A + gauss(R) * 3)) + big(.05 + .02 * A, 10, 30);
  return Math.round(R() * 8) + big(.12 + .04 * A, 10, 40);
}
function resolve(S, O, D, R) {
  const off = S.poss, oP = S.T[off].P, dP = S.T[1 - off].P, b = S.ball, toGoal = 100 - b;
  if (O.kind === 'fg') {
    const dist = toGoal + 17, p = fgChance(oP.K.ab, dist), rc = STC[D] ? D : aiStCall(S, 'fg'), B = (C.st || {}).fgBlock || [.015, .06];
    if (R() < B[rc === 'fgBlk' ? 1 : 0]) return { kind: 'fg', dist, p, good: false, blk: true, rc, dslot: pickM(['DL1', 'DL2']), ret: R() < .12 ? 100 : Math.floor(R() * 9), clock: 6 };
    if (O.aim) { const k = kickOutcome(oP.K.ab, dist, O.aim, R); return { kind: 'fg', dist, p, good: k.how === 'good', how: k.how, short: k.how === 'short', missY: kickY(k, O.aim), rc, clock: 6 }; }
    return { kind: 'fg', dist, p, good: R() < p, rc, clock: 6 };
  }
  if (O.kind === 'punt') return puntResolve(S, oP, STC[D] ? D : aiStCall(S, 'punt'), R);
  if (O.kind === 'fakepunt' || O.kind === 'fakefg') return fakeResolve(S, O.kind, STC[D] ? D : aiStCall(S, O.kind === 'fakefg' ? 'fg' : 'punt'), R);
  const pid = O.id, PL = PLAY[pid] || {}, id = baseOf(pid), slot = O.slot, cm = comp(pid, slot, oP, dP), DB = dbase(D);
  let m = (MX[pid] || {})[D] || 0;
  /* a sell-out call (your defense, 3rd/4th and short): the matrix swing is doubled, for you or against you */
  if (O.vsSell) { const SL = C.defCalls.sell, sw = SL.mult * Math.max(Math.abs(m), SL.minSwing); m = sellRight(O) ? -sw : sw; }
  let A = m + clamp((cm.off - cm.def) / 8, -2.5, 2.5) + gauss(R) * .3;
  if (id === 'pa') { const ru = S.runs[off]; A += ru.n >= 3 && ru.y / ru.n >= 4 ? .8 : ru.n < 2 ? -.4 : 0; }
  const r = { kind: 'run', id: pid, slot, dslot: cm.dslot, yards: 0, clock: 0, lane: 26.6 };
  if (RUNS[id]) {
    const [m, sd] = RUNS[id];
    let y = m + (PL.y || 0) + 1.6 * A + gauss(R) * sd * (PL.sd || 1);
    if ((id !== 'sneak' || PL.big) && R() < Math.max(0, .03 + .025 * A) * (id === 'sweep' ? 1.4 : 1)) { r.y0 = Math.round(y); y += 8 + R() * 35; r.big = true; }
    r.yards = Math.max(-6, Math.round(y));
    r.lane = id === 'sweep' ? 26.6 + (R() < .5 ? -1 : 1) * (12 + R() * 8) : id === 'sneak' ? 26.6 : clamp(26.6 + gauss(R) * 3, 18, 35);
    const tk = R();
    r.dslot = r.big ? (R() < .5 ? 'S' : R() < .5 ? 'CB1' : 'CB2') : tk < .45 ? 'LB1' : tk < .7 ? 'LB2' : tk < .85 ? 'DL1' : 'DL2';
    if (R() < clamp(.013 - .003 * A, .004, .03)) { r.to = 'fum'; r.yards = Math.min(r.yards, toGoal - 1); r.toAt = r.yards; r.ret = Math.floor(R() * 5); }
    r.oob = id === 'sweep' && R() < .35;
  } else {
    r.kind = 'pass';
    const rush = (abOf(dP, 'DL1', 'rush') + abOf(dP, 'DL2', 'rush')) / 2, prot = 30 + abOf(oP, 'TE', 'block') * .25 + abOf(oP, 'QB', 'mob') * .25;
    const quick = id === 'slant' || id === 'screen';
    const sackP = clamp(SACK[id] + (PL.sack || 0) + ((DEFC[D] || {}).sack || 0) + (DB === 'blitz' ? (quick ? .015 : .08) : DB === 'stack' ? .02 : DB === 'prevent' ? -.02 : 0) + (rush - prot) / 350, .005, .35);
    if (R() < sackP) {
      r.sack = true; r.yards = -(4 + Math.floor(R() * 6)); r.dslot = R() < .7 ? (R() < .5 ? 'DL1' : 'DL2') : 'LB1';
      if (R() < .08) { r.to = 'fum'; r.toAt = r.yards; r.ret = 0; }
    } else {
      const cov = COVER[slot] || 'LB1', defBall = dP[cov] && dP[cov].ab.ball != null ? dP[cov].ab.ball : abOf(dP, 'S', 'ball');
      /* open or covered? that decides almost everything about the throw */
      const CV = C.coverage || {}, deep = id === 'bomb' || id === 'pa';
      r.open = R() < clamp(((CV.openBase || {})[id] || .6) + (PL.open || 0) + (CV.perEdge || .15) * A, .05, .95);
      const Z = (r.open ? CV.open : CV.covered) || {};
      const intP = r.open ? clamp((Z.int || .005) + (defBall - abOf(oP, 'QB', 'iq')) / 4000, .001, .03)
        : clamp((deep ? Z.deepInt || .2 : Z.int || .15) + (defBall - abOf(oP, 'QB', 'iq')) / 300, .05, .4);
      const compP = clamp((deep ? Z.deepComp || .5 : Z.comp || .5) + (abOf(oP, 'QB', 'acc') - 60) / 400, .05, .97);
      let air = (id === 'slant' ? 5 + R() * 5 : id === 'screen' ? -1 - R() * 2 : id === 'seam' ? 9 + R() * 7 : (id === 'bomb' ? 22 : 18) + R() * 20 + 3 * A) + (id === 'screen' ? 0 : PL.y || 0);
      air = Math.round(Math.min(Math.max(air, id === 'screen' ? -3 : 3), toGoal));
      r.catchD = air; r.dslot = cov;
      const x = R();
      if (x < intP) { r.to = 'int'; r.toAt = air; r.ret = R() < .07 ? 100 : Math.round(R() * R() * 25); r.dslot = R() < .7 ? cov : 'S'; }
      else if (R() < compP) { r.comp = true; r.yards = air + yac(id, A, R); r.oob = R() < (id === 'slant' ? .2 : .15); }
      else { r.inc = true; r.yards = 0; }
    }
  }
  if (!r.to && r.yards >= toGoal) { r.yards = toGoal; r.td = true; }
  r.clock = r.inc ? 5 : r.oob ? 7 : r.sack ? 30 : r.td ? 6 : r.to ? 8 : 27 + Math.floor(R() * 13);
  return r;
}
function trans(S, r) {
  const b = S.ball, p = r.pen;
  if (r.kind === 'fg') {
    if (r.blk) return r.ret >= 100 ? { k: 'deftd' } : { k: 'to', nb: clamp(107 - b + r.ret, 1, 99) };
    return r.good ? { k: 'fg' } : { k: 'fgmiss', nb: Math.max(20, 107 - b) };
  }
  if (r.kind === 'punt') {
    if (r.rough) return { k: 'first', nb: clamp(b + p.yards, 1, 99) };
    if (r.blk) { const at = b + r.spot; return r.ret >= 100 || at <= 0 ? { k: 'deftd' } : { k: 'to', nb: clamp(100 - at + r.ret, 1, 99) }; }
    if (r.muff) return { k: 'first', nb: clamp(r.at, 1, 99) };
    if (r.rtd) return { k: 'deftd' };
    return { k: 'punt', nb: r.tb ? 20 : Math.max(1, 100 - r.land) };
  }
  if (p && p.replace) {
    const nb = clamp(b + p.yards, 1, 99);
    if (p.auto) return { k: 'first', nb };
    const togo = S.togo - (nb - b);
    return togo <= 0 ? { k: 'first', nb } : { k: 'same', nb, togo };
  }
  if (r.to) {
    const raw = b + r.toAt;
    if (raw >= 100) return r.ret >= 100 ? { k: 'deftd' } : { k: 'to', nb: 20 };
    const db = 100 - clamp(raw, 1, 99) + r.ret;
    return db >= 100 ? { k: 'deftd' } : { k: 'to', nb: db };
  }
  let nb = b + r.yards;
  if (nb >= 100) return { k: 'td' };
  if (nb <= 0) return { k: 'safety' };
  if (p && p.add) { nb = Math.min(99, nb + Math.min(15, Math.floor((100 - nb) / 2))); return { k: 'first', nb }; }
  if (r.yards >= S.togo) return { k: 'first', nb };
  if (S.down >= 4) return { k: 'downs', nb: 100 - nb };
  return { k: 'next', nb, down: S.down + 1, togo: S.togo - r.yards };
}
/* ---------------- special teams ---------------- */
/* the calls: kickoffs (yours), kick returns, punt returns and field-goal defense (theirs) */
const STC = {
  deep:   { name: 'Deep kick', what: 'Boom it. Often a touchback (they start at the 25); otherwise they bring it out, usually into the 20s.' },
  squib:  { name: 'Squib kick', what: 'A low bouncer that’s hard to return for big yards, but they start further up, around their 30.' },
  onside: { name: 'Onside kick', what: 'Kick it 10 yards and fight for it. About 1 in 3 if they aren’t expecting it, far less against their hands team. Lose it and they start near midfield.' },
  koRet:  { name: 'Return it', what: 'Bring it out. Usually to the 20s, now and then a long one; small fumble risk.' },
  koFc:   { name: 'Fair catch', what: 'No return, no risk. On a deep kick you start at the 25; on a squib, wherever you field it.' },
  koHands: { name: 'Hands team', what: 'Your surest hands up front in case of an onside kick. Shorter returns if they kick it deep.' },
  ptRet:  { name: 'Return it', what: 'Set up a return: usually 5–10 yards, sometimes a long one. Small chance of a muff.' },
  ptFc:   { name: 'Fair catch', what: 'Take it where it lands. No return, almost no risk.' },
  ptBlk:  { name: 'Block the punt', what: 'Everyone after the punter. A block is rare but huge. Almost no return otherwise, a fake punt is wide open, and you risk roughing the kicker.' },
  fgBlk:  { name: 'Block the kick', what: 'Overload the edge. A better chance to block it, but a fake works more often.' },
  fgSafe: { name: 'Play it safe', what: 'Normal rush, defenders stay home in case of a fake.' },
};
/* the AI's call when you kick: S is the game, kind 'punt' or 'fg' */
function aiStCall(S, kind) {
  if (kind === 'fg') return Math.random() < .3 ? 'fgBlk' : 'fgSafe';
  const fakeZone = S.togo <= 3 && S.ball >= 35 && S.ball <= 65;
  return wpick({ ptRet: .62, ptFc: fakeZone ? .33 : .26, ptBlk: fakeZone ? .05 : .12 });
}
/* punting team on its own b. Fields: gross (kick), at (where it comes down), ret, land (where the return ends) */
function puntResolve(S, oP, rc, R) {
  const T = C.st || {}, b = S.ball, r = { kind: 'punt', rc, ret: 0, clock: 8 };
  if (rc === 'ptBlk') {
    if (R() < (T.rough || .04)) r.rough = true, r.pen = { who: 1 - S.poss, line: 'roughKicker', name: 'Roughing the kicker', yards: Math.min(15, 99 - b), auto: true, replace: true };
    else if (R() < (T.puntBlock || .07)) { r.blk = true; r.spot = -(4 + Math.floor(R() * 8)); r.ret = R() < .15 ? 100 : Math.floor(R() * 6); r.dslot = pickM(['DL1', 'DL2']); return r; }
  }
  r.gross = Math.max(20, Math.round(44 + (oP.K.ab.kpow - 60) / 4 + gauss(R) * 6)); r.at = b + r.gross;
  if (r.at >= 100) { r.tb = true; r.land = 100; r.net = 80 - b; return r; }
  const PR = T.puntRet || [7, 6];
  if (R() < (rc === 'ptRet' ? .022 : .01)) r.muff = true;
  else if (rc === 'ptFc') r.fc = true;
  else {
    r.ret = Math.max(0, Math.round(rc === 'ptBlk' ? 2 + gauss(R) * 2 : PR[0] + gauss(R) * PR[1]));
    if (rc === 'ptRet' && R() < .03) r.ret += 20 + Math.floor(R() * 50);
  }
  r.land = r.at - r.ret; if (r.land <= 0) r.rtd = true;
  r.net = r.land - b;
  return r;
}
/* a fake punt (the punter keeps it) or fake field goal (the holder does): rc is the other team's call */
function fakeResolve(S, kind, rc, R) {
  const fg = kind === 'fakefg', F = ((C.st || {}).fake || {})[fg ? 'fg' : 'punt'] || {}, toGoal = 100 - S.ball;
  const r = { kind: 'run', id: kind, fake: fg ? 'fg' : 'punt', slot: fg ? 'QB' : 'K', rc, dslot: pickM(['LB1', 'LB2', 'CB1']), lane: clamp(26.6 + gauss(R) * 7, 6, 47) };
  r.made = R() < (F[rc] != null ? F[rc] : .4) * Math.pow((C.st || {}).fakeWise || .7, ((S.fakes || [])[S.poss]) || 0);
  r.yards = r.made ? Math.round(S.togo + Math.abs(gauss(R)) * 5 + (R() < .1 ? 15 + R() * 40 : 0)) : Math.min(S.togo - 1, Math.round((S.togo - 1) * R() - R() * 3));
  if (R() < .02) { r.to = 'fum'; r.made = false; r.toAt = Math.min(r.yards, toGoal - 1); r.ret = Math.floor(R() * 5); }
  if (!r.to && r.yards >= toGoal) { r.yards = toGoal; r.td = true; }
  r.clock = r.td ? 6 : 8 + Math.floor(R() * 20);
  return r;
}
/* a kickoff from the kicker's 35: kt deep | squib | onside, rc the receiving team's call.
   start: the receiving team's own yard line where it takes over; keep: the kicking team's, when it keeps the ball */
function koResolve(L, kicker, kt, rc) {
  const T = C.st || {}, k = L.T[kicker].P.K.ab, R = Math.random, r = { kt, rc, clock: 5 };
  if (kt === 'onside') {
    const O = T.onside || {}, p = clamp((rc === 'koHands' ? O.hands || .08 : O.surprise || .3) + (k.kacc - 60) / 400, .03, .6);
    r.at = 10 + Math.floor(R() * 4); r.clock = 4;
    if (R() < p) { r.rec = 'kick'; r.keep = 35 + r.at; } else { r.rec = 'ret'; r.start = 65 - r.at; }
    return r;
  }
  const RT = T.koRet || [21, 7];
  if (kt === 'deep') {
    r.at = Math.round(63 + (k.kpow - 60) / 5 + gauss(R) * 4);
    const landY = 65 - r.at;
    if (rc === 'koFc') { r.fc = true; r.start = 25; r.clock = 0; return r; }
    if (landY < 0 && R() < (T.tbDeep || .6)) { r.tb = true; r.start = 25; r.clock = 0; return r; }
    let ret = RT[0] * (rc === 'koHands' ? .8 : 1) + gauss(R) * RT[1];
    if (R() < (rc === 'koHands' ? .01 : .03)) ret += 25 + R() * 50;
    r.start = Math.round(Math.max(landY, -4) + Math.max(5, ret));
  } else {
    r.at = Math.round(47 + gauss(R) * 5);
    const ret = rc === 'koFc' ? 1 + R() * 3 : (rc === 'koHands' ? 9 : 12) + gauss(R) * 4 + (rc === 'koRet' && R() < .01 ? 25 + R() * 40 : 0);
    r.start = Math.round(65 - r.at + Math.max(0, ret));
  }
  if (r.start >= 100) { r.td = true; return r; }
  r.start = Math.max(1, r.start);
  if (rc !== 'koFc' && R() < (kt === 'squib' ? .025 : .012)) { r.fum = true; r.keep = 100 - r.start; }
  return r;
}
function aiKickType(L) {
  const lead = L.sc[1] - L.sc[0];
  if (L.q >= 4 && L.clk < 300 && lead < 0 && lead >= -16 && Math.random() < .85) return 'onside';
  if ((L.q === 2 || L.q === 4) && L.clk < 40) return 'squib';
  const x = Math.random(); return x < .02 ? 'onside' : x < .1 ? 'squib' : 'deep';
}
function aiRecvCall(L) {
  const lead = L.sc[1] - L.sc[0];
  if (L.q >= 4 && L.clk < 300 && lead > 0 && lead <= 16) return 'koHands';
  /* once you've tried an onside kick, they're ready for the next one */
  if (Math.random() < Math.min(.9, .45 * (L.onside || 0))) return 'koHands';
  return Math.random() < .8 ? 'koRet' : 'koFc';
}
/* the kicking team lines up: the next call is the kickoff */
function kickoff(L, kicker) { L.ko = { k: kicker }; L.poss = kicker; L.ball = 35; L.down = 1; L.togo = 10; }
function makeKoOpts(L) {
  L.seq = (L.seq || 0) + 1; L.ev = [];
  if (L.ko.k === 1 && !L.ko.kt) L.ko.kt = aiKickType(L);
  L.opts = (L.ko.k === 0 ? ['deep', 'squib', 'onside'] : ['koRet', 'koFc', 'koHands']).map(id => ({ kind: 'st', id }));
}
function makeKickOpts(L) {
  L.seq = (L.seq || 0) + 1; L.ev = [];
  L.opts = (L.kick.show === 'fg' ? ['fgBlk', 'fgSafe'] : ['ptRet', 'ptFc', 'ptBlk']).map(id => ({ kind: 'st', id }));
}
const snapOf = L => ({ sc: L.sc.slice(), q: L.q, clk: L.clk, down: L.down, togo: L.togo, ball: L.ball, poss: L.poss, log: L.log.length });
/* the kickoff, with your call: how you kick it, or how you return it */
function koCall(L, i) {
  const o = L.opts[i]; if (!o || !L.ko) return;
  const kicker = L.ko.k, rcv = 1 - kicker, mine = kicker === 0, KT = L.T[kicker], RT = L.T[rcv];
  L.pre = Object.assign(snapOf(L), { ko: kicker }); L.anims = []; L.recap = [];
  const kt = mine ? o.id : L.ko.kt, rc = mine ? aiRecvCall(L) : o.id, r = koResolve(L, kicker, kt, rc);
  if (mine && kt === 'onside') L.onside = (L.onside || 0) + 1;
  const v = { p: RT.P[pickM(['RB2', 'WR3'])].name, t: RT.name, o: KT.name };
  delete L.ko;
  let key, tm = rcv, win = null, lbl, out, endF;
  if (r.rec === 'kick') { L.poss = kicker; L.ball = r.keep; key = 'onsideGood'; tm = kicker; win = kicker; v.t = KT.name; lbl = 'ONSIDE RECOVERED!'; out = `Onside kick recovered by ${KT.name}`; endF = r.at; }
  else if (r.td) { L.poss = rcv; key = 'koTD'; win = rcv; lbl = 'KICK RETURN TD!'; out = 'Kickoff returned for a touchdown'; endF = -38; }
  else if (r.fum) { L.poss = kicker; L.ball = r.keep; key = 'koFumble'; tm = rcv; win = kicker; lbl = 'FUMBLE!'; out = `Fumble on the return, ${KT.name} recover`; endF = 65 - r.start; }
  else {
    L.poss = rcv; L.ball = r.start; v.n = r.start; endF = kt === 'onside' ? r.at : 65 - r.start;
    if (kt === 'onside') { key = 'onsideFail'; win = rcv; lbl = 'RECOVERED'; out = `Onside kick recovered by ${RT.name}, ball at the ${r.start}`; }
    else { key = r.tb ? 'kickTB' : r.fc ? 'koFC' : kt === 'squib' ? 'squib' : 'kickRet'; lbl = r.tb ? 'TOUCHBACK' : r.fc ? 'FAIR CATCH' : `TO THE ${r.start}`; out = r.tb ? 'Touchback, ball at the 25' : r.fc ? `Fair catch, ball at the ${r.start}` : kt === 'squib' ? `Squib kick ${rc === 'koFc' ? 'fielded' : 'returned'} to the ${r.start}` : `Returned to the ${r.start}`; }
  }
  say(L, key, tm, v);
  L.down = 1; L.togo = Math.min(10, 100 - L.ball);
  L.anims.push({ k: 'ko', off: kicker, los: absX(kicker, 35), dir: kicker === 0 ? 1 : -1, fd: null, b: 35, kt, at: r.at, endF, tb: !!r.tb, fc: !!r.fc, fum: !!r.fum, rec: r.rec || null, deftd: !!r.td, win: r.td ? null : win, lbl });
  if (r.clock) L.clk = Math.max(1, L.clk - r.clock);
  if (r.td) { L.sc[rcv] += 6; if (L.q >= 5) gameOver(L); else setPat(L, rcv); if (L.pat && L.pat.tm === 1) aiPat(L); }
  L.res = { side: kicker, st: true, mine: STC[o.id].name, theirs: STC[mine ? rc : kt].name, g: win === 0 ? 'stGood' : win === 1 ? 'stBad' : 'stOk', out, recap: null, inj: [] };
  prep(L);
  L.res.recap = L.recap; delete L.recap;
  if (L.over) settle(L);
}
/* they line up to punt or kick, and you made the special-teams call (they might be faking) */
function kickDefCall(L, i) {
  const o = L.opts[i], sp = L.kick; if (!o || !sp) return;
  delete L.kick;
  L.pre = snapOf(L); L.anims = []; L.recap = []; L.injNew = [];
  const out = runPlay(L, sp, o.id), A = L.anims[0] || {}, fake = !!A.fake;
  if (fake) (L.fakes = L.fakes || [0, 0])[1]++;   /* you'll be on alert for the next one */
  if (L.pat && L.pat.tm === 1) aiPat(L);
  const good = fake ? !(A.made || A.td) : A.blk || A.rtd, bad = fake ? A.made || A.td : A.muff || A.flag;
  L.res = { side: 1, st: true, mine: STC[o.id].name, theirs: fake ? `FAKE ${sp.show === 'fg' ? 'field goal' : 'punt'}!` : sp.show === 'fg' ? 'Field goal' : 'Punt', g: good ? 'stGood' : bad ? 'stBad' : 'stOk', out, recap: null, inj: L.injNew };
  delete L.injNew;
  prep(L);
  L.res.recap = L.recap; delete L.recap;
  if (L.over) settle(L);
}

/* what a snap is worth to the offense, in rough points */
const EP = b => .064 * b - 1.2;
const downPen = (d, t) => d <= 1 ? (t - 10) * .05 : d === 2 ? .25 + .08 * t : d === 3 ? .7 + .12 * t : 1.6 + .1 * t;
function valueOf(S, t) {
  switch (t.k) {
    case 'td': return 6.55;
    case 'deftd': return -6.6;
    case 'fg': return 2.6;
    case 'safety': return -3;
    case 'fgmiss': case 'punt': case 'to': case 'downs': return -EP(t.nb);
    case 'first': return EP(t.nb);
    case 'next': return EP(t.nb) - downPen(t.down, t.togo);
    case 'same': return EP(t.nb) - downPen(S.down, t.togo);
  }
  return 0;
}

/* ---------------- the AI coordinator ---------------- */
function wpick(w) {
  const ks = Object.keys(w), tot = ks.reduce((a, k) => a + Math.max(0, w[k]), 0);
  let x = Math.random() * tot;
  for (const k of ks) { x -= Math.max(0, w[k]); if (x <= 0) return k; }
  return ks[ks.length - 1];
}
/* the same draw as wpick, set up once for many draws from the same weights */
function wdraw(w) {
  const ks = Object.keys(w), cum = []; let tot = 0;
  ks.forEach(k => { tot += Math.max(0, w[k]); cum.push(tot); });
  return () => { const x = Math.random() * tot; for (let i = 0; i < ks.length; i++) if (x <= cum[i]) return ks[i]; return ks[ks.length - 1]; };
}
const norm1 = w => { const t = Object.values(w).reduce((a, b) => a + b, 0) || 1; const o = {}; Object.keys(w).forEach(k => { o[k] = w[k] / t; }); return o; };
/* the AI defense: its style, the situation, then countering what you've been calling */
/* a family weight is shared by every call in that family */
function spread(wb, ids, fam, mult) {
  const tot = {}, w = {};
  ids.forEach(id => { tot[fam(id)] = (tot[fam(id)] || 0) + mult(id); });
  ids.forEach(id => { w[id] = (wb[fam(id)] || 0) * mult(id) / (tot[fam(id)] || 1); });
  return w;
}
const famSum = (w, fam) => { const o = {}; Object.keys(w).forEach(k => { o[fam(k)] = (o[fam(k)] || 0) + w[k]; }); return o; };
function aiDefW(L, noAdapt) {
  const sty = C.defStyles[L.T[1].style.def] || C.defStyles.balanced, wb = Object.assign({}, sty.w);
  const long = L.down >= 3 && L.togo >= 7, short = L.togo <= 2, lead = L.sc[1] - L.sc[0];
  if (long) { wb.stack *= .35; wb.prevent *= 3; wb.cover2 *= 1.4; wb.blitz *= 1.3; }
  if (short) { wb.stack *= 2.2; wb.prevent *= .2; }
  if (L.q >= 4 && lead >= 9) wb.prevent *= 2.5;
  if (L.ball >= 88) wb.prevent *= .1;
  const w = spread(wb, DIDS, dbase, d => d === 'goal' ? (L.ball >= 90 || short ? 3 : .3) : 1);
  const rec = L.recO.slice(-8);
  if (!noAdapt && rec.length) DIDS.forEach(d => { let s = 0; rec.forEach(t => { s += (MX[t] || {})[d] || 0; }); w[d] *= Math.exp(-(C.aiAdapt || .6) * s / rec.length); });
  return w;
}
function aiOffW(L, noAdapt) {
  const sty = C.offStyles[L.T[1].style.off] || C.offStyles.balanced, wb = Object.assign({ sneak: .02 }, sty.w);
  const long = L.down >= 3 && L.togo >= 7, short = L.togo <= 2, trail = L.sc[0] - L.sc[1];
  if (long) { wb.dive *= .3; wb.sweep *= .35; wb.sneak *= .3; wb.screen *= .8; wb.bomb *= 1.5; wb.pa *= .8; }
  if (short) { wb.dive *= 1.8; wb.sneak = .2; wb.bomb *= .6; }
  if (L.q >= 4 && trail >= 9) { wb.dive *= .5; wb.sweep *= .5; wb.bomb *= 1.6; }
  const desperate = L.q >= 4 && L.clk < 30 && trail > 0 && trail <= 8;
  const w = spread(wb, PIDS, baseOf, id => id === 'hail' ? (desperate ? 40 : .1) : id === 'wedge' ? (short ? 2 : .3) : PLAY[id].ai != null ? PLAY[id].ai : 1);
  const rec = L.recD.slice(-8);
  if (!noAdapt && rec.length) Object.keys(w).forEach(t => { let s = 0; rec.forEach(d => { s += (MX[t] || {})[d] || 0; }); w[t] *= Math.exp((C.aiAdapt || .6) * s / rec.length); });
  return w;
}
/* draw: a ready-made wdraw of aiOffW, and best: a cache of each play's best target, for many picks in a row */
function aiOffPick(L, draw, best) {
  const id = draw ? draw() : wpick(aiOffW(L)), p = PLAY[id];
  let slot = pickM(p.slots);
  if (p.slots.length > 1 && Math.random() < .6) {
    if (best && best[id]) return { kind: 'play', id, slot: best[id] };
    const oP = L.T[1].P, dP = L.T[0].P;
    slot = p.slots.reduce((b, s) => { const c = comp(id, s, oP, dP); return c.off - c.def > b.v ? { s, v: c.off - c.def } : b; }, { s: slot, v: -1e9 }).s;
    if (best) best[id] = slot;
  }
  return { kind: 'play', id, slot };
}
function aiFourth(L) {
  const sp = aiKickOrGo(L); if (!sp) return null;
  const short = L.togo <= 3 && L.ball >= 35, lead = L.sc[1] - L.sc[0];
  if (!(L.q >= 4 && lead > 0) && Math.random() < ((C.st || {}).aiFake || .04) + (short ? .05 : 0)) return { kind: sp.kind === 'fg' ? 'fakefg' : 'fakepunt', show: sp.kind };
  return Object.assign(sp, { show: sp.kind });
}
function aiKickOrGo(L) {
  const dist = 100 - L.ball + 17, k = L.T[L.poss].P.K.ab, range = 50 + (k.kpow - 60) / 3;
  const diff = L.sc[L.poss] - L.sc[1 - L.poss], late = L.q >= 4 && L.clk < 150;
  if (late && diff < 0) return diff >= -3 && dist <= range ? { kind: 'fg' } : null;
  if (L.togo <= 2 && L.ball >= 50 && L.ball < 70) return null;
  if (L.togo <= 1 && L.ball >= 35 && L.ball < 70) return null;
  if (dist <= range) return { kind: 'fg' };
  return { kind: 'punt' };
}

/* ---------------- your three options, and how good each one is ---------------- */
/* three plays from your playbook: one run, one short, one deep when you have them, then the rest at random */
function offPicks(book) {
  const GO = ['run', 'short', 'deep'], mk = id => ({ kind: 'play', id, slot: pickM(PLAY[id].slots) });
  const pool = shuffle(book.off), pick = [];
  GO.forEach(g => { const id = pool.find(x => PLAY[x].group === g && !pick.includes(x)); if (id) pick.push(id); });
  pool.forEach(id => { if (pick.length < 3 && !pick.includes(id)) pick.push(id); });
  pick.sort((a, b) => GO.indexOf(PLAY[a].group) - GO.indexOf(PLAY[b].group));
  return pick.slice(0, 3).map(mk);
}
function makeOpts(L) {
  L.seq = (L.seq || 0) + 1;
  const book = normBook(H().book);
  if (L.poss === 0) {
    let o = offPicks(book);
    if (L.down === 4) o = (L.togo <= 3 ? [o[0], o[1]] : o.slice(-2)), o.unshift({ kind: 'punt' }, { kind: 'fakepunt' });
    /* a field goal is always on the table once you're in range */
    if (100 - L.ball + 17 <= (C.fgMaxTry || 65)) { o.push({ kind: 'fg' }); if (L.down === 4) o.push({ kind: 'fakefg' }); }
    L.opts = o;
  } else {
    const pick = shuffle(book.def).slice(0, 3), SL = C.defCalls.sell;
    L.opts = book.def.filter(d => pick.includes(d)).map(id => ({ kind: 'def', id }));
    /* 3rd or 4th and short: bet the farm on run or pass */
    if (L.down >= 3 && L.togo <= SL.short) L.opts.push({ kind: 'def', id: SL.run, sell: 'run' }, { kind: 'def', id: SL.pass, sell: 'pass' });
  }
  L.ev = evalOpts(L);
}
/* samples per option when grading a call (fewer while the assistant races through a game) */
const EVAL_N = { n: 90 };
function evalOpts(L, n) {
  n = n || EVAL_N.n;
  /* the other coordinator's tendencies don't change between samples: work them out once */
  const off = L.poss === 0, draw = wdraw(off ? aiDefW(L) : aiOffW(L)), best = {};
  return L.opts.map(o => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const O = off ? o : aiOffPick(L, draw, best), D = off ? draw() : o.id;
      if (o.sell) O.vsSell = o.sell;
      s += valueOf(L, trans(L, resolve(L, O, D, Math.random)));
    }
    return Math.round((L.poss === 0 ? s : -s) / n * 1000) / 1000;
  });
}
function gradeOf(ev, i) {
  const best = Math.max(...ev), worst = Math.min(...ev), spread = best - worst, gap = best - ev[i];
  if (spread < .15) return 'even';
  if (gap <= Math.max(.06, spread * .2)) return 'smart';
  if (gap >= spread * .6) return 'bad';
  return 'ok';
}

/* ---------------- running a game ---------------- */
const inGame = (p, bonus) => ({ id: p.id, name: p.name, num: p.num, ab: effAb(p, bonus), walk: p.walk || undefined });
/* who takes the field: injured starters sit, the best healthy backup (or a walk-on) plays */
function snapTeam(t, bonus) {
  const P = {}, used = new Set(SLOTS.map(s => t.roster[s]).filter(p => !out(p)).map(p => p.id));
  SLOTS.forEach(s => { let p = t.roster[s]; if (out(p)) { p = subFor(t, SPOS[s], used); used.add(p.id); } P[s] = inGame(p, bonus); });
  return { id: t.id, name: t.name, color: t.color, style: t.style, P };
}
/* contact on a snap: the player with the ball and the defender in the play might get hurt */
function injuryCheck(L, r) {
  if (r.pre || r.away || (r.pen && r.pen.replace) || (r.kind !== 'run' && r.kind !== 'pass')) return;
  const off = L.poss, base = INJ.perSnap != null ? INJ.perSnap : .006;
  const oSlot = r.sack ? 'QB' : r.slot, oP = r.sack ? (INJ.sackQB || .014) : r.inc || r.to === 'int' ? base * .35 : base * (r.big || r.yards >= 20 ? 1.4 : 1);
  [[off, oSlot, oP], [1 - off, r.dslot, oP * (INJ.defShare || .6)]].forEach(([tm, s, p]) => {
    if (!s || s === 'K' || !L.T[tm].P[s] || Math.random() >= p) return;
    const was = L.T[tm].P[s], inj = rollInjury();
    (L.inj = L.inj || []).push({ tm, slot: s, id: was.id, name: was.name, g: inj.g, what: inj.what, walk: !!was.walk });
    /* in comes the next man up */
    const t = teamById(L.T[tm].id), used = new Set(SLOTS.map(k => L.T[tm].P[k].id).concat(L.inj.map(x => x.id)));
    const sub = t ? subFor({ bench: t.bench }, SPOS[s], used) : walkOn(SPOS[s]);
    L.T[tm].P[s] = inGame(sub, (L.bonus || [0, 0])[tm]);
    const note = `${was.name} (${s}) is hurt: ${inj.what.toLowerCase()}, ${injTxt(inj)}. ${sub.name} comes in${sub.walk ? ', a walk-on off the street' : ''}.`;
    (L.injNew = L.injNew || []).push({ tm, s: note });
    say(L, 'injury', tm, { p: was.name, t: L.T[tm].name }, h(`${sub.name} replaces him.`));
  });
}
const hexRgb = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
const cdist = (a, b) => { const p = hexRgb(a), q = hexRgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const light = x => { const [r, g, b] = hexRgb(x); return (r * 299 + g * 587 + b * 114) / 1000 > 150; };
function fieldColors(a, b) { if (cdist(a, b) > 120) return b; return ['#f2f2f2', '#c8332f', '#e08a1e', '#26262b'].find(c => cdist(a, c) > 120) || '#f2f2f2'; }
const RECENT = {};
function line(type, v) {
  const pool = LINES[type]; if (!pool || !pool.length) return '';
  const rec = RECENT[type] || (RECENT[type] = []);
  const fresh = pool.map((_, i) => i).filter(i => !rec.includes(i)), i = pickM(fresh.length ? fresh : pool.map((_, j) => j));
  rec.push(i); while (rec.length > Math.min(3, pool.length - 1)) rec.shift();
  return pool[i].replace(/\{(\w)\}/g, (m, k) => v[k] == null ? m : (['p', 'q', 'd'].includes(k) ? `<b>${h(v[k])}</b>` : h(v[k])));
}
function say(L, type, tm, v, extra) { const s = line(type, v); if (s) L.log.push({ tm, s: s + (extra ? ' ' + extra : '') }); }
function endQuarter(L) {
  if (L.q === 2) { say(L, 'half', null, {}); L.q = 3; L.clk = Q; kickoff(L, L.recv1); return; }
  if (L.q === 1 || L.q === 3) { say(L, 'quarter', null, {}); L.q++; L.clk = Q; return; }
  if (L.sc[0] !== L.sc[1]) { gameOver(L); return; }
  const po = L.nx.kind === 'po';
  if (L.q === 4 || (po && L.q < 9)) { say(L, 'ot', null, {}); L.q++; L.clk = C.otSec || 180; kickoff(L, ri(0, 1)); return; }
  if (po) L.sc[ri(0, 1)] += 3; /* never happens in practice: a coin flip after five overtimes */
  gameOver(L);
}
function gameOver(L) { if (L.over) return; L.over = true; delete L.ko; delete L.kick; delete L.pat; say(L, 'final', null, {}); }
const absX = (off, b) => off === 0 ? b : 100 - b;
const bx = (L, tm, s) => L.box[tm][s] || (L.box[tm][s] = {});
const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n == null ? 1 : n); };
function addFlag(L, r) {
  const off = L.poss, x = Math.random();
  const back = n => -Math.min(n, Math.floor(L.ball / 2)), fwd = n => Math.max(1, Math.min(n, Math.floor((100 - L.ball) / 2)));
  if (r.kind === 'pass' && !r.sack && (r.inc || r.to === 'int') && x < .4) { r.pen = { who: 1 - off, line: 'dpi', name: 'Pass interference', yards: clamp(Math.max(r.catchD, 5), 1, 99 - L.ball), auto: true, replace: true }; return; }
  if (x < .5) { r.pen = !r.to && !r.td && r.yards > 0 ? { who: off, line: 'holding', name: 'Holding', yards: back(10), replay: true, replace: true } : { who: off, line: 'holdDecl', declined: true }; return; }
  if (r.kind === 'pass' && !r.to && !r.td && x < .75) { if (!r.comp || r.yards < 5) r.pen = { who: 1 - off, line: 'defHold', name: 'Defensive holding', yards: fwd(5), auto: true, replace: true }; return; }
  if (!r.to && !r.td) r.pen = { who: 1 - off, line: r.kind === 'pass' ? 'rough' : 'facemask', name: r.kind === 'pass' ? 'Roughing the passer' : 'Facemask', add: true };
}
/* a snap for the field picture: off has the ball on its own b, fd is the first-down line (absolute) or null */
const animOf = (off, b, fd, r, lbl, td, deftd) => ({ off, los: absX(off, b), dir: off === 0 ? 1 : -1, fd, b, k: r.kind, id: r.id, slot: r.slot, dslot: r.dslot,
  y: r.yards, cd: r.catchD, lane: r.lane, sack: !!r.sack, comp: !!r.comp, inc: !!r.inc, to: r.to || null, ret: r.ret || 0, td: !!td, deftd: !!deftd,
  net: r.net, tb: !!r.tb, good: !!r.good, away: !!r.away, flag: !!(r.pen && !r.pen.declined), pre: !!r.pre, lbl, miss: Math.random() < .5 ? -6 : 6,
  missY: r.missY, short: !!r.short, lvl: r.lvl, gross: r.gross, fc: !!r.fc, muff: !!r.muff, blk: !!r.blk, spot: r.spot, rtd: !!r.rtd, fake: r.fake, made: !!r.made });
/* one snap, for real: flags, stats, commentary, the picture, the score */
/* noFs: you timed the snap yourself, so only the defense can jump */
function preSnap(L, O, noFs) {
  const off = L.poss, def = 1 - off, F = C.flags || {};
  if (O.kind !== 'play' || Math.random() >= (F.pre || 0)) return null;
  const fs = Math.random() < .5;
  if (fs) return noFs ? null : falseStart(L, O);
  return { kind: 'flag', pre: true, id: O.id, slot: O.slot, yards: 0, clock: 0,
    pen: { who: def, line: 'offside', name: 'Offside', yards: Math.max(1, Math.min(5, Math.floor((100 - L.ball) / 2))), replay: true, replace: true } };
}
const falseStart = (L, O) => ({ kind: 'flag', pre: true, id: O.id, slot: O.slot, yards: 0, clock: 0,
  pen: { who: L.poss, line: 'falseStart', name: 'False start', yards: -Math.min(5, Math.floor(L.ball / 2)), replay: true, replace: true } });
/* you were late on the snap: the rush is in the backfield before the play gets going */
function lateSnap(L, O) {
  const S = C.snap || {}, R = Math.random, base = { id: O.id, slot: O.slot, late: true, lane: 26.6 };
  if (PLAY[O.id].group !== 'run') {
    const r = Object.assign(base, { kind: 'pass', sack: true, yards: -(5 + Math.floor(R() * 6)), dslot: R() < .7 ? (R() < .5 ? 'DL1' : 'DL2') : 'LB1', clock: 30 });
    if (R() < (S.lateFumble != null ? S.lateFumble : .3)) { r.to = 'fum'; r.toAt = r.yards; r.ret = 0; }
    return r;
  }
  const y = -(1 + Math.floor(R() * 4)), r = Object.assign(base, { kind: 'run', yards: y, dslot: R() < .5 ? 'DL1' : 'DL2', clock: 30 });
  if (R() < (S.runLost != null ? S.runLost : .5)) Object.assign(r, { to: 'fum', toAt: y, ret: Math.floor(R() * 4), clock: 8 });
  else r.fell = true;
  return r;
}
/* the QB gives up on a covered throw and fires it out of bounds */
function throwAway(L, r) {
  const g = Math.random() < (C.groundingChance || .06);
  return { kind: 'pass', id: r.id, slot: r.slot, dslot: r.dslot, catchD: r.catchD, lane: r.lane, away: true, inc: true, grounding: g,
    yards: g ? -Math.min(10, Math.floor(L.ball / 2)) : 0, clock: 5 };
}
function runPlay(L, O, D, given, noFs) {
  const off = L.poss, def = 1 - off, F = C.flags || {}, T = L.T;
  let r = given || preSnap(L, O, noFs);
  if (!r) r = resolve(L, O, D, Math.random);
  if (!r.pre && !r.away && !r.late && O.kind === 'play' && Math.random() < (F.during || 0)) addFlag(L, r);
  const t = trans(L, r), b = L.ball;
  const oP = T[off].P, dP = T[def].P, nm = s => (oP[s] || {}).name || '', dn = s => (dP[s] || {}).name || '';
  const v = { p: nm(r.slot), q: nm('QB'), d: dn(r.dslot), t: T[off].name, o: T[def].name };
  const wiped = r.pen && r.pen.replace;
  /* the box score */
  if (r.kind === 'fg') { inc(bx(L, off, 'K'), 'fga'); if (r.good) inc(bx(L, off, 'K'), 'fgm'); }
  else if (r.kind === 'run' && !wiped) {
    const x = bx(L, off, r.slot); inc(x, 'car'); inc(x, 'ry', r.yards); if (r.td) inc(x, 'td');
    L.runs[off].n++; L.runs[off].y += r.yards;
    if (r.to) inc(bx(L, def, r.dslot), 'ff'); else if (!r.td) inc(bx(L, def, r.dslot), 'tkl');
  } else if (r.kind === 'pass' && !wiped) {
    const q = bx(L, off, 'QB');
    if (r.sack) { inc(bx(L, def, r.dslot), 'sk'); if (r.to) inc(bx(L, def, r.dslot), 'ff'); }
    else {
      inc(q, 'att');
      if (off === 1) inc(L.tgt = L.tgt || {}, r.slot);
      if (r.comp) { inc(q, 'cmp'); inc(q, 'py', r.yards); const x = bx(L, off, r.slot); inc(x, 'rec'); inc(x, 'recy', r.yards); if (r.td) { inc(x, 'td'); inc(q, 'ptd'); } else inc(bx(L, def, r.dslot), 'tkl'); }
      if (r.to === 'int') { inc(q, 'ints'); inc(bx(L, def, r.dslot), 'int'); }
    }
  }
  /* commentary */
  let key = null, tm = off;
  if (r.kind === 'fg') { key = r.blk ? (t.k === 'deftd' ? 'fgBlockTD' : 'fgBlock') : r.good ? 'fgGood' : ({ wideL: 'fgWideL', wideR: 'fgWideR', short: 'fgShort', doink: 'fgDoink' })[r.how] || 'fgMiss'; v.p = nm('K'); v.n = r.dist; if (r.blk) tm = def; }
  else if (r.kind === 'punt') {
    v.p = nm('K'); v.d = dn('WR3'); v.n = r.gross;
    if (r.rough) { key = 'roughKicker'; tm = def; }
    else if (r.blk) { key = t.k === 'deftd' ? 'puntBlockTD' : 'puntBlock'; tm = def; }
    else {
      say(L, r.tb ? 'puntTB' : 'punt', off, v);
      key = r.muff ? 'puntMuff' : r.rtd ? 'puntRetTD' : r.tb ? null : r.fc ? 'puntFC' : r.ret ? 'puntRet' : 'puntNoRet';
      tm = r.muff ? off : def; v.n = plural(r.ret, 'yard');
    }
  }
  else if (r.pre) { key = r.pen.line; tm = r.pen.who; }
  else if (r.late) { key = r.sack ? (r.to ? 'lateStrip' : 'lateSack') : r.to ? 'lateFumble' : 'lateFell'; v.n = plural(-r.yards, 'yard'); if (r.to) tm = def; }
  else if (wiped) {
    const what = r.kind === 'run' ? `${nm(r.slot)} had ${r.yards} yards…` : r.comp ? `${nm('QB')} hit ${nm(r.slot)} for ${r.yards}…` : '';
    if (what) L.log.push({ tm: off, s: h(what) });
    key = r.pen.line; tm = r.pen.who;
  } else if (r.fake) {
    key = r.to ? 'fumble' : r.td ? 'fakeTD' : r.made ? 'fakeGood' : 'fakeFail'; v.n = plural(r.yards, 'yard'); if (r.to || !r.made) tm = def;
  } else if (r.kind === 'run') {
    if (r.to) { key = 'fumble'; tm = def; }
    else if (r.td) { key = 'runTD'; v.n = r.yards; }
    else if (baseOf(r.id) === 'sneak' && !r.big && r.yards < 4) { key = 'sneak'; v.n = plural(r.yards, 'yard'); }
    else if (r.big) { key = 'runBig'; v.n = r.yards; }
    else if (r.yards <= 0) { key = 'runLoss'; v.n = plural(Math.abs(r.yards), 'yard'); if (!r.yards) { key = 'runShort'; v.n = 'no gain'; } }
    else if (r.yards < 4) { key = 'runShort'; v.n = plural(r.yards, 'yard'); }
    else { key = 'runGood'; v.n = plural(r.yards, 'yard'); }
  } else if (r.kind === 'pass') {
    if (r.sack) { key = r.to ? 'stripSack' : 'sack'; v.n = plural(-r.yards, 'yard'); if (r.to) tm = def; }
    else if (r.to) { key = t.k === 'deftd' ? 'pick6' : 'int'; tm = def; }
    else if (r.comp) { key = r.td ? 'passTD' : baseOf(r.id) === 'screen' ? 'screen' : r.yards >= 20 ? 'passDeep' : 'passShort'; v.n = key === 'passDeep' || key === 'passTD' ? r.yards : plural(r.yards, 'yard'); }
    else if (r.away) key = r.grounding ? 'grounding' : 'throwAway';
    else key = 'incomplete';
  }
  const fd = !r.td && t.k === 'first' && !wiped ? ' ' + line('firstDown', {}) : '';
  if (key) say(L, key, tm, v, fd);
  if (r.pen && !r.pen.replace) say(L, r.pen.line, r.pen.declined ? def : r.pen.who, v);
  if (t.k === 'downs') say(L, 'downs', def, v);
  if (t.k === 'safety') say(L, 'safety', def, v);
  if (wiped && t.k === 'first') L.log.push({ tm: off, s: h(line('firstDown', {})) });
  injuryCheck(L, r);
  /* the picture */
  const lbl = r.kind === 'fg' ? (r.blk ? (t.k === 'deftd' ? 'BLOCK & SCORE!' : 'BLOCKED!') : r.good ? 'GOOD!' : r.how ? KICK_HOW[r.how].toUpperCase() : 'NO GOOD')
    : r.kind === 'punt' ? (r.rough ? 'ROUGHING THE KICKER' : r.blk ? (t.k === 'deftd' ? 'BLOCK & SCORE!' : 'BLOCKED!') : r.muff ? 'MUFFED!' : r.rtd ? 'RETURN TD!' : r.tb ? 'TOUCHBACK' : r.fc ? 'FAIR CATCH' : `PUNT · NET ${r.net}`)
    : r.pre ? r.pen.name.toUpperCase() : r.fell ? 'BOTCHED SNAP'
    : t.k === 'td' ? 'TOUCHDOWN!' : r.fake && !r.to ? (r.made ? 'FAKE WORKS!' : 'FAKE STUFFED') : t.k === 'deftd' ? (r.to === 'int' ? 'PICK-SIX!' : 'SCOOP & SCORE!') : r.to === 'int' ? 'INTERCEPTED' : r.to ? 'FUMBLE!' : r.sack ? `SACK ${r.yards}` : r.away ? (r.grounding ? 'GROUNDING' : 'THROWN AWAY') : r.inc ? 'INCOMPLETE' : t.k === 'safety' ? 'SAFETY' : `${r.yards >= 0 ? '+' : ''}${r.yards}`;
  L.anims.push(Object.assign(animOf(off, b, L.togo < 100 - b ? absX(off, b + L.togo) : null, r, lbl, t.k === 'td', t.k === 'deftd'),
    { win: r.blk || r.rtd ? def : r.muff || r.rough ? off : null }));
  /* the result, in a few words */
  let res = r.kind === 'fg' ? (r.blk ? (t.k === 'deftd' ? 'Field goal blocked and returned for a touchdown' : `Field goal blocked (${r.dist} yards)`) : r.good ? `Field goal is good from ${r.dist}` : `Field goal missed from ${r.dist}${r.how ? ` (${KICK_HOW[r.how]})` : ''}`)
    : r.kind === 'punt' ? (r.rough ? 'Roughing the kicker: 15 yards and a first down for the punting team'
      : r.blk ? (t.k === 'deftd' ? 'Punt blocked and returned for a touchdown' : 'Punt blocked')
      : r.muff ? `Punt muffed, recovered by the punting team` : r.rtd ? 'Punt returned for a touchdown'
      : r.tb ? 'Punt, touchback' : `Punt, ${r.gross} yards${r.fc ? ', fair catch' : r.ret ? `, returned ${r.ret}` : ', no return'} (net ${r.net})`)
    : r.pre ? `Flag before the snap: ${r.pen.name.toLowerCase()} on ${T[r.pen.who].name}`
    : wiped ? `Flag: ${r.pen.name.toLowerCase()} on ${T[r.pen.who].name}${t.k === 'first' ? ', first down' : ''}`
    : t.k === 'td' ? `TOUCHDOWN (${r.yards} yards)` : t.k === 'deftd' ? (r.to === 'int' ? 'Intercepted and returned for a touchdown' : 'Fumble returned for a touchdown') : r.to === 'int' ? `Intercepted (${nm(r.slot)} was covered)` : r.to ? 'Fumble, lost'
    : t.k === 'safety' ? 'Safety' : r.fell ? `Botched snap, recovered for a loss of ${plural(-r.yards, 'yard')}` : r.sack ? `Sacked for ${r.yards}` : r.away ? (r.grounding ? `Thrown away, but flagged for intentional grounding (${r.yards} yards and loss of down)` : 'Thrown away. Incomplete, no harm done')
    : r.inc ? `Incomplete (${nm(r.slot)} was ${r.open ? 'open, but it fell incomplete' : 'covered'})`
    : `${r.yards >= 0 ? 'Gain of' : 'Loss of'} ${plural(Math.abs(r.yards), 'yard')}${t.k === 'first' ? ', first down' : t.k === 'downs' ? ', turnover on downs' : ''}`
      + (r.comp && !wiped ? (r.burned ? ` (the jump missed: nobody behind ${nm(r.slot)})` : ` (${nm(r.slot)} was ${r.open ? 'open' : 'covered, great catch'})`) : '')
      + (r.pen && r.pen.add ? ` + 15 (${r.pen.name.toLowerCase()})` : '');
  if (r.fake) res = `Fake ${r.fake === 'fg' ? 'field goal' : 'punt'}: ${res.charAt(0).toLowerCase() + res.slice(1)}`;
  /* the drive and the score */
  const scored = ['td', 'deftd', 'fg', 'safety'].includes(t.k);
  switch (t.k) {
    case 'td': L.sc[off] += 6; if (L.q < 5) setPat(L, off); break;
    case 'deftd': L.sc[def] += 7; if (L.q < 5) kickoff(L, def); break;
    case 'fg': L.sc[off] += 3; if (L.q < 5) kickoff(L, off); break;
    case 'safety': L.sc[def] += 2; L.poss = def; L.ball = 35; L.down = 1; L.togo = 10; break;
    case 'fgmiss': case 'punt': case 'to': case 'downs': L.poss = def; L.ball = t.nb; L.down = 1; L.togo = Math.min(10, 100 - t.nb); break;
    case 'first': L.ball = t.nb; L.down = 1; L.togo = Math.min(10, 100 - t.nb); break;
    case 'next': L.ball = t.nb; L.down = t.down; L.togo = t.togo; break;
    case 'same': L.ball = t.nb; L.togo = t.togo; break;
  }
  if (scored && L.q >= 5) { gameOver(L); return res; }
  L.clk -= r.clock;
  /* a touchdown on the last snap of a half still gets its try: the quarter ends after it */
  if (L.clk <= 0) { L.clk = 0; if (!L.pat) endQuarter(L); }
  return res;
}

/* ---------------- the try after a touchdown ---------------- */
const PAT = () => C.pat || {};
const xpChance = k => clamp((PAT().xp || .94) + (k.kacc - 60) / 250, .8, .99);
function setPat(L, tm) { L.pat = { tm }; L.poss = tm; L.ball = PAT().ball || 98; L.down = 1; L.togo = 100 - L.ball; }
function makePatOpts(L) { L.seq = (L.seq || 0) + 1; L.opts = [{ kind: 'xp' }].concat(offPicks(normBook(H().book))); L.ev = []; }
/* o: { kind: 'xp' } or a two-point play against defense D. Returns { out, ok }; ok is null when a false start means try again */
function runPat(L, o, D, snap, aim) {
  const tm = L.pat.tm, def = 1 - tm, b = L.ball, T = L.T, P = T[tm].P, v = { t: T[tm].name, o: T[def].name };
  let ok, out;
  if (o.kind === 'xp') {
    const k = aim ? kickOutcome(P.K.ab, 33, aim, Math.random) : null;
    ok = k ? k.how === 'good' : Math.random() < xpChance(P.K.ab); v.p = P.K.name; v.n = k && KICK_HOW[k.how];
    say(L, ok ? 'xpGood' : k ? 'xpMissAim' : 'xpMiss', tm, v);
    L.anims.push(animOf(tm, 85, null, { kind: 'fg', good: ok, missY: k ? kickY(k, aim) : undefined }, ok ? 'GOOD!' : k && k.how === 'doink' ? 'DOINK!' : 'NO GOOD'));
    out = ok ? 'Extra point is good' : `Extra point missed${k ? ` (${KICK_HOW[k.how]})` : ''}`;
  } else {
    if (snap && snap.k === 'early') {
      const r = falseStart(L, o);
      L.ball = b + r.pen.yards; L.togo = 100 - L.ball;
      say(L, 'falseStart', tm, v);
      L.anims.push(animOf(tm, b, null, r, 'FALSE START'));
      return { out: `False start: back to the ${L.togo}. Kick it or go for two from there`, ok: null };
    }
    const r = snap && snap.k === 'late' ? lateSnap(L, o) : resolve(L, o, D, Math.random);
    ok = !r.to && !!r.td;
    v.p = (P[r.sack ? 'QB' : r.slot] || {}).name || ''; v.d = (T[def].P[r.dslot] || {}).name || '';
    say(L, 'twoGo', tm, v); say(L, ok ? 'twoGood' : 'twoFail', ok ? tm : def, v);
    const why = r.to === 'int' ? 'intercepted' : r.to ? 'fumbled' : r.sack ? 'sacked' : r.inc ? 'incomplete' : `stopped ${plural(100 - b - Math.max(0, r.yards), 'yard')} short`;
    L.anims.push(animOf(tm, b, null, r, ok ? 'TWO POINTS!' : why.split(' ')[0].toUpperCase(), ok));
    out = ok ? 'Two-point conversion is good' : `Two-point try fails (${why})`;
  }
  if (ok) L.sc[tm] += o.kind === 'xp' ? 1 : 2;
  delete L.pat;
  if (L.clk <= 0 && (L.q === 2 || L.q === 4)) endQuarter(L);
  else { kickoff(L, tm); if (L.clk <= 0) endQuarter(L); }
  return { out, ok };
}
/* you scored: you picked the kick or a two-point play */
function patCall(L, i, snap, aim) {
  const o = L.opts[i]; if (!o || !L.pat) return;
  L.pre = Object.assign(snapOf(L), { pat: true });
  L.anims = []; L.recap = [];
  const two = o.kind === 'play', D = two ? wpick(aiDefW(L)) : null, sn = two && snap ? snap : null;
  const x = runPat(L, o, D, sn, o.kind === 'xp' ? aim : null);
  L.res = { side: 0, pat: true, mine: optName(o, L.T[0].P), theirs: D ? DEFC[D].name : null, g: x.ok ? 'patGood' : x.ok === false ? 'patBad' : 'patRedo', out: x.out, snap: sn, recap: null, inj: [] };
  prep(L);
  L.res.recap = L.recap; delete L.recap;
  if (L.over) settle(L);
}
/* they scored: kick it, unless the 4th-quarter margin says go for two */
function aiPat(L) {
  const go = L.q >= 4 && (PAT().go2 || []).includes(L.sc[1] - L.sc[0]);
  const x = runPat(L, go ? aiOffPick(L) : { kind: 'xp' }, go ? pickM(normBook(H().book).def) : null, null);
  L.recap.push({ them: go ? 'Two-point try' : 'Extra point', res: x.out });
}
function prep(L) {
  if (L.over) return;
  if (L.pat) return makePatOpts(L);
  if (L.ko) return makeKoOpts(L);
  if (L.poss === 1 && L.down === 4) { const sp = aiFourth(L); if (sp) { L.kick = sp; return makeKickOpts(L); } }
  makeOpts(L);
}
const optName = (o, P) => o.sell ? `Sell out vs ${o.sell}` : o.kind === 'st' ? STC[o.id].name : o.kind === 'fakepunt' ? 'Fake punt' : o.kind === 'fakefg' ? 'Fake field goal' : o.kind === 'xp' ? 'Extra point kick' : o.kind === 'fg' ? 'Field goal' : o.kind === 'punt' ? 'Punt' : o.kind === 'def' ? DEFC[o.id].name
  : PLAY[o.id].slots.length === 1 && PLAY[o.id].slots[0] === 'QB' ? PLAY[o.id].name : `${PLAY[o.id].name} to ${P && P[o.slot] ? P[o.slot].name : o.slot}`;
/* a short reason why the recommended call was the better one */
function whyBest(L, bi, mine) {
  const o = L.opts[bi], why = [], mg = mine && mine.kind === 'play' ? PLAY[mine.id].group : mine && mine.kind, long = L.down >= 3 && L.togo >= 7, short = L.togo <= 2;
  if (o.kind === 'fakepunt' || o.kind === 'fakefg') return `A fake had the best odds: ${L.togo <= 3 ? 'it’s short yardage' : 'their special teams usually aren’t set for it'}, and the kick wasn’t worth much from here.`;
  if (o.kind === 'fg') return L.down < 4 ? `Three points from ${100 - L.ball + 17} yards was worth more than what this drive was likely to get from here.` : `${100 - L.ball + 17} yards is in range: take the points instead of risking a turnover on downs.`;
  if (o.kind === 'punt') return 'Too far to convert or kick a field goal; flip the field and make them drive.';
  if (o.kind === 'play') {
    const w = famSum(norm1(aiDefW(L)), dbase), top = Object.keys(w).sort((a, b) => w[b] - w[a])[0], g = PLAY[o.id].group;
    if (mg === 'fg' || mg === 'punt') why.push(`going for it on ${ORD[L.down]} & ${L.togo} was worth the risk`);
    if (long && g !== 'run' && (mg === 'run' || mg === 'fg' || mg === 'punt')) why.push(`on ${ORD[L.down]} & ${L.togo} you need a throw that can get the yards`);
    if (short && g === 'run' && mg !== 'run') why.push('short yardage is run territory');
    if (vsDefFam(o.id, top) > .3) why.push(`it beats ${(DFAM[top] || top).toLowerCase()}, which they were likely to call`);
    const c = comp(o.id, o.slot, L.T[0].P, L.T[1].P), e = Math.round(c.off - c.def);
    if (e >= 3) why.push(`${L.T[0].P[o.slot].name} has the edge on ${L.T[1].P[c.dslot].name} (${Math.round(c.off)} vs ${Math.round(c.def)})`);
    if (baseOf(o.id) === 'pa' && L.runs[0].n >= 3 && L.runs[0].y / L.runs[0].n >= 4) why.push('your run game is working, so the fake sells');
    if (!why.length) why.push('it had the best odds against what they usually call here');
  } else {
    if (o.sell) return `On ${ORD[L.down]} & ${L.togo} they ${o.sell === 'run' ? 'usually run it' : 'like to throw'}: selling out for the ${o.sell} had the best odds.`;
    const w = famSum(norm1(aiOffW(L)), baseOf), tops = Object.keys(w).filter(k => w[k] > 0).sort((a, b) => w[b] - w[a]).slice(0, 3);
    const stops = tops.filter(t => vsPlayFam(o.id, t) < -.3).map(t => (PFAM[t] || t).toLowerCase());
    if (stops.length) why.push(`it stops ${stops.join(' and ')}, their most likely call${stops.length > 1 ? 's' : ''} here`);
    if (long && dbase(o.id) !== 'stack' && dbase(mine.id) === 'stack') why.push(`on ${ORD[L.down]} & ${L.togo} they have to throw`);
    if (short && dbase(o.id) === 'stack' && dbase(mine.id) === 'prevent') why.push('on short yardage they’ll probably run');
    if (!why.length) why.push('it held up best against everything they might call');
  }
  const s = why.join('; ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}
/* you made a call; snap is how you timed it on offense ({ k: 'good' | 'early' | 'late', ms }), aim how you kicked it */
function doCall(L, i, noAsk, snap, aim) {
  if (L.pat) return patCall(L, i, snap, aim);
  if (L.ko) return koCall(L, i);
  if (L.kick) return kickDefCall(L, i);
  const st = H(), o = L.opts[i]; if (!o) return;
  const g = gradeOf(L.ev, i), bi = L.ev.indexOf(Math.max(...L.ev)), side = L.poss;
  let O, D, theirs = null;
  if (side === 0) {
    O = aim && o.kind === 'fg' ? Object.assign({}, o, { aim }) : o;
    if (o.kind === 'play') { D = wpick(aiDefW(L)); theirs = DEFC[D].name; L.recO.push(o.id); }
    else { D = aiStCall(L, o.kind === 'fg' || o.kind === 'fakefg' ? 'fg' : 'punt'); theirs = STC[D].name; }
  }
  else { D = o.id; O = aiOffPick(L); if (o.sell) O.vsSell = o.sell; theirs = optName(O, L.T[1].P); L.recD.push(D); }
  L.recO = L.recO.slice(-12); L.recD = L.recD.slice(-12);
  L.calls[g] = (L.calls[g] || 0) + 1;
  st.chem = Math.round(clamp(st.chem + ((C.chemPerCall || {})[g] || 0), 0, 100) * 10) / 10;
  L.pre = { sc: L.sc.slice(), q: L.q, clk: L.clk, down: L.down, togo: L.togo, ball: L.ball, poss: L.poss, log: L.log.length };
  const mine = optName(o, L.T[0].P), best = g === 'smart' || g === 'even' ? null : optName(L.opts[bi], L.T[0].P), why = best ? whyBest(L, bi, o) : '';
  L.anims = []; L.recap = [];
  const res = { side, mine, theirs, tl: side === 0 && o.kind !== 'play' ? 'special teams' : null, g, best, why, snap: side === 0 && O.kind === 'play' && snap ? snap : null };
  if (res.snap && res.snap.k !== 'good') return finishCall(L, O, D, res, res.snap.k === 'early' ? falseStart(L, O) : lateSnap(L, O));
  /* your pass play: the QB drops back and reads it; if his man is covered, you decide */
  if (side === 0 && O.kind === 'play' && PLAY[O.id].group !== 'run' && st.askThrow !== false && !noAsk) {
    const pre = preSnap(L, O, !!res.snap);
    if (!pre) {
      const r = resolve(L, O, D, Math.random);
      if (r.kind === 'pass' && !r.sack && r.open === false) {
        L.pend = { O, D, r, res, anim: readAnim(L, r) };
        L.anims = [Object.assign({}, L.pend.anim, { readStop: true })];
        return;
      }
      return finishCall(L, O, D, res, r);
    }
    return finishCall(L, O, D, res, pre);
  }
  /* their play, your defense: a forced throw or a run into the open field waits for your call */
  if (side === 1 && O.kind === 'play' && !noAsk) {
    const r = preSnap(L, O) || resolve(L, O, D, Math.random), type = !r.pre && defPendType(L, r);
    if (type) {
      L.pend = { type, O, D, r, res, anim: type === 'jump' ? readAnim(L, r) : tackleAnim(L, r) };
      L.anims = [Object.assign({}, L.pend.anim, { readStop: true })];
      return;
    }
    return finishCall(L, O, D, res, r);
  }
  finishCall(L, O, D, res, null);
}
function finishCall(L, O, D, res, r) {
  L.injNew = [];
  /* your defensive call's commentary: the gamble before the play's line, the tackle after it */
  const dlog = res.dlog || [], sayD = when => dlog.filter(x => (x[3] || 'before') === when).forEach(([key, tm, v]) => say(L, key, tm, v));
  delete res.dlog; sayD('before');
  const out = runPlay(L, O, D, r, !!res.snap);
  sayD('after');
  if (O.kind === 'fakepunt' || O.kind === 'fakefg') (L.fakes = L.fakes || [0, 0])[res.side]++;
  if (O.vsSell) { res.sell = { on: O.vsSell, right: sellRight(O) }; say(L, res.sell.right ? 'sellWin' : 'sellLose', res.sell.right ? 1 - L.pre.poss : L.pre.poss, { n: O.vsSell, t: L.T[res.side].name }); }
  if (L.pat && L.pat.tm === 1) aiPat(L);
  L.res = Object.assign(res, { out, recap: null, inj: L.injNew });
  delete L.injNew;
  prep(L);
  L.res.recap = L.recap; delete L.recap;
  if (L.over) settle(L);
}
/* ---------------- your defensive calls: jump the route, the open-field tackle, selling out ---------------- */
const sellRight = O => (O.vsSell === 'run') === (PLAY[O.id].group === 'run');
/* their QB's most-targeted receiver this game (at least 2 throws, and more than anyone else) */
function favTarget(L) {
  const t = L.tgt || {}, ks = Object.keys(t).sort((a, b) => t[b] - t[a]);
  return ks.length && t[ks[0]] >= 2 && (ks.length < 2 || t[ks[0]] > t[ks[1]]) ? ks[0] : null;
}
/* the second level: where the big-run bonus kicks in (see resolve) */
const levelOf = r => Math.max(0, r.y0 || 0) + 8;
/* should this play stop for your call? (your defense only; never for the assistant) */
function defPendType(L, r) {
  if (r.kind === 'pass' && !r.sack && r.open === false) return 'jump';
  if (r.kind === 'run' && r.big && !r.to && levelOf(r) < 100 - L.ball) return 'tackle';
  return null;
}
const ballOf = (dP, s) => dP[s] && dP[s].ab.ball != null ? dP[s].ab.ball : abOf(dP, 'S', 'ball');
const jumpIntP = (dP, s) => { const J = C.defCalls.jump; return clamp(J.int[0] + (ballOf(dP, s) - 60) * J.int[1], ...J.intCap); };
const stripP = (dP, s) => { const T = C.defCalls.tackle; return clamp(T.strip[0] + (abOf(dP, s, 'tackle') - 60) * T.strip[1], ...T.stripCap); };
const whiffP = (dP, s) => { const T = C.defCalls.tackle; return clamp(T.whiff[0] - (abOf(dP, s, 'tackle') - 60) * T.whiff[1], ...T.whiffCap); };
/* a forced throw: jump the route, or play the receiver. Returns the play, ready for runPlay */
function jumpResolve(L, P_, jump) {
  const J = C.defCalls, r0 = P_.r, off = L.poss, oP = L.T[off].P, dP = L.T[1 - off].P, toGoal = 100 - L.ball, R = Math.random;
  const r = { kind: 'pass', id: r0.id, slot: r0.slot, dslot: r0.dslot, catchD: r0.catchD, lane: r0.lane, open: false, yards: 0 };
  const v = { p: oP[r.slot].name, q: oP.QB.name, d: dP[r.dslot].name };
  if (jump) {
    const before = L.jumps || 0, fav = favTarget(L) === r.slot;
    L.jumps = before + 1;
    const look = clamp(J.jump.lookOff[0] + (abOf(oP, 'QB', 'iq') - 60) * J.jump.lookOff[1] + J.jump.perJump * before - (fav ? J.jump.fav : 0), ...J.jump.lookCap);
    P_.res.lookOff = R() < look;
    if (P_.res.lookOff) P_.res.dlog.push(['lookOff', off, v]);
    if (R() < (P_.res.lookOff ? J.jump.lookedInt : jumpIntP(dP, r.dslot))) { r.to = 'int'; r.toAt = r.catchD; r.ret = R() < J.jump.pick6 ? 100 : Math.round(R() * R() * 35); }
    else {
      r.comp = true; r.big = true; r.burned = true; r.yards = r.catchD + J.jump.missYac[0] + Math.floor(R() * (J.jump.missYac[1] - J.jump.missYac[0] + 1));
      if (!P_.res.lookOff) P_.res.dlog.push(['jumpMiss', off, v]);
    }
  } else {
    const cv = (C.coverage || {}).covered || {}, deep = ['bomb', 'pa'].includes(baseOf(r.id));
    if (R() < J.play.int) { r.to = 'int'; r.toAt = r.catchD; r.ret = Math.round(R() * R() * 12); }
    else if (R() < (deep ? cv.deepComp : cv.comp) * J.play.comp) { r.comp = true; r.yards = r.catchD + clamp(Math.round(1 + gauss(R) * 2), 0, J.play.yacCap); }
    else r.inc = true;
  }
  if (!r.to && r.yards >= toGoal) { r.yards = toGoal; r.td = true; }
  r.clock = r.inc ? 5 : r.td ? 6 : r.to ? 8 : 27 + Math.floor(R() * 13);
  return r;
}
/* a run in the open field: go for the strip, or wrap him up */
function tackleResolve(L, P_, strip) {
  const T = C.defCalls.tackle, r0 = P_.r, off = L.poss, oP = L.T[off].P, dP = L.T[1 - off].P, toGoal = 100 - L.ball, R = Math.random, lvl = levelOf(r0);
  const r = Object.assign({}, r0, { lvl, oob: false }), v = { p: (oP[r.slot] || {}).name || '', d: dP[r.dslot].name };
  delete r.td; delete r.to;
  if (strip) {
    if (R() < stripP(dP, r.dslot)) { r.big = false; r.yards = lvl + 1; r.to = 'fum'; r.toAt = Math.min(r.yards, toGoal - 1); r.ret = Math.floor(R() * 6); }
    else { r.yards = r0.yards + T.missYds[0] + Math.floor(R() * (T.missYds[1] - T.missYds[0] + 1)); P_.res.dlog.push(['stripMiss', 1 - off, v]); }
  } else if (R() < whiffP(dP, r.dslot)) { r.yards = r0.yards; P_.res.dlog.push(['wrapWhiff', off, v]); }
  else { r.big = false; r.yards = lvl + T.wrap[0] + Math.floor(R() * (T.wrap[1] - T.wrap[0] + 1)); P_.res.dlog.push(['wrapUp', 1 - off, v, 'after']); }
  if (!r.to && r.yards >= toGoal) { r.yards = toGoal; r.td = true; }
  r.clock = r.td ? 6 : r.to ? 8 : 27 + Math.floor(R() * 13);
  return r;
}
/* the run, paused where it reaches your last defender */
function tackleAnim(L, r) {
  const off = L.poss, b = L.ball, lvl = levelOf(r);
  return { off, los: absX(off, b), dir: off === 0 ? 1 : -1, fd: L.togo < 100 - b ? absX(off, b + L.togo) : null, b, k: 'run', id: r.id, slot: r.slot, dslot: r.dslot,
    y: lvl + 6, lvl, lane: r.lane, stopAt: .7, tagAt: r.dslot, tagText: 'LAST MAN', lbl: '' };
}
/* answer whatever the play is waiting on: k is the button (1 or 2); 0 plays it out as simulated (the assistant) */
function decidePend(L, k) {
  const P_ = L.pend; if (!P_) return;
  if (!P_.type || P_.type === 'read') return decideThrow(L, k === 2);
  delete L.pend;
  L.anims = []; L.recap = []; L.pre = snapOf(L);
  P_.res.dlog = [];
  const r = !k ? P_.r : P_.type === 'jump' ? jumpResolve(L, P_, k === 1) : tackleResolve(L, P_, k === 1);
  if (k) P_.res.dcall = P_.type === 'jump' ? (k === 1 ? 'jump' : 'play') : (k === 1 ? 'strip' : 'wrap');
  finishCall(L, P_.O, P_.D, P_.res, r);
  if (L.anims[0]) L.anims[0].from = P_.anim.stopAt != null ? P_.anim.stopAt : readT(P_.r.id);
}
/* you answered the QB's read: throw it anyway, or throw it away */
function decideThrow(L, away) {
  const P_ = L.pend; if (!P_) return;
  delete L.pend;
  L.anims = []; L.recap = [];
  L.pre = { sc: L.sc.slice(), q: L.q, clk: L.clk, down: L.down, togo: L.togo, ball: L.ball, poss: L.poss, log: L.log.length };
  const r = away ? throwAway(L, P_.r) : P_.r;
  P_.res.read = away ? 'away' : 'threw';
  finishCall(L, P_.O, P_.D, P_.res, r);
  if (L.anims[0]) L.anims[0].from = readT(P_.r.id);
}
const readT = id => (id = baseOf(id)) === 'screen' ? .34 : id === 'slant' ? .26 : .38;
function readAnim(L, r) {
  const off = L.poss, b = L.ball;
  return { off, los: absX(off, b), dir: off === 0 ? 1 : -1, fd: L.togo < 100 - b ? absX(off, b + L.togo) : null, b, k: 'pass', id: r.id, slot: r.slot, dslot: r.dslot,
    y: 0, cd: r.catchD, lane: r.lane, inc: true, lbl: 'COVERED', read: true };
}

/* ---------------- after the final whistle ---------------- */
const gradeLetter = c => { const n = c.smart + c.ok + c.even + c.bad; const s = n ? (c.smart + .5 * c.ok + .7 * c.even) / n : 0; return s >= .75 ? 'A' : s >= .58 ? 'B' : s >= .42 ? 'C' : s >= .3 ? 'D' : 'F'; };
function settle(L) {
  if (L.done) return;
  const st = H(); L.done = true;
  const [a, b] = L.sc, res = a > b ? 'w' : a < b ? 'l' : 't', P = C.pay || {}, c = L.calls, n = c.smart + c.ok + c.even + c.bad, grade = gradeLetter(c);
  bump(res); bump('games'); bump('smart', c.smart); bump('calls', n);
  let pay = (P.base || 40) + (res === 'w' ? P.win || 60 : res === 't' ? P.tie || 30 : 0) + (grade === 'A' ? P.gradeA || 40 : grade === 'B' ? P.gradeB || 20 : 0);
  if (L.nx.kind === 'po' && res === 'w') pay += P.playoffWin || 80;
  api.earn(pay);
  /* player XP: what they did, plus the whole team learning from your calls */
  const team = Math.max(0, Math.round(c.smart * .7 - c.bad * .5)) + (res === 'w' ? 10 : 0), ups = [];
  SLOTS.forEach(s => {
    const sp = L.T[0].P[s], p = allOf(you()).find(q => q.id === sp.id); if (!p) return;
    const x = L.box[0][s] || {};
    const gain = 6 + team + ((x.ry || 0) + (x.recy || 0) + (x.py || 0) / 3) / 5 + 8 * ((x.td || 0) + (x.ptd || 0)) + 2 * (x.rec || 0) + 3 * (x.tkl || 0) + 8 * (x.sk || 0) + 12 * (x.int || 0) + 8 * (x.ff || 0) + 3 * (x.fgm || 0);
    if (giveXp(p, gain)) ups.push(p);
  });
  st.bench.forEach(p => { if (!p.camp) giveXp(p, 5 + team / 3); });
  const chemD = Math.round((st.chem - L.chem0) * 10) / 10;
  /* injuries: last week's heal a game, then this game's take hold */
  const healed = healTick(allOf(you())), fromCamp = campTick();
  const hurt = [];
  recordResult(L.nx, a, b);
  const opp = teamById(L.T[1].id);
  (L.inj || []).forEach(x => {
    if (x.walk) return;
    const p = (x.tm === 0 ? allOf(you()) : opp ? allOf(opp) : []).find(q => q.id === x.id);
    if (p) { p.inj = { g: x.g, what: x.what }; if (x.tm === 0) hurt.push(p); }
  });
  if (opp) bestLineup(opp);
  healed.concat(fromCamp.map(x => x[0])).forEach(p => { if (!SLOTS.some(s => st.roster[s] === p)) fillYou([p]); });
  const moved = fixLineup(), gaps = holes();
  st.last = { opp: L.T[1].name, a, b, res, grade, pay, label: L.nx.label, calls: c, chemD };
  bump('g' + grade);
  newMarket();
  ANIM.after.unshift(() => {
    api.toast(`${res === 'w' ? 'Win' : res === 'l' ? 'Loss' : 'Tie'} ${a}–${b} vs ${h(L.T[1].name)}<small>Coaching grade ${grade} · +${money(pay)} · chemistry ${chemD >= 0 ? '+' : ''}${chemD}</small>`, res === 'w' ? 'cash' : 'note');
    ups.forEach(p => api.toast(`Level up! <b>${h(p.name)}</b> (${p.pos}) is now level ${p.lvl}.`, 'rank'));
    hurt.forEach(p => api.toast(`🚑 <b>${h(p.name)}</b> (${p.pos}): ${h(p.inj.what.toLowerCase())}, ${injTxt(p.inj)}.`, 'note'));
    healed.forEach(p => api.toast(`<b>${h(p.name)}</b> (${p.pos}) is healthy again.`, 'cash'));
    fromCamp.forEach(campToast);
    moved.forEach(([p, c, s]) => api.toast(`${h(c.name)} starts at ${s} while ${h(p.name)} is hurt.`, 'note'));
    if (gaps.length) api.toast(`No healthy backup at ${gaps.join(', ')}. A walk-on will play there until you sign or trade for one.`, 'note');
  });
}
function closeGame() { const st = H(); if (st.live && st.live.done) { st.live = null; api.save(); } }
function startGame() {
  const st = H(); if (st.live && st.live.done) closeGame();
  const nx = yourNext(); if (!nx || st.live || st.over || (st.draft && !st.draft.done)) return;
  const opp = teamById(nx.opp);
  fixLineup(); bestLineup(opp);
  const A = snapTeam(you(), chemMod(st.chem)), B = snapTeam(opp, 0);
  B.color = fieldColors(A.color, B.color);
  const recv = ri(0, 1);
  const L = { id: Date.now().toString(36), nx, T: [A, B], sc: [0, 0], q: 1, clk: Q, poss: recv, ball: 25, down: 1, togo: 10, recv1: recv,
    opts: [], ev: [], log: [], anims: [], seq: 0, recO: [], recD: [], runs: [{ n: 0, y: 0 }, { n: 0, y: 0 }],
    box: [{}, {}], calls: { smart: 0, ok: 0, even: 0, bad: 0 }, chem0: st.chem, bonus: [chemMod(st.chem), 0], inj: [], res: null, pre: null, over: false, done: false, recap: [] };
  say(L, 'coin', recv, { t: L.T[recv].name });
  kickoff(L, 1 - recv);
  prep(L); delete L.recap;
  st.live = L; ANIM.busy = false; api.setTab('game'); api.save();
}
/* the assistant's call: an average coordinator, so it's no substitute for calling it yourself. It takes
   the best-graded option some of the time and the second or third best the rest; on special teams and
   the try it does what a sensible coach would */
function assistPick(L) {
  const lead = L.sc[0] - L.sc[1], late = L.q >= 4 && L.clk < 300;
  const find = id => Math.max(0, L.opts.findIndex(o => o.id === id || o.kind === id));
  if (L.pat) return L.q >= 4 && L.opts.length > 1 && (PAT().go2 || []).includes(lead) ? ri(1, L.opts.length - 1) : find('xp');
  if (L.ko) return L.ko.k === 0 ? find(late && lead < 0 && lead >= -16 ? 'onside' : 'deep') : find(late && lead > 0 && lead <= 16 ? 'koHands' : 'koRet');
  if (L.kick) return find(L.kick.show === 'fg' ? 'fgSafe' : 'ptRet');
  const rank = L.opts.map((o, i) => i).sort((a, b) => (L.ev[b] || 0) - (L.ev[a] || 0)), x = Math.random();
  return rank[x < .4 || rank.length < 2 ? 0 : x < .7 || rank.length < 3 ? 1 : 2];
}
function autoRest() {
  const L = H().live; if (!L || L.over) return;
  let guard = 0;
  EVAL_N.n = 40;
  try {
    if (L.pend) decidePend(L, L.pend.type && L.pend.type !== 'read' ? 0 : 1);
    while (!L.over && guard++ < 600) doCall(L, assistPick(L), true);
  } finally { EVAL_N.n = 90; }
  if (!L.over) {
    /* a playoff game can't end in a tie (see endQuarter) */
    if (L.nx.kind === 'po' && L.sc[0] === L.sc[1]) L.sc[ri(0, 1)] += 3;
    gameOver(L); settle(L);
  }
  L.anims = []; L.pre = null; ANIM.busy = false; flushAfter();
  api.save();
}
/* forget everything on screen that belonged to the old career (a reset, or a loaded save) */
function clearView() {
  HV.confirmReset = false; ANIM.busy = false; ANIM.after = [];
  HV.tr = { team: null, give: [], get: [], gp: [], tp: [], dr: 0, msg: null }; HV.dpos = ''; HV.release = null; HV.rename = false; HV.confirmAuto = false; HV.camp = null; HV.snap = null; HV.kick = null; CAM.x = null;
}
function newCareer() {
  if (!HV.confirmReset) { HV.confirmReset = true; return; }
  clearView();
  api.reset(); ensure(); api.save();
  api.toast('Game reset. A brand-new career begins: start with the opening draft.', 'note');
}

/* =====================================================================
   THE FIELD PICTURE
   Field coordinates in yards: x from −10 (your end zone) to 110, y from
   0 to 53.3 across. You always attack to the right. A play is drawn in
   "rel" coordinates (f = yards past the line of scrimmage, y across).
   ===================================================================== */
const ANIM = { busy: false, list: [], i: 0, t0: 0, after: [] };
function flushAfter() { const a = ANIM.after; ANIM.after = []; a.forEach(f => { try { f(); } catch (e) {} }); }
function startAnim(L) {
  ANIM.list = (L.anims || []).slice(); ANIM.i = 0; ANIM.t0 = performance.now(); ANIM.busy = ANIM.list.length > 0;
  if (!ANIM.busy) { L.pre = null; flushAfter(); }
}
function endAnim() { ANIM.busy = false; const L = H().live; if (L) L.pre = null; flushAfter(); rerender(); }
/* on a phone the field is often scrolled away by the time you pick a call: bring it back for the replay
   (on the next frame, after the page has been redrawn) */
function toField() {
  requestAnimationFrame(() => {
    const f = document.getElementById('fb-field'); if (!f || !ANIM.busy) return;
    const b = f.getBoundingClientRect(), calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (b.top < 0 || b.bottom > window.innerHeight) f.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'nearest' });
  });
}
const CAM = { x: null };
const VIEW_W = 92;
const lerp = (a, b, u) => a + (b - a) * u;
const ease = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
const MID = 26.65;
const OFF_F = [['OL0', -1, 22.6], ['OL1', -1, 24.6], ['OL2', -1, MID], ['OL3', -1, 28.7], ['OL4', -1, 30.7], ['QB', -4.5, MID], ['RB', -7, MID], ['TE', -1, 33.2], ['WR1', -1, 4], ['WR2', -1, 49.3], ['WR3', -1.5, 40]];
const DEF_F = [['DLa', 1, 21.4], ['DL1', 1, 24.9], ['DL2', 1, 28.4], ['DLb', 1, 31.9], ['LB3', 5, 19], ['LB1', 5, MID], ['LB2', 5, 34], ['CB1', 7, 4], ['CB2', 7, 49.3], ['S', 13, 33], ['S2', 13, 20]];
const FILLER = { OL0: 62, OL1: 65, OL2: 70, OL3: 73, OL4: 77, DLa: 94, DLb: 97, LB3: 52, S2: 31 };
const HASH = [[.4, 1.1], [22.6, 23.4], [29.9, 30.7], [52.2, 52.9]];
/* keyframes [[t, f, y], ...] → [f, y] at time t */
function KF(k, t) {
  if (t <= k[0][0]) return [k[0][1], k[0][2]];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i], e = ease((t - a[0]) / ((b[0] - a[0]) || 1)); return [lerp(a[1], b[1], e), lerp(a[2], b[2], e)]; }
  const z = k[k.length - 1]; return [z[1], z[2]];
}
const TGT = { RB1: 'RB', RB2: 'RB', QB: 'QB', TE: 'TE', WR1: 'WR1', WR2: 'WR2', WR3: 'WR3' };
function laneFor(role, id, y0) {
  id = baseOf(id);
  if (id === 'screen') return role.startsWith('WR') ? (y0 < MID ? y0 + 4 : y0 - 4) : MID + 8;
  if (id === 'slant') return y0 < MID ? y0 + 9 : y0 - 9;
  if (id === 'seam') return y0 - 3;
  return y0 < MID ? y0 + 3 : y0 - 3;
}
/* where everyone is at time u (0 to 1) of play A */
function scene(A, u) {
  A = Object.assign({}, A, { id: baseOf(A.id) });
  const st0 = {}; OFF_F.forEach(([r, f, y]) => { st0[r] = [f, y]; }); DEF_F.forEach(([r, f, y]) => { st0[r] = [f, y]; });
  const path = {}, keyed = r => path[r] || [[0, st0[r][0], st0[r][1]]];
  let holder = () => 'QB', ballAt = null, flight = null, flagAt = null, chase = true, catchT = .5;
  const tRole = TGT[A.slot] || 'RB';
  /* defaults: blockers push, receivers run, QB drops */
  ['OL0', 'OL1', 'OL2', 'OL3', 'OL4'].forEach(r => { path[r] = [[0, ...st0[r]], [.4, st0[r][0] + .8, st0[r][1]]]; });
  ['WR1', 'WR2', 'WR3'].forEach(r => { const [f, y] = st0[r]; path[r] = [[0, f, y], [.75, f + 13, y + (y < MID ? 2 : -2)]]; });
  path.TE = [[0, ...st0.TE], [.5, st0.TE[0] + 2, st0.TE[1]]];
  path.RB = [[0, ...st0.RB], [.3, -4, MID + 1]];
  path.QB = [[0, ...st0.QB], [.3, -6.5, MID]];
  if (A.k === 'run') {
    if (A.fake) {
      /* a fake: the punter (or the holder) keeps it */
      const sx = A.fake === 'punt' ? -13 : -7, lane = A.lane || MID; st0.QB = [sx, MID];
      if (A.fake === 'fg') { st0.RB = [-9.5, MID - 1.2]; path.RB = [[0, -9.5, MID - 1.2], [.25, -7.6, MID - .3]]; }
      path.QB = [[0, sx, MID], [.15, sx + .5, MID + (lane < MID ? -1.5 : 1.5)], [.9, A.y, lane]]; holder = () => 'QB';
    } else if (A.id === 'sneak') { st0.QB = [-1.5, MID]; path.QB = [[0, -1.5, MID], [.12, -1.5, MID], [.85, A.y, MID]]; holder = () => 'QB'; }
    else {
      path.QB = [[0, -4.5, MID], [.16, -5, MID], [.45, -6.5, MID - 1.5]];
      const lane = A.lane || MID, l2 = clamp(lane + (lane < MID ? -2 : 2), 1.5, 51.8);
      path.RB = A.id === 'sweep' ? [[0, -7, MID], [.16, -5.5, MID + .6], [.45, -2, lane], [.9, A.y, l2]] : [[0, -7, MID], [.16, -5, MID + .6], [.9, A.y, lane]];
      holder = t => t < .16 ? 'QB' : 'RB';
    }
    const car = A.id === 'sneak' || A.fake ? 'QB' : 'RB';
    /* a run that stopped for your open-field call: it reaches your last man at .7 either way */
    if (A.lvl != null) { const p = path[car], end = p[p.length - 1]; path[car] = p.filter(k => k[0] < .5).concat([[.7, A.lvl, end[2]], [.95, A.y, end[2]]]); }
    if (A.to) {
      const h0 = holder, ln = A.lane || MID; holder = t => t < .84 ? h0(t) : A.dslot;
      path[A.dslot] = [[0, ...st0[A.dslot]], [.84, A.y + 1, ln + .8], [.95, A.y + 1.6, ln + 1.2]];
    }
    catchT = 0;
    if (A.to) chase = car;
  } else if (A.k === 'pass') {
    const throwT = A.id === 'screen' ? .34 : A.id === 'slant' ? .26 : .38;
    catchT = throwT + (A.id === 'screen' ? .12 : A.id === 'slant' ? .14 : .22);
    path.QB = A.id === 'pa' ? [[0, -4.5, MID], [.14, -5, MID], [.32, -7.5, MID - .4]] : [[0, -4.5, MID], [.28, -7, MID]];
    if (A.id === 'pa') path.RB = [[0, -7, MID], [.14, -5, MID + .6], [.4, -1, MID + 1.5]];
    if (A.sack) {
      path.QB = [[0, -4.5, MID], [.28, -7, MID], [.55, A.y, MID]];
      path[A.dslot] = [[0, ...st0[A.dslot]], [.45, -6.2, MID + .4], [.55, A.y + .9, MID + .3]];
      holder = t => A.to && t > .58 ? A.dslot : 'QB';
      chase = 'QB';
    } else {
      const [f0, y0] = st0[tRole], lc = laneFor(tRole, A.id, y0), C0 = A.id === 'screen' ? [-2, lc] : [A.cd, lc];
      const C_ = A.away ? [Math.max(2, A.cd * .5), y0 < MID ? -3 : 56.3] : C0;
      path[tRole] = A.id === 'screen' ? [[0, f0, y0], [.3, -2.5, lc], [catchT, -2, lc]] : [[0, f0, y0], [catchT, C0[0], C0[1]]];
      const qbAt = KF(path.QB, throwT);
      flight = { t0: throwT, t1: catchT, from: qbAt, to: C_, peak: clamp(Math.hypot(C_[0] - qbAt[0], C_[1] - qbAt[1]) * .16, 1, 7) };
      if (A.comp) { path[tRole].push([.92, A.y, clamp(lc + (lc < MID ? 2 : -2), 1.5, 51.8)]); holder = t => t < throwT ? 'QB' : t < catchT ? null : tRole; }
      else if (A.inc) { path[tRole].push([catchT + .12, C0[0] + 1.5, C0[1]]); holder = t => t < throwT ? 'QB' : null; ballAt = t => t <= catchT ? null : [lerp(C_[0], C_[0] + 3, clamp((t - catchT) / .1, 0, 1)), C_[1] + 1]; }
      else if (A.to === 'int') {
        const back = A.deftd ? -(A.b) - 4 : C_[0] - Math.min(A.ret, A.b + C_[0] - 1);
        path[A.dslot] = [[0, ...st0[A.dslot]], [catchT, C_[0] + .6, C_[1] + .4], [.92, back, clamp(C_[1] + (C_[1] < MID ? 3 : -3), 1.5, 51.8)]];
        holder = t => t < throwT ? 'QB' : t < catchT ? null : A.dslot;
        chase = A.dslot;
      }
      if (!A.to) chase = tRole;
    }
  } else if (A.k === 'punt') {
    st0.QB = [-13, MID]; path.QB = [[0, -13, MID]];
    ballAt = t => t < .12 ? [lerp(0, -13, t / .12), MID] : t < .2 ? [-12.6, MID] : null;
    holder = () => null; chase = false;
    if (A.blk) {
      /* blocked: it pops loose behind the line and the defense scoops it */
      const sp = A.spot || -6, end = A.deftd ? -A.b - 3 : sp - Math.min(A.ret || 0, 8);
      ballAt = t => t < .12 ? [lerp(0, -13, t / .12), MID] : t < .3 ? [-12.6, MID] : null;
      flight = { t0: .3, t1: .42, from: [-12.4, MID], to: [sp, MID + 2], peak: 2.5 };
      path[A.dslot] = [[0, ...st0[A.dslot]], [.3, -11.6, MID + .6], [.45, sp, MID + 2], [.92, end, MID + 4]];
      holder = t => t < .45 ? null : A.dslot; chase = A.dslot;
      OFF_F.forEach(([r, f, y]) => { if (r !== 'QB') path[r] = [[0, f, y], [.3, f - 1, y], [.9, lerp(f, end, .6), lerp(y, MID, .4)]]; });
    } else {
      /* kick, catch, return: S2 is the returner, the punting team covers */
      const at = A.tb ? 100 - A.b + 6 : A.gross != null ? A.gross : A.net, ret = A.tb || A.fc || A.muff ? 0 : A.ret || 0;
      const end = A.rtd ? -A.b - 3 : at - ret, catchT = .62;
      flight = { t0: .2, t1: catchT, from: [-12.4, MID], to: [at, MID + 2], peak: 16 };
      path.S2 = [[0, ...st0.S2], [catchT, A.tb ? 100 - A.b - 2 : at, MID + 2.4]];
      if (ret) path.S2.push([.95, end, MID + 5]);
      if (A.muff) {
        path.WR1 = [[0, ...st0.WR1], [.25, ...st0.WR1], [.74, at + 1.2, MID + 3]];
        ballAt = t => t < .12 ? [lerp(0, -13, t / .12), MID] : t < .2 ? [-12.6, MID] : t > catchT && t < .74 ? [at + lerp(0, 1.2, (t - catchT) / .12), MID + 3] : null;
      }
      holder = t => t < catchT || A.tb ? null : A.muff ? (t < .74 ? null : 'WR1') : 'S2';
      ['DLa', 'DL1', 'DL2', 'DLb', 'LB3', 'LB1', 'LB2', 'CB1', 'CB2', 'S'].forEach((r, i) => { const [f, y] = st0[r]; path[r] = [[0, f, y], [.6, f + 10 + i, y], [.95, lerp(f + 10 + i, end + 2, .5), lerp(y, MID + 5, .4)]]; });
      OFF_F.forEach(([r, f, y], i) => { if (r === 'QB' || (A.muff && r === 'WR1')) return; path[r] = [[0, f, y], [.25, f, y], [.95, A.rtd ? end + 5 + i : end + 1.5 + (i % 3), lerp(y, MID + 5, A.rtd ? .3 : .7)]]; });
    }
  } else if (A.k === 'fg') {
    st0.QB = [-7, MID]; path.QB = [[0, -7, MID]]; st0.RB = [-9.5, MID - 1.2]; path.RB = [[0, -9.5, MID - 1.2], [.25, -7.6, MID - .3], [.4, -6.6, MID]];
    flight = { t0: .25, t1: .8, from: [-7, MID], to: [100 - A.b + 10 - (A.short ? 12 : 0), MID + (A.missY != null ? A.missY : A.good ? 0 : A.miss)], peak: A.short ? 7 : 11 };
    ballAt = t => t < .15 ? [lerp(0, -7, t / .15), MID] : t < .25 ? [-7, MID] : null;
    holder = () => null; chase = false;
    ['DLa', 'DL1', 'DL2', 'DLb'].forEach(r => { const [f, y] = st0[r]; path[r] = [[0, f, y], [.3, f - .8, y]]; });
    ['WR1', 'WR2', 'WR3', 'TE'].forEach(r => { path[r] = [[0, ...st0[r]]]; });
    if (A.blk) {
      /* blocked at the line: a defender picks it up */
      const end = A.deftd ? -A.b - 3 : -2 - (A.ret || 0), bl = A.dslot || 'DL1';
      flight = { t0: .25, t1: .38, from: [-7, MID], to: [-3, MID + 3], peak: 2.5 };
      path[bl] = [[0, ...st0[bl]], [.25, -5.5, MID + .5], [.42, -3, MID + 3], [.92, end, MID + 5]];
      holder = t => t < .42 ? null : bl; chase = bl;
    }
  } else if (A.k === 'ko') {
    /* kickoff from the 35: f is yards toward the receiving team's goal line (65 yards away) */
    const cov = ['WR1', 'OL0', 'OL1', 'TE', 'OL2', 'OL3', 'OL4', 'RB', 'WR3', 'WR2'], cy = [3, 8, 13, 18, 23, 30.3, 35.3, 40.3, 45.3, 50.3];
    const front = ['DLa', 'DL1', 'DL2', 'DLb', 'LB3'], fy = [8, 19, 27, 35, 45], back = ['LB1', 'LB2', 'CB1', 'CB2', 'S2'];
    const on = A.kt === 'onside', at = A.at || 62, end = A.endF != null ? A.endF : at, done = .92;
    cov.forEach((r, i) => { st0[r] = [-1, cy[i]]; }); st0.QB = [-7, MID + 1];
    front.forEach((r, i) => { st0[r] = [11.5, fy[i]]; });
    st0.LB1 = [24, 15]; st0.LB2 = [24, 38]; st0.CB1 = [34, MID - 7]; st0.CB2 = [34, MID + 7];
    st0.S = [on ? 30 : at + (A.kt === 'squib' ? 5 : -1), MID + 2]; st0.S2 = [on ? 30 : Math.max(30, at - 7), MID - 8];
    path.QB = [[0, -7, MID + 1], [.12, -.6, MID], [done, end - 4, MID + 2]];
    ballAt = t => t < .12 ? [0, MID] : null; holder = () => null; chase = false;
    if (on) {
      const s = [at, MID - 5], kr = 'OL2', rr = 'DL2';
      flight = { t0: .12, t1: .34, from: [0, MID], to: s, peak: 1.4 };
      cov.concat(front, ['LB1', 'LB2']).forEach(r => { const [f, y] = st0[r]; path[r] = [[0, f, y], [.12, f, y], [.45, lerp(f, s[0], .8), lerp(y, s[1], .7)]]; });
      path[kr] = [[0, ...st0[kr]], [.12, ...st0[kr]], [.36, s[0] - .3, s[1] + .2]];
      path[rr] = [[0, ...st0[rr]], [.36, s[0] + .4, s[1] - .3]];
      holder = t => t < .38 ? null : A.rec === 'kick' ? kr : rr;
      path.QB = [[0, -7, MID + 1], [.12, -.6, MID], [.6, s[0] - 4, s[1] + 2]];
    } else {
      const catchT = A.kt === 'squib' ? .44 : .5, ret = !A.tb && !A.fc;
      flight = { t0: .12, t1: catchT, from: [0, MID], to: [at, MID + 2], peak: A.kt === 'squib' ? 1.8 : 18 };
      path.S = [[0, ...st0.S], [catchT, at, MID + 2]]; if (ret) path.S.push([done, end, MID + 5]);
      holder = t => t < catchT ? null : A.fum && t > .82 ? 'OL2' : 'S';
      cov.forEach((r, i) => { const [f, y] = st0[r]; path[r] = [[0, f, y], [.12, f, y], [r === 'OL2' && A.fum ? .8 : done, A.deftd ? end + 6 + i : ret ? end + 1 + (i % 3) * 1.2 : at - 6 - (i % 3) * 2, lerp(y, MID + 5, A.deftd ? .3 : ret ? .7 : .4)]]; });
      front.concat(back).forEach((r, i) => { const [f, y] = st0[r]; path[r] = [[0, f, y], [.45, f + 6, lerp(y, MID, .3)], [done, ret ? lerp(f + 6, end, .5) + i % 3 : f + 6, lerp(y, MID + 5, .5)]]; });
    }
  } else if (A.k === 'flag') {
    OFF_F.forEach(([r, f, y]) => { path[r] = [[0, f, y]]; }); DEF_F.forEach(([r, f, y]) => { path[r] = [[0, f, y]]; });
    if (A.slot === 'QB' || A.id === 'sneak') st0.QB = [-1.5, MID], path.QB = [[0, -1.5, MID]];
    chase = false; holder = () => 'QB'; flagAt = [.5, MID + 7];
  }
  if (A.flag && !A.pre) flagAt = [Math.max(1, (A.y || 0) / 2), MID - 8];
  /* the defense swarms whoever has the ball */
  const pos = {};
  OFF_F.forEach(([r]) => { pos[r] = KF(keyed(r), u); });
  const holderAt = t => { const r = holder(t); if (!r) return null; return path[r] ? KF(path[r], t) : pos[r] || KF(keyed(r), t); };
  const ballPos = t => {
    if (flight && t >= flight.t0 && t <= flight.t1) { const v = (t - flight.t0) / (flight.t1 - flight.t0); return [lerp(flight.from[0], flight.to[0], v), lerp(flight.from[1], flight.to[1], v), Math.sin(Math.PI * v) * flight.peak]; }
    if (ballAt) { const b = ballAt(t); if (b) return [b[0], b[1], 0]; }
    const hp = holderAt(t); if (hp) return [hp[0] + .4, hp[1] + .3, 0];
    if (flight && t > flight.t1) return [flight.to[0], flight.to[1], 0];
    return [0, MID, 0];
  };
  DEF_F.forEach(([r, f, y], i) => {
    if (path[r] || !chase) { pos[r] = KF(keyed(r), u); return; }
    const p0 = [f, y], jit = r === A.dslot ? [.9, 0] : [((i % 3) - 1) * 1.3, (((i * 7) % 5) - 2) * .9];
    const reach = r === A.dslot ? 1 : [.55, .72, .84, .93][i % 4];
    const tgtAt = t => {
      if (A.k === 'pass' && !A.sack && t < catchT) {
        if (r.startsWith('DL')) return KF(keyed('QB'), t);
        if (r === A.dslot) { const p = KF(keyed(tRole), t); return [p[0] + .8, p[1] + .5]; }
        return [p0[0] + 3, p0[1]];
      }
      const b = ballPos(t); return [b[0], b[1]];
    };
    const k = ease(clamp((u - .1) / .85, 0, 1)) * reach, tg = tgtAt(u);
    pos[r] = [lerp(p0[0], tg[0] + jit[0], k), lerp(p0[1], tg[1] + jit[1], k)];
  });
  const ball = ballPos(u);
  const carrier = holder(u);
  return { pos, ball, carrier, flagAt, st0 };
}
function draw(cv, L, A, u) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 640, ch = cv.clientHeight || cw * .62;
  const W = Math.round(cw * dpr), Hh = Math.round(ch * dpr);
  if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
  const x = cv.getContext('2d'), s = W / VIEW_W, viewH = Hh / s, yOff = (viewH - 53.3) / 2;
  const P = L.pre && A ? L.pre : L;
  const off = A ? A.off : P.poss, dir = A ? A.dir : (P.poss === 0 ? 1 : -1), los = A ? A.los : absX(P.poss, P.ball);
  const fd = A ? A.fd : (P.togo < 100 - P.ball ? absX(P.poss, P.ball + P.togo) : null);
  const S = A ? scene(A, u) : null;
  const toAbs = p => [los + p[0] * dir, p[1]];
  const focus = A ? toAbs(S.ball)[0] : los + 12 * dir;
  const lo = -10 + VIEW_W / 2 - 4, hi = 110 - VIEW_W / 2 + 4, tx = clamp(focus, lo, hi);
  if (CAM.x == null || !A && Math.abs(CAM.x - tx) > 60) CAM.x = tx;
  CAM.x += (tx - CAM.x) * (A ? .1 : .07);
  CAM.still = Math.abs(tx - CAM.x) < .01;
  const x0 = CAM.x - VIEW_W / 2, X = v => (v - x0) * s, Y = v => (v + yOff) * s;
  /* grass, end zones, lines */
  x.fillStyle = '#2b5a29'; x.fillRect(0, 0, W, Hh);
  for (let v = 0; v < 100; v += 5) { x.fillStyle = (v / 5) % 2 ? '#3a8236' : '#3f8a3a'; x.fillRect(X(v), Y(0), 5 * s + 1, 53.3 * s); }
  const ez = (from, col, name, rot) => {
    x.fillStyle = col; x.fillRect(X(from), Y(0), 10 * s, 53.3 * s);
    x.save(); x.translate(X(from + 5), Y(MID)); x.rotate(rot);
    x.font = `800 ${Math.min(4.2 * s, 46 * s / Math.max(8, name.length) * 1.6)}px system-ui, -apple-system, Segoe UI, sans-serif`;
    x.fillStyle = light(col) ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.85)'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name.toUpperCase(), 0, 0); x.restore();
  };
  ez(-10, L.T[0].color, L.T[0].name, -Math.PI / 2); ez(100, L.T[1].color, L.T[1].name, Math.PI / 2);
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = Math.max(1, .3 * s); x.strokeRect(X(-10), Y(0), 120 * s, 53.3 * s);
  /* only what's on screen, each kind of line in one path */
  const vis = v => X(v) > -4 && X(v) < W + 4;
  x.strokeStyle = 'rgba(255,255,255,.72)';
  x.lineWidth = Math.max(2, .45 * s); x.beginPath(); [0, 100].forEach(v => { x.moveTo(X(v), Y(0)); x.lineTo(X(v), Y(53.3)); }); x.stroke();
  x.lineWidth = Math.max(1, .18 * s); x.beginPath();
  for (let v = 5; v < 100; v += 5) if (vis(v)) { x.moveTo(X(v), Y(0)); x.lineTo(X(v), Y(53.3)); }
  x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = Math.max(1, .12 * s); x.beginPath();
  for (let v = 1; v < 100; v++) { if (v % 5 === 0 || !vis(v)) continue; for (const [a, b] of HASH) { x.moveTo(X(v), Y(a)); x.lineTo(X(v), Y(b)); } }
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = `700 ${2.4 * s}px system-ui, -apple-system, Segoe UI, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let v = 10; v <= 90; v += 10) { const t = String(v <= 50 ? v : 100 - v); x.fillText(t, X(v), Y(8)); x.save(); x.translate(X(v), Y(45.3)); x.rotate(Math.PI); x.fillText(t, 0, 0); x.restore(); }
  x.strokeStyle = '#ffd23f'; x.lineWidth = Math.max(2, .5 * s);
  [-10, 110].forEach(v => { x.beginPath(); x.moveTo(X(v), Y(MID - 3.1)); x.lineTo(X(v), Y(MID + 3.1)); x.stroke(); });
  /* line of scrimmage and the line to gain */
  if (!L.over || A) {
    x.lineWidth = Math.max(2, .35 * s);
    x.strokeStyle = 'rgba(60,140,255,.9)'; x.beginPath(); x.moveTo(X(los), Y(0)); x.lineTo(X(los), Y(53.3)); x.stroke();
    if (fd != null) { x.strokeStyle = 'rgba(255,214,40,.95)'; x.beginPath(); x.moveTo(X(fd), Y(0)); x.lineTo(X(fd), Y(53.3)); x.stroke(); }
  }
  /* players */
  const oT = L.T[off], dT = L.T[1 - off], rbS = A && A.slot === 'RB2' ? 'RB2' : 'RB1';
  const numOf = (r, isOff) => {
    if (FILLER[r]) return FILLER[r];
    if (isOff) { if (A && (A.k === 'punt' || A.k === 'ko' || A.fake === 'punt') && r === 'QB') return oT.P.K.num; if (A && (A.k === 'fg' || A.fake === 'fg') && r === 'RB') return oT.P.K.num; return (oT.P[r === 'RB' ? rbS : r] || {}).num; }
    return (dT.P[r] || {}).num;
  };
  const rad = .95 * s, dot = (p, col, n, hl) => {
    const [ax, ay] = toAbs(p), px = X(ax), py = Y(ay);
    x.fillStyle = 'rgba(0,0,0,.25)'; x.beginPath(); x.arc(px + rad * .15, py + rad * .25, rad, 0, Math.PI * 2); x.fill();
    if (hl) { x.strokeStyle = '#ffd23f'; x.lineWidth = Math.max(2, rad * .35); x.beginPath(); x.arc(px, py, rad * 1.45, 0, Math.PI * 2); x.stroke(); }
    x.fillStyle = col; x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1; x.stroke();
    if (rad >= 7 && n != null) { x.fillStyle = light(col) ? '#141414' : '#fff'; x.font = `600 ${rad * 1.05}px system-ui, -apple-system, Segoe UI, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), px, py + rad * .05); }
  };
  if (!L.over || A) {
    const idle = {}; OFF_F.forEach(([r, f, y]) => { idle[r] = [f, y]; }); DEF_F.forEach(([r, f, y]) => { idle[r] = [f, y]; });
    if (!A && L.opts && L.poss === 0 && L.opts.every(o => o.kind === 'play' && baseOf(o.id) === 'sneak')) idle.QB = [-1.5, MID];
    const pos = S ? S.pos : idle;
    DEF_F.forEach(([r]) => dot(pos[r], dT.color, numOf(r, false), S && S.carrier === r));
    OFF_F.forEach(([r]) => dot(pos[r], oT.color, numOf(r, true), S && S.carrier === r && u > .15));
  }
  /* the ball */
  const bp = S ? S.ball : [-.3, MID, 0];
  if (!L.over || A) {
    const [ax, ay] = toAbs(bp), px = X(ax), py = Y(ay), lift = bp[2] || 0, sc = 1 + lift * .09;
    if (lift > .3) { x.fillStyle = 'rgba(0,0,0,.25)'; x.beginPath(); x.ellipse(px + lift * s * .25, py + lift * s * .35, .55 * s, .3 * s, 0, 0, Math.PI * 2); x.fill(); }
    x.save(); x.translate(px, py - lift * s * .15); x.rotate(dir > 0 ? 0 : Math.PI);
    x.fillStyle = '#7b3f1a'; x.strokeStyle = '#2e160a'; x.lineWidth = 1.2;
    x.beginPath(); x.ellipse(0, 0, .62 * s * sc, .38 * s * sc, 0, 0, Math.PI * 2); x.fill(); x.stroke();
    x.strokeStyle = '#fff'; x.lineWidth = Math.max(1, .07 * s); x.beginPath(); x.moveTo(-.2 * s * sc, 0); x.lineTo(.2 * s * sc, 0); x.stroke();
    x.restore();
  }
  /* flags and labels */
  if (S && S.flagAt && u > .3) {
    const [ax, ay] = toAbs(S.flagAt), px = X(ax), py = Y(ay);
    x.fillStyle = '#ffd400'; x.strokeStyle = '#6b5800'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + .9 * s, py - .5 * s); x.lineTo(px + .2 * s, py - 1 * s); x.closePath(); x.fill(); x.stroke();
  }
  const tag = (text, px, py, bg, fg, size) => {
    x.save(); x.font = `800 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
    const w = x.measureText(text).width + size * .8;
    x.fillStyle = bg; x.beginPath(); x.roundRect ? x.roundRect(px - w / 2, py - size * .75, w, size * 1.5, size * .35) : x.rect(px - w / 2, py - size * .75, w, size * 1.5); x.fill();
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, px, py + size * .05); x.restore();
  };
  if (A && A.read) {
    const tr = { RB1: 'RB', RB2: 'RB', QB: 'QB', TE: 'TE', WR1: 'WR1', WR2: 'WR2', WR3: 'WR3' }[A.slot] || 'RB', tp = S.pos[tr];
    if (tp && u >= readT(A.id) - .02) { const [ax, ay] = toAbs(tp), fs = Math.max(12, 1.7 * s); tag('COVERED', clamp(X(ax), W * .1, W * .9), clamp(Y(ay) - 2.2 * s, fs, Hh - fs), '#c0392b', '#fff', fs); }
  }
  if (A && A.tagAt && S.pos[A.tagAt] && u >= (A.stopAt || 1) - .02) { const [ax, ay] = toAbs(S.pos[A.tagAt]), fs = Math.max(12, 1.7 * s); tag(A.tagText, clamp(X(ax), W * .1, W * .9), clamp(Y(ay) - 2.2 * s, fs, Hh - fs), '#c0392b', '#fff', fs); }
  if (A && !A.read && u > .86) {
    const [ax, ay] = toAbs(bp), big = A.td || A.deftd, fs = Math.max(13, (big ? 3.2 : 2.1) * s);
    const col = A.win != null ? L.T[A.win].color : A.td ? L.T[A.off].color : A.deftd || A.to ? L.T[1 - A.off].color : A.flag || A.pre ? '#ffd400' : '#15161a';
    tag(A.lbl, clamp(X(ax), W * .15, W * .85), clamp(Y(ay) - 2.4 * s, fs, Hh - fs), col, (A.flag || A.pre) ? '#141414' : light(col) ? '#141414' : '#fff', fs);
  }
  if (L.over && !A) {
    const w = L.sc[0] > L.sc[1] ? 0 : L.sc[0] < L.sc[1] ? 1 : -1, fs = Math.max(18, W * .05);
    x.fillStyle = 'rgba(15,15,20,.6)'; x.fillRect(0, Hh * .32, W, Hh * .36);
    x.fillStyle = '#ffd23f'; x.font = `800 ${fs}px system-ui, -apple-system, Segoe UI, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(`FINAL  ${L.sc[0]} – ${L.sc[1]}`, W / 2, Hh * .45);
    x.fillStyle = '#fff'; x.font = `600 ${fs * .5}px system-ui, -apple-system, Segoe UI, sans-serif`;
    x.fillText(w < 0 ? 'A tie' : `${L.T[w].name} win${L.q >= 5 ? ' in overtime' : ''}`, W / 2, Hh * .57);
  }
}
/* the last still picture drawn: skip redrawing it until something changes */
const DRAWN = { cv: null, key: '' };
function frame(ts) {
  requestAnimationFrame(frame);
  snapTick(ts); kickTick(ts);
  if (LOGSCROLL.on) { LOGSCROLL.on = false; const ul = document.getElementById('fb-log'); if (ul) ul.scrollTop = ul.scrollHeight; }
  const cv = document.getElementById('fb-field');
  const st = G() && G().games && G().games.grid, L = st && st.live;
  if (!cv || !L) { if (ANIM.busy) endAnim(); return; }
  if (!ANIM.busy) {
    const key = [L.id, L.seq, L.over, !!L.pend, !!L.ko, !!L.kick, L.poss, L.ball, L.togo, cv.clientWidth, cv.clientHeight, window.devicePixelRatio].join();
    if (DRAWN.cv === cv && DRAWN.key === key && CAM.still) return;
    DRAWN.cv = cv; DRAWN.key = key;
  } else DRAWN.key = '';
  let A = null, u = 1;
  if (ANIM.busy) {
    const d = st.fast ? 1000 : 2200, hold = st.fast ? 350 : 700, el = ts - ANIM.t0;
    if (el > d + hold) {
      ANIM.i++; ANIM.t0 = ts;
      if (ANIM.i >= ANIM.list.length) { endAnim(); return; }
    }
    A = ANIM.list[ANIM.i];
    const f = A.from || 0, stop = A.readStop ? (A.stopAt != null ? A.stopAt : readT(A.id)) : 1;
    u = clamp(f + (ts - ANIM.t0) / d, 0, stop);
    if (A.readStop && u >= stop) { endAnim(); return; }
  } else if (L.pend) { A = L.pend.anim; u = A.stopAt != null ? A.stopAt : readT(A.id); }
  else if (L.ko && !L.over) { A = { k: 'ko', off: L.ko.k, los: absX(L.ko.k, 35), dir: L.ko.k === 0 ? 1 : -1, fd: null, b: 35, kt: 'deep', at: 62, endF: 40 }; u = 0; }
  else if (L.kick && !L.over) { A = { k: L.kick.show, off: 1, los: absX(1, L.ball), dir: -1, fd: L.togo < 100 - L.ball ? absX(1, L.ball + L.togo) : null, b: L.ball, gross: 40 }; u = 0; }
  draw(cv, L, A, u);
}

/* =====================================================================
   SCREENS
   ===================================================================== */
const ballOn = (poss, b) => { const a = absX(poss, b); return a === 50 ? 'the 50' : a < 50 ? `your ${a}` : `their ${100 - a}`; };
const downTxt = (d, t, b) => `${ORD[d]} & ${t >= 100 - b ? 'Goal' : t}`;
const clockTxt = c => { c = Math.max(0, Math.ceil(c)); return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`; };
const perTxt = q => q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`;
function dotSvg(n, hex, size) {
  return `<svg class="tok" viewBox="-50 -50 100 100" width="${size || 40}" height="${size || 40}" aria-hidden="true"><circle r="44" fill="${hex}" stroke="rgba(0,0,0,.25)" stroke-width="3"/><text y="13" text-anchor="middle" font-size="38" font-weight="700" font-family="system-ui,sans-serif" fill="${light(hex) ? '#141414' : '#fff'}">${n}</text></svg>`;
}
const abBar = (k, v) => `<li><span>${h(ABN[k][0])}</span><i class="abar ${v >= 80 ? 'hi' : v >= 65 ? 'mid' : ''}"><b style="width:${v}%"></b></i><em>${v}</em></li>`;
function card(p, slot, acts, opts) {
  opts = opts || {};
  const e = effAb(p), o = ovr(p), nx = nextLvl(p), prev = (C.levels || [])[p.lvl - 1] || 0, rc = o >= 80 ? '#d69a10' : o >= 70 ? '#8a45d6' : o >= 62 ? '#2f7fd8' : '#8a8f98';
  return `<li class="pcard" style="--rc:${rc}">
    <div class="pc-top">${dotSvg(p.num, opts.hex || myHex(), 42)}<div class="pc-id"><p class="pc-name">${h(p.name)} <span class="pc-num">#${p.num}</span></p>
      <p class="pc-meta">${slot ? `<b>${slot}</b> · ` : ''}${h(POS[p.pos].name)} · Lv ${p.lvl}${p.pot ? ` · <span class="fb-pot">POT ${p.pot > baseOvr(p) ? p.pot : 'reached'}</span>` : ''}${p.col ? ` · ${h(p.col)}` : ''}</p>${p.inj ? `<p class="pc-inj">🚑 Injured · ${h(p.inj.what)} · ${injTxt(p.inj)}</p>` : ''}${p.camp ? `<p class="pc-inj pc-camp">🏕 At training camp · back in ${plural(p.camp.g, 'game')}</p>` : ''}</div>
      <div class="pc-ovr"><b>${o}</b><small>OVR</small></div></div>
    <ul class="pc-abs ${POS[p.pos].ab.length > 3 ? '' : 'three'}">${POS[p.pos].ab.map(k => abBar(k, e[k])).join('')}</ul>
    ${opts.noLvl ? '' : `<div class="pc-lvl">${nx ? `${api.bar(p.px - prev, nx - prev)}<span class="muted">${p.px - prev} / ${nx - prev} XP to level ${p.lvl + 1}</span>` : '<span class="muted">Top level</span>'}</div>`}
    ${acts ? `<div class="pc-acts">${acts}</div>` : ''}</li>`;
}
function chemPanel() {
  const st = H(), c = st.chem, m = chemMod(c), g = Math.round((c - 50) / (C.seasonGrowDiv || 10));
  const word = c >= 85 ? 'On fire' : c >= 65 ? 'Clicking' : c >= 40 ? 'Steady' : c >= 20 ? 'Grumbling' : 'Mutiny';
  return `<div class="farm-sec">${api.secHead('Team chemistry', `${word} · ${Math.round(c)} / 100`)}
    <div class="gbar chem ${c < 40 ? 'bad' : ''}"><i style="width:${c}%"></i></div>
    <p class="muted small-note">Right now every player plays <b class="${m > 0 ? 'good' : m < 0 ? 'badt' : ''}">${m >= 0 ? '+' : ''}${m}</b> in games. If the season ended today, everyone would ${g > 0 ? `<b class="good">grow +${g}</b>` : g < 0 ? `<b class="badt">shrink ${g}</b>` : 'stay the same'} over the off-season. Smart calls raise chemistry; bad calls drop it.</p></div>`;
}
function scoutTxt(t) { return `Offense: <b>${h(C.offStyles[t.style.off].name)}</b> · Defense: <b>${h(C.defStyles[t.style.def].name)}</b>`; }
function nextGameCard() {
  const st = H(), S = st.season;
  if (st.live && !st.live.done) {
    const L = st.live;
    return `<div class="bb-next live"><p class="label">Game on · ${perTxt(L.q)} ${clockTxt(L.clk)}</p><p class="bb-vs">${h(st.team.name)} <b>${L.sc[0]}</b> – <b>${L.sc[1]}</b> ${h(L.T[1].name)}</p>
      <button type="button" class="btn primary" data-gm="tab" data-tab="game">Back to the sideline</button></div>`;
  }
  if (st.live && st.live.done) return `<div class="bb-next"><p class="label">Final</p><p class="bb-vs">${h(st.team.name)} <b>${st.live.sc[0]}</b> – <b>${st.live.sc[1]}</b> ${h(st.live.T[1].name)}</p><button type="button" class="btn" data-gm="tab" data-tab="game">See the box score</button></div>`;
  if (st.over || !S) return '';
  if (st.draft && !st.draft.done && st.draft.yr === 0) return `<div class="bb-next live"><p class="label">Before season 1 · the opening draft</p>
    <p class="bb-vs">Every team starts uneven: your overall is <b>${teamOvr(st.roster)}</b>, and you’re ranked <b>#${powerRank('you')} of 8</b>.</p>
    <p class="small-note">Your strengths: ${strongTxt(you())}. Your weak spots: ${needTxt(you())}. Weaker teams pick first. Draft players who fix your weak spots and season 1 will go a lot better.</p>
    <button type="button" class="btn primary" data-gm="tab" data-tab="draft">Go to the draft</button></div>`;
  if (S.done) {
    const ch = teamById(S.champ);
    return `<div class="bb-next"><p class="label">Season ${S.n} is over</p><p class="bb-vs">${S.champ === 'you' ? '🏆 You won the championship!' : `Champions: <b>${h(ch ? ch.name : '')}</b>`}</p>
      ${S.grow ? `<p class="small-note">Off-season: every one of your players ${S.grow > 0 ? `<b class="good">+${S.grow}</b>` : `<b class="badt">${S.grow}</b>`} from team chemistry.</p>` : ''}
      ${st.draft && !st.draft.done ? `<p class="small-note">The draft is on before next season. You have ${plural(picksOf('you').filter(pk => pk.yr === st.draft.yr).length, 'pick')}.</p><button type="button" class="btn primary" data-gm="tab" data-tab="draft">Go to the draft</button>`
        : `<button type="button" class="btn primary" data-gm="new-season">Start season ${S.n + 1}</button>`}</div>`;
  }
  const nx = yourNext();
  if (!nx) return `<div class="bb-next"><p class="label">Playoffs</p><p class="bb-vs">You missed the playoffs this year.</p></div>`;
  const opp = teamById(nx.opp), m = chemMod(st.chem);
  return `<div class="bb-next"><p class="label">Next · ${h(nx.label)} · season ${S.n}</p>
    <p class="bb-vs"><span class="tdot" style="background:${myHex()}"></span>${h(st.team.name)} <span class="muted">(${teamOvr(st.roster)}${m ? `${m > 0 ? '+' : ''}${m}` : ''})</span> vs <span class="tdot" style="background:${opp.color}"></span>${h(opp.name)} <span class="muted">(${teamOvr(opp.roster)})</span></p>
    <p class="small-note">Scouting report · ${scoutTxt(opp)}</p>
    ${injLine(opp, 'Their injuries')}${injLine(you(), 'Your injuries')}
    ${holes().length ? `<p class="small-note badt">No healthy backup at ${holes().join(', ')}: a walk-on will play there.</p>` : ''}
    <button type="button" class="btn primary" data-gm="kickoff">Kick off</button></div>`;
}
function injLine(t, label) {
  const l = allOf(t).filter(p => p.inj);
  return l.length ? `<p class="small-note">🚑 ${label}: ${l.map(p => `${h(p.name)} <span class="muted">(${p.pos}, ${injTxt(p.inj)})</span>`).join(', ')}</p>` : '';
}
function overPanel() {
  const o = H().over; if (!o) return '';
  return `<div class="bb-over"><p class="label">Career over</p><p class="bb-over-head">Fired</p><p class="small-note">Two seasons in a row with fewer than ${C.hotSeatWins || 2} wins. The owner changed the locks.</p>
    <p class="muted small-note">Career: ${o.w}–${o.l}${o.t ? `–${o.t}` : ''} · ${plural(o.seasons || 0, 'season')} · ${plural(o.titles || 0, 'title')}</p>
    <div class="buy2 left"><button type="button" class="btn primary" data-gm="new-career">${HV.confirmReset ? 'Tap again to start over' : 'Start a new career'}</button></div></div>`;
}
function homeTab() {
  const st = H(), S = st.season, me = standings().find(x => x.id === 'you');
  const l = st.last;
  const last = l ? `<div class="farm-sec">${api.secHead('Last game', h(l.label || ''))}<p class="bb-last ${l.res === 'w' ? 'w' : 'l'}"><b>${l.res.toUpperCase()} ${l.a}–${l.b}</b> vs ${h(l.opp)} · coaching grade <b>${l.grade}</b> · +${money(l.pay)}</p>
    <p class="muted small-note">${l.calls.smart} smart, ${l.calls.ok + l.calls.even} fine, ${l.calls.bad} bad calls · chemistry ${l.chemD >= 0 ? '+' : ''}${l.chemD}</p></div>` : '';
  const name = HV.rename ? `<form class="nameform" data-gm-form="team-name"><input name="n" maxlength="30" value="${h(st.team.name)}" aria-label="Team name" autocomplete="off"><button type="submit" class="btn small primary">Save</button><button type="button" class="btn small quiet" data-gm="rename-cancel">Cancel</button></form>`
    : `<button type="button" class="btn small quiet" data-gm="rename">Rename</button>`;
  const cols = `<label class="outfit"><span>Colors</span><select data-gm-sel="color">${C.colors.map(c => `<option value="${c.id}" ${st.team.color === c.id ? 'selected' : ''}>${h(c.name)}</option>`).join('')}</select></label>`;
  const calls = stat('calls');
  return `<div class="farm-sec"><div class="bb-team"><span class="tdot big" style="background:${myHex()}"></span><div><p class="bb-tname">${h(st.team.name)}</p>
      <p class="muted small-note">Overall ${teamOvr(st.roster)} · season ${S ? S.n : 1}: ${me.w}–${me.l}${me.t ? `–${me.t}` : ''} · career ${stat('w')}–${stat('l')}${stat('t') ? `–${stat('t')}` : ''} · ${plural(stat('titles'), 'title')}</p></div>${name}${cols}</div></div>
    ${nextGameCard()}
    ${chemPanel()}
    <div class="farm-sec">${api.secHead('Your playbook', '', '<button type="button" class="btn small quiet" data-gm="tab" data-tab="book">Edit</button>')}
      <p class="small-note"><b>Offense:</b> ${st.book.off.map(id => h(PLAY[id].name)).join(', ')}<br><b>Defense:</b> ${st.book.def.map(id => h(DEFC[id].name)).join(', ')}</p></div>
    ${allOf(you()).some(p => p.inj) ? `<div class="farm-sec">${api.secHead('Injury report', '')}<ul class="fb-hist">${allOf(you()).filter(p => p.inj).map(p => `<li>🚑 <b>${h(p.name)}</b> ${p.pos} · ${h(p.inj.what)} · ${injTxt(p.inj)}</li>`).join('')}</ul></div>` : ''}
    ${last}
    ${calls ? `<p class="muted small-note">Career play-calling: ${Math.round(stat('smart') / calls * 100)}% smart calls over ${calls} snaps.</p>` : ''}
    ${api.saveBox()}
    <details class="farm-how" ${stat('games') ? '' : 'open'}><summary>How it works</summary><ul>
      <li>You are both coordinators. Every snap you pick <b>one of three calls</b>: a play on offense, a scheme on defense. That’s your whole job. The players throw, catch, run and tackle.</li>
      <li>Your three choices come from <b>your playbook</b>: up to ${BOOK_MAX} offensive plays and ${BOOK_MAX} defensive calls you pick on the Playbook tab, out of ${C.plays.length} plays and ${C.defs.length} defenses.</li>
      <li><b>Injuries</b> happen now and then. A hurt player sits out a few games (rarely the whole season) and the best healthy backup starts. Keep some depth on the bench, or a walk-on fills in.</li>
      <li>Every team starts with a random overall between ${(C.startRange || [50, 62]).join(' and ')}, with its own strong and weak positions. Before season 1 there’s an opening draft in power-ranking order (weakest team first). Draft to fix your weak spots.</li>
      <li><b>Smart calls</b> raise team chemistry, which makes every player better in games and makes them grow over the off-season. <b>Bad calls</b> do the opposite. Your players also earn XP from smart calls and big plays.</li>
      <li>How to call smart: look at the <b>down and distance</b> (3rd &amp; 9 needs a pass; 3rd &amp; 1 is a run), the <b>matchup number</b> on each play (your guy vs theirs), and the <b>scouting line</b> (what they usually call here). Each play says what it beats and what beats it.</li>
      <li>The other coordinator notices patterns. Call the same thing over and over and they’ll start sitting on it.</li>
      <li>Play-action works better once your run game is going (3+ runs averaging 4+ yards).</li>
      <li>Flags, fumbles and interceptions happen at random. Even the best call fails sometimes; you’re graded on the call, not the luck.</li>
      <li>You earn money after every game (more for wins and good coaching grades). Spend it on free agents and training.</li>
      <li>After every season there’s a 7-round college draft, NFL style: worst teams pick first, the champion picks last. Rookies start on your bench and grow toward their potential every off-season. Trade players, draft picks and cash on the Trade tab.</li>
      <li>A season is ${7} games, then the top ${C.playoffTeams || 4} make the playoffs. Win fewer than ${C.hotSeatWins || 2} games two seasons in a row and you’re fired.</li></ul></details>`;
}
/* ---------------- Game ---------------- */
/* what a play beats, by family of defense; what a defense stops, by family of play */
const BEATS = id => { const v = {}; DBASES.forEach(f => { v[f] = vsDefFam(id, f); }); return { beats: DBASES.filter(f => v[f] >= .5).sort((a, b) => v[b] - v[a]).map(f => DFAM[f] || f), weak: DBASES.filter(f => v[f] <= -.5).sort((a, b) => v[a] - v[b]).map(f => DFAM[f] || f) }; };
const STOPS = d => { const v = {}; PBASES.forEach(f => { v[f] = vsPlayFam(d, f); }); return { stops: PBASES.filter(f => v[f] <= -.5).sort((a, b) => v[a] - v[b]).map(f => PFAM[f] || f), weak: PBASES.filter(f => v[f] >= .5).sort((a, b) => v[b] - v[a]).map(f => PFAM[f] || f) }; };
function optHTML(L, o, i, busy) {
  const kb = `<span class="fb-key">${i + 1}</span>`;
  let body = '';
  if (o.kind === 'fg') {
    const k = L.T[0].P.K, dist = 100 - L.ball + 17, p = fgChance(k.ab, dist);
    body = `<b class="fb-on">Kick a field goal</b><span class="fb-what">${dist}-yard try for ${h(k.name)}. About ${Math.round(p * 100)}% to make it.${L.down < 4 ? ' Ends the drive now, even though it isn’t 4th down.' : ''} A miss gives them the ball at the spot.</span>`;
  } else if (o.sell) {
    const w = norm1(aiOffW(L, true)), run = Math.round(Object.keys(w).reduce((a, k) => a + (PLAY[k].group === 'run' ? w[k] : 0), 0) * 100);
    body = `<b class="fb-on">Sell out vs ${o.sell}</b><span class="fb-what">${o.sell === 'run' ? 'Everyone in the box, crash the line. Stuffs any run' : 'Blanket every receiver, nobody bites on a run fake. Shuts down any throw'}, but if they ${o.sell === 'run' ? 'throw' : 'run'} it, it’s wide open.</span>
      <span class="fb-bw">Doubles the matchup swing: for you if you guess right, against you if you don’t. They run it about ${run}% here.</span>`;
  } else if (o.kind === 'st') {
    body = `<b class="fb-on">${h(STC[o.id].name)}</b><span class="fb-what">${h(STC[o.id].what)}</span>`;
  } else if (o.kind === 'fakepunt' || o.kind === 'fakefg') {
    const fg = o.kind === 'fakefg', who = L.T[0].P[fg ? 'QB' : 'K'];
    body = `<b class="fb-on">${fg ? 'Fake field goal' : 'Fake punt'}</b><span class="fb-what">Line up to ${fg ? 'kick' : 'punt'}, then ${h(who.name)} keeps it and runs. Needs ${plural(L.togo, 'yard')}. Works best when they’re rushing the ${fg ? 'kick' : 'punt'}; if it fails they take over right here.</span>`;
  } else if (o.kind === 'xp') {
    const k = L.T[0].P.K;
    body = `<b class="fb-on">Kick the extra point</b><span class="fb-what">${h(k.name)} from 33 yards. About ${Math.round(xpChance(k.ab) * 100)}% for <b>1 point</b>. The safe call.</span>`;
  } else if (o.kind === 'punt') {
    const k = L.T[0].P.K;
    body = `<b class="fb-on">Punt</b><span class="fb-what">${h(k.name)} kicks it away, about ${Math.round(44 + (k.ab.kpow - 60) / 4)} yards before the return. Gives up the ball but pins them back.</span>`;
  } else if (o.kind === 'play') {
    const p = PLAY[o.id], c = comp(o.id, o.slot, L.T[0].P, L.T[1].P), e = Math.round(c.off - c.def), bt = BEATS(o.id), who = L.T[0].P[o.slot], dw = L.T[1].P[c.dslot];
    body = `<b class="fb-on">${h(p.name)}</b><span class="fb-who">${o.slot === 'QB' ? 'QB' : 'to'} ${h(who.name)} <span class="muted">(${o.slot})</span></span>
      <span class="fb-what">${h(p.what)}</span>
      <span class="fb-mu">Matchup vs ${h(dw.name)} <span class="muted">(${c.dslot})</span>: <b class="chip ${e >= 3 ? 'up' : e <= -3 ? 'down' : ''}">${Math.round(c.off)} vs ${Math.round(c.def)}</b></span>
      <span class="fb-bw">${bt.beats.length ? `Beats: ${h(bt.beats.join(', '))}` : ''}${bt.weak.length ? `${bt.beats.length ? ' · ' : ''}Weak vs: ${h(bt.weak.join(', '))}` : ''}</span>`;
  } else {
    const d = DEFC[o.id], sw = STOPS(o.id);
    body = `<b class="fb-on">${h(d.name)}</b><span class="fb-what">${h(d.what)}</span>
      <span class="fb-bw">${sw.stops.length ? `Stops: ${h(sw.stops.join(', '))}` : ''}</span><span class="fb-bw">${sw.weak.length ? `Weak vs: ${h(sw.weak.join(', '))}` : ''}</span>`;
  }
  return `<button type="button" class="fb-opt" data-gm="call" data-id="${i}" ${busy ? 'disabled' : ''}>${kb}<span class="fb-ob">${body}</span></button>`;
}
function scoutLine(L) {
  const late = L.q >= 4 && L.clk < 300, lead = L.sc[1] - L.sc[0];
  if (L.ko) return L.ko.k === 0 ? (late && lead > 0 ? `${h(L.T[1].name)} are ahead late: expect their hands team if you try an onside kick.` : 'Most teams kick it deep here. An onside kick is a surprise only if they aren’t expecting it.')
    : late && lead < 0 ? `${h(L.T[1].name)} are behind late. <b>Watch for the onside kick.</b>` : 'Most kicks are deep. A touchback or fair catch puts you at the 25.';
  if (L.kick) return L.togo <= 3 && L.ball >= 35 ? `It’s 4th & ${L.togo}: <b>a fake is a real possibility.</b>` : `4th & ${L.togo}: they’ll probably just kick it.`;
  const sit = L.down >= 3 && L.togo >= 7 ? `${ORD[L.down]} & long` : L.togo <= 2 ? 'short yardage' : `${ORD[L.down]} down`;
  if (L.poss === 0) {
    const w = famSum(norm1(aiDefW(L, true)), dbase), top = Object.keys(w).sort((a, b) => w[b] - w[a]).slice(0, 2);
    return `On ${sit}, ${h(L.T[1].name)} usually call: ${top.map(d => `<b>${h(DFAM[d] || d)}</b> (${Math.round(w[d] * 100)}%)`).join(', ')}.`;
  }
  const w = norm1(aiOffW(L, true)), grp = { run: 0, short: 0, deep: 0 };
  Object.keys(w).forEach(k => { grp[PLAY[k].group] += w[k]; });
  const nm = { run: 'run it', short: 'throw short', deep: 'throw deep' };
  const fv = favTarget(L), tg = L.tgt || {}, nT = Object.keys(tg).reduce((a, k) => a + tg[k], 0);
  return `On ${sit}, ${h(L.T[1].name)} usually ${Object.keys(grp).sort((a, b) => grp[b] - grp[a]).map(g => `<b>${nm[g]}</b> (${Math.round(grp[g] * 100)}%)`).join(', ')}.`
    + (fv ? ` Their QB’s favorite target today: <b>${h(L.T[1].P[fv].name)}</b> (${fv}, ${tg[fv]} of ${nT} throws).` : '');
}
const GRADE = { stGood: ['Special teams win', 'good', '✓'], stBad: ['Special teams loss', 'bad', '✗'], stOk: ['Special teams', 'even', '•'], patGood: ['Converted', 'good', '✓'], patBad: ['No good', 'bad', '✗'], patRedo: ['Flag', 'ok', '~'], smart: ['Smart call', 'good', '✓'], even: ['Fine call — all three were close', 'even', '≈'], ok: ['Okay call', 'ok', '~'], bad: ['Bad call', 'bad', '✗'] };
function snapHTML(s) {
  if (!s) return '';
  const [cls, txt] = s.k === 'good' ? ['good', `Clean snap · ${s.ms} ms`] : s.k === 'early' ? ['badt', s.ms == null ? 'Jumped before the green: false start' : `Guessed it (${s.ms} ms is too quick to be a reaction): false start`]
    : ['badt', s.ms == null ? 'Never snapped it: the rush got there first' : `Late snap · ${s.ms} ms: the rush got there first`];
  return `<p class="small-note fb-snapres ${cls}">⏱ ${txt}</p>`;
}
function defCallHTML(r) {
  const t = { jump: r.lookOff ? 'you jumped the route, but he looked you off' : 'you jumped the route', play: 'you played the receiver', strip: 'you went for the strip', wrap: 'you wrapped him up' }[r.dcall];
  const s = r.sell ? `<p class="small-note fb-snapres ${r.sell.right ? 'good' : 'badt'}">${r.sell.right ? '✓' : '✗'} Sold out vs the ${r.sell.on}: ${r.sell.right ? 'guessed right!' : 'they went the other way.'}</p>` : '';
  return s + (t ? `<p class="small-note">Your call: ${t}.</p>` : '');
}
function resHTML(L) {
  const r = L.res; if (!r) return '';
  const G_ = GRADE[r.g] || GRADE.ok;
  const rows = r.st ? `Your call: <b>${h(r.mine)}</b> · theirs: <b>${h(r.theirs)}</b>`
    : r.side === 0
    ? `Your play: <b>${h(r.mine)}</b>${r.theirs ? ` · their ${r.tl || 'defense'}: <b>${h(r.theirs)}</b>` : ''}`
    : `Your defense: <b>${h(r.mine)}</b> · their play: <b>${h(r.theirs)}</b>`;
  const recap = (r.recap || []).map(x => `<p class="small-note muted">Then ${h(L.T[1].name)}: ${h(x.them)}. ${h(x.res)}.</p>`).join('');
  return `<div class="fb-res ${G_[1]}"><p class="fb-grade"><span aria-hidden="true">${G_[2]}</span> ${G_[0]}</p>
    ${r.best ? `<p class="fb-rec">Recommended call: <b>${h(r.best)}</b>${r.why ? ` — ${h(r.why)}` : ''}</p>` : ''}
    ${snapHTML(r.snap)}${defCallHTML(r)}<p class="small-note">${rows}${r.read ? ` · covered read: you ${r.read === 'away' ? 'threw it away' : 'threw it anyway'}` : ''}</p><p class="fb-out">${h(r.out)}</p>${(r.inj || []).map(x => `<p class="fb-inj">🚑 ${h(x.s)}</p>`).join('')}${recap}</div>`;
}
function statLines(L, ti) {
  const T = L.T[ti], B = L.box[ti], out = [];
  SLOTS.forEach(s => {
    const x = B[s]; if (!x) return; const p = T.P[s], bits = [];
    if (x.att) bits.push(`${x.cmp || 0}/${x.att} passing, ${x.py || 0} yds${x.ptd ? `, ${x.ptd} TD` : ''}${x.ints ? `, ${x.ints} INT` : ''}`);
    if (x.car) bits.push(`${x.car} rush, ${x.ry || 0} yds`);
    if (x.rec) bits.push(`${x.rec} catch${x.rec > 1 ? 'es' : ''}, ${x.recy || 0} yds`);
    if (x.td) bits.push(`${x.td} TD`);
    if (x.tkl) bits.push(`${x.tkl} tkl`); if (x.sk) bits.push(`${x.sk} sack${x.sk > 1 ? 's' : ''}`); if (x.int) bits.push(`${x.int} INT`); if (x.ff) bits.push(`${x.ff} forced fumble${x.ff > 1 ? 's' : ''}`);
    if (x.fga) bits.push(`${x.fgm || 0}/${x.fga} FG`);
    if (bits.length) out.push(`<tr><td>${dotSvg(p.num, T.color, 22)} ${h(p.name)} <span class="muted">${s}</span></td><td>${bits.join(' · ')}</td></tr>`);
  });
  return `<div class="bb-box"><p class="label">${h(T.name)} · ${L.sc[ti]}</p><div class="tscroll"><table><tbody>${out.join('') || '<tr><td class="muted">Nothing to report.</td></tr>'}</tbody></table></div></div>`;
}
function gameTab() {
  const st = H(), L = st.live;
  if (!L) return `<div class="farm-sec">${api.secHead('No game on', '')}${nextGameCard() || '<p class="muted">Nothing scheduled.</p>'}</div>`;
  const busy = ANIM.busy, P = busy && L.pre ? L.pre : L, T = L.T, cols = [T[0].color, T[1].color];
  const logN = busy && L.pre ? L.pre.log : L.log.length;
  const log = L.log.slice(0, logN).map(l => `<li class="${l.tm == null ? 'neutral' : ''}" style="--tc:${l.tm == null ? 'var(--line)' : cols[l.tm]}">${l.s}</li>`).join('');
  const koK = busy ? (P.ko != null ? P.ko : null) : L.ko ? L.ko.k : null;
  const sit = (busy ? P.over : L.over) ? 'Final' : koK != null ? `Kickoff · <b>${koK === 0 ? 'You kick off' : 'They kick off to you'}</b>` : (busy ? P.pat : L.pat) ? `Try after the touchdown · ball on ${ballOn(P.poss, P.ball)} · <b>${P.poss === 0 ? 'Your try' : 'Their try'}</b>` : `${downTxt(P.down, P.togo, P.ball)} · ball on ${ballOn(P.poss, P.ball)} · <b>${P.poss === 0 ? 'You have the ball' : 'They have the ball'}</b>`;
  let panel;
  if (!busy && L.pend && L.pend.type === 'jump') {
    const P_ = L.pend, r = P_.r, oP = L.T[1].P, dP = L.T[0].P, who = oP[r.slot], dw = dP[r.dslot], tg = L.tgt || {}, n = tg[r.slot] || 0, nT = Object.keys(tg).reduce((a, k) => a + tg[k], 0);
    const read = favTarget(L) === r.slot ? `He’s thrown to ${h(who.name)} ${n} of ${nT} times today. He likes this matchup.` : n ? `${n} of ${nT} throws have gone to ${h(who.name)} today.` : `He hasn’t looked ${h(who.name)}’s way yet today. Could be a decoy.`;
    panel = `<div class="fb-call"><p class="fb-role d">Your read</p>
      <div class="fb-res bad"><p class="fb-grade">Their QB is forcing it to ${r.slot}</p><p class="small-note">${h(oP.QB.name)} is forcing it to ${h(who.name)} (${r.slot}) on the ${h(PLAY[r.id].name.toLowerCase())}. Your ${r.dslot} ${h(dw.name)} is right there. ${read}</p></div>
      <div class="fb-opts n2">
        <button type="button" class="fb-opt" data-gm="pend" data-id="1"><span class="fb-key">1</span><span class="fb-ob"><b class="fb-on">Jump the route</b><span class="fb-what">Undercut it. ${h(dw.name)} (ball skills ${Math.round(ballOf(dP, r.dslot))}) picks it off about ${Math.round(jumpIntP(dP, r.dslot) * 100)}% of the time, but if he misses, ${h(who.name)} has nobody behind him. A smart QB (IQ ${Math.round(abOf(oP, 'QB', 'iq'))}) can look you off, more so if you keep jumping.</span></span></button>
        <button type="button" class="fb-opt" data-gm="pend" data-id="2"><span class="fb-key">2</span><span class="fb-ob"><b class="fb-on">Play the receiver</b><span class="fb-what">Stay on his hip. Fewer completions and almost no yards after the catch, but you won’t get the pick.</span></span></button>
      </div></div>`;
  } else if (!busy && L.pend && L.pend.type === 'tackle') {
    const P_ = L.pend, r = P_.r, oP = L.T[1].P, dP = L.T[0].P, who = oP[r.slot] || {}, dw = dP[r.dslot], spot = ballOn(1, L.ball + levelOf(r));
    panel = `<div class="fb-call"><p class="fb-role d">Open field</p>
      <div class="fb-res bad"><p class="fb-grade">${h(who.name)} is loose</p><p class="small-note">${h(who.name)} breaks into the second level around ${spot}. Your ${r.dslot} ${h(dw.name)} (tackling ${Math.round(abOf(dP, r.dslot, 'tackle'))}) is the last man.</p></div>
      <div class="fb-opts n2">
        <button type="button" class="fb-opt" data-gm="pend" data-id="1"><span class="fb-key">1</span><span class="fb-ob"><b class="fb-on">Go for the strip</b><span class="fb-what">Punch at the ball: about ${Math.round(stripP(dP, r.dslot) * 100)}% to force a fumble. Miss, and he’s gone for extra yards, maybe a touchdown.</span></span></button>
        <button type="button" class="fb-opt" data-gm="pend" data-id="2"><span class="fb-key">2</span><span class="fb-ob"><b class="fb-on">Wrap him up</b><span class="fb-what">Take him down right there and live to play another down. About ${Math.round(whiffP(dP, r.dslot) * 100)}% he breaks it anyway.</span></span></button>
      </div></div>`;
  } else if (!busy && L.pend) {
    const P_ = L.pend, who = L.T[0].P[P_.r.slot], dw = L.T[1].P[P_.r.dslot], CV = C.coverage || {}, cv = CV.covered || {}, deep = ['bomb', 'pa'].includes(baseOf(P_.r.id));
    panel = `<div class="fb-call"><p class="fb-role o">The QB’s read</p>
      <div class="fb-res bad"><p class="fb-grade">${h(who.name)} is covered</p><p class="small-note">${h(dw.name)} (${P_.r.dslot}) is all over him on the ${h(PLAY[P_.r.id].name.toLowerCase())}. Throwing into coverage is caught only about ${Math.round((deep ? cv.deepComp : cv.comp) * 100)}% of the time and picked off about ${Math.round((deep ? cv.deepInt : cv.int) * 100)}%.</p></div>
      <div class="fb-opts n2">
        <button type="button" class="fb-opt" data-gm="throw" data-id="1"><span class="fb-key">1</span><span class="fb-ob"><b class="fb-on">Throw it anyway</b><span class="fb-what">Fit it in there. Big play if he catches it, but a real interception risk.</span></span></button>
        <button type="button" class="fb-opt" data-gm="throw" data-id="0"><span class="fb-key">2</span><span class="fb-ob"><b class="fb-on">Throw it away</b><span class="fb-what">Fire it out of bounds: incomplete, no turnover. Small chance of an intentional grounding flag.</span></span></button>
      </div></div>`;
  } else if (!busy && HV.kick && !L.over) panel = kickPanel(L);
  else if (!busy && HV.snap && !L.over) {
    const o = L.opts[HV.snap.i];
    panel = `<div class="fb-call"><p class="fb-role o">At the line · ${h(optName(o, L.T[0].P))}</p>
      <div class="fb-snap" id="fb-snap" aria-live="assertive"><span class="fb-snap-fill"></span><span class="fb-snap-txt">Set…</span></div>
      <p class="muted small-note">Press <span class="fb-key fb-key-w">Space</span> or tap the bar the instant it turns green. Too early is a false start; too slow and the rush gets there first: a sack, or a fumbled snap.</p></div>`;
  } else if (busy) panel = `<div class="fb-call"><p class="fb-role">Snap…</p><p class="muted small-note">Watching the play. Tap <button type="button" class="linkbtn" data-gm="skip-anim">skip</button> (or press <span class="fb-key fb-key-w">Esc</span>) to jump ahead.</p></div>`;
  else if (L.over) {
    const c = L.calls, n = c.smart + c.ok + c.even + c.bad, g = gradeLetter(c), l = st.last || {};
    panel = `<div class="fb-call">${resHTML(L)}<div class="fb-final"><p class="label">Final</p><p class="bb-over-head">${L.sc[0] > L.sc[1] ? 'You win!' : L.sc[0] < L.sc[1] ? 'You lose.' : 'A tie.'} ${L.sc[0]}–${L.sc[1]}</p>
      ${(L.inj || []).length ? `<p class="small-note">Injuries: ${L.inj.map(x => `${h(x.name)} <span class="muted">(${h(L.T[x.tm].name)}, ${h(x.what.toLowerCase())}, ${injTxt(x)})</span>`).join(' · ')}</p>` : ''}
      <p class="small-note">Coaching grade <b>${g}</b> · ${c.smart} smart, ${c.ok + c.even} fine, ${c.bad} bad out of ${n} calls · chemistry ${l.chemD >= 0 ? '+' : ''}${l.chemD != null ? l.chemD : ''} · paid ${money(l.pay || 0)}</p>
      <div class="buy2 left"><button type="button" class="btn primary" data-gm="close-game">Done</button></div></div></div>`;
  } else {
    const off = L.poss === 0;
    panel = `<div class="fb-call">${resHTML(L)}
      <p class="fb-role ${off ? 'o' : 'd'}">${L.ko ? (L.ko.k === 0 ? 'SPECIAL TEAMS · your kickoff' : 'SPECIAL TEAMS · they’re kicking off to you') : L.kick ? `SPECIAL TEAMS · they line up to ${L.kick.show === 'fg' ? 'kick a field goal' : 'punt'}` : L.pat ? `TRY FOR POINT · kick for 1, or run a play from the ${100 - L.ball} for 2` : off ? 'OFFENSE · you’re the Offensive Coordinator' : 'DEFENSE · you’re the Defensive Coordinator'}</p>
      <p class="small-note fb-scout">Scouting: ${scoutLine(L)}</p>
      <div class="fb-opts ${L.opts.length === 4 ? 'n4' : L.opts.length === 2 ? 'n2' : ''}">${L.opts.map((o, i) => optHTML(L, o, i, false)).join('')}</div>
      <div class="bb-ctl"><button type="button" class="btn small quiet" data-gm="fast" aria-pressed="${st.fast}">${st.fast ? 'Fast replays: on' : 'Fast replays: off'}</button>
        <button type="button" class="btn small quiet" data-gm="kick-game" aria-pressed="${st.kickGame !== false}">${st.kickGame !== false ? 'Kick mini game: on' : 'Kick mini game: off'}</button>
        <button type="button" class="btn small quiet" data-gm="snap-timing" aria-pressed="${st.snapTiming !== false}">${st.snapTiming !== false ? 'Snap timing: on' : 'Snap timing: off'}</button>
        <button type="button" class="btn small quiet" data-gm="ask-throw" aria-pressed="${st.askThrow !== false}">${st.askThrow !== false ? 'Ask me on covered throws: on' : 'Ask me on covered throws: off'}</button>
        <button type="button" class="btn small quiet" data-gm="auto">${HV.confirmAuto ? 'Tap again: the assistant calls the rest' : 'Let the assistant finish the game'}</button></div></div>`;
  }
  LOGSCROLL.on = true;
  return `<div class="bb-sim">
    <div class="bb-main">
      <div class="bb-board" role="group" aria-label="Scoreboard">
        <span class="bb-tm"><span class="tdot" style="background:${cols[0]}"></span><span class="bb-tn">${h(T[0].name)}</span>${P.poss === 0 && !L.over ? '<span class="fb-pos" title="Has the ball">●</span>' : ''}<b>${P.sc[0]}</b></span>
        <span class="bb-clock"><b>${perTxt(P.q)}</b><span>${clockTxt(P.clk)}</span></span>
        <span class="bb-tm r"><b>${P.sc[1]}</b>${P.poss === 1 && !L.over ? '<span class="fb-pos" title="Has the ball">●</span>' : ''}<span class="bb-tn">${h(T[1].name)}</span><span class="tdot" style="background:${cols[1]}"></span></span>
      </div>
      <p class="fb-sit">${sit}</p>
      <canvas id="fb-field" class="fb-field" role="img" aria-label="The field, seen from above. You attack to the right."></canvas>
      ${panel}
    </div>
    <div class="bb-side"><p class="label">Play-by-play</p><ul class="bb-chat" id="fb-log" aria-live="off">${log}</ul></div>
  </div>
  ${L.over && !busy ? `<div class="farm-sec">${api.secHead('Box score', '')}${statLines(L, 0)}${statLines(L, 1)}</div>` : ''}`;
}
/* scroll the play-by-play to the newest line on the next frame (see frame) */
const LOGSCROLL = { on: false };

/* ---------------- Roster ---------------- */
function rosterTab() {
  const st = H(), Tn = C.train || { price: 35, gives: 30 }, m = chemMod(st.chem), top = (C.levels || []).length;
  const train = (p, key) => p.lvl >= top || p.camp ? '' : api.cashBtn('train', key, Tn.price, `title="+${Tn.gives} XP"`, 'Train');
  const list = sl => `<ul class="pcards">${sl.map(s => card(st.roster[s], s, train(st.roster[s], s))).join('')}</ul>`;
  const bench = st.bench.slice().sort((a, b) => SLOTS.findIndex(s => SPOS[s] === a.pos) - SLOTS.findIndex(s => SPOS[s] === b.pos) || ovr(b) - ovr(a)).map(p => {
    const sel = out(p) ? '' : `<label class="outfit"><span>Start over</span><select data-gm-sel="start-for" data-id="${p.id}"><option value="">choose…</option>${SLOTS.filter(s => SPOS[s] === p.pos).map(s => `<option value="${s}">${h(st.roster[s].name)} (${s} · ${ovr(st.roster[s])})</option>`).join('')}</select></label>`;
    return card(p, 'Bench', p.camp ? '' : `${sel}${train(p, p.id)}<button type="button" class="btn small quiet" data-gm="release" data-id="${p.id}">${HV.release === p.id ? `Tap again: release · +${money(releasePay(p))}` : 'Release'}</button>`);
  }).join('');
  const gaps = holes();
  return `${gaps.length ? `<p class="bb-trmsg" role="status">🚑 No available backup at ${gaps.join(', ')}: a walk-on (about 42 overall) plays there until you sign a free agent, trade for someone, or the starter is back.</p>` : ''}
    ${campSec()}
    <div class="farm-sec">${api.secHead('Offense', `Team overall ${teamOvr(st.roster)}${m ? ` · ${m > 0 ? '+' : ''}${m} chemistry in games` : ''}`)}${list(OFF_SLOTS)}</div>
    <div class="farm-sec">${api.secHead('Defense', '')}${list(DEF_SLOTS)}</div>
    <div class="farm-sec">${api.secHead('Bench', `${st.bench.length} of ${benchMax()}`)}${bench ? `<ul class="pcards">${bench}</ul>` : '<p class="muted" style="margin:0">Nobody on the bench yet. Draft picks, trades and free agents land here.</p>'}</div>
    <p class="muted small-note">Only starters play. Bench players earn a little XP each game, and rookies grow toward their potential (POT) every off-season. Train: ${money(Tn.price)} for ${Tn.gives} XP; every level adds +1 to all of a player’s ratings.</p>`;
}
/* ---------------- Playbook ---------------- */
const GRP = { run: 'Run', short: 'Short pass', deep: 'Deep pass' };
function bookSide(side) {
  const st = H(), off = side === 'off', mine = st.book[side], live = !!(st.live && !st.live.done);
  const all = off ? C.plays : C.defs, fams = off ? PBASES : DBASES, famOf = off ? baseOf : dbase, FN = off ? PFAM : DFAM;
  const fk = off ? 'bkOff' : 'bkDef', fam = HV[fk] || '';
  const full = mine.length >= BOOK_MAX, low = mine.length <= BOOK_MIN;
  const info = x => {
    if (off) { const bt = BEATS(x.id); return `<p class="sr-meta">${h(FN[famOf(x.id)] || '')} · ${GRP[x.group]} · to ${h(x.slots.join(' / '))}</p><p class="sr-meta">${h(x.what)}</p>
      <p class="sr-meta">${bt.beats.length ? `<span class="good">Beats: ${h(bt.beats.join(', '))}</span>` : ''}${bt.beats.length && bt.weak.length ? ' · ' : ''}${bt.weak.length ? `<span class="badt">Weak vs: ${h(bt.weak.join(', '))}</span>` : ''}</p>`; }
    const sw = STOPS(x.id);
    return `<p class="sr-meta">${h(FN[famOf(x.id)] || '')}</p><p class="sr-meta">${h(x.what)}</p>
      <p class="sr-meta">${sw.stops.length ? `<span class="good">Stops: ${h(sw.stops.join(', '))}</span>` : ''}${sw.stops.length && sw.weak.length ? ' · ' : ''}${sw.weak.length ? `<span class="badt">Weak vs: ${h(sw.weak.join(', '))}</span>` : ''}</p>`;
  };
  const btn = x => {
    const on = mine.includes(x.id), dis = live || (on ? low : full);
    return `<button type="button" class="btn small ${on ? '' : 'primary'}" data-gm="bk-${side}" data-id="${x.id}" aria-pressed="${on}" ${dis ? 'disabled' : ''} ${on && low ? `title="Keep at least ${BOOK_MIN}"` : !on && full ? `title="Playbook is full: remove one first"` : ''}>${on ? 'Remove' : 'Add'}</button>`;
  };
  const chosen = mine.map(id => (off ? PLAY : DEFC)[id]).map(x => api.row('', `<p class="sr-name"><b>${h(x.name)}</b></p>${info(x)}`, btn(x), 'bk-on')).join('');
  const lib = all.filter(x => !fam || famOf(x.id) === fam).map(x => api.row('', `<p class="sr-name"><b>${h(x.name)}</b>${mine.includes(x.id) ? ' <span class="done">IN PLAYBOOK</span>' : ''}</p>${info(x)}`, btn(x), mine.includes(x.id) ? 'bk-on' : '')).join('');
  const sel = `<label class="unitpick"><span>Show</span><select data-gm-sel="${fk}"><option value="">All ${all.length}</option>${fams.map(f => `<option value="${f}" ${fam === f ? 'selected' : ''}>${h(FN[f] || f)} (${all.filter(x => famOf(x.id) === f).length})</option>`).join('')}</select></label>`;
  const groups = off ? ['run', 'short', 'deep'].filter(g => !mine.some(id => PLAY[id].group === g)) : [];
  return `<div class="farm-sec">${api.secHead(off ? 'Offensive playbook' : 'Defensive playbook', `${mine.length} of ${BOOK_MAX} picked`, `<button type="button" class="btn small quiet" data-gm="bk-reset" data-id="${side}" ${live ? 'disabled' : ''}>Default</button>`)}
      <p class="muted small-note">${off ? 'Each snap you’re dealt three of these: one run, one short pass and one deep pass when your playbook has them. On 4th down you also get a punt, and a field goal whenever you’re in range.' : 'Each snap you’re dealt three of these.'}</p>
      ${groups.length ? `<p class="small-note badt">Your playbook has no ${groups.map(g => GRP[g].toLowerCase()).join(' or ')} plays. You’ll never be offered one.</p>` : ''}
      <ul class="shop-list">${chosen}</ul></div>
    <div class="farm-sec">${api.secHead(off ? `All offensive plays · ${all.length}` : `All defensive calls · ${all.length}`, '', `<button type="button" class="btn small" data-gm="bk-lib" data-id="${side}" aria-expanded="${!!HV['open' + side]}">${HV['open' + side] ? 'Hide' : 'Browse and add'}</button>`)}
      ${HV['open' + side] ? `<div class="bb-trbar">${sel}</div><ul class="shop-list">${lib}</ul>` : ''}</div>`;
}
function bookTab() {
  const st = H(), live = !!(st.live && !st.live.done);
  return `${live ? '<p class="bb-trmsg" role="status">A game is on. You can change your playbook after the final whistle.</p>' : ''}
    <p class="muted small-note">Pick ${BOOK_MIN} to ${BOOK_MAX} plays for each side. Build around your roster (a great tight end loves seam routes and TE screens; fast backs love outside runs), and cover your bases: a playbook with no deep shots can’t beat a stacked box, and one with no runs struggles on 3rd &amp; 1.</p>
    ${bookSide('off')}${bookSide('def')}`;
}
/* ---------------- Market ---------------- */
function marketTab() {
  const st = H(), room = st.bench.length < benchMax();
  const list = st.market.map(p => {
    const cost = price(p), can = G().cash >= cost;
    const btns = SLOTS.filter(s => SPOS[s] === p.pos).map(s => { const o = st.roster[s]; return `<button type="button" class="btn small ${can ? 'primary' : ''}" data-gm="sign" data-id="${p.id}" data-slot="${s}" ${can ? '' : 'disabled'}>Sign &amp; start over ${h(o.name)} (${s} · ${ovr(o)})</button>`; }).join('')
      + `<button type="button" class="btn small" data-gm="sign-bench" data-id="${p.id}" ${can && room ? '' : 'disabled'}>Sign to bench</button>`;
    return card(p, '', `<span class="muted small-note">${money(cost)} to sign</span>${btns}`, { noLvl: true, hex: '#8a8f98' });
  }).join('');
  return `<div class="farm-sec">${api.secHead('Free agents', 'A new list after each of your games', `<button type="button" class="btn small quiet" data-gm="mkt-refresh" ${G().cash >= (M.refresh || 10) ? '' : 'disabled'}>New list · ${money(M.refresh || 10)}</button>`)}
    <ul class="pcards">${list || '<li class="muted">Nobody left. A new list comes after your next game.</li>'}</ul>
    <p class="muted small-note">A starter you replace moves to the bench (or is released for ${Math.round((C.releaseShare || .4) * 100)}% of his value if the bench is full). Better players cost more.</p></div>`;
}
/* ---------------- Trade ---------------- */
const powerRank = id => ['you'].concat(H().league.map(t => t.id)).sort((a, b) => teamOvr(teamById(b).roster) - teamOvr(teamById(a).roster)).indexOf(id) + 1;
const strongTxt = t => C.slots.map(([s]) => ({ s, o: ovr(t.roster[s]) })).sort((a, b) => b.o - a.o).slice(0, 3).map(x => `${x.s} (${x.o})`).join(', ');
const needTxt = t => { const w = C.slots.map(([s]) => ({ s, o: ovr(t.roster[s]) })).sort((a, b) => a.o - b.o).slice(0, 3); return w.map(x => `${x.s} (${x.o})`).join(', '); };
function tRow(p, t, side, hex) {
  const on = HV.tr[side].includes(p.id), starter = SLOTS.find(s => t.roster[s] === p);
  return `<li class="fb-trow ${on ? 'on' : ''}">${dotSvg(p.num, hex, 26)}<span class="fb-tn"><b>${h(p.name)}</b> <span class="muted">${starter && starter !== p.pos ? starter : starter ? p.pos : `${p.pos} · bench`}${p.pot && p.pot > baseOvr(p) ? ` · POT ${p.pot}` : ''}${p.inj ? ` · <span class="badt">INJ ${p.inj.g >= 99 ? 'season' : p.inj.g + 'g'}</span>` : ''}${p.camp ? ` · <span class="badt">AT CAMP</span>` : ''}</span></span><b class="fb-to">${ovr(p)}</b>
    <button type="button" class="btn small ${on ? 'primary' : ''}" data-gm="tr-${side}" data-id="${p.id}" aria-pressed="${on}" ${p.camp ? 'disabled' : ''}>${on ? (side === 'give' ? 'Offering' : 'Asking') : (side === 'give' ? 'Offer' : 'Ask')}</button></li>`;
}
function pRow(pk, side) {
  const k = pkKey(pk), on = HV.tr[side].includes(k);
  return `<li class="fb-trow ${on ? 'on' : ''}"><span class="fb-pick" aria-hidden="true">R${pk.rd}</span><span class="fb-tn">${h(pickName(pk))}</span><span></span>
    <button type="button" class="btn small ${on ? 'primary' : ''}" data-gm="tr-${side}" data-id="${k}" aria-pressed="${on}">${on ? (side === 'gp' ? 'Offering' : 'Asking') : (side === 'gp' ? 'Offer' : 'Ask')}</button></li>`;
}
function tradeTab() {
  const st = H(), tr = HV.tr;
  if (!tr.team || !st.league.some(t => t.id === tr.team)) tr.team = st.league[0].id;
  const t = teamById(tr.team), me = you();
  const sel = `<label class="unitpick"><span>Team</span><select data-gm-sel="tr-team">${st.league.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${h(x.name)} (${teamOvr(x.roster)})</option>`).join('')}</select></label>`;
  const dr = `<label class="unitpick"><span>Cash sweetener</span><select data-gm-sel="tr-dr">${(TR.sweeteners || [0]).map(v => `<option value="${v}" ${v === tr.dr ? 'selected' : ''} ${v > G().cash ? 'disabled' : ''}>${v ? money(v) : 'none'}</option>`).join('')}</select></label>`;
  const give = allOf(me).filter(p => tr.give.includes(p.id)), get = allOf(t).filter(p => tr.get.includes(p.id));
  const gp = picksOf('you').filter(pk => tr.gp.includes(pkKey(pk))), tp = picksOf(t.id).filter(pk => tr.tp.includes(pkKey(pk)));
  const any = give.length || get.length || gp.length || tp.length;
  const names = (ps, pks) => ps.map(p => h(p.name)).concat(pks.map(pk => h(pickName(pk)))).join(', ') || 'nothing';
  const sum = any ? `<p class="bb-deal">You give ${names(give, gp)}${tr.dr ? ` + ${money(tr.dr)}` : ''} · you get ${names(get, tp)}</p>` : '';
  const plist = (team, side, hex) => `<ul class="fb-tlist">${allOf(team).map(p => tRow(p, team, side, hex)).join('')}</ul>`;
  const klist = (id, side) => { const l = picksOf(id); return l.length ? `<ul class="fb-tlist">${l.map(pk => pRow(pk, side)).join('')}</ul>` : '<p class="muted small-note">No picks.</p>'; };
  return `<div class="farm-sec">${api.secHead('Trade with the league', 'Players, draft picks and cash')}
      <div class="bb-trbar">${sel}${dr}</div>
      <p class="muted small-note"><span class="tdot" style="background:${t.color}"></span><b>${h(t.name)}</b> · overall ${teamOvr(t.roster)} · weakest spots: ${needTxt(t)}. A player who’d start for them is worth more to them; one who’d sit on their bench is worth less.</p>
      ${sum}
      <div class="buy2 left"><button type="button" class="btn primary" data-gm="tr-propose" ${any ? '' : 'disabled'}>Propose trade</button>${any ? '<button type="button" class="btn small quiet" data-gm="tr-clear">Clear</button>' : ''}</div>
      ${tr.msg ? `<p class="bb-trmsg ${tr.msg.ok ? 'ok' : 'no'}" role="status">${h(tr.msg.text)}</p>` : ''}</div>
    <div class="bb-trcols">
      <div class="farm-sec">${api.secHead(h(t.name), 'What you can ask for')}${plist(t, 'get', t.color)}<p class="label">Their draft picks</p>${klist(t.id, 'tp')}</div>
      <div class="farm-sec">${api.secHead('Your team', 'What you can offer')}${plist(me, 'give', myHex())}<p class="label">Your draft picks</p>${klist('you', 'gp')}</div></div>`;
}
/* ---------------- Draft ---------------- */
function draftTab() {
  const st = H(), D = st.draft, S = st.season;
  const myPicks = l => l.length ? `<ul class="fb-hist">${l.map(pk => `<li>${h(pickName(pk))}</li>`).join('')}</ul>` : '<p class="muted small-note">You have no picks. Trade for some on the Trade tab.</p>';
  if (!D) return `<div class="farm-sec">${api.secHead('The draft', `After season ${S.n}`)}
      <p class="small-note">Like the NFL: 7 rounds, the same order every round. Teams that missed the playoffs pick first, worst record first; then playoff teams by how early they were knocked out. The runner-up picks second to last and the champion picks last.</p>
      ${api.secHead('Your picks', '')}${myPicks(picksOf('you'))}</div>`;
  const nm = id => { const t = teamById(id); return t ? `<span class="tdot" style="background:${t.color}"></span>${h(t.name)}` : '?'; };
  const mine = D.log.filter(x => x.team === 'you');
  const cls = mine.length ? `<div class="farm-sec">${api.secHead('Your draft class', '')}<ul class="fb-hist">${mine.map(x => `<li>Round ${x.rd}, #${x.n}: <b>${h(x.name)}</b> ${x.pos} · ${h(x.col)} · real ratings ${x.o} OVR, ${x.pot} POT <span class="muted">(scouts said ~${x.so}, ${potGrade(x.sp)})</span></li>`).join('')}</ul></div>` : '';
  const title = D.yr === 0 ? 'Opening draft' : `Draft after season ${D.yr}`;
  if (D.done) return `<div class="farm-sec">${api.secHead(title, 'Complete')}
      <p class="small-note">Rookies are on the bench, or starting if they beat your starter. The three best players nobody drafted are now free agents. Team overall now ${teamOvr(st.roster)} (#${powerRank('you')} of 8).</p>
      ${st.over ? '' : D.yr === 0 ? '<button type="button" class="btn primary" data-gm="tab" data-tab="home">On to week 1</button>' : `<button type="button" class="btn primary" data-gm="new-season">Start season ${S.n + 1}</button>`}</div>${cls}`;
  const sl = onClock(), who = slotOwner(sl), yours = who === 'you';
  const left = picksOf('you').filter(pk => pk.yr === D.yr);
  const pos = HV.dpos || '';
  const board = D.pool.filter(p => !pos || p.pos === pos).slice(0, 40).map(p => {
    const rank = D.pool.indexOf(p) + 1;
    return `<tr><td>${rank}</td><td><b>${h(p.name)}</b><br><span class="muted">${h(p.col)}</span></td><td>${p.pos}</td><td>~${p.so}</td><td>${potGrade(p.sp)}</td>
      <td><button type="button" class="btn small ${yours ? 'primary' : ''}" data-gm="draft-pick" data-id="${p.id}" ${yours ? '' : 'disabled'}>Draft</button></td></tr>`;
  }).join('');
  const posSel = `<label class="unitpick"><span>Position</span><select data-gm-sel="dpos"><option value="">All</option>${Object.keys(POS).map(k => `<option value="${k}" ${pos === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>`;
  const recent = D.log.slice(-10).reverse().map(x => `<li><span class="muted">#${x.n}</span> ${nm(x.team)} <b>${h(x.name)}</b> ${x.pos}, ${h(x.col)}</li>`).join('');
  const order = D.order.map((id, i) => `<li><span class="muted">${i + 1}.</span> ${nm(id)} <span class="muted">(${teamOvr(teamById(id).roster)})</span></li>`).join('');
  return `<div class="farm-sec">${api.secHead(title, `Round ${sl.rd}, pick ${sl.i} · #${D.cur + 1} of ${D.slots.length}`)}
      ${D.yr === 0 ? `<p class="small-note">Every team started with a random overall between ${(C.startRange || [50, 62]).join(' and ')} and its own strengths and weak spots. The order is the power ranking, weakest team first, and it’s the same every round.</p>` : ''}
      <div class="bb-next ${yours ? 'live' : ''}"><p class="label">On the clock</p><p class="bb-vs">${nm(who)}${sl.orig !== who ? ` <span class="muted">(pick from ${h(teamById(sl.orig).name)})</span>` : ''}</p>
        ${yours ? '<p class="small-note"><b>You’re on the clock!</b> Pick a player from the big board below.</p>' : ''}
        <div class="buy2 left">${yours ? '' : `<button type="button" class="btn primary" data-gm="draft-sim">${left.length ? 'Sim to my next pick' : 'Sim to the end'}</button>`}
          <button type="button" class="btn small quiet" data-gm="draft-auto">Auto-draft the rest for me</button></div></div>
      <p class="muted small-note">Your weakest starters: ${needTxt(you())}. Your strengths: ${strongTxt(you())}. Your picks left: ${left.length ? left.map(pk => `R${pk.rd} #${Math.round(pickIdx(pk).i) + 1}`).join(', ') : 'none'}. Scout grades are estimates: “~64” means about 64 overall right now, and POT is how good he could become.</p></div>
    <div class="farm-sec">${api.secHead('Big board', 'Best available, by your scouts', posSel)}
      <div class="tscroll"><table class="fb-tab fb-board"><thead><tr><th>#</th><th>Prospect</th><th>Pos</th><th>OVR</th><th>POT</th><th></th></tr></thead><tbody>${board || '<tr><td colspan="6" class="muted">Nobody left at that position.</td></tr>'}</tbody></table></div></div>
    ${cls}
    <div class="bb-trcols"><div class="farm-sec">${api.secHead('Latest picks', '')}<ul class="fb-hist">${recent || '<li class="muted">No picks yet.</li>'}</ul></div>
      <div class="farm-sec">${api.secHead('Draft order', 'Same every round')}<ul class="fb-hist">${order}</ul></div></div>`;
}
/* ---------------- League ---------------- */
function leagueTab() {
  const st = H(), S = st.season; if (!S) return '';
  const nm = id => { const t = teamById(id); return t ? `<span class="tdot" style="background:${t.color}"></span>${h(t.name)}` : '?'; };
  const rows = standings().map((x, i) => { const t = teamById(x.id); return `<tr class="${x.id === 'you' ? 'me' : ''}"><td>${i + 1}</td><td>${nm(x.id)}${t.style ? ` <span class="muted fb-sty">${h(C.offStyles[t.style.off].name)} / ${h(C.defStyles[t.style.def].name)}</span>` : ''}</td><td>${x.w}</td><td>${x.l}</td><td>${x.t}</td><td>${x.pf}</td><td>${x.pa}</td><td>${teamOvr(t.roster)}</td></tr>`; }).join('');
  const mine = S.sched.map((wk, i) => {
    const m = wk.find(g => g.includes('you')), opp = m[0] === 'you' ? m[1] : m[0], r = S.res.find(g => g.wk === i && g.a === 'you');
    return `<li><span class="muted">Wk ${i + 1}</span> ${nm(opp)} ${r ? `<b class="${r.sa > r.sb ? 'good' : r.sa < r.sb ? 'badt' : ''}">${r.sa > r.sb ? 'W' : r.sa < r.sb ? 'L' : 'T'} ${r.sa}–${r.sb}</b>` : i === S.wk && !S.po ? '<span class="tbadge">next</span>' : ''}</li>`;
  }).join('');
  const po = S.po ? (() => {
    const m = (g, lbl) => `<div class="bk-m"><p class="label">${lbl}</p>${[['a', 'sa'], ['b', 'sb']].map(([k, sk]) => `<div class="bk-t ${g[k] === 'you' ? 'me' : ''} ${g.w ? (g.w === g[k] ? 'won' : 'lost') : ''}"><span class="bk-n">${nm(g[k])}</span><b>${g[sk] == null ? '' : g[sk]}</b></div>`).join('')}</div>`;
    return `<div class="farm-sec">${api.secHead('Playoffs', S.done ? `Champions: ${h(teamById(S.champ).name)}` : '')}<div class="fb-po">${m(S.po.semi[0], 'Semifinal · 1 v 4')}${m(S.po.semi[1], 'Semifinal · 2 v 3')}${S.po.fin ? m(S.po.fin, 'Championship') : '<div class="bk-m"><p class="label">Championship</p><div class="bk-t tbd">To be decided</div></div>'}</div></div>`;
  })() : '';
  const hist = st.hist.length ? `<div class="farm-sec">${api.secHead('Past seasons', '')}<ul class="fb-hist">${st.hist.slice().reverse().map(x => `<li>Season ${x.n}: <b>${x.w}–${x.l}${x.t ? `–${x.t}` : ''}</b>${x.champ ? ' · 🏆 champions' : x.po ? ' · playoffs' : ''}${x.grow ? ` · off-season ${x.grow > 0 ? '+' : ''}${x.grow}` : ''}</li>`).join('')}</ul></div>` : '';
  return `<div class="farm-sec">${api.secHead(`Season ${S.n} standings`, `Top ${C.playoffTeams || 4} make the playoffs`)}<div class="tscroll"><table class="fb-tab"><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th><th>OVR</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    ${po}
    <div class="farm-sec">${api.secHead('Your schedule', '')}<ul class="fb-sched">${mine}</ul></div>
    ${hist}`;
}

/* ---------------- the kick: aim your field goals and extra points ---------------- */
const KICK_HOW = { wideL: 'wide left', wideR: 'wide right', short: 'short', doink: 'off the upright' };
/* inverse error function (Winitzki), for sizing the posts from the normal odds */
const erfinv = x => { const a = .147, ln = Math.log(1 - x * x), t = 2 / (Math.PI * a) + ln / 2; return Math.sign(x) * Math.sqrt(Math.sqrt(t * t - ln / a) - t); };
/* half the distance between the posts (in half-bar widths): a tap that's typically sigma off makes it about as often as the normal odds */
function kickZone(k, dist, xp) {
  const K = C.kick, p = clamp(xp ? xpChance(k) : fgAim(k, dist), .02, .99);
  return clamp(K.sigma * Math.SQRT2 * erfinv(p) * K.gen, ...K.zone);
}
/* aim: x where you stopped the marker, c the middle of the posts, zone half the gap. Returns how it went and e (x - c) */
function kickOutcome(k, dist, aim, R) {
  const K = C.kick, e = aim.x - aim.c, a = Math.abs(e);
  if (a > aim.zone) return { how: e > 0 ? 'wideR' : 'wideL', e };
  if (a > aim.zone * K.edge && R() < K.doink) return { how: 'doink', e };
  if (R() >= fgLegs(k, dist)) return { how: 'short', e };
  return { how: 'good', e };
}
/* across the field (yards from the middle) where the kick goes past the posts, which are 3.1 either side */
const kickY = (k, aim) => { const s = k.e >= 0 ? 1 : -1, f = clamp(k.e / Math.max(aim.zone, .01), -1, 1);
  return k.how === 'doink' ? s * 3.1 : k.how === 'wideL' || k.how === 'wideR' ? s * (3.6 + Math.min(5, (Math.abs(k.e) - aim.zone) * 12)) : f * 2.6; };
/* the marker: back and forth across the bar (-1 to 1), one crossing every T seconds */
const kickPos = (K_, t) => { const u = (((t - K_.t0) / 1000 / K_.T + K_.ph) % 2 + 2) % 2; return u < 1 ? -1 + 2 * u : 3 - 2 * u; };
/* you picked a field goal or the extra point: line up the kick instead of kicking it now */
function kickFirst(L, i) {
  const o = L.opts[i];
  if (!o || L.poss !== 0 || H().kickGame === false || (o.kind !== 'fg' && o.kind !== 'xp')) return false;
  const K = C.kick, k = L.T[0].P.K.ab, xp = o.kind === 'xp', dist = xp ? 33 : 100 - L.ball + 17, f = clamp((dist - 20) / 40, 0, 1);
  if (L.wind == null) L.wind = (Math.random() * 2 - 1) * .8;            /* the day's wind; each kick gusts a little */
  const w = clamp(L.wind + gauss(Math.random) * .2, -1, 1);
  HV.kick = { i, xp, dist, w, mph: Math.round(Math.abs(w) * K.windMax), c: -w * lerp(K.wind[0], K.wind[1], f), zone: kickZone(k, dist, xp),
    T: lerp(K.sweep[0], K.sweep[1], f), t0: performance.now(), ph: Math.random() * 2 };
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  return true;
}
function kickPress(now) {
  const K_ = HV.kick, L = H().live;
  if (!K_ || now - K_.t0 < 150) return;                                   /* still the key that picked the kick */
  HV.kick = null;
  if (!L || L.over || ANIM.busy || L.pend) return rerender();
  doCall(L, K_.i, false, null, { x: kickPos(K_, now), c: K_.c, zone: K_.zone }); api.save(); startAnim(L); rerender(); toField();
}
function kickTick(ts) {
  const K_ = HV.kick; if (!K_) return;
  const el = document.getElementById('fb-kick'); if (!el) { HV.kick = null; return; }
  const m = el.querySelector('.fb-kick-mark'); if (m) m.style.left = `${(kickPos(K_, ts) + 1) * 50}%`;
}
function kickPanel(L) {
  const K_ = HV.kick, k = L.T[0].P.K, n = K_.mph >= 14 ? 3 : K_.mph >= 8 ? 2 : 1, pct = v => ((v + 1) * 50).toFixed(1);
  const wind = K_.mph < 3 ? '<b>calm</b>.' : `<b>${K_.w < 0 ? '←'.repeat(n) + ' ' : ''}${K_.mph} mph${K_.w > 0 ? ' ' + '→'.repeat(n) : ''}</b>. It pushes the ball ${K_.w > 0 ? 'right' : 'left'}, so aim ${K_.w > 0 ? 'left' : 'right'} of center.`;
  const legs = !K_.xp && K_.dist > fgRange(k.ab) ? ` <span class="badt">That’s past ${h(k.name)}’s range (about ${Math.round(fgRange(k.ab))}): even a straight kick might fall short.</span>` : '';
  return `<div class="fb-call"><p class="fb-role o">${K_.xp ? 'Extra point' : `${K_.dist}-yard field goal`} · ${h(k.name)}</p>
    <p class="small-note">Wind: ${wind}${legs}</p>
    <div class="fb-kick" id="fb-kick" role="button" aria-label="Kick: tap or press Space when the marker is between the posts">
      <span class="fb-kick-zone" style="left:${pct(K_.c - K_.zone)}%;width:${(K_.zone * 100).toFixed(1)}%"></span>
      <span class="fb-kick-post" style="left:${pct(K_.c - K_.zone)}%"></span><span class="fb-kick-post" style="left:${pct(K_.c + K_.zone)}%"></span>
      <span class="fb-kick-mid"></span><span class="fb-kick-mark" style="left:50%"></span></div>
    <p class="muted small-note">Press <span class="fb-key fb-key-w">Space</span> or tap the bar when the marker is between the posts. Dead center is safest; near a post it can clang off the upright.</p></div>`;
}

/* ---------------- the snap: a reaction test before each of your offensive plays ---------------- */
/* you picked a play on offense: go to the line instead of running it now */
function snapFirst(L, i) {
  const o = L.opts[i];
  if (!o || L.poss !== 0 || o.kind !== 'play' || H().snapTiming === false) return false;
  const W = (C.snap || {}).wait || [900, 2800];
  HV.snap = { i, t0: performance.now(), go: W[0] + Math.random() * (W[1] - W[0]), shown: null };
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  return true;
}
/* ms: time since the bar actually turned green on screen */
function snapPress(now) {
  const S_ = HV.snap, L = H().live; HV.snap = null;
  if (!S_ || !L || L.over || ANIM.busy || L.pend) return rerender();
  const S = C.snap || {}, ms = S_.shown == null ? null : Math.round(now - S_.shown);
  const k = ms == null ? 'early' : ms < (S.jump || 100) ? 'early' : ms > (S.window || 450) ? 'late' : 'good';
  doCall(L, S_.i, false, { k, ms }); api.save(); startAnim(L); rerender(); toField();
}
function snapTick(ts) {
  const S_ = HV.snap; if (!S_) return;
  const el = document.getElementById('fb-snap'); if (!el) { HV.snap = null; return; }
  const win = (C.snap || {}).window || 450;
  if (S_.shown == null && ts >= S_.t0 + S_.go) S_.shown = ts;
  const go = S_.shown != null, txt = el.lastChild, fill = el.firstChild;
  if (el.classList.contains('go') !== go) { el.classList.toggle('go', go); txt.textContent = go ? 'HIKE!' : 'Set…'; }
  if (go) {
    const left = 1 - (ts - S_.shown) / win;
    fill.style.transform = `scaleX(${clamp(left, 0, 1)})`;
    if (left < 0) { HV.snap = null; const L = H().live; if (L && !L.over && !ANIM.busy && !L.pend) { doCall(L, S_.i, false, { k: 'late', ms: null }); api.save(); startAnim(L); } rerender(); toField(); }
  }
}

/* ---------------- input ---------------- */
function click(a, t) {
  const st = H(), id = t.dataset.id;
  if (a !== 'auto') HV.confirmAuto = false;
  if (a !== 'new-career') HV.confirmReset = false;
  if (a !== 'release') HV.release = null;
  if (st.over && !['new-career', 'close-game', 'rename', 'rename-cancel', 'skip-anim', 'fast'].includes(a)) return;
  switch (a) {
    case 'new-career': newCareer(); return HV.confirmReset ? undefined : 'top-sec';
    case 'kickoff': startGame(); return 'top-sec';
    case 'new-season': nextSeason(); return 'top-sec';
    case 'throw': { const L = st.live; if (!L || !L.pend || ANIM.busy) return; decideThrow(L, id === '0'); api.save(); startAnim(L); toField(); return; }
    case 'pend': { const L = st.live; if (!L || !L.pend || ANIM.busy) return; decidePend(L, +id); api.save(); startAnim(L); toField(); return; }
    case 'ask-throw': st.askThrow = st.askThrow === false; api.save(); return;
    case 'call': {
      const L = st.live; if (!L || L.over || ANIM.busy || L.pend || HV.snap || HV.kick) return;
      if (snapFirst(L, +id) || kickFirst(L, +id)) return;
      doCall(L, +id); api.save(); startAnim(L); toField(); return;
    }
    case 'snap-timing': st.snapTiming = st.snapTiming === false; api.save(); return;
    case 'kick-game': st.kickGame = st.kickGame === false; api.save(); return;
    case 'skip-anim': if (ANIM.busy) { ANIM.busy = false; const L = st.live; if (L) L.pre = null; flushAfter(); } return;
    case 'fast': st.fast = !st.fast; api.save(); return;
    case 'auto': HV.snap = null; HV.kick = null; if (!HV.confirmAuto) { HV.confirmAuto = true; return; } HV.confirmAuto = false; autoRest(); return;
    case 'close-game': closeGame(); api.setTab('home'); return 'top-sec';
    case 'rename': HV.rename = true; return 'rename';
    case 'rename-cancel': HV.rename = false; return;
    case 'camp-open': if (!(st.live && !st.live.done) && !atCamp().length) HV.camp = { pick: [], n: 3 }; return;
    case 'camp-close': HV.camp = null; return;
    case 'camp-len': if (HV.camp && C.camp.levels[id]) HV.camp.n = +id; return;
    case 'camp-pick': {
      const cp = HV.camp, p = allOf(you()).find(x => x.id === +id); if (!cp || !p || !campable(p)) return;
      cp.pick = cp.pick.includes(p.id) ? cp.pick.filter(x => x !== p.id) : cp.pick.length < C.camp.max ? cp.pick.concat(p.id) : cp.pick; return;
    }
    case 'camp-go': sendToCamp(); return;
    case 'train': { const p = st.roster[id] || st.bench.find(x => x.id === +id), Tn = C.train || {}; if (!p || p.camp || G().cash < Tn.price || p.lvl >= (C.levels || []).length) return; G().cash -= Tn.price; if (giveXp(p, Tn.gives)) api.toast(`Level up! <b>${h(p.name)}</b> is now level ${p.lvl}.`, 'rank'); api.save(); return; }
    case 'sign': case 'sign-bench': {
      const p = st.market.find(x => x.id === +id), slot = t.dataset.slot, old = slot ? st.roster[slot] : null;
      if (!p || G().cash < price(p) || (slot && (!old || SPOS[slot] !== p.pos))) return;
      if (!slot && st.bench.length >= benchMax()) return;
      if (old && old.camp && st.bench.length >= benchMax()) return;   /* he'd be released while he's away at camp */
      G().cash -= price(p); st.market = st.market.filter(x => x !== p);
      let note = '';
      if (old) {
        if (st.bench.length < benchMax()) { st.bench.push(old); note = `${h(old.name)} moves to the bench.`; }
        else { const back = releasePay(old); G().cash += back; note = `Bench is full, so ${h(old.name)} is released (+${money(back)}).`; }
        st.roster[slot] = p;
      } else { st.bench.push(p); note = 'He joins the bench.'; }
      fillYou([]);
      api.save(); api.toast(`Signed <b>${h(p.name)}</b> (${p.pos}, ${ovr(p)}). ${note}`, 'cash');
      return;
    }
    case 'release': {
      const p = st.bench.find(x => x.id === +id); if (!p || p.camp) return;
      if (HV.release !== p.id) { HV.release = p.id; return; }
      HV.release = null; st.bench = st.bench.filter(x => x !== p); G().cash += releasePay(p); api.save(); api.toast(`Released ${h(p.name)}. +${money(releasePay(p))}`, 'note'); return;
    }
    case 'draft-pick': { const D = st.draft, sl = onClock(); if (!D || !sl || slotOwner(sl) !== 'you') return; const p = D.pool.find(x => x.id === +id); if (p) { draftOne(p); draftRun(false); api.save(); } return; }
    case 'draft-sim': draftRun(false); api.save(); return;
    case 'draft-auto': draftRun(true); api.save(); return;
    case 'tr-give': case 'tr-get': case 'tr-gp': case 'tr-tp': { const k = a.slice(3), L = HV.tr[k], v = k === 'gp' || k === 'tp' ? id : +id; HV.tr[k] = L.includes(v) ? L.filter(x => x !== v) : L.concat(v); HV.tr.msg = null; return; }
    case 'tr-clear': HV.tr = { team: HV.tr.team, give: [], get: [], gp: [], tp: [], dr: 0, msg: null }; return;
    case 'tr-propose': trade(); return;
    case 'bk-off': case 'bk-def': {
      if (st.live && !st.live.done) return;
      const side = a.slice(3), b = st.book[side], valid = side === 'off' ? PLAY : DEFC; if (!valid[id]) return;
      if (b.includes(id)) { if (b.length > BOOK_MIN) st.book[side] = b.filter(x => x !== id); }
      else if (b.length < BOOK_MAX) st.book[side] = b.concat(id);
      api.save(); return;
    }
    case 'bk-lib': HV['open' + id] = !HV['open' + id]; return;
    case 'bk-reset': if (st.live && !st.live.done) return; st.book[id] = normBook({ [id]: (C.playbook || {})[id] })[id]; api.save(); return;
    case 'mkt-refresh': if (G().cash >= (M.refresh || 10)) { G().cash -= M.refresh || 10; newMarket(); api.save(); } return;
  }
}
function change(el) {
  const k = el.dataset.gmSel;
  if (k === 'color' && COLOR[el.value]) { H().team.color = el.value; api.save(); }
  else if (k === 'start-for' && el.value) {
    const st = H(), p = st.bench.find(x => x.id === +el.dataset.id), sl = el.value;
    if (p && !out(p) && SPOS[sl] === p.pos) { const old = st.roster[sl]; st.roster[sl] = p; st.bench = st.bench.filter(x => x !== p).concat(old); api.save(); }
  }
  else if (k === 'tr-team') HV.tr = { team: el.value, give: HV.tr.give, get: [], gp: HV.tr.gp, tp: [], dr: HV.tr.dr, msg: null };
  else if (k === 'tr-dr') { HV.tr.dr = +el.value || 0; HV.tr.msg = null; }
  else if (k === 'dpos') HV.dpos = el.value;
  else if (k === 'bkOff' || k === 'bkDef') HV[k] = el.value;
}
function submit(form) {
  if (form.dataset.gmForm === 'team-name') { const v = String(form.elements.n.value || '').trim().slice(0, 30); if (v) H().team.name = v; HV.rename = false; api.save(); }
}
/* the snap bar and the kick bar: Space, or a tap on the bar (pointerdown, so a touch isn't slowed by the click delay) */
document.addEventListener('keydown', e => {
  if (!(HV.snap || HV.kick) || (e.key !== ' ' && e.code !== 'Space')) return;
  e.preventDefault(); if (!e.repeat) (HV.snap ? snapPress : kickPress)(performance.now());
});
document.addEventListener('pointerdown', e => {
  const bar = e.target.closest && e.target.closest('#fb-snap, #fb-kick');
  if (!bar || !(HV.snap || HV.kick)) return;
  e.preventDefault(); HV.eatClick = performance.now() + 600; (HV.snap ? snapPress : kickPress)(performance.now());
});
/* the tap's own click lands on whatever replaced the bar: swallow it */
document.addEventListener('click', e => { if (HV.eatClick && performance.now() < HV.eatClick) { HV.eatClick = 0; e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener('keydown', e => {
  if (!['1', '2', '3', '4', '5', '6'].includes(e.key) || !document.getElementById('fb-field')) return;
  const f = document.activeElement; if (f && ['INPUT', 'SELECT', 'TEXTAREA'].includes(f.tagName)) return;
  const L = H().live; if (!L || L.over || ANIM.busy || HV.snap || HV.kick) return;
  if (L.pend) { if (e.key > '2') return; e.preventDefault(); decidePend(L, +e.key); api.save(); startAnim(L); rerender(); toField(); return; }
  if (+e.key > L.opts.length) return;
  e.preventDefault();
  if (snapFirst(L, +e.key - 1) || kickFirst(L, +e.key - 1)) return rerender();
  doCall(L, +e.key - 1); api.save(); startAnim(L); rerender(); toField();
});
/* Esc skips the replay */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !ANIM.busy || !document.getElementById('fb-field')) return;
  e.preventDefault(); ANIM.busy = false; const L = H().live; if (L) L.pre = null; flushAfter(); rerender();
});
requestAnimationFrame(frame);

return {
  id: 'grid', name: 'Football', short: 'football', gk: 'Gridiron Dynasty', title: 'Football',
  tabs: [['home', 'Home'], ['game', 'Game'], ['book', 'Playbook'], ['roster', 'Roster'], ['market', 'Free agents'], ['trade', 'Trade'], ['draft', 'Draft'], ['league', 'League']],
  norm,
  start() { ensure(); },
  /* backups (core.js): what a save file is called, whether a loaded one is a real career, how to describe it */
  fileTag() { const st = H(); return `${st.team.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-season-${st.season ? st.season.n : 1}`; },
  validSave(s) { return !!(s && s.started); },
  describe(s) {
    const S = s.season, rec = { w: 0, l: 0, t: 0 }, w = obj(s.stats);
    (S ? S.res : []).forEach(x => { if (x.a !== 'you' && x.b !== 'you') return; const d = (x.a === 'you' ? 1 : -1) * (x.sa - x.sb); rec[d > 0 ? 'w' : d < 0 ? 'l' : 't']++; });
    return `<b>${h(s.team.name)}</b> · overall ${teamOvr(s.roster)} · season ${S ? S.n : 1}: ${rec.w}–${rec.l}${rec.t ? `–${rec.t}` : ''} · career ${num(w.w)}–${num(w.l)}${num(w.t) ? `–${num(w.t)}` : ''} · ${plural(num(w.titles), 'title')}${s.over ? ' · <span class="bb-warn">fired</span>' : s.live && !s.live.done ? ' · mid-game' : ''}`;
  },
  loaded() { clearView(); ensure(); },
  onTab() { HV.rename = false; HV.release = null; HV.camp = null; HV.snap = null; HV.kick = null; },
  top() { return overPanel(); },
  headBtn() { return `<button type="button" class="btn small ${HV.confirmReset ? 'danger' : 'quiet'}" data-gm="new-career">${HV.confirmReset ? 'Tap again to erase everything' : 'Reset game'}</button>`; },
  view(tab) { ensure(); return ({ home: homeTab, game: gameTab, book: bookTab, roster: rosterTab, market: marketTab, trade: tradeTab, draft: draftTab, league: leagueTab }[tab] || homeTab)(); },
  badge(tab) {
    const st = H();
    if (tab === 'game') return st.live && !st.live.done ? 1 : 0;
    if (tab === 'draft') return st.draft && !st.draft.done ? picksOf('you').filter(pk => pk.yr === st.draft.yr).length : 0;
    return 0;
  },
  purse() { const st = H(), me = standings().find(x => x.id === 'you'); return `<span>Overall <b>${teamOvr(st.roster)}</b></span><span>Chemistry <b>${Math.round(st.chem)}</b></span><span>Record <b>${me.w}–${me.l}${me.t ? `–${me.t}` : ''}</b></span>`; },
  click, change, submit,
  _resolve: resolve, _trans: trans, _value: valueOf, _doCall: doCall, _start: startGame, _settle: settle, _yourNext: yourNext, _standings: standings, _scene: scene, _evalOpts: evalOpts, _gradeOf: gradeOf, _anim: ANIM, _draftRun: draftRun, _decideThrow: decideThrow, _decidePend: decidePend, _campTick: campTick, _kickZone: kickZone, _kickOutcome: kickOutcome, _fgChance: fgChance, _trade: trade, _hv: HV, _pVal: pVal, _pickVal: pickVal,
};
});
