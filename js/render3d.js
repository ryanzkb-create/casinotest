// 3D renderer (Three.js). Game logic lives in the classic scripts; this module
// only draws the world they describe and answers "what did the user tap?".
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const K = 0.05;                   // map units → metres
const W = v => v * K;
const canvas = document.getElementById('game3d');
const LOW = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

let renderer, scene, cam, composer, bloom, sun, hemi;
const pickables = [];
const walls = [];
const animated = [];              // { update(t) } callbacks for spinning wheels, blinking lights…
const nightLit = [];              // materials that glow more at night
const humans = new Map();         // entity → rig
let doorL, doorR, marker, muzzle;
const tracerPool = [];
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;

// ---------------------------------------------------------------------------
// Materials & procedural textures
// ---------------------------------------------------------------------------
const matCache = new Map();
function mat(color, o = {}) {
  const key = color + '|' + JSON.stringify(o);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: o.r ?? 0.75, metalness: o.m ?? 0,
    emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
    transparent: o.opacity !== undefined, opacity: o.opacity ?? 1,
  });
  matCache.set(key, m);
  return m;
}
function glow(color, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 1 });
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function noise(g, w, h, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

const TEX = {};
function buildTextures() {
  const carpet = (base, a, b) => (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = a; g.lineWidth = 6;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = i * 64 + 32, y = j * 64 + 32;
      g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x + 26, y); g.lineTo(x, y + 26); g.lineTo(x - 26, y); g.closePath(); g.stroke();
      g.fillStyle = b; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x - 32, y - 32, 4, 0, Math.PI * 2); g.fill();
    }
    noise(g, w, h, 4000, 0.06);
  };
  TEX.carpet = carpet('#4a0f1c', '#7a1e2e', '#c9962c');
  TEX.carpetPurple = carpet('#2c0f40', '#4d1d6b', '#d4a93c');
  TEX.carpetGreen = carpet('#0f2e22', '#1c4a36', '#b8902a');
  TEX.carpetBlue = carpet('#141c3a', '#243060', '#c0a050');
  TEX.tiles = (g, w, h) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? '#d8d0c0' : '#bfb6a4'; g.fillRect(i * 64, j * 64, 64, 64);
    }
    g.strokeStyle = '#8a8272'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    noise(g, w, h, 2500, 0.05);
  };
  TEX.marble = (g, w, h) => {
    g.fillStyle = '#e9e6e0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,110,100,0.35)';
    for (let i = 0; i < 14; i++) {
      g.lineWidth = Math.random() * 2 + 0.5; g.beginPath();
      let x = Math.random() * w, y = 0; g.moveTo(x, y);
      while (y < h) { x += (Math.random() - 0.5) * 30; y += 12; g.lineTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  };
  TEX.marbleGold = (g, w, h) => {
    TEX.marble(g, w, h);
    g.fillStyle = 'rgba(160,120,30,0.25)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b8902a'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  };
  TEX.wood = (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#4a2c17' : '#56341c'; g.fillRect(0, i * 32, w, 32);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, i * 32, w, 2);
    }
    noise(g, w, h, 3000, 0.07);
  };
  TEX.sidewalk = (g, w, h) => {
    g.fillStyle = '#8d8c88'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 6000, 0.12);
    g.strokeStyle = '#6b6a66'; g.lineWidth = 3;
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); }
  };
  TEX.asphalt = (g, w, h) => {
    g.fillStyle = '#26272b'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 12000, 0.1);
  };
  TEX.plaster = (g, w, h) => { g.fillStyle = '#d9c7a0'; g.fillRect(0, 0, w, h); noise(g, w, h, 5000, 0.06); };
}

function floorTex(kind, wm, hm) {
  const t = canvasTex(256, 256, TEX[kind], [wm / (kind === 'sidewalk' ? 4 : 3), hm / (kind === 'sidewalk' ? 4 : 3)]);
  return t;
}

function textTex(lines, o = {}) {
  const w = o.w || 1024, h = o.h || 256;
  return canvasTex(w, h, (g) => {
    if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
    if (o.border) { g.strokeStyle = o.border; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16); }
    const arr = Array.isArray(lines) ? lines : [lines];
    const size = o.size || h * 0.55 / arr.length;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    arr.forEach((ln, i) => {
      const s = i === 0 ? size : size * (o.sub || 0.6);
      g.font = `${o.weight || 900} ${s}px ${o.font || '"Anton", "Arial Black", Impact, sans-serif'}`;
      if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = 25; }
      g.fillStyle = o.color || '#fff';
      const y = h / 2 + (i - (arr.length - 1) / 2) * (h / arr.length) * 0.95;
      g.fillText(ln, w / 2, y);
    });
  });
}

function windowsTex(cols, rows, lit = 0.45) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (Math.random() < lit) {
        g.fillStyle = pickArr(['#ffd9a0', '#ffe9c4', '#bcd8ff', '#fff2d0']);
        g.globalAlpha = 0.5 + Math.random() * 0.5;
        g.fillRect(i * cw + cw * 0.18, j * rh + rh * 0.2, cw * 0.64, rh * 0.55);
      }
    }
    g.globalAlpha = 1;
  });
}
const pickArr = a => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function box(w, h, d, material, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  (parent || scene).add(m);
  return m;
}
function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, parent, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  (parent || scene).add(m);
  return m;
}
function plane(w, h, material, parent) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  (parent || scene).add(m);
  return m;
}
function sign(text, w, h, o = {}) {
  const tex = textTex(text, { w: 1024, h: Math.round(1024 * h / w), ...o });
  const m = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.ei ?? 1.2, transparent: !o.bg, roughness: 1 });
  return plane(w, h, m);
}

function objGroup(o) {
  const g = new THREE.Group();
  g.position.set(W(o.x + o.w / 2), 0, W(o.y + o.h / 2));
  g.userData.target = o;
  scene.add(g);
  pickables.push(g);
  return g;
}

// ---------------------------------------------------------------------------
// Scene construction
// ---------------------------------------------------------------------------
function buildScene() {
  buildTextures();
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1026');
  scene.fog = new THREE.Fog('#0b1026', 60, 170);

  hemi = new THREE.HemisphereLight('#9fb4ff', '#2a1a10', 0.6);
  scene.add(hemi);
  sun = new THREE.DirectionalLight('#fff1d6', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Interior lights (casino is windowless: it looks the same at 4 AM as at noon)
  [[15, 15], [42, 9], [50, 30], [29, 25], [79, 11], [79, 28], [79, 42], [15, 40], [45, 45]].forEach(([x, z]) => {
    const l = new THREE.PointLight('#ffd9a8', LOW ? 30 : 45, 32, 1.6);
    l.position.set(x, 4.2, z);
    scene.add(l);
  });

  // Ground, beyond the map
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat('#1a1b1f', { r: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(45, -0.02, 40);
  ground.receiveShadow = true;
  scene.add(ground);
  ground.userData.ground = true;

  // Zone floors
  ZONES.forEach((z, i) => {
    const wm = W(z.w), hm = W(z.h);
    const tex = floorTex(z.floor, wm, hm);
    const shiny = z.floor.startsWith('marble') || z.floor === 'tiles' || z.floor === 'wood';
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wm, hm), new THREE.MeshStandardMaterial({ map: tex, roughness: shiny ? 0.35 : 0.95 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(W(z.x) + wm / 2, 0.002 * (i + 1), W(z.y) + hm / 2);
    m.receiveShadow = true;
    scene.add(m);
  });

  buildStreet();
  buildCasinoShell();
  OBJECTS.forEach(buildObject);
  buildSeats();

  // interaction marker (a GTA-style floating arrow)
  marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), glow('#f2c14e', 3));
  marker.rotation.x = Math.PI;
  scene.add(marker);

  muzzle = new THREE.PointLight('#ffb347', 0, 8, 2);
  scene.add(muzzle);
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.9 }));
    line.visible = false;
    scene.add(line);
    tracerPool.push(line);
  }
}

