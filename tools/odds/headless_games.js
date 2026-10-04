'use strict';
// Plays the real game code (js/games.js, games2.js, games2b.js) headlessly with the DOM and
// 3D renderer stubbed out, and measures the house edge from the game's own settle() bookkeeping.
// It also checks that money is conserved and no round throws.
// Run: node tools/odds/headless_games.js [rounds-per-game]
const fs = require('fs'), path = require('path'), vm = require('vm');
const N = +process.argv[2] || 20000;
const root = path.join(__dirname, '../..');
const dummy = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'classList' ? { add() {}, remove() {}, toggle() {}, contains: () => true } : dummy), apply: () => dummy, set: () => true });
const ctx = {
  console, Math, Date, Promise, Set, Map, JSON, Object, Array, Number, String, Proxy, Symbol, parseInt, parseFloat, isNaN,
  setTimeout: f => setImmediate(f), clearTimeout() {},
  document: { addEventListener() {}, createElement: () => dummy, head: { appendChild() {} }, body: dummy, pointerLockElement: null },
  window: {}, localStorage: { getItem: () => '1', setItem() {} },
  $: () => dummy, el: () => dummy, modalOpen: false, phoneOpen: false,
  lesson() {}, toast() {}, updateHUD() {}, afterAction() {}, blocked: () => false, seatPlayer() {}, standPlayer() {}, clearMovement() {}, infoDialog() {},
};
vm.createContext(ctx);
const load = f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
['js/state.js', 'js/games.js', 'js/odds2.js', 'js/games2.js', 'js/games2b.js'].forEach(load);
const run = code => vm.runInContext(code, ctx);
run('S = newState(); S.cash = 1e12;');
const O = run('Odds2');

async function session(type, extra = {}, o = {}) {
  run(`gameSession = null`);
  ctx.__o = Object.assign({ type }, o); ctx.__extra = extra;
  run(`(() => { const [lo, hi] = LIMITS[__o.type]; gameSession = Object.assign({ o: __o, type: __o.type, busy: false, bet: lo, lo, hi, sel: 0, num: 17, log: [] }, GAMES[tut(__o.type)].init ? GAMES[tut(__o.type)].init(__o) : {}, __extra); })()`);
}
const idle = async () => { for (let i = 0; i < 100000 && run('gameSession && gameSession.busy'); i++) await new Promise(r => setImmediate(r)); };
const stat = name => run(`S.stats.games[${JSON.stringify(name)}]`);
const pct = x => (x * 100).toFixed(2) + '%';
const report = (label, name, published) => {
  const g = stat(name); if (!g) return console.log(`${label}: (no rounds)`);
  console.log(`${label.padEnd(34)} rounds ${String(g.rounds).padStart(7)}  measured edge ${pct(1 - g.returned / g.wagered).padStart(8)}   ${published || ''}`);
};
let conservation = () => {
  const st = run('S.stats'); const expect = 1e12 + st.returned - st.wagered;
  const off = Math.abs(run('S.cash') - expect);
  if (off > 1e-3 * Math.max(1, N)) throw new Error(`money not conserved: off by ${off}`);
};

