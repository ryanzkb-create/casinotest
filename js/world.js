'use strict';

// ---------------------------------------------------------------------------
// Player movement, GTA-style controls, collision helpers, radar.
// The floor plan lives in layout.js; the 3D renderer in js/r3d/.
// ---------------------------------------------------------------------------
const PLAYER_R = 7;                       // ~35 cm body radius
const SPEED = { walk: 1.6 * 20, jog: 3.8 * 20, sprint: 6.4 * 20 };  // map units / s
const player = { x: 900, y: 1104, face: Math.PI, moving: false, pose: 'stand', anim: 0, shootT: 0, seated: false, seatY: 0 };
let npcs = [];
let cars = [];
const view = { yaw: 0, pitch: 0.12, zoom: 1, aiming: false, walk: false };

// Player settings, kept in this browser. `sens` scales mouse/touch look speed;
// `quality` is 'auto' or a graphics preset 0-2 (read by js/r3d/main.js at start-up).
const SETTINGS = (() => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('gm_settings') || '{}') || {}; } catch (e) { /* storage unavailable */ }
  return Object.assign({ sens: 1, quality: 'auto' }, saved);
})();
function saveSettings() { try { localStorage.setItem('gm_settings', JSON.stringify(SETTINGS)); } catch (e) { /* storage unavailable */ } }
const LOOK_SPEED = 0.0045;   // radians per mouse pixel at sensitivity 1

