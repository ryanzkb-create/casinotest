'use strict';

// ---------------------------------------------------------------------------
// People in the world: appearance, behaviour and dialogue
// ---------------------------------------------------------------------------
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0662f', '#5c3a1e', '#eac086'];
const HAIRS = ['#1a1a1a', '#2b1b10', '#3b2314', '#6b4423', '#a67b5b', '#d6b36a', '#8a8a8a', '#7a2e1e'];
const TOPS = ['#1f3a93', '#c0392b', '#2c3e50', '#ecf0f1', '#27ae60', '#8e44ad', '#d35400', '#34495e', '#f1c40f', '#7f8c8d', '#e84393'];
const BOTTOMS = ['#1b1f2a', '#2c3e50', '#3d3d3d', '#5b4636', '#1e3a5f', '#6b6b6b', '#c8b68e'];
const MALE_NAMES = ['Frank', 'Earl', 'Vinnie', 'Marcus', 'Ray', 'Dwayne', 'Hank', 'Luis', 'Kenji', 'Walt', 'Tommy', 'Andre', 'Gus'];
const FEMALE_NAMES = ['Linda', 'Rosa', 'Tanya', 'Maggie', 'Keisha', 'Diane', 'Mei', 'Carla', 'Brenda', 'Sofia', 'Joyce'];

function makeLook(role, forceFemale) {
  const female = forceFemale !== undefined ? forceFemale : Math.random() < 0.45;
  const L = {
    female, skin: pick(SKINS), hair: pick(HAIRS),
    hairStyle: female ? pick(['long', 'bun', 'bob', 'long']) : pick(['short', 'short', 'bald', 'buzz', 'slick']),
    top: pick(TOPS), bottom: pick(BOTTOMS), shoes: '#111',
    height: rand(0.94, 1.06), build: rand(0.92, 1.15),
    beard: !female && Math.random() < 0.25, glasses: Math.random() < 0.15,
    hat: null, jacket: null, vest: null, tie: null, skirt: female && Math.random() < 0.35, mask: false, shades: false,
  };
  switch (role) {
    case 'gambler':
      if (Math.random() < 0.3) { L.jacket = pick(['#1c1c1c', '#2c3e50', '#4a3b2a']); L.top = '#f5f5f5'; L.tie = pick(['#8b0000', '#1f3a93', '#111']); }
      if (!female && Math.random() < 0.15) L.hat = 'cowboy';
      break;
    case 'dealer': case 'bartender':
      L.top = '#f5f5f5'; L.vest = '#121212'; L.bottom = '#121212'; L.tie = '#7a0000'; L.skirt = false; L.hat = null; break;
    case 'waitress':
      L.female = true; L.hairStyle = pick(['bun', 'long']); L.top = '#8b0a1a'; L.bottom = '#111'; L.skirt = true; L.beard = false; break;
    case 'guard':
      L.female = false; L.hairStyle = 'buzz'; L.top = '#1a1d24'; L.jacket = '#1a1d24'; L.bottom = '#1a1d24'; L.hat = 'cap'; L.beard = false; L.build = 1.2; L.tie = '#000'; break;
    case 'clerk': case 'cashierClerk':
      L.jacket = '#1f2a44'; L.top = '#f5f5f5'; L.bottom = '#1f2a44'; L.tie = '#c9a227'; break;
    case 'vendor':
      L.top = '#f5f5f5'; L.bottom = '#333'; L.hat = 'chef'; L.skirt = false; break;
    case 'homeless':
      L.female = false; L.top = '#5a4a3a'; L.jacket = '#4a3f2a'; L.bottom = '#3a3a2a'; L.beard = true; L.hat = 'beanie'; L.hair = '#6b6b6b'; L.skirt = false; break;
    case 'robber':
      L.female = false; L.top = '#262626'; L.bottom = '#1c2230'; L.hat = 'hood'; L.mask = true; L.skirt = false; L.beard = false; break;
    case 'thug':
      L.female = false; L.top = '#141414'; L.jacket = '#2a1d14'; L.bottom = '#15151d'; L.shades = true; L.hairStyle = 'slick'; L.build = 1.25; L.skirt = false; L.hat = null; break;
    case 'pedestrian':
      if (Math.random() < 0.3) L.hat = 'cap';
      break;
  }
  return L;
}

function makeNPC(role, x, y, opts = {}) {
  const female = opts.female !== undefined ? opts.female : Math.random() < 0.45;
  return Object.assign({
    role, x, y, female,
    name: opts.name || (female ? pick(FEMALE_NAMES) : pick(MALE_NAMES)),
    face: opts.face !== undefined ? opts.face : 0, pose: 'stand', anim: rand(0, 10),
    tx: x, ty: y, wait: rand(0, 4), speed: rand(24, 30), area: null,
    bubble: null, bubbleT: 0, talk: true, hp: 100, hostile: false, seatY: 0,
  }, opts);
}

const DEALER_TABLES = ['blackjack', 'blackjack_hl', 'baccarat', 'baccarat_hl', 'roulette', 'craps', 'bigsix'];
const CHAIR_H = { slots: 0.62, table: 0.72, bar: 0.78 };

// ---------------------------------------------------------------------------
// Behaviour overview (all driven from updateNPCs):
//   seats      people sit down at free seats, get up after a while and wander off
//   queues     lines at the cashier and the buffet; the head of the line is served, then leaves
//   pairs      couples / friends walk side by side and chat when they stop
//   groups     standing conversations: partners face each other, take turns talking
//   dancers    dance near the bar and the fountain in the evening
//   gunfire    everybody within earshot flees, cowers or radios for help
//   big wins   a crowd gathers around the winner and claps
//   population more people on the floor and the Strip in the evening than at 5 am
// Tasks (n.task): { type: 'goto' | 'sit' | 'queue' | 'gather' | 'flee' | 'leave', ... }
// Fields the renderer reads: pose, seated, seatY, face, activity, carry, gait, look, drunk.
// ---------------------------------------------------------------------------
let SEATS = [];
const seatFree = (s, self) => !(player.seated && Math.hypot(player.x - s.x, player.y - s.y) < 10) &&
  !npcs.some(n => n !== self && ((n.seated && Math.hypot(n.x - s.x, n.y - s.y) < 8) || (n.task && n.task.seat === s)));

