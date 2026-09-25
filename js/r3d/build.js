// Casino interior: architecture, lighting fixtures and every prop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './tex.js';

export const K = 0.05;
export const W = v => v * K;

// ---------------------------------------------------------------------------
// Static batching: collect meshes, merge per material at the end
// ---------------------------------------------------------------------------
// Untextured materials with identical settings are interchangeable; builders often
// create one per object inside a loop, which would otherwise cost a draw call each.
const _canon = new Map();
function canonicalMaterial(m) {
  if (!m.isMeshStandardMaterial || m.userData.unique || m.map || m.emissiveMap || m.normalMap || m.roughnessMap || m.alphaMap) return m;
  const key = [m.type, m.color.getHexString(), m.emissive.getHexString(), m.emissiveIntensity, m.roughness, m.metalness, m.transparent, m.opacity,
    m.side, m.depthWrite, m.envMapIntensity, m.flatShading, m.clearcoat, m.clearcoatRoughness, m.transmission].join('|');
  if (!_canon.has(key)) _canon.set(key, m);
  return _canon.get(key);
}

function plainChildGeometry(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.clearGroups();
  return g;
}

// Merge a group's direct child meshes that share a material (for parts that move
// together, e.g. a roulette rotor), so each material is one draw call.
export function mergeChildMeshes(group) {
  const byMat = new Map();
  for (const c of [...group.children]) {
    if (!c.isMesh || Array.isArray(c.material) || c.children.length) continue;
    c.updateMatrix();
    const g = plainChildGeometry(c.geometry);
    g.applyMatrix4(c.matrix);
    if (!byMat.has(c.material)) byMat.set(c.material, { list: [], shadow: c.castShadow });
    byMat.get(c.material).list.push(g);
    group.remove(c);
  }
  for (const [material, { list, shadow }] of byMat) {
    const m = new THREE.Mesh(list.length > 1 ? mergeGeometries(list, false) : list[0], material);
    m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

export class Batcher {
  constructor() { this.groups = new Map(); }
  add(geometry, material, matrix, opts = {}) {
    material = canonicalMaterial(material);
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    g.applyMatrix4(matrix);
    const key = material.uuid + (opts.noShadow ? '-ns' : '');
    if (!this.groups.has(key)) this.groups.set(key, { material, list: [], opts });
    this.groups.get(key).list.push(g);
  }
  // Add every mesh of an Object3D hierarchy (after updateMatrixWorld)
  addObject(obj, opts) {
    obj.updateMatrixWorld(true);
    obj.traverse(o => { if (o.isMesh && !o.userData.dynamic) this.add(o.geometry, o.material, o.matrixWorld, Object.assign({ noShadow: !o.castShadow }, opts)); });
  }
  build(scene) {
    const out = [];
    for (const { material, list, opts } of this.groups.values()) {
      for (let i = 0; i < list.length; i += 4000) {
        const merged = mergeGeometries(list.slice(i, i + 4000), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const m = new THREE.Mesh(merged, material);
        m.castShadow = !opts.noShadow; m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        scene.add(m);
        out.push(m);
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
export const MAT = {};
export function initMaterials() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, o));
  Object.assign(MAT, {
    gold: std('#c9a04e', { metalness: 1, roughness: 0.42 }),
    brass: std('#b8893a', { metalness: 1, roughness: 0.45 }),
    chrome: std('#d8d8dc', { metalness: 1, roughness: 0.18 }),
    mirror: std('#8c8272', { metalness: 1, roughness: 0.12 }),
    blackGloss: std('#0c0c10', { metalness: 0.4, roughness: 0.18 }),
    blackMatte: std('#141418', { roughness: 0.8 }),
    darkMetal: std('#26262c', { metalness: 0.8, roughness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ map: TX.woodTex([2, 2]), roughness: 0.42, color: '#a27a5a' }),
    woodDark: new THREE.MeshStandardMaterial({ map: TX.woodTex([2, 2]), roughness: 0.35, color: '#6a4a36' }),
    leather: std('#3a0a12', { roughness: 0.45 }),
    leatherBlack: std('#121012', { roughness: 0.4 }),
    velvet: new THREE.MeshPhysicalMaterial({ color: '#6a0f2a', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#ff7aa0'), sheenRoughness: 0.5 }),
    velvetBlue: new THREE.MeshPhysicalMaterial({ color: '#16306a', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#8ab0ff'), sheenRoughness: 0.5 }),
    marble: new THREE.MeshStandardMaterial({ map: TX.marbleTex('marble', [1, 1]), roughness: 0.28 }),
    marbleDark: new THREE.MeshStandardMaterial({ map: TX.marbleTex('marbleDark', [1, 1]), roughness: 0.28 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#b8d4e0', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.5, depthWrite: false }),
    white: std('#f4f1ea', { roughness: 0.5 }),
    cream: std('#efe3c8', { roughness: 0.6 }),
    ceiling: std('#2a1418', { roughness: 0.7 }),
    ceilingPanel: std('#6a4a2a', { roughness: 0.35, metalness: 0.6 }),
    downlight: new THREE.MeshBasicMaterial({ color: '#fff4dc' }),
    ledWarm: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffcf8a', emissiveIntensity: 2.5 }),
    ledMagenta: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff2fb0', emissiveIntensity: 5 }),
    ledCyan: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#2fe0ff', emissiveIntensity: 5 }),
    crystal: new THREE.MeshStandardMaterial({ color: '#fff6e6', emissive: '#ffe2b0', emissiveIntensity: 0.9, metalness: 0, roughness: 0.45 }),
    felt: std('#0d5b34', { roughness: 0.95 }),
    bulb: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffd99a', emissiveIntensity: 4.5 }),
  });
}

// Neon brightness that glows without blowing out: white/pale colours are far
// more luminous than saturated ones at the same intensity, so cap by luminance
// (the bloom threshold is ~4.2).
export function glowIntensity(col, target = 3.4, max = 5) {
  const c = new THREE.Color(col);
  return Math.min(max, target / Math.max(0.05, 0.299 * c.r + 0.587 * c.g + 0.114 * c.b));
}

function tf(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
}
const DIR_ROT = { S: 0, N: Math.PI, W: -Math.PI / 2, E: Math.PI / 2 };
// A group placed at an object's centre, rotated so local +Z points toward the player side
export function objFrame(o) {
  const g = new THREE.Group();
  g.position.set(W(o.x + o.w / 2), 0, W(o.y + o.h / 2));
  g.rotation.y = DIR_ROT[o.dir || 'S'];
  return g;
}
// Object size in its local frame (width along X, depth along Z)
function localSize(o) {
  const rot = o.dir === 'W' || o.dir === 'E';
  return rot ? { w: W(o.h), d: W(o.w) } : { w: W(o.w), d: W(o.h) };
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const box = (w, h, d, mat, p, x, y, z, rx, ry, rz) => mesh(new THREE.BoxGeometry(w, h, d), mat, p, x, y, z, rx, ry, rz);
const rbox = (w, h, d, r, mat, p, x, y, z, rx, ry, rz) => mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat, p, x, y, z, rx, ry, rz);
const cyl = (rt, rb, h, mat, p, x, y, z, seg = 20) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, p, x, y, z);

// ---------------------------------------------------------------------------
// Floors, walls, ceiling
// ---------------------------------------------------------------------------
export const CEIL = 7;

export function buildShell(scene, batch, dyn) {
  // Floors
  ZONES.forEach((z, i) => {
    if (z.floor === 'sidewalk') return;
    const wm = W(z.w), hm = W(z.h);
    let mat;
    if (z.floor.startsWith('carpet')) mat = new THREE.MeshStandardMaterial({ map: TX.carpetTex(z.floor, [wm / 6, hm / 6]), roughness: 0.95 });
    else if (z.floor.startsWith('marble')) mat = new THREE.MeshStandardMaterial({ map: TX.marbleTex(z.floor, [wm / 3, hm / 3]), roughness: 0.5, envMapIntensity: 1.0 });
    else if (z.floor === 'wood') mat = new THREE.MeshStandardMaterial({ map: TX.woodTex([wm / 3, hm / 3]), roughness: 0.4, color: '#b08868' });
    else mat = new THREE.MeshStandardMaterial({ map: TX.tilesTex([wm / 2, hm / 2]), roughness: 0.32 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wm, hm), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(W(z.x) + wm / 2, 0.001 * (i + 1), W(z.y) + hm / 2);
    m.receiveShadow = true;
    scene.add(m);
  });

  // Walls: damask wallpaper above dark wood wainscoting
  const paper = TX.canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#5a1a26'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(230,180,90,0.35)';
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.save(); g.translate(128 + i * 256, 128 + j * 256);
      for (let k = 0; k < 6; k++) { g.rotate(Math.PI / 3); g.beginPath(); g.ellipse(0, -52, 16, 46, 0, 0, 7); g.fill(); }
      g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();
      g.restore();
    }
  }, { repeat: [1, 1] });
  const wallMat = new THREE.MeshStandardMaterial({ map: paper, roughness: 0.75 });
  const wall = (x0, z0, x1, z1, inward) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const tex = paper.clone(); tex.needsUpdate = true; tex.repeat.set(len / 2.2, (CEIL - 1.3) / 2.2); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
    const rot = new THREE.Matrix4().makeRotationY(-ang);
    const place = (w, h, d, y, mat, off = 0) => {
      const mm = tf(cx + Math.cos(ang + Math.PI / 2) * inward * off, y, cz + Math.sin(ang + Math.PI / 2) * inward * off).multiply(rot);
      batch.add(new THREE.BoxGeometry(w, h, d), mat, mm);
    };
    place(len, CEIL, 0.3, CEIL / 2, m);
    place(len, 1.3, 0.12, 0.65, MAT.woodDark, 0.18);        // wainscot
    place(len, 0.08, 0.16, 1.32, MAT.gold, 0.2);             // chair rail
    place(len, 0.35, 0.3, CEIL - 0.2, MAT.gold, 0.2);        // crown moulding
    // sconces
    for (let s = 3; s < len - 2; s += 5) {
      const px = x0 + Math.cos(ang) * s + Math.cos(ang + Math.PI / 2) * inward * 0.22;
      const pz = z0 + Math.sin(ang) * s + Math.sin(ang + Math.PI / 2) * inward * 0.22;
      batch.add(new THREE.CylinderGeometry(0.12, 0.06, 0.35, 12), MAT.gold, tf(px, 2.6, pz));
      batch.add(new THREE.SphereGeometry(0.1, 12, 8), MAT.bulb, tf(px, 2.85, pz), { noShadow: true });
    }
  };
  wall(0, 0, 90, 0, 1);
  wall(0, 0, 0, 49.8, -1);
  wall(90, 0, 90, 49.8, 1);
  // inner face of the front wall (with the door gap)
  wall(0, 49.7, W(DOOR.x1), 49.7, -1);
  wall(W(DOOR.x2), 49.7, 90, 49.7, -1);
  batch.add(new THREE.BoxGeometry(W(DOOR.x2 - DOOR.x1), CEIL - 4, 0.4), wallMat, tf(W((DOOR.x1 + DOOR.x2) / 2), 4 + (CEIL - 4) / 2, 49.8));

  // Ceiling: coffered grid with recessed downlights
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(90, 49.8), MAT.ceiling);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(45, CEIL, 24.9);
  scene.add(ceil);
  for (let x = 0; x <= 90; x += 4) batch.add(new THREE.BoxGeometry(0.35, 0.4, 49.8), MAT.gold, tf(x, CEIL - 0.2, 24.9), { noShadow: true });
  for (let z = 0; z <= 49.8; z += 4) batch.add(new THREE.BoxGeometry(90, 0.4, 0.35), MAT.gold, tf(45, CEIL - 0.2, z), { noShadow: true });
  const disc = new THREE.CircleGeometry(0.16, 14);
  disc.rotateX(Math.PI / 2);
  for (let x = 1; x < 90; x += 2) for (let z = 1; z < 49.8; z += 2) batch.add(disc, MAT.downlight, tf(x, CEIL - 0.01, z), { noShadow: true });
  // LED cove strips along the perimeter
  batch.add(new THREE.BoxGeometry(90, 0.06, 0.06), MAT.ledMagenta, tf(45, CEIL - 0.45, 0.4), { noShadow: true });
  batch.add(new THREE.BoxGeometry(0.06, 0.06, 49.8), MAT.ledCyan, tf(0.4, CEIL - 0.45, 24.9), { noShadow: true });
  batch.add(new THREE.BoxGeometry(0.06, 0.06, 49.8), MAT.ledCyan, tf(89.6, CEIL - 0.45, 24.9), { noShadow: true });

  // Chandeliers
  for (const [x, z, r] of [[26, 44, 2.2], [55.5, 12.2, 2.6], [55.5, 27.2, 2.6], [79, 8.5, 2], [82, 27, 1.8], [45, 38, 1.6], [45, 20, 1.6]]) chandelier(batch, x, z, r);

  // LED billboard screens on the walls
  const ads = [
    ['JACKPOT CITY', '$2,417,338 PROGRESSIVE', '#ff2fb0'],
    ['THE HOUSE ALWAYS WINS', 'EVERY GAME HAS A HOUSE EDGE', '#ffd23f'],
    ['LIVE TONIGHT', 'THE GOLDEN MIRAGE REVUE · 9PM', '#2fe0ff'],
    ['REWARDS CLUB', 'PLAY MORE · EARN MORE', '#3dff7a'],
  ];
  const adSpots = [[20, 0.2, 0], [60, 0.2, 0], [0.2, 20, Math.PI / 2], [89.8, 12, -Math.PI / 2]];
  adSpots.forEach(([x, z, ry], i) => {
    const [a, b, col] = ads[i % ads.length];
    const t = TX.textTex([a, b], { w: 1024, h: 384, color: '#fff', colors: [col, '#fff'], glow: col, bg: '#050308', weights: [1.3, 0.6] });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.6), new THREE.MeshStandardMaterial({ map: t, emissive: '#fff', emissiveMap: t, emissiveIntensity: 1.6, color: '#000' }));
    m.position.set(x, 4.6, z); m.rotation.y = ry;
    scene.add(m);
    batch.add(new THREE.BoxGeometry(7.3, 2.9, 0.12), MAT.blackGloss, tf(x - Math.sin(ry) * 0.07, 4.6, z - Math.cos(ry) * 0.07, ry));
    dyn.ads.push(m);
  });

  // Hanging zone signs
  const signs = [
    ['SLOTS', 20, 1.5, '#ff2fb0'], ['TABLE GAMES', 58, 4.6, '#3dff7a'], ['HIGH LIMIT', 79, 17.6, '#ffd23f'],
    ['THE LUCKY BAR', 26, 40, '#2fe0ff'], ['FOOD COURT', 80, 38.6, '#ff9a3d'], ['HOTEL', 82, 19.6, '#fff1d0'], ['CASHIER', 7, 38.6, '#ffd23f'],
  ];
  for (const [text, x, z, col] of signs) {
    const t = TX.textTex(text, { w: 1024, h: 200, color: '#fff', glow: col, blur: 30 });
    const mat = new THREE.MeshStandardMaterial({ map: t, emissive: col, emissiveMap: t, emissiveIntensity: glowIntensity(col), color: '#000', transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const w = Math.min(8, 1.1 + text.length * 0.55);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 200 / 1024), mat);
    m.position.set(x, 5.2, z);
    scene.add(m);
    batch.add(new THREE.BoxGeometry(w + 0.2, w * 200 / 1024 + 0.2, 0.05), MAT.blackGloss, tf(x, 5.2, z - 0.04));
    for (const dx of [-w / 2 + 0.2, w / 2 - 0.2]) batch.add(new THREE.CylinderGeometry(0.012, 0.012, CEIL - 5.7, 4), MAT.chrome, tf(x + dx, 5.7 + (CEIL - 5.7) / 2, z), { noShadow: true });
  }
}

function chandelier(batch, x, z, r) {
  const y = CEIL - 1.6;
  batch.add(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), MAT.gold, tf(x, CEIL - 0.55, z), { noShadow: true });
  const ring = new THREE.TorusGeometry(r, 0.05, 8, 48); ring.rotateX(Math.PI / 2);
  batch.add(ring, MAT.gold, tf(x, y, z), { noShadow: true });
  const ring2 = new THREE.TorusGeometry(r * 0.6, 0.04, 8, 36); ring2.rotateX(Math.PI / 2);
  batch.add(ring2, MAT.gold, tf(x, y - 0.35, z), { noShadow: true });
  batch.add(new THREE.SphereGeometry(r * 0.22, 20, 14), MAT.crystal, tf(x, y - 0.3, z), { noShadow: true });
  const drop = new THREE.OctahedronGeometry(0.055, 0); drop.scale(1, 2.2, 1);
  for (const [rr, n, dy, len] of [[r, 40, -0.25, 5], [r * 0.6, 26, -0.6, 4], [r * 0.3, 14, -0.95, 3]]) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      for (let k = 0; k < len; k++) batch.add(drop, MAT.crystal, tf(x + Math.cos(a) * rr, y + dy - k * 0.14, z + Math.sin(a) * rr), { noShadow: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Slot machines
// ---------------------------------------------------------------------------
const slotMats = {};
function slotMaterials(theme) {
  if (slotMats[theme]) return slotMats[theme];
  const st = TX.SLOT_STYLE[theme] || TX.SLOT_STYLE['Lucky 777'];
  const screen = new TX.SlotScreen(theme);
  const topper = TX.slotTopperTex(theme);
  slotMats[theme] = {
    style: st, screen,
    screenMat: new THREE.MeshStandardMaterial({ map: screen.tex, emissive: '#fff', emissiveMap: screen.tex, emissiveIntensity: 1.1, color: '#000', roughness: 0.2 }),
    topperMat: new THREE.MeshStandardMaterial({ map: topper, emissive: '#fff', emissiveMap: topper, emissiveIntensity: 1.3, color: '#000', roughness: 0.3 }),
    ledA: new THREE.MeshStandardMaterial({ color: '#000', emissive: st.a, emissiveIntensity: 5 }),
    ledB: new THREE.MeshStandardMaterial({ color: '#000', emissive: st.b, emissiveIntensity: 5 }),
    body: new THREE.MeshStandardMaterial({ color: new THREE.Color(st.bg[1]).multiplyScalar(0.6), metalness: 0.6, roughness: 0.28 }),
  };
  return slotMats[theme];
}
export function getSlotMaterials() { return slotMats; }

function slotMachine(o) {
  const g = objFrame(o);
  const sm = slotMaterials(o.theme);
  const big = !!o.big;
  const s = big ? 1.35 : 1;
  // cabinet
  rbox(0.78 * s, 1.0, 0.62 * s, 0.03, MAT.blackGloss, g, 0, 0.5, -0.05);
  rbox(0.8 * s, 0.9 * s, 0.5 * s, 0.03, sm.body, g, 0, 1.45 * (big ? 1.05 : 1), -0.12);
  // chrome bezel and screen
  box(0.7 * s, 0.6 * s, 0.03, MAT.chrome, g, 0, 1.42 * (big ? 1.05 : 1), 0.135 * s, -0.2);
  const scr = mesh(new THREE.PlaneGeometry(0.62 * s, 0.5 * s), sm.screenMat, g, 0, 1.42 * (big ? 1.05 : 1), 0.153 * s, -0.2);
  scr.castShadow = false;
  // button deck (angled)
  box(0.78 * s, 0.1, 0.34, MAT.blackGloss, g, 0, 1.02, 0.36, 0.22);
  for (const [bx, m] of [[-0.25, sm.ledA], [-0.08, MAT.ledWarm], [0.08, MAT.ledWarm], [0.25, sm.ledB]]) box(0.1, 0.03, 0.07, m, g, bx * s, 1.08, 0.4, 0.22).castShadow = false;
  box(0.1, 0.16, 0.05, MAT.darkMetal, g, 0.3 * s, 0.82, 0.29); // bill acceptor
  // LED strips down the sides
  box(0.03, 1.9 * (big ? 1.15 : 1), 0.03, sm.ledA, g, -0.41 * s, 0.98, 0.22).castShadow = false;
  box(0.03, 1.9 * (big ? 1.15 : 1), 0.03, sm.ledA, g, 0.41 * s, 0.98, 0.22).castShadow = false;
  // topper
  const topH = big ? 1.4 : 0.5;
  const topGeo = new THREE.CylinderGeometry(0.6 * s, 0.6 * s, topH, 24, 1, true, -0.6, 1.2);
  const topper = mesh(topGeo, sm.topperMat, g, 0, 2.02 * (big ? 1.05 : 1) + topH / 2, -0.62 * s);
  topper.castShadow = false;
  box(0.82 * s, 0.06, 0.4, MAT.chrome, g, 0, 2.0 * (big ? 1.05 : 1), -0.12);
  if (big) {
    if (!MAT.bigWheel) { const t = wheelFaceTex(); MAT.bigWheel = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.4, map: t }); }
    const wheel = mesh(new THREE.CircleGeometry(0.62, 24), MAT.bigWheel, g, 0, 3.55, 0.05);
    wheel.userData.dynamic = true;
    g.userData.wheel = wheel;
  }
  // candle (tower light)
  cyl(0.05, 0.05, 0.14, MAT.ledWarm, g, 0.3 * s, 2.12 * (big ? 1.05 : 1) + (big ? 1.4 : 0.5) + 0.02, -0.35).castShadow = false;
  cyl(0.05, 0.05, 0.1, sm.ledB, g, 0.3 * s, 2.24 * (big ? 1.05 : 1) + (big ? 1.4 : 0.5) + 0.02, -0.35).castShadow = false;
  return g;
}

let _wheelFace;
function wheelFaceTex() {
  if (_wheelFace) return _wheelFace;
  _wheelFace = TX.canvasTex(512, 512, (g) => {
    const cols = ['#ff2fb0', '#ffd23f', '#2fe0ff', '#3dff7a', '#ff6a2f', '#b36bff'];
    for (let i = 0; i < 24; i++) {
      g.fillStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 250, i / 24 * 6.283, (i + 1) / 24 * 6.283); g.fill();
      g.save(); g.translate(256, 256); g.rotate((i + 0.5) / 24 * 6.283); g.fillStyle = '#fff'; g.font = '900 30px Impact'; g.textAlign = 'right'; g.fillText(['100', '500', '1K', '50', '5K', '250'][i % 6], 235, 10); g.restore();
    }
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(256, 256, 50, 0, 7); g.fill();
  });
  return _wheelFace;
}

// Slot / bar chair with a back
function chairAt(batch, x, z, face, mat = MAT.leather, h = 0.62) {
  const g = new THREE.Group();
  g.position.set(W(x), 0, W(z)); g.rotation.y = face;
  cyl(0.22, 0.26, 0.04, MAT.chrome, g, 0, 0.02, 0);
  cyl(0.035, 0.035, h - 0.06, MAT.chrome, g, 0, h / 2, 0, 8);
  rbox(0.46, 0.1, 0.44, 0.04, mat, g, 0, h, 0);
  rbox(0.44, 0.42, 0.07, 0.03, mat, g, 0, h + 0.26, -0.22, -0.12);
  batch.addObject(g);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
function kidneyShape(w, d) {
  // Flat dealer edge at -Z, curved player edge toward +Z
  const s = new THREE.Shape();
  const hw = w / 2;
  s.moveTo(-hw, -d * 0.45);
  s.lineTo(hw, -d * 0.45);
  s.bezierCurveTo(hw * 1.05, d * 0.2, hw * 0.55, d * 0.55, 0, d * 0.55);
  s.bezierCurveTo(-hw * 0.55, d * 0.55, -hw * 1.05, d * 0.2, -hw, -d * 0.45);
  return s;
}

function shapeTopGeo(shape, w, d) {
  const g = new THREE.ShapeGeometry(shape, 32);
  // UVs: map x∈[-w/2,w/2] → u, y∈[-0.45d,0.55d] → v (v=1 at dealer edge)
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, 1 - (p.getY(i) + d * 0.45) / d);
  g.rotateX(-Math.PI / 2); // shape y → -z… flip so the curve faces +Z
  g.scale(1, 1, -1);
  const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

export const tableData = []; // { o, group, feltY, layout } for the game renderer

function cardTable(batch, o, kind) {
  const g = objFrame(o);
  const { w, d } = localSize(o);
  const shape = kidneyShape(w, d);
  const feltY = 0.86;
  // pedestal & body
  box(w * 0.55, 0.7, d * 0.4, MAT.woodDark, g, 0, 0.35, -d * 0.05);
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 32 });
  body.rotateX(-Math.PI / 2); body.scale(1, 1, -1);
  mesh(body, MAT.woodDark, g, 0, feltY - 0.1, 0);
  // felt
  // one printed felt per table type (the texture is large and slow to draw)
  const fk = 'felt_' + kind;
  if (!MAT[fk]) MAT[fk] = new THREE.MeshStandardMaterial({ map: TX.feltTex(kind), roughness: 0.95 });
  mesh(shapeTopGeo(shape, w, d), MAT[fk], g, 0, feltY + 0.002, 0);
  // padded arm rail along the curved edge
  const pts = shape.getPoints(64).filter(p => p.y > -d * 0.44);
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, feltY + 0.05, -p.y)));
  mesh(new THREE.TubeGeometry(curve, 80, 0.07, 10, false), MAT.leatherBlack, g);
  // dealer side: chip tray, card shoe, discard holder, limits sign
  box(w * 0.36, 0.05, 0.28, MAT.darkMetal, g, 0, feltY + 0.03, -d * 0.3);
  if (!MAT.rackChips) MAT.rackChips = ['#e8e8e8', '#c0121f', '#1f7a3a', '#151515', '#6a2c8a', '#e0a020'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
  for (let i = 0; i < 12; i++) {
    const c = cyl(0.02, 0.02, 0.26, MAT.rackChips[i % 6], g, -w * 0.16 + i * w * 0.029, feltY + 0.075, -d * 0.3);
    c.rotation.x = Math.PI / 2;
  }
  rbox(0.18, 0.1, 0.34, 0.02, MAT.blackGloss, g, w * 0.3, feltY + 0.05, -d * 0.25);   // shoe
  rbox(0.14, 0.12, 0.2, 0.02, new THREE.MeshStandardMaterial({ color: '#c0c0d0', transparent: true, opacity: 0.4, roughness: 0.05 }), g, -w * 0.3, feltY + 0.06, -d * 0.28);
  const lim = TX.textTex([kind === 'vip' ? 'MIN $10,000' : kind === 'baccarat' ? 'BACCARAT' : 'BLACKJACK', kind === 'vip' ? 'MAX $1,000,000' : `MIN $${o.minBet || 100}`], { w: 512, h: 256, bg: '#101014', color: '#ffd23f', colors: ['#fff', '#ffd23f'] });
  const sign = mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshStandardMaterial({ map: lim, emissive: '#fff', emissiveMap: lim, emissiveIntensity: 0.9, color: '#000' }), g, -w * 0.42, feltY + 0.16, -d * 0.35);
  sign.rotation.x = -0.3;
  // overhead table lamp
  const lamp = box(Math.min(w * 0.7, 2.4), 0.08, 0.6, MAT.ledWarm, g, 0, 3.3, 0);
  lamp.castShadow = false;
  box(Math.min(w * 0.7, 2.4) + 0.1, 0.18, 0.7, MAT.gold, g, 0, 3.4, 0);
  batch.addObject(g);
  // chairs
  tableSeats(o).forEach(s => chairAt(batch, s.x, s.y, s.face, kind === 'vip' ? MAT.velvet : MAT.leather, 0.72));
  const frame = objFrame(o);
  tableData.push({ o, frame, feltY, w, d, kind });
}

