'use strict';

// ---------------------------------------------------------------------------
// Casino games with real odds, played seated at the machine/table in 3D with a
// GTA-Online-style instructional overlay. Every game has a tutorial.
// ---------------------------------------------------------------------------
let gameSession = null;

const LIMITS = {
  slots: [1, 10_000], roulette: [10, 50_000], blackjack: [25, 100_000], blackjack_hl: [10_000, 1_000_000],
  baccarat: [100, 250_000], baccarat_hl: [25_000, 2_000_000], craps: [10, 50_000], bigsix: [5, 25_000],
};
const BET_STEPS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000];
const GAME_NAMES = { slots: 'Slot Machine', roulette: 'Roulette', blackjack: 'Blackjack', blackjack_hl: 'VIP Blackjack', baccarat: 'Baccarat', baccarat_hl: 'VIP Baccarat', craps: 'Craps', bigsix: 'Big Six Wheel' };
const tut = t => (t === 'blackjack_hl' ? 'blackjack' : t === 'baccarat_hl' ? 'baccarat' : t);

const T3 = () => (window.Render3D && Render3D.ready ? Render3D.tables() : null);
const wait = ms => new Promise(r => setTimeout(r, ms));
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------------------------------------------------------------------------
// Odds tables
// ---------------------------------------------------------------------------
const SLOT_TABLE = [
  { sym: '7', mult: 250, p: 0.0008 },
  { sym: '💎', mult: 50, p: 0.003 },
  { sym: '🔔', mult: 20, p: 0.008 },
  { sym: '🍉', mult: 10, p: 0.015 },
  { sym: '🍋', mult: 5, p: 0.03 },
  { sym: '🍒', mult: 3, p: 0.03 },
  { sym: '🍒', mult: 0.5, p: 0.04, two: true }, // "loss disguised as a win"
];
const SLOT_SYMS = ['7', '💎', '🔔', '🍉', '🍋', '🍒', '★'];
function slotOutcome() {
  let r = Math.random();
  for (const o of SLOT_TABLE) {
    if (r < o.p) {
      if (o.two) return { reels: shuffle(['🍒', '🍒', pick(['7', '💎', '🔔', '🍋', '★'])]), mult: o.mult, disguised: true };
      return { reels: [o.sym, o.sym, o.sym], mult: o.mult };
    }
    r -= o.p;
  }
  if (Math.random() < 0.3) { // deliberate near miss
    const s = pick(['7', '💎']);
    return { reels: shuffle([s, s, pick(SLOT_SYMS.filter(x => x !== s && x !== '🍒'))]), mult: 0, nearMiss: true };
  }
  let reels;
  do { reels = [pick(SLOT_SYMS), pick(SLOT_SYMS), pick(SLOT_SYMS)]; }
  while ((reels[0] === reels[1] && reels[1] === reels[2]) || reels.filter(x => x === '🍒').length >= 2);
  return { reels, mult: 0 };
}

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROULETTE_BETS = [
  { key: 'red', label: 'Red', pays: 1, win: n => REDS.has(n) },
  { key: 'black', label: 'Black', pays: 1, win: n => n > 0 && !REDS.has(n) },
  { key: 'odd', label: 'Odd', pays: 1, win: n => n > 0 && n % 2 === 1 },
  { key: 'even', label: 'Even', pays: 1, win: n => n > 0 && n % 2 === 0 },
  { key: 'low', label: '1–18', pays: 1, win: n => n >= 1 && n <= 18 },
  { key: 'high', label: '19–36', pays: 1, win: n => n >= 19 && n <= 36 },
  { key: 'd1', label: '1st 12', pays: 2, win: n => n >= 1 && n <= 12 },
  { key: 'd2', label: '2nd 12', pays: 2, win: n => n >= 13 && n <= 24 },
  { key: 'd3', label: '3rd 12', pays: 2, win: n => n >= 25 && n <= 36 },
  { key: 'straight', label: 'Number', pays: 35 },
];
const rName = n => (n === -1 ? '00' : String(n));
const rColor = n => (n <= 0 ? 'GREEN' : REDS.has(n) ? 'RED' : 'BLACK');

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
let shoe = [];
function newShoe(decks = 6) { shoe = []; for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s }); shuffle(shoe); }
function draw() { if (shoe.length < 60) newShoe(6); return shoe.pop(); }
function cardVal(c) { return c.r === 'A' ? 11 : ['J', 'Q', 'K', '10'].includes(c.r) ? 10 : Number(c.r); }
function handVal(h) { let t = 0, a = 0; for (const c of h) { t += cardVal(c); if (c.r === 'A') a++; } while (t > 21 && a) { t -= 10; a--; } return { total: t, soft: a > 0 }; }
const cardText = c => c.r + c.s;

