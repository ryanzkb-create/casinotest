'use strict';

// ---------------------------------------------------------------------------
// Polish for the original table games, layered on top of games.js so that file
// stays untouched: blackjack Insurance + Splitting, craps Odds bets, and a
// baccarat scoreboard. Loaded after games2.js.
// ---------------------------------------------------------------------------

// ===========================================================================
// BLACKJACK: rules are 6 decks, dealer hits soft 17, blackjack pays 6:5, double on
// any first two cards (also after a split), one split only, split Aces get one card
// each. Base edge stays ~2%; insurance is its own bet at 7.4%.
// ===========================================================================
(function upgradeBlackjack() {
  const B = BLACKJACK;
  const nm = g => (g.type === 'blackjack_hl' ? 'VIP Blackjack' : 'Blackjack');
  const hname = (g, i) => (g.split ? (i === 0 ? 'playerA' : 'playerB') : 'player');
  const cur = g => g.hands[g.cur];
  const total = h => handVal(h.cards).total;

  B.init = () => { if (!shoe.length) newShoe(6); return { hands: [], cur: 0, dealer: [], hideHole: true, stage: 'idle', split: false, ins: 0 }; };
  B.info = g => {
    const dv = g.dealer.length ? (g.hideHole ? `${cardVal(g.dealer[0])} + ?` : handVal(g.dealer).total) : '–';
    const mine = (g.hands.length ? g.hands : [{ cards: [], stake: 0 }]).map((h, i) => {
      const v = h.cards.length ? handVal(h.cards) : null;
      const on = g.split && i === g.cur && g.stage === 'play';
      return `<div${on ? ' style="outline:2px solid var(--gold)"' : ''}><span>${g.split ? 'HAND ' + (i + 1) : 'YOU'}${h.stake ? ' · ' + fmtShort(h.stake) : ''}</span><b>${h.cards.map(cardText).join(' ') || '–'}</b><em>${v ? v.total + (v.soft && v.total < 21 ? ' soft' : '') : '–'}</em></div>`;
    }).join('');
    return `Get closer to 21 than the dealer without going over. Dealer hits soft 17. <b>Blackjack pays 6:5</b>. <b>House edge ≈2%</b>. You may split pairs once and double any two cards.
      <div class="gu-hands"><div><span>DEALER</span><b>${g.dealer.map((c, i) => (i === 1 && g.hideHole ? '🂠' : cardText(c))).join(' ') || '–'}</b><em>${dv}</em></div>${mine}</div>
      ${g.stage === 'insurance' ? '<div class="g2-note">Dealer shows an Ace. Insurance costs half your bet and pays 2:1 if the dealer has blackjack. <b>House edge 7.4%.</b> Basic strategy: never take it.</div>' : ''}${g.last ? `<div class="gu-last">${g.last}</div>` : ''}`;
  };
  B.canSplit = g => g.stage === 'play' && !g.split && g.hands.length === 1 && g.hands[0].cards.length === 2 && cardVal(g.hands[0].cards[0]) === cardVal(g.hands[0].cards[1]) && S.cash >= g.hands[0].stake;
  B.buttons = g => g.stage === 'insurance' ? [
    { key: 'I', keys: ['i'], label: `Insurance ${fmt(g.hands[0].stake / 2)}`, fn: () => B.insure(true), hide: g.acting || S.cash < g.hands[0].stake / 2 },
    { key: 'N', keys: ['n', 'enter', ' '], label: 'No insurance', primary: true, fn: () => B.insure(false), hide: g.acting },
  ] : g.stage === 'play' ? [
    { key: 'H', keys: ['h', ' '], label: 'Hit', primary: true, fn: () => B.hit(), hide: g.acting },
    { key: 'S', keys: ['s', 'enter'], label: 'Stand', fn: () => B.stand(), hide: g.acting },
    { key: 'D', keys: ['d'], label: 'Double', fn: () => B.double(), hide: g.acting || cur(g).cards.length !== 2 || S.cash < cur(g).stake || cur(g).noAction },
    { key: 'X', keys: ['x'], label: 'Split', fn: () => B.splitHand(), hide: g.acting || !B.canSplit(g) },
  ] : [{ key: 'Enter', keys: ['enter', ' '], label: 'Deal', primary: true, fn: () => B.deal(), hide: g.busy }];

  B.give = async (g, who, hi, faceUp = true) => {
    const c = draw(), fx = T3();
    const arr = who === 'dealer' ? g.dealer : g.hands[hi].cards;
    arr.push(c);
    const hn = who === 'dealer' ? 'dealer' : hname(g, hi);
    sfx2('card');
    if (fx) await fx.deal(g.o, hn, arr.length - 1, c, faceUp); else await wait(250);
    renderGameUI();
    return c;
  };
  B.deal = async function () {
    const g = gameSession; if (!g || g.busy) return;
    if (!takeStake(g.bet)) return;
    const fx = T3();
    Object.assign(g, { busy: true, locked: true, acting: true, pending: true, stage: 'deal', split: false, ins: 0, hideHole: true, hands: [{ cards: [], stake: g.bet }], cur: 0, dealer: [], last: '' });
    renderGameUI();
    if (fx) await fx.placeBet(g.o, g.bet);
    await B.give(g, 'player', 0); await B.give(g, 'dealer', 0); await B.give(g, 'player', 0); await B.give(g, 'dealer', 0, false);
    if (!gameSession) return;
    const pBJ = total(g.hands[0]) === 21, up = g.dealer[0];
    if (up.r === 'A' && !pBJ) { g.stage = 'insurance'; g.acting = false; renderGameUI(); return; }
    return B.peek(g);
  };
  B.insure = async function (yes) {
    const g = gameSession; if (!g || g.stage !== 'insurance' || g.acting) return;
    g.acting = true; renderGameUI();
    const ins = g.hands[0].stake / 2;
    if (yes && takeStake(ins)) {
      const dBJ = total({ cards: g.dealer }) === 21;
      const fx = T3(); if (fx) await fx.flip(g.o, 'dealer', 1);
      g.hideHole = false;
      settle('Blackjack Insurance', ins, dBJ ? ins * 3 : 0, 0.074);
      lesson('bj_ins', 'Insurance sounds like protection, but it is a separate side bet: the dealer has a ten-value hole card only about 31% of the time, so 2:1 is not enough. House edge 7.4%, more than 3× the game itself.');
      banner(dBJ ? 'INSURANCE PAYS' : 'INSURANCE LOST', dBJ ? 'win' : 'lose', dBJ ? `Dealer has blackjack: +${fmt(ins * 2)} on the side bet` : 'Dealer does not have blackjack');
    } else if (!yes) lesson('bj_noins', 'Good instinct: basic strategy says never take insurance. It is one of the worst bets at the table.');
    return B.peek(g);
  };
  B.peek = async function (g) {
    const fx = T3();
    const pBJ = total(g.hands[0]) === 21, dBJ = total({ cards: g.dealer }) === 21;
    if (pBJ || dBJ) {
      if (fx && g.hideHole) await fx.flip(g.o, 'dealer', 1);
      g.hideHole = false;
      if (pBJ && dBJ) return B.finish('Both have blackjack', [g.hands[0].stake]);
      if (pBJ) { lesson('65', 'Many casinos pay blackjack at 6:5 instead of 3:2. It looks almost the same, but it more than triples the house edge.'); return B.finish('BLACKJACK! (pays only 6:5)', [g.hands[0].stake * 2.2]); }
      return B.finish('Dealer has blackjack', [0]);
    }
    g.stage = 'play'; g.acting = false; renderGameUI();
  };
  B.hit = async function () {
    const g = gameSession; if (!g || g.stage !== 'play' || g.acting) return;
    g.acting = true; renderGameUI();
    const h = cur(g); await B.give(g, 'player', g.cur);
    if (!gameSession) return;
    const v = total(h);
    if (v > 21) { h.busted = true; return B.advance(g); }
    if (v === 21) return B.advance(g);
    g.acting = false; renderGameUI();
  };
  B.stand = function () { const g = gameSession; if (g && g.stage === 'play' && !g.acting) { g.acting = true; return B.advance(g); } };
  B.double = async function () {
    const g = gameSession; if (!g || g.stage !== 'play' || g.acting) return;
    const h = cur(g); if (h.cards.length !== 2 || h.noAction) return;
    if (!takeStake(h.stake)) return;
    g.acting = true; renderGameUI();
    const fx = T3();
    if (fx) { const td = fx.td(g.o); await fx.placeBet(g.o, h.stake, g.split ? fx.L(td, g.cur === 0 ? -0.2 : 0.2, td.feltY + 0.001, td.d * 0.4) : undefined); }
    h.stake *= 2; h.doubled = true;
    await B.give(g, 'player', g.cur);
    if (!gameSession) return;
    if (total(h) > 21) h.busted = true;
    return B.advance(g);
  };
  B.splitHand = async function () {
    const g = gameSession; if (!g || !B.canSplit(g) || g.acting) return;
    if (!takeStake(g.hands[0].stake)) return;
    g.acting = true; renderGameUI();
    const fx = T3(), h0 = g.hands[0];
    const aces = h0.cards[0].r === 'A';
    g.hands = [{ cards: [h0.cards[0]], stake: h0.stake, noAction: aces }, { cards: [h0.cards[1]], stake: h0.stake, noAction: aces }];
    g.split = true; g.cur = 0;
    lesson('bj_split', 'Splitting doubles your bet for the same hand. Basic strategy says always split Aces and 8s and never 10s or 5s: the right choice still leaves the house ahead.');
    if (fx) { await fx.splitHand(g.o); const td = fx.td(g.o); await fx.placeBet(g.o, h0.stake, fx.L(td, 0.16, td.feltY + 0.001, td.d * 0.36)); }
    await B.give(g, 'player', 0);
    if (!gameSession) return;
    if (aces) { await B.give(g, 'player', 1); g.hands.forEach(h => { h.done = true; }); return B.dealerPlay(g); }
    if (total(g.hands[0]) === 21) return B.advance(g);
    g.acting = false; renderGameUI();
  };
  // finish the current hand and move on
  B.advance = async function (g) {
    cur(g).done = true;
    if (g.cur < g.hands.length - 1) {
      g.cur++;
      const h = cur(g);
      if (h.cards.length === 1) { g.acting = true; renderGameUI(); await B.give(g, 'player', g.cur); if (!gameSession) return; }
      if (total(h) === 21) return B.advance(g);
      g.acting = false; renderGameUI(); return;
    }
    return B.dealerPlay(g);
  };
  B.dealerPlay = async function (g) {
    g.acting = true; g.stage = 'dealer'; renderGameUI();
    const fx = T3();
    g.hideHole = false;
    if (fx) await fx.flip(g.o, 'dealer', 1); else await wait(300);
    renderGameUI();
    let v = handVal(g.dealer);
    const live = g.hands.some(h => !h.busted);
    while (live && (v.total < 17 || (v.total === 17 && v.soft))) { await B.give(g, 'dealer'); if (!gameSession) return; v = handVal(g.dealer); }
    const d = v.total;
    const rets = g.hands.map(h => { const p = total(h); return h.busted ? 0 : d > 21 || p > d ? h.stake * 2 : p === d ? h.stake : 0; });
    const notes = g.hands.map(h => { const p = total(h); return h.busted ? `bust with ${p}` : d > 21 ? `dealer busts with ${d}` : p > d ? `${p} beats ${d}` : p === d ? `push at ${p}` : `dealer's ${d} beats ${p}`; });
    return B.finish(g.split ? notes.map((n, i) => `Hand ${i + 1}: ${n}`).join(' · ') : notes[0][0].toUpperCase() + notes[0].slice(1), rets);
  };
  B.finish = async function (msg, rets) {
    const g = gameSession; if (!g) return;
    g.stage = 'done'; g.acting = true; g.hideHole = false;
    const staked = g.hands.reduce((a, h) => a + h.stake, 0), ret = rets.reduce((a, b) => a + b, 0);
    g.pending = false;
    const profit = settle(nm(g), staked, ret, 0.02);
    if (!gameSession) return;
    resultBanner(profit, msg);
    g.last = msg;
    if (profit > 0) { sfx2('win'); const f0 = T3(); f0 && f0.celebrate(g.o, 1); }
    renderGameUI();
    const fx = T3();
    if (fx) { await fx.resolveChips(g.o, ret > staked, Math.max(0, ret - staked)); await wait(900); await fx.clear(g.o); } else await wait(600);
    g.hands = []; g.dealer = []; g.split = false; g.stage = 'idle'; g.busy = false; g.locked = false; g.acting = false;
    renderGameUI();
  };
  B.onLeave = g => { if (g.pending) settle(nm(g), (g.hands || []).reduce((a, h) => a + h.stake, 0), 0, 0.02); };
  TUTORIALS.blackjack.splice(3, 0, ['Split & insurance', '<kbd>X</kbd> <b>Split</b> a pair into two hands (one more bet). Split Aces get one card each. When the dealer shows an Ace, <kbd>I</kbd> <b>Insurance</b> is offered: half your bet, pays 2:1 if the dealer has blackjack. It looks safe, but it is a <b>7.4% house edge</b> side bet. Say no.']);
})();

