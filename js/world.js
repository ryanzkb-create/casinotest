'use strict';

// ---------------------------------------------------------------------------
// Map layout (in "map units"; the 3D renderer converts 20 units = 1 metre)
// ---------------------------------------------------------------------------
const WORLD = { w: 1800, h: 1240 };
const CASINO_BOTTOM = 990;
const DOOR = { x1: 850, x2: 950 };

const ZONES = [
  { x: 0, y: 0, w: 1800, h: 1004, color: '#2b0d16', floor: 'carpet' },
  { x: 30, y: 30, w: 560, h: 560, color: '#3a1450', label: 'SLOT MACHINES', floor: 'carpetPurple' },
  { x: 620, y: 30, w: 440, h: 260, color: '#4a3a0a', label: 'HIGH LIMIT ROOM', floor: 'marbleGold' },
  { x: 620, y: 330, w: 740, h: 560, color: '#0f3a24', label: 'TABLE GAMES', floor: 'carpetGreen' },
  { x: 1400, y: 30, w: 370, h: 380, color: '#4a2a10', label: 'FOOD COURT', floor: 'tiles' },
  { x: 1400, y: 440, w: 370, h: 220, color: '#102a4a', label: 'THE LUCKY BAR', floor: 'wood' },
  { x: 1400, y: 690, w: 370, h: 290, color: '#333642', label: 'HOTEL LOBBY', floor: 'marble' },
  { x: 30, y: 620, w: 560, h: 360, color: '#2a2034', label: 'CASHIER & LOUNGE', floor: 'carpetBlue' },
  { x: 0, y: 1004, w: 1800, h: 126, color: '#5b5b60', label: 'THE STRIP', floor: 'sidewalk' },
];

const OBJECTS = [];
function addObj(o) {
  if (o.solid === undefined) o.solid = true;
  OBJECTS.push(o);
  return o;
}