function rouletteTable(batch, o, dyn) {
  const g = objFrame(o);
  const { w, d } = localSize(o);
  const feltY = 0.86;
  box(w * 0.9, 0.7, d * 0.7, MAT.woodDark, g, 0, 0.35, 0);
  rbox(w, 0.1, d, 0.04, MAT.woodDark, g, 0, feltY - 0.05, 0);
  const felt = new THREE.MeshStandardMaterial({ map: TX.rouletteFeltTex(), roughness: 0.95 });
  mesh(new THREE.PlaneGeometry(w * 0.96, d * 0.92), felt, g, 0, feltY + 0.002, 0, -Math.PI / 2);
  // rail
  const rail = new THREE.Shape(); rail.moveTo(-w / 2, -d / 2); rail.lineTo(w / 2, -d / 2); rail.lineTo(w / 2, d / 2); rail.lineTo(-w / 2, d / 2); rail.closePath();
  const pts = rail.getPoints(4);
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x * 0.98, feltY + 0.05, p.y * 0.98)), true, 'catmullrom', 0.05);
  mesh(new THREE.TubeGeometry(curve, 60, 0.06, 8, true), MAT.leatherBlack, g);
  batch.addObject(g);
  // wheel (dynamic)
  const wheel = rouletteWheel();
  const wg = objFrame(o);
  wheel.position.set(-w / 2 + 0.55, feltY, -0.05);
  wg.add(wheel);
  dyn.scene.add(wg);
  tableSeats(o).forEach(s => chairAt(batch, s.x, s.y, s.face, MAT.leather, 0.72));
  tableData.push({ o, frame: objFrame(o), feltY, w, d, kind: 'roulette', wheel, wheelGroup: wg });
}