function addSeat(x, y, face, seatY, kind, obj) {
  const s = { x, y, face, seatY, kind, obj };
  SEATS.push(s);
  return s;
}
function sitAt(n, s, wait) {
  n.ambient = false;
  Object.assign(n, { x: s.x, y: s.y, tx: s.x, ty: s.y, face: s.face, pose: 'sit', seated: true, seatY: s.seatY, area: null, task: null, activity: n.baseAct || null,
    sitT: wait !== undefined ? wait : rand(50, 230), seatRef: s });
}

function spawnNPCs() {
  npcs = [];
  SEATS = [];
  navBuild();
  npcClock = 0; popT = 4; seatT = 20; queueT = 10; lastRounds = null;
  for (const o of OBJECTS) {
    if (DEALER_TABLES.includes(o.type)) {
      const st = staffSpot(o);
      // the croupier works beside the wheel, which sits at one end of the table
      if (o.type === 'roulette') st.x += (o.dir === 'N' ? 1 : -1) * (o.w / 2 - M(0.9));
      npcs.push(makeNPC('dealer', st.x, st.y, { face: st.face, table: o }));
      if (o.type === 'craps') {
        for (let i = 0; i < 3; i++) if (Math.random() < 0.7) { const s = seatOf(o, 0.2 + i * 0.3); npcs.push(makeNPC('gambler', s.x, s.y, { face: s.face, activity: i === 1 ? 'cheer' : null, baseAct: null, look: { x: o.x + o.w / 2, y: o.y + o.h / 2, h: 0.95 } })); }
      } else {
        tableSeats(o).forEach(s => {
          const seat = addSeat(s.x, s.y, s.face, CHAIR_H.table - 0.48, 'table', o);
          if (Math.random() < 0.55) { const n = makeNPC('gambler', s.x, s.y, {}); sitAt(n, seat, rand(30, 200)); npcs.push(n); }
        });
      }
    }
    if (o.type === 'slots') {
      const s = slotSeat(o);
      const seat = addSeat(s.x, s.y, s.face, CHAIR_H.slots - 0.48, 'slot', o);
      if (Math.random() < 0.3) { const n = makeNPC('gambler', s.x, s.y, { slot: o }); sitAt(n, seat, rand(40, 240)); npcs.push(n); }
    }
    if (o.type === 'bar') {
      // bartender works inside the ring
      npcs.push(makeNPC('bartender', o.x + o.w * 0.35, o.y + o.h / 2 + 15, { face: 0, service: 'bar', name: 'Marco' }));
      for (let i = 0; i < 5; i++) {
        const side = i % 2 ? -1 : 1;
        const x = o.x + o.w * (0.2 + (i / 5) * 0.6), y = side > 0 ? o.y + o.h + 14 : o.y - 14;
        const seat = addSeat(x, y, side > 0 ? Math.PI : 0, CHAIR_H.bar - 0.48, 'bar', o);
        const n = makeNPC('gambler', x, y, { activity: i % 2 ? 'drink' : null, baseAct: i % 2 ? 'drink' : null });
        sitAt(n, seat, rand(60, 240)); npcs.push(n);
      }
    }
  }
  for (const [service, role] of [['hotdog', 'vendor'], ['buffet', 'vendor'], ['steak', 'vendor'], ['hotel', 'clerk'], ['cashier', 'cashierClerk']]) {
    const o = OBJECTS.find(q => q.type === service);
    if (!o) continue;
    const st = staffSpot(o);
    npcs.push(makeNPC(role, st.x, st.y, { face: st.face, service }));
    o.q = [];
  }
  npcs.push(makeNPC('guard', 820, 955, { face: 0, name: 'Officer Reyes', activity: 'radio', baseAct: null }));
  npcs.push(makeNPC('guard', 980, 955, { face: 0, name: 'Officer Dunn' }));
  npcs.push(makeNPC('guard', M(45), M(20), { area: 'walkway', speed: 24, name: 'Officer Park', gait: 'patrol' }));
  npcs.push(makeNPC('waitress', M(45), M(30), { area: 'walkway', speed: 24, carry: 'tray', female: true }));
  npcs.push(makeNPC('waitress', M(20), M(37.5), { area: 'walkway', speed: 24, carry: 'tray', female: true }));
  npcs.push(makeNPC('waitress', M(60), M(12), { area: 'casino', speed: 24, carry: 'tray', female: true }));
  for (let i = 0; i < 12; i++) spawnAmbient('casino', i % 2 ? 'walkway' : 'casino', { drunk: i === 3, wait: rand(0, 6) });
  // standing groups: chatting, on the phone, drinking (partners look at each other and take turns talking)
  const groups = [[M(38.8), M(37.8)], [M(66), M(37.5)], [M(12), M(44.5)], [M(52), M(37.8)], [M(30), M(38)]];
  groups.forEach(([x, y], gi) => {
    if (gi === 2) { npcs.push(makeNPC('gambler', x, y, { face: rand(0, 6), activity: 'phone', baseAct: 'phone' })); return; }
    const a = makeNPC('gambler', x, y, { face: Math.PI / 2, activity: 'talk', baseAct: 'talk' });
    const b = makeNPC('gambler', x + 22, y, { face: -Math.PI / 2, activity: gi === 1 ? 'drink' : 'listen', baseAct: gi === 1 ? 'drink' : 'listen' });
    a.look = b; b.look = a; a.chat = { with: b, t: rand(5, 10) }; b.chat = { with: a, t: 0, follower: true };
    npcs.push(a, b);
    if (gi === 3) { // a third person joins the circle
      const c = makeNPC('gambler', x + 11, y + 18, { face: Math.PI, activity: 'listen', baseAct: 'listen', look: a });
      npcs.push(c);
    }
  });
  // dancers: the bar's floor and the lounge by the fountain, in the evening
  [[M(34.6), M(42.5)], [M(35.6), M(44)], [M(33.4), M(44.9)], [M(14), M(42.6)], [M(15.2), M(44)]].forEach(([x, y], i) => {
    if (hits(x, y, 12)) return;
    npcs.push(makeNPC('gambler', x, y, { face: rand(0, 6.28), dancer: true, female: i % 2 === 0, activity: null }));
  });
  const cb = OBJECTS.find(o => o.type === 'streetsleep');
  npcs.push(makeNPC('homeless', cb.x + cb.w + 20, cb.y + cb.h / 2, { face: 0, pose: 'sit', seated: true, seatY: 0, name: 'Eddie' }));
  for (let i = 0; i < 6; i++) spawnAmbient('street', 'street', { wait: rand(0, 5), activity: null });
  // couples strolling together on the walkways and the Strip
  for (let i = 0; i < 3; i++) spawnPair(i % 2 ? 'walkway' : 'street');
  // queues at the cashier and the buffet
  for (const type of ['cashier', 'buffet']) { const o = OBJECTS.find(q => q.type === type); if (o) for (let i = 0; i < 2; i++) { const n = spawnAmbient('casino', 'casino', { wait: 0 }); joinQueue(n, o); const q = queueSlot(o, o.q.indexOf(n)); n.x = q.x; n.y = q.y; n.face = q.face; } }
  npcs.forEach(n => { if (n.role === 'gambler' || n.role === 'pedestrian') n.ambient = n.ambient || false; });
}

