'use strict';
// Exact + Monte-Carlo checks for keno, sic bo, race book and scratch cards.
// Run: node tools/odds/keno_sicbo_scratch_race.js [samples]
const O = require('../../js/odds2.js');
const N = +process.argv[2] || 2_000_000;
const pct = x => (x * 100).toFixed(2) + '%';

console.log('== KENO (exact hypergeometric, then Monte-Carlo) ==');
for (let s = 1; s <= 10; s++) {
  const exact = O.kenoRTP(s);
  let tot = 0;
  const n = N / 4;
  for (let i = 0; i < n; i++) { const picks = O.kenoQuickPick(s); tot += O.kenoScore(picks, O.kenoDraw()).mult; }
  console.log(`${String(s).padStart(2)} spots  RTP exact ${pct(exact)}  house edge ${pct(1 - exact)}   MC edge ${pct(1 - tot / n)}`);
}

console.log('\n== SIC BO (exact over 216 outcomes; MC) ==');
const rows = [['small'], ['big'], ['single', 3], ['double', 3], ['triple', 3], ['anytriple'], ...[4, 5, 6, 7, 8, 9, 10, 11].map(n => ['total', n])];
for (const [k, n] of rows) {
  const b = O.sicboBet(k); let tot = 0;
  for (let i = 0; i < N; i++) tot += b.ret(O.sicboRoll(), n);
  console.log(`${(k + (n ? ' ' + n : '')).padEnd(12)} exact edge ${pct(O.sicboEdge(k, n))}   MC edge ${pct(1 - tot / N)}`);
}

console.log('\n== RACE BOOK (win + place, 6 runners, 12% takeout) ==');
let wTot = 0, wStake = 0, pTot = 0, pStake = 0, over = 0, R = 0, exW = 0, exP = 0;
for (let r = 0; r < N / 20; r++) {
  const f = O.raceField(6, 0.12); over += f.overround; R++;
  const ord = O.raceOrder(f);
  for (const h of f.horses) {
    wStake++; pStake++;
    if (ord[0] === h.i) wTot += h.winOdds + 1;
    if (ord[0] === h.i || ord[1] === h.i) pTot += h.placeOdds + 1;
    exW += h.winEdge; exP += h.placeEdge;
  }
}
console.log(`average overround ${pct(over / R)} (sum of implied probabilities)`);
console.log(`win bet  edge: exact ${pct(exW / wStake)}  MC ${pct(1 - wTot / wStake)}`);
console.log(`place bet edge: exact ${pct(exP / pStake)}  MC ${pct(1 - pTot / pStake)}`);

console.log('\n== SCRATCH CARDS ==');
let st = 0; const M = N * 2;
for (let i = 0; i < M; i++) st += O.scratchDraw();
console.log(`RTP exact ${pct(O.scratchRTP())}  edge ${pct(1 - O.scratchRTP())}   MC edge ${pct(1 - st / M)}`);
