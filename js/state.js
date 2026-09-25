'use strict';

// ---------------------------------------------------------------------------
// Core configuration. Every game below uses real-world casino odds, so the
// house edge always wins in the long run.
// ---------------------------------------------------------------------------
const CONFIG = {
  START_CASH: 2_000_000,
  GAME_OVER_DEBT: 1_000_000,
  BROKE_THRESHOLD: 1_000,       // loans unlock once cash drops below this
  MIN_PER_SEC: 2,               // game minutes that pass per real second on the map
  DECAY: {                      // points lost per game minute
    hunger: 100 / 960,          // empty in 16 hours
    thirst: 100 / 600,          // empty in 10 hours
    energy: 100 / 1200,         // empty in 20 hours
  },
  BANK: { maxTotal: 250_000, rate: 0.002, lateRate: 0.006, termDays: 10, lateFee: 0.10 },
  SHARK: { maxOutstanding: 700_000, rate: 0.10, termDays: 3, extendDays: 2, penalty: 0.05 },
  HOSPITAL_BILL: 8_000,
  TRAUMA_BILL: 25_000,
  HOTEL_PRICE: 450,
};

const TIERS = [
  { name: 'Bronze',   min: 0,          perks: 'No perks yet. "Keep playing to earn rewards!"' },
  { name: 'Silver',   min: 50_000,     perks: 'Free drinks at the bar' },
  { name: 'Gold',     min: 250_000,    perks: 'Free drinks + free buffet' },
  { name: 'Platinum', min: 1_000_000,  perks: 'Free drinks, buffet + free hotel room' },
  { name: 'Diamond',  min: 5_000_000,  perks: 'Everything + the penthouse suite' },
];

let S = null;

function newState() {
  return {
    cash: CONFIG.START_CASH,
    minutes: 20 * 60, // Day 1, 8:00 PM
    hunger: 85, thirst: 80, energy: 90,
    health: 100, armor: 0,
    weapons: { pistol: false, shotgun: false },
    ammo: { pistol: 0, shotgun: 0 },
    equipped: null,
    marked: false,          // flashed a big win, robbers notice
    nextRobber: 20 * 60 + 90,
    tonyAngry: 0,
    bank: { owed: 0, principal: 0, borrowedTotal: 0, due: null, late: false, credit: 'good' },
    shark: { owed: 0, principal: 0, due: null, overdueDays: 0, nextThug: null, reminded: false },
    medical: 0,
    inventory: { watch: true, ring: true, laptop: true },
    lastSoupDay: -1,
    tierIdx: 0,
    brokeNotified: false,
    lowWarned: {},
    messages: [],
    unread: 0,
    lessonsShown: {},
    ended: false,
    stats: {
      wagered: 0, returned: 0, rounds: 0, expectedLoss: 0,
      biggestWin: 0, peakCash: CONFIG.START_CASH, lossStreak: 0,
      games: {}, compsValue: 0, borrowed: 0, interest: 0, harassed: 0, collapses: 0,
      robbed: 0, robbedAmount: 0, fightsWon: 0, gunSpend: 0,
    },
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function fmt(n) {
  const neg = n < 0;
  const v = Math.round(Math.abs(n));
  return (neg ? '-' : '') + '$' + v.toLocaleString('en-US');
}

function fmtShort(n) {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return s + '$' + (a / 1e3).toFixed(1) + 'K';
  return fmt(n);
}

function clockText(min = S.minutes) {
  const day = Math.floor(min / 1440) + 1;
  const m = Math.floor(min % 1440);
  const h = Math.floor(m / 60), mm = m % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `Day ${day}, ${h12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function durationText(mins) {
  if (mins <= 0) return 'now';
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = Math.floor(mins % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function totalDebt() { return S.bank.owed + S.shark.owed + S.medical; }
function netWorth() { return S.cash - totalDebt(); }

function tierIndex() {
  let idx = 0;
  TIERS.forEach((t, i) => { if (S.stats.wagered >= t.min) idx = i; });
  return idx;
}
function hasTier(name) { return tierIndex() >= TIERS.findIndex(t => t.name === name); }

function addMsg(from, text) {
  S.messages.push({ from, text, time: S.minutes });
  S.unread++;
  if (typeof toast === 'function') toast(`📱 New message from ${from}`, 'phone');
}

// ---------------------------------------------------------------------------
// Time: hunger/thirst/energy decay and loan interest compounds.
// ---------------------------------------------------------------------------
function advanceTime(mins, sleeping = false) {
  if (S.ended || mins <= 0) return;
  const f = sleeping ? 0.35 : 1;
  const floor = sleeping ? 3 : 0; // you don't starve to death in your sleep
  S.hunger = clamp(S.hunger - CONFIG.DECAY.hunger * mins * f, Math.min(floor, S.hunger), 100);
  S.thirst = clamp(S.thirst - CONFIG.DECAY.thirst * mins * f, Math.min(floor, S.thirst), 100);
  if (!sleeping) S.energy = clamp(S.energy - CONFIG.DECAY.energy * mins, 0, 100);
  S.health = clamp(S.health + mins * (sleeping ? 0.15 : 0.03), 0, 100); // slow healing

  const days = mins / 1440;
  if (S.bank.owed > 0) {
    const r = S.bank.late ? CONFIG.BANK.lateRate : CONFIG.BANK.rate;
    const before = S.bank.owed;
    S.bank.owed *= Math.pow(1 + r, days);
    S.stats.interest += S.bank.owed - before;
  }
  if (S.shark.owed > 0) {
    const before = S.shark.owed;
    S.shark.owed *= Math.pow(1 + CONFIG.SHARK.rate, days);
    S.stats.interest += S.shark.owed - before;
  }
  S.minutes += mins;
  checkDeadlines();
}

const THREATS = [
  "You're late. That's not smart. The vig don't stop and neither do my boys.",
  "Two days late. My associates are getting impatient. They know what you look like.",
  "I'm done talking. You know what happens now.",
  "Every day you don't pay, it costs more. Every day you don't pay, it hurts more.",
];

function checkDeadlines() {
  const b = S.bank;
  if (b.owed > 0.5 && b.due !== null && !b.late && S.minutes > b.due) {
    b.late = true;
    b.credit = 'bad';
    const fee = b.owed * CONFIG.BANK.lateFee;
    b.owed += fee;
    addMsg('🏦 First National Bank',
      `NOTICE OF DELINQUENCY: Your loan is past due. A late fee of ${fmt(fee)} has been added, your rate has been raised to ${(CONFIG.BANK.lateRate * 100).toFixed(1)}% per day, and your account has been reported to the credit bureaus. You are no longer eligible for credit.`);
  }

  const k = S.shark;
  if (k.owed > 0.5 && k.due !== null) {
    if (!k.reminded && k.due - S.minutes < 720 && S.minutes < k.due) {
      k.reminded = true;
      addMsg('🦈 Tony', `Friendly reminder: you owe me ${fmt(k.owed)}. Due in ${durationText(k.due - S.minutes)}. Don't make this unfriendly.`);
    }
    if (S.minutes > k.due) {
      const od = Math.floor((S.minutes - k.due) / 1440) + 1;
      while (k.overdueDays < od) {
        k.overdueDays++;
        k.owed *= 1 + CONFIG.SHARK.penalty;
        addMsg('🦈 Tony', THREATS[Math.min(k.overdueDays - 1, THREATS.length - 1)] +
          ` (Late penalty added. You now owe ${fmt(k.owed)}.)`);
      }
      if (k.nextThug === null) k.nextThug = S.minutes + 30;
    }
  }
}

