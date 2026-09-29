'use strict';

// ---------------------------------------------------------------------------
// Casino floor plan. Map units: 20 units = 1 metre. The casino interior spans
// x 0..1800 (90 m) and y 0..990 (49.5 m); the Strip is south of the front wall.
// Every object is an axis-aligned rectangle used for collision and interaction;
// the 3D renderer builds detailed models from the same data.
// ---------------------------------------------------------------------------
const WORLD = { w: 1800, h: 1240 };
const CASINO_BOTTOM = 990;
const DOOR = { x1: 850, x2: 950 };
const M = v => Math.round(v * 20);

const ZONES = [
  { x: 0, y: 0, w: 1800, h: 1004, color: '#3a1020', floor: 'carpet' },
  { x: M(0.5), y: M(0.5), w: M(40), h: M(35.5), color: '#3a1450', label: 'SLOT MACHINES', floor: 'carpet' },
  { x: M(49.5), y: M(4), w: M(19), h: M(31.5), color: '#0f3a24', label: 'TABLE GAMES', floor: 'carpetTables' },
  { x: M(69), y: M(0.5), w: M(20.5), h: M(16.5), color: '#4a3a0a', label: 'HIGH LIMIT ROOM', floor: 'marbleDark' },
  { x: M(17), y: M(40), w: M(19), h: M(9.5), color: '#102a4a', label: 'THE LUCKY BAR', floor: 'wood' },
  { x: M(70), y: M(38), w: M(19.5), h: M(11.5), color: '#4a2a10', label: 'FOOD COURT', floor: 'tiles' },
  { x: M(75), y: M(19), w: M(14.5), h: M(16.5), color: '#333642', label: 'HOTEL LOBBY', floor: 'marble' },
  { x: M(0.5), y: M(38), w: M(15.5), h: M(11.5), color: '#2a2034', label: 'CASHIER & LOUNGE', floor: 'carpetBlue' },
  { x: M(49.5), y: M(39.5), w: M(19.5), h: M(10), color: '#141a3a', label: 'SPORTSBOOK & KENO LOUNGE', floor: 'carpetBlue' },
  // marble walkways
  { x: M(41.5), y: 0, w: M(7), h: M(49.5), color: '#6a6258', floor: 'marble', walkway: true },
  { x: 0, y: M(36), w: M(90), h: M(3.5), color: '#6a6258', floor: 'marble', walkway: true },
  { x: 0, y: 1004, w: 1800, h: 126, color: '#5b5b60', label: 'THE STRIP', floor: 'sidewalk' },
];

const OBJECTS = [];
function addObj(o) {
  if (o.solid === undefined) o.solid = true;
  OBJECTS.push(o);
  return o;
}

const SLOT_THEMES = ['Lucky 777', 'Golden Dragon', 'Diamond Blaze', 'Pharaoh’s Riches', 'Stampede Gold', 'Cash Tornado'];

// Where a player sits/stands to use an object, and which way they face.
// dir: side of the object the player is on ('N' = smaller y, 'S' = larger y, 'W', 'E').
function seatOf(o, t = 0.5) {
  const off = o.seatOff || 14;
  switch (o.dir) {
    case 'N': return { x: o.x + o.w * t, y: o.y - off, face: 0 };
    case 'S': return { x: o.x + o.w * t, y: o.y + o.h + off, face: Math.PI };
    case 'W': return { x: o.x - off, y: o.y + o.h * t, face: Math.PI / 2 };
    default: return { x: o.x + o.w + off, y: o.y + o.h * t, face: -Math.PI / 2 };
  }
}
// The opposite side (dealer, bartender, clerk)
function staffSpot(o) {
  const off = o.staffOff || 16;
  switch (o.dir) {
    case 'N': return { x: o.x + o.w / 2, y: o.y + o.h + off, face: Math.PI };
    case 'S': return { x: o.x + o.w / 2, y: o.y - off, face: 0 };
    case 'W': return { x: o.x + o.w + off, y: o.y + o.h / 2, face: -Math.PI / 2 };
    default: return { x: o.x - off, y: o.y + o.h / 2, face: Math.PI / 2 };
  }
}