let npcClock = 0, popT = 4, seatT = 20, queueT = 10, lastRounds = null, lastShot = false, shotHeard = false;
const isEvening = () => { const h = (S.minutes % 1440) / 60; return h >= 17.5 || h < 3; };
const hourNow = () => (S.minutes % 1440) / 60;

// An ambient wanderer (casino floor, walkways or the Strip). 'kind' is the role: casino gamblers, or pedestrians for the street.
function spawnAmbient(kind, area, opts = {}) {
  const p = randomWalkable(area);
  const role = kind === 'street' ? 'pedestrian' : 'gambler';
  const n = makeNPC(role, opts.x !== undefined ? opts.x : p.x, opts.y !== undefined ? opts.y : p.y, Object.assign({ area, ambient: true }, opts));
  npcs.push(n);
  return n;
}

// Two people walking together. The follower keeps alongside the leader and chats when they stop.
function spawnPair(area, at) {
  const p = at || randomWalkable(area);
  const role = area === 'street' ? 'pedestrian' : 'gambler';
  const a = makeNPC(role, p.x, p.y, { area, ambient: true, speed: rand(22, 27) });
  const b = makeNPC(role, p.x + 20, p.y, { area, ambient: true, speed: a.speed, follow: a, side: 1 });
  a.lead = b; a.look = null;
  npcs.push(a, b);
  return [a, b];
}

function joinQueue(n, o) {
  if (!o || !n) return;
  o.q = o.q || [];
  o.q.push(n);
  n.task = { type: 'queue', o };
  n.area = 'casino';
}
function queueSlot(o, i) {
  const s = seatOf(o);
  return { x: s.x - Math.sin(s.face) * 24 * i, y: s.y - Math.cos(s.face) * 24 * i, face: s.face };
}

// ---------------------------------------------------------------------------
// Movement helpers
// ---------------------------------------------------------------------------
function walkTo(n, tx, ty, speed, dt, run) {
  const vx = tx - n.x, vy = ty - n.y, d = Math.hypot(vx, vy);
  if (d < 2) return d;
  n.pose = run ? 'run' : 'walk';
  n.face = lerpAngle(n.face, Math.atan2(vx, vy), Math.min(1, dt * (run ? 9 : 6)));
  const sp = Math.min(d, speed * dt);
  if (!moveEntity(n, vx / d * sp, vy / d * sp, 10)) {
    // slide around whatever is in the way
    if (!moveEntity(n, -vy / d * sp * 0.8, vx / d * sp * 0.8, 10)) moveEntity(n, vy / d * sp * 0.8, -vx / d * sp * 0.8, 10);
    n.stuck = (n.stuck || 0) + dt;
  } else n.stuck = Math.max(0, (n.stuck || 0) - dt);
  return d;
}

// Keep walkers from walking through one another
function separate(n, dt) {
  const r = 17;
  for (const m of npcs) {
    if (m === n || m.pose === 'down' || m.seated) continue;
    const dx = n.x - m.x, dy = n.y - m.y, d2 = dx * dx + dy * dy;
    if (d2 > r * r || d2 < 0.01) continue;
    const d = Math.sqrt(d2), push = (r - d) * 2.2 * dt;
    moveEntity(n, dx / d * push, dy / d * push, 10);
  }
  const dx = n.x - player.x, dy = n.y - player.y, d = Math.hypot(dx, dy);
  if (d < 20 && d > 0.01) moveEntity(n, dx / d * (20 - d) * 2.5 * dt, dy / d * (20 - d) * 2.5 * dt, 10);
}

function pickNewTarget(n) {
  const p = randomWalkable(n.area);
  n.tx = p.x; n.ty = p.y; n.stuck = 0;
}

