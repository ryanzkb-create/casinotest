'use strict';

// ---------------------------------------------------------------------------
// Map layout
// ---------------------------------------------------------------------------
const WORLD = { w: 1800, h: 1240 };
const CASINO_BOTTOM = 990;

const ZONES = [
  { x: 0, y: 0, w: 1800, h: 1004, color: '#2b0d16' },
  { x: 30, y: 30, w: 560, h: 560, color: '#3a1450', label: 'SLOT MACHINES' },
  { x: 620, y: 30, w: 440, h: 260, color: '#4a3a0a', label: 'HIGH LIMIT ROOM' },
  { x: 620, y: 330, w: 740, h: 560, color: '#0f3a24', label: 'TABLE GAMES' },
  { x: 1400, y: 30, w: 370, h: 380, color: '#4a2a10', label: 'FOOD COURT' },
  { x: 1400, y: 440, w: 370, h: 220, color: '#102a4a', label: 'THE LUCKY BAR' },
  { x: 1400, y: 690, w: 370, h: 290, color: '#333642', label: 'HOTEL LOBBY' },
  { x: 30, y: 620, w: 560, h: 360, color: '#2a2034', label: 'CASHIER & LOUNGE' },
  { x: 0, y: 1004, w: 1800, h: 126, color: '#5b5b60', label: 'THE STRIP (STREET)' },
];

const OBJECTS = [];
function addObj(o) {
  if (o.solid === undefined) o.solid = true;
  OBJECTS.push(o);
  return o;
}

function buildWorld() {
  OBJECTS.length = 0;
  // Slot machines
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 6; c++)
      addObj({ x: 64 + c * 86, y: 78 + r * 104, w: 44, h: 46, type: 'slots', emoji: '🎰', color: '#6b2a8a' });

  // High limit room
  addObj({ x: 660, y: 100, w: 170, h: 80, type: 'blackjack_hl', emoji: '🃏', label: 'VIP Blackjack', color: '#1d6b3a' });
  addObj({ x: 860, y: 100, w: 170, h: 80, type: 'baccarat_hl', emoji: '🀄', label: 'VIP Baccarat', color: '#1d6b3a' });

  // Table games
  addObj({ x: 660, y: 390, w: 170, h: 90, type: 'roulette', emoji: '🎯', label: 'Roulette', color: '#1d6b3a' });
  addObj({ x: 890, y: 390, w: 170, h: 90, type: 'blackjack', emoji: '🃏', label: 'Blackjack', color: '#1d6b3a' });
  addObj({ x: 1120, y: 390, w: 170, h: 90, type: 'blackjack', emoji: '🃏', label: 'Blackjack', color: '#1d6b3a' });
  addObj({ x: 660, y: 600, w: 200, h: 100, type: 'craps', emoji: '🎲', label: 'Craps', color: '#1d6b3a' });
  addObj({ x: 920, y: 600, w: 170, h: 90, type: 'baccarat', emoji: '🀄', label: 'Baccarat', color: '#1d6b3a' });
  addObj({ x: 1150, y: 590, w: 120, h: 110, type: 'bigsix', emoji: '🎡', label: 'Big Six Wheel', color: '#7a2a1a' });

  // Food court
  addObj({ x: 1430, y: 90, w: 100, h: 55, type: 'hotdog', emoji: '🌭', label: 'Hot Dogs', color: '#8a5a1a' });
  addObj({ x: 1570, y: 90, w: 170, h: 55, type: 'buffet', emoji: '🍱', label: 'Buffet', color: '#8a5a1a' });
  addObj({ x: 1430, y: 260, w: 150, h: 60, type: 'steak', emoji: '🥩', label: 'Steakhouse', color: '#6a2a1a' });
  addObj({ x: 1640, y: 250, w: 60, h: 60, emoji: '🪑', color: '#5a3a20' });

  // Bar
  addObj({ x: 1430, y: 520, w: 310, h: 50, type: 'bar', emoji: '🍸', label: 'Bar', color: '#2a4a7a' });

  // Hotel
  addObj({ x: 1440, y: 780, w: 200, h: 50, type: 'hotel', emoji: '🛎️', label: 'Front Desk', color: '#555a70' });
  addObj({ x: 1680, y: 720, w: 60, h: 70, emoji: '🛗', color: '#444' });

  // Lounge
  addObj({ x: 60, y: 670, w: 200, h: 60, type: 'cashier', emoji: '💰', label: 'Cashier Cage', color: '#6a5a2a' });
  addObj({ x: 300, y: 670, w: 50, h: 60, type: 'atm', emoji: '🏧', label: 'ATM', color: '#3a4a5a' });
  addObj({ x: 400, y: 680, w: 40, h: 40, type: 'fountain', emoji: '🚰', label: 'Water', color: '#2a5a7a' });
  addObj({ x: 480, y: 660, w: 80, h: 50, type: 'poster', emoji: '📋', label: 'Help Poster', color: '#6a6a6a' });
  addObj({ x: 70, y: 860, w: 130, h: 44, type: 'noclock', emoji: '🪟', label: 'Where are the clocks?', color: '#3a3a4a' });

  // Casino front wall with the entrance
  addObj({ x: 0, y: CASINO_BOTTOM, w: 850, h: 14, color: '#111', wall: true });
  addObj({ x: 950, y: CASINO_BOTTOM, w: 850, h: 14, color: '#111', wall: true });

  // Street
  addObj({ x: 90, y: 1036, w: 100, h: 40, type: 'streetsleep', emoji: '📦', label: 'Cardboard spot', color: '#7a6a4a' });
  addObj({ x: 330, y: 1020, w: 200, h: 56, type: 'soup', emoji: '🍲', label: 'Soup Kitchen', color: '#4a6a4a' });
  addObj({ x: 620, y: 1020, w: 160, h: 56, type: 'pawn', emoji: '💍', label: 'Pawn Shop', color: '#6a4a6a' });
  addObj({ x: 1120, y: 1036, w: 36, h: 36, type: 'tap', emoji: '🚰', label: 'Public tap', color: '#2a5a7a' });
  addObj({ x: 1580, y: 1024, w: 140, h: 52, type: 'busstop', emoji: '🚏', label: 'Bus out of town', color: '#2a6a5a' });
  // The road is not walkable
  addObj({ x: 0, y: 1130, w: 1800, h: 110, color: '#1e1e22', road: true });
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
const PLAYER_R = 11;
const player = { x: 900, y: 1104, speed: 220, dir: 1, moving: false, target: null };
let npcs = [];
let thug = null;
let cars = [];

