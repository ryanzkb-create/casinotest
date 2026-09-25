'use strict';

// ---------------------------------------------------------------------------
// Shared bet selector
// ---------------------------------------------------------------------------
function makeBetBox(min, max, initial) {
  const box = el('div', 'betbox');
  let value = initial || min;
  const cap = () => Math.min(max, Math.floor(S.cash));
  const chips = [1, 10, 100, 1000, 10_000, 100_000, 1_000_000].filter(c => c >= min / 10 && c <= max);
  box.innerHTML = `
    <div class="bet-top">
      <span>Bet</span>
      <input type="number" class="bet-input" min="${min}" max="${max}" step="1">
      <span class="bet-limits">Table limits ${fmtShort(min)} – ${fmtShort(max)}</span>
    </div>
    <div class="chips"></div>`;
  const input = box.querySelector('.bet-input');
  const chipRow = box.querySelector('.chips');
  const set = v => { value = clamp(Math.floor(v) || 0, min, Math.max(min, cap())); input.value = value; };
  chips.forEach(c => {
    const b = el('button', 'chip', '+' + fmtShort(c).replace('$', ''));
    b.onclick = () => set((value === min && c > min ? 0 : value) + c);
    chipRow.appendChild(b);
  });
  [['½', () => set(value / 2)], ['×2', () => set(value * 2)], ['MIN', () => set(min)], ['MAX', () => set(cap())]]
    .forEach(([t, fn]) => { const b = el('button', 'chip alt', t); b.onclick = fn; chipRow.appendChild(b); });
  input.onchange = () => set(Number(input.value));
  set(value);
  return {
    el: box,
    get value() { return value; },
    refresh() { set(value); },
    // Validates and takes the bet; returns the amount or 0
    take(extraCheck) {
      set(Number(input.value));
      if (S.cash < min) { toast(`You need at least ${fmt(min)} to play here.`, 'danger'); return 0; }
      if (value > S.cash) { toast('Not enough cash.', 'danger'); return 0; }
      if (extraCheck && !extraCheck(value)) return 0;
      if (!takeBet(value)) return 0;
      return value;
    },
  };
}

function resultLine(profit) {
  if (profit > 0) return `<span class="win">WIN +${fmt(profit)}</span>`;
  if (profit < 0) return `<span class="lose">LOSE ${fmt(profit)}</span>`;
  return `<span class="push">PUSH (bet returned)</span>`;
}

function gameHeader(edgeText) {
  return `<div class="edge-note">House edge: <b>${edgeText}</b>. On average you lose this much of every dollar you bet.</div>`;
}

function cashLine() {
  return `<div class="cash-line">Cash: <b class="live-cash">${fmt(S.cash)}</b></div>`;
}
function refreshCash(root) {
  root.querySelectorAll('.live-cash').forEach(e => e.textContent = fmt(S.cash));
}

// ---------------------------------------------------------------------------
// SLOTS  (RTP 92% → 8% house edge)
// ---------------------------------------------------------------------------
const SLOT_TABLE = [
  { sym: '7️⃣', mult: 250, p: 0.0008 },
  { sym: '💎', mult: 50, p: 0.003 },
  { sym: '🔔', mult: 20, p: 0.008 },
  { sym: '🍉', mult: 10, p: 0.015 },
  { sym: '🍋', mult: 5, p: 0.03 },
  { sym: '🍒', mult: 3, p: 0.03 },
  { sym: '🍒', mult: 0.5, p: 0.04, two: true }, // "loss disguised as a win"
];
const SLOT_SYMS = ['7️⃣', '💎', '🔔', '🍉', '🍋', '🍒', '⭐'];

