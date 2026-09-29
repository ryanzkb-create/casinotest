'use strict';

// ---------------------------------------------------------------------------
// Second wave of casino games: Video Poker, Three Card Poker, Keno, Sic Bo,
// Race Book and Scratch Cards. They plug into the session system in games.js
// (LIMITS, GAME_NAMES, GAMES, TUTORIALS, startGame/settle) and use the real
// odds from js/odds2.js, which tools/odds/*.js verify by Monte-Carlo.
// 3D presentation lives in js/r3d/games3d.js + tablefx2.js + screens2.js.
// ---------------------------------------------------------------------------
const NEW_GAME_TYPES = ['videopoker', 'threecard', 'keno', 'sicbo', 'racebook', 'lottery'];
Object.assign(LIMITS, { videopoker: [5, 5000], threecard: [25, 25_000], keno: [1, 2500], sicbo: [10, 50_000], racebook: [10, 100_000], lottery: [5, 1000] });
Object.assign(GAME_NAMES, { videopoker: 'Video Poker', threecard: 'Three Card Poker', keno: 'Keno', sicbo: 'Sic Bo', racebook: 'Race Book', lottery: 'Scratch Cards' });

const sfx2 = name => { try { if (window.sfxPlay) window.sfxPlay(name); } catch (e) { /* audio is optional */ } };
const pctText = (x, d = 1) => (x * 100).toFixed(d) + '%';

(function injectStyle() {
  const s = document.createElement('style');
  s.textContent = `
  .pk{display:inline-block;min-width:36px;padding:3px 5px;margin:2px 3px 2px 0;border-radius:5px;background:#fbfaf6;color:#111;font-family:var(--label);font-weight:800;font-size:19px;text-align:center;line-height:1.1}
  .pk.red{color:#c0121f}.pk.held{outline:3px solid var(--gold);transform:translateY(-3px)}.pk.back{background:#8b0f1f;color:#f2c14e}
  .g2-pay{display:grid;grid-template-columns:1fr auto;gap:0 14px;font-family:var(--label);font-weight:600;font-size:14px;margin-top:6px;color:var(--muted)}
  .g2-pay b{text-align:right;color:#fff!important}.g2-pay .hit{color:#111;background:var(--gold)}.g2-pay .hit b{color:#111!important}
  .g2-kg{display:grid;grid-template-columns:repeat(10,1fr);gap:2px;margin-top:6px}
  .g2-kg button{pointer-events:auto;padding:1px 0;border:0;border-radius:3px;background:rgba(255,255,255,0.12);color:#dfe3ea;font-family:var(--label);font-weight:700;font-size:13px;line-height:18px;cursor:pointer}
  .g2-kg button.p{background:#ff2fb0;color:#fff}.g2-kg button.d{background:#e0a010;color:#2a1600}.g2-kg button.h{background:#3dff7a;color:#003a12}.g2-kg button.c{outline:2px solid #fff}
  .g2-note{margin-top:6px;font-size:13px;color:#ffe680}.g2-bad{color:#ff8a8a}.g2-ok{color:#7dffb0}
  .g2-slip{margin-top:6px;font-family:var(--label);font-weight:600;font-size:14px}.g2-slip div{display:flex;justify-content:space-between;padding:1px 0}
  .g2-book{margin-top:6px;font-family:var(--label);font-size:14px}.g2-book div{display:grid;grid-template-columns:18px 1fr auto auto;gap:8px;padding:1px 0}.g2-book i{width:12px;height:12px;border-radius:50%;margin-top:4px;display:block}`;
  document.head.appendChild(s);
})();