const NPC_EMOJI = ['🧔', '👩', '👨‍🦳', '👵', '🧑', '👱‍♀️', '👨‍💼', '👩‍🦰', '🤠', '🧓'];
const STAFF_EMOJI = ['🤵', '💁‍♀️'];

function resetEntities() {
  player.x = 900; player.y = 1104; player.target = null;
  thug = null;
  npcs = [];
  for (let i = 0; i < 16; i++) {
    const p = randomWalkable(true);
    npcs.push({ x: p.x, y: p.y, tx: p.x, ty: p.y, wait: rand(0, 3), speed: rand(40, 80),
      emoji: i < 3 ? pick(STAFF_EMOJI) : pick(NPC_EMOJI) });
  }
  cars = [];
  for (let i = 0; i < 4; i++) cars.push({ x: rand(0, WORLD.w), lane: i % 2, speed: rand(150, 260), emoji: pick(['🚕', '🚗', '🚙', '🚌', '🚓']) });
}

function hits(x, y, r = PLAYER_R) {
  if (x - r < 0 || y - r < 0 || x + r > WORLD.w || y + r > WORLD.h) return true;
  for (const o of OBJECTS) {
    if (!o.solid) continue;
    if (x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h) return true;
  }
  return false;
}

function randomWalkable(insideCasino) {
  for (let i = 0; i < 200; i++) {
    const x = rand(40, WORLD.w - 40);
    const y = insideCasino ? rand(40, CASINO_BOTTOM - 30) : rand(40, 1120);
    if (!hits(x, y, 14)) return { x, y };
  }
  return { x: 900, y: 930 };
}

// Move with axis-separated collision so entities slide along obstacles.
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