export const ROULETTE_ORDER = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, -1, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
function rouletteWheel() {
  const root = new THREE.Group();
  // bowl
  const prof = [[0.52, 0], [0.56, 0.02], [0.56, 0.1], [0.5, 0.12], [0.44, 0.1], [0.4, 0.07]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(prof, 48), MAT.woodDark, root);
  const track = new THREE.RingGeometry(0.36, 0.44, 64); track.rotateX(-Math.PI / 2);
  mesh(track, new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.3 }), root, 0, 0.07, 0);
  // rotor with pockets
  const rotor = new THREE.Group();
  rotor.position.y = 0.05;
  const pocketTex = TX.canvasTex(1024, 1024, (g) => {
    const n = ROULETTE_ORDER.length;
    for (let i = 0; i < n; i++) {
      const v = ROULETTE_ORDER[i];
      const a0 = i / n * Math.PI * 2 - Math.PI / 2, a1 = (i + 1) / n * Math.PI * 2 - Math.PI / 2;
      g.fillStyle = v <= 0 ? '#0a7a3a' : TX.REDS.has(v) ? '#b3121f' : '#111';
      g.beginPath(); g.moveTo(512, 512); g.arc(512, 512, 510, a0, a1); g.closePath(); g.fill();
      g.save(); g.translate(512, 512); g.rotate((a0 + a1) / 2 + Math.PI / 2);
      g.fillStyle = '#fff'; g.font = 'bold 44px Georgia'; g.textAlign = 'center'; g.fillText(v === -1 ? '00' : String(v), 0, -448); g.restore();
    }
    g.fillStyle = '#5a3a1a'; g.beginPath(); g.arc(512, 512, 380, 0, 7); g.fill();
    g.strokeStyle = '#c9a227'; g.lineWidth = 6;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(512, 512); g.lineTo(512 + Math.cos(i * 0.785) * 370, 512 + Math.sin(i * 0.785) * 370); g.stroke(); }
  });
  const disc = new THREE.CircleGeometry(0.36, 64); disc.rotateX(-Math.PI / 2);
  mesh(disc, new THREE.MeshStandardMaterial({ map: pocketTex, roughness: 0.35 }), rotor, 0, 0.01, 0);
  // frets
  for (let i = 0; i < 38; i++) {
    const a = i / 38 * Math.PI * 2;
    const f = box(0.004, 0.02, 0.1, MAT.chrome, rotor, Math.cos(a) * 0.3, 0.02, Math.sin(a) * 0.3);
    f.rotation.y = -a + Math.PI / 2;
  }
  cyl(0.09, 0.14, 0.06, MAT.gold, rotor, 0, 0.04, 0, 24);
  cyl(0.01, 0.02, 0.14, MAT.chrome, rotor, 0, 0.12, 0, 8);
  for (let i = 0; i < 4; i++) { const arm = box(0.16, 0.012, 0.012, MAT.chrome, rotor, Math.cos(i * 1.57) * 0.07, 0.17, Math.sin(i * 1.57) * 0.07); arm.rotation.y = -i * 1.57; }
  mergeChildMeshes(rotor);   // 38 frets + turret: a handful of draw calls instead of ~45
  root.add(rotor);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.15 }));
  ball.position.set(0.4, 0.085, 0);
  ball.castShadow = true;
  root.add(ball);
  root.userData = { rotor, ball };
  root.traverse(m => { if (m.isMesh) m.userData.dynamic = true; });
  return root;
}

