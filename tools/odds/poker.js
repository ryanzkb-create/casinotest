'use strict';
// Monte-Carlo checks for Video Poker (Jacks or Better) and Three Card Poker.
// Run: node tools/odds/poker.js [hands]
const O = require('../../js/odds2.js');
const N = +process.argv[2] || 1_000_000;
const ONLY = process.argv[3] || 'all';   // 'vp', 'tcp' or 'all'
const pct = x => (x * 100).toFixed(2) + '%';

if (ONLY !== 'tcp') {
console.log(`== VIDEO POKER, Jacks or Better, ${N.toLocaleString()} hands, in-game hold advice (approximate strategy) ==`);
for (const table of ['9/6', '8/5', '6/5']) {
  let tot = 0; const counts = {};
  for (let i = 0; i < N; i++) { const h = O.vpPlay(table); tot += h.mult; counts[h.cat || 'none'] = (counts[h.cat || 'none'] || 0) + 1; }
  console.log(`${table}: measured RTP ${pct(tot / N)}  (perfect-play published ${pct(O.VP_RTP[table])}, so house edge ≥ ${pct(1 - O.VP_RTP[table])})`);
  if (table === '8/5') console.log('   hand frequencies:', O.VP_ORDER.map(k => `${k} ${(counts[k] / N * 100).toFixed(3)}%`).join(' · '), `· nothing ${(counts.none / N * 100).toFixed(1)}%`);
}
// sanity: holding nothing back ("draw five") is much worse
{ let tot = 0; for (let i = 0; i < N / 5; i++) tot += O.vpPlay('8/5', () => [false, false, false, false, false]).mult; console.log(`8/5 discarding everything every time: RTP ${pct(tot / (N / 5))}`); }
}
if (ONLY !== 'vp') {
console.log('\n== THREE CARD POKER ==');
console.log(`Pair Plus: exact RTP by enumerating all 22,100 hands = ${pct(O.tcpPairPlusRTP())} → house edge ${pct(1 - O.tcpPairPlusRTP())} (published ${pct(O.TCP_EDGE.pairPlus)})`);
{
  // Ante/Play with Q-6-4 strategy; edge measured per unit of ANTE (published 3.37%) and per unit wagered
  let stakeAnte = 0, stakeAll = 0, ret = 0, played = 0, ppRet = 0;
  for (let i = 0; i < N; i++) {
    const r = O.tcpPlayRound();
    stakeAnte += 1; stakeAll += 1 + (r.played ? 1 : 0); ret += r.res.ret; if (r.played) played++;
  }
  console.log(`Ante/Play (raise with Q-6-4+): net loss per ante ${pct((stakeAll - ret) / stakeAnte)} (published ${pct(O.TCP_EDGE.ante)}); per unit wagered ${pct((stakeAll - ret) / stakeAll)}; raised ${pct(played / N)} of hands`);
  let pp = 0; for (let i = 0; i < N; i++) { const p = O.shuffled().slice(0, 3); const m = O.TCP_PP[O.tcpEval(p).cat]; pp += m ? m + 1 : 0; }
  console.log(`Pair Plus Monte-Carlo edge ${pct(1 - pp / N)}`);
}
}
