'use strict';

// ---------------------------------------------------------------------------
// Pure maths for the second wave of casino games (video poker, three card poker,
// keno, sic bo, race book, scratch cards). No DOM: the same file is loaded by the
// game (index.html) and by the Monte-Carlo checks in tools/odds/, so the house
// edges we print are measured on the exact code that pays you.
// Cards are { r: 'A'..'K', s: '♠♥♦♣' } like js/games.js.
// ---------------------------------------------------------------------------
const Odds2 = (() => {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const rv = c => (c.r === 'A' ? 14 : c.r === 'K' ? 13 : c.r === 'Q' ? 12 : c.r === 'J' ? 11 : +c.r);
  const rand = () => Math.random();

  function freshDeck() { const d = []; for (const s of SUITS) for (const r of RANKS) d.push({ r, s }); return d; }
  function shuffled(rng = rand) {
    const a = freshDeck();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  const choose = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };

  // -------------------------------------------------------------------------
  // VIDEO POKER: Jacks or Better. Paytables are "for 1 coin" multiples of the
  // 5-coin max bet (so RF = 800 x bet, which is why max coins matter).
  // -------------------------------------------------------------------------
  const VP_PAYS = {
    '9/6': { RF: 800, SF: 50, '4K': 25, FH: 9, F: 6, S: 4, '3K': 3, '2P': 2, JB: 1 },
    '8/5': { RF: 800, SF: 50, '4K': 25, FH: 8, F: 5, S: 4, '3K': 3, '2P': 2, JB: 1 },
    '6/5': { RF: 800, SF: 50, '4K': 25, FH: 6, F: 5, S: 4, '3K': 3, '2P': 2, JB: 1 },
  };
  // published return with perfect play (Wizard of Odds)
  const VP_RTP = { '9/6': 0.9954, '8/5': 0.9730, '6/5': 0.9499 };
  const VP_NAMES = { RF: 'Royal Flush', SF: 'Straight Flush', '4K': 'Four of a Kind', FH: 'Full House', F: 'Flush', S: 'Straight', '3K': 'Three of a Kind', '2P': 'Two Pair', JB: 'Jacks or Better' };
  const VP_ORDER = ['RF', 'SF', '4K', 'FH', 'F', 'S', '3K', '2P', 'JB'];

  function vpEval(cards) {
    const r = cards.map(rv).sort((a, b) => a - b);
    const flush = cards.every(c => c.s === cards[0].s);
    const cnt = {}; for (const x of r) cnt[x] = (cnt[x] || 0) + 1;
    const groups = Object.entries(cnt).map(([k, v]) => [+k, v]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const straight = groups.length === 5 && (r[4] - r[0] === 4 || (r[4] === 14 && r[3] === 5 && r[0] === 2));
    if (flush && straight) return r[0] === 10 ? 'RF' : 'SF';
    if (groups[0][1] === 4) return '4K';
    if (groups[0][1] === 3 && groups[1][1] === 2) return 'FH';
    if (flush) return 'F';
    if (straight) return 'S';
    if (groups[0][1] === 3) return '3K';
    if (groups[0][1] === 2 && groups[1][1] === 2) return '2P';
    if (groups[0][1] === 2 && groups[0][0] >= 11) return 'JB';
    return null;
  }

  // Approximate expected value (in bets) of keeping a subset of a 5-card hand,
  // from the standard 9/6 strategy tables. Good enough to pick the right hold
  // almost always; the Monte-Carlo in tools/odds/ measures what it costs.
  function vpHoldEV(sub) {
    const n = sub.length;
    if (n === 0) return 0.36;
    const rs = sub.map(rv).sort((a, b) => a - b);
    const high = rs.filter(x => x >= 11).length;
    const suited = sub.every(c => c.s === sub[0].s);
    if (n === 5) { const k = vpEval(sub); return k ? VP_PAYS['9/6'][k] : 0; }
    const cnt = {}; for (const x of rs) cnt[x] = (cnt[x] || 0) + 1;
    const mult = Object.values(cnt).sort((a, b) => b - a);
    if (n === 4) {
      if (mult[0] === 4) return 25;
      if (mult[0] === 2 && mult[1] === 2) return 2.6;
      if (mult[0] === 3) return 4.2;                       // trips with a kicker: worse than keeping just the trips
      if (mult[0] === 2) return 0.5;
      const span = rs[3] - rs[0];
      const lowAce = rs[3] === 14 && rs[2] <= 5;           // A-2-3-4 / A-2-3-5 ...
      const aceLowSpan = lowAce ? [1, ...rs.slice(0, 3)].sort((a, b) => a - b) : null;
      const sp = aceLowSpan ? Math.min(span, aceLowSpan[3] - aceLowSpan[0]) : span;
      if (suited && rs[0] >= 10) return 18.6;              // 4 to a royal
      if (suited && sp === 3) return rs[3] === 14 && rs[0] === 11 ? 3.5 : 3.55; // open 4 to a straight flush
      if (suited && sp === 4) return 2.4;                  // inside 4 to a straight flush
      if (suited) return 1.2 + 0.03 * high;                // 4 to a flush
      if (sp === 3 && !(rs[3] === 14 && !lowAce)) return 0.68 + 0.064 * high; // open-ended straight draw
      if (sp === 4 || (sp === 3 && rs[3] === 14)) return 0.34 + 0.064 * high; // inside draw
      return 0;
    }
    if (n === 3) {
      if (mult[0] === 3) return 4.3;
      if (mult[0] === 2) return 0;
      const span = rs[2] - rs[0];
      const spans = rs[2] === 14 ? Math.min(span, [1, rs[0], rs[1]].sort((a, b) => a - b)[2] - 1) : span;
      if (suited && rs[0] >= 10) return 1.65;              // 3 to a royal
      if (suited && spans <= 4) return (spans === 2 ? 0.66 : spans === 3 ? 0.62 : 0.58) + 0.05 * high; // 3 to a straight flush
      if (high === 3) return 0.55;                         // JQK / QKA style
      return 0;
    }
    if (n === 2) {
      if (mult[0] === 2) return rs[0] >= 11 ? 1.54 : 0.82;
      if (high === 2) {
        if (suited) return rs[1] === 14 ? 0.57 : rs[0] === 11 && rs[1] === 12 ? 0.635 : 0.62;
        return 0.5;
      }
      if (suited && rs[0] === 10 && rs[1] >= 11) return 0.56;   // suited 10-J/Q/K
      return 0;
    }
    // one card
    return rs[0] >= 11 ? 0.47 : 0;
  }
  // -> array of 5 booleans (true = hold)
  const _holdCache = new Map();
  function vpBestHold(cards) {
    // the best hold depends only on ranks and which cards share a suit: cache by that shape
    const order = [0, 1, 2, 3, 4].sort((a, b) => rv(cards[a]) - rv(cards[b]) || cards[a].s.localeCompare(cards[b].s));
    const suitMap = {}; let ns = 0;
    const key = order.map(i => { const c = cards[i]; if (!(c.s in suitMap)) suitMap[c.s] = ns++; return rv(c) + '.' + suitMap[c.s]; }).join(' ');
    let mask = _holdCache.get(key);
    if (mask === undefined) { mask = vpBestMask(order.map(i => cards[i])); _holdCache.set(key, mask); }
    const out = [false, false, false, false, false];
    for (let k = 0; k < 5; k++) if (mask >> k & 1) out[order[k]] = true;
    return out;
  }
  function vpBestMask(cards) {
    let best = -1, bestMask = 0, bestN = -1;
    for (let m = 0; m < 32; m++) {
      const sub = []; for (let i = 0; i < 5; i++) if (m >> i & 1) sub.push(cards[i]);
      const ev = vpHoldEV(sub);
      if (ev > best + 1e-9 || (Math.abs(ev - best) < 1e-9 && sub.length > bestN)) { best = ev; bestMask = m; bestN = sub.length; }
    }
    return bestMask;
  }
  // One full hand with a chosen hold function -> { cat, mult, first, final, hold }
  function vpPlay(table = '9/6', holdFn = vpBestHold, rng = rand) {
    const deck = shuffled(rng);
    const first = deck.splice(0, 5);
    const hold = holdFn(first);
    const final = first.map((c, i) => (hold[i] ? c : deck.shift()));
    const cat = vpEval(final);
    return { first, final, hold, cat, mult: cat ? VP_PAYS[table][cat] : 0 };
  }

  // -------------------------------------------------------------------------
  // THREE CARD POKER
  // -------------------------------------------------------------------------
  const TCP_PP = { SF: 40, '3K': 30, S: 6, F: 3, P: 1 };      // Pair Plus, paid "to 1"
  const TCP_BONUS = { SF: 5, '3K': 4, S: 1 };                 // Ante bonus
  const TCP_EDGE = { pairPlus: 0.0728, ante: 0.0337 };        // published (Wizard of Odds)
  const TCP_NAMES = { SF: 'Straight Flush', '3K': 'Three of a Kind', S: 'Straight', F: 'Flush', P: 'Pair', H: 'High Card' };
  const TCP_CAT = { H: 0, P: 1, F: 2, S: 3, '3K': 4, SF: 5 };
  function tcpEval(cards) {
    const r = cards.map(rv).sort((a, b) => b - a);
    const flush = cards.every(c => c.s === cards[0].s);
    let straight = r[0] - r[1] === 1 && r[1] - r[2] === 1;
    let top = r[0];
    if (!straight && r[0] === 14 && r[1] === 3 && r[2] === 2) { straight = true; top = 3; }
    let cat, key;
    if (straight && flush) { cat = 'SF'; key = [top]; }
    else if (r[0] === r[2]) { cat = '3K'; key = [r[0]]; }
    else if (straight) { cat = 'S'; key = [top]; }
    else if (flush) { cat = 'F'; key = r; }
    else if (r[0] === r[1]) { cat = 'P'; key = [r[0], r[2]]; }
    else if (r[1] === r[2]) { cat = 'P'; key = [r[1], r[0]]; }
    else { cat = 'H'; key = r; }
    return { cat, rank: TCP_CAT[cat], key, ranks: r };
  }
  function tcpCompare(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
    return 0;
  }
  const tcpQualifies = e => e.rank > 0 || e.ranks[0] >= 12;
  // basic strategy: raise with Q-6-4 or better
  function tcpShouldPlay(e) {
    if (e.rank > 0) return true;
    const [a, b, c] = e.ranks;
    if (a > 12) return true;
    if (a < 12) return false;
    return b > 6 || (b === 6 && c >= 4);
  }
  // Resolve one hand. bets: { ante, pp, play (0 = folded) }.  -> { ret, parts }
  function tcpResolve(player, dealer, ante, pp, play) {
    const pe = tcpEval(player), de = tcpEval(dealer);
    let ret = 0; const out = { pe, de, ante: 0, playRet: 0, bonus: 0, pp: 0, qualifies: tcpQualifies(de), result: 'fold' };
    if (pp > 0) { const m = TCP_PP[pe.cat]; if (m) { out.pp = pp * (m + 1); ret += out.pp; } }
    if (play > 0) {
      const bm = TCP_BONUS[pe.cat]; if (bm) { out.bonus = ante * bm; ret += out.bonus; }
      if (!out.qualifies) { out.ante = ante * 2; out.playRet = play; out.result = 'dealerNoQualify'; }
      else {
        const c = tcpCompare(pe, de);
        if (c > 0) { out.ante = ante * 2; out.playRet = play * 2; out.result = 'win'; }
        else if (c === 0) { out.ante = ante; out.playRet = play; out.result = 'tie'; }
        else out.result = 'lose';
      }
      ret += out.ante + out.playRet;
    }
    out.ret = ret;
    return out;
  }
  function tcpPlayRound(rng = rand, strategy = tcpShouldPlay, pp = 0) {
    const d = shuffled(rng);
    const p = d.splice(0, 3), dl = d.splice(0, 3);
    const pl = strategy(tcpEval(p));
    return { p, dl, res: tcpResolve(p, dl, 1, pp, pl ? 1 : 0), played: pl };
  }
  // Exact Pair Plus return by enumerating all 22,100 hands
  function tcpPairPlusRTP() {
    const d = freshDeck(); let tot = 0, n = 0;
    for (let i = 0; i < 52; i++) for (let j = i + 1; j < 52; j++) for (let k = j + 1; k < 52; k++) {
      const m = TCP_PP[tcpEval([d[i], d[j], d[k]]).cat]; tot += m ? m + 1 : 0; n++;
    }
    return tot / n;
  }

  // -------------------------------------------------------------------------
  // KENO: 80 numbers, the house draws 20. Pays are "for 1" (total returned per 1 bet).
  // -------------------------------------------------------------------------
  const KENO_PAY = {
    1: { 1: 3 },
    2: { 2: 12 },
    3: { 2: 1, 3: 42 },
    4: { 2: 1, 3: 3, 4: 120 },
    5: { 3: 2, 4: 20, 5: 500 },
    6: { 3: 1, 4: 6, 5: 70, 6: 1500 },
    7: { 3: 1, 4: 2, 5: 15, 6: 250, 7: 5000 },
    8: { 4: 2, 5: 10, 6: 70, 7: 1000, 8: 10000 },
    9: { 4: 1, 5: 5, 6: 30, 7: 250, 8: 3000, 9: 10000 },
    10: { 0: 2, 5: 2, 6: 15, 7: 120, 8: 1000, 9: 2500, 10: 10000 },
  };
  function kenoProb(spots, k) { return choose(spots, k) * choose(80 - spots, 20 - k) / choose(80, 20); }
  function kenoRTP(spots) {
    let r = 0; const t = KENO_PAY[spots];
    for (const k in t) r += kenoProb(spots, +k) * t[k];
    return r;
  }
  function kenoDraw(rng = rand) {
    const pool = Array.from({ length: 80 }, (_, i) => i + 1);
    for (let i = 0; i < 20; i++) { const j = i + Math.floor(rng() * (80 - i)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    return pool.slice(0, 20);
  }
  function kenoQuickPick(n, rng = rand) { return kenoDraw(rng).slice(0, n).sort((a, b) => a - b); }
  function kenoScore(picks, drawn) {
    const s = new Set(drawn); const hits = picks.filter(p => s.has(p));
    const m = (KENO_PAY[picks.length] || {})[hits.length] || 0;
    return { hits, mult: m };
  }

  // -------------------------------------------------------------------------
  // SIC BO (three dice). Returns are total multiples of the stake ("for 1").
  // -------------------------------------------------------------------------
  const SICBO_TOTALS = { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 };
  const SICBO_BETS = [
    { key: 'small', label: 'Small', sub: '4–10 · 1:1', ret: d => (!trip(d) && sum(d) <= 10 ? 2 : 0) },
    { key: 'big', label: 'Big', sub: '11–17 · 1:1', ret: d => (!trip(d) && sum(d) >= 11 ? 2 : 0) },
    { key: 'single', label: 'Single', sub: '1:1 / 2:1 / 3:1', n: 1, ret: (d, n) => { const c = d.filter(x => x === n).length; return c ? 1 + c : 0; } },
    { key: 'double', label: 'Double', sub: '10:1', n: 1, ret: (d, n) => (d.filter(x => x === n).length >= 2 ? 11 : 0) },
    { key: 'triple', label: 'Triple', sub: '180:1', n: 1, ret: (d, n) => (d[0] === n && d[1] === n && d[2] === n ? 181 : 0) },
    { key: 'anytriple', label: 'Any Triple', sub: '30:1', ret: d => (trip(d) ? 31 : 0) },
    { key: 'total', label: 'Total', sub: '6:1 – 60:1', n: 4, ret: (d, n) => (sum(d) === n ? 1 + SICBO_TOTALS[n] : 0) },
  ];
  function trip(d) { return d[0] === d[1] && d[1] === d[2]; }
  function sum(d) { return d[0] + d[1] + d[2]; }
  function sicboBet(key) { return SICBO_BETS.find(b => b.key === key); }
  function sicboEdge(key, n) {
    const b = sicboBet(key); let tot = 0;
    for (let a = 1; a <= 6; a++) for (let c = 1; c <= 6; c++) for (let e = 1; e <= 6; e++) tot += b.ret([a, c, e], n);
    return 1 - tot / 216;
  }
  function sicboRoll(rng = rand) { return [1, 2, 3].map(() => 1 + Math.floor(rng() * 6)); }

  // -------------------------------------------------------------------------
  // RACE BOOK. True win probabilities are known to the sim; the board posts odds
  // shaved by the takeout and rounded DOWN to the tote ladder. Overround = sum of
  // implied probabilities (over 100% is the bookmaker's margin).
  // -------------------------------------------------------------------------
  const ODDS_LADDER = [0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.2, 2.5, 2.75, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 25, 33, 40, 50];
  const HORSES = [
    ['Golden Gamble', '#ffd23f'], ['Lucky Strike', '#3dff7a'], ['Dead Cert', '#ff4d57'], ['Sure Thing', '#2fe0ff'],
    ['Long Shot Lou', '#b36bff'], ['House Money', '#ff9a3d'], ['Quick Fix', '#ff2fb0'], ['Last Dollar', '#e8e8e8'],
    ['Broke Runner', '#6aa0ff'], ['Rainy Day', '#9be564'],
  ];
  const oddsText = o => { for (const d of [1, 2, 4, 5, 10]) { const n = o * d; if (Math.abs(n - Math.round(n)) < 1e-9) return `${Math.round(n)}/${d}`; } return `${o}/1`; };
  function ladderDown(raw) { let best = ODDS_LADDER[0]; for (const o of ODDS_LADDER) if (o <= raw + 1e-12) best = o; return best; }
  function raceField(n = 6, takeout = 0.12, rng = rand) {
    const names = HORSES.slice().sort(() => rng() - 0.5).slice(0, n);
    const w = names.map(() => 0.35 + Math.pow(rng(), 1.7) * 3.2);
    const tot = w.reduce((a, b) => a + b, 0);
    const p = w.map(x => x / tot);
    const horses = names.map(([name, color], i) => {
      const winOdds = ladderDown((1 - takeout) / p[i] - 1);
      // Harville place probability: finishing first or second
      let pl = p[i]; for (let j = 0; j < n; j++) if (j !== i) pl += p[j] * p[i] / (1 - p[j]);
      const placeOdds = ladderDown((1 - takeout) / pl - 1);
      return { i, name, color, p: p[i], pPlace: pl, winOdds, placeOdds, winEdge: 1 - p[i] * (winOdds + 1), placeEdge: 1 - pl * (placeOdds + 1) };
    });
    const overround = horses.reduce((a, h) => a + 1 / (h.winOdds + 1), 0);
    return { horses, overround, takeout };
  }
  // finishing order by sequential draws (Harville)
  function raceOrder(field, rng = rand) {
    const left = field.horses.map(h => h.i), out = [];
    while (left.length) {
      const tot = left.reduce((a, i) => a + field.horses[i].p, 0);
      let r = rng() * tot, k = 0;
      for (; k < left.length - 1; k++) { r -= field.horses[left[k]].p; if (r < 0) break; }
      out.push(left.splice(k, 1)[0]);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // SCRATCH CARDS: prize = multiple of the card price
  // -------------------------------------------------------------------------
  const SCRATCH_PRIZES = [
    { m: 1, p: 0.1 }, { m: 2, p: 0.06 }, { m: 5, p: 0.028 }, { m: 10, p: 0.011 }, { m: 25, p: 0.0032 },
    { m: 100, p: 0.0004 }, { m: 1000, p: 0.00003 }, { m: 20000, p: 0.0000007 },
  ];
  const scratchRTP = () => SCRATCH_PRIZES.reduce((a, o) => a + o.m * o.p, 0);
  function scratchDraw(rng = rand) {
    let r = rng();
    for (const o of SCRATCH_PRIZES) { if (r < o.p) return o.m; r -= o.p; }
    return 0;
  }

  return {
    SUITS, RANKS, rv, freshDeck, shuffled, choose,
    VP_PAYS, VP_RTP, VP_NAMES, VP_ORDER, vpEval, vpHoldEV, vpBestHold, vpPlay,
    TCP_PP, TCP_BONUS, TCP_EDGE, TCP_NAMES, tcpEval, tcpCompare, tcpQualifies, tcpShouldPlay, tcpResolve, tcpPlayRound, tcpPairPlusRTP,
    KENO_PAY, kenoProb, kenoRTP, kenoDraw, kenoQuickPick, kenoScore,
    SICBO_TOTALS, SICBO_BETS, sicboBet, sicboEdge, sicboRoll,
    ODDS_LADDER, oddsText, raceField, raceOrder,
    SCRATCH_PRIZES, scratchRTP, scratchDraw,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Odds2;