function crapsTable(batch, o) {
  const g = objFrame(o);
  const { w, d } = localSize(o);
  const railH = 1.0;
  const outer = new THREE.Shape();
  const r = 0.3, hw = w / 2, hd = d / 2;
  outer.moveTo(-hw + r, -hd); outer.lineTo(hw - r, -hd); outer.quadraticCurveTo(hw, -hd, hw, -hd + r); outer.lineTo(hw, hd - r); outer.quadraticCurveTo(hw, hd, hw - r, hd); outer.lineTo(-hw + r, hd); outer.quadraticCurveTo(-hw, hd, -hw, hd - r); outer.lineTo(-hw, -hd + r); outer.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const inner = new THREE.Path();
  const iw = hw - 0.2, idd = hd - 0.2;
  inner.moveTo(-iw, -idd); inner.lineTo(iw, -idd); inner.lineTo(iw, idd); inner.lineTo(-iw, idd); inner.closePath();
  outer.holes.push(inner);
  const walls = new THREE.ExtrudeGeometry(outer, { depth: 0.3, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 });
  walls.rotateX(-Math.PI / 2);
  mesh(walls, MAT.woodDark, g, 0, railH - 0.3, 0);
  box(w, railH - 0.3, d, MAT.woodDark, g, 0, (railH - 0.3) / 2, 0);
  const felt = new THREE.MeshStandardMaterial({ map: TX.crapsFeltTex(), roughness: 0.95 });
  mesh(new THREE.PlaneGeometry(iw * 2, idd * 2), felt, g, 0, railH - 0.28, 0, -Math.PI / 2);
  // mirrored inner wall at the far end
  box(iw * 2, 0.26, 0.02, MAT.mirror, g, 0, railH - 0.15, -idd + 0.01);
  // chip rack groove along the rail
  box(w - 0.3, 0.03, 0.1, MAT.blackGloss, g, 0, railH + 0.04, hd - 0.1);
  batch.addObject(g);
  tableSeats(o).forEach(s => {}); // players stand at craps
  tableData.push({ o, frame: objFrame(o), feltY: railH - 0.28, w: iw * 2, d: idd * 2, kind: 'craps' });
}