function bacVal(c) { return ['10', 'J', 'Q', 'K'].includes(c.r) ? 0 : c.r === 'A' ? 1 : Number(c.r); }
function bacTotal(h) { return h.reduce((s, c) => s + bacVal(c), 0) % 10; }
function playBaccaratCoup() {
  const p = [draw(), draw()], b = [draw(), draw()];
  let pt = bacTotal(p), bt = bacTotal(b);
  if (pt < 8 && bt < 8) {
    let p3 = null;
    if (pt <= 5) { p3 = draw(); p.push(p3); pt = bacTotal(p); }
    let bd;
    if (p3 === null) bd = bt <= 5;
    else { const v = bacVal(p3); bd = bt <= 2 || (bt === 3 && v !== 8) || (bt === 4 && v >= 2 && v <= 7) || (bt === 5 && v >= 4 && v <= 7) || (bt === 6 && (v === 6 || v === 7)); }
    if (bd) { b.push(draw()); bt = bacTotal(b); }
  }
  return { p, b, pt, bt, winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie' };
}

const BIGSIX = [
  { key: '$1', count: 24, pays: 1 }, { key: '$2', count: 15, pays: 2 }, { key: '$5', count: 7, pays: 5 },
  { key: '$10', count: 4, pays: 10 }, { key: '$20', count: 2, pays: 20 }, { key: 'JOKER', count: 1, pays: 40 }, { key: 'LOGO', count: 1, pays: 40 },
];
BIGSIX.forEach(s => { s.edge = (54 - s.count * (s.pays + 1)) / 54; });
function bigSixOrder(o) {
  const fx = T3(); const ord = fx && fx.bigSixOrder(o);
  if (ord) return ord;
  const pool = []; BIGSIX.forEach(s => { for (let i = 0; i < s.count; i++) pool.push(s.key); });
  const out = []; for (let i = 0; i < 54; i++) out.push(pool[(i * 17) % 54]);
  return out;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------
function startGame(o) {
  if (gameSession || blocked()) return;
  const [min] = LIMITS[o.type];
  if (S.cash < min) {
    infoDialog(`${GAME_NAMES[o.type]}`, `<p>Minimum bet here is <b>${fmt(min)}</b>. You have ${fmt(S.cash)}.</p><p class="muted">Check your 📱 phone for loans… or maybe this is the moment to stop.</p>`);
    return;
  }
  clearMovement();
  if (document.pointerLockElement) document.exitPointerLock();
  seatPlayer(o);
  const G = GAMES[tut(o.type)];
  const [lo, hi] = LIMITS[o.type];
  gameSession = Object.assign({ o, type: o.type, busy: false, bet: clampBet(Math.max(lo, lo * 4), lo, hi), lo, hi, sel: 0, num: 17, log: [] }, G.init ? G.init(o) : {});
  const fx = T3();
  if (fx) { Render3D.setView(fx.seatView(o)); if (o.type === 'slots') fx.slotOpen(o); }
  $('#game-ui').classList.remove('hidden');
  document.body.classList.add('in-game');
  renderGameUI();
  let seen = false;
  try { seen = localStorage.getItem('gm_tut_' + tut(o.type)) === '1'; } catch (e) { /* storage unavailable */ }
  if (!seen) showTutorial(tut(o.type));
}

function leaveGame(force) {
  if (!gameSession) return;
  if (gameSession.busy && !force) { banner('Finish this round first', 'info'); return; }
  const g = gameSession;
  gameSession = null;
  const fx = T3();
  if (fx) { if (g.type === 'slots') fx.slotClose(); fx.clear(g.o); Render3D.setView(null); }
  $('#game-ui').classList.add('hidden');
  $('#tutorial').classList.add('hidden');
  document.body.classList.remove('in-game');
  standPlayer();
  afterAction();
}

function clampBet(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function changeBet(dir) {
  const g = gameSession; if (!g || g.busy || g.locked) return;
  const steps = BET_STEPS.filter(s => s >= g.lo && s <= g.hi);
  let i = steps.findIndex(s => s >= g.bet);
  if (i < 0) i = steps.length - 1;
  i = Math.max(0, Math.min(steps.length - 1, i + dir));
  g.bet = steps[i];
  if (dir > 0 && g.bet > S.cash) g.bet = steps.filter(s => s <= S.cash).pop() || g.lo;
  renderGameUI();
}
function maxBet() { const g = gameSession; if (!g || g.busy || g.locked) return; g.bet = clampBet(Math.floor(S.cash), g.lo, g.hi); renderGameUI(); }

function takeStake(amount) {
  if (S.cash < amount) { banner(`Not enough cash (${fmt(S.cash)})`, 'lose'); return false; }
  if (!takeBet(amount)) return false;
  updateHUD(true);
  return true;
}

function banner(text, kind = 'info', sub = '') {
  const b = $('#gu-banner');
  b.className = 'show ' + kind;
  b.innerHTML = `<div class="gb-main">${text}</div>${sub ? `<div class="gb-sub">${sub}</div>` : ''}`;
  clearTimeout(banner.t);
  banner.t = setTimeout(() => { b.className = ''; }, kind === 'info' ? 1800 : 3200);
}

function resultBanner(profit, sub) {
  if (profit > 0) banner(`WIN ${fmt(profit)}`, 'win', sub);
  else if (profit < 0) banner(`LOSE ${fmt(-profit)}`, 'lose', sub);
  else banner('PUSH', 'info', sub || 'Bet returned');
}

// GTA-style instructional overlay
function renderGameUI() {
  const g = gameSession; if (!g) return;
  const G = GAMES[tut(g.type)];
  $('#gu-title').textContent = GAME_NAMES[g.type] + (g.type === 'slots' && g.o.theme ? ` · ${g.o.theme}` : '');
  $('#gu-info').innerHTML = G.info(g);
  $('#gu-bet-amt').textContent = fmt(g.bet);
  $('#gu-limits').textContent = `Limits ${fmtShort(g.lo)}–${fmtShort(g.hi)} · Cash ${fmt(S.cash)}`;
  const opts = G.options ? G.options(g) : null;
  const oe = $('#gu-options');
  oe.innerHTML = '';
  if (opts) opts.forEach((op, i) => {
    const b = el('button', 'gu-opt' + (i === g.sel ? ' on' : '') + (op.cls ? ' ' + op.cls : ''), `${op.label}${op.sub ? `<small>${op.sub}</small>` : ''}`);
    b.onclick = () => { if (g.busy || g.locked) return; g.sel = i; renderGameUI(); };
    oe.appendChild(b);
  });
  oe.classList.toggle('hidden', !opts);
  const be = $('#gu-buttons');
  be.innerHTML = '';
  const buttons = G.buttons(g).concat([
    { key: '↑↓', label: 'Bet', fn: null, hide: g.busy || g.locked },
    { key: 'T', label: 'How to play', fn: () => showTutorial(tut(g.type)) },
    { key: 'Esc', label: 'Leave', fn: () => leaveGame(), hide: g.busy },
  ]);
  for (const bt of buttons) {
    if (bt.hide) continue;
    const b = el('button', 'gu-btn' + (bt.primary ? ' primary' : ''), `<kbd>${bt.key}</kbd>${bt.label}`);
    if (bt.fn) b.onclick = bt.fn; else b.disabled = true;
    be.appendChild(b);
  }
  $('#gu-bet').classList.toggle('locked', g.busy || !!g.locked);
}

function gameKey(k, e) {
  const g = gameSession; if (!g) return;
  if (!$('#tutorial').classList.contains('hidden')) {
    if (k === 'escape' || k === 'enter' || k === ' ') { e.preventDefault(); tutorialNext(k === 'escape'); }
    else if (k === 'arrowright') tutorialNext(); else if (k === 'arrowleft') tutorialPrev();
    return;
  }
  if (modalOpen || phoneOpen) { if (k === 'escape') { if (phoneOpen) closePhone(); else closeModal(); } return; }
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter'].includes(k)) e.preventDefault();
  if (k === 'escape' || k === 'backspace') return leaveGame();
  if (k === 't') return showTutorial(tut(g.type));
  if (k === 'p') return togglePhone();
  if (k === 'arrowup' || k === 'w') return changeBet(1);
  if (k === 'arrowdown') return changeBet(-1);
  if (k === 'm') return maxBet();
  const G = GAMES[tut(g.type)];
  const opts = G.options ? G.options(g) : null;
  if (opts && !g.busy && !g.locked && (k === 'arrowleft' || k === 'arrowright')) { g.sel = (g.sel + (k === 'arrowright' ? 1 : -1) + opts.length) % opts.length; renderGameUI(); return; }
  const bt = G.buttons(g).find(b => b.keys && b.keys.includes(k) && !b.hide);
  if (bt && bt.fn) bt.fn();
}

// ---------------------------------------------------------------------------
// SLOTS (RTP 92%)
// ---------------------------------------------------------------------------
const SLOTS = {
  info: g => `3 in a row on the middle line pays. <b>House edge 8%</b> (92% return).<div class="gu-pay">7 7 7 ×250 · 💎💎💎 ×50 · 🔔🔔🔔 ×20 · 🍉🍉🍉 ×10 · 🍋🍋🍋 ×5 · 🍒🍒🍒 ×3 · any 🍒🍒 ×0.5</div>${g.last ? `<div class="gu-last">${g.last}</div>` : ''}`,
  buttons: g => [
    { key: 'Space', keys: [' ', 'enter'], label: 'Spin', primary: true, fn: () => SLOTS.spin(), hide: g.busy },
    { key: 'A', keys: ['a'], label: 'Auto ×10', fn: () => { g.auto = 9; lesson('auto', 'Auto-spin lets you lose money faster without even thinking about each bet.'); SLOTS.spin(); }, hide: g.busy },
    { key: 'M', keys: ['m'], label: 'Max bet', fn: maxBet, hide: g.busy },
  ],
  async spin() {
    const g = gameSession; if (!g || g.busy) return;
    if (!takeStake(g.bet)) { g.auto = 0; return; }
    g.busy = true; renderGameUI();
    const amount = g.bet;
    const out = slotOutcome();
    const fx = T3();
    const rows = out.reels.map(s => [pick(SLOT_SYMS), s, pick(SLOT_SYMS)]);
    if (fx) await fx.slotSpin(rows, 1.7); else await wait(1200);
    const ret = amount * out.mult;
    const profit = settle('Slots', amount, ret, 0.08);
    if (!gameSession) return;
    if (out.disguised) {
      banner('🎉 WINNER! 🎉', 'win', `Paid ${fmt(ret)} on a ${fmt(amount)} bet: you actually LOST ${fmt(-profit)}.`);
      fx && fx.slotMessage(`WINNER ${fmt(ret)}!`, true);
      lesson('ldw', 'Slot machines flash lights and play music even when you "win" less than you bet. These are called losses disguised as wins.');
    } else if (profit > 0) {
      resultBanner(profit, out.mult >= 20 ? 'JACKPOT LINE!' : ''); fx && fx.slotMessage(`WIN ${fmt(ret)}`, true);
    } else {
      resultBanner(profit, out.nearMiss ? 'So close… near misses are designed to keep you playing.' : '');
      fx && fx.slotMessage(out.nearMiss ? 'SO CLOSE!' : 'PLAY AGAIN');
      if (out.nearMiss) lesson('nearmiss', 'Near misses (two jackpot symbols) are shown on purpose. Your brain reacts almost like it won, so you keep spinning.');
    }
    g.last = `Last spin: ${out.reels.join(' ')} → ${profit >= 0 ? '+' : ''}${fmt(profit)}`;
    g.busy = false;
    renderGameUI();
    if (g.auto > 0 && gameSession === g && !S.ended) { g.auto--; await wait(450); SLOTS.spin(); }
  },
};

// ---------------------------------------------------------------------------
// ROULETTE (double zero, 5.26%)
// ---------------------------------------------------------------------------
const ROULETTE = {
  init: () => ({ history: [] }),
  options: g => ROULETTE_BETS.map(b => ({ label: b.key === 'straight' ? `#${rName(g.num)}` : b.label, sub: `${b.pays}:1`, cls: b.key === 'red' ? 'red' : b.key === 'black' ? 'black' : '' })),
  info: g => `Pick a bet, then spin. The wheel has 38 pockets: 1–36 plus <b>0</b> and <b>00</b>. <b>House edge 5.26%</b> on every bet.${g.history.length ? `<div class="gu-hist">${g.history.slice(0, 10).map(n => `<span class="rc ${rColor(n).toLowerCase()}">${rName(n)}</span>`).join('')}</div>` : ''}`,
  buttons: g => [
    { key: 'Enter', keys: ['enter', ' '], label: 'Spin', primary: true, fn: () => ROULETTE.spin(), hide: g.busy },
    { key: '←→', label: 'Bet type', fn: null, hide: g.busy },
    { key: 'Z / X', keys: ['z', 'x'], label: 'Number', fn: () => {}, hide: g.busy || ROULETTE_BETS[g.sel].key !== 'straight' },
  ],
  async spin() {
    const g = gameSession; if (!g || g.busy) return;
    const b = ROULETTE_BETS[g.sel];
    if (!takeStake(g.bet)) return;
    g.busy = true; renderGameUI();
    const amount = g.bet, fx = T3();
    const n = randInt(-1, 36);
    if (fx) {
      await fx.rouletteBet(g.o, b.key, g.num, amount);
      banner('No more bets', 'info');
      Render3D.setView(fx.wheelView(g.o));
      await fx.rouletteSpin(g.o, n);
      await wait(900);
      if (gameSession === g) Render3D.setView(fx.seatView(g.o));
    }
    else await wait(2500);
    const won = b.key === 'straight' ? g.num === n : b.win(n);
    const ret = won ? amount * (b.pays + 1) : 0;
    const profit = settle('Roulette', amount, ret, 0.0526);
    if (!gameSession) return;
    g.history.unshift(n);
    resultBanner(profit, `${rName(n)} ${rColor(n)}`);
    if (g.history.length >= 5) lesson('history', 'The board of past numbers is there to make you look for patterns. The wheel has no memory: past spins don\'t change the odds.');
    if (fx) await fx.resolveChips(g.o, won, ret - amount);
    g.busy = false; renderGameUI();
  },
};
// number selection for straight-up bets
document.addEventListener('keydown', e => {
  const g = gameSession;
  if (!g || g.type !== 'roulette' || g.busy || ROULETTE_BETS[g.sel].key !== 'straight') return;
  const k = e.key.toLowerCase();
  if (k === 'z' || k === 'x') { const order = [0, -1, ...Array.from({ length: 36 }, (_, i) => i + 1)]; const i = order.indexOf(g.num); g.num = order[(i + (k === 'x' ? 1 : -1) + order.length) % order.length]; renderGameUI(); }
});

// ---------------------------------------------------------------------------
// BLACKJACK (6 decks, H17, 6:5)
// ---------------------------------------------------------------------------
const BLACKJACK = {
  init: () => { if (!shoe.length) newShoe(6); return { hand: [], dealer: [], inHand: false, hideHole: true }; },
  info: g => {
    const hv = g.hand.length ? handVal(g.hand) : null;
    const dv = g.dealer.length ? (g.hideHole ? `${cardVal(g.dealer[0])} + ?` : handVal(g.dealer).total) : '–';
    return `Get closer to 21 than the dealer without going over. Dealer hits soft 17. <b>Blackjack pays 6:5</b>. <b>House edge ≈2%</b>.
      <div class="gu-hands"><div><span>DEALER</span><b>${g.dealer.map((c, i) => i === 1 && g.hideHole ? '🂠' : cardText(c)).join(' ') || '–'}</b><em>${dv}</em></div>
      <div><span>YOU</span><b>${g.hand.map(cardText).join(' ') || '–'}</b><em>${hv ? hv.total + (hv.soft && hv.total < 21 ? ' soft' : '') : '–'}</em></div></div>`;
  },
  buttons: g => g.inHand ? [
    { key: 'H', keys: ['h', ' '], label: 'Hit', primary: true, fn: () => BLACKJACK.hit(), hide: g.acting },
    { key: 'S', keys: ['s', 'enter'], label: 'Stand', fn: () => BLACKJACK.stand(), hide: g.acting },
    { key: 'D', keys: ['d'], label: 'Double', fn: () => BLACKJACK.double(), hide: g.acting || g.hand.length !== 2 || S.cash < g.stake },
  ] : [{ key: 'Enter', keys: ['enter', ' '], label: 'Deal', primary: true, fn: () => BLACKJACK.deal(), hide: g.busy }],
  async deal() {
    const g = gameSession; if (!g || g.busy) return;
    if (!takeStake(g.bet)) return;
    const fx = T3();
    g.busy = true; g.locked = true; g.acting = true; g.stake = g.bet; g.hideHole = true; g.hand = []; g.dealer = [];
    renderGameUI();
    if (fx) await fx.placeBet(g.o, g.stake);
    const give = async (who, faceUp = true) => {
      const c = draw();
      (who === 'dealer' ? g.dealer : g.hand).push(c);
      if (fx) await fx.deal(g.o, who, (who === 'dealer' ? g.dealer : g.hand).length - 1, c, faceUp); else await wait(250);
      renderGameUI();
    };
    await give('player'); await give('dealer'); await give('player'); await give('dealer', false);
    g.inHand = true; g.acting = false;
    const pBJ = handVal(g.hand).total === 21, dBJ = handVal(g.dealer).total === 21;
    if (pBJ || dBJ) {
      if (fx) await fx.flip(g.o, 'dealer', 1);
      g.hideHole = false;
      if (pBJ && dBJ) return BLACKJACK.finish(g.stake, 'Both have blackjack');
      if (pBJ) { lesson('65', 'Many casinos pay blackjack at 6:5 instead of 3:2. It looks almost the same, but it more than triples the house edge.'); return BLACKJACK.finish(g.stake + g.stake * 1.2, 'BLACKJACK! (pays only 6:5)'); }
      return BLACKJACK.finish(0, 'Dealer has blackjack');
    }
    renderGameUI();
  },
  async hit() {
    const g = gameSession; if (!g || !g.inHand || g.acting) return;
    g.acting = true; renderGameUI();
    const c = draw(); g.hand.push(c);
    const fx = T3();
    if (fx) await fx.deal(g.o, 'player', g.hand.length - 1, c, true); else await wait(250);
    const v = handVal(g.hand).total;
    g.acting = false;
    if (v > 21) return BLACKJACK.finish(0, `Bust with ${v}`);
    if (v === 21) return BLACKJACK.dealerPlay();
    renderGameUI();
  },
  stand() { const g = gameSession; if (g && g.inHand && !g.acting) BLACKJACK.dealerPlay(); },
  async double() {
    const g = gameSession; if (!g || !g.inHand || g.acting || g.hand.length !== 2) return;
    if (!takeStake(g.stake)) return;
    g.acting = true;
    const fx = T3();
    if (fx) await fx.placeBet(g.o, g.stake);
    g.stake *= 2;
    const c = draw(); g.hand.push(c);
    if (fx) await fx.deal(g.o, 'player', 2, c, true); else await wait(250);
    const v = handVal(g.hand).total;
    if (v > 21) return BLACKJACK.finish(0, `Doubled and bust with ${v}`);
    BLACKJACK.dealerPlay();
  },
  async dealerPlay() {
    const g = gameSession; if (!g) return;
    g.acting = true; renderGameUI();
    const fx = T3();
    g.hideHole = false;
    if (fx) await fx.flip(g.o, 'dealer', 1); else await wait(300);
    renderGameUI();
    let v = handVal(g.dealer);
    while (v.total < 17 || (v.total === 17 && v.soft)) {
      const c = draw(); g.dealer.push(c);
      if (fx) await fx.deal(g.o, 'dealer', g.dealer.length - 1, c, true); else await wait(300);
      renderGameUI();
      v = handVal(g.dealer);
    }
    const p = handVal(g.hand).total, d = v.total;
    if (d > 21) BLACKJACK.finish(g.stake * 2, `Dealer busts with ${d}`);
    else if (p > d) BLACKJACK.finish(g.stake * 2, `${p} beats ${d}`);
    else if (p < d) BLACKJACK.finish(0, `Dealer's ${d} beats your ${p}`);
    else BLACKJACK.finish(g.stake, `Both have ${p}`);
  },
  async finish(ret, msg) {
    const g = gameSession; if (!g) return;
    g.inHand = false; g.acting = true; g.hideHole = false;
    const profit = settle(g.type === 'blackjack_hl' ? 'VIP Blackjack' : 'Blackjack', g.stake, ret, 0.02);
    if (!gameSession) return;
    resultBanner(profit, msg);
    renderGameUI();
    const fx = T3();
    if (fx) { await fx.resolveChips(g.o, ret > 0, Math.max(0, ret - g.stake)); await wait(900); await fx.clear(g.o); } else await wait(600);
    g.hand = []; g.dealer = []; g.busy = false; g.locked = false; g.acting = false;
    renderGameUI();
  },
};

// ---------------------------------------------------------------------------
// BACCARAT
// ---------------------------------------------------------------------------
const BAC_SIDES = [{ key: 'player', label: 'Player', sub: '1:1', edge: 0.0124 }, { key: 'banker', label: 'Banker', sub: '0.95:1', edge: 0.0106 }, { key: 'tie', label: 'Tie', sub: '8:1', edge: 0.1436 }];
const BACCARAT = {
  init: () => { if (!shoe.length) newShoe(8); return { coup: null }; },
  options: () => BAC_SIDES.map(s => ({ label: s.label, sub: s.sub })),
  info: g => `Bet on which hand ends closest to 9. Tens and face cards count 0; the dealer draws by fixed rules. <b>House edge</b> 1.06% Banker · 1.24% Player · 14.4% Tie.${g.coup ? `<div class="gu-hands"><div><span>PLAYER</span><b>${g.coup.p.map(cardText).join(' ')}</b><em>${g.coup.pt}</em></div><div><span>BANKER</span><b>${g.coup.b.map(cardText).join(' ')}</b><em>${g.coup.bt}</em></div></div>` : ''}`,
  buttons: g => [{ key: 'Enter', keys: ['enter', ' '], label: 'Deal', primary: true, fn: () => BACCARAT.deal(), hide: g.busy }, { key: '←→', label: 'Side', fn: null, hide: g.busy }],
  async deal() {
    const g = gameSession; if (!g || g.busy) return;
    const side = BAC_SIDES[g.sel];
    if (!takeStake(g.bet)) return;
    g.busy = true; g.coup = null; renderGameUI();
    const amount = g.bet, fx = T3();
    if (fx) await fx.placeBet(g.o, amount);
    const coup = playBaccaratCoup();
    const shown = { p: [], b: [], pt: 0, bt: 0 };
    g.coup = shown;
    const order = [['player', 0], ['banker', 0], ['player', 1], ['banker', 1]];
    if (coup.p[2]) order.push(['player', 2]);
    if (coup.b[2]) order.push(['banker', 2]);
    for (const [who, i] of order) {
      const c = who === 'player' ? coup.p[i] : coup.b[i];
      (who === 'player' ? shown.p : shown.b).push(c);
      shown.pt = bacTotal(shown.p); shown.bt = bacTotal(shown.b);
      if (fx) await fx.deal(g.o, who, i, c, true); else await wait(250);
      renderGameUI();
    }
    let ret = 0;
    if (coup.winner === 'tie') ret = side.key === 'tie' ? amount * 9 : amount;
    else if (coup.winner === side.key) ret = side.key === 'banker' ? amount + amount * 0.95 : amount * 2;
    const profit = settle(g.type === 'baccarat_hl' ? 'VIP Baccarat' : 'Baccarat', amount, ret, side.edge);
    if (!gameSession) return;
    resultBanner(profit, coup.winner === 'tie' ? `Tie ${coup.pt}–${coup.bt}` : `${coup.winner === 'player' ? 'Player' : 'Banker'} wins ${Math.max(coup.pt, coup.bt)}–${Math.min(coup.pt, coup.bt)}`);
    if (side.key === 'tie') lesson('tie', 'The Tie bet pays 8:1 but only hits about 9.5% of the time. Its house edge is over 14%.');
    if (fx) { await fx.resolveChips(g.o, ret > amount, Math.max(0, ret - amount)); await wait(900); await fx.clear(g.o); }
    g.busy = false; renderGameUI();
  },
};

// ---------------------------------------------------------------------------
// CRAPS (pass 1.41%, don't pass 1.36%)
// ---------------------------------------------------------------------------
const CRAPS = {
  init: () => ({ point: null, stake: 0, dont: false, rolls: [] }),
  options: g => [{ label: 'Pass Line', sub: '1:1' }, { label: "Don't Pass", sub: '1:1' }],
  info: g => `Come-out roll: <b>7 or 11</b> wins Pass, <b>2, 3, 12</b> loses. Any other number becomes <b>the point</b>: roll it again before a 7 to win. <b>House edge</b> 1.41% Pass · 1.36% Don't Pass.
    <div class="gu-hands"><div><span>POINT</span><b>${g.point || 'OFF'}</b><em>${g.stake ? (g.dont ? "Don't Pass " : 'Pass ') + fmt(g.stake) : ''}</em></div><div><span>ROLLS</span><b>${g.rolls.slice(-8).join(' · ') || '–'}</b></div></div>`,
  buttons: g => [{ key: 'Enter', keys: ['enter', ' '], label: g.point ? 'Roll again' : 'Roll', primary: true, fn: () => CRAPS.roll(), hide: g.rolling }, { key: '←→', label: "Pass / Don't", fn: null, hide: g.busy }],
  async roll() {
    const g = gameSession; if (!g || g.rolling) return;
    const fx = T3();
    if (!g.stake) {
      if (!takeStake(g.bet)) return;
      g.stake = g.bet; g.dont = g.sel === 1; g.busy = true; g.locked = true;
      if (fx) { const td = fx.td(g.o); await fx.placeBet(g.o, g.stake, fx.L(td, 0.1, td.feltY + 0.001, td.d * (g.dont ? 0.203 : 0.315))); } // on the printed Pass Line / Don't Pass Bar
    }
    g.rolling = true; renderGameUI();
    const a = randInt(1, 6), b = randInt(1, 6), t = a + b;
    if (fx) await fx.throwDice(g.o, a, b); else await wait(700);
    advanceTime(1);
    g.rolls.push(t);
    let outcome = null;
    if (g.point === null) {
      if (t === 7 || t === 11) outcome = 'pass';
      else if (t === 2 || t === 3) outcome = 'dont';
      else if (t === 12) outcome = g.dont ? 'push' : 'dont';
      else { g.point = t; fx && fx.puck(g.o, t); banner(`Point is ${t}`, 'info', `Roll ${t} again before a 7`); }
    } else if (t === g.point) outcome = 'pass';
    else if (t === 7) outcome = 'dont';
    else banner(`Rolled ${t}`, 'info', `Point is ${g.point}`);
    g.rolling = false;
    if (outcome) {
      const amount = g.stake;
      let ret = 0;
      if (outcome === 'push') ret = amount; else if ((outcome === 'pass') !== g.dont) ret = amount * 2;
      const profit = settle(g.dont ? "Craps (Don't Pass)" : 'Craps (Pass)', amount, ret, g.dont ? 0.0136 : 0.0141);
      if (!gameSession) return;
      resultBanner(profit, `Rolled ${t}${g.point ? ` (point ${g.point})` : ''}`);
      g.point = null; g.stake = 0; fx && fx.puck(g.o, null);
      if (fx) await fx.resolveChips(g.o, ret > amount, Math.max(0, ret - amount));
      g.busy = false; g.locked = false;
    }
    renderGameUI();
  },
};

// ---------------------------------------------------------------------------
// BIG SIX
// ---------------------------------------------------------------------------
const BIGSIX_GAME = {
  options: () => BIGSIX.map(s => ({ label: s.key, sub: `${s.pays}:1 · ${s.count}/54` })),
  info: g => `Bet on a symbol and spin. Each segment's payout is lower than its real odds. <b>House edge 11%–24%</b>, the worst bets in the casino.${g.last ? `<div class="gu-last">${g.last}</div>` : ''}`,
  buttons: g => [{ key: 'Enter', keys: ['enter', ' '], label: 'Spin', primary: true, fn: () => BIGSIX_GAME.spin(), hide: g.busy }, { key: '←→', label: 'Symbol', fn: null, hide: g.busy }],
  async spin() {
    const g = gameSession; if (!g || g.busy) return;
    const choice = BIGSIX[g.sel];
    if (!takeStake(g.bet)) return;
    g.busy = true; renderGameUI();
    const order = bigSixOrder(g.o);
    const idx = randInt(0, 53);
    const land = order[idx];
    const fx = T3();
    if (fx) await fx.bigSixSpin(g.o, idx); else await wait(2000);
    const ret = land === choice.key ? g.bet * (choice.pays + 1) : 0;
    const profit = settle('Big Six Wheel', g.bet, ret, choice.edge);
    if (!gameSession) return;
    g.last = `Wheel stopped on ${land}`;
    resultBanner(profit, `Wheel stops on ${land}`);
    g.busy = false; renderGameUI();
  },
};

const GAMES = { slots: SLOTS, roulette: ROULETTE, blackjack: BLACKJACK, baccarat: BACCARAT, craps: CRAPS, bigsix: BIGSIX_GAME };

// ---------------------------------------------------------------------------
// Tutorials
// ---------------------------------------------------------------------------
const TUTORIALS = {
  slots: [
    ['How slots work', 'Choose your bet with <kbd>↑</kbd><kbd>↓</kbd> and press <kbd>Space</kbd> to spin. Three matching symbols on the middle line pay out.'],
    ['The paytable', '<div class="tut-table"><div>7 7 7</div><b>250×</b><div>💎 💎 💎</div><b>50×</b><div>🔔 🔔 🔔</div><b>20×</b><div>🍉 🍉 🍉</div><b>10×</b><div>🍋 🍋 🍋</div><b>5×</b><div>🍒 🍒 🍒</div><b>3×</b><div>any two 🍒</div><b>0.5×</b></div>'],
    ['The math', 'This machine returns <b>92%</b> of everything bet over time. That means for every <b>$100</b> you put in, you should expect to lose <b>$8</b>. The more you spin, the closer you get to that.'],
    ['The tricks', '<b>Near misses</b> (two 7s and a blank) are shown on purpose to make you feel close. <b>"Wins" of 0.5×</b> flash and play music even though you lost half your bet. <b>Auto-spin</b> removes the pause to think.'],
    ['Controls', '<kbd>Space</kbd> spin · <kbd>A</kbd> auto-spin ×10 · <kbd>M</kbd> max bet · <kbd>T</kbd> this tutorial · <kbd>Esc</kbd> stand up'],
  ],
  blackjack: [
    ['The goal', 'Beat the dealer by finishing <b>closer to 21</b> without going over. Going over 21 is a <b>bust</b>: you lose immediately, even if the dealer busts later.'],
    ['Card values', 'Number cards count their number. <b>J, Q, K</b> count 10. <b>Aces</b> count 1 or 11, whichever helps. An Ace plus a 10-value card is <b>Blackjack</b>.'],
    ['Your moves', '<kbd>H</kbd> <b>Hit</b>: take another card. <kbd>S</kbd> <b>Stand</b>: keep your total. <kbd>D</kbd> <b>Double</b>: double your bet, take exactly one more card.'],
    ['Dealer rules & payouts', 'The dealer must hit until 17 and <b>hits soft 17</b>. Wins pay 1:1. Blackjack pays only <b>6:5</b> here (the fair table pays 3:2).'],
    ['The math', 'Even with perfect play, these rules give the house about a <b>2% edge</b>. On a $1,000 bet you lose about <b>$20</b> on average every hand. Fast hands add up.'],
  ],
  roulette: [
    ['The wheel', 'The ball lands in one of <b>38 pockets</b>: numbers 1–36 (red or black) plus green <b>0</b> and <b>00</b>.'],
    ['Placing bets', 'Use <kbd>←</kbd><kbd>→</kbd> to pick a bet type and <kbd>↑</kbd><kbd>↓</kbd> for the amount. For a single number, pick <b>Number</b> and change it with <kbd>Z</kbd><kbd>X</kbd>. Press <kbd>Enter</kbd> to spin.'],
    ['Payouts', '<div class="tut-table"><div>Red/Black, Odd/Even, 1–18/19–36</div><b>1:1</b><div>Dozens (1st, 2nd, 3rd 12)</div><b>2:1</b><div>Single number</div><b>35:1</b></div>'],
    ['The math', 'A single number pays 35:1 but the true odds are 37:1. The two green zeros make <b>every</b> bet lose <b>5.26%</b> on average: $5.26 for every $100. Red and black both lose when 0 or 00 hits.'],
    ['Myths', 'Past numbers never change the next spin. There\'s no "due" number and no system that beats a negative edge.'],
  ],
  craps: [
    ['The come-out roll', 'Bet the <b>Pass Line</b> and press <kbd>Enter</kbd> to roll two dice. <b>7 or 11</b> wins right away. <b>2, 3 or 12</b> ("craps") loses.'],
    ['The point', 'Any other total (4, 5, 6, 8, 9, 10) becomes <b>the point</b>, marked with the ON puck. Keep rolling: hit the point again before a <b>7</b> to win. A 7 first is a "seven-out" and you lose.'],
    ["Don't Pass", "The opposite bet: wins on 2 or 3, loses on 7 or 11, and wins if a 7 comes before the point. A 12 on the come-out is a push."],
    ['The math', 'Pass Line has a <b>1.41%</b> house edge, Don\'t Pass <b>1.36%</b>. They\'re among the best bets in the casino, but you still lose over time.'],
  ],
  baccarat: [
    ['The bet', 'Bet on the <b>Player</b> hand, the <b>Banker</b> hand, or a <b>Tie</b>, using <kbd>←</kbd><kbd>→</kbd>. Press <kbd>Enter</kbd> to deal.'],
    ['Card values', 'Aces count 1, 2–9 count face value, and <b>10, J, Q, K count 0</b>. Only the last digit of the total counts (7 + 8 = 15 → <b>5</b>). Closest to 9 wins.'],
    ['Drawing rules', 'You make no decisions: each hand draws a third card by fixed rules, so it\'s pure chance.'],
    ['Payouts & math', 'Player pays 1:1 (edge 1.24%). Banker pays 1:1 minus a 5% commission (edge 1.06%). <b>Tie pays 8:1 but has a 14.4% edge</b>, one of the worst bets on the floor.'],
  ],
  bigsix: [
    ['The wheel', 'A big vertical wheel with <b>54 segments</b>: 24 × $1, 15 × $2, 7 × $5, 4 × $10, 2 × $20, 1 Joker, 1 Logo.'],
    ['Betting', 'Pick a symbol with <kbd>←</kbd><kbd>→</kbd>, set your bet with <kbd>↑</kbd><kbd>↓</kbd> and press <kbd>Enter</kbd>. If the clapper stops on your symbol, you win its payout.'],
    ['The math', '$1 pays 1:1 but only covers 24 of 54 segments: edge <b>11.1%</b>. Joker pays 40:1 but should pay 53:1: edge <b>24%</b>. This is the worst game in the house.'],
  ],
};
let tutState = null;
function showTutorial(type) {
  tutState = { type, i: 0 };
  $('#tutorial').classList.remove('hidden');
  drawTutorial();
}
function drawTutorial() {
  const steps = TUTORIALS[tutState.type];
  const [title, body] = steps[tutState.i];
  $('#tut-kicker').textContent = `HOW TO PLAY ${GAME_NAMES[tutState.type].toUpperCase()} · ${tutState.i + 1} / ${steps.length}`;
  $('#tut-title').textContent = title;
  $('#tut-body').innerHTML = body;
  $('#tut-prev').disabled = tutState.i === 0;
  $('#tut-next').textContent = tutState.i === steps.length - 1 ? 'Start playing' : 'Next';
  $('#tut-dots').innerHTML = steps.map((_, i) => `<i class="${i === tutState.i ? 'on' : ''}"></i>`).join('');
}
function tutorialNext(skip) {
  if (!tutState) return;
  const steps = TUTORIALS[tutState.type];
  if (skip || tutState.i >= steps.length - 1) {
    try { localStorage.setItem('gm_tut_' + tutState.type, '1'); } catch (e) { /* ignore */ }
    $('#tutorial').classList.add('hidden');
    tutState = null;
    return;
  }
  tutState.i++; drawTutorial();
}
function tutorialPrev() { if (tutState && tutState.i > 0) { tutState.i--; drawTutorial(); } }
function setupGameUI() {
  $('#tut-next').onclick = () => tutorialNext();
  $('#tut-prev').onclick = () => tutorialPrev();
  $('#tut-skip').onclick = () => tutorialNext(true);
  $('#gu-bet-up').onclick = () => changeBet(1);
  $('#gu-bet-down').onclick = () => changeBet(-1);
}

// Compatibility for other modules
function openSlots() {} // replaced by seated sessions