function resetEntities() {
  player.x = 900; player.y = 1104; player.face = Math.PI; player.pose = 'stand'; player.seated = false; player.seatY = 0;
  view.yaw = 0; view.pitch = 0.12;
  spawnNPCs();
  cars = [];
  for (let i = 0; i < 9; i++) cars.push({ x: rand(-200, WORLD.w + 200), lane: i % 4, speed: rand(170, 300) });
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
  for (let i = 0; i < 300; i++) {
    let x, y;
    if (area === 'street') { x = rand(40, WORLD.w - 40); y = rand(1082, 1118); }
    else if (area === 'walkway') {
      if (Math.random() < 0.5) { x = rand(M(42), M(48)); y = rand(40, CASINO_BOTTOM - 40); }
      else { x = rand(40, WORLD.w - 40); y = rand(M(36.3), M(39.2)); }
    } else { x = rand(40, WORLD.w - 40); y = rand(40, CASINO_BOTTOM - 30); }
    if (!hits(x, y, 12)) return { x, y };
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

// Nearest thing you can use: an object or a person to talk to
function nearbyTarget() {
  if (player.seated) return null;
  let best = null, bd = 26;
  for (const o of OBJECTS) {
    if (!o.type) continue;
    const d = distToRect(player.x, player.y, o) - PLAYER_R;
    if (d < bd) {
      // must roughly face it
      const cx = clamp(player.x, o.x, o.x + o.w), cy = clamp(player.y, o.y, o.y + o.h);
      const a = Math.atan2(cx - player.x, cy - player.y);
      if (d > 6 && Math.abs(lerpAngle(0, a - player.face, 1)) > 1.6) continue;
      bd = d; best = o;
    }
  }
  for (const n of npcs) {
    if (!n.talk || n.pose === 'down') continue;
    const d = Math.hypot(n.x - player.x, n.y - player.y) - PLAYER_R - 10;
    if (d < bd - 4) { bd = d; best = n; }
  }
  return best;
}
const nearbyObject = nearbyTarget;

function targetLabel(t) { return t.role ? `Talk to ${t.name}` : interactLabel(t); }
function useTarget(t) { if (t.role) talkTo(t); else interact(t); }

// ---------------------------------------------------------------------------
// Input: keyboard + mouse look (pointer lock) + touch joystick
// ---------------------------------------------------------------------------
const keys = {};
const touch = { mx: 0, my: 0, active: false, sprint: false };
function clearMovement() {
  for (const k in keys) keys[k] = false;
  touch.mx = touch.my = 0;
  view.aiming = false;
}
function blocked() { return modalOpen || phoneOpen || screenOpen || S.ended || (typeof gameSession !== 'undefined' && gameSession); }

function setupInput() {
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (screenOpen) return;
    if (typeof gameSession !== 'undefined' && gameSession) { gameKey(k, e); return; }
    if (k === 'escape') {
      if (phoneOpen) closePhone(); else if (modalOpen) closeModal();
      return;
    }
    if (modalOpen) return;
    if (k === 'p' || k === 'arrowup' && e.ctrlKey) { togglePhone(); return; }
    if (phoneOpen) return;
    keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
    if (k === 'e' || k === 'enter') { const t = nearbyTarget(); if (t) useTarget(t); }
    if (k === 'f') fireWeapon();
    if (k === 'q') cycleWeapon();
    if (k === 'x') { view.walk = !view.walk; toast(view.walk ? 'Walking' : 'Jogging', 'info', 1200); }
    if (k === 'v') view.zoom = view.zoom > 1.2 ? 0.8 : view.zoom < 0.9 ? 1 : 1.35;
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', clearMovement);

  const surface = document.getElementById('game3d');
  const surfaces = [surface, document.getElementById('game')];
  const locked = () => document.pointerLockElement === surface;
  let drag = null;
  surfaces.forEach(cv => {
    if (!cv) return;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => {
      if (blocked() || e.pointerType === 'touch') return;
      if (e.button === 2) { view.aiming = true; return; }
      if (e.button === 0) {
        if (locked()) { if (S.equipped) fireWeapon(); return; }
        try { const p = cv.requestPointerLock && cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* optional */ }
        drag = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener('mouseup', e => { if (e.button === 2) view.aiming = false; if (e.button === 0) drag = null; });
    cv.addEventListener('mousemove', e => {
      if (blocked()) return;
      const sens = LOOK_SPEED * SETTINGS.sens;
      if (locked()) { view.yaw -= e.movementX * sens; view.pitch += e.movementY * sens; }
      else if (drag) { view.yaw -= (e.clientX - drag.x) * sens * 1.4; view.pitch += (e.clientY - drag.y) * sens * 1.4; drag.x = e.clientX; drag.y = e.clientY; }
      view.pitch = clamp(view.pitch, -0.55, 1.15);
    });
    cv.addEventListener('wheel', e => { e.preventDefault(); if (!blocked()) view.zoom = clamp(view.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.6, 1.8); }, { passive: false });
  });
  document.addEventListener('pointerlockchange', () => { document.body.classList.toggle('locked', locked()); });

  // Touch: left half = movement stick, right half = look
  const stick = $('#stick'), knob = $('#stick-knob');
  const touches = new Map();
  const onStart = e => {
    if (blocked()) return;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('button, #prompt, .modal-box, #phone')) continue;
      const left = t.clientX < innerWidth * 0.45;
      touches.set(t.identifier, { kind: left ? 'move' : 'look', x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY });
      if (left) { stick.style.left = (t.clientX - 60) + 'px'; stick.style.top = (t.clientY - 60) + 'px'; stick.classList.add('on'); }
      e.preventDefault();
    }
  };
  const onMove = e => {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (!s) continue;
      if (s.kind === 'move') {
        let dx = t.clientX - s.x0, dy = t.clientY - s.y0;
        const len = Math.hypot(dx, dy), max = 50;
        if (len > max) { dx *= max / len; dy *= max / len; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touch.mx = dx / max; touch.my = dy / max; touch.active = true;
      } else {
        view.yaw -= (t.clientX - s.x) * 0.009 * SETTINGS.sens; view.pitch = clamp(view.pitch + (t.clientY - s.y) * 0.007 * SETTINGS.sens, -0.55, 1.15);
        s.x = t.clientX; s.y = t.clientY;
      }
      e.preventDefault();
    }
  };
  const onEnd = e => {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (!s) continue;
      if (s.kind === 'move') { touch.mx = touch.my = 0; touch.active = false; knob.style.transform = ''; stick.classList.remove('on'); }
      touches.delete(t.identifier);
    }
  };
  surfaces.forEach(cv => {
    if (!cv) return;
    cv.addEventListener('touchstart', onStart, { passive: false });
    cv.addEventListener('touchmove', onMove, { passive: false });
    cv.addEventListener('touchend', onEnd); cv.addEventListener('touchcancel', onEnd);
  });

  $('#prompt').addEventListener('click', () => { const t = nearbyTarget(); if (t && !blocked()) useTarget(t); });
  const aimBtn = $('#aimBtn');
  if (aimBtn) aimBtn.addEventListener('click', () => { view.aiming = !view.aiming; aimBtn.classList.toggle('on', view.aiming); });
  const sprintBtn = $('#sprintBtn');
  if (sprintBtn) sprintBtn.addEventListener('click', () => { touch.sprint = !touch.sprint; sprintBtn.classList.toggle('on', touch.sprint); });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function updateWorld(dt) {
  if (player.seated) {
    player.pose = 'sit';
    updateNPCs(dt);
    updateTraffic(dt);
    updateCombat(dt);
    return;
  }
  let ix = 0, iy = 0;
  if (keys['w'] || keys['arrowup']) iy -= 1;
  if (keys['s'] || keys['arrowdown']) iy += 1;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  if (touch.active) { ix += touch.mx; iy += touch.my; }
  const mag = Math.min(1, Math.hypot(ix, iy));

  let dx = 0, dy = 0;
  if (mag > 0.05) {
    const fx = -Math.sin(view.yaw), fy = -Math.cos(view.yaw);   // camera forward (map)
    const rx = Math.cos(view.yaw), ry = -Math.sin(view.yaw);     // camera right
    dx = rx * ix + fx * -iy;
    dy = ry * ix + fy * -iy;
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
  }
  const sprint = (keys['shift'] || touch.sprint) && !view.aiming && S.energy > 5;
  let speed = view.aiming ? SPEED.walk : sprint ? SPEED.sprint : view.walk || (touch.active && mag < 0.55) ? SPEED.walk : SPEED.jog;
  speed *= (S.energy < 20 ? 0.7 : 1) * (S.health < 30 ? 0.7 : 1);
  player.moving = false;
  if (dx || dy) {
    const moved = moveEntity(player, dx * speed * dt, dy * speed * dt);
    player.moving = moved;
    if (!view.aiming) player.face = lerpAngle(player.face, Math.atan2(dx, dy), Math.min(1, dt * 10));
    if (sprint && moved) S.energy = Math.max(0, S.energy - dt * 0.15);
  }
  if (view.aiming) {
    player.face = view.yaw + Math.PI;
    player.aimPitch = -view.pitch * 0.8;
  }
  player.pose = (view.aiming && S.equipped) || player.shootT > 0 ? 'aim' : !player.moving ? 'stand' : sprint ? 'sprint' : speed <= SPEED.walk ? 'walk' : 'run';
  player.shootT = Math.max(0, player.shootT - dt);
  const ch = $('#crosshair');
  if (ch) {
    const show = view.aiming && S.equipped;
    ch.classList.toggle('hidden', !show);
    ch.classList.toggle('target', !!(show && window.Render3D && Render3D.ready && Render3D.aimPick(0.1)));
  }

  updateNPCs(dt);
  updateTraffic(dt);
  updateCombat(dt);
}

function updateTraffic(dt) {
  for (const c of cars) {
    c.x += (c.lane < 2 ? -1 : 1) * c.speed * dt;
    if (c.x > WORLD.w + 600) c.x = -600;
    if (c.x < -600) c.x = WORLD.w + 600;
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

// Sit the player down at a machine or table (used by the casino games)
function seatPlayer(o) {
  const seat = o.type === 'craps' || o.type === 'bigsix' ? seatOf(o, 0.5) : o.type === 'slots' ? slotSeat(o) : tableSeats(o)[Math.floor(tableSeats(o).length / 2)] || seatOf(o);
  player.returnTo = { x: player.x, y: player.y };
  // someone already sitting there moves to a free seat (or gets up and wanders off)
  const taken = s => npcs.find(n => n.role === 'gambler' && Math.hypot(n.x - s.x, n.y - s.y) < 8);
  const occ = taken(seat);
  if (occ) {
    const free = (o.type === 'slots' || o.type === 'craps' || o.type === 'bigsix' ? [] : tableSeats(o)).find(s => !taken(s));
    if (free) { occ.x = free.x; occ.y = free.y; occ.face = free.face; }
    else { const p = randomWalkable('walkway'); Object.assign(occ, { x: p.x, y: p.y, tx: p.x, ty: p.y, seated: false, seatY: 0, pose: 'stand', area: 'walkway', activity: null }); }
  }
  player.x = seat.x; player.y = seat.y; player.face = seat.face;
  player.seated = !(o.type === 'craps' || o.type === 'bigsix');
  player.pose = player.seated ? 'sit' : 'stand';
}
function standPlayer() {
  if (player.returnTo) {
    // step back from the seat
    const back = { x: player.x - Math.sin(player.face) * 12, y: player.y - Math.cos(player.face) * 12 };
    if (!hits(back.x, back.y)) { player.x = back.x; player.y = back.y; }
    else if (!hits(player.returnTo.x, player.returnTo.y)) { player.x = player.returnTo.x; player.y = player.returnTo.y; }
  }
  player.seated = false; player.pose = 'stand';
  view.yaw = player.face + Math.PI; view.pitch = 0.12;
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
  const near = blocked() ? null : nearbyTarget();
  const html = near ? `<b>E</b> ${targetLabel(near)}` : '';
  if (html !== render.prompt) {   // only touch the DOM when the prompt changes
    render.prompt = html;
    if (html) prompt.innerHTML = html;
    prompt.classList.toggle('hidden', !html);
  }
}

const ROLE_EMOJI = { gambler: '🧑', dealer: '🤵', waitress: '💁‍♀️', guard: '👮', bartender: '🧑‍🍳', clerk: '🧑‍💼', vendor: '🧑‍🍳', homeless: '🧔', pedestrian: '🚶', robber: '🥷', thug: '🕴️', cashierClerk: '🧑‍💼' };
function drawEmoji(e, x, y, size) {
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y);
}
function render2D() {
  const cam = camera2d;
  cam.x = clamp(player.x - cam.w / 2, 0, Math.max(0, WORLD.w - cam.w));
  cam.y = clamp(player.y - cam.h / 2, 0, Math.max(0, WORLD.h - cam.h));
  ctx.fillStyle = '#0a0508'; ctx.fillRect(0, 0, cam.w, cam.h);
  ctx.save(); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  for (const z of ZONES) { ctx.fillStyle = z.color; ctx.fillRect(z.x, z.y, z.w, z.h); }
  for (const o of OBJECTS) { if (o.road) continue; ctx.fillStyle = o.type ? '#8a6a3a' : '#444'; ctx.fillRect(o.x, o.y, o.w, o.h); }
  for (const n of npcs) drawEmoji(ROLE_EMOJI[n.role] || '🧑', n.x, n.y, 20);
  drawEmoji('🧑‍💼', player.x, player.y, 22);
  ctx.restore();
}

// GTA-style rotating radar
// The static part of the radar (roads, floors, walls, tables) is drawn once into
// an offscreen canvas; each frame only blits it rotated and adds the icons.
const MINIMAP = { cache: null, x0: -600, y0: -200, w: 3000, h: 1900, k: 0.4, last: 0 };
function minimapCache() {
  if (MINIMAP.cache && MINIMAP.objects === OBJECTS.length) return MINIMAP.cache;
  const c = document.createElement('canvas');
  c.width = MINIMAP.w * MINIMAP.k; c.height = MINIMAP.h * MINIMAP.k;
  const m = c.getContext('2d');
  m.scale(MINIMAP.k, MINIMAP.k); m.translate(-MINIMAP.x0, -MINIMAP.y0);
  m.fillStyle = '#2e3b2c'; m.fillRect(MINIMAP.x0, MINIMAP.y0, MINIMAP.w, MINIMAP.h);
  m.fillStyle = '#3a3a40'; m.fillRect(-4000, 1130, 10000, 320);
  m.fillStyle = '#6b6b70'; m.fillRect(-4000, 1004, 10000, 126);
  m.fillStyle = '#26323d'; m.fillRect(-4000, 1450, 10000, 1200);
  for (const z of ZONES) { if (z.floor === 'sidewalk') continue; m.fillStyle = z.walkway ? '#8a8278' : z.color; m.fillRect(z.x, z.y, z.w, z.h); }
  for (const o of OBJECTS) {
    if (o.road || !o.solid) continue;
    m.fillStyle = o.wall || o.decor === 'glassWall' ? '#111' : 'rgba(255,255,255,0.35)';
    m.fillRect(o.x, o.y, o.w, o.h);
  }
  MINIMAP.cache = c; MINIMAP.objects = OBJECTS.length;
  return c;
}

function drawMinimap() {
  const cv = document.getElementById('minimap');
  if (!cv || cv.offsetParent === null) return;          // hidden (e.g. seated at a game)
  const now = performance.now();
  if (now - MINIMAP.last < 33) return;                   // ~30 fps is plenty for a radar
  MINIMAP.last = now;
  const size = cv.clientWidth || 160;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== size * dpr) { cv.width = size * dpr; cv.height = size * dpr; }
  const m = cv.getContext('2d');
  m.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = size / 2, sc = 0.13;
  m.clearRect(0, 0, size, size);
  m.save();
  m.beginPath(); m.arc(r, r, r - 2, 0, Math.PI * 2); m.clip();
  m.fillStyle = '#2e3b2c'; m.fillRect(0, 0, size, size);
  m.translate(r, r); m.rotate(view.yaw); m.scale(sc, sc); m.translate(-player.x, -player.y);
  m.drawImage(minimapCache(), MINIMAP.x0, MINIMAP.y0, MINIMAP.w, MINIMAP.h);
  const icon = (x, y, txt, col) => {
    m.save(); m.translate(x, y); m.rotate(-view.yaw); m.scale(1 / sc, 1 / sc);
    m.fillStyle = col; m.beginPath(); m.arc(0, 0, 6.5, 0, Math.PI * 2); m.fill();
    m.strokeStyle = '#000'; m.lineWidth = 1; m.stroke();
    m.fillStyle = '#fff'; m.font = 'bold 8px sans-serif'; m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillText(txt, 0, 0.5); m.restore();
  };
  const find = t => OBJECTS.find(o => o.type === t);
  [['hotel', 'H', '#3b82f6'], ['buffet', 'F', '#f59e0b'], ['bar', 'B', '#8b5cf6'], ['gunstore', 'G', '#dc2626'], ['cashier', '$', '#16a34a'],
    ['pawn', 'P', '#16a34a'], ['busstop', '⇢', '#0ea5e9'], ['soup', 'S', '#65a30d'], ['roulette', 'R', '#15803d'], ['blackjack_hl', 'V', '#ca8a04']].forEach(([t, l, c]) => {
    const o = find(t); if (o) icon(o.x + o.w / 2, o.y + o.h / 2, l, c);
  });
  for (const n of npcs) if (n.hostile || (n.role === 'robber' || n.role === 'thug') && n.state === 'approach') icon(n.x, n.y, '', '#ef4444');
  m.restore();
  m.save(); m.translate(r, r); m.rotate(Math.PI - player.face + view.yaw);
  m.fillStyle = '#fff'; m.strokeStyle = '#000'; m.lineWidth = 1.5;
  m.beginPath(); m.moveTo(0, -8); m.lineTo(6, 7); m.lineTo(0, 3); m.lineTo(-6, 7); m.closePath(); m.fill(); m.stroke();
  m.restore();
  m.strokeStyle = 'rgba(0,0,0,0.85)'; m.lineWidth = 4;
  m.beginPath(); m.arc(r, r, r - 2, 0, Math.PI * 2); m.stroke();
}

let currentZone = null;
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