function bigSix(batch, o, dyn) {
  const g = objFrame(o);
  box(1.0, 1.1, 0.7, MAT.woodDark, g, 0, 0.55, -0.1);
  cyl(0.1, 0.12, 1.6, MAT.gold, g, 0, 1.9, -0.25);
  batch.addObject(g);
  const wg = objFrame(o);
  const segs = [], labels = [];
  const pool = [];
  [['$1', 24, '#f0ead8'], ['$2', 15, '#3a6fd8'], ['$5', 7, '#d8a63a'], ['$10', 4, '#3ab86b'], ['$20', 2, '#b83a3a'], ['JOKER', 1, '#7d3ab8'], ['LOGO', 1, '#111']].forEach(([l, n, c]) => { for (let i = 0; i < n; i++) pool.push([l, c]); });
  const order = []; for (let i = 0; i < 54; i++) order.push(pool[(i * 17) % 54]);
  const tex = TX.canvasTex(1024, 1024, (gg) => {
    for (let i = 0; i < 54; i++) {
      const a0 = i / 54 * Math.PI * 2 - Math.PI / 2, a1 = (i + 1) / 54 * Math.PI * 2 - Math.PI / 2;
      gg.fillStyle = order[i][1]; gg.beginPath(); gg.moveTo(512, 512); gg.arc(512, 512, 505, a0, a1); gg.closePath(); gg.fill();
      gg.strokeStyle = '#c9a227'; gg.lineWidth = 3; gg.stroke();
      gg.save(); gg.translate(512, 512); gg.rotate((a0 + a1) / 2 + Math.PI / 2);
      gg.fillStyle = order[i][1] === '#f0ead8' ? '#111' : '#fff'; gg.font = '900 34px Georgia'; gg.textAlign = 'center';
      gg.fillText(order[i][0], 0, -440); gg.restore();
    }
    gg.fillStyle = '#c9a227'; gg.beginPath(); gg.arc(512, 512, 110, 0, 7); gg.fill();
    gg.fillStyle = '#3a0a10'; gg.font = '900 44px Georgia'; gg.textAlign = 'center'; gg.fillText('BIG SIX', 512, 528);
  });
  const wheel = new THREE.Group();
  wheel.position.set(0, 2.8, -0.22);
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
  wheel.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.06, 10, 64), MAT.gold);
  wheel.add(rim);
  for (let i = 0; i < 54; i++) {
    const a = i / 54 * Math.PI * 2;
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), MAT.chrome);
    peg.rotation.x = Math.PI / 2; peg.position.set(Math.cos(a) * 1.46, Math.sin(a) * 1.46, 0.04);
    wheel.add(peg);
  }
  mergeChildMeshes(wheel);   // 54 pegs spin with the wheel: one draw call
  wg.add(wheel);
  // clapper at the top
  const clap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.02), new THREE.MeshStandardMaterial({ color: '#d0d0d0', metalness: 0.6, roughness: 0.3 }));
  clap.position.set(0, 4.4, -0.14);
  wg.add(clap);
  // marquee bulbs
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), MAT.bulb, 60);
  const dm = new THREE.Object3D();
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; dm.position.set(Math.cos(a) * 1.64, 2.8 + Math.sin(a) * 1.64, -0.18); dm.updateMatrix(); bulbs.setMatrixAt(i, dm.matrix); }
  wg.add(bulbs);
  dyn.scene.add(wg);
  tableData.push({ o, frame: objFrame(o), feltY: 1.1, kind: 'bigsix', wheel, order: order.map(x => x[0]), clapper: clap });
}