function buildCasinoShell() {
  const H = 5.2;
  const wallMat = () => new THREE.MeshStandardMaterial({ color: '#3a2226', roughness: 0.8, transparent: true, opacity: 1 });
  const addWall = (x, z, w, d) => {
    const m = box(w, H, d, wallMat(), x, H / 2, z);
    walls.push(m);
    const trim = box(w + 0.02, 0.18, d + 0.02, mat('#c9a227', { m: 0.8, r: 0.3 }), x, H - 0.3, z);
    walls.push(trim);
    trim.material = trim.material.clone(); trim.material.transparent = true;
    return m;
  };
  addWall(45, -0.25, 90.5, 0.5);             // north
  addWall(-0.25, 25, 0.5, 50.5);             // west
  addWall(90.25, 25, 0.5, 50.5);             // east

  // Front wall: exterior facade in warm stucco with gold trim
  const facadeTex = canvasTex(256, 256, TEX.plaster, [10, 1]);
  const facade = () => new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.85, transparent: true });
  const fz = W(CASINO_BOTTOM + 7);
  [[W(DOOR.x1) / 2, W(DOOR.x1)], [W(DOOR.x2) + (90 - W(DOOR.x2)) / 2, 90 - W(DOOR.x2)]].forEach(([cx, w]) => {
    const m = box(w, H, 0.7, facade(), cx, H / 2, fz);
    walls.push(m);
  });
  // lintel above the door
  const lintel = box(W(DOOR.x2 - DOOR.x1), 1.6, 0.7, facade(), W((DOOR.x1 + DOOR.x2) / 2), H - 0.8, fz);
  walls.push(lintel);
  // columns
  for (let x = 4; x < 90; x += 8) {
    if (x > W(DOOR.x1) - 2 && x < W(DOOR.x2) + 2) continue;
    cyl(0.35, 0.4, H, mat('#efe2c4', { r: 0.6 }), x, H / 2, fz + 0.5);
    cyl(0.5, 0.5, 0.25, mat('#c9a227', { m: 0.8, r: 0.3 }), x, H - 0.1, fz + 0.5);
  }
  // Glass doors (slide open when you approach)
  const glass = new THREE.MeshStandardMaterial({ color: '#9fc6d8', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.35 });
  doorL = box(2.5, 3.2, 0.1, glass, W(DOOR.x1) + 1.25, 1.6, fz);
  doorR = box(2.5, 3.2, 0.1, glass, W(DOOR.x2) - 1.25, 1.6, fz);
  doorL.castShadow = doorR.castShadow = false;

  // Canopy with a grid of marquee bulbs
  const canopy = box(12, 0.4, 4, mat('#1a1414', { r: 0.5 }), 45, 4.3, fz + 2.2);
  canopy.castShadow = true;
  const bulbGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const bulbs = new THREE.InstancedMesh(bulbGeo, glow('#ffd27a', 4), 60);
  let k = 0;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 30; i++) for (const zz of [fz + 0.25, fz + 4.15]) {
    dummy.position.set(39.2 + i * 0.4, 4.08, zz); dummy.updateMatrix(); bulbs.setMatrixAt(k++, dummy.matrix);
  }
  scene.add(bulbs);
  animated.push({ update: t => { bulbs.material.emissiveIntensity = 3 + Math.sin(t * 6) * 1.5; } });

  // Big neon sign on the roof
  const neon = sign(['GOLDEN MIRAGE', 'CASINO · HOTEL'], 22, 5.2, { color: '#ffe7a3', glow: '#ff3d7f', sub: 0.45, ei: 2.2 });
  neon.position.set(45, H + 2.8, fz + 0.2);
  scene.add(neon);
  animated.push({ update: t => { neon.material.emissiveIntensity = 1.9 + (Math.sin(t * 2.3) > 0.97 ? -1.2 : 0.3 * Math.sin(t * 3)); } });
  const frame = box(22.6, 5.8, 0.3, mat('#16080e', { r: 0.4, m: 0.3 }), 45, H + 2.8, fz - 0.05);
  frame.castShadow = false;

  // "Ceiling": faces down, so it's invisible from the camera above but blocks sunlight inside
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), new THREE.MeshStandardMaterial({ color: '#000', side: THREE.FrontSide }));
  ceil.material.shadowSide = THREE.DoubleSide;
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(45, H, 24.8);
  ceil.castShadow = true;
  ceil.material.colorWrite = false;
  ceil.material.depthWrite = false;
  scene.add(ceil);
}

function buildStreet() {
  // Road (visual extends beyond the walkable map)
  const roadTex = canvasTex(256, 256, TEX.asphalt, [60, 4]);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 14), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2; road.position.set(45, 0.01, W(1130) + 7);
  road.receiveShadow = true;
  scene.add(road);
  // lane markings
  const dashGeo = new THREE.PlaneGeometry(3, 0.15);
  const white = mat('#e8e8e8', { r: 0.6 }), yellow = mat('#e8c547', { r: 0.6 });
  const lanes = [[W(1130) + 3.5, white], [W(1130) + 7, yellow], [W(1130) + 10.5, white]];
  lanes.forEach(([z, m]) => {
    const inst = new THREE.InstancedMesh(dashGeo, m, 70);
    const d = new THREE.Object3D();
    for (let i = 0; i < 70; i++) {
      d.position.set(-95 + i * (m === yellow ? 2.9 : 6), 0.02, z); d.rotation.x = -Math.PI / 2; d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    }
    inst.receiveShadow = true;
    scene.add(inst);
  });
  // crosswalk in front of the entrance
  for (let i = 0; i < 9; i++) {
    const s = plane(0.6, 13.6, white);
    s.rotation.x = -Math.PI / 2; s.position.set(W(DOOR.x1) + 0.5 + i * 0.55 * 1.8, 0.021, W(1130) + 7);
  }
  // curb
  box(400, 0.15, 0.3, mat('#b7b5ad'), 45, 0.07, W(1130));
  box(400, 0.15, 0.3, mat('#b7b5ad'), 45, 0.07, W(1130) + 14);
  // far sidewalk
  const sw2 = new THREE.Mesh(new THREE.PlaneGeometry(400, 5), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, TEX.sidewalk, [100, 1.2]) }));
  sw2.rotation.x = -Math.PI / 2; sw2.position.set(45, 0.03, W(1130) + 16.6); sw2.receiveShadow = true;
  scene.add(sw2);
  // sidewalk extends left/right of the map
  const sw1 = new THREE.Mesh(new THREE.PlaneGeometry(400, W(126)), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, TEX.sidewalk, [100, 1.6]) }));
  sw1.rotation.x = -Math.PI / 2; sw1.position.set(45, 0.001, W(1004) + W(126) / 2); sw1.receiveShadow = true;
  scene.add(sw1);

  // Buildings across the street and beside the casino
  let x = -110;
  while (x < 200) {
    const w = 10 + Math.random() * 18, hgt = 14 + Math.random() * 60, d = 14 + Math.random() * 10;
    const tex = windowsTex(Math.round(w / 2.5), Math.round(hgt / 3.2), 0.4);
    const m = new THREE.MeshStandardMaterial({ color: pickArr(['#2a2e38', '#3a3430', '#1f2a33', '#342a3a', '#2d3a34']), roughness: 0.6, metalness: 0.2, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1 });
    nightLit.push({ m, day: 0.08, night: 1.1 });
    const b = box(w, hgt, d, m, x + w / 2, hgt / 2, W(1130) + 19.5 + d / 2);
    b.castShadow = false;
    if (Math.random() < 0.4) {
      const n = sign(pickArr(['HOTEL', 'BAR', 'LIVE SHOW', 'BUFFET $9.99', 'PAWN', 'WEDDING CHAPEL', 'LOANS', 'MOTEL']), Math.min(w * 0.8, 10), 2, { color: pickArr(['#ff4fa3', '#4fd1ff', '#ffe066', '#7dff8a']), glow: '#fff', ei: 2.4 });
      n.position.set(x + w / 2, Math.min(hgt - 2, 8 + Math.random() * 10), W(1130) + 19.4);
      n.rotation.y = Math.PI;
      scene.add(n);
    }
    x += w + 1 + Math.random() * 3;
  }
  // buildings flanking the casino so the world doesn't end
  [[-20, 25, 38, 50, 30], [110, 25, 38, 50, 44]].forEach(([cx, cz, w, d, h]) => {
    const tex = windowsTex(10, 12, 0.35);
    const m = new THREE.MeshStandardMaterial({ color: '#2b2630', emissive: 0xffffff, emissiveMap: tex, roughness: 0.6 });
    nightLit.push({ m, day: 0.08, night: 1 });
    box(w, h, d, m, cx, h / 2, cz);
  });

  // Street lights & palm trees along the curb
  let lightIdx = 0;
  for (let mx = 60; mx < 1800; mx += 240) {
    if (Math.abs(mx - 900) < 90) continue;
    const px = W(mx), pz = W(1124);
    const post = cyl(0.08, 0.1, 6.5, mat('#2b2b2e', { m: 0.6, r: 0.4 }), px, 3.25, pz);
    box(0.08, 0.08, 1.4, mat('#2b2b2e', { m: 0.6 }), px, 6.4, pz + 0.65);
    const lampMat = glow('#ffcf80', 1);
    nightLit.push({ m: lampMat, day: 0.2, night: 4, emissive: true });
    box(0.5, 0.15, 0.35, lampMat, px, 6.3, pz + 1.3);
    if (lightIdx++ % 2 === 0) {
      const l = new THREE.PointLight('#ffc680', 0, 22, 1.5);
      l.position.set(px, 6, pz + 1.3);
      scene.add(l);
      nightLit.push({ light: l, day: 0, night: LOW ? 25 : 40 });
    }
    if (Math.abs(mx + 120 - 900) > 150) palm(W(mx + 120), W(1126));
  }
  // palms on the far side too
  for (let mx = -600; mx < 2600; mx += 300) palm(W(mx), W(1130) + 17.5);

  // trash cans & hydrants
  [300, 1000, 1500].forEach(mx => {
    cyl(0.3, 0.26, 0.9, mat('#1f3d2b', { r: 0.6 }), W(mx), 0.45, W(1090));
  });
  cyl(0.12, 0.14, 0.7, mat('#b3261e', { r: 0.4 }), W(1060), 0.35, W(1118));
}