function sharkOverdue() {
  return S.shark.owed > 0.5 && S.shark.due !== null && S.minutes > S.shark.due;
}

// ---------------------------------------------------------------------------
// Betting bookkeeping. Cash is removed when a bet is placed, and the total
// amount returned (stake + winnings) is added back on settlement.
// ---------------------------------------------------------------------------
function takeBet(amount) {
  if (!(amount > 0) || amount > S.cash + 1e-9) return false;
  S.cash -= amount;
  return true;
}

function settle(game, bet, returned, edge) {
  const st = S.stats;
  S.cash += returned;
  st.wagered += bet;
  st.returned += returned;
  st.rounds++;
  st.expectedLoss += bet * edge;
  const g = st.games[game] || (st.games[game] = { rounds: 0, wagered: 0, returned: 0, edge });
  g.rounds++; g.wagered += bet; g.returned += returned;

  const profit = returned - bet;
  if (profit > st.biggestWin) st.biggestWin = profit;
  if (profit >= 25_000) {
    S.marked = true; // people saw you win
    if (typeof crowdReact === 'function') crowdReact();
  }
  if (S.cash > st.peakCash) st.peakCash = S.cash;
  st.lossStreak = profit < 0 ? st.lossStreak + 1 : 0;

  advanceTime(2);
  commentary(profit, bet);
  checkTierUp();
  afterAction();
  return profit;
}

function commentary(profit, bet) {
  const st = S.stats;
  if (profit >= bet * 5 && profit >= 5000)
    lesson('bigwin', 'Big wins feel amazing and they are exactly what keeps people playing. The odds on your next bet are just as bad as before.');
  if (st.lossStreak === 6)
    lesson('fallacy', "Gambler's fallacy: after a losing streak, a win is NOT \"due\". Every spin, hand and roll is independent.");
  if (st.rounds === 25)
    lesson('edge25', `After 25 bets the house edge has already quietly taken about ${fmt(st.expectedLoss)} from you.`);
  if (st.rounds === 150)
    lesson('edge150', 'The more you play, the closer your results get to the house edge. That is the law of large numbers, and it is how casinos make money.');
  if (S.cash < CONFIG.START_CASH * 0.5)
    lesson('half', 'You have lost half of your $2,000,000. Chasing losses (betting more to win it back) is one of the most common signs of problem gambling.');
}

function checkTierUp() {
  const idx = tierIndex();
  if (idx > S.tierIdx) {
    S.tierIdx = idx;
    const t = TIERS[idx];
    addMsg('🎩 Casino Host', `Congratulations! You've reached ${t.name} status. Perks: ${t.perks}. We value your loyalty!`);
    lesson('comps' + idx, `Comps (free stuff) are marketing. You got ${t.name} status by betting ${fmt(S.stats.wagered)}, which statistically cost you about ${fmt(S.stats.expectedLoss)}.`);
  }
}