// ---------------------------------------------------------------------------
// Other props
// ---------------------------------------------------------------------------
function islandBar(batch, o) {
  const cx = W(o.x + o.w / 2), cz = W(o.y + o.h / 2), w = W(o.w), d = W(o.h);
  const shape = new THREE.Shape();
  const r = d / 2;
  shape.absarc(-w / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  shape.lineTo(w / 2 - r, -r);
  shape.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.closePath();
  const inner = new THREE.Path();
  const ri = r - 0.7;
  inner.absarc(-w / 2 + r, 0, ri, Math.PI / 2, Math.PI * 1.5, false);
  inner.lineTo(w / 2 - r, -ri);
  inner.absarc(w / 2 - r, 0, ri, -Math.PI / 2, Math.PI / 2, false);
  inner.closePath();
  shape.holes.push(inner);
  const g = new THREE.Group(); g.position.set(cx, 0, cz);
  const onyx = TX.canvasTex(512, 256, (gg, ww, hh) => {
    const grd = gg.createLinearGradient(0, 0, ww, hh); grd.addColorStop(0, '#ffb45a'); grd.addColorStop(0.5, '#ffdc9a'); grd.addColorStop(1, '#ff9a3a');
    gg.fillStyle = grd; gg.fillRect(0, 0, ww, hh);
    for (let i = 0; i < 40; i++) { gg.strokeStyle = `rgba(160,70,10,${0.1 + TX.rnd() * 0.3})`; gg.lineWidth = 1 + TX.rnd() * 4; gg.beginPath(); gg.moveTo(0, TX.rnd() * hh); gg.bezierCurveTo(ww * 0.3, TX.rnd() * hh, ww * 0.6, TX.rnd() * hh, ww, TX.rnd() * hh); gg.stroke(); }
  }, { repeat: [6, 1] });
  const front = new THREE.ExtrudeGeometry(shape, { depth: 1.05, bevelEnabled: false, curveSegments: 24 });
  front.rotateX(-Math.PI / 2);
  mesh(front, new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: onyx, emissiveIntensity: 0.55, map: onyx, roughness: 0.3 }), g);
  const top = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 24 });
  top.rotateX(-Math.PI / 2);
  mesh(top, MAT.marbleDark, g, 0, 1.08, 0);
  // central back-bar tower with glowing bottle shelves
  rbox(w - 2 * r - 0.4 + 1.2, 2.8, 0.9, 0.05, MAT.blackGloss, g, 0, 1.4, 0);
  const bottleMats = ['#2e7d32', '#8d6e63', '#c62828', '#f9a825', '#6a1b9a', '#b0bec5'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85 }));
  for (const y of [1.3, 1.85, 2.4]) for (const side of [-1, 1]) {
    box(w - 2 * r + 0.8, 0.03, 0.22, MAT.ledWarm, g, 0, y, side * 0.5).castShadow = false;
    for (let i = 0; i < 16; i++) {
      const b = cyl(0.035, 0.04, 0.3, bottleMats[(i + y * 10) % 6 | 0], g, -(w - 2 * r) / 2 - 0.2 + i * (w - 2 * r + 0.4) / 15, y + 0.17, side * 0.52, 10);
      b.castShadow = false;
    }
  }
  // neon ring over the bar
  const ring = new THREE.TorusGeometry(2.4, 0.05, 8, 64); ring.rotateX(Math.PI / 2); ring.scale(w / 5, 1, 1);
  mesh(ring, MAT.ledCyan, g, 0, 4.2, 0).castShadow = false;
  batch.addObject(g);
  // stools around the counter
  const n = 18;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const per = 2 * (w - 2 * r) + 2 * Math.PI * r;
    let s = t * per, x, z, face;
    if (s < w - 2 * r) { x = -w / 2 + r + s; z = r + 0.55; face = Math.PI; }
    else if ((s -= w - 2 * r) < Math.PI * r) { const a = Math.PI / 2 - s / r; x = w / 2 - r + Math.cos(a) * (r + 0.55); z = Math.sin(a) * (r + 0.55); face = Math.atan2(-Math.cos(a), -Math.sin(a)); }
    else if ((s -= Math.PI * r) < w - 2 * r) { x = w / 2 - r - s; z = -r - 0.55; face = 0; }
    else { s -= w - 2 * r; const a = -Math.PI / 2 - s / r; x = -w / 2 + r + Math.cos(a) * (r + 0.55); z = Math.sin(a) * (r + 0.55); face = Math.atan2(-Math.cos(a), -Math.sin(a)); }
    chairAt(batch, (cx + x) / K, (cz + z) / K, face, MAT.velvet, 0.78);
  }
}

function counter(batch, o, title, color) {
  const g = objFrame(o);
  const { w, d } = localSize(o);
  rbox(w, 1.05, d * 0.5, 0.02, MAT.woodDark, g, 0, 0.52, 0);
  box(w + 0.05, 0.05, d * 0.55, MAT.marble, g, 0, 1.07, 0);
  box(w * 0.9, 0.4, 0.03, MAT.glass, g, 0, 1.32, d * 0.12).castShadow = false;
  for (let i = 0; i < 5; i++) box(w * 0.14, 0.06, 0.18, new THREE.MeshStandardMaterial({ color: ['#c0392b', '#e67e22', '#f1c40f', '#8e5a2a', '#27ae60'][i], roughness: 0.6 }), g, -w * 0.36 + i * w * 0.18, 1.12, 0);
  // storefront back wall with a lit sign and menu board
  box(w + 0.6, 3.2, 0.2, MAT.blackGloss, g, 0, 1.6, -d * 0.5 - 0.6);
  const t = TX.textTex(title, { w: 1024, h: 220, color: '#fff', glow: color });
  const s = mesh(new THREE.PlaneGeometry(w, w * 220 / 1024), new THREE.MeshStandardMaterial({ map: t, emissive: color, emissiveMap: t, emissiveIntensity: 2, color: '#000', transparent: true }), g, 0, 2.7, -d * 0.5 - 0.49);
  s.castShadow = false;
  const menu = TX.textTex(['MENU', title === 'HOT DOGS' ? 'Hot dog + soda $14' : title === 'GRAND BUFFET' ? 'All you can eat $65' : 'Wagyu steak $240'], { w: 512, h: 256, bg: '#111', color: '#ffd23f', colors: ['#ffd23f', '#fff'] });
  mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshStandardMaterial({ map: menu, emissive: '#fff', emissiveMap: menu, emissiveIntensity: 0.8, color: '#000' }), g, w * 0.3, 1.9, -d * 0.5 - 0.49).castShadow = false;
  batch.addObject(g);
}