function palm(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunkMat = mat('#6d5234', { r: 0.9 });
  for (let i = 0; i < 8; i++) {
    const seg = cyl(0.17 - i * 0.008, 0.2 - i * 0.008, 1, trunkMat, Math.sin(i * 0.25) * 0.15, i * 0.95 + 0.5, 0, g, 8);
    seg.castShadow = true;
  }
  const leafGeo = new THREE.ConeGeometry(0.35, 3.2, 4);
  leafGeo.translate(0, 1.6, 0);
  const leafMat = mat('#2f6b2a', { r: 0.8 });
  for (let i = 0; i < 9; i++) {
    const l = new THREE.Mesh(leafGeo, leafMat);
    l.position.set(0.9 * 0.15, 8, 0);
    l.rotation.set(0, (i / 9) * Math.PI * 2, 1.25 + Math.random() * 0.3);
    l.rotation.order = 'YXZ';
    l.scale.set(1, 1, 0.25);
    l.castShadow = true;
    g.add(l);
  }
  scene.add(g);
}

// Slot machine screen textures (a few variants, animated by scrolling)
const SLOT_TEX = [];
function slotScreen(i) {
  if (SLOT_TEX[i]) return SLOT_TEX[i];
  const syms = ['7', '$', '♦', 'BAR', '♣', '★', '♥'];
  const t = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#fff8e6'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 3; r++) for (let j = 0; j < 8; j++) {
      const s = syms[(j * 3 + r * 5 + i) % syms.length];
      g.fillStyle = ['#c1121f', '#1f3a93', '#0f7a3a', '#111', '#8e44ad'][(j + r + i) % 5];
      g.font = `900 ${s.length > 1 ? 36 : 60}px Impact, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s, r * 85 + 43, j * 64 + 32);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(84, 0, 3, h); g.fillRect(170, 0, 3, h);
  });
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 0.4);
  SLOT_TEX[i] = t;
  return t;
}

function feltTex(kind) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#0f6b3a'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 3000, 0.05);
    g.strokeStyle = '#e8d9a0'; g.fillStyle = '#e8d9a0'; g.lineWidth = 3;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (kind === 'blackjack') {
      g.beginPath(); g.arc(w / 2, -60, 240, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
      g.font = 'bold 22px Georgia, serif'; g.fillText('BLACKJACK PAYS 6 TO 5', w / 2, 150);
      g.font = '16px Georgia, serif'; g.fillText('Dealer must hit soft 17', w / 2, 180);
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(90 + i * 83, 215 - Math.abs(2 - i) * 18, 18, 0, Math.PI * 2); g.stroke(); }
    } else if (kind === 'roulette') {
      for (let c = 0; c < 12; c++) for (let r = 0; r < 3; r++) {
        const n = c * 3 + (3 - r);
        g.fillStyle = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n) ? '#b3121f' : '#111';
        g.fillRect(150 + c * 28, 40 + r * 40, 26, 38);
        g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText(n, 163 + c * 28, 59 + r * 40);
      }
      g.fillStyle = '#0a7a3a'; g.fillRect(120, 40, 28, 118); g.fillStyle = '#fff'; g.fillText('0', 134, 99);
      g.strokeRect(150, 170, 336, 40); g.font = 'bold 14px sans-serif';
      ['1st 12', '2nd 12', '3rd 12'].forEach((s, i) => g.fillText(s, 206 + i * 112, 190));
    } else if (kind === 'craps') {
      g.font = 'bold 26px Georgia, serif';
      g.fillText('PASS LINE', w / 2, 225); g.fillText("DON'T PASS BAR", w / 2, 190);
      g.strokeRect(20, 20, w - 40, h - 40); g.strokeRect(60, 60, w - 120, 90);
      g.font = 'bold 20px sans-serif';
      [4, 5, 6, 8, 9, 10].forEach((n, i) => g.fillText(n, 110 + i * 60, 105));
    } else if (kind === 'baccarat') {
      g.font = 'bold 26px Georgia, serif';
      g.fillText('BANKER', w / 2, 90); g.fillText('PLAYER', w / 2, 160);
      g.font = '16px Georgia, serif'; g.fillText('TIE PAYS 8 TO 1', w / 2, 210);
      g.strokeRect(40, 60, w - 80, 60); g.strokeRect(40, 130, w - 80, 60);
    }
  });
}

function wheelTex(segments, labels) {
  return canvasTex(512, 512, (g, w, h) => {
    const r = w / 2;
    for (let i = 0; i < segments.length; i++) {
      const a0 = (i / segments.length) * Math.PI * 2, a1 = ((i + 1) / segments.length) * Math.PI * 2;
      g.fillStyle = segments[i]; g.beginPath(); g.moveTo(r, r); g.arc(r, r, r - 4, a0, a1); g.closePath(); g.fill();
      if (labels) {
        g.save(); g.translate(r, r); g.rotate((a0 + a1) / 2);
        g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
        g.fillText(labels[i], r - 14, 0); g.restore();
      }
    }
    g.strokeStyle = '#c9a227'; g.lineWidth = 10; g.beginPath(); g.arc(r, r, r - 6, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#c9a227'; g.beginPath(); g.arc(r, r, r * 0.18, 0, Math.PI * 2); g.fill();
  });
}

function chipStacks(parent, w, d, y) {
  const colors = ['#b91c1c', '#1d4ed8', '#15803d', '#111', '#7e22ce', '#f5f5f5'];
  for (let i = 0; i < 6; i++) {
    const n = 2 + Math.floor(Math.random() * 6);
    const cx = (Math.random() - 0.5) * w * 0.7, cz = (Math.random() - 0.5) * d * 0.5;
    const c = cyl(0.045, 0.045, n * 0.012, mat(pickArr(colors), { r: 0.4 }), cx, y + n * 0.006, cz, parent, 12);
    c.castShadow = false;
  }
}

function tableBase(g, o, kind) {
  const w = W(o.w) * 0.92, d = W(o.h) * 0.8;
  box(w * 0.85, 0.72, d * 0.7, mat('#3a2415', { r: 0.6 }), 0, 0.36, 0, g);
  const top = box(w, 0.08, d, [mat('#3a2415'), mat('#3a2415'), new THREE.MeshStandardMaterial({ map: feltTex(kind), roughness: 0.95 }), mat('#3a2415'), mat('#3a2415'), mat('#3a2415')], 0, 0.78, 0, g);
  top.receiveShadow = true;
  const rail = mat('#2a1208', { r: 0.35, m: 0.1 });
  box(w + 0.2, 0.12, 0.18, rail, 0, 0.86, d / 2 + 0.05, g);
  box(0.18, 0.12, d + 0.2, rail, -w / 2 - 0.05, 0.86, 0, g);
  box(0.18, 0.12, d + 0.2, rail, w / 2 + 0.05, 0.86, 0, g);
  // chip rack on dealer side
  box(w * 0.4, 0.06, 0.3, mat('#1a1a1a', { r: 0.3 }), 0, 0.85, -d / 2 + 0.25, g);
  chipStacks(g, w, d, 0.83);
  // cards
  for (let i = 0; i < 4; i++) {
    const c = plane(0.09, 0.13, mat('#fafafa', { r: 0.5 }), g);
    c.rotation.x = -Math.PI / 2; c.rotation.z = Math.random() * 0.5 - 0.25;
    c.position.set(-w * 0.3 + i * w * 0.2, 0.831, d * 0.15);
  }
  // table lamp overhead
  const lampMat = glow('#ffe2a6', 1.5);
  box(Math.min(w * 0.6, 3), 0.1, 0.5, lampMat, 0, 3.4, 0, g).castShadow = false;
  return { w, d };
}

function buildObject(o) {
  if (o.wall || o.road) return;
  const g = objGroup(o);
  const w = W(o.w), d = W(o.h);
  switch (o.type || o.decor) {
    case 'slots': {
      const v = Math.floor(Math.random() * 3);
      const cabinet = mat(['#3a1552', '#14304f', '#4f1414'][v], { r: 0.35, m: 0.5 });
      box(1.3, 1.9, 1.0, cabinet, 0, 0.95, -0.2, g);
      box(1.36, 0.08, 1.06, mat('#c9a227', { m: 0.9, r: 0.25 }), 0, 1.92, -0.2, g);
      const tex = slotScreen(v);
      const screen = plane(0.95, 0.7, new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 }), g);
      screen.position.set(0, 1.3, 0.305);
      box(1.3, 0.12, 0.45, mat('#111', { r: 0.4 }), 0, 0.92, 0.5, g); // button deck
      const btn = glow(['#ff3d3d', '#3dff7a', '#3db0ff'][v], 2.2);
      [-0.35, 0, 0.35].forEach(bx => box(0.12, 0.04, 0.1, btn, bx, 1.0, 0.6, g).castShadow = false);
      const topMat = glow(['#ff2fb0', '#29d2ff', '#ffb300'][v], 2);
      const topper = box(1.2, 0.5, 0.9, topMat, 0, 2.2, -0.2, g);
      topper.castShadow = false;
      const phase = Math.random() * 10;
      animated.push({ update: t => {
        topMat.emissiveIntensity = 1.6 + Math.sin(t * 5 + phase) * 1.2;
        tex.offset.y = (t * 0.05 + phase) % 1;
      } });
      break;
    }
    case 'blackjack': case 'blackjack_hl': tableBase(g, o, 'blackjack'); break;
    case 'baccarat': case 'baccarat_hl': tableBase(g, o, 'baccarat'); break;
    case 'craps': {
      const { w: tw } = tableBase(g, o, 'craps');
      box(tw + 0.3, 0.3, 0.2, mat('#2a1208', { r: 0.35 }), 0, 1.0, -W(o.h) * 0.4 - 0.05, g);
      [-0.2, 0.2].forEach(dx => box(0.08, 0.08, 0.08, mat('#f5f5f5', { r: 0.2 }), dx, 0.88, 0.1, g));
      break;
    }
    case 'roulette': {
      const { w: tw } = tableBase(g, o, 'roulette');
      const reds = [], labels = [];
      const order = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, -1, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
      order.forEach(n => { reds.push(n <= 0 ? '#0a7a3a' : [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n) ? '#b3121f' : '#111'); labels.push(n === -1 ? '00' : n); });
      const bowl = cyl(0.75, 0.6, 0.18, mat('#3a2415', { r: 0.4 }), -tw / 2 + 0.85, 0.9, 0, g, 32);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 48), [mat('#3a2415'), new THREE.MeshStandardMaterial({ map: wheelTex(reds, labels), roughness: 0.4 }), mat('#3a2415')]);
      wheel.position.set(-tw / 2 + 0.85, 1.0, 0);
      g.add(wheel);
      cyl(0.03, 0.08, 0.2, mat('#c9a227', { m: 0.9, r: 0.2 }), -tw / 2 + 0.85, 1.12, 0, g);
      animated.push({ update: (t, dt) => { wheel.rotation.y += dt * 0.8; } });
      bowl.castShadow = true;
      break;
    }
    case 'bigsix': {
      box(0.6, 1.2, 0.6, mat('#3a2415', { r: 0.5 }), 0, 0.6, -0.4, g);
      cyl(0.08, 0.08, 1.5, mat('#c9a227', { m: 0.9 }), 0, 1.7, -0.4, g);
      const segs = [], labels = [];
      const pool = [];
      [['$1', 24, '#e8e2d0'], ['$2', 15, '#3a6fd8'], ['$5', 7, '#d8a63a'], ['$10', 4, '#3ab86b'], ['$20', 2, '#b83a3a'], ['JOKER', 1, '#7d3ab8'], ['LOGO', 1, '#111']]
        .forEach(([l, n, c]) => { for (let i = 0; i < n; i++) pool.push([l, c]); });
      for (let i = 0; i < 54; i++) { const p = pool[(i * 17) % 54]; segs.push(p[1]); labels.push(p[0]); }
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 54), [mat('#c9a227', { m: 0.9, r: 0.3 }), new THREE.MeshStandardMaterial({ map: wheelTex(segs, labels), roughness: 0.5 }), mat('#3a2415')]);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(0, 2.6, -0.3);
      g.add(wheel);
      const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), glow('#ffe08a', 3), 36);
      const dm = new THREE.Object3D();
      for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; dm.position.set(Math.cos(a) * 1.72, 2.6 + Math.sin(a) * 1.72, -0.22); dm.updateMatrix(); bulbs.setMatrixAt(i, dm.matrix); }
      g.add(bulbs);
      animated.push({ update: (t, dt) => { wheel.rotation.y += dt * 0.35; bulbs.material.emissiveIntensity = 2 + Math.sin(t * 8) * 1.5; } });
      break;
    }
    case 'hotdog': case 'buffet': case 'steak': {
      const names = { hotdog: ['HOT DOGS', '#ff9f1c'], buffet: ['GRAND BUFFET', '#ffd166'], steak: ['PRIME STEAKHOUSE', '#ff6b6b'] }[o.type];
      box(w * 0.95, 1.05, d * 0.7, mat('#5a3620', { r: 0.6 }), 0, 0.52, 0, g);
      box(w, 0.06, d * 0.8, new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, TEX.marble), roughness: 0.25 }), 0, 1.08, 0, g);
      const glass = new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.25, roughness: 0.05 });
      box(w * 0.9, 0.4, 0.04, glass, 0, 1.35, d * 0.2, g).castShadow = false;
      for (let i = 0; i < 5; i++) box(0.3, 0.08, 0.2, mat(pickArr(['#c0392b', '#e67e22', '#f1c40f', '#8e5a2a', '#27ae60']), { r: 0.6 }), -w * 0.35 + i * w * 0.17, 1.15, 0, g);
      const s = sign(names[0], Math.min(w, 7), 0.9, { color: names[1], glow: names[1], bg: '#1a0f08', ei: 1.4 });
      s.position.set(0, 2.9, -d / 2 - 0.35);
      g.add(s);
      box(w * 0.95, 0.12, 0.12, mat('#2a1a10'), 0, 2.9, -d / 2 - 0.42, g);
      break;
    }
    case 'bar': {
      box(w, 1.1, d * 0.7, new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, TEX.wood, [4, 1]), roughness: 0.4 }), 0, 0.55, 0, g);
      box(w + 0.2, 0.07, d * 0.85, mat('#c9a227', { m: 0.85, r: 0.25 }), 0, 1.12, 0, g);
      box(w, 0.04, 0.05, glow('#4fd1ff', 2.5), 0, 0.15, d * 0.36, g).castShadow = false;
      // back bar shelves with glowing bottles
      const shelfZ = -d / 2 - 1.1;
      box(w, 2.6, 0.4, mat('#1a1010', { r: 0.4 }), 0, 1.3, shelfZ, g);
      box(w, 0.05, 0.45, glow('#ffb35c', 1.6), 0, 1.25, shelfZ + 0.05, g).castShadow = false;
      box(w, 0.05, 0.45, glow('#ffb35c', 1.6), 0, 1.95, shelfZ + 0.05, g).castShadow = false;
      const bottleGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.32, 8);
      ['#2e7d32', '#8d6e63', '#c62828', '#f9a825', '#6a1b9a', '#b0bec5'].forEach((c, ci) => {
        const inst = new THREE.InstancedMesh(bottleGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, metalness: 0.1, emissive: c, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }), 12);
        const dm = new THREE.Object3D();
        for (let i = 0; i < 12; i++) { dm.position.set(-w / 2 + 0.3 + (i * 6 + ci) * (w - 0.6) / 72, i % 2 ? 1.45 : 2.15, shelfZ + 0.12); dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix); }
        g.add(inst);
      });
      const s = sign('THE LUCKY BAR', 5, 0.9, { color: '#4fd1ff', glow: '#4fd1ff', ei: 2 });
      s.position.set(0, 3.1, shelfZ + 0.22); g.add(s);
      for (let i = 0; i < 6; i++) stool(W(o.x) + 0.8 + i * (w - 1.6) / 5, W(o.y + o.h) + 0.55, '#8b0a1a');
      break;
    }
    case 'hotel': {
      box(w, 1.1, d * 0.8, new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, TEX.marble), roughness: 0.2 }), 0, 0.55, 0, g);
      box(w + 0.1, 0.06, d * 0.9, mat('#c9a227', { m: 0.9, r: 0.2 }), 0, 1.12, 0, g);
      cyl(0.06, 0.08, 0.08, mat('#c9a227', { m: 1, r: 0.15 }), w * 0.3, 1.19, 0.1, g);
      const back = box(w + 1, 3.4, 0.2, mat('#2a2230', { r: 0.5 }), 0, 1.7, -d / 2 - 1.2, g);
      back.castShadow = false;
      const s = sign(['GOLDEN MIRAGE', 'HOTEL & SUITES'], 4.4, 1.2, { color: '#f2c14e', glow: '#f2c14e', sub: 0.5, ei: 1.6 });
      s.position.set(0, 2.5, -d / 2 - 1.08); g.add(s);
      break;
    }
    case 'elevator': {
      box(w, 3.2, d * 0.5, mat('#c9a227', { m: 0.9, r: 0.25 }), 0, 1.6, -d * 0.2, g);
      box(w * 0.8, 2.6, d * 0.52, mat('#9aa3ad', { m: 1, r: 0.2 }), 0, 1.3, -d * 0.2, g);
      box(0.4, 0.15, 0.05, glow('#ff4040', 2), 0, 2.9, d * 0.08, g);
      break;
    }
    case 'cashier': {
      box(w, 1.1, d * 0.6, mat('#3a2415', { r: 0.5 }), 0, 0.55, 0, g);
      box(w, 0.06, d * 0.7, mat('#c9a227', { m: 0.9, r: 0.2 }), 0, 1.12, 0, g);
      const barMat = mat('#c9a227', { m: 1, r: 0.2 });
      for (let i = 0; i <= 20; i++) cyl(0.015, 0.015, 1.3, barMat, -w / 2 + i * w / 20, 1.8, 0.1, g, 6).castShadow = false;
      box(w, 0.1, 0.1, barMat, 0, 2.45, 0.1, g);
      const s = sign('CASHIER', 3, 0.6, { color: '#f2c14e', glow: '#f2c14e', ei: 1.6 });
      s.position.set(0, 2.9, 0.1); g.add(s);
      break;
    }
    case 'atm': {
      box(w * 0.8, 1.7, d * 0.6, mat('#2e3a46', { m: 0.6, r: 0.3 }), 0, 0.85, 0, g);
      const sc = box(w * 0.55, 0.35, 0.02, glow('#3b82f6', 1.5), 0, 1.3, d * 0.3, g);
      sc.castShadow = false;
      const s = sign('ATM', 1.2, 0.4, { color: '#fff', bg: '#1d4ed8', ei: 1.2 });
      s.position.set(0, 1.95, d * 0.31); g.add(s);
      break;
    }
    case 'fountain': case 'tap': {
      box(0.4, 1.0, 0.4, mat('#a8b3bd', { m: 0.8, r: 0.25 }), 0, 0.5, 0, g);
      cyl(0.2, 0.15, 0.1, mat('#cfd8dc', { m: 0.9, r: 0.15 }), 0, 1.02, 0, g);
      break;
    }
    case 'poster': {
      box(0.08, 1.2, 0.08, mat('#222'), 0, 0.6, 0, g);
      const s = sign(['PROBLEM GAMBLING?', 'CALL 1-800-GAMBLER', 'Free · Confidential · 24/7'], w, 1.2, { color: '#111', bg: '#f5f1e6', sub: 0.55, font: '"Barlow Condensed", Arial, sans-serif', ei: 0.35 });
      s.position.set(0, 1.6, 0.05); g.add(s);
      break;
    }
    case 'noclock': {
      const s = sign(['NO CLOCKS', 'NO WINDOWS'], w, d * 1.4, { color: '#f2c14e', bg: '#1a1420', sub: 0.8, ei: 0.8 });
      s.position.set(0, 1.4, 0); g.add(s);
      box(0.06, 1.0, 0.06, mat('#222'), 0, 0.5, 0, g);
      break;
    }
    case 'sofa': {
      const velvet = mat('#5a1030', { r: 0.9 });
      box(w, 0.45, d * 0.8, velvet, 0, 0.23, 0, g);
      box(w, 0.6, 0.25, velvet, 0, 0.6, -d * 0.35, g);
      box(0.25, 0.35, d * 0.8, velvet, -w / 2 + 0.12, 0.55, 0, g);
      box(0.25, 0.35, d * 0.8, velvet, w / 2 - 0.12, 0.55, 0, g);
      break;
    }
    case 'diningTable': {
      cyl(0.9, 0.9, 0.06, mat('#f5f5f5', { r: 0.8 }), 0, 0.78, 0, g, 24);
      cyl(0.08, 0.12, 0.76, mat('#333'), 0, 0.38, 0, g);
      [[0, 1.1], [0, -1.1], [1.1, 0], [-1.1, 0]].forEach(([x, z]) => box(0.45, 0.45, 0.45, mat('#5a3a20'), x, 0.23, z, g));
      break;
    }
    case 'streetsleep': {
      box(w * 0.9, 0.05, d * 0.9, mat('#a07c4c', { r: 1 }), 0, 0.03, 0, g);
      box(w * 0.5, 0.15, d * 0.6, mat('#5a4a7a', { r: 1 }), w * 0.1, 0.1, 0, g);
      box(0.9, 0.7, 0.7, mat('#8a6a3c', { r: 1 }), -w * 0.4, 0.35, -d * 0.2, g);
      // shopping cart
      box(0.8, 0.5, 0.5, mat('#9aa3ad', { m: 0.8, r: 0.3, opacity: 0.6 }), w * 0.55, 0.65, -d * 0.1, g);
      break;
    }
    case 'soup': case 'pawn': case 'gunstore': {
      const cfg = {
        soup: { wall: '#6b7d5a', awning: '#2e7d32', text: ['COMMUNITY', 'SOUP KITCHEN'], col: '#fff' },
        pawn: { wall: '#6a5a7a', awning: '#6a1b9a', text: ['PAWN', 'CASH FOR GOLD'], col: '#ffd54a' },
        gunstore: { wall: '#4a4036', awning: '#8b0000', text: ['GUNS & AMMO', 'SELF DEFENSE'], col: '#ff3b30' },
      }[o.type];
      box(w, 3.4, d * 0.7, mat(cfg.wall, { r: 0.85 }), 0, 1.7, -d * 0.15, g);
      box(w * 0.3, 2.2, 0.05, mat('#1a1a1a', { r: 0.3 }), -w * 0.25, 1.1, d * 0.21, g);
      const win = box(w * 0.4, 1.2, 0.05, glow('#ffd9a0', 0.9), w * 0.2, 1.5, d * 0.21, g);
      win.castShadow = false;
      const awn = box(w + 0.3, 0.1, 1.3, mat(cfg.awning, { r: 0.8 }), 0, 2.65, d * 0.21 + 0.55, g);
      awn.rotation.x = 0.25;
      const s = sign(cfg.text, w * 0.95, 0.9, { color: cfg.col, glow: cfg.col, sub: 0.5, bg: '#140c0c', ei: 1.8 });
      s.position.set(0, 3.1, d * 0.21 + 0.03); g.add(s);
      break;
    }
    case 'busstop': {
      box(w, 0.1, d * 0.8, mat('#2b2b2e', { m: 0.5 }), 0, 2.5, 0, g);
      box(w, 2.4, 0.05, new THREE.MeshStandardMaterial({ color: '#9fc6d8', transparent: true, opacity: 0.3, roughness: 0.05 }), 0, 1.25, -d * 0.35, g).castShadow = false;
      box(w * 0.7, 0.08, 0.45, mat('#5a4a3a'), 0, 0.5, -d * 0.2, g);
      [-w / 2, w / 2].forEach(x => cyl(0.05, 0.05, 2.5, mat('#2b2b2e', { m: 0.6 }), x, 1.25, -d * 0.35, g));
      const s = sign(['BUS', 'OUT OF TOWN'], 1.6, 0.8, { color: '#fff', bg: '#0e7490', sub: 0.5, ei: 1.3 });
      s.position.set(w / 2 + 0.2, 2.9, d * 0.3); g.add(s);
      cyl(0.04, 0.04, 2.8, mat('#aaa', { m: 0.8 }), w / 2 + 0.2, 1.4, d * 0.25, g);
      break;
    }
    default:
      box(w, 1, d, mat(o.color || '#555'), 0, 0.5, 0, g);
  }
}

function stool(x, z, color = '#7a0f1f') {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  cyl(0.04, 0.12, 0.62, mat('#c9a227', { m: 0.9, r: 0.25 }), 0, 0.31, 0, g, 8);
  cyl(0.22, 0.2, 0.1, mat(color, { r: 0.8 }), 0, 0.66, 0, g, 16);
  scene.add(g);
}

function buildSeats() {
  for (const o of OBJECTS) {
    if (o.type === 'slots') { const s = slotSeat(o); stool(W(s.x), W(s.y)); }
    else if (DEALER_TABLES.includes(o.type)) tableSeats(o).forEach(s => stool(W(s.x), W(s.y), '#14304f'));
  }
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
const G = {};
function humanGeos() {
  if (G.leg) return;
  G.leg = new THREE.CapsuleGeometry(0.075, 0.62, 4, 8); G.leg.translate(0, -0.385, 0);
  G.arm = new THREE.CapsuleGeometry(0.058, 0.5, 4, 8); G.arm.translate(0, -0.31, 0);
  G.torso = new THREE.CapsuleGeometry(0.2, 0.34, 4, 12);
  G.head = new THREE.SphereGeometry(0.12, 18, 14);
  G.hand = new THREE.SphereGeometry(0.052, 8, 6);
  G.shoe = new THREE.BoxGeometry(0.11, 0.08, 0.25);
  G.neck = new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8);
  G.hairTop = new THREE.SphereGeometry(0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  G.hairBack = new THREE.BoxGeometry(0.24, 0.3, 0.08);
  G.eye = new THREE.SphereGeometry(0.018, 6, 4);
  G.skirt = new THREE.CylinderGeometry(0.2, 0.32, 0.46, 12);
  G.shadow = new THREE.CircleGeometry(0.38, 16);
  G.pistol = new THREE.BoxGeometry(0.05, 0.22, 0.1);
  G.shotgun = new THREE.BoxGeometry(0.06, 0.85, 0.08);
}
const shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false });

function buildHuman(L) {
  humanGeos();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat(L.skin, { r: 0.6 });
  const top = mat(L.top, { r: 0.8 });
  const outer = L.jacket ? mat(L.jacket, { r: 0.6 }) : L.vest ? mat(L.vest, { r: 0.6 }) : top;
  const bottom = mat(L.bottom, { r: 0.85 });
  const hairM = mat(L.hair, { r: 0.7 });

  const sh = new THREE.Mesh(G.shadow, shadowMat);
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.015;
  root.add(sh);

  const parts = {};
  ['L', 'R'].forEach((s, i) => {
    const side = i ? -1 : 1;
    const hip = new THREE.Group();
    hip.position.set(0.1 * side, 0.93, 0);
    const leg = new THREE.Mesh(G.leg, L.skirt ? skin : bottom); leg.castShadow = true; hip.add(leg);
    const shoe = new THREE.Mesh(G.shoe, mat(L.shoes, { r: 0.4 })); shoe.position.set(0, -0.8, 0.05); shoe.castShadow = true; hip.add(shoe);
    body.add(hip);
    parts['leg' + s] = hip;
    const shoulder = new THREE.Group();
    shoulder.position.set(0.25 * side * L.build, 1.47, 0);
    const arm = new THREE.Mesh(G.arm, L.vest ? top : outer); arm.castShadow = true; shoulder.add(arm);
    const hand = new THREE.Mesh(G.hand, skin); hand.position.y = -0.64; shoulder.add(hand);
    body.add(shoulder);
    parts['arm' + s] = shoulder;
  });
  const torso = new THREE.Mesh(G.torso, outer);
  torso.position.y = 1.25; torso.scale.set(1.1 * L.build, 1, 0.7 * L.build);
  torso.castShadow = true;
  body.add(torso);
  if (L.jacket || L.vest) {
    const shirt = box(0.14, 0.34, 0.02, top, 0, 1.33, 0.14 * L.build, body);
    shirt.castShadow = false;
  }
  if (L.tie) box(0.045, 0.3, 0.02, mat(L.tie), 0, 1.3, 0.155 * L.build, body).castShadow = false;
  if (L.skirt) { const sk = new THREE.Mesh(G.skirt, bottom); sk.position.y = 0.86; sk.castShadow = true; body.add(sk); }
  else box(0.34 * L.build, 0.16, 0.2 * L.build, bottom, 0, 0.95, 0, body); // hips

  const headG = new THREE.Group();
  headG.position.y = 1.64;
  body.add(headG);
  const neck = new THREE.Mesh(G.neck, skin); neck.position.y = 0.0; headG.add(neck);
  const head = new THREE.Mesh(G.head, L.mask ? mat('#141414', { r: 0.9 }) : skin);
  head.position.y = 0.14; head.scale.set(1, 1.12, 1.02); head.castShadow = true;
  headG.add(head);
  const eyeM = mat(L.mask ? '#f5f5f5' : '#1a1a1a', { r: 0.3 });
  [-1, 1].forEach(s => { const e = new THREE.Mesh(G.eye, eyeM); e.position.set(0.042 * s, 0.165, 0.108); headG.add(e); });
  if (L.mask) box(0.16, 0.035, 0.02, skin, 0, 0.165, 0.112, headG).castShadow = false;
  if (!L.mask && L.hairStyle !== 'bald' && L.hat !== 'hood') {
    const ht = new THREE.Mesh(G.hairTop, hairM);
    ht.position.set(0, 0.16, -0.01);
    if (L.hairStyle === 'buzz') ht.scale.setScalar(0.96);
    headG.add(ht);
    if (L.hairStyle === 'long') { const hb = new THREE.Mesh(G.hairBack, hairM); hb.position.set(0, 0.03, -0.09); headG.add(hb); }
    if (L.hairStyle === 'bun') { const b = new THREE.Mesh(G.hand, hairM); b.scale.setScalar(1.3); b.position.set(0, 0.25, -0.12); headG.add(b); }
    if (L.hairStyle === 'bob') { const hb = new THREE.Mesh(G.hairBack, hairM); hb.scale.set(1.1, 0.6, 1.6); hb.position.set(0, 0.1, -0.05); headG.add(hb); }
  }
  if (L.beard) { const b = new THREE.Mesh(G.head, hairM); b.scale.set(0.85, 0.55, 0.7); b.position.set(0, 0.05, 0.035); headG.add(b); }
  if (L.glasses || L.shades) box(0.2, 0.04, 0.02, mat(L.shades ? '#050505' : '#333', { r: 0.1, m: 0.5 }), 0, 0.17, 0.118, headG).castShadow = false;
  if (L.hat === 'cap') {
    cyl(0.13, 0.13, 0.08, mat(L.top === '#1a1d24' ? '#111' : pickArr(['#c0392b', '#1f3a93', '#111']), { r: 0.7 }), 0, 0.27, 0, headG);
    box(0.2, 0.02, 0.12, mat('#111'), 0, 0.24, 0.13, headG);
  } else if (L.hat === 'cowboy') {
    cyl(0.25, 0.25, 0.02, mat('#6d4c2b', { r: 0.8 }), 0, 0.25, 0, headG, 20);
    cyl(0.11, 0.13, 0.14, mat('#6d4c2b', { r: 0.8 }), 0, 0.32, 0, headG);
  } else if (L.hat === 'chef') {
    cyl(0.13, 0.12, 0.22, mat('#fafafa'), 0, 0.35, 0, headG);
  } else if (L.hat === 'beanie') {
    const b = new THREE.Mesh(G.hairTop, mat('#7a2a1a', { r: 1 })); b.scale.setScalar(1.08); b.position.y = 0.17; headG.add(b);
  } else if (L.hat === 'hood') {
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.7), mat(L.top, { r: 0.9 }));
    hd.position.set(0, 0.15, -0.03); hd.rotation.x = -0.35; headG.add(hd);
  }

  // weapon (hidden until needed)
  const gun = new THREE.Group();
  const pistol = new THREE.Mesh(G.pistol, mat('#1a1a1a', { m: 0.7, r: 0.35 }));
  pistol.position.set(0, -0.72, 0.05);
  const shotgun = new THREE.Mesh(G.shotgun, mat('#2a1f18', { m: 0.3, r: 0.5 }));
  shotgun.position.set(0, -0.9, 0.05);
  gun.add(pistol, shotgun);
  gun.visible = false;
  parts.armR.add(gun);

  root.scale.setScalar(L.height);
  Object.assign(parts, { root, body, torso, headG, gun, pistol, shotgun });
  root.traverse(o => { if (o.isMesh) o.userData.rigRoot = root; });
  return parts;
}

function poseHuman(h, e, t) {
  const p = e.pose, a = e.anim || 0;
  const { body, legL, legR, armL, armR, torso } = h;
  body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
  legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0);
  armL.rotation.set(0, 0, 0.06); armR.rotation.set(0, 0, -0.06);
  if (p === 'walk' || p === 'run') {
    const f = p === 'run' ? 11 : 7.5, amp = p === 'run' ? 0.9 : 0.55;
    const s = Math.sin(a * f);
    legL.rotation.x = s * amp; legR.rotation.x = -s * amp;
    armL.rotation.x = -s * amp * 0.8; armR.rotation.x = s * amp * 0.8;
    body.position.y = Math.abs(Math.cos(a * f)) * (p === 'run' ? 0.07 : 0.035);
    if (p === 'run') body.rotation.x = 0.12;
  } else if (p === 'sit') {
    body.position.y = -0.32;
    legL.rotation.x = legR.rotation.x = -1.45;
    armL.rotation.x = armR.rotation.x = -0.9;
    armR.rotation.x += Math.sin(t * 3 + a) * 0.15; // pulling the lever / placing chips
  } else if (p === 'aim') {
    armR.rotation.x = -1.5; armL.rotation.x = -1.35; armL.rotation.z = -0.35;
  } else if (p === 'down') {
    body.rotation.x = -Math.PI / 2; body.position.set(0, 0.2, -0.9);
    armL.rotation.z = 1.2; armR.rotation.z = -1.2;
  } else {
    torso.scale.y = 1 + Math.sin(t * 2 + a) * 0.012;
    if (e.role === 'dealer') { armL.rotation.x = armR.rotation.x = -0.5 + Math.sin(t * 1.3 + a) * 0.1; }
  }
}

function syncHumans(t, dt) {
  const list = [player, ...npcs];
  const seen = new Set();
  for (const e of list) {
    seen.add(e);
    let h = humans.get(e);
    if (!h) {
      const look = e === player ? PLAYER_LOOK : e.look;
      h = buildHuman(look);
      h.root.userData.target = e === player ? null : e;
      scene.add(h.root);
      if (e !== player) pickables.push(h.root);
      if (e.role === 'robber' || e.role === 'thug') {
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), glow('#ff2d2d', 3));
        m.rotation.x = Math.PI; m.position.y = 2.35;
        h.root.add(m); h.enemyMark = m;
      }
      humans.set(e, h);
    }
    h.root.position.set(W(e.x), 0, W(e.y));
    h.root.rotation.y = e.face || 0;
    poseHuman(h, e, t);
    const armed = e === player ? !!S.equipped : (e.role === 'robber' || e.role === 'thug') && e.pose !== 'down';
    h.gun.visible = armed;
    if (armed) {
      const kind = e === player ? S.equipped : e.role === 'thug' ? 'pistol' : 'pistol';
      h.pistol.visible = kind === 'pistol'; h.shotgun.visible = kind === 'shotgun';
      if (e === player && e.pose !== 'aim') h.armR.rotation.x = -0.25;
    }
    if (h.enemyMark) { h.enemyMark.visible = !!e.hostile || e.state === 'approach'; h.enemyMark.position.y = 2.35 + Math.sin(t * 5) * 0.08; }
  }
  for (const [e, h] of humans) {
    if (!seen.has(e)) {
      scene.remove(h.root);
      const i = pickables.indexOf(h.root); if (i >= 0) pickables.splice(i, 1);
      humans.delete(e);
    }
  }
}

const PLAYER_LOOK = {
  female: false, skin: '#e0ac69', hair: '#2b1b10', hairStyle: 'slick', top: '#f5f5f5', jacket: '#1b1f2a', bottom: '#1b1f2a',
  shoes: '#2a1a10', height: 1.02, build: 1.05, beard: true, glasses: false, hat: null, vest: null, tie: null, skirt: false, mask: false, shades: false,
};

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------
const carRigs = [];
function buildCar(c) {
  const g = new THREE.Group();
  const paint = mat(c.color, { m: 0.6, r: 0.25 });
  const glass = mat('#0d1620', { m: 0.8, r: 0.1 });
  const tall = c.kind === 'suv' ? 1.25 : c.kind === 'sport' ? 0.8 : 1;
  box(4.4, 0.65 * tall, 1.9, paint, 0, 0.55 * tall, 0, g);
  box(c.kind === 'sport' ? 1.8 : 2.4, 0.6 * tall, 1.7, glass, -0.2, 1.15 * tall, 0, g);
  box(c.kind === 'sport' ? 1.7 : 2.3, 0.05, 1.72, paint, -0.2, 1.46 * tall, 0, g);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14);
  wheelGeo.rotateX(Math.PI / 2);
  [[1.4, 0.9], [1.4, -0.9], [-1.4, 0.9], [-1.4, -0.9]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, mat('#111', { r: 0.9 })); w.position.set(x, 0.36, z); g.add(w);
  });
  const head = glow('#fff6d8', 3), tail = glow('#ff1a1a', 2.5);
  [0.6, -0.6].forEach(z => {
    box(0.05, 0.14, 0.34, head, 2.21, 0.62 * tall, z, g).castShadow = false;
    box(0.05, 0.12, 0.3, tail, -2.21, 0.62 * tall, z, g).castShadow = false;
  });
  if (c.kind === 'taxi') {
    const s = box(0.6, 0.2, 0.3, glow('#ffe066', 1.5), -0.2, 1.62, 0, g);
    s.castShadow = false;
  }
  const beam = new THREE.SpotLight('#fff1d0', 0, 25, 0.5, 0.6, 1.5);
  beam.position.set(2.3, 0.7, 0);
  beam.target.position.set(10, 0, 0);
  g.add(beam, beam.target);
  nightLit.push({ light: beam, day: 0, night: LOW ? 0 : 60 });
  scene.add(g);
  return g;
}
const LANE_Z = [W(1130) + 1.8, W(1130) + 5.2, W(1130) + 8.8, W(1130) + 12.2];

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
function dayCycle() {
  const hr = (S.minutes % 1440) / 60;
  // daylight factor: 0 at night, 1 at midday
  const dl = Math.max(0, Math.min(1, (Math.sin(((hr - 6) / 12) * Math.PI) + 0.15) * 1.2));
  const night = new THREE.Color('#070b1f'), dusk = new THREE.Color('#e0784a'), day = new THREE.Color('#8fb8e8');
  const sky = dl < 0.35 ? night.clone().lerp(dusk, dl / 0.35) : dusk.clone().lerp(day, (dl - 0.35) / 0.65);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  sun.intensity = 0.25 + dl * 2.6;
  sun.color.set(dl > 0.2 ? '#fff1d6' : '#8aa4ff');
  hemi.intensity = 0.25 + dl * 0.6;
  const nf = 1 - dl;
  for (const n of nightLit) {
    const v = n.day + (n.night - n.day) * nf;
    if (n.light) n.light.intensity = v;
    else n.m.emissiveIntensity = v;
  }
  bloom && (bloom.strength = 0.35 + nf * 0.45);
  return dl;
}

let lastT = 0;
function render(time) {
  const t = time / 1000;
  const rdt = Math.min(0.5, t - lastT || 0.016);
  const dt = Math.min(0.05, rdt);
  lastT = t;
  dayCycle();

  syncHumans(t, dt);
  // cars
  cars.forEach((c, i) => {
    if (!carRigs[i]) carRigs[i] = buildCar(c);
    const g = carRigs[i];
    const lane = c.lane;
    const dir = lane < 2 ? -1 : 1;
    g.position.set(W(c.x), 0, LANE_Z[lane]);
    g.rotation.y = dir > 0 ? 0 : Math.PI;
  });

  for (const a of animated) a.update(t, dt);

  // doors slide open when someone is near
  const near = Math.abs(player.x - 900) < 140 && Math.abs(player.y - CASINO_BOTTOM) < 110;
  const open = near ? 2.3 : 0;
  doorL.position.x += ((W(DOOR.x1) + 1.25 - open) - doorL.position.x) * Math.min(1, rdt * 6);
  doorR.position.x += ((W(DOOR.x2) - 1.25 + open) - doorR.position.x) * Math.min(1, rdt * 6);

  // camera: GTA-style chase cam
  const px = W(player.x), pz = W(player.y);
  const inside = player.y < CASINO_BOTTOM;
  let dist = (inside ? 7.5 : 9) * view.zoom;
  let pitch = inside ? 0.72 : 0.55;
  // camera collision: stay on the player's side of the casino walls
  const dx = Math.sin(view.yaw), dz = Math.cos(view.yaw);
  let hd = dist * Math.cos(pitch);
  const limit = (pos, d, lo, hi) => (d > 1e-4 ? (hi - pos) / d : d < -1e-4 ? (lo - pos) / d : Infinity);
  const fz = W(CASINO_BOTTOM);
  const maxH = inside
    ? Math.min(limit(px, dx, 0.6, 89.4), limit(pz, dz, 0.6, fz - 0.6))
    : limit(pz, dz, fz + 1.4, 200);
  if (hd > maxH) {
    hd = Math.max(0.4, maxH);
    pitch = Math.min(1.35, pitch + (1 - hd / (dist * Math.cos(pitch))) * 0.7);
  }
  const tx = px + dx * hd;
  const tz = pz + dz * hd;
  const ty = 1.5 + Math.max(hd * Math.tan(pitch), 2.5);
  const jump = camLook.distanceTo(new THREE.Vector3(px, 1.3, pz)) > 12; // teleports (hospital, etc.) snap
  const k = camInit && !jump ? 1 - Math.exp(-rdt * 6) : 1;
  camPos.lerp(new THREE.Vector3(tx, ty, tz), k);
  camLook.lerp(new THREE.Vector3(px, 1.3, pz), k);
  camInit = true;
  cam.position.copy(camPos);
  cam.lookAt(camLook);

  // fade walls between the camera and the player
  const ray = new THREE.Raycaster(camPos, new THREE.Vector3(px, 1.2, pz).sub(camPos).normalize(), 0, camPos.distanceTo(new THREE.Vector3(px, 1.2, pz)));
  const blocking = new Set(ray.intersectObjects(walls, false).map(h => h.object));
  for (const w of walls) {
    const target = blocking.has(w) ? 0.18 : 1;
    w.material.opacity += (target - w.material.opacity) * Math.min(1, rdt * 8);
    w.material.depthWrite = w.material.opacity > 0.9;
  }

  // sun follows the player so shadows stay crisp
  const hr = (S.minutes % 1440) / 60;
  const ang = ((hr - 6) / 12) * Math.PI;
  sun.position.set(px - Math.cos(ang) * 30, 12 + Math.max(0, Math.sin(ang)) * 30, pz - 18);
  sun.target.position.set(px, 0, pz);

  // interaction marker
  const tgt = nearbyTarget();
  if (tgt && !blocked()) {
    marker.visible = true;
    const mx = tgt.role ? W(tgt.x) : W(tgt.x + tgt.w / 2), mz = tgt.role ? W(tgt.y) : W(tgt.y + tgt.h / 2);
    const my = tgt.role ? 2.5 : ({ slots: 2.9, bigsix: 4.6, soup: 4, pawn: 4, gunstore: 4, busstop: 3.6, hotel: 1.9 }[tgt.type] || 2.2);
    marker.position.set(mx, my + Math.sin(t * 4) * 0.12, mz);
    marker.rotation.y = t * 2;
  } else marker.visible = false;

  // gunfire
  tracerPool.forEach(l => { l.visible = false; });
  muzzle.intensity = 0;
  fx.forEach((f, i) => {
    const l = tracerPool[i % tracerPool.length];
    const pos = l.geometry.attributes.position;
    pos.setXYZ(0, W(f.x1), 1.45, W(f.y1)); pos.setXYZ(1, W(f.x2), 1.3, W(f.y2));
    pos.needsUpdate = true;
    l.material.color.set(f.enemy ? '#ff7a5c' : '#ffe08a');
    l.visible = true;
    muzzle.position.set(W(f.x1), 1.5, W(f.y1));
    muzzle.intensity = 60;
  });

  updateBubbles();

  if (composer) composer.render(); else renderer.render(scene, cam);
}

// Speech bubbles are HTML so they stay crisp
const bubbleEls = new Map();
const vtmp = new THREE.Vector3();
function updateBubbles() {
  const layer = document.getElementById('bubbles');
  const live = new Set();
  for (const n of npcs) {
    if (!n.bubble) continue;
    vtmp.set(W(n.x), 2.3, W(n.y));
    const distance = vtmp.distanceTo(cam.position);
    vtmp.project(cam);
    if (vtmp.z > 1 || distance > 28) continue;
    live.add(n);
    let el = bubbleEls.get(n);
    if (!el) { el = document.createElement('div'); el.className = 'bubble3d'; layer.appendChild(el); bubbleEls.set(n, el); }
    if (el.textContent !== n.bubble) el.textContent = n.bubble;
    el.style.transform = `translate(-50%, -100%) translate(${(vtmp.x + 1) / 2 * innerWidth}px, ${(1 - vtmp.y) / 2 * innerHeight}px)`;
  }
  for (const [n, el] of bubbleEls) if (!live.has(n)) { el.remove(); bubbleEls.delete(n); }
}

function pick(cx, cy) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, cam);
  const hits = ray.intersectObjects(pickables, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.target) o = o.parent;
    if (o && o.userData.target) return { x: h.point.x / K, y: h.point.z / K, target: o.userData.target };
  }
  const p = new THREE.Vector3();
  if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return { x: p.x / K, y: p.z / K, target: null };
  return null;
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  if (composer) composer.setSize(innerWidth, innerHeight);
}

function reset() {
  for (const [, h] of humans) scene.remove(h.root);
  for (const h of [...humans.values()]) { const i = pickables.indexOf(h.root); if (i >= 0) pickables.splice(i, 1); }
  humans.clear();
  camInit = false;
}

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.25 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
  buildScene();
  if (!LOW) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.45, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  resize();
  canvas.classList.remove('hidden');
  document.getElementById('game').classList.add('hidden');
  window.Render3D.ready = true;
}

window.Render3D = { ready: false, render, pick, resize, reset };
try { init(); } catch (err) {
  console.error('3D renderer failed, using 2D fallback', err);
  canvas.classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
}