// Single-seat machine games added in js/games2.js (video poker, keno, race book, scratch cards)
const MACHINE_TYPES = ['videopoker', 'keno', 'racebook', 'lottery'];
function tableSeats(o) {
  if (MACHINE_TYPES.includes(o.type)) return [seatOf(o)];
  const n = o.type === 'bigsix' ? 0 : o.type === 'craps' ? 5 : o.type === 'roulette' ? 4 : o.type.startsWith('baccarat') ? 5 : 5;
  const out = [];
  for (let i = 0; i < n; i++) {
    // seats follow the curve of the table edge
    const t = (i + 0.5) / n;
    const s = seatOf(o, 0.12 + t * 0.76);
    const bulge = Math.sin(t * Math.PI) * 10;
    if (o.dir === 'N') s.y -= bulge; else if (o.dir === 'S') s.y += bulge;
    else if (o.dir === 'W') s.x -= bulge; else s.x += bulge;
    out.push(s);
  }
  return out;
}
function slotSeat(o) { return seatOf(o); }

function buildWorld() {
  OBJECTS.length = 0;
  let themeI = 0;

  // --- Slot machine banks (back-to-back rows) --------------------------------
  const MW = 19, MD = 16;                     // machine footprint (0.95 m x 0.8 m)
  for (const bx of [M(2.5), M(14), M(25.5)]) {
    for (const cy of [M(4.2), M(11.2), M(18.2), M(25.2), M(32.2)]) {
      const theme = SLOT_THEMES[themeI++ % SLOT_THEMES.length];
      for (let i = 0; i < 6; i++) {
        addObj({ x: bx + i * MW, y: cy - MD, w: MW, h: MD, type: 'slots', dir: 'N', theme, bank: themeI, seatOff: 13 });
        addObj({ x: bx + i * MW, y: cy, w: MW, h: MD, type: 'slots', dir: 'S', theme, bank: themeI, seatOff: 13 });
      }
      // progressive jackpot sign above the bank (decor, not solid)
      addObj({ x: bx, y: cy - 2, w: MW * 6, h: 4, decor: 'jackpotSign', theme, solid: false });
    }
  }
  // a row of big feature machines along the walkway
  for (let i = 0; i < 5; i++) addObj({ x: M(37.2), y: M(3 + i * 6.5), w: M(1.6), h: M(1.3), type: 'slots', dir: 'E', theme: 'Mega Wheel', big: true, seatOff: 16 });

  // --- Table games pits ------------------------------------------------------
  const T = (x, y, w, h, type, dir, extra = {}) => addObj(Object.assign({ x: M(x), y: M(y), w: M(w), h: M(h), type, dir, seatOff: 22, staffOff: 14 }, extra));
  T(51, 7, 3.4, 1.7, 'blackjack', 'N', { minBet: 25, maxBet: 100_000 });
  T(58.5, 7, 3.4, 1.7, 'blackjack', 'N', { minBet: 25, maxBet: 100_000 });
  T(51, 15.3, 3.4, 1.7, 'blackjack', 'S', { minBet: 25, maxBet: 100_000 });
  T(58.5, 15.3, 3.4, 1.7, 'blackjack', 'S', { minBet: 25, maxBet: 100_000 });
  T(51, 22.5, 3.6, 1.8, 'roulette', 'N');
  T(58.5, 22.5, 3.6, 1.9, 'baccarat', 'N');
  T(50.6, 30.4, 4.4, 2.2, 'craps', 'S');
  T(58.5, 30.5, 3.6, 1.8, 'roulette', 'S');
  addObj({ x: M(65.2), y: M(24), w: M(1.6), h: M(1.4), type: 'bigsix', dir: 'W', seatOff: 26 });
  // Three Card Poker and Sic Bo (games2.js)
  T(63.5, 7, 3.4, 1.7, 'threecard', 'N', { minBet: 25, maxBet: 25_000 });
  T(63.5, 15.3, 3.4, 1.7, 'threecard', 'S', { minBet: 25, maxBet: 25_000 });
  T(63.3, 30.5, 3.6, 1.8, 'sicbo', 'S', { minBet: 10, maxBet: 50_000 });
  // pit podiums (supervisor desks) in the middle of each pit
  addObj({ x: M(55.4), y: M(11.8), w: M(1.6), h: M(1), decor: 'podium' });
  addObj({ x: M(55.4), y: M(26.8), w: M(1.6), h: M(1), decor: 'podium' });

  // --- Sportsbook & keno lounge (south of the tables, east of the entrance walkway) ---
  // video poker bank: two back-to-back rows of six, each with its own paytable
  const VP_TABLES = ['6/5', '6/5', '8/5', '6/5', '8/5', '6/5', '9/6', '6/5', '8/5', '6/5', '8/5', '6/5'];
  for (let i = 0; i < 6; i++) {
    addObj({ x: M(50.6) + i * MW, y: M(41.9) - MD, w: MW, h: MD, type: 'videopoker', dir: 'N', pay: VP_TABLES[i], seatOff: 13 });
    addObj({ x: M(50.6) + i * MW, y: M(41.9), w: MW, h: MD, type: 'videopoker', dir: 'S', pay: VP_TABLES[6 + i], seatOff: 13 });
  }
  // race book and keno terminals face big screens on the south wall
  for (let i = 0; i < 4; i++) {
    addObj({ x: M(51.6 + i * 1.5), y: M(46), w: M(0.9), h: M(0.7), type: 'racebook', dir: 'N', seatOff: 14 });
    addObj({ x: M(60.3 + i * 1.5), y: M(46), w: M(0.9), h: M(0.7), type: 'keno', dir: 'N', seatOff: 14 });
  }
  addObj({ x: M(51.45), y: M(49.2), w: M(5.6), h: 6, decor: 'raceScreen', dir: 'N', solid: false });
  addObj({ x: M(60.65), y: M(49.2), w: M(4.6), h: 6, decor: 'kenoScreen', dir: 'N', solid: false });
  // scratch card kiosks
  addObj({ x: M(67.2), y: M(41.2), w: M(0.7), h: M(0.9), type: 'lottery', dir: 'W', seatOff: 14 });
  addObj({ x: M(67.2), y: M(43.6), w: M(0.7), h: M(0.9), type: 'lottery', dir: 'W', seatOff: 14 });

  // --- High limit room --------------------------------------------------------
  T(71.5, 6.5, 3.4, 1.7, 'blackjack_hl', 'S', { minBet: 10_000, maxBet: 1_000_000 });
  T(79.5, 6.5, 3.6, 1.9, 'baccarat_hl', 'S', { minBet: 25_000, maxBet: 2_000_000 });
  // glass partition with an opening (x 76-80 m on the south side)
  addObj({ x: M(69), y: M(17), w: M(7), h: M(0.3), decor: 'glassWall' });
  addObj({ x: M(80), y: M(17), w: M(9.5), h: M(0.3), decor: 'glassWall' });
  addObj({ x: M(68.7), y: M(0.5), w: M(0.3), h: M(16.8), decor: 'glassWall' });
  addObj({ x: M(84.5), y: M(12.5), w: M(1.2), h: M(1.2), decor: 'armchair' });
  addObj({ x: M(86.5), y: M(12.5), w: M(1.2), h: M(1.2), decor: 'armchair' });

  // --- Island bar ------------------------------------------------------------
  addObj({ x: M(21), y: M(42.2), w: M(10), h: M(3.6), type: 'bar', dir: 'S', seatOff: 14 });

  // --- Food court (counters along the east wall) -----------------------------
  addObj({ x: M(86.2), y: M(39), w: M(2.4), h: M(2.6), type: 'hotdog', dir: 'W', label: 'Hot Dogs' });
  addObj({ x: M(86.2), y: M(42.3), w: M(2.4), h: M(3.2), type: 'buffet', dir: 'W', label: 'Buffet' });
  addObj({ x: M(86.2), y: M(46.2), w: M(2.4), h: M(2.8), type: 'steak', dir: 'W', label: 'Steakhouse' });
  for (const [x, y] of [[73, 41], [77.5, 41], [73, 45.5], [77.5, 45.5], [81.5, 43.2]]) addObj({ x: M(x), y: M(y), w: M(1.4), h: M(1.4), decor: 'diningTable' });

  // --- Hotel lobby -----------------------------------------------------------
  addObj({ x: M(79.5), y: M(24.4), w: M(6), h: M(1.2), type: 'hotel', dir: 'S', label: 'Front Desk' });
  addObj({ x: M(88.2), y: M(20), w: M(1.2), h: M(2.4), decor: 'elevator' });
  addObj({ x: M(88.2), y: M(28), w: M(1.2), h: M(2.4), decor: 'elevator' });
  addObj({ x: M(77), y: M(30.5), w: M(2.4), h: M(1.1), decor: 'sofa' });
  addObj({ x: M(81), y: M(30.5), w: M(2.4), h: M(1.1), decor: 'sofa' });

  // --- Cashier cage & lounge -------------------------------------------------
  addObj({ x: M(1), y: M(40.5), w: M(7.5), h: M(1.4), type: 'cashier', dir: 'S', label: 'Cashier Cage' });
  addObj({ x: M(9.6), y: M(40.6), w: M(0.8), h: M(0.7), type: 'atm', dir: 'S', label: 'ATM' });
  addObj({ x: M(11.4), y: M(40.7), w: M(0.6), h: M(0.5), type: 'fountain', dir: 'S', label: 'Water' });
  addObj({ x: M(13.2), y: M(40.6), w: M(1.4), h: M(0.4), type: 'poster', dir: 'S', label: 'Help Poster' });
  addObj({ x: M(1), y: M(45.5), w: M(0.3), h: M(2.2), type: 'noclock', dir: 'E', label: 'Where are the clocks?' });
  addObj({ x: M(4), y: M(46.8), w: M(2.4), h: M(1.1), decor: 'sofa' });
  addObj({ x: M(8.5), y: M(46.8), w: M(2.4), h: M(1.1), decor: 'sofa' });

  // --- Pillars ----------------------------------------------------------------
  for (const [x, y] of [[40.6, 8], [40.6, 20], [40.6, 31], [49.1, 8], [49.1, 20], [49.1, 31], [16, 38.2], [36.5, 38.2], [68.5, 38.2], [68.5, 24]])
    addObj({ x: M(x) - 9, y: M(y) - 9, w: 18, h: 18, decor: 'pillar' });

  // --- Casino front wall with the entrance -----------------------------------
  addObj({ x: 0, y: CASINO_BOTTOM, w: DOOR.x1, h: 14, wall: true });
  addObj({ x: DOOR.x2, y: CASINO_BOTTOM, w: 1800 - DOOR.x2, h: 14, wall: true });

  // --- The Strip ---------------------------------------------------------------
  addObj({ x: 90, y: 1036, w: 100, h: 40, type: 'streetsleep', dir: 'S', label: 'Cardboard spot' });
  addObj({ x: 330, y: 1018, w: 200, h: 58, type: 'soup', dir: 'S', label: 'Soup Kitchen' });
  addObj({ x: 600, y: 1018, w: 170, h: 58, type: 'pawn', dir: 'S', label: 'Pawn Shop' });
  addObj({ x: 1120, y: 1036, w: 30, h: 30, type: 'tap', dir: 'S', label: 'Public tap' });
  addObj({ x: 1240, y: 1018, w: 190, h: 58, type: 'gunstore', dir: 'S', label: 'Gun Store' });
  addObj({ x: 1580, y: 1024, w: 140, h: 52, type: 'busstop', dir: 'S', label: 'Bus out of town' });
  addObj({ x: M(38.6) - 8, y: 1110, w: 16, h: 16, decor: 'canopyPost' });
  addObj({ x: M(51.4) - 8, y: 1110, w: 16, h: 16, decor: 'canopyPost' });
  addObj({ x: 1030, y: 1102, w: 44, h: 24, decor: 'pylon' });
  addObj({ x: -400, y: 1130, w: 2600, h: 400, road: true });
}