function desk(batch, o, title) {
  const g = objFrame(o);
  const { w, d } = localSize(o);
  rbox(w, 1.1, d * 0.8, 0.03, MAT.marble, g, 0, 0.55, 0);
  box(w + 0.1, 0.05, d * 0.9, MAT.gold, g, 0, 1.12, 0);
  box(w + 1.5, 3.6, 0.25, MAT.woodDark, g, 0, 1.8, -d * 0.5 - 1.3);
  const t = TX.textTex(title, { w: 1024, h: 256, color: '#ffd23f', glow: '#ffb000' });
  mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.2), new THREE.MeshStandardMaterial({ map: t, emissive: '#ffcf6a', emissiveMap: t, emissiveIntensity: 1.8, color: '#000', transparent: true }), g, 0, 2.6, -d * 0.5 - 1.16).castShadow = false;
  batch.addObject(g);
}

function cashierCage(batch, o) {
  const g = objFrame(o);
  const { w, d } = localSize(o);
  rbox(w, 1.1, d * 0.6, 0.02, MAT.woodDark, g, 0, 0.55, 0);
  box(w, 0.05, d * 0.7, MAT.marble, g, 0, 1.12, 0);
  for (let i = 0; i <= 40; i++) cyl(0.012, 0.012, 1.4, MAT.brass, g, -w / 2 + i * w / 40, 1.85, 0.05, 6);
  box(w, 0.1, 0.1, MAT.brass, g, 0, 2.55, 0.05);
  for (let i = 0; i < 4; i++) box(0.9, 0.5, 0.02, MAT.glass, g, -w * 0.36 + i * w * 0.24, 1.45, 0.08).castShadow = false;
  box(w + 0.4, 3.4, 0.2, MAT.woodDark, g, 0, 1.7, -d * 0.5 - 1.1);
  const t = TX.textTex('CASHIER', { w: 1024, h: 200, color: '#ffd23f', glow: '#ffb000' });
  mesh(new THREE.PlaneGeometry(3, 0.6), new THREE.MeshStandardMaterial({ map: t, emissive: '#ffcf6a', emissiveMap: t, emissiveIntensity: 2, color: '#000', transparent: true }), g, 0, 2.95, 0.1).castShadow = false;
  batch.addObject(g);
}

function atm(batch, o) {
  const g = objFrame(o);
  rbox(0.7, 1.7, 0.55, 0.03, MAT.darkMetal, g, 0, 0.85, -0.05);
  box(0.4, 0.28, 0.02, new THREE.MeshStandardMaterial({ color: '#000', emissive: '#3b82f6', emissiveIntensity: 1.5 }), g, 0, 1.3, 0.23).castShadow = false;
  box(0.34, 0.04, 0.2, MAT.blackGloss, g, 0, 1.05, 0.28);
  const t = TX.textTex('ATM', { w: 256, h: 128, bg: '#1d4ed8', color: '#fff' });
  mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshStandardMaterial({ map: t, emissive: '#fff', emissiveMap: t, emissiveIntensity: 1, color: '#000' }), g, 0, 1.85, 0.23).castShadow = false;
  batch.addObject(g);
}

function standSign(batch, o, lines, bg = '#f5f1e6', fg = '#111') {
  const g = objFrame(o);
  cyl(0.2, 0.25, 0.05, MAT.brass, g, 0, 0.025, 0);
  cyl(0.02, 0.02, 1.2, MAT.brass, g, 0, 0.6, 0, 8);
  const t = TX.textTex(lines, { w: 768, h: 512, bg, color: fg, font: '"Barlow Condensed", Arial, sans-serif', sub: 0.6 });
  mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), g, 0, 1.45, 0.02);
  box(0.95, 0.65, 0.03, MAT.brass, g, 0, 1.45, -0.01);
  batch.addObject(g);
}

function fountain(batch, o) {
  const g = objFrame(o);
  rbox(0.45, 1.0, 0.4, 0.03, MAT.chrome, g, 0, 0.5, 0);
  cyl(0.18, 0.12, 0.08, MAT.chrome, g, 0, 1.02, 0.05);
  batch.addObject(g);
}

function pillar(batch, o) {
  const x = W(o.x + o.w / 2), z = W(o.y + o.h / 2), s = W(o.w);
  batch.add(new THREE.BoxGeometry(s, CEIL, s), MAT.marbleDark, tf(x, CEIL / 2, z));
  batch.add(new THREE.BoxGeometry(s + 0.14, 0.4, s + 0.14), MAT.gold, tf(x, 0.2, z));
  batch.add(new THREE.BoxGeometry(s + 0.2, 0.5, s + 0.2), MAT.gold, tf(x, CEIL - 0.6, z));
  batch.add(new THREE.BoxGeometry(s + 0.04, 0.05, s + 0.04), MAT.ledMagenta, tf(x, 2.8, z), { noShadow: true });
}

function glassWall(batch, o) {
  const horiz = o.w > o.h;
  const len = W(horiz ? o.w : o.h);
  const x = W(o.x + o.w / 2), z = W(o.y + o.h / 2);
  const ry = horiz ? 0 : Math.PI / 2;
  batch.add(new THREE.BoxGeometry(len, 3.2, 0.04), MAT.glass, tf(x, 1.6, z, ry), { noShadow: true });
  batch.add(new THREE.BoxGeometry(len, 0.12, 0.1), MAT.gold, tf(x, 0.06, z, ry));
  batch.add(new THREE.BoxGeometry(len, 0.08, 0.08), MAT.gold, tf(x, 3.2, z, ry));
  for (let s = 0; s <= len; s += 2) {
    const px = horiz ? W(o.x) + s : x, pz = horiz ? z : W(o.y) + s;
    batch.add(new THREE.BoxGeometry(0.08, 3.2, 0.08), MAT.gold, tf(px, 1.6, pz));
  }
}

function diningTable(batch, o) {
  const g = new THREE.Group(); g.position.set(W(o.x + o.w / 2), 0, W(o.y + o.h / 2));
  cyl(0.55, 0.55, 0.04, MAT.white, g, 0, 0.76, 0, 28);
  cyl(0.57, 0.6, 0.18, new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.9 }), g, 0, 0.66, 0, 28);
  cyl(0.05, 0.08, 0.74, MAT.brass, g, 0, 0.37, 0, 10);
  cyl(0.04, 0.05, 0.14, new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffb050', emissiveIntensity: 1 }), g, 0, 0.85, 0, 10);
  batch.addObject(g);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.4;
    chairAt(batch, o.x + o.w / 2 + Math.cos(a) * 18, o.y + o.h / 2 + Math.sin(a) * 18, -a - Math.PI / 2, MAT.velvet, 0.48);
  }
}