// ---------------------------------------------------------------------------
// Navigation: a coarse grid over the map and A*, so people find their way around
// counters and machine banks instead of walking into them.
// ---------------------------------------------------------------------------
const NAV = { cell: 16, w: 0, h: 0, ok: null, heapF: [], heapI: [] };
function navBuild() {
  const c = NAV.cell;
  NAV.w = Math.ceil(WORLD.w / c); NAV.h = Math.ceil(WORLD.h / c);
  NAV.ok = new Uint8Array(NAV.w * NAV.h);
  NAV.gs = new Float32Array(NAV.w * NAV.h); NAV.par = new Int32Array(NAV.w * NAV.h); NAV.seen = new Uint32Array(NAV.w * NAV.h); NAV.done = new Uint32Array(NAV.w * NAV.h); NAV.stamp = 0;
  for (let j = 0; j < NAV.h; j++) for (let i = 0; i < NAV.w; i++) NAV.ok[j * NAV.w + i] = hits((i + 0.5) * c, (j + 0.5) * c, 9) ? 0 : 1;
}
// is the straight line walkable? (looked up on the grid, which is cheap)
function clearLine(x0, y0, x1, y1) {
  if (!NAV.ok) navBuild();
  const c = NAV.cell, d = Math.hypot(x1 - x0, y1 - y0), st = Math.max(1, Math.ceil(d / 6));
  for (let i = 1; i <= st; i++) {
    const t = i / st, ci = Math.floor((x0 + (x1 - x0) * t) / c), cj = Math.floor((y0 + (y1 - y0) * t) / c);
    if (ci < 0 || cj < 0 || ci >= NAV.w || cj >= NAV.h || !NAV.ok[cj * NAV.w + ci]) return false;
  }
  return true;
}
function navCell(x, y) {
  const c = NAV.cell, ci = clamp(Math.floor(x / c), 0, NAV.w - 1), cj = clamp(Math.floor(y / c), 0, NAV.h - 1);
  if (NAV.ok[cj * NAV.w + ci]) return cj * NAV.w + ci;
  for (let r = 1; r <= 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = ci + di, j = cj + dj;
    if (i >= 0 && j >= 0 && i < NAV.w && j < NAV.h && NAV.ok[j * NAV.w + i]) return j * NAV.w + i;
  }
  return -1;
}
function heapPush(f, id) {
  const F = NAV.heapF, I = NAV.heapI; let k = F.length; F.push(f); I.push(id);
  while (k > 0) { const p = (k - 1) >> 1; if (F[p] <= F[k]) break; [F[p], F[k]] = [F[k], F[p]]; [I[p], I[k]] = [I[k], I[p]]; k = p; }
}
function heapPop() {
  const F = NAV.heapF, I = NAV.heapI, top = I[0], lf = F.pop(), li = I.pop();
  if (F.length) {
    F[0] = lf; I[0] = li; let k = 0;
    for (;;) {
      let l = 2 * k + 1, r = l + 1, m = k;
      if (l < F.length && F[l] < F[m]) m = l;
      if (r < F.length && F[r] < F[m]) m = r;
      if (m === k) break;
      [F[m], F[k]] = [F[k], F[m]]; [I[m], I[k]] = [I[k], I[m]]; k = m;
    }
  }
  return top;
}
// waypoints from (x0, y0) to (x1, y1), or null when there is no route
function findPath(x0, y0, x1, y1) {
  if (!NAV.ok) navBuild();
  const W_ = NAV.w, N = W_ * NAV.h, c = NAV.cell;
  const s = navCell(x0, y0), g = navCell(x1, y1);
  if (s < 0 || g < 0) return null;
  const gs = NAV.gs, par = NAV.par, seen = NAV.seen, done = NAV.done, stamp = ++NAV.stamp;
  const gx = g % W_, gy = (g / W_) | 0;
  NAV.heapF.length = 0; NAV.heapI.length = 0;
  gs[s] = 0; par[s] = -1; seen[s] = stamp; heapPush(0, s);
  let found = false, guard = 0;
  while (NAV.heapI.length && guard++ < 20000) {
    const cur = heapPop();
    if (done[cur] === stamp) continue;
    done[cur] = stamp;
    if (cur === g) { found = true; break; }
    const cx = cur % W_, cy = (cur / W_) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const nx = cx + di, ny = cy + dj;
      if (nx < 0 || ny < 0 || nx >= W_ || ny >= NAV.h) continue;
      const ni = ny * W_ + nx;
      if (!NAV.ok[ni] || done[ni] === stamp) continue;
      if (di && dj && (!NAV.ok[cy * W_ + nx] || !NAV.ok[ny * W_ + cx])) continue; // no corner cutting
      const ng = gs[cur] + (di && dj ? 1.414 : 1);
      if (seen[ni] !== stamp || ng < gs[ni]) { seen[ni] = stamp; gs[ni] = ng; par[ni] = cur; const h = Math.hypot(nx - gx, ny - gy); heapPush(ng + h, ni); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let k = g; k !== -1; k = par[k]) cells.push(k);
  cells.reverse();
  const pts = [{ x: x0, y: y0 }, ...cells.map(k => ({ x: (k % W_ + 0.5) * c, y: ((k / W_ | 0) + 0.5) * c })), { x: x1, y: y1 }];
  // string pulling: skip waypoints that can be walked past in a straight line
  const out = [];
  let a = 0;
  while (a < pts.length - 1) {
    let b = pts.length - 1;
    while (b > a + 1 && !clearLine(pts[a].x, pts[a].y, pts[b].x, pts[b].y)) b--;
    out.push(pts[b]); a = b;
  }
  return out;
}
// Walk toward (tx, ty) along a route around obstacles. Returns the distance left to the goal.
function navTo(n, tx, ty, speed, dt, run) {
  let nv = n.nav;
  if (!nv || Math.hypot(nv.tx - tx, nv.ty - ty) > 12 || ((n.stuck || 0) > 1.2 && nv.tries < 2)) {
    const tries = nv && Math.hypot(nv.tx - tx, nv.ty - ty) <= 12 ? nv.tries + 1 : 0;
    nv = n.nav = { tx, ty, i: 0, tries, path: clearLine(n.x, n.y, tx, ty) ? null : findPath(n.x, n.y, tx, ty) };
    n.stuck = 0;
  }
  let wx = tx, wy = ty;
  if (nv.path) {
    while (nv.i < nv.path.length - 1 && Math.hypot(nv.path[nv.i].x - n.x, nv.path[nv.i].y - n.y) < 10) nv.i++;
    if (nv.i < nv.path.length - 1) { wx = nv.path[nv.i].x; wy = nv.path[nv.i].y; }
  }
  walkTo(n, wx, wy, speed, dt, run);
  return Math.hypot(tx - n.x, ty - n.y);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
function endTask(n, wait = rand(1, 5)) {
  n.task = null; n.wait = wait;
  if (!n.area) n.area = n.role === 'pedestrian' ? 'street' : 'casino';
  pickNewTarget(n);
}

// returns true if the task handled this NPC for the frame
function runTask(n, dt) {
  const t = n.task;
  switch (t.type) {
    case 'sit': {
      const s = t.seat;
      if (!seatFree(s, n)) { endTask(n); return false; }
      const d = navTo(n, s.x, s.y, n.speed, dt);
      if (d < 4 || ((n.stuck || 0) > 1.2 && n.nav && n.nav.tries >= 2)) { if (d < 24) sitAt(n, s); else endTask(n); }
      return true;
    }
    case 'goto': {
      const d = navTo(n, t.x, t.y, t.speed || n.speed, dt);
      if (d < 4 || ((n.stuck || 0) > 1.2 && n.nav && n.nav.tries >= 2)) endTask(n);
      return true;
    }
    case 'queue': {
      const o = t.o, i = o.q.indexOf(n);
      if (i < 0) { endTask(n); return false; }
      const slot = queueSlot(o, i);
      const d = navTo(n, slot.x, slot.y, n.speed, dt);
      if (d < 3) {
        n.pose = 'stand'; n.face = lerpAngle(n.face, slot.face, Math.min(1, dt * 5));
        if (i === 0) {
          // being served: the player stepping up to the counter sends them on their way
          if (Math.hypot(player.x - slot.x, player.y - slot.y) < 28) { o.q.splice(0, 1); endTask(n, 0); return true; }
          n.servT = (n.servT === undefined ? rand(6, 11) : n.servT) - dt;
          n.activity = n.servT > 3 ? 'talk' : 'nod';
          if (n.servT <= 0) { n.servT = undefined; n.activity = null; o.q.splice(0, 1); n.task = null; n.area = 'casino'; n.wait = 0; pickNewTarget(n); }
        } else n.activity = n.qAct !== undefined ? n.qAct : (n.qAct = Math.random() < 0.3 ? 'phone' : Math.random() < 0.2 ? 'nervous' : null);
      } else n.activity = null;
      return true;
    }
    case 'gather': {
      if (npcClock > t.until) { n.activity = null; endTask(n, rand(1, 3)); return false; }
      const d = navTo(n, t.x, t.y, n.speed * 1.4, dt);
      if (d < 6 || ((n.stuck || 0) > 1.2 && n.nav && n.nav.tries >= 2)) {
        n.pose = 'stand';
        n.face = lerpAngle(n.face, Math.atan2(t.fx - n.x, t.fy - n.y), Math.min(1, dt * 6));
        n.activity = n.activity === 'clap' || n.activity === 'cheer' ? n.activity : (Math.random() < 0.6 ? 'clap' : 'cheer');
        t.swapT = (t.swapT || rand(3, 6)) - dt;
        if (t.swapT <= 0) { t.swapT = undefined; n.activity = n.activity === 'clap' ? 'cheer' : 'clap'; }
      }
      return true;
    }
    case 'flee': {
      if (npcClock > t.until) { n.activity = null; n.pose = 'stand'; endTask(n, rand(2, 5)); return false; }
      if (t.cower) { n.pose = 'stand'; n.activity = 'cower'; return true; }
      // run directly away from the shots
      const ax = n.x - t.x, ay = n.y - t.y, ad = Math.hypot(ax, ay) || 1;
      walkTo(n, n.x + ax / ad * 200 + (t.side || 0) * ay / ad * 60, n.y + ay / ad * 200 - (t.side || 0) * ax / ad * 60, 96, dt, true);
      if ((n.stuck || 0) > 1) { t.cower = true; }
      n.activity = null;
      return true;
    }
    case 'leave': {
      const d = navTo(n, t.x, t.y, n.speed, dt);
      if (d < 14 || ((n.stuck || 0) > 1.2 && n.nav && n.nav.tries >= 2)) { npcs = npcs.filter(m => m !== n); }
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
const SCREAMS = ['Gun!', 'Get down!', 'Run!', 'He has a gun!', 'Somebody call the police!', 'Oh my God!'];
function onGunshot(x, y, outside) {
  for (const n of npcs) {
    if (n.hostile || n.role === 'robber' || n.role === 'thug' || n.pose === 'down') continue;
    const d = Math.hypot(n.x - x, n.y - y);
    if (d > 720 || (isOutside(n) !== outside && d > 260)) continue;
    if (n.task && n.task.type === 'flee') continue;
    if (Math.random() > (d < 260 ? 1 : 0.55)) continue;
    if (n.role === 'guard' || n.role === 'police') { n.activity = 'radio'; n.actT = 6; n.look = { x, y, h: 1.5 }; n.lookT = 6; n.face = Math.atan2(x - n.x, y - n.y); continue; }
    if (Math.random() < 0.6) sayBubble(n, pick(SCREAMS), 3);
    if (n.seated || n.role === 'dealer' || n.role === 'bartender' || n.role === 'vendor' || n.role === 'clerk' || n.role === 'cashierClerk') {
      n.activity = 'cower'; n.actT = rand(6, 11);
      n.face = n.seated ? n.face : n.face;
      continue;
    }
    if (n.dancer) n.dancer = false;
    if (n.task && n.task.type === 'queue') { const q = n.task.o.q; const i = q.indexOf(n); if (i >= 0) q.splice(i, 1); }
    n.task = { type: 'flee', x, y, until: npcClock + rand(4, 8), cower: Math.random() < 0.3, side: Math.random() < 0.5 ? -1 : 1 };
    n.area = n.area || (n.role === 'pedestrian' ? 'street' : 'casino');
    n.activity = null;
  }
}

function detectGunfire() {
  // the player's own shots and the shots of robbers / thugs (fx entries with enemy = true)
  if (player.shootT > 0.44) { if (!lastShot) { lastShot = true; onGunshot(player.x, player.y, isOutside()); } } else if (player.shootT < 0.3) lastShot = false;
  if (typeof fx !== 'undefined') for (const f of fx) if (f.enemy && !f._heard) { f._heard = true; onGunshot(f.x1, f.y1, f.y1 > CASINO_BOTTOM); }
}

// Table reactions without touching the game code: every settled round shows up in the stats
let lastWin = 0;
function watchRounds(dt) {
  if (!S.stats) return;
  const rounds = S.stats.rounds, wag = S.stats.wagered, ret = S.stats.returned;
  if (lastRounds === null) { lastRounds = rounds; lastW = wag; lastR = ret; return; }
  if (rounds !== lastRounds) {
    const profit = (ret - lastR) - (wag - lastW);
    lastRounds = rounds; lastW = wag; lastR = ret;
    if (!(window.Render3D && Render3D.ready)) return;
    const table = OBJECTS.find(o => DEALER_TABLES.includes(o.type) && distToRect(player.x, player.y, o) < 70);
    if (table) {
      if (profit >= 25000) Render3D.tableReact(table, 'bigwin');
      else if (profit > 0) Render3D.tableReact(table, 'win');
      else if (profit < 0) Render3D.tableReact(table, 'lose');
      else { const d = npcs.find(n => n.role === 'dealer' && n.table === table); if (d) Render3D.dealerGesture(d, 'collect'); }
    } else if (profit > 0 && player.seated) {
      // slot players next door cheer for a good spin
      for (const n of npcs) if (n.seated && n.role === 'gambler' && Math.hypot(n.x - player.x, n.y - player.y) < 60 && Math.random() < 0.4) Render3D.react(n, 'cheer');
    }
  }
}
let lastW = 0, lastR = 0;

// ---------------------------------------------------------------------------
// Population, seats and queues
// ---------------------------------------------------------------------------
function populationTarget(kind) {
  const h = hourNow();
  if (kind === 'casino') return h >= 18 || h < 2 ? 22 : h < 6 ? 8 : h < 12 ? 10 : 15;
  return h >= 19 || h < 2 ? 14 : h < 6 ? 4 : h >= 11 && h < 17 ? 9 : 7;
}
// where new arrivals come in (out of the player's sight)
function entryFor(kind) {
  if (kind === 'casino') return [{ x: 900, y: 968 }, { x: M(45), y: 30 }, { x: M(2), y: M(37.6) }, { x: M(88), y: M(37.6) }];
  return [{ x: 40, y: 1100 }, { x: WORLD.w - 40, y: 1100 }];
}
function managePopulation(dt) {
  popT -= dt;
  if (popT > 0) return;
  popT = rand(6, 14);
  for (const kind of ['casino', 'street']) {
    const role = kind === 'street' ? 'pedestrian' : 'gambler';
    const mine = npcs.filter(n => n.ambient && n.role === role && !(n.task && n.task.type === 'leave'));
    const target = populationTarget(kind);
    if (mine.length < target) {
      const spots = entryFor(kind).filter(p => Math.hypot(p.x - player.x, p.y - player.y) > 420);
      if (!spots.length) continue;
      const p = pick(spots);
      const area = kind === 'street' ? 'street' : pick(['casino', 'walkway']);
      const n = Math.random() < 0.25 ? spawnPair(kind === 'street' ? 'street' : 'walkway', p)[0] : spawnAmbient(kind, area, { x: p.x, y: p.y, wait: 0 });
      if (isEvening() && Math.random() < 0.15) n.drunk = true;
      if (n.follow && isEvening()) n.follow.drunk = n.drunk;
    } else if (mine.length > target) {
      // someone far from the player heads for the exit
      const far = mine.filter(n => !n.task && !n.chat && Math.hypot(n.x - player.x, n.y - player.y) > 450 && !n.lead && !n.follow);
      for (let k = Math.min(far.length, Math.ceil((mine.length - target) / 5)); k > 0; k--) {
        const n = far.splice(Math.floor(Math.random() * far.length), 1)[0];
        const ex = kind === 'street' ? (n.x < 900 ? -30 : WORLD.w + 30) : 900;
        const ey = kind === 'street' ? 1100 : 1000;
        n.task = { type: 'leave', x: ex, y: ey };
      }
    }
  }
}

// Share of the seats that are taken: fuller in the evening
function seatTarget() { const h = hourNow(); return h >= 18 || h < 2 ? 0.4 : h < 6 ? 0.16 : 0.3; }
function seatedCount() { return npcs.reduce((c, n) => c + (n.seated && n.role === 'gambler' && n.seatRef ? 1 : 0), 0); }

function manageSeats(dt) {
  const occ = seatedCount() / Math.max(1, SEATS.length);
  const target = seatTarget();
  // people get up after a while (more readily when the room is over-full)
  for (const n of npcs) {
    if (!n.seated || n.sitT === undefined || n.role !== 'gambler') continue;
    n.sitT -= dt;
    if (n.sitT > 0) continue;
    if (occ < target || (player.seated && Math.hypot(n.x - player.x, n.y - player.y) < 60)) { n.sitT = rand(30, 90); continue; } // keep the room (and the player) company
    const s = n.seatRef;
    n.seated = false; n.pose = 'stand'; n.seatY = 0; n.sitT = undefined; n.activity = null;
    n.area = 'casino'; n.ambient = true; n.wait = 0;
    const back = s ? { x: s.x - Math.sin(s.face) * 34, y: s.y - Math.cos(s.face) * 34 } : { x: n.x, y: n.y + 30 };
    n.task = { type: 'goto', x: back.x, y: back.y };
    n.seatRef = null;
  }
  // and others take the empty seats; when the room is thin, newcomers come in and sit down
  seatT -= dt;
  if (seatT > 0) return;
  seatT = occ < target ? rand(2, 5) : rand(20, 40);
  if (occ >= target) return;
  const free = SEATS.filter(q => seatFree(q));
  if (!free.length) return;
  const cand = npcs.filter(n => n.role === 'gambler' && n.area && !n.task && !n.chat && !n.follow && !n.lead && !n.dancer && !n.seated);
  let n = cand.length ? pick(cand) : null;
  let near = n ? free.filter(s => Math.hypot(s.x - n.x, s.y - n.y) < 1000) : [];
  if (!n || !near.length || Math.random() < 0.3) {
    // a newcomer arrives at the door (out of the player's sight)
    const spots = entryFor('casino').filter(p => Math.hypot(p.x - player.x, p.y - player.y) > 420);
    if (!spots.length) return;
    const p = pick(spots);
    n = spawnAmbient('casino', 'casino', { x: p.x, y: p.y, wait: 0 });
    near = free.filter(s => Math.hypot(s.x - n.x, s.y - n.y) < 1400);
    if (!near.length) return;
  }
  n.task = { type: 'sit', seat: pick(near) };
}

function manageQueues(dt) {
  queueT -= dt;
  if (queueT > 0) return;
  queueT = rand(10, 24);
  for (const type of ['cashier', 'buffet']) {
    const o = OBJECTS.find(q => q.type === type);
    if (!o || !o.q || o.q.length >= 4 || Math.random() < 0.4) continue;
    const cand = npcs.filter(n => n.role === 'gambler' && n.ambient && n.area && !n.task && !n.follow && !n.lead && !n.chat && !n.dancer && Math.hypot(n.x - o.x, n.y - o.y) < 1000);
    if (cand.length) joinQueue(pick(cand), o);
  }
}

// ---------------------------------------------------------------------------
function makeLookAtPlayer(n, secs) { n.look = player; n.lookT = secs; }

function sayBubble(n, text, secs = 4) { n.bubble = text; n.bubbleT = secs; }

let chatterT = 3;
function updateNPCs(dt) {
  npcClock += dt;
  detectGunfire();
  watchRounds(dt);
  managePopulation(dt);
  manageSeats(dt);
  manageQueues(dt);
  const evening = isEvening();
  for (const n of npcs) {
    n.anim += dt;
    if (n.bubbleT > 0) { n.bubbleT -= dt; if (n.bubbleT <= 0) n.bubble = null; }
    if (n.lookT > 0) { n.lookT -= dt; if (n.lookT <= 0) n.look = n.baseLook || null; }
    if (n.actT > 0) { n.actT -= dt; if (n.actT <= 0) n.activity = n.baseAct || null; }
    if (n.hostile || n.role === 'robber' || n.role === 'thug') continue; // combat.js drives these
    if (n.pose === 'down') continue;
    if (n.dancer && !n.task) { n.activity = evening ? 'dance' : (n.actT > 0 ? n.activity : null); n.pose = 'stand'; continue; }
    // talking partners take turns
    if (n.chat && !n.chat.follower && !n.task) {
      n.chat.t -= dt;
      const b = n.chat.with;
      if (n.chat.t <= 0 && b && b.baseAct !== 'drink' && n.actT <= 0 && b.actT <= 0) {
        n.chat.t = rand(5, 12);
        const swap = n.baseAct === 'talk';
        n.baseAct = n.activity = swap ? 'listen' : 'talk';
        b.baseAct = b.activity = swap ? 'talk' : 'listen';
      }
    }
    if (n.task && runTask(n, dt)) { if (n.pose === 'walk' || n.pose === 'run') separate(n, dt); continue; }
    if (!n.area) { n.pose = n.seated ? 'sit' : 'stand'; continue; }
    if (n.follow) { followLeader(n, dt); continue; }
    if (n.wait > 0) {
      n.wait -= dt; n.pose = 'stand';
      if (n.lead) { n.activity = n.lead.wait > 0 || n.lead.follow ? n.activity : n.activity; }
      // a moment on the phone
      if (n.role === 'pedestrian' && n.waitAct === undefined && n.wait > 2) n.waitAct = Math.random() < 0.35 ? pick(['phone', 'text']) : null;
      if (n.waitAct && n.wait > 0) n.activity = n.waitAct;
      if (n.wait <= 0 && n.waitAct !== undefined) { n.waitAct = undefined; n.activity = n.baseAct || null; }
      continue;
    }
    const d = Math.hypot(n.tx - n.x, n.ty - n.y);
    if (d < 4 || ((n.stuck || 0) > 1.2 && n.nav && n.nav.tries >= 2)) {
      n.wait = rand(1.5, 7);
      pickNewTarget(n); n.nav = null;
      n.pose = 'stand';
      continue;
    }
    if (n.activity && !n.baseAct && !n.waitAct) n.activity = null;
    navTo(n, n.tx, n.ty, n.speed, dt);
    separate(n, dt);
  }

  // Ambient chatter near the player
  chatterT -= dt;
  if (chatterT <= 0) {
    chatterT = rand(3, 6);
    const near = npcs.filter(n => !n.bubble && !n.hostile && n.pose !== 'down' && AMBIENT[n.role] &&
      Math.hypot(n.x - player.x, n.y - player.y) < 320);
    if (near.length) { const n = pick(near); sayBubble(n, pick(AMBIENT[n.role])); }
  }
}

// The follower of a walking pair keeps alongside the leader and talks with them when they stop
function followLeader(n, dt) {
  const L = n.follow;
  if (!L || !npcs.includes(L)) { n.follow = null; n.side = 0; pickNewTarget(n); return; }
  const fx_ = Math.sin(L.face), fy_ = Math.cos(L.face);
  const tx = L.x + fy_ * 22 * (n.side || 1) - fx_ * 6, ty = L.y - fx_ * 22 * (n.side || 1) - fy_ * 6;
  const d = Math.hypot(tx - n.x, ty - n.y);
  const leaderMoving = L.pose === 'walk';
  if (leaderMoving || d > 34) {
    n.activity = null;
    const sp = d > 30 ? L.speed * 1.35 : Math.min(L.speed * 1.1, d * 4 + 6);
    if (d > 4) walkTo(n, tx, ty, sp, dt); else { n.pose = 'walk'; n.face = lerpAngle(n.face, L.face, Math.min(1, dt * 5)); moveEntity(n, fx_ * L.speed * dt, fy_ * L.speed * dt, 10); }
    separate(n, dt);
  } else {
    n.pose = 'stand';
    n.face = lerpAngle(n.face, Math.atan2(L.x - n.x, L.y - n.y), Math.min(1, dt * 4));
    L.face = lerpAngle(L.face, Math.atan2(n.x - L.x, n.y - L.y), Math.min(1, dt * 2));
    n.look = L; L.look = n;
    n.chatT = (n.chatT || 0) - dt;
    if (n.chatT <= 0) { n.chatT = rand(4, 9); const a = Math.random() < 0.5; n.activity = a ? 'talk' : 'listen'; L.activity = a ? 'listen' : 'talk'; }
  }
  if (leaderMoving) { L.activity = null; n.look = null; L.look = null; }
}

const AMBIENT = {
  gambler: ['Come on, lucky seven!', 'Just one more spin…', "I'm due for a win!", 'Daddy needs a new pair of shoes!', 'Not again…',
    "It's gotta hit soon.", 'Where did the night go?', 'Hit me!', 'I was up twenty grand an hour ago…', 'ATM, be right back.'],
  dealer: ['Place your bets.', 'No more bets!', 'Good luck, folks.', 'Winner on the table.', 'Dealer wins.'],
  waitress: ['Cocktails? Cocktails!', 'Complimentary drinks for players!', 'Can I get you anything?'],
  guard: ['Keep it moving.', 'Evening.', 'No photos on the floor, please.'],
  pedestrian: ['Vegas, baby!', 'Where is my hotel again?', 'I just lost my rent money…', 'Hey, watch it!', "What a night."],
  homeless: ['Spare some change?', 'God bless.', 'Cold one tonight…'],
  bartender: ['What can I get you?', 'Last call is never.'],
  vendor: ['Hot dogs! Get your hot dogs!', 'Buffet is open!'],
};

// A big win: everyone nearby cheers, and a crowd gathers around the winner and claps
function crowdReact() {
  const gatherers = [];
  npcs.forEach(n => {
    if (!(n.role === 'gambler' || n.role === 'dealer' || n.role === 'waitress') || n.hostile || n.pose === 'down') return;
    const d = Math.hypot(n.x - player.x, n.y - player.y);
    if (d > 720) return;
    if (d < 260) {
      sayBubble(n, pick(['Whoa!', 'Nice hit!', 'Lucky!', 'Let it ride!', 'Share the love!', 'Big winner!']), 5);
      if (window.Render3D && Render3D.ready && n.role !== 'dealer') Render3D.react(n, Math.random() < 0.5 ? 'cheer' : 'clap');
      n.look = player; n.lookT = 5;
    }
    if (n.area && !n.seated && n.role === 'gambler' && !n.dancer && !(n.task && n.task.type !== 'goto')) gatherers.push([d, n]);
  });
  gatherers.sort((a, b) => a[0] - b[0]);
  let k = 0;
  for (const [, n] of gatherers) {
    if (k >= 8) break;
    let spot = null;
    for (let tries = 0; tries < 10 && !spot; tries++) {
      const a = k * 2.4 + rand(-0.3, 0.3) + tries * 0.7, r = 40 + ((k + tries) % 3) * 16;
      const x = player.x + Math.sin(a) * r, y = player.y + Math.cos(a) * r;
      if (!hits(x, y, 10) && !npcs.some(m => m !== n && m.task && m.task.type === 'gather' && Math.hypot(m.task.x - x, m.task.y - y) < 20)) spot = { x, y };
    }
    if (!spot) continue;
    n.task = { type: 'gather', x: spot.x, y: spot.y, fx: player.x, fy: player.y, until: npcClock + rand(14, 24) };
    n.area = n.area || 'casino'; k++;
  }
  lesson('marked', 'People noticed your big win. Word travels fast. Robbers look for people carrying winnings outside at night.');
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
const GAMBLER_LINES = [
  "I've been here fourteen hours. I'm due for a big one, I can feel it.",
  "Don't tell my wife I'm here. I told her I was at a conference.",
  'I was up $40,000 last night. Then I kept playing…',
  "See that machine? It hasn't paid out all day. It's gotta hit soon!",
  'My system never fails. Double after every loss! …I\'m just having a bad run.',
  'I only came for the free buffet. That was three days ago.',
  'You notice there are no clocks in here? What time is it, anyway?',
  'I lost my house because of this place. I still come back. Don\'t know why.',
  'Diamond status, baby! They comp my room. …I lost $300,000 to get it.',
  'The trick is to quit while you\'re ahead. I\'ll quit right after this next win.',
];
const PED_LINES = [
  'You heading into the Golden Mirage? Good luck, you\'ll need it.',
  'Watch your wallet around here at night. Muggers wait outside the casinos.',
  'Just lost my rent money. Great trip. Really great.',
  'My buddy borrowed from some guy named Tony. Haven\'t seen him since.',
  'Vegas wasn\'t built on winners, pal.',
];

function talkDialog(n, line, buttons = []) {
  n.face = Math.atan2(player.x - n.x, player.y - n.y);
  player.face = Math.atan2(n.x - player.x, n.y - player.y);
  n.look = player; n.lookT = 10;
  sayBubble(n, line.length > 40 ? line.slice(0, 38) + '…' : line, 4);
  const roleName = { gambler: 'Gambler', dealer: 'Dealer', waitress: 'Cocktail waitress', guard: 'Casino security',
    homeless: 'Homeless man', pedestrian: 'Pedestrian' }[n.role] || '';
  infoDialog(`💬 ${n.name}`, `<div class="talk"><div class="talk-role">${roleName}</div><p class="talk-line">"${line}"</p></div>`, buttons);
}

function talkTo(n) {
  if (blocked()) return;
  clearMovement();
  if (n.service) {
    n.face = Math.atan2(player.x - n.x, player.y - n.y);
    const t = OBJECTS.find(o => o.type === n.service);
    if (t) return interact(t);
  }
  switch (n.role) {
    case 'gambler': {
      const line = pick(GAMBLER_LINES);
      const borrow = Math.random() < 0.25;
      if (borrow) {
        talkDialog(n, "Hey, you look lucky. Lend me $200? I'll pay you back double, I swear.", [
          { label: 'Lend $200', fn: () => {
            if (!pay(200)) return;
            closeModal(true);
            sayBubble(n, 'You\'re a lifesaver!', 4);
            toast(`${n.name} takes your $200 straight to the slot machines. You never see it again.`);
            afterAction();
          } },
        ]);
      } else talkDialog(n, line);
      break;
    }
    case 'dealer': {
      const lines = [
        'Welcome to my table. Minimum bets are posted. Good luck.',
        "Between you and me? Nobody beats this table in the long run. I just deal the cards.",
        'The house thanks you for your business.',
        "Tips are appreciated. They come out of your stack, of course.",
      ];
      talkDialog(n, pick(lines), [
        { label: 'Play this table', cls: 'primary', fn: () => { closeModal(true); interact(n.table); } },
        { label: 'Tip $100', fn: () => {
          if (!pay(100)) return;
          closeModal(true); sayBubble(n, 'Thank you, sir!', 3); afterAction();
        } },
      ]);
      break;
    }
    case 'waitress': {
      const free = hasTier('Silver');
      talkDialog(n, free ? 'Complimentary cocktail for our Silver members?' : "Drinks are complimentary for rewards members. Otherwise it's $12.", [
        { label: free ? 'Cocktail (free)' : 'Cocktail ($12)', cls: 'primary', fn: () => {
          if (free) S.stats.compsValue += 12; else if (!pay(12)) return;
          eat(0, 20, -5, 5); closeModal(true); sayBubble(n, 'Enjoy! Good luck out there.', 3);
          lesson('alcohol', 'Casinos hand out free alcohol because drinking lowers your inhibitions and makes you bet bigger.');
        } },
        { label: free ? 'Water (free)' : 'Water ($4)', fn: () => {
          if (!free && !pay(4)) return;
          eat(0, 30, 0, 3); closeModal(true);
        } },
      ]);
      break;
    }
    case 'guard': {
      let line = 'Evening. Keep it civil and we won\'t have a problem.';
      if (S.equipped) line = 'I see that piece. Keep it holstered in here, or you\'re out on the street.';
      else if (sharkOverdue()) line = 'Couple of guys in leather jackets were asking about you. I\'d watch my back if I were you.';
      else if (S.cash < CONFIG.BROKE_THRESHOLD) line = "Rough night? You wouldn't be the first. Don't go borrowing from the wrong people.";
      talkDialog(n, line);
      break;
    }
    case 'homeless': {
      const broke = S.cash < CONFIG.BROKE_THRESHOLD;
      const line = broke
        ? "Soup kitchen next door serves a hot meal once a day. Tell 'em Eddie sent you. And stay off Tony's books."
        : pick(['Spare some change, friend? I was a Diamond member once. Now look at me.',
          'I had a house, a wife, a boat. Lost it all in there, one "sure thing" at a time.',
          "Careful after dark. The muggers wait for folks who won big inside."]);
      talkDialog(n, line, broke ? [] : [
        { label: 'Give $20', fn: () => { if (!pay(20)) return; closeModal(true); sayBubble(n, 'God bless you.', 4); afterAction(); } },
        { label: 'Give $500', fn: () => {
          if (!pay(500)) return; closeModal(true); sayBubble(n, 'I… thank you. Truly.', 5);
          toast("Eddie: \"Listen. Get out of this town while you still have something.\"");
          afterAction();
        } },
      ]);
      break;
    }
    case 'pedestrian':
      talkDialog(n, pick(PED_LINES));
      break;
    default:
      talkDialog(n, '…');
  }
}