function slotOutcome() {
  let r = Math.random();
  for (const o of SLOT_TABLE) {
    if (r < o.p) {
      if (o.two) return { reels: shuffle(['🍒', '🍒', pick(['7️⃣', '💎', '🔔', '🍋', '⭐'])]), mult: o.mult, disguised: true };
      return { reels: [o.sym, o.sym, o.sym], mult: o.mult };
    }
    r -= o.p;
  }
  // Loss. Show a "near miss" on purpose a lot of the time, like real machines.
  if (Math.random() < 0.3) {
    const s = pick(['7️⃣', '💎']);
    const other = pick(SLOT_SYMS.filter(x => x !== s && x !== '🍒'));
    return { reels: shuffle([s, s, other]), mult: 0, nearMiss: true };
  }
  let reels;
  do { reels = [pick(SLOT_SYMS), pick(SLOT_SYMS), pick(SLOT_SYMS)]; }
  while ((reels[0] === reels[1] && reels[1] === reels[2]) || reels.filter(x => x === '🍒').length >= 2);
  return { reels, mult: 0 };
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function openSlots() {
  const root = el('div', 'game slots');
  root.innerHTML = gameHeader('8% (92% RTP)') + cashLine() + `
    <div class="reels"><div class="reel">🎰</div><div class="reel">🎰</div><div class="reel">🎰</div></div>
    <div class="paytable">7️⃣7️⃣7️⃣ 250× · 💎💎💎 50× · 🔔🔔🔔 20× · 🍉🍉🍉 10× · 🍋🍋🍋 5× · 🍒🍒🍒 3× · any 🍒🍒 0.5×</div>
    <div class="result"></div>`;
  const bet = makeBetBox(1, 10_000, 100);
  root.appendChild(bet.el);
  const row = el('div', 'btn-row');
  const spinBtn = el('button', 'btn primary', 'SPIN');
  const autoBtn = el('button', 'btn', 'AUTO ×10');
  row.append(spinBtn, autoBtn);
  root.appendChild(row);
  const reels = root.querySelectorAll('.reel');
  const result = root.querySelector('.result');
  let busy = false, autoLeft = 0;

  function spin() {
    if (busy || S.ended) return;
    const amount = bet.take();
    if (!amount) { autoLeft = 0; return; }
    busy = true;
    refreshCash(root);
    const out = slotOutcome();
    let ticks = 0;
    const iv = setInterval(() => {
      reels.forEach((r, i) => { if (ticks < 6 + i * 3) r.textContent = pick(SLOT_SYMS); else r.textContent = out.reels[i]; });
      ticks++;
      if (ticks > 13) {
        clearInterval(iv);
        const ret = amount * out.mult;
        const profit = settle('Slots', amount, ret, 0.08);
        let txt = resultLine(profit);
        if (out.disguised) {
          txt = `<span class="win flash">🎉 WINNER! 🎉 Paid ${fmt(ret)}</span><div class="sub">…but you bet ${fmt(amount)}. You actually LOST ${fmt(-profit)}. This is a "loss disguised as a win".</div>`;
          lesson('ldw', 'Slot machines flash lights and play music even when you "win" less than you bet. Researchers call these losses disguised as wins.');
        } else if (out.nearMiss) {
          txt += '<div class="sub">So close!… Near misses are designed to make you feel you almost won. You didn\'t: a loss is a loss.</div>';
          lesson('nearmiss', 'Near misses (two jackpot symbols) are shown on purpose. They make your brain react almost like a win and keep you spinning.');
        }
        result.innerHTML = txt;
        refreshCash(root);
        bet.refresh();
        busy = false;
        if (autoLeft > 0 && !S.ended && modalOpen) { autoLeft--; setTimeout(spin, 350); }
      }
    }, 60);
  }
  spinBtn.onclick = () => { autoLeft = 0; spin(); };
  autoBtn.onclick = () => {
    autoLeft = 9;
    lesson('auto', 'Auto-spin lets you lose money faster without even thinking about each bet.');
    spin();
  };
  openModal('🎰 Slot Machine', root, () => { autoLeft = 0; return !busy; });
}

// ---------------------------------------------------------------------------
// ROULETTE  (American double-zero wheel, 5.26% edge)
// ---------------------------------------------------------------------------
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROULETTE_BETS = {
  red: { label: 'Red', pays: 1, win: n => REDS.has(n) },
  black: { label: 'Black', pays: 1, win: n => n > 0 && !REDS.has(n) },
  odd: { label: 'Odd', pays: 1, win: n => n > 0 && n % 2 === 1 },
  even: { label: 'Even', pays: 1, win: n => n > 0 && n % 2 === 0 },
  low: { label: '1–18', pays: 1, win: n => n >= 1 && n <= 18 },
  high: { label: '19–36', pays: 1, win: n => n >= 19 && n <= 36 },
  d1: { label: '1st 12', pays: 2, win: n => n >= 1 && n <= 12 },
  d2: { label: '2nd 12', pays: 2, win: n => n >= 13 && n <= 24 },
  d3: { label: '3rd 12', pays: 2, win: n => n >= 25 && n <= 36 },
  straight: { label: 'Single number', pays: 35 },
};

function rouletteColor(n) { return n <= 0 ? 'green' : REDS.has(n) ? 'red' : 'black'; }
function rouletteName(n) { return n === -1 ? '00' : String(n); }

function openRoulette() {
  const root = el('div', 'game roulette');
  root.innerHTML = gameHeader('5.26% (0 and 00 pockets)') + cashLine() + `
    <div class="wheel-result"><div class="ball green">?</div></div>
    <div class="history"></div>
    <div class="bet-types"></div>
    <div class="straight-pick hidden">Number: <select class="num"></select></div>
    <div class="result"></div>`;
  const types = root.querySelector('.bet-types');
  let choice = 'red';
  Object.entries(ROULETTE_BETS).forEach(([k, b]) => {
    const btn = el('button', 'opt' + (k === choice ? ' on' : '') + (k === 'red' ? ' red' : k === 'black' ? ' black' : ''),
      `${b.label}<small>${b.pays}:1</small>`);
    btn.onclick = () => {
      choice = k;
      types.querySelectorAll('.opt').forEach(o => o.classList.remove('on'));
      btn.classList.add('on');
      root.querySelector('.straight-pick').classList.toggle('hidden', k !== 'straight');
    };
    types.appendChild(btn);
  });
  const sel = root.querySelector('.num');
  ['0', '00', ...Array.from({ length: 36 }, (_, i) => String(i + 1))].forEach(v => sel.add(new Option(v, v === '00' ? -1 : v)));
  sel.value = '17';
  const bet = makeBetBox(10, 50_000, 1000);
  root.appendChild(bet.el);
  const row = el('div', 'btn-row');
  const spinBtn = el('button', 'btn primary', 'SPIN THE WHEEL');
  row.appendChild(spinBtn);
  root.appendChild(row);
  const ball = root.querySelector('.ball');
  const hist = root.querySelector('.history');
  const result = root.querySelector('.result');
  let busy = false;
  const history = [];

  spinBtn.onclick = () => {
    if (busy || S.ended) return;
    const amount = bet.take();
    if (!amount) return;
    busy = true;
    refreshCash(root);
    const n = randInt(-1, 36); // -1 = "00": 38 pockets total
    let ticks = 0;
    const iv = setInterval(() => {
      const f = ticks < 18 ? randInt(-1, 36) : n;
      ball.textContent = rouletteName(f);
      ball.className = 'ball ' + rouletteColor(f);
      if (++ticks > 18) {
        clearInterval(iv);
        const b = ROULETTE_BETS[choice];
        const won = choice === 'straight' ? Number(sel.value) === n : b.win(n);
        const ret = won ? amount * (b.pays + 1) : 0;
        const profit = settle('Roulette', amount, ret, 0.0526);
        history.unshift(n);
        hist.innerHTML = 'Last: ' + history.slice(0, 12).map(h => `<span class="dot ${rouletteColor(h)}">${rouletteName(h)}</span>`).join('');
        result.innerHTML = `Ball lands on <b>${rouletteName(n)} ${rouletteColor(n).toUpperCase()}</b> — ` + resultLine(profit);
        if (history.length >= 5) lesson('history', 'That "last numbers" board is there to make you look for patterns. The wheel has no memory; past spins do not change future odds.');
        refreshCash(root);
        bet.refresh();
        busy = false;
      }
    }, 70);
  };
  openModal('🎯 Roulette', root, () => !busy);
}

// ---------------------------------------------------------------------------
// BLACKJACK  (6 decks, dealer hits soft 17, blackjack pays 6:5 → ~2% edge)
// ---------------------------------------------------------------------------
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
let shoe = [];
function newShoe(decks) {
  shoe = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
  shuffle(shoe);
}
function draw() {
  if (shoe.length < 60) newShoe(6);
  return shoe.pop();
}
function cardVal(c) { return c.r === 'A' ? 11 : ['J', 'Q', 'K', '10'].includes(c.r) ? 10 : Number(c.r); }
function handVal(h) {
  let t = 0, aces = 0;
  for (const c of h) { t += cardVal(c); if (c.r === 'A') aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}
function cardHTML(c, hidden) {
  if (hidden) return '<div class="card back">🂠</div>';
  const red = c.s === '♥' || c.s === '♦';
  return `<div class="card ${red ? 'red' : ''}">${c.r}<span>${c.s}</span></div>`;
}

function openBlackjack(vip) {
  const min = vip ? 10_000 : 25, max = vip ? 1_000_000 : 100_000;
  if (!shoe.length) newShoe(6);
  const root = el('div', 'game blackjack');
  root.innerHTML = gameHeader('about 2% (6:5 blackjack payout, dealer hits soft 17, no splits)') + cashLine() + `
    <div class="bj-area">
      <div class="lbl">Dealer <span class="d-total"></span></div><div class="hand dealer"></div>
      <div class="lbl">You <span class="p-total"></span></div><div class="hand player"></div>
    </div>
    <div class="result">Place your bet and deal.</div>`;
  const bet = makeBetBox(min, max, min * 4);
  root.appendChild(bet.el);
  const row = el('div', 'btn-row');
  const dealBtn = el('button', 'btn primary', 'DEAL');
  const hitBtn = el('button', 'btn', 'HIT');
  const standBtn = el('button', 'btn', 'STAND');
  const dblBtn = el('button', 'btn', 'DOUBLE');
  row.append(dealBtn, hitBtn, standBtn, dblBtn);
  root.appendChild(row);
  const dEl = root.querySelector('.dealer'), pEl = root.querySelector('.player');
  const result = root.querySelector('.result');
  let dealer = [], hand = [], stake = 0, inRound = false, hideHole = true;

  function show() {
    dEl.innerHTML = dealer.map((c, i) => cardHTML(c, i === 1 && hideHole)).join('');
    pEl.innerHTML = hand.map(c => cardHTML(c)).join('');
    root.querySelector('.p-total').textContent = hand.length ? `(${handVal(hand).total})` : '';
    root.querySelector('.d-total').textContent = dealer.length ? (hideHole ? `(${cardVal(dealer[0])} + ?)` : `(${handVal(dealer).total})`) : '';
    dealBtn.disabled = inRound;
    hitBtn.disabled = standBtn.disabled = !inRound;
    dblBtn.disabled = !inRound || hand.length !== 2 || S.cash < stake;
    bet.el.classList.toggle('locked', inRound);
    refreshCash(root);
  }

  function finish(ret, msg) {
    inRound = false; hideHole = false;
    const profit = settle(vip ? 'VIP Blackjack' : 'Blackjack', stake, ret, 0.02);
    result.innerHTML = msg + ' — ' + resultLine(profit);
    show();
    bet.refresh();
  }

  function dealerPlay() {
    hideHole = false;
    let v = handVal(dealer);
    while (v.total < 17 || (v.total === 17 && v.soft)) { dealer.push(draw()); v = handVal(dealer); }
    const p = handVal(hand).total, d = v.total;
    if (d > 21) finish(stake * 2, `Dealer busts with ${d}`);
    else if (p > d) finish(stake * 2, `${p} beats ${d}`);
    else if (p < d) finish(0, `Dealer's ${d} beats your ${p}`);
    else finish(stake, `Both have ${p}`);
  }

  dealBtn.onclick = () => {
    if (inRound || S.ended) return;
    const amount = bet.take();
    if (!amount) return;
    stake = amount; inRound = true; hideHole = true;
    hand = [draw(), draw()]; dealer = [draw(), draw()];
    result.textContent = 'Hit, stand or double?';
    const pBJ = handVal(hand).total === 21, dBJ = handVal(dealer).total === 21;
    if (pBJ || dBJ) {
      if (pBJ && dBJ) finish(stake, 'Both have blackjack');
      else if (pBJ) {
        finish(stake + stake * 1.2, 'BLACKJACK! Pays only 6:5');
        lesson('65', 'Many casinos pay blackjack at 6:5 instead of 3:2. It looks almost the same but it more than triples the house edge.');
      } else finish(0, 'Dealer has blackjack');
      return;
    }
    show();
  };
  hitBtn.onclick = () => {
    if (!inRound) return;
    hand.push(draw());
    const v = handVal(hand).total;
    if (v > 21) finish(0, `Bust with ${v}`);
    else if (v === 21) dealerPlay();
    else show();
  };
  standBtn.onclick = () => { if (inRound) dealerPlay(); };
  dblBtn.onclick = () => {
    if (!inRound || hand.length !== 2 || !takeBet(stake)) return;
    stake *= 2;
    hand.push(draw());
    const v = handVal(hand).total;
    if (v > 21) finish(0, `Doubled and bust with ${v}`);
    else dealerPlay();
  };
  show();
  openModal(vip ? '🃏 VIP Blackjack' : '🃏 Blackjack', root, () => {
    if (inRound) { toast('Finish the hand first.', 'danger'); return false; }
  });
}

// ---------------------------------------------------------------------------
// CRAPS  (Pass line 1.41% edge, Don't Pass 1.36%)
// ---------------------------------------------------------------------------
const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function openCraps() {
  const root = el('div', 'game craps');
  root.innerHTML = gameHeader('1.41% on Pass Line, 1.36% on Don\'t Pass') + cashLine() + `
    <div class="dice"><span>⚀</span><span>⚀</span></div>
    <div class="point">Come-out roll</div>
    <div class="craps-log"></div>
    <div class="result">Pass Line: win on 7/11, lose on 2/3/12, otherwise hit the point before a 7.</div>`;
  const bet = makeBetBox(10, 50_000, 500);
  root.appendChild(bet.el);
  const row = el('div', 'btn-row');
  const passBtn = el('button', 'btn primary', 'BET PASS LINE');
  const dontBtn = el('button', 'btn', "BET DON'T PASS");
  row.append(passBtn, dontBtn);
  root.appendChild(row);
  const diceEl = root.querySelectorAll('.dice span');
  const pointEl = root.querySelector('.point');
  const log = root.querySelector('.craps-log');
  const result = root.querySelector('.result');
  let busy = false;

  function play(dont) {
    if (busy || S.ended) return;
    const amount = bet.take();
    if (!amount) return;
    busy = true;
    passBtn.disabled = dontBtn.disabled = true;
    refreshCash(root);
    log.innerHTML = '';
    let point = null;
    pointEl.textContent = 'Come-out roll';
    const step = () => {
      const a = randInt(1, 6), b = randInt(1, 6), t = a + b;
      diceEl[0].textContent = DICE[a - 1]; diceEl[1].textContent = DICE[b - 1];
      log.innerHTML += `<span>${t}</span>`;
      advanceTime(1);
      let outcome = null; // 'pass' | 'dont' | 'push'
      if (point === null) {
        if (t === 7 || t === 11) outcome = 'pass';
        else if (t === 2 || t === 3) outcome = 'dont';
        else if (t === 12) outcome = dont ? 'push' : 'dont';
        else { point = t; pointEl.textContent = `Point is ${t}. Roll a ${t} before a 7.`; }
      } else if (t === point) outcome = 'pass';
      else if (t === 7) outcome = 'dont';
      if (!outcome) { setTimeout(step, 550); return; }
      let ret = 0;
      if (outcome === 'push') ret = amount;
      else if ((outcome === 'pass') !== dont) ret = amount * 2;
      const profit = settle(dont ? "Craps (Don't Pass)" : 'Craps (Pass)', amount, ret, dont ? 0.0136 : 0.0141);
      result.innerHTML = `Rolled ${t}${point ? ` (point ${point})` : ''} — ` + resultLine(profit);
      pointEl.textContent = 'Come-out roll';
      busy = false;
      passBtn.disabled = dontBtn.disabled = false;
      refreshCash(root);
      bet.refresh();
    };
    setTimeout(step, 300);
  }
  passBtn.onclick = () => play(false);
  dontBtn.onclick = () => play(true);
  openModal('🎲 Craps', root, () => {
    if (busy) { toast('The dice are still rolling!', 'danger'); return false; }
  });
}

// ---------------------------------------------------------------------------
// BACCARAT  (Banker 1.06%, Player 1.24%, Tie 14.4%)
// ---------------------------------------------------------------------------
function bacVal(c) { return ['10', 'J', 'Q', 'K'].includes(c.r) ? 0 : c.r === 'A' ? 1 : Number(c.r); }
function bacTotal(h) { return h.reduce((s, c) => s + bacVal(c), 0) % 10; }
function randomCard() { return { r: pick(RANKS), s: pick(SUITS) }; }

function playBaccaratCoup() {
  const p = [randomCard(), randomCard()], b = [randomCard(), randomCard()];
  let pt = bacTotal(p), bt = bacTotal(b);
  if (pt < 8 && bt < 8) {
    let p3 = null;
    if (pt <= 5) { p3 = randomCard(); p.push(p3); pt = bacTotal(p); }
    let bankerDraws;
    if (p3 === null) bankerDraws = bt <= 5;
    else {
      const v = bacVal(p3);
      bankerDraws = bt <= 2 || (bt === 3 && v !== 8) || (bt === 4 && v >= 2 && v <= 7) ||
        (bt === 5 && v >= 4 && v <= 7) || (bt === 6 && (v === 6 || v === 7));
    }
    if (bankerDraws) { b.push(randomCard()); bt = bacTotal(b); }
  }
  return { p, b, pt, bt, winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie' };
}

function openBaccarat(vip) {
  const min = vip ? 25_000 : 100, max = vip ? 2_000_000 : 250_000;
  const root = el('div', 'game baccarat');
  root.innerHTML = gameHeader('1.06% on Banker, 1.24% on Player, 14.4% on Tie') + cashLine() + `
    <div class="bj-area">
      <div class="lbl">Player <span class="pt"></span></div><div class="hand ph"></div>
      <div class="lbl">Banker <span class="bt"></span></div><div class="hand bh"></div>
    </div>
    <div class="result">Bet on Player (1:1), Banker (1:1 minus 5% commission) or Tie (8:1).</div>`;
  const bet = makeBetBox(min, max, min * 5);
  root.appendChild(bet.el);
  const row = el('div', 'btn-row');
  const btns = { player: el('button', 'btn primary', 'PLAYER'), banker: el('button', 'btn primary', 'BANKER'), tie: el('button', 'btn', 'TIE 8:1') };
  Object.values(btns).forEach(b => row.appendChild(b));
  root.appendChild(row);
  const result = root.querySelector('.result');
  const EDGES = { player: 0.0124, banker: 0.0106, tie: 0.1436 };
  let busy = false;

  Object.entries(btns).forEach(([side, btn]) => {
    btn.onclick = () => {
      if (busy || S.ended) return;
      const amount = bet.take();
      if (!amount) return;
      busy = true;
      refreshCash(root);
      const coup = playBaccaratCoup();
      root.querySelector('.ph').innerHTML = '';
      root.querySelector('.bh').innerHTML = '';
      root.querySelector('.pt').textContent = root.querySelector('.bt').textContent = '';
      setTimeout(() => {
        root.querySelector('.ph').innerHTML = coup.p.map(c => cardHTML(c)).join('');
        root.querySelector('.bh').innerHTML = coup.b.map(c => cardHTML(c)).join('');
        root.querySelector('.pt').textContent = `(${coup.pt})`;
        root.querySelector('.bt').textContent = `(${coup.bt})`;
        let ret = 0;
        if (coup.winner === 'tie') ret = side === 'tie' ? amount * 9 : amount;
        else if (coup.winner === side) ret = side === 'banker' ? amount + amount * 0.95 : amount * 2;
        const profit = settle(vip ? 'VIP Baccarat' : 'Baccarat', amount, ret, EDGES[side]);
        result.innerHTML = (coup.winner === 'tie' ? `TIE ${coup.pt}–${coup.bt}` : coup.winner === 'player' ? `PLAYER wins ${coup.pt}–${coup.bt}` : `BANKER wins ${coup.bt}–${coup.pt}`) + ' — ' + resultLine(profit);
        if (side === 'tie') lesson('tie', 'The Tie bet pays 8:1 but only hits about 9.5% of the time. Its house edge is over 14%.');
        busy = false;
        refreshCash(root);
        bet.refresh();
      }, 600);
    };
  });
  openModal(vip ? '🀄 VIP Baccarat' : '🀄 Baccarat', root, () => !busy);
}

// ---------------------------------------------------------------------------
// BIG SIX WHEEL  (54 segments, 11%–24% edge)
// ---------------------------------------------------------------------------
const BIGSIX = [
  { key: '$1', count: 24, pays: 1 },
  { key: '$2', count: 15, pays: 2 },
  { key: '$5', count: 7, pays: 5 },
  { key: '$10', count: 4, pays: 10 },
  { key: '$20', count: 2, pays: 20 },
  { key: 'JOKER', count: 1, pays: 40 },
  { key: 'LOGO', count: 1, pays: 40 },
];
BIGSIX.forEach(s => { s.edge = (54 - s.count * (s.pays + 1)) / 54; });

function openBigSix() {
  const root = el('div', 'game bigsix');
  root.innerHTML = gameHeader('11% to 24% depending on the bet (the worst odds in the house!)') + cashLine() + `
    <div class="wheel-result"><div class="ball gold">?</div></div>
    <div class="bet-types"></div>
    <div class="result"></div>`;
  const types = root.querySelector('.bet-types');
  let choice = BIGSIX[0];
  BIGSIX.forEach(s => {
    const b = el('button', 'opt' + (s === choice ? ' on' : ''), `${s.key}<small>${s.pays}:1 · ${s.count}/54</small>`);
    b.onclick = () => { choice = s; types.querySelectorAll('.opt').forEach(o => o.classList.remove('on')); b.classList.add('on'); };
    types.appendChild(b);
  });
  const bet = makeBetBox(5, 25_000, 500);
  root.appendChild(bet.el);
  const row = el('div', 'btn-row');
  const spinBtn = el('button', 'btn primary', 'SPIN');
  row.appendChild(spinBtn);
  root.appendChild(row);
  const ball = root.querySelector('.ball'), result = root.querySelector('.result');
  const segments = BIGSIX.flatMap(s => Array(s.count).fill(s));
  let busy = false;

  spinBtn.onclick = () => {
    if (busy || S.ended) return;
    const amount = bet.take();
    if (!amount) return;
    busy = true;
    refreshCash(root);
    const land = pick(segments);
    let ticks = 0;
    const iv = setInterval(() => {
      ball.textContent = ticks < 20 ? pick(segments).key : land.key;
      if (++ticks > 20) {
        clearInterval(iv);
        const ret = land === choice ? amount * (choice.pays + 1) : 0;
        const profit = settle('Big Six Wheel', amount, ret, choice.edge);
        result.innerHTML = `Wheel stops on <b>${land.key}</b> — ` + resultLine(profit);
        busy = false;
        refreshCash(root);
        bet.refresh();
      }
    }, 80);
  };
  openModal('🎡 Big Six Wheel', root, () => !busy);
}