function elevator(batch, o) {
  const g = new THREE.Group(); g.position.set(W(o.x + o.w / 2), 0, W(o.y + o.h / 2)); g.rotation.y = -Math.PI / 2;
  box(2.2, 3.4, 0.2, MAT.gold, g, 0, 1.7, 0);
  box(1.0, 2.6, 0.05, MAT.brass, g, -0.51, 1.3, 0.1);
  box(1.0, 2.6, 0.05, MAT.brass, g, 0.51, 1.3, 0.1);
  box(0.5, 0.15, 0.03, new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff4040', emissiveIntensity: 2 }), g, 0, 2.95, 0.12).castShadow = false;
  batch.addObject(g);
}

function podium(batch, o) {
  const g = new THREE.Group(); g.position.set(W(o.x + o.w / 2), 0, W(o.y + o.h / 2));
  rbox(W(o.w), 1.05, W(o.h), 0.03, MAT.woodDark, g, 0, 0.52, 0);
  box(0.5, 0.35, 0.03, new THREE.MeshStandardMaterial({ color: '#000', emissive: '#2a60ff', emissiveIntensity: 1 }), g, 0.2, 1.3, 0).castShadow = false;
  batch.addObject(g);
}

function jackpotSign(o, dyn) {
  const x = W(o.x + o.w / 2), z = W(o.y + o.h / 2);
  const jc = TX.jackpotCanvas(1024, 200);
  const mat = new THREE.MeshStandardMaterial({ map: jc.tex, emissive: '#fff', emissiveMap: jc.tex, emissiveIntensity: 1.8, color: '#000' });
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W(o.w) * 0.9, W(o.w) * 0.9 * 200 / 1024), mat);
    m.position.set(x, 3.65, z + side * 0.045);
    if (side < 0) m.rotation.y = Math.PI;
    dyn.scene.add(m);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W(o.w) * 0.92, W(o.w) * 0.9 * 200 / 1024 + 0.1, 0.08), MAT.blackGloss);
  frame.position.set(x, 3.65, z); dyn.scene.add(frame);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, CEIL - 4, 6), MAT.chrome); pole.position.set(x, 4 + (CEIL - 4) / 2, z); dyn.scene.add(pole);
  const st = TX.SLOT_STYLE[o.theme] || TX.SLOT_STYLE['Lucky 777'];
  dyn.jackpots.push({ jc, value: 250_000 + TX.rnd() * 2_000_000, theme: o.theme, st, pos: new THREE.Vector3(x, 3.65, z) });
}

export function drawJackpot(j, t) {
  const { g, canvas, tex } = j.jc;
  const w = canvas.width, h = canvas.height;
  g.fillStyle = '#050308'; g.fillRect(0, 0, w, h);
  // LED dot matrix look
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let x = 0; x < w; x += 8) for (let y = 0; y < h; y += 8) g.fillRect(x, y, 5, 5);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = j.st.b; g.font = '800 40px "Barlow Condensed", Arial, sans-serif';
  g.fillText(`${j.theme.toUpperCase()} · PROGRESSIVE JACKPOT`, w / 2, 42);
  g.shadowColor = j.st.a; g.shadowBlur = 20;
  g.fillStyle = Math.floor(t * 2) % 2 ? '#fff' : j.st.a; g.font = '900 96px "Anton", Impact, sans-serif';
  g.fillText('$' + j.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), w / 2, 130);
  g.shadowBlur = 0;
  tex.needsUpdate = true;
}

// Potted palm
function plant(batch, x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  cyl(0.32, 0.24, 0.6, MAT.gold, g, 0, 0.3, 0, 20);
  cyl(0.3, 0.3, 0.02, new THREE.MeshStandardMaterial({ color: '#2a1a0a' }), g, 0, 0.6, 0, 20);
  cyl(0.04, 0.06, 1.4, new THREE.MeshStandardMaterial({ color: '#5a4020', roughness: 0.9 }), g, 0, 1.3, 0, 8);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#2f7a32', roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 10; i++) {
    const leaf = new THREE.PlaneGeometry(0.28, 1.1, 1, 4);
    const p = leaf.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 0.55; p.setZ(k, -y * y * 0.35); p.setX(k, p.getX(k) * (1 - Math.abs(y - 0.4) * 0.8)); }
    leaf.translate(0, 0.55, 0);
    const m = mesh(leaf, leafMat, g, 0, 1.95, 0);
    m.rotation.set(0.9 + TX.rnd() * 0.4, i / 10 * Math.PI * 2, 0, 'YXZ');
  }
  batch.addObject(g);
}

// ---------------------------------------------------------------------------
// Build all props from the layout
// ---------------------------------------------------------------------------
export function buildProps(scene, batch, dyn, models) {
  for (const o of OBJECTS) {
    if (o.road || o.wall) continue;
    const t = o.type || o.decor;
    switch (t) {
      case 'slots': {
        const g = slotMachine(o);
        if (g.userData.wheel) { const w = g.userData.wheel; g.remove(w); const wg = objFrame(o); wg.add(w); w.position.copy(g.userData.wheel.position); scene.add(wg); dyn.bigWheels.push(w); }
        batch.addObject(g);
        const s = slotSeat(o);
        chairAt(batch, s.x, s.y, s.face, MAT.leather, 0.62);
        break;
      }
      case 'blackjack': cardTable(batch, o, 'blackjack'); break;
      case 'blackjack_hl': cardTable(batch, o, 'vip'); break;
      case 'baccarat': case 'baccarat_hl': cardTable(batch, o, 'baccarat'); break;
      case 'roulette': rouletteTable(batch, o, dyn); break;
      case 'craps': crapsTable(batch, o); break;
      case 'bigsix': bigSix(batch, o, dyn); break;
      case 'bar': islandBar(batch, o); break;
      case 'hotdog': counter(batch, o, 'HOT DOGS', '#ff9a3d'); break;
      case 'buffet': counter(batch, o, 'GRAND BUFFET', '#ffd23f'); break;
      case 'steak': counter(batch, o, 'PRIME STEAKHOUSE', '#ff5a5a'); break;
      case 'hotel': desk(batch, o, 'GOLDEN MIRAGE HOTEL'); break;
      case 'cashier': cashierCage(batch, o); break;
      case 'atm': atm(batch, o); break;
      case 'fountain': fountain(batch, o); break;
      case 'poster': standSign(batch, o, ['PROBLEM GAMBLING?', 'Call 1-800-GAMBLER', 'Free · Confidential · 24/7']); break;
      case 'noclock': standSign(batch, o, ['NO CLOCKS.', 'NO WINDOWS.', 'Did you notice?'], '#1a1420', '#ffd23f'); break;
      case 'pillar': pillar(batch, o); break;
      case 'glassWall': glassWall(batch, o); break;
      case 'diningTable': diningTable(batch, o); break;
      case 'elevator': elevator(batch, o); break;
      case 'podium': podium(batch, o); break;
      case 'jackpotSign': jackpotSign(o, dyn); break;
      case 'sofa': case 'armchair': {
        const src = t === 'sofa' ? models.sofa : models.chair;
        if (!src) break;
        const m = src.clone();
        const box3 = new THREE.Box3().setFromObject(m);
        const size = box3.getSize(new THREE.Vector3());
        const targetW = Math.max(W(o.w), W(o.h));
        const k = targetW / Math.max(size.x, size.z);
        m.scale.setScalar(k);
        m.position.set(W(o.x + o.w / 2), -box3.min.y * k, W(o.y + o.h / 2));
        if (t === 'armchair') m.rotation.y = Math.PI;
        m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        scene.add(m);
        break;
      }
    }
  }
  // decorative plants
  for (const [x, z] of [[40.2, 36.4], [49.8, 36.4], [40.2, 48.6], [49.8, 48.6], [16.5, 48.8], [35.5, 48.8], [69.5, 48.8], [75.5, 34.8], [88.8, 34.8], [69.5, 18.2], [0.8, 36.6], [89.2, 36.6]]) plant(batch, x, z, 1.1);
}
