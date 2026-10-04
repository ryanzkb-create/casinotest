'use strict';
// Sanity check for js/layout.js: every seat / standing spot of every interactive
// object must be reachable from the casino entrance by a player-sized circle.
// Run: node tools/layout_check.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/layout.js'), 'utf8') + '\nthis.OBJECTS = OBJECTS; this.WORLD = WORLD; this.buildWorld = buildWorld; this.seatOf = seatOf; this.tableSeats = tableSeats; this.slotSeat = slotSeat; this.staffSpot = staffSpot; this.MACHINE_TYPES = MACHINE_TYPES;', ctx);
ctx.buildWorld();
const R = 9, STEP = 6;
const solids = ctx.OBJECTS.filter(o => o.solid);
const hits = (x, y) => { if (x - R < 0 || y - R < 0 || x + R > ctx.WORLD.w || y + R > ctx.WORLD.h) return true; for (const o of solids) if (x + R > o.x && x - R < o.x + o.w && y + R > o.y && y - R < o.y + o.h) return true; return false; };
// flood fill on a coarse grid
const seen = new Set(), q = [[900, 1050]];
const key = (x, y) => Math.round(x / STEP) + ',' + Math.round(y / STEP);
seen.add(key(900, 1050));
while (q.length) {
  const [x, y] = q.pop();
  for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
    const nx = x + dx, ny = y + dy, k = key(nx, ny);
    if (seen.has(k) || hits(nx, ny)) continue;
    seen.add(k); q.push([nx, ny]);
  }
}
const reach = (x, y) => { for (let dx = -STEP; dx <= STEP; dx += STEP) for (let dy = -STEP; dy <= STEP; dy += STEP) if (seen.has(key(x + dx, y + dy))) return true; return false; };
let bad = 0, total = 0;
for (const o of ctx.OBJECTS) {
  if (!o.type) continue;
  const spots = [];
  const n = ctx.tableSeats(o);
  if (['videopoker', 'keno', 'racebook', 'lottery', 'slots'].includes(o.type)) spots.push(ctx.seatOf(o));
  else if (n.length) spots.push(...n);
  spots.push(ctx.seatOf(o));
  total++;
  if (!spots.some(s => reach(s.x, s.y))) { bad++; console.log('UNREACHABLE', o.type, Math.round(o.x / 20 * 10) / 10, Math.round(o.y / 20 * 10) / 10); }
}
console.log(`${total} interactive objects, ${bad} unreachable`);
process.exit(bad ? 1 : 0);