const cardHTML = (c, held) => `<span class="pk ${c.s === '♥' || c.s === '♦' ? 'red' : ''}${held ? ' held' : ''}">${c.r}${c.s}</span>`;
const backHTML = () => '<span class="pk back">GM</span>';
const rankName = v => ({ 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack' }[v] || String(v));
// Wait for the 3D tween if the renderer is on, else a plain delay
const tw = (fx, dur, fn) => (fx ? fx.tween(dur, fn) : wait(dur * 1000));

// ===========================================================================
// VIDEO POKER (Jacks or Better; each machine shows its own paytable)
// ===========================================================================
const VP_EDGE = t => 1 - Odds2.VP_RTP[t];
function vpSync(g) {
  const sc = g.sc; if (!sc) return;
  const s = sc.state;
  s.pays = Odds2.VP_PAYS[g.pay]; s.title = `JACKS OR BETTER ${g.pay}`;
  s.cards = g.cards.length ? g.cards : [null, null, null, null, null]; s.hold = g.hold;
  s.phase = g.stage; s.betText = fmt(g.bet); s.credit = fmt(S.cash); s.message = g.msg || ''; s.win = g.win || null;
}
const VIDEOPOKER = {
  init: o => ({ pay: o.pay || '8/5', stage: 'ready', cards: [], hold: [false, false, false, false, false], deck: [], msg: '', win: null, hands: 0, tip: '', sc: (T3() && T3().openScreen(o)) || null }),
  info: g => {
    vpSync(g);
    const pays = Odds2.VP_PAYS[g.pay], edge = VP_EDGE(g.pay);
    const rows = `<div class="gu-pay">${Odds2.VP_ORDER.map(k => `<span class="${g.win && g.win.cat === k ? 'g2-ok' : ''}">${{ RF: 'Royal', SF: 'St.Flush', '4K': '4Kind', FH: 'FullH', F: 'Flush', S: 'Str', '3K': '3Kind', '2P': '2Pair', JB: 'J+' }[k]} ${pays[k]}</span>`).join(' · ')}</div>`;
    const hand = g.cards.length ? `<div style="margin-top:8px">${g.cards.map((c, i) => cardHTML(c, g.hold[i])).join('')}</div>` : '';
    return `Jacks or Better, always max coins. This machine pays <b>${g.pay}</b> for Full House / Flush: <b>house edge ${pctText(edge, 2)}</b> even with perfect play.
      ${rows}${hand}${g.tip ? `<div class="g2-note">${g.tip}</div>` : ''}${g.last ? `<div class="gu-last">${g.last}</div>` : ''}`;
  },
  buttons: g => g.stage === 'hold' ? [
    { key: 'Space', keys: [' ', 'enter'], label: 'Draw', primary: true, fn: () => VIDEOPOKER.draw(), hide: g.acting },
    ...g.cards.map((c, i) => ({ key: String(i + 1), keys: [String(i + 1)], label: `Hold ${c.r}${c.s}`, fn: () => VIDEOPOKER.toggle(i), hide: g.acting })),
    { key: 'H', keys: ['h'], label: 'Hint', fn: () => VIDEOPOKER.hint(), hide: g.acting },
  ] : [{ key: 'Space', keys: [' ', 'enter'], label: 'Deal', primary: true, fn: () => VIDEOPOKER.deal(), hide: g.busy }],
  async deal() {
    const g = gameSession; if (!g || g.stage !== 'ready' || g.acting) return;
    if (!takeStake(g.bet)) return;
    const fx = T3();
    g.stake = g.bet; g.busy = true; g.locked = true; g.acting = true; g.win = null; g.msg = ''; g.tip = ''; g.hinted = false;
    g.hold = [false, false, false, false, false];
    g.deck = Odds2.shuffled(); g.cards = g.deck.splice(0, 5);
    const st = g.sc && g.sc.state; if (st) st.flip = [0, 0, 0, 0, 0];
    vpSync(g); renderGameUI();
    if (g.hands === 0) lesson('vp_pay', `Read the paytable before you sit down. This machine pays ${Odds2.VP_PAYS[g.pay].FH} for a Full House and ${Odds2.VP_PAYS[g.pay].F} for a Flush. Casinos put "9/6" machines (99.5% back) on the floor rarely; most pay less.`);
    for (let i = 0; i < 5; i++) { sfx2('card'); await tw(fx, 0.16, k => { if (st) st.flip[i] = k; }); if (!gameSession) return; }
    g.stage = 'hold'; g.acting = false; g.msg = 'HOLD CARDS THEN DRAW';
    vpSync(g); renderGameUI();
  },
  toggle(i) {
    const g = gameSession; if (!g || g.stage !== 'hold' || g.acting) return;
    g.hold[i] = !g.hold[i]; g.hinted = false; sfx2('click'); vpSync(g); renderGameUI();
  },
  hint() {
    const g = gameSession; if (!g || g.stage !== 'hold' || g.acting) return;
    g.hold = Odds2.vpBestHold(g.cards); g.hinted = true; vpSync(g); renderGameUI();
    lesson('vp_hint', `Even if you hold the mathematically best cards every single hand, this machine returns only ${pctText(Odds2.VP_RTP[g.pay], 1)}. Most people don't play perfectly, so they lose more.`);
  },
  async draw() {
    const g = gameSession; if (!g || g.stage !== 'hold' || g.acting) return;
    g.acting = true; g.stage = 'drawing'; renderGameUI();
    const fx = T3(), st = g.sc && g.sc.state;
    // was that a sensible hold? (compare with the strategy chart)
    const best = Odds2.vpBestHold(g.cards);
    const evOf = h => Odds2.vpHoldEV(g.cards.filter((_, i) => h[i]));
    if (evOf(best) - evOf(g.hold) > 0.12) {
      const keep = g.cards.filter((_, i) => best[i]).map(c => c.r + c.s).join(' ');
      g.tip = `The strategy chart would hold: ${keep || 'nothing (draw five)'}.`;
      lesson('vp_strategy', 'Video poker rewards correct strategy, but casinos know most players hold by feel, and their paytables assume you will make mistakes.');
    }
    const replaced = [0, 1, 2, 3, 4].filter(i => !g.hold[i]);
    if (replaced.length) {
      await Promise.all(replaced.map(i => tw(fx, 0.22, k => { if (st) st.flip[i] = 1 - k; })));
      for (const i of replaced) g.cards[i] = g.deck.shift();
      for (const i of replaced) { sfx2('card'); await tw(fx, 0.18, k => { if (st) st.flip[i] = k; }); if (!gameSession) return; }
    }
    const cat = Odds2.vpEval(g.cards);
    const mult = cat ? Odds2.VP_PAYS[g.pay][cat] : 0;
    const ret = g.stake * mult;
    g.win = cat ? { cat, mult } : null;
    const profit = settle(`Video Poker (${g.pay})`, g.stake, ret, VP_EDGE(g.pay));
    if (!gameSession) return;
    g.hands++;
    g.msg = cat ? `${Odds2.VP_NAMES[cat].toUpperCase()}  ${mult}×  WIN ${fmt(profit)}` : 'NO WIN';
    g.last = `Hand ${g.hands}: ${cat ? Odds2.VP_NAMES[cat] : 'nothing'} → ${profit >= 0 ? '+' : ''}${fmt(profit)}`;
    if (cat) { sfx2(mult >= 25 ? 'jackpot' : 'win'); const fx2 = T3(); fx2 && fx2.celebrate(g.o, mult >= 25 ? 3 : mult >= 5 ? 2 : 1); }
    if (profit > 0) resultBanner(profit, `${Odds2.VP_NAMES[cat]} · pays ${mult}×`);
    else if (profit < 0) resultBanner(profit, 'No paying hand');
    else banner('PUSH', 'info', `${Odds2.VP_NAMES[cat]} pays 1×: bet returned`);
    if (cat === 'JB' && mult === 1) lesson('vp_jb', 'A pair of Jacks "wins" but only returns your bet. About 1 hand in 5 is one of these push-like hands, which feels like winning without earning anything.');
    if (g.hands === 25) lesson('vp_25', `After ${g.hands} hands the paytable's ${pctText(VP_EDGE(g.pay), 1)} edge is steadily working, but the big swings from rare hands hide it. Royal flushes are about 1 in 40,000.`);
    g.stage = 'ready'; g.busy = false; g.locked = false; g.acting = false;
    vpSync(g); renderGameUI();
  },
  onLeave(g) { // forced to leave mid-hand: the bet is forfeited
    if (g.stage === 'hold' || g.stage === 'drawing') settle(`Video Poker (${g.pay})`, g.stake, 0, VP_EDGE(g.pay));
  },
};

// ===========================================================================
// THREE CARD POKER
// ===========================================================================
const TCP_MODES = [
  { label: 'Ante / Play', sub: 'edge 3.4%' }, { label: 'Ante + Pair Plus', sub: 'side bet 7.3%' }, { label: 'Pair Plus only', sub: 'edge 7.3%' },
];
const tcpHandText = e => (e.cat === 'H' ? `${rankName(e.ranks[0])}-high (${e.ranks.map(r => ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }[r] || r)).join('-')})` : Odds2.TCP_NAMES[e.cat] + (e.cat === 'P' ? ` of ${rankName(e.key[0])}s` : ''));
function tcpSpot(fx, o, key) { const td = fx.td(o); return fx.L(td, td.spots[key][0], td.feltY + 0.001, td.spots[key][1]); }
const THREECARD = {
  init: () => ({ stage: 'ready', p: [], dl: [], dealerUp: false, ante: 0, pp: 0, staked: 0, msg: '', hands: 0 }),
  options: () => TCP_MODES,
  info: g => {
    const pe = g.p.length === 3 ? Odds2.tcpEval(g.p) : null;
    const hint = g.stage === 'decide' && pe ? `<div class="g2-note">You have <b>${tcpHandText(pe)}</b>. Basic strategy: ${Odds2.tcpShouldPlay(pe) ? '<span class="g2-ok">RAISE (Q-6-4 or better)</span>' : '<span class="g2-bad">FOLD (worse than Q-6-4)</span>'}</div>` : '';
    return `Beat the dealer's 3-card hand. Ante, look at your cards, then Play (a second bet equal to the Ante) or Fold. Dealer needs Queen-high to qualify. <b>Ante/Play edge 3.37%</b>, <b>Pair Plus 7.28%</b>.
      <div class="gu-hands"><div><span>DEALER</span><b>${g.dl.map((c, i) => (g.dealerUp ? cardHTML(c) : backHTML())).join('') || '–'}</b></div><div><span>YOU</span><b>${g.p.map(c => cardHTML(c)).join('') || '–'}</b></div></div>${hint}${g.last ? `<div class="gu-last">${g.last}</div>` : ''}`;
  },
  buttons: g => g.stage === 'decide' ? [
    { key: 'Enter', keys: ['enter', ' '], label: `Play (raise ${fmt(g.ante)})`, primary: true, fn: () => THREECARD.play(), hide: g.acting || S.cash < g.ante },
    { key: 'F', keys: ['f'], label: 'Fold', fn: () => THREECARD.fold(), hide: g.acting },
  ] : [{ key: 'Enter', keys: ['enter', ' '], label: 'Deal', primary: true, fn: () => THREECARD.deal(), hide: g.busy }, { key: '←→', label: 'Bet type', fn: null, hide: g.busy }],
  async deal() {
    const g = gameSession; if (!g || g.busy) return;
    const mode = g.sel, ante = mode === 2 ? 0 : g.bet, pp = mode === 0 ? 0 : g.bet;
    if (!takeStake(ante + pp)) return;
    const fx = T3();
    g.busy = true; g.locked = true; g.acting = true; g.pending = true; g.ante = ante; g.pp = pp; g.staked = ante + pp; g.p = []; g.dl = []; g.dealerUp = false;
    renderGameUI();
    const d = Odds2.shuffled(); const P = d.splice(0, 3), D = d.splice(0, 3);
    if (fx) { if (ante) fx.placeBet(g.o, ante, tcpSpot(fx, g.o, 'ante')); if (pp) await fx.placeBet(g.o, pp, tcpSpot(fx, g.o, 'pp')); else await wait(350); }
    for (let i = 0; i < 3; i++) {
      g.p.push(P[i]); sfx2('card'); if (fx) await fx.deal(g.o, 'player', i, P[i], true); else await wait(200); renderGameUI();
      g.dl.push(D[i]); if (fx) await fx.deal(g.o, 'dealer', i, D[i], false); else await wait(200); renderGameUI();
      if (!gameSession) return;
    }
    g.P = P; g.D = D;
    if (pp) lesson('tcp_pp', 'Pair Plus pays up to 40:1 for rare hands but keeps a 7.28% house edge: more than double the Ante/Play bet. Side bets are where casinos make the most per dollar.');
    if (ante === 0) return THREECARD.resolve(0);
    g.stage = 'decide'; g.acting = false; renderGameUI();
  },
  async play() {
    const g = gameSession; if (!g || g.stage !== 'decide' || g.acting) return;
    if (!takeStake(g.ante)) return;
    g.acting = true; g.staked += g.ante; renderGameUI();
    const fx = T3();
    if (fx) await fx.placeBet(g.o, g.ante, tcpSpot(fx, g.o, 'play')); else await wait(300);
    return THREECARD.resolve(g.ante);
  },
  fold() {
    const g = gameSession; if (!g || g.stage !== 'decide' || g.acting) return;
    g.acting = true; renderGameUI();
    lesson('tcp_fold', 'Folding forfeits your Ante. Statistically you should only fold below Queen-6-4. The strategy is simple, so the game is one of the better-odds "table" games, but it still costs you 3.4% of your Ante.');
    return THREECARD.resolve(0);
  },
  async resolve(playBet) {
    const g = gameSession; if (!g) return;
    const fx = T3();
    for (let i = 0; i < 3; i++) { if (fx) await fx.flip(g.o, 'dealer', i); else await wait(150); }
    g.dealerUp = true; renderGameUI();
    const out = Odds2.tcpResolve(g.P, g.D, g.ante, g.pp, playBet);
    const staked = g.staked;
    const edge = (Odds2.TCP_EDGE.ante * g.ante + Odds2.TCP_EDGE.pairPlus * g.pp) / Math.max(1, staked);
    g.pending = false;
    const profit = settle('Three Card Poker', staked, out.ret, edge);
    if (!gameSession) return;
    g.hands++;
    const parts = [`You: ${tcpHandText(out.pe)}`, `Dealer: ${tcpHandText(out.de)}${out.qualifies ? '' : ' (does not qualify)'}`];
    if (out.pp > 0) parts.push(`Pair Plus pays ${fmt(out.pp)}`);
    if (out.bonus > 0) parts.push(`Ante bonus ${fmt(out.bonus)}`);
    g.last = parts.join(' · ');
    const why = playBet === 0 && g.ante ? 'You folded' : out.result === 'dealerNoQualify' ? 'Dealer did not qualify' : out.result === 'win' ? 'You beat the dealer' : out.result === 'tie' ? 'Tie: bets returned' : out.result === 'lose' ? 'Dealer wins' : 'Pair Plus only';
    if (profit > 0) { sfx2('win'); fx && fx.celebrate(g.o, out.pp >= g.pp * 7 ? 3 : 1); }
    resultBanner(profit, `${why} · ${tcpHandText(out.pe)}`);
    if (out.result === 'dealerNoQualify') lesson('tcp_nq', 'When the dealer does not qualify your Play bet is just returned and your Ante pays 1:1. That happens about 1 hand in 3 and is built into the 3.37% edge.');
    if (out.result === 'lose' && out.qualifies && out.de.rank === 0 && out.pe.rank === 0) lesson('tcp_hc', 'With only high cards the dealer\'s Queen-high beat you: even the "recommended" raise on Q-6-4 loses more often than it wins, it just loses less than folding.');
    if (fx) { await fx.resolveChips(g.o, profit > 0, Math.max(0, out.ret - staked)); await wait(700); await fx.clear(g.o); } else await wait(500);
    g.stage = 'ready'; g.busy = false; g.locked = false; g.acting = false; g.p = []; g.dl = []; g.dealerUp = false;
    renderGameUI();
  },
  onLeave(g) { if (g.pending) settle('Three Card Poker', g.staked, 0, 0.0337); },
};

// ===========================================================================
// KENO
// ===========================================================================
function kenoSync(g) {
  const sc = g.sc; if (!sc) return;
  const s = sc.state, spots = g.picks.length;
  s.picks = g.picks; s.drawn = g.drawn; s.spots = spots || 0; s.cursor = g.cursor; s.drawing = g.stage === 'drawing';
  s.hits = g.picks.filter(p => g.drawn.includes(p));
  if (!g.drawn.length) s.last = null;
  const t = Odds2.KENO_PAY[spots];
  s.payLine = t ? Object.keys(t).filter(k => t[k] > 0 && +k > 0).map(k => `${k}: ${t[k]}×`).join('   ') : 'PICK 1 – 10 NUMBERS';
  s.message = g.msg || null; s.win = g.win || false;
}
const KENO = {
  init: o => ({ picks: [], drawn: [], cursor: 1, stage: 'ready', msg: '', win: false, hands: 0, sc: (T3() && T3().openScreen(o)) || null }),
  info: g => {
    kenoSync(g);
    const n = g.picks.length, t = Odds2.KENO_PAY[n];
    const rtp = n ? Odds2.kenoRTP(n) : 0;
    const top = n ? (t[n] || 0) : 0;
    const topP = n ? Odds2.kenoProb(n, n) : 0;
    const dset = new Set(g.drawn), pset = new Set(g.picks);
    const cells = Array.from({ length: 80 }, (_, i) => { const v = i + 1; const p = pset.has(v), d = dset.has(v); return `<button class="${p && d ? 'h' : p ? 'p' : d ? 'd' : ''}${g.cursor === v ? ' c' : ''}" onclick="KENO.toggle(${v})">${v}</button>`; }).join('');
    return `Pick <b>1–10 numbers</b>. The house draws 20 of 80 balls; the more you catch, the more you win. ${n ? `<b>${n} spot${n > 1 ? 's' : ''}: returns ${pctText(rtp)}, house edge ${pctText(1 - rtp)}.</b>` : '<b>House edge is 25–30% on every spot count.</b>'}
      ${n ? `<div class="g2-note">Top prize ${top}× needs all ${n} spots: 1 in ${Math.round(1 / topP).toLocaleString('en-US')}. Fair odds would pay ${Math.round(1 / topP).toLocaleString('en-US')}×.</div>` : ''}
      <div class="g2-kg">${cells}</div>${g.last ? `<div class="gu-last">${g.last}</div>` : ''}`;
  },
  buttons: g => [
    { key: 'Space', keys: [' ', 'enter'], label: 'Draw', primary: true, fn: () => KENO.play(), hide: g.busy || !g.picks.length },
    { key: 'Q', keys: ['q'], label: g.picks.length ? `Quick pick ${g.picks.length}` : 'Quick pick 5', fn: () => KENO.quick(), hide: g.busy },
    { key: 'C', keys: ['c'], label: 'Clear', fn: () => KENO.clear(), hide: g.busy || !g.picks.length },
    { key: '← → F', label: 'Move / mark', fn: null, hide: g.busy },
  ],
  toggle(v) {
    const g = gameSession; if (!g || g.type !== 'keno' || g.busy) return;
    g.cursor = v;
    const i = g.picks.indexOf(v);
    if (i >= 0) g.picks.splice(i, 1);
    else if (g.picks.length < 10) g.picks.push(v);
    else banner('Max 10 numbers', 'info');
    g.picks.sort((a, b) => a - b); g.drawn = []; g.last = null; g.msg = ''; g.win = false;
    sfx2('click'); renderGameUI();
  },
  quick() {
    const g = gameSession; if (!g || g.busy) return;
    g.picks = Odds2.kenoQuickPick(g.picks.length || 5); g.drawn = []; g.msg = ''; g.win = false; renderGameUI();
  },
  clear() { const g = gameSession; if (!g || g.busy) return; g.picks = []; g.drawn = []; g.msg = ''; g.last = null; renderGameUI(); },
  async play() {
    const g = gameSession; if (!g || g.busy || !g.picks.length) return;
    if (!takeStake(g.bet)) return;
    g.busy = true; g.locked = true; g.stage = 'drawing'; g.drawn = []; g.msg = ''; g.win = false; g.stake = g.bet;
    const spots = g.picks.length; const draw = Odds2.kenoDraw();
    const st = g.sc && g.sc.state; renderGameUI();
    document.body.classList.add('gu-focus');
    lesson('keno_edge', 'Keno has one of the worst odds on the floor: 25–35% house edge, roughly 5× roulette. It looks like a lottery, but you are also paying the casino a "convenience fee" every 5 minutes.');
    for (let i = 0; i < 20; i++) {
      g.drawn.push(draw[i]); if (st) st.last = draw[i];
      sfx2('ball'); kenoSync(g); renderGameUI();
      await wait(300); if (!gameSession) return;
    }
    document.body.classList.remove('gu-focus');
    const r = Odds2.kenoScore(g.picks, draw);
    const ret = g.stake * r.mult;
    const profit = settle('Keno', g.stake, ret, 1 - Odds2.kenoRTP(spots));
    if (!gameSession) return;
    g.hands++;
    g.win = r.mult > 0;
    g.msg = r.mult > 0 ? `${r.hits.length} CATCH · ${r.mult}×` : `${r.hits.length} CATCH`;
    g.last = `${r.hits.length} of ${spots} caught${r.mult ? ` · pays ${r.mult}×` : ''} → ${profit >= 0 ? '+' : ''}${fmt(profit)}`;
    kenoSync(g);
    if (profit > 0) { sfx2(r.mult >= 50 ? 'jackpot' : 'win'); const fx = T3(); fx && fx.celebrate(g.o, r.mult >= 100 ? 3 : r.mult >= 10 ? 2 : 1); }
    resultBanner(profit, `${r.hits.length} of ${spots} numbers${r.mult ? ` · pays ${r.mult}×` : ''}`);
    if (r.hits.length >= spots - 1 && spots >= 4 && r.mult === 0) lesson('keno_near', 'Missing by one number feels close, but every miss is independent. Near misses in keno are exactly as common as the maths says.');
    if (g.hands === 5) lesson('keno_more', 'Picking more numbers does not beat the house: every spot count from 1 to 10 keeps an edge of 25–30%. The board is designed to make big prizes look reachable.');
    g.stage = 'ready'; g.busy = false; g.locked = false;
    renderGameUI();
  },
  onLeave(g) { if (g.stage === 'drawing') settle('Keno', g.stake, 0, 0.28); },
};
document.addEventListener('keydown', e => {
  const g = gameSession;
  if (!g || g.type !== 'keno' || g.busy || !$('#tutorial').classList.contains('hidden') || modalOpen || phoneOpen) return;
  const k = e.key.toLowerCase(), move = d => { g.cursor = ((g.cursor - 1 + d + 80) % 80) + 1; renderGameUI(); };
  if (k === 'arrowleft') move(-1); else if (k === 'arrowright') move(1); else if (k === 'z') move(-10); else if (k === 'x') move(10); else if (k === 'f') KENO.toggle(g.cursor);
});

// ===========================================================================
// SIC BO (bet slip: add several bets, roll once)
// ===========================================================================
const SB_CHOICES = [['small'], ['big'], ['single'], ['double'], ['triple'], ['anytriple'], ['total']];
const sbLabel = (key, n) => ({ small: 'Small', big: 'Big', single: `Single ${n}`, double: `Double ${n}`, triple: `Triple ${n}`, anytriple: 'Any Triple', total: `Total ${n}` }[key]);
const sbCur = g => { const key = SB_CHOICES[g.sel][0]; return { key, n: key === 'single' || key === 'double' || key === 'triple' ? g.nn.dice : key === 'total' ? g.nn.total : 0 }; };
const SICBO = {
  init: () => ({ slip: [], nn: { dice: 3, total: 10 }, dice: null, results: null, msg: '' }),
  options: g => SB_CHOICES.map(([k], i) => { const n = k === 'single' || k === 'double' || k === 'triple' ? g.nn.dice : k === 'total' ? g.nn.total : 0; const b = Odds2.sicboBet(k); return { label: sbLabel(k, n), sub: `${b.sub.split('·').pop().trim()}` }; }),
  info: g => {
    const cur = sbCur(g);
    const edge = Odds2.sicboEdge(cur.key, cur.n);
    const slip = g.slip.length ? `<div class="g2-slip">${g.slip.map((b, i) => `<div><span>${sbLabel(b.key, b.n)} ${fmt(b.stake)}</span><span class="${g.results ? (g.results[i] > b.stake ? 'g2-ok' : 'g2-bad') : ''}">${g.results ? (g.results[i] >= b.stake ? '+' : '') + fmt(g.results[i] - b.stake) : ''}</span></div>`).join('')}</div>` : '';
    const dice = g.dice ? `<div class="gu-last">Dice ${g.dice.join(' · ')} = ${g.dice[0] + g.dice[1] + g.dice[2]}${g.dice[0] === g.dice[1] && g.dice[1] === g.dice[2] ? ' (TRIPLE!)' : ''}</div>` : '';
    return `Three dice. Bet on Small/Big, on individual numbers, doubles, triples or totals. Add as many bets as you like, then roll. <b>Selected: ${sbLabel(cur.key, cur.n)} · house edge ${pctText(edge, 2)}</b>.
      ${cur.key === 'small' || cur.key === 'big' ? '<div class="g2-note">Small and Big lose to ANY triple: that is the whole 2.78% edge.</div>' : ''}${slip}${dice}`;
  },
  buttons: g => [
    { key: 'Space', keys: [' '], label: g.slip.length ? 'Roll dice' : 'Bet + roll', primary: true, fn: () => SICBO.roll(), hide: g.busy },
    { key: 'Enter', keys: ['enter', 'b'], label: 'Add bet', fn: () => SICBO.add(), hide: g.busy },
    { key: 'C', keys: ['c'], label: 'Clear bets', fn: () => SICBO.refund(true), hide: g.busy || !g.slip.length },
    { key: '←→', label: 'Bet type', fn: null, hide: g.busy },
    { key: 'Z / X', label: 'Number', fn: null, hide: g.busy || !['single', 'double', 'triple', 'total'].includes(SB_CHOICES[g.sel][0]) },
  ],
  add() {
    const g = gameSession; if (!g || g.busy) return false;
    if (g.slip.length >= 8) { banner('Max 8 bets', 'info'); return false; }
    if (g.results) { g.slip = []; g.results = null; g.dice = null; }
    const cur = sbCur(g);
    if (!takeStake(g.bet)) return false;
    g.slip.push({ key: cur.key, n: cur.n, stake: g.bet });
    const fx = T3(); if (fx) { const at = fx.sicboSpot(g.o, cur.key, cur.n); if (at) fx.placeBet(g.o, g.bet, at); }
    sfx2('chip'); renderGameUI();
    if (g.slip.length === 3) lesson('sicbo_multi', 'Each extra bet adds its own house edge. Betting on many spots at once does not reduce the edge, it just makes you lose faster: you pay 2.8%–30% on every chip on the table.');
    return true;
  },
  refund(clearChips) {
    const g = gameSession; if (!g) return;
    const back = g.slip.reduce((a, b) => a + b.stake, 0);
    if (back) { S.cash += back; updateHUD(true); }
    g.slip = []; g.results = null;
    const fx = T3(); if (clearChips && fx) fx.clearChips(g.o);
    renderGameUI();
  },
  async roll() {
    const g = gameSession; if (!g || g.busy) return;
    if (g.results) { g.slip = []; g.results = null; }
    if (!g.slip.length && !SICBO.add()) return;
    g.busy = true; g.locked = true; g.dice = null; g.results = null; renderGameUI();
    const fx = T3();
    const dice = Odds2.sicboRoll();
    banner('No more bets', 'info'); sfx2('dice');
    if (fx) await fx.sicboRoll(g.o, dice); else await wait(1500);
    if (!gameSession) return;
    g.dice = dice;
    const rets = g.slip.map(b => b.stake * Odds2.sicboBet(b.key).ret(dice, b.n));
    const staked = g.slip.reduce((a, b) => a + b.stake, 0), ret = rets.reduce((a, b) => a + b, 0);
    const edge = g.slip.reduce((a, b) => a + b.stake * Odds2.sicboEdge(b.key, b.n), 0) / staked;
    const profit = settle('Sic Bo', staked, ret, edge);
    if (!gameSession) return;
    g.results = rets;
    const tot = dice[0] + dice[1] + dice[2], trip = dice[0] === dice[1] && dice[1] === dice[2];
    if (profit > 0) { sfx2('win'); fx && fx.celebrate(g.o, ret > staked * 10 ? 3 : 1); }
    resultBanner(profit, `${dice.join('-')} = ${tot}${trip ? ' · TRIPLE' : tot >= 11 ? ' · BIG' : ' · SMALL'}`);
    if (trip && g.slip.some(b => b.key === 'small' || b.key === 'big')) lesson('sicbo_triple', 'A triple beats every Small/Big bet. That 1-in-36 event turns an apparently even-money bet into a 2.78% house edge.');
    g.hands = (g.hands || 0) + 1;
    if (fx) { await fx.resolveChips(g.o, profit > 0, Math.max(0, ret - staked)); }
    g.busy = false; g.locked = false; renderGameUI();
  },
  onLeave(g) {
    const staked = g.slip.reduce((a, b) => a + b.stake, 0);
    if (!staked || g.results) return;
    if (g.busy) settle('Sic Bo', staked, 0, 0.1);   // forced out mid-roll: forfeited
    else S.cash += staked;                            // bets not rolled yet: refunded
    g.slip = [];
  },
};
document.addEventListener('keydown', e => {
  const g = gameSession;
  if (!g || g.type !== 'sicbo' || g.busy || !$('#tutorial').classList.contains('hidden') || modalOpen || phoneOpen) return;
  const k = e.key.toLowerCase(); if (k !== 'z' && k !== 'x') return;
  const key = SB_CHOICES[g.sel][0], d = k === 'x' ? 1 : -1;
  if (key === 'total') g.nn.total = ((g.nn.total - 4 + d + 14) % 14) + 4;
  else if (key === 'single' || key === 'double' || key === 'triple') g.nn.dice = ((g.nn.dice - 1 + d + 6) % 6) + 1;
  else return;
  renderGameUI();
});

// ===========================================================================
// RACE BOOK (win and place bets at posted odds; overround shown)
// ===========================================================================
function raceSync(g) {
  const sc = g.sc; if (!sc) return;
  const s = sc.state, f = g.field;
  s.horses = f.horses.map(h => ({ name: h.name, color: h.color, winText: Odds2.oddsText(h.winOdds), placeText: Odds2.oddsText(h.placeOdds) }));
  s.overround = f.overround; s.race = g.raceNo; s.mine = g.sel;
  if (!g.busy) { if (!s.pos) s.pos = f.horses.map(() => 0); s.message = g.msg || 'PLACE YOUR BETS'; }
}
const RACEBOOK = {
  init: o => {
    const g = { field: Odds2.raceField(6), raceNo: 1, kind: 'win', hands: 0, msg: '', sc: (T3() && T3().openScreen(o)) || null };
    return g;
  },
  options: g => g.field.horses.map((h, i) => ({ label: `${i + 1} ${h.name}`, sub: g.kind === 'win' ? `${Odds2.oddsText(h.winOdds)} win · implies ${pctText(1 / (h.winOdds + 1), 0)}` : `${Odds2.oddsText(h.placeOdds)} place` })),
  info: g => {
    raceSync(g);
    const h = g.field.horses[g.sel], win = g.kind === 'win';
    const odds = win ? h.winOdds : h.placeOdds, p = win ? h.p : h.pPlace, edge = win ? h.winEdge : h.placeEdge;
    return `Bet on a horse to <b>${win ? 'WIN' : 'PLACE (finish 1st or 2nd)'}</b>. The board's implied chances add up to <b class="g2-bad">${pctText(g.field.overround, 0)}</b>: the extra ${pctText(g.field.overround - 1, 0)} is the bookmaker's margin.
      <div class="g2-note">${g.field.horses[g.sel].name}: pays ${Odds2.oddsText(odds)}, true chance ${pctText(p)} (fair odds ${fairText(p)}). <b>Edge on this bet ${pctText(edge)}</b>.</div>
      ${g.last ? `<div class="gu-last">${g.last}</div>` : ''}`;
  },
  buttons: g => [
    { key: 'Space', keys: [' ', 'enter'], label: g.hands ? 'Bet again' : 'Run the race', primary: true, fn: () => RACEBOOK.run(), hide: g.busy },
    { key: 'B', keys: ['b'], label: g.kind === 'win' ? 'Switch to PLACE' : 'Switch to WIN', fn: () => { g.kind = g.kind === 'win' ? 'place' : 'win'; renderGameUI(); }, hide: g.busy },
    { key: '←→', label: 'Runner', fn: null, hide: g.busy },
  ],
  async run() {
    const g = gameSession; if (!g || g.busy) return;
    if (!takeStake(g.bet)) return;
    g.busy = true; g.locked = true; g.pending = true; renderGameUI();
    const fx = T3(), f = g.field, order = Odds2.raceOrder(f), me = f.horses[g.sel], stake = g.bet, kind = g.kind;
    const s = g.sc && g.sc.state; if (s) { s.message = 'AND THEY\'RE OFF!'; s.finished = []; }
    sfx2('race');
    document.body.classList.add('gu-focus');
    if (fx) await fx.raceRun(f, order); else await wait(2500);
    document.body.classList.remove('gu-focus');
    if (!gameSession) return;
    const place = order.indexOf(me.i) + 1;
    const won = kind === 'win' ? place === 1 : place <= 2;
    const odds = kind === 'win' ? me.winOdds : me.placeOdds, edge = kind === 'win' ? me.winEdge : me.placeEdge;
    const ret = won ? stake * (odds + 1) : 0;
    g.pending = false;
    const profit = settle(`Race Book (${kind})`, stake, ret, edge);
    if (!gameSession) return;
    g.hands++;
    const w = f.horses[order[0]];
    g.msg = `${w.name.toUpperCase()} WINS`;
    if (s) { s.message = won ? `${me.name.toUpperCase()} · ${['WINS', 'PLACES 2ND'][place - 1] || ''}  ${fmt(profit)}` : `${w.name.toUpperCase()} WINS`; s.win = won; }
    g.last = `${w.name} won, ${f.horses[order[1]].name} 2nd. Your ${me.name} finished ${['1st', '2nd', '3rd', '4th', '5th', '6th'][place - 1]} → ${profit >= 0 ? '+' : ''}${fmt(profit)}`;
    if (won) { sfx2('win'); fx && fx.celebrate(g.o, odds >= 8 ? 3 : 1); }
    resultBanner(profit, `${w.name} wins${won ? '' : ` · yours was ${['1st', '2nd', '3rd', '4th', '5th', '6th'][place - 1]}`}`);
    lesson('race_margin', `Add up the implied chances on the board: ${pctText(f.overround, 0)}. If the odds were fair they would add to 100%. The bookmaker keeps the difference on every bet, however the race goes.`);
    if (me.p < 0.1 && won) lesson('race_longshot', 'Long shots pay big when they win, but the board shortens their odds more than it shortens the favourites\'. Betting on outsiders is usually the costliest way to bet.');
    if (g.hands === 4) lesson('race_tips', 'Tipsters and "form" can\'t beat a 15–20% margin either. Even professionals need to be right about the true odds by more than the bookmaker\'s cut.');
    await wait(1400);
    g.field = Odds2.raceField(6); g.raceNo++; g.msg = ''; if (s) { s.finished = []; s.pos = g.field.horses.map(() => 0); s.win = false; }
    g.busy = false; g.locked = false; renderGameUI();
  },
  onLeave(g) { if (g.pending) settle(`Race Book (${g.kind})`, g.bet, 0, 0.16); },
};

// ===========================================================================
// SCRATCH CARDS
// ===========================================================================
const SC_LADDER = [1, 2, 5, 10, 25, 50, 100, 250, 1000, 5000, 20000];
function scratchCells(price, mult) {
  const val = m => m * price;
  const others = SC_LADDER.filter(m => m !== mult);
  const cells = [];
  const pool = () => others.slice().sort(() => Math.random() - 0.5);
  let winCells = [];
  if (mult > 0) {
    const decoys = pool().slice(0, 3);
    const idx = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    winCells = idx.slice(0, 3);
    winCells.forEach(i => { cells[i] = val(mult); });
    idx.slice(3).forEach((i, k) => { cells[i] = val(decoys[k]); });
  } else {
    const near = Math.random() < 0.35, p = pool();
    const idx = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    let k = 0;
    if (near) { const big = pick(SC_LADDER.filter(m => m >= 25)); cells[idx[0]] = val(big); cells[idx[1]] = val(big); k = 2; p.splice(p.indexOf(big), 1); }
    for (; k < 6; k++) cells[idx[k]] = val(p[k]);
    return { cells, winCells: [], near };
  }
  return { cells, winCells };
}
const LOTTERY = {
  init: o => ({ stage: 'ready', hands: 0, msg: '', sc: (T3() && T3().openScreen(o)) || null, spent: 0, won: 0 }),
  info: g => {
    const P = Odds2.SCRATCH_PRIZES, at = m => { const p = P.find(q => q.m === m); return `${m.toLocaleString('en-US')}× 1 in ${Math.round(1 / p.p).toLocaleString('en-US')}`; };
    const rows = [1, 5, 100, 20000].map(at).join(' · ');
    const rtp = Odds2.scratchRTP();
    if (g.sc) { const s = g.sc.state; s.price = g.bet; }
    return `Scratch off the foil: <b>match 3 amounts</b> to win that prize. Each card costs your bet. <b>Returns about ${pctText(rtp, 0)}, house edge ${pctText(1 - rtp, 0)}</b>: the worst regular gamble on the floor.
      <div class="gu-pay">${rows} · any prize 1 in ${(1 / P.reduce((a, p) => a + p.p, 0)).toFixed(1)}</div>${g.spent ? `<div class="g2-note">This visit: spent ${fmt(g.spent)}, won back ${fmt(g.won)}.</div>` : ''}${g.last ? `<div class="gu-last">${g.last}</div>` : ''}`;
  },
  buttons: g => [{ key: 'Space', keys: [' ', 'enter'], label: 'Buy + scratch', primary: true, fn: () => LOTTERY.scratch(), hide: g.busy }],
  async scratch() {
    const g = gameSession; if (!g || g.busy) return;
    if (!takeStake(g.bet)) return;
    g.busy = true; g.locked = true; g.pending = true; g.stake = g.bet; renderGameUI();
    const fx = T3(), price = g.stake, mult = Odds2.scratchDraw();
    const { cells, winCells, near } = scratchCells(price, mult);
    const s = g.sc && g.sc.state;
    if (s) Object.assign(s, { price, cells, winCells, scr: [0, 0, 0, 0, 0, 0], result: 0, message: 'SCRATCHING…', sub: '' });
    lesson('scratch_edge', 'Scratch cards return only 60–70% of what is spent. The printed "1 in 4.7 wins" sounds generous because most of those wins are just your money back.');
    for (let i = 0; i < 6; i++) { sfx2('scratch'); await tw(fx, 0.35, k => { if (s) s.scr[i] = k; }); if (!gameSession) return; }
    const ret = mult * price;
    g.pending = false;
    const profit = settle('Scratch Cards', price, ret, 1 - Odds2.scratchRTP());
    if (!gameSession) return;
    g.hands++; g.spent += price; g.won += ret;
    if (s) { s.result = ret; s.message = ret > 0 ? `YOU WIN ${fmt(ret)}!` : 'NOT A WINNER'; s.sub = ret > 0 ? (profit >= 0 ? `Profit ${fmt(profit)}` : `Still ${fmt(-profit)} down on this card`) : near ? 'So close: two big prizes… but no third.' : 'Better luck next time'; }
    g.last = `Card ${g.hands}: ${ret > 0 ? `won ${fmt(ret)}` : 'nothing'} → ${profit >= 0 ? '+' : ''}${fmt(profit)}`;
    if (ret > 0) { sfx2('win'); fx && fx.celebrate(g.o, mult >= 100 ? 3 : mult >= 10 ? 2 : 1); }
    resultBanner(profit, ret > 0 ? (profit < 0 ? 'A "winner" that still loses money' : 'Winning card') : near ? 'Two big prizes but no match: designed to feel close' : 'No match');
    if (ret > 0 && profit < 0) lesson('scratch_ldw', 'You "won" but got back less than the card cost. Lotteries print winners like this so that lots of cards feel like wins.');
    if (near) lesson('scratch_near', 'Cards with two big prizes and no third are printed on purpose, exactly as often as the maths of the game says. Your brain counts them as "almost".');
    if (g.hands === 6) lesson('scratch_total', `After ${g.hands} cards you spent ${fmt(g.spent)} and won ${fmt(g.won)}. Small wins keep you buying: total return is always lower.`);
    await wait(700);
    g.stage = 'ready'; g.busy = false; g.locked = false; renderGameUI();
  },
  onLeave(g) { if (g.pending) settle('Scratch Cards', g.stake, 0, 0.36); },
};

Object.assign(GAMES, { videopoker: VIDEOPOKER, threecard: THREECARD, keno: KENO, sicbo: SICBO, racebook: RACEBOOK, lottery: LOTTERY });
const fairText = p => { const o = (1 - p) / p; return o >= 1 ? `${o.toFixed(1)}/1` : `1/${(1 / o).toFixed(1)}`; };

// ===========================================================================
// Tutorials
// ===========================================================================
const k10 = Odds2.kenoProb(10, 10);
Object.assign(TUTORIALS, {
  videopoker: [
    ['How video poker works', 'You are dealt <b>5 cards</b>. Choose which to <b>hold</b> (keys <kbd>1</kbd>–<kbd>5</kbd> or click), then press <kbd>Space</kbd> to <b>draw</b> replacements. Your final 5 cards are paid by the paytable: a pair of <b>Jacks or better</b> pays 1× your bet.'],
    ['Read the paytable', `<div class="tut-table"><div>Royal Flush</div><b>800×</b><div>Straight Flush</div><b>50×</b><div>Four of a Kind</div><b>25×</b><div>Full House</div><b>9× / 8× / 6×</b><div>Flush</div><b>6× / 5×</b><div>Straight</div><b>4×</b><div>Three of a Kind</div><b>3×</b><div>Two Pair</div><b>2×</b><div>Jacks or Better</div><b>1×</b></div>`],
    ['Why the numbers on the cabinet matter', 'Only the Full House and Flush lines change between machines, but that changes the return: <b>9/6 pays back 99.54%</b>, <b>8/5 pays 97.30%</b> and <b>6/5 pays 94.99%</b>. They look identical from across the room. Most machines on this floor are the worse ones.'],
    ['Strategy helps a little', 'Correct holds (press <kbd>H</kbd> for a hint) give the best possible return, but that is still <b>below 100%</b> on every machine. Most players hold by feel and lose more. You always play max coins so the Royal Flush pays 800×.'],
    ['Controls', '<kbd>Space</kbd> deal / draw · <kbd>1</kbd>–<kbd>5</kbd> hold · <kbd>H</kbd> hint · <kbd>↑</kbd><kbd>↓</kbd> bet · <kbd>T</kbd> this tutorial · <kbd>Esc</kbd> leave (after the hand)'],
  ],
  threecard: [
    ['The goal', 'Both you and the dealer get <b>3 cards</b>. Make a better poker hand than the dealer: <b>Straight Flush &gt; Three of a Kind &gt; Straight &gt; Flush &gt; Pair &gt; High Card</b> (note the straight beats the flush in 3-card poker).'],
    ['Ante, then Play or Fold', 'You post an <b>Ante</b>, see your cards and choose <b>Play</b> (a second bet equal to the Ante) or <b>Fold</b>. The dealer <b>qualifies with Queen-high or better</b>. If they don\'t, your Ante wins 1:1 and the Play bet is returned. Beat a qualifying dealer and both bets win 1:1.'],
    ['Ante bonus & Pair Plus', 'Ante bonus pays for a great hand no matter what the dealer has: <b>Straight Flush 5:1, Three of a Kind 4:1, Straight 1:1</b>. The optional <b>Pair Plus</b> side bet pays on your hand alone: <b>SF 40:1, Trips 30:1, Straight 6:1, Flush 3:1, Pair 1:1</b>.'],
    ['The math', 'Play with <b>Queen-6-4 or better</b> and fold below it. The Ante/Play edge is <b>3.37%</b> of the Ante (about 2% per dollar wagered). <b>Pair Plus has a 7.28% edge</b>: it feels like a bonus but costs double.'],
  ],
  keno: [
    ['How keno works', 'The board has <b>80 numbers</b>. Pick <b>1 to 10</b> of them (click, or arrows + <kbd>F</kbd>, or <kbd>Q</kbd> for a quick pick), then press <kbd>Space</kbd>. The house draws <b>20 balls</b> and pays by how many of your numbers were drawn.'],
    ['The paytable', 'The more spots you pick, the bigger the top prize: 1 spot pays 3×, 10 spots pays up to <b>10,000×</b>. Only the biggest catches pay much; smaller catches mostly return your money or less.'],
    ['The math', `Hitting all 10 spots is <b>1 in ${Math.round(1 / k10).toLocaleString('en-US')}</b>, yet it pays 10,000×. Fair odds would pay about ${Math.round(1 / k10).toLocaleString('en-US')}×. Every spot count returns roughly <b>70–75%</b>, so the <b>house edge is 25–30%</b>.`],
    ['Why it hooks people', 'A new game starts every few minutes, near misses are common, and the wall board glows with your numbers. It is a lottery you can buy every 5 minutes.'],
  ],
  sicbo: [
    ['Three dice', 'The dealer shakes <b>three dice</b> in a cage. You bet on the result: <b>Small</b> (total 4–10) or <b>Big</b> (11–17) pay 1:1, but both <b>lose to any triple</b>.'],
    ['Other bets', '<b>Single number</b>: pays 1:1, 2:1 or 3:1 for one, two or three dice showing it. <b>Double</b> 10:1. <b>Specific triple</b> 180:1. <b>Any triple</b> 30:1. <b>Totals</b> 4 &amp; 17 pay 60:1 down to 6:1 for 9–12.'],
    ['Bet slip', 'Choose a bet with <kbd>←</kbd><kbd>→</kbd>, change its number with <kbd>Z</kbd><kbd>X</kbd>, press <kbd>Enter</kbd> to add it. Add several, then <kbd>Space</kbd> to roll.'],
    ['The math', 'Small/Big: <b>2.78%</b> edge. Single number: <b>7.87%</b>. Any triple: <b>13.9%</b>. Specific triple: <b>16.2%</b>. Double: <b>18.5%</b>. Totals range from <b>9.7% to 19%</b>. The flashier the payout, the more you pay for it.'],
  ],
  racebook: [
    ['The race book', 'Six horses run. Choose one with <kbd>←</kbd><kbd>→</kbd>, choose <b>Win</b> (first place) or <b>Place</b> (first or second) with <kbd>B</kbd>, set your stake and press <kbd>Space</kbd>. The race plays out on the big screen.'],
    ['Reading the odds', '<b>5/2</b> means you win $5 for every $2 staked (plus your stake back). Each price implies a chance: 5/2 implies 2 ÷ 7 = <b>28.6%</b>.'],
    ['The bookmaker\'s margin', 'Add up every runner\'s implied chance and you should get 100%. The board here adds to about <b>119%</b> (<b>the overround</b>). That extra ~19% is the bookmaker\'s built-in profit: <b>a 15–20% edge</b> on a typical bet, far worse than any table game.'],
    ['Skill?', 'Even if you can spot a good horse, the price already accounts for it, and the margin is paid on every winner. Only being much better than the bookmaker at predicting races overcomes it.'],
  ],
  lottery: [
    ['Scratch cards', 'Buy a card for your bet amount, scratch six panels: <b>match three identical amounts</b> to win that prize (a multiple of the card price).'],
    ['What are the odds?', 'About <b>1 card in 5</b> wins something, but most prizes are just 1× or 2× the price. The top prize of 20,000× is roughly 1 in 1.4 million.'],
    ['The math', 'Cards return only about <b>63%</b> of the money spent, a <b>37% house edge</b>. That is over 4× the edge of slots and 7× roulette.'],
    ['Near misses are planned', 'Cards showing two big prizes and no third are common by design, and every tiny win makes the next card feel lucky.'],
  ],
});