// ===========================================================================
// BACCARAT scoreboard: the "road" of past results, which does not change the odds
// ===========================================================================
(function upgradeBaccarat() {
  const Bc = BACCARAT, info0 = Bc.info, deal0 = Bc.deal;
  Bc.info = g => {
    const road = (g.road || []).slice(-24).map(r => `<span style="display:inline-block;width:18px;height:18px;border-radius:50%;margin:1px;background:${r === 'banker' ? '#c1121f' : r === 'player' ? '#1d5fd0' : '#0f8a3a'}"></span>`).join('');
    return info0(g) + (road ? `<div class="g2-note">Scoreboard (banker red · player blue · tie green): <div>${road}</div></div>` : '');
  };
  Bc.deal = async function () {
    const g = gameSession; if (!g || g.busy) return;
    await deal0.call(Bc);
    if (!gameSession || !g.coup) return;
    const c = g.coup;
    (g.road = g.road || []).push(c.pt > c.bt ? 'player' : c.bt > c.pt ? 'banker' : 'tie');
    if (g.road.length === 8) lesson('bac_road', 'The scoreboard makes streaks look meaningful, so players bet "with the trend" or "against the streak". Every coup is independent; the road has no predictive power.');
    renderGameUI();
  };
})();

// ===========================================================================
// CRAPS: free Odds bet behind the Pass / Don't Pass line (true odds, 0% edge)
// ===========================================================================
(function upgradeCraps() {
  const C = CRAPS, info0 = C.info, buttons0 = C.buttons;
  const ODDS = CRAPS_ODDS;   // pays [num, den] to 1 (settled inside CRAPS.roll in games.js)
  C.info = g => info0(g) + (g.point && g.stake ? `<div class="g2-note">${g.odds ? `Odds bet ${fmt(g.odds)} pays true odds ${g.dont ? `${ODDS[g.point][1]}:${ODDS[g.point][0]}` : `${ODDS[g.point][0]}:${ODDS[g.point][1]}`} (<b>0% house edge</b>).` : `Press <kbd>O</kbd> to back your line bet with an <b>Odds bet</b> (up to 3×). It pays true odds: the only bet in the casino with no house edge.`}</div>` : '');
  C.buttons = g => buttons0(g).concat([{ key: 'O', keys: ['o'], label: g.odds ? 'Odds placed' : 'Odds bet', fn: () => C.takeOdds(), hide: g.rolling || !g.point || !g.stake || !!g.odds }]);
  C.takeOdds = async function () {
    const g = gameSession; if (!g || g.type !== 'craps' || g.rolling || !g.point || !g.stake || g.odds) return;
    const amt = Math.min(g.stake * 3, Math.floor(S.cash));
    if (amt < 1 || !takeStake(amt)) return;
    g.odds = amt;
    const fx = T3(); if (fx) { const td = fx.td(g.o); fx.placeBet(g.o, amt, fx.L(td, -0.2, td.feltY + 0.001, td.d * (g.dont ? 0.4 : 0.33))); }
    lesson('craps_odds', 'The Odds bet is the one bet with no house edge, but you can only make it after committing to a Pass/Don\'t Pass bet that has a 1.4% edge. Casinos limit it so the overall edge is still positive.');
    renderGameUI();
  };
})();