function nearbyObject() {
  let best = null, bd = 30;
  for (const o of OBJECTS) {
    if (!o.type) continue;
    const d = distToRect(player.x, player.y, o) - PLAYER_R;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = {};
function clearMovement() {
  for (const k in keys) keys[k] = false;
  player.target = null;
}

function setupInput(canvas) {
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
      const o = nearbyObject();
      if (o) interact(o);
    }
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', clearMovement);

  canvas.addEventListener('pointerdown', e => {
    if (modalOpen || phoneOpen || screenOpen) return;
    const rect = canvas.getBoundingClientRect();
    const wx = e.clientX - rect.left + camera.x;
    const wy = e.clientY - rect.top + camera.y;
    const obj = OBJECTS.find(o => o.type && wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h);
    if (obj && distToRect(player.x, player.y, obj) - PLAYER_R < 30) { interact(obj); return; }
    if (obj) {
      // walk to the nearest edge of the object
      const tx = clamp(player.x, obj.x - 16, obj.x + obj.w + 16);
      const ty = clamp(player.y, obj.y - 16, obj.y + obj.h + 16);
      player.target = { x: tx, y: ty, obj };
    } else {
      player.target = { x: wx, y: wy, obj: null };
    }
  });

  $('#prompt').addEventListener('click', () => {
    const o = nearbyObject();
    if (o && !modalOpen && !phoneOpen) interact(o);
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
let stuckTime = 0;
function updateWorld(dt) {
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  if (dx || dy) player.target = null;

  if (player.target) {
    const t = player.target;
    if (t.obj && distToRect(player.x, player.y, t.obj) - PLAYER_R < 28) {
      player.target = null;
      interact(t.obj);
    } else {
      const vx = t.x - player.x, vy = t.y - player.y, d = Math.hypot(vx, vy);
      if (d < 4) player.target = null;
      else { dx = vx / d; dy = vy / d; }
    }
  }

  // Exhaustion makes you slower
  const speed = player.speed * (S.energy < 20 ? 0.6 : 1);
  player.moving = false;
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    let moved = moveEntity(player, dx / len * speed * dt, dy / len * speed * dt);
    if (!moved && player.target) {
      // Tap-to-walk: try steering around whatever is in the way
      const base = Math.atan2(dy, dx);
      for (const off of [0.8, -0.8, 1.57, -1.57]) {
        const a = base + off;
        if (moveEntity(player, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt)) { moved = true; break; }
      }
    }
    player.moving = moved;
    if (dx) player.dir = dx > 0 ? 1 : -1;
    if (!moved && player.target) {
      stuckTime += dt;
      if (stuckTime > 0.6) { player.target = null; stuckTime = 0; }
    } else stuckTime = 0;
  }

  for (const n of npcs) {
    if (n.wait > 0) { n.wait -= dt; continue; }
    const vx = n.tx - n.x, vy = n.ty - n.y, d = Math.hypot(vx, vy);
    if (d < 3) {
      n.wait = rand(1, 6);
      const p = randomWalkable(true); n.tx = p.x; n.ty = p.y;
      continue;
    }
    if (!moveEntity(n, vx / d * n.speed * dt, vy / d * n.speed * dt, 10)) {
      const p = randomWalkable(true); n.tx = p.x; n.ty = p.y;
    }
  }

  for (const c of cars) {
    c.x += (c.lane ? -1 : 1) * c.speed * dt;
    if (c.x > WORLD.w + 60) c.x = -60;
    if (c.x < -60) c.x = WORLD.w + 60;
  }

  updateThug(dt);
}

function updateThug(dt) {
  const k = S.shark;
  if (!thug && sharkOverdue() && k.nextThug !== null && S.minutes >= k.nextThug) {
    thug = { x: 900, y: 1110, state: 'chase', t: 0 };
    k.nextThug = S.minutes + Math.max(60, 240 - 50 * k.overdueDays);
    toast('🕴️ Someone from Tony\'s crew just walked in... and they are looking for you.', 'danger', 5000);
  }
  if (!thug) return;
  thug.t += dt;
  if (thug.state === 'chase') {
    if (!sharkOverdue()) { thug.state = 'leave'; return; }
    const vx = player.x - thug.x, vy = player.y - thug.y, d = Math.hypot(vx, vy);
    if (d < 26 || thug.t > 14) { // caught you (or cornered you eventually)
      thug.state = 'leave';
      harass();
      return;
    }
    const sp = 175 + 15 * k.overdueDays;
    if (!moveEntity(thug, vx / d * sp * dt, vy / d * sp * dt, 11)) {
      // slide around obstacles
      moveEntity(thug, (Math.random() - 0.5) * sp * dt * 2, (Math.random() - 0.5) * sp * dt * 2, 11);
    }
  } else {
    const vx = 900 - thug.x, vy = 1110 - thug.y, d = Math.hypot(vx, vy);
    if (d < 10) { thug = null; return; }
    thug.x += vx / d * 160 * dt; thug.y += vy / d * 160 * dt;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const camera = { x: 0, y: 0, w: 0, h: 0 };
let ctx = null;

function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  camera.w = window.innerWidth; camera.h = window.innerHeight;
  canvas.width = camera.w * dpr; canvas.height = camera.h * dpr;
  canvas.style.width = camera.w + 'px'; canvas.style.height = camera.h + 'px';
  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawEmoji(e, x, y, size) {
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y);
}

function render(time) {
  camera.x = clamp(player.x - camera.w / 2, 0, Math.max(0, WORLD.w - camera.w));
  camera.y = clamp(player.y - camera.h / 2, 0, Math.max(0, WORLD.h - camera.h));
  if (camera.w > WORLD.w) camera.x = (WORLD.w - camera.w) / 2;
  if (camera.h > WORLD.h) camera.y = (WORLD.h - camera.h) / 2;

  ctx.fillStyle = '#0a0508';
  ctx.fillRect(0, 0, camera.w, camera.h);
  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  // Zones
  for (const z of ZONES) {
    ctx.fillStyle = z.color;
    ctx.fillRect(z.x, z.y, z.w, z.h);
  }
  // carpet pattern
  ctx.fillStyle = 'rgba(255,215,0,0.05)';
  for (let x = 20; x < WORLD.w; x += 40)
    for (let y = 20; y < CASINO_BOTTOM; y += 40)
      ctx.fillRect(x, y, 3, 3);
  for (const z of ZONES) {
    if (!z.label) continue;
    ctx.strokeStyle = 'rgba(255,215,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.fillStyle = 'rgba(255,230,150,0.55)';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(z.label, z.x + 8, z.y + 6);
  }

  // Entrance
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(850, CASINO_BOTTOM + 4, 100, 6);
  ctx.fillStyle = '#ffd86b';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ENTRANCE', 900, CASINO_BOTTOM - 12);

  // Neon casino sign
  const glow = 0.6 + 0.4 * Math.sin(time / 300);
  ctx.fillStyle = `rgba(255,60,120,${glow})`;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('★ GOLDEN MIRAGE CASINO ★', 900, CASINO_BOTTOM + 34);

  // Objects
  const near = nearbyObject();
  for (const o of OBJECTS) {
    if (o.road) {
      ctx.fillStyle = o.color; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#d8c34a';
      for (let x = 0; x < WORLD.w; x += 60) ctx.fillRect(x, o.y + o.h / 2 - 2, 30, 4);
      continue;
    }
    if (o.wall) { ctx.fillStyle = o.color; ctx.fillRect(o.x, o.y, o.w, o.h); continue; }
    ctx.fillStyle = o.color;
    roundRect(o.x, o.y, o.w, o.h, 8);
    ctx.fill();
    if (o === near) {
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3; ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (o.type === 'slots') {
      // blinking lights on slot machines
      const on = Math.sin(time / 200 + o.x * 0.05 + o.y * 0.03) > 0;
      ctx.fillStyle = on ? '#ffea00' : '#ff3d7f';
      ctx.fillRect(o.x + 4, o.y + 3, o.w - 8, 4);
    }
    drawEmoji(o.emoji, o.x + o.w / 2, o.y + o.h / 2 + 2, Math.min(28, o.h * 0.6));
    if (o.label) {
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(o.label, o.x + o.w / 2, o.y + o.h + 3);
    }
  }

  // Cars
  for (const c of cars) {
    ctx.save();
    const cy = 1130 + (c.lane ? 30 : 80);
    ctx.translate(c.x, cy);
    if (!c.lane) ctx.scale(-1, 1);
    drawEmoji(c.emoji, 0, 0, 34);
    ctx.restore();
  }

  // NPCs
  for (const n of npcs) drawEmoji(n.emoji, n.x, n.y, 24);

  // Thug
  if (thug) {
    drawEmoji('🕴️', thug.x, thug.y, 28);
    ctx.fillStyle = '#ff4d4d';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("TONY'S CREW", thug.x, thug.y - 24);
  }

  // Player
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(player.x, player.y + 12, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,215,0,0.35)';
  ctx.beginPath(); ctx.arc(player.x, player.y, 16, 0, Math.PI * 2); ctx.fill();
  const bob = player.moving ? Math.sin(time / 80) * 2 : 0;
  ctx.save();
  ctx.translate(player.x, player.y + bob);
  ctx.scale(player.dir, 1);
  drawEmoji(S.energy < 20 ? '🥱' : S.cash < CONFIG.BROKE_THRESHOLD ? '😰' : '🧑‍💼', 0, 0, 26);
  ctx.restore();
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('YOU', player.x, player.y - 22);

  // Walk target marker
  if (player.target) {
    ctx.strokeStyle = 'rgba(255,215,0,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(player.target.x, player.target.y, 8, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.restore();

  // Night tint outside hours
  const hour = (S.minutes % 1440) / 60;
  const night = hour >= 20 || hour < 6;
  if (night && player.y > CASINO_BOTTOM) {
    ctx.fillStyle = 'rgba(10,10,40,0.25)';
    ctx.fillRect(0, 0, camera.w, camera.h);
  }

  // Interaction prompt
  const prompt = $('#prompt');
  if (near && !modalOpen && !phoneOpen && !screenOpen) {
    prompt.innerHTML = `<b>E</b> / tap: ${interactLabel(near)}`;
    prompt.classList.remove('hidden');
  } else prompt.classList.add('hidden');
}