function buildWorld() {
  OBJECTS.length = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 6; c++)
      addObj({ x: 64 + c * 86, y: 78 + r * 104, w: 44, h: 46, type: 'slots', emoji: '🎰', color: '#6b2a8a' });

  addObj({ x: 660, y: 100, w: 170, h: 80, type: 'blackjack_hl', emoji: '🃏', label: 'VIP Blackjack', color: '#1d6b3a' });
  addObj({ x: 860, y: 100, w: 170, h: 80, type: 'baccarat_hl', emoji: '🀄', label: 'VIP Baccarat', color: '#1d6b3a' });

  addObj({ x: 660, y: 390, w: 170, h: 90, type: 'roulette', emoji: '🎯', label: 'Roulette', color: '#1d6b3a' });
  addObj({ x: 890, y: 390, w: 170, h: 90, type: 'blackjack', emoji: '🃏', label: 'Blackjack', color: '#1d6b3a' });
  addObj({ x: 1120, y: 390, w: 170, h: 90, type: 'blackjack', emoji: '🃏', label: 'Blackjack', color: '#1d6b3a' });
  addObj({ x: 660, y: 600, w: 200, h: 100, type: 'craps', emoji: '🎲', label: 'Craps', color: '#1d6b3a' });
  addObj({ x: 920, y: 600, w: 170, h: 90, type: 'baccarat', emoji: '🀄', label: 'Baccarat', color: '#1d6b3a' });
  addObj({ x: 1150, y: 590, w: 120, h: 110, type: 'bigsix', emoji: '🎡', label: 'Big Six Wheel', color: '#7a2a1a' });

  addObj({ x: 1430, y: 90, w: 100, h: 55, type: 'hotdog', emoji: '🌭', label: 'Hot Dogs', color: '#8a5a1a' });
  addObj({ x: 1570, y: 90, w: 170, h: 55, type: 'buffet', emoji: '🍱', label: 'Buffet', color: '#8a5a1a' });
  addObj({ x: 1430, y: 260, w: 150, h: 60, type: 'steak', emoji: '🥩', label: 'Steakhouse', color: '#6a2a1a' });
  addObj({ x: 1640, y: 250, w: 60, h: 60, emoji: '🪑', color: '#5a3a20', decor: 'diningTable' });

  addObj({ x: 1430, y: 520, w: 310, h: 50, type: 'bar', emoji: '🍸', label: 'Bar', color: '#2a4a7a' });

  addObj({ x: 1440, y: 780, w: 200, h: 50, type: 'hotel', emoji: '🛎️', label: 'Front Desk', color: '#555a70' });
  addObj({ x: 1680, y: 720, w: 60, h: 70, emoji: '🛗', color: '#444', decor: 'elevator' });

  addObj({ x: 60, y: 670, w: 200, h: 60, type: 'cashier', emoji: '💰', label: 'Cashier Cage', color: '#6a5a2a' });
  addObj({ x: 300, y: 670, w: 50, h: 60, type: 'atm', emoji: '🏧', label: 'ATM', color: '#3a4a5a' });
  addObj({ x: 400, y: 680, w: 40, h: 40, type: 'fountain', emoji: '🚰', label: 'Water', color: '#2a5a7a' });
  addObj({ x: 480, y: 660, w: 80, h: 50, type: 'poster', emoji: '📋', label: 'Help Poster', color: '#6a6a6a' });
  addObj({ x: 70, y: 860, w: 130, h: 44, type: 'noclock', emoji: '🪟', label: 'Where are the clocks?', color: '#3a3a4a' });
  addObj({ x: 300, y: 850, w: 160, h: 60, emoji: '🛋️', color: '#4a2a3a', decor: 'sofa' });

  // Casino front wall with the entrance
  addObj({ x: 0, y: CASINO_BOTTOM, w: DOOR.x1, h: 14, color: '#111', wall: true });
  addObj({ x: DOOR.x2, y: CASINO_BOTTOM, w: 1800 - DOOR.x2, h: 14, color: '#111', wall: true });

  // Street
  addObj({ x: 90, y: 1036, w: 100, h: 40, type: 'streetsleep', emoji: '📦', label: 'Cardboard spot', color: '#7a6a4a' });
  addObj({ x: 330, y: 1020, w: 200, h: 56, type: 'soup', emoji: '🍲', label: 'Soup Kitchen', color: '#4a6a4a' });
  addObj({ x: 620, y: 1020, w: 160, h: 56, type: 'pawn', emoji: '💍', label: 'Pawn Shop', color: '#6a4a6a' });
  addObj({ x: 1120, y: 1036, w: 36, h: 36, type: 'tap', emoji: '🚰', label: 'Public tap', color: '#2a5a7a' });
  addObj({ x: 1250, y: 1020, w: 180, h: 56, type: 'gunstore', emoji: '🔫', label: 'Gun Store', color: '#5a4a2a' });
  addObj({ x: 1580, y: 1024, w: 140, h: 52, type: 'busstop', emoji: '🚏', label: 'Bus out of town', color: '#2a6a5a' });
  addObj({ x: 0, y: 1130, w: 1800, h: 110, color: '#1e1e22', road: true });
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
const PLAYER_R = 11;
const player = { x: 900, y: 1104, speed: 160, face: Math.PI, moving: false, target: null, anim: 0, pose: 'stand', shootT: 0 };
let npcs = [];
let cars = [];
const view = { yaw: 0, zoom: 1 }; // camera yaw (0 = looking north into the casino)

function resetEntities() {
  player.x = 900; player.y = 1104; player.target = null; player.face = Math.PI; player.pose = 'stand';
  view.yaw = 0;
  spawnNPCs();
  cars = [];
  const CAR_COLORS = ['#c0392b', '#1f3a93', '#f1c40f', '#ecf0f1', '#111111', '#7f8c8d', '#16a085', '#8e44ad'];
  for (let i = 0; i < 7; i++) cars.push({
    x: rand(0, WORLD.w), lane: i % 4, speed: rand(160, 300),
    color: i === 0 ? '#f5c518' : pick(CAR_COLORS), kind: i === 0 ? 'taxi' : pick(['sedan', 'sedan', 'suv', 'sport']),
  });
  if (typeof resetCombat === 'function') resetCombat();
}

function hits(x, y, r = PLAYER_R) {
  if (x - r < 0 || y - r < 0 || x + r > WORLD.w || y + r > WORLD.h) return true;
  for (const o of OBJECTS) {
    if (!o.solid) continue;
    if (x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h) return true;
  }
  return false;
}

function randomWalkable(area) {
  for (let i = 0; i < 200; i++) {
    const x = rand(40, WORLD.w - 40);
    const y = area === 'street' ? rand(1082, 1118) : rand(40, CASINO_BOTTOM - 30);
    if (!hits(x, y, 14)) return { x, y };
  }
  return { x: 900, y: 930 };
}

function moveEntity(e, dx, dy, r = PLAYER_R) {
  let moved = false;
  if (dx && !hits(e.x + dx, e.y, r)) { e.x += dx; moved = true; }
  if (dy && !hits(e.x, e.y + dy, r)) { e.y += dy; moved = true; }
  return moved;
}