(async () => {
  const t0 = Date.now();
  // Video poker: always follow the hint (basic strategy)
  for (const pay of ['9/6', '8/5', '6/5']) {
    await session('videopoker', {}, { pay });
    for (let i = 0; i < N * 5; i++) { await run('VIDEOPOKER.deal()'); run('VIDEOPOKER.hint()'); await run('VIDEOPOKER.draw()'); }
    report(`Video Poker ${pay} (hint strategy)`, `Video Poker (${pay})`, `perfect-play edge ${pct(1 - O.VP_RTP[pay])}`);
  }
  // Three Card Poker: Q-6-4 strategy, all three bet modes
  for (const [mode, label, pub] of [[0, 'Ante/Play', '3.37% of ante'], [1, 'Ante + Pair Plus', ''], [2, 'Pair Plus only', '7.28%']]) {
    run(`S.stats.games = {}`);
    await session('threecard'); run(`gameSession.sel = ${mode}`);
    for (let i = 0; i < N * 2; i++) {
      await run('THREECARD.deal()');
      if (run('gameSession.stage') === 'decide') await run('(gameSession.p.length === 3 && Odds2.tcpShouldPlay(Odds2.tcpEval(gameSession.p))) ? THREECARD.play() : THREECARD.fold()');
    }
    report(`Three Card Poker ${label}`, 'Three Card Poker', pub);
  }
  run(`S.stats.games = {}`);
  // Keno: each spot count
  for (let spots = 1; spots <= 10; spots++) {
    run(`S.stats.games = {}`);
    await session('keno');
    for (let i = 0; i < N / 2; i++) { run(`gameSession.picks = Odds2.kenoQuickPick(${spots}); gameSession.drawn = []`); await run('KENO.play()'); }
    report(`Keno ${spots} spots`, 'Keno', `exact edge ${pct(1 - O.kenoRTP(spots))}`);
  }
  // Sic Bo: single bets of each kind
  for (const [key, n] of [['small'], ['big'], ['single', 3], ['double', 3], ['triple', 3], ['anytriple'], ['total', 7], ['total', 4]]) {
    run(`S.stats.games = {}`);
    await session('sicbo');
    run(`gameSession.sel = SB_CHOICES.findIndex(c => c[0] === ${JSON.stringify(key)}); gameSession.nn.dice = ${n || 3}; gameSession.nn.total = ${n || 10}`);
    for (let i = 0; i < N; i++) await run('SICBO.roll()');
    report(`Sic Bo ${key}${n ? ' ' + n : ''}`, 'Sic Bo', `exact edge ${pct(O.sicboEdge(key, n))}`);
  }
  // Race book: random runner, win and place
  for (const kind of ['win', 'place']) {
    run(`S.stats.games = {}`);
    await session('racebook'); run(`gameSession.kind = ${JSON.stringify(kind)}`);
    for (let i = 0; i < N; i++) { run(`gameSession.sel = Math.floor(Math.random() * 6)`); await run('RACEBOOK.run()'); }
    report(`Race Book ${kind}`, `Race Book (${kind})`, kind === 'win' ? 'about 16%' : 'about 15%');
  }
  // Scratch cards
  run(`S.stats.games = {}`);
  await session('lottery');
  for (let i = 0; i < N * 5; i++) await run('LOTTERY.scratch()');
  report('Scratch cards', 'Scratch Cards', `exact edge ${pct(1 - O.scratchRTP())}`);
  // Smoke test: blackjack (random legal moves incl. split and insurance), craps with odds, baccarat road
  run(`S.stats.games = {}`);
  await session('blackjack', {}, { type: 'blackjack' });
  let splits = 0, insured = 0;
  for (let i = 0; i < N / 4; i++) {
    await run('BLACKJACK.deal()');
    for (let guard = 0; guard < 40 && run('gameSession.busy'); guard++) {
      const st = run('gameSession.stage');
      if (st === 'insurance') { insured++; await run('BLACKJACK.insure(Math.random() < 0.5)'); }
      else if (st === 'play') {
        if (run('BLACKJACK.canSplit(gameSession)') && Math.random() < 0.5) { splits++; await run('BLACKJACK.splitHand()'); }
        else if (run('handVal(gameSession.hands[gameSession.cur].cards).total') < 15) await run('BLACKJACK.hit()'); else await run('BLACKJACK.stand()');
      } else await new Promise(r => setImmediate(r));
    }
    await idle();
  }
  console.log(`Blackjack (random simple strategy): ${splits} splits, ${insured} insurance offers`); report('Blackjack (hit < 15)', 'Blackjack'); report('Blackjack Insurance', 'Blackjack Insurance', 'edge 7.4%');
  run(`S.stats.games = {}`);
  await session('craps', {}, { type: 'craps' });
  for (let i = 0; i < N; i++) { await run('CRAPS.roll()'); if (run('gameSession.point && !gameSession.odds') && Math.random() < 0.7) await run('CRAPS.takeOdds()'); }
  while (run('gameSession.stake')) await run('CRAPS.roll()');
  report('Craps pass line + odds', 'Craps (Pass)', 'line 1.41%; odds 0%; blended lower');
  await session('baccarat', {}, { type: 'baccarat' });
  for (let i = 0; i < N / 4; i++) await run('BACCARAT.deal()');
  console.log('Baccarat road entries:', run('gameSession.road.length'));
  await idle();
  conservation();
  console.log(`money conserved; done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