function distToRect(x, y, o) {
  const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
  return Math.hypot(x - cx, y - cy);
}

function isOutside(e = player) { return e.y > CASINO_BOTTOM; }

// Nearest thing you can use: an object or a person to talk to.
function nearbyTarget() {
  let best = null, bd = 30;
  for (const o of OBJECTS) {
    if (!o.type) continue;
    const d = distToRect(player.x, player.y, o) - PLAYER_R;
    if (d < bd) { bd = d; best = o; }
  }
  for (const n of npcs) {
    if (!n.talk || n.pose === 'down') continue;
    const d = Math.hypot(n.x - player.x, n.y - player.y) - PLAYER_R - 12;
    if (d < bd - 4) { bd = d; best = n; }
  }
  return best;
}
const nearbyObject = nearbyTarget;

function targetLabel(t) {
  if (t.role) return `Talk to ${t.name}`;
  return interactLabel(t);
}

function useTarget(t) {
  if (t.role) talkTo(t);
  else interact(t);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = {};
function clearMovement() {
  for (const k in keys) keys[k] = false;
  player.target = null;
}

function blocked() { return modalOpen || phoneOpen || screenOpen || S.ended; }

function setupInput() {
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (screenOpen) return;
    if (k === 'escape') {
      if (phoneOpen) closePhone(); else if (modalOpen) closeModal();
      return;
    }
    if (modalOpen) return;
    if (k === 'p') { togglePhone(); return; }
    if (phoneOpen) return;
    keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (k === 'e' || k === ' ' || k === 'enter') {
      const t = nearbyTarget();
      if (t) useTarget(t);
    }
    if (k === 'f') fireWeapon();
    if (k === 'q') cycleWeapon();
    if (k === 'c') view.zoom = view.zoom > 1.2 ? 0.7 : view.zoom < 0.9 ? 1 : 1.6;
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', clearMovement);

  // Pointer: drag to turn the camera, tap to walk/use
  const surfaces = [document.getElementById('game'), document.getElementById('game3d')];
  let drag = null;
  const pinch = new Map();
  surfaces.forEach(cv => {
    if (!cv) return;
    cv.addEventListener('pointerdown', e => {
      if (blocked()) return;
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      if (!drag || blocked()) return;
      if (pinch.size === 2 && pinch.has(e.pointerId)) {
        const [a, b] = [...pinch.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [c, d] = [...pinch.values()];
        const after = Math.hypot(c.x - d.x, c.y - d.y);
        view.zoom = clamp(view.zoom * before / Math.max(1, after), 0.5, 2.2);
        drag.moved = true;
        return;
      }
      if (e.pointerId !== drag.id) return;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
      if (drag.moved) view.yaw -= (e.clientX - drag.x) * 0.006;
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const up = e => {
      pinch.delete(e.pointerId);
      if (!drag || e.pointerId !== drag.id) return;
      const wasTap = !drag.moved;
      drag = null;
      if (wasTap && !blocked()) tapAt(e.clientX, e.clientY);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', e => { pinch.delete(e.pointerId); drag = null; });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      view.zoom = clamp(view.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.5, 2.2);
    }, { passive: false });
  });

  $('#prompt').addEventListener('click', () => {
    const t = nearbyTarget();
    if (t && !blocked()) useTarget(t);
  });
}

function tapAt(cx, cy) {
  let hit;
  if (window.Render3D && Render3D.ready) hit = Render3D.pick(cx, cy);
  else {
    const wx = cx + camera2d.x, wy = cy + camera2d.y;
    hit = { x: wx, y: wy, target: OBJECTS.find(o => o.type && wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h) || null };
  }
  if (!hit) return;
  const t = hit.target;
  if (t && t.hostile) { fireWeapon(t); return; }
  if (t) {
    const near = t.role ? Math.hypot(t.x - player.x, t.y - player.y) < 45 : distToRect(player.x, player.y, t) - PLAYER_R < 30;
    if (near) { useTarget(t); return; }
    if (t.role) player.target = { x: t.x, y: t.y, obj: t };
    else player.target = {
      x: clamp(player.x, t.x - 16, t.x + t.w + 16),
      y: clamp(player.y, t.y - 16, t.y + t.h + 16), obj: t,
    };
  } else player.target = { x: hit.x, y: hit.y, obj: null };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
let stuckTime = 0;
function updateWorld(dt) {
  let ix = 0, iy = 0;
  if (keys['w'] || keys['arrowup']) iy -= 1;
  if (keys['s'] || keys['arrowdown']) iy += 1;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;

  let dx = 0, dy = 0;
  if (ix || iy) {
    player.target = null;
    // camera-relative: forward = away from camera
    const fx = -Math.sin(view.yaw), fy = -Math.cos(view.yaw);
    const rx = Math.cos(view.yaw), ry = -Math.sin(view.yaw);
    dx = rx * ix + fx * -iy;
    dy = ry * ix + fy * -iy;
  }

  if (player.target) {
    const t = player.target;
    const arrived = t.obj && (t.obj.role
      ? Math.hypot(t.obj.x - player.x, t.obj.y - player.y) < 40
      : distToRect(player.x, player.y, t.obj) - PLAYER_R < 28);
    if (arrived) {
      player.target = null;
      useTarget(t.obj);
    } else {
      const tx = t.obj && t.obj.role ? t.obj.x : t.x, ty = t.obj && t.obj.role ? t.obj.y : t.y;
      const vx = tx - player.x, vy = ty - player.y, d = Math.hypot(vx, vy);
      if (d < 4) player.target = null;
      else { dx = vx / d; dy = vy / d; }
    }
  }

  const run = keys['shift'] ? 1.5 : 1;
  const speed = player.speed * run * (S.energy < 20 ? 0.6 : 1) * (S.health < 30 ? 0.7 : 1);
  player.moving = false;
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    let moved = moveEntity(player, dx / len * speed * dt, dy / len * speed * dt);
    if (!moved && player.target) {
      const base = Math.atan2(dy, dx);
      for (const off of [0.8, -0.8, 1.57, -1.57]) {
        const a = base + off;
        if (moveEntity(player, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt)) { moved = true; break; }
      }
    }
    player.moving = moved;
    const want = Math.atan2(dx, dy);
    player.face = lerpAngle(player.face, want, Math.min(1, dt * 12));
    if (!moved && player.target) {
      stuckTime += dt;
      if (stuckTime > 0.6) { player.target = null; stuckTime = 0; }
    } else stuckTime = 0;
  }
  player.anim += dt * (player.moving ? speed / 20 : 1);
  player.pose = player.shootT > 0 ? 'aim' : player.moving ? (run > 1 ? 'run' : 'walk') : 'stand';
  player.shootT = Math.max(0, player.shootT - dt);

  updateNPCs(dt);

  for (const c of cars) {
    c.x += (c.lane < 2 ? -1 : 1) * c.speed * dt;
    if (c.x > WORLD.w + 200) c.x = -200;
    if (c.x < -200) c.x = WORLD.w + 200;
  }

  updateCombat(dt);
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------------------------------------------------------------------------
// Rendering (3D when available; simple 2D fallback otherwise)
// ---------------------------------------------------------------------------
const camera2d = { x: 0, y: 0, w: 0, h: 0 };
let ctx = null;

function resizeCanvas() {
  const canvas = document.getElementById('game');
  const dpr = window.devicePixelRatio || 1;
  camera2d.w = window.innerWidth; camera2d.h = window.innerHeight;
  canvas.width = camera2d.w * dpr; canvas.height = camera2d.h * dpr;
  canvas.style.width = camera2d.w + 'px'; canvas.style.height = camera2d.h + 'px';
  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (window.Render3D && Render3D.ready) Render3D.resize();
}

function render(time) {
  if (window.Render3D && Render3D.ready) Render3D.render(time);
  else render2D(time);
  drawMinimap();
  updateZoneName();
  const prompt = $('#prompt');
  const near = nearbyTarget();
  if (near && !blocked()) {
    prompt.innerHTML = `<b>E</b> ${targetLabel(near)}`;
    prompt.classList.remove('hidden');
  } else prompt.classList.add('hidden');
}

const ROLE_EMOJI = {
  gambler: '🧑', dealer: '🤵', waitress: '💁‍♀️', guard: '👮', bartender: '🧑‍🍳', clerk: '🧑‍💼', vendor: '🧑‍🍳',
  homeless: '🧔', pedestrian: '🚶', robber: '🥷', thug: '🕴️', cashierClerk: '🧑‍💼',
};

function drawEmoji(e, x, y, size) {
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y);
}

function render2D(time) {
  const cam = camera2d;
  cam.x = clamp(player.x - cam.w / 2, 0, Math.max(0, WORLD.w - cam.w));
  cam.y = clamp(player.y - cam.h / 2, 0, Math.max(0, WORLD.h - cam.h));
  ctx.fillStyle = '#0a0508';
  ctx.fillRect(0, 0, cam.w, cam.h);
  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  for (const z of ZONES) { ctx.fillStyle = z.color; ctx.fillRect(z.x, z.y, z.w, z.h); }
  for (const o of OBJECTS) {
    ctx.fillStyle = o.color;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    if (o.emoji) drawEmoji(o.emoji, o.x + o.w / 2, o.y + o.h / 2, Math.min(28, o.h * 0.6));
  }
  for (const n of npcs) drawEmoji(ROLE_EMOJI[n.role] || '🧑', n.x, n.y, 24);
  drawEmoji('🧑‍💼', player.x, player.y, 26);
  ctx.restore();
}

// GTA-style rotating radar
function drawMinimap() {
  const cv = document.getElementById('minimap');
  if (!cv) return;
  const size = cv.clientWidth || 160;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== size * dpr) { cv.width = size * dpr; cv.height = size * dpr; }
  const m = cv.getContext('2d');
  m.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = size / 2, sc = 0.11;
  m.clearRect(0, 0, size, size);
  m.save();
  m.beginPath(); m.arc(r, r, r - 2, 0, Math.PI * 2); m.clip();
  m.fillStyle = '#1b2a1b'; m.fillRect(0, 0, size, size);
  m.translate(r, r);
  m.rotate(view.yaw);
  m.scale(sc, sc);
  m.translate(-player.x, -player.y);
  for (const z of ZONES) { m.fillStyle = z.color; m.fillRect(z.x, z.y, z.w, z.h); }
  m.fillStyle = '#3a3a40'; m.fillRect(-2000, 1130, 6000, 110);
  m.fillStyle = '#6b6b70'; m.fillRect(-2000, 1004, 6000, 126);
  m.fillStyle = '#26323d'; m.fillRect(-2000, 1240, 6000, 800);
  for (const o of OBJECTS) {
    if (o.road) continue;
    m.fillStyle = o.wall ? '#000' : 'rgba(255,255,255,0.35)';
    m.fillRect(o.x, o.y, o.w, o.h);
  }
  const icon = (x, y, txt, col) => {
    m.save(); m.translate(x, y); m.rotate(-view.yaw); m.scale(1 / sc, 1 / sc);
    m.fillStyle = col; m.beginPath(); m.arc(0, 0, 6, 0, Math.PI * 2); m.fill();
    m.fillStyle = '#fff'; m.font = 'bold 8px sans-serif'; m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillText(txt, 0, 0.5); m.restore();
  };
  const find = t => OBJECTS.find(o => o.type === t);
  [['hotel', 'H', '#3b82f6'], ['buffet', 'F', '#f59e0b'], ['bar', 'B', '#8b5cf6'], ['gunstore', 'G', '#dc2626'],
    ['pawn', '$', '#16a34a'], ['busstop', '⇢', '#0ea5e9'], ['soup', 'S', '#65a30d']].forEach(([t, l, c]) => {
    const o = find(t); if (o) icon(o.x + o.w / 2, o.y + o.h / 2, l, c);
  });
  for (const n of npcs) {
    if (!n.hostile) continue;
    icon(n.x, n.y, '', '#ef4444');
  }
  m.restore();
  // player arrow (always pointing where the character faces relative to camera)
  m.save();
  m.translate(r, r);
  m.rotate(Math.PI - player.face + view.yaw);
  m.fillStyle = '#fff'; m.strokeStyle = '#000'; m.lineWidth = 1.5;
  m.beginPath(); m.moveTo(0, -8); m.lineTo(6, 7); m.lineTo(0, 3); m.lineTo(-6, 7); m.closePath();
  m.fill(); m.stroke();
  m.restore();
  m.strokeStyle = 'rgba(0,0,0,0.8)'; m.lineWidth = 4;
  m.beginPath(); m.arc(r, r, r - 2, 0, Math.PI * 2); m.stroke();
}

// GTA-style area name that fades in when you enter a new part of the map
let currentZone = null, zoneTimer = null;
function updateZoneName() {
  let z = null;
  for (const zone of ZONES) {
    if (!zone.label) continue;
    if (player.x >= zone.x && player.x <= zone.x + zone.w && player.y >= zone.y && player.y <= zone.y + zone.h) z = zone;
  }
  const name = z ? z.label : player.y < CASINO_BOTTOM ? 'CASINO FLOOR' : 'THE STRIP';
  if (name === currentZone) return;
  currentZone = name;
  const el = $('#zone');
  el.textContent = name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
