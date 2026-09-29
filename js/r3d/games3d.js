// 3D props for the second wave of games: video poker bank, keno + race book
// terminals with their wall screens, scratch card kiosks, Three Card Poker and
// Sic Bo tables. Built from js/layout.js objects via one hook in build.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MAT, objFrame, tableData, W, CEIL, glowIntensity } from './build.js';
import * as TX from './tex.js';
import { drawAttract, drawRace, drawKeno, rrect } from './screens2.js';

// Registry read by tablefx2.js: live screens, wall boards and table details
export const NEWGAME = { machines: new Map(), walls: {}, tables: new Map() };

export class LiveScreen {
  // canvas is w x h pixels; drawing code works in a logical lw x lh space
  constructor(w, h, fn, lw = w, lh = h) {
    this.w = w; this.h = h; this.lw = lw; this.lh = lh; this.fn = fn; this.state = {}; this.atlas = null;
    this.canvas = TX.makeCanvas(w, h);
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = TX.MAX_ANISO.v;
  }
  draw(t = 0) { this.state.t = t; this.g.setTransform(this.w / this.lw, 0, 0, this.h / this.lh, 0, 0); this.fn(this.g, this.lw, this.lh, this.state, this.atlas); this.tex.needsUpdate = true; }
}

// --- tiny mesh helpers (same look as build.js, kept local so build.js stays untouched) ---
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
function localSize(o) { const rot = o.dir === 'W' || o.dir === 'E'; return rot ? { w: W(o.h), d: W(o.w) } : { w: W(o.w), d: W(o.h) }; }

function chairAt(batch, x, z, face, mat, h = 0.62) {
  const g = new THREE.Group();
  g.position.set(W(x), 0, W(z)); g.rotation.y = face;
  cyl(0.22, 0.26, 0.04, MAT.chrome, g, 0, 0.02, 0);
  cyl(0.035, 0.035, h - 0.06, MAT.chrome, g, 0, h / 2, 0, 8);
  rbox(0.46, 0.1, 0.44, 0.04, mat, g, 0, h, 0);
  rbox(0.44, 0.42, 0.07, 0.03, mat, g, 0, h + 0.26, -0.22, -0.12);
  batch.addObject(g);
}

const screenMat = (map, intensity = 1.05) => new THREE.MeshStandardMaterial({ map, emissive: '#fff', emissiveMap: map, emissiveIntensity: intensity, color: '#000', roughness: 0.25 });
const staticTex = {};
function attractTex(kind, key, extra) {
  const k = kind + key;
  if (!staticTex[k]) staticTex[k] = TX.canvasTex(512, 384, (g, w, h) => drawAttract(g, w, h, kind, extra));
  return staticTex[k];
}
let _glowMats;
function glowMats() {
  if (!_glowMats) {
    const m = c => new THREE.MeshStandardMaterial({ color: '#000', emissive: c, emissiveIntensity: 3.2 });
    _glowMats = { red: m('#ff2a3a'), green: m('#2aff6a'), yellow: m('#ffd23f'), blue: m('#3a8aff'), pink: m('#ff2fb0'), cyan: m('#2fe0ff') };
  }
  return _glowMats;
}
let _bodyMats;
function bodyMats() {
  if (!_bodyMats) _bodyMats = {
    vp: new THREE.MeshStandardMaterial({ color: '#10225a', metalness: 0.6, roughness: 0.3 }),
    keno: new THREE.MeshStandardMaterial({ color: '#3a1070', metalness: 0.6, roughness: 0.3 }),
    race: new THREE.MeshStandardMaterial({ color: '#0e4a26', metalness: 0.6, roughness: 0.3 }),
    lotto: new THREE.MeshStandardMaterial({ color: '#7a0f4a', metalness: 0.6, roughness: 0.3 }),
  };
  return _bodyMats;
}

// ---------------------------------------------------------------------------
// Machines with a screen you sit at
// ---------------------------------------------------------------------------
function registerScreen(o, kind, fr, screenMesh, view) {
  NEWGAME.machines.set(o, { o, kind, frame: fr, mesh: screenMesh, idle: screenMesh.material, view });
}

function vpMachine(o, scene, batch) {
  const g = objFrame(o), fr = objFrame(o);
  const bm = bodyMats().vp, gm = glowMats();
  rbox(0.72, 1.0, 0.6, 0.03, MAT.blackGloss, g, 0, 0.5, -0.02);
  rbox(0.76, 0.95, 0.5, 0.04, bm, g, 0, 1.45, -0.12);
  box(0.7, 0.56, 0.03, MAT.chrome, g, 0, 1.4, 0.13, -0.22);
  box(0.76, 0.1, 0.36, MAT.blackGloss, g, 0, 1.02, 0.36, 0.22);
  for (let i = 0; i < 5; i++) box(0.09, 0.03, 0.06, i === 2 ? gm.yellow : gm.blue, g, -0.27 + i * 0.13, 1.075, 0.4, 0.22).castShadow = false;
  box(0.14, 0.035, 0.07, gm.green, g, 0.28, 1.075, 0.36, 0.22).castShadow = false;
  box(0.1, 0.16, 0.05, MAT.darkMetal, g, 0.3, 0.82, 0.29);
  box(0.03, 1.55, 0.03, gm.cyan, g, -0.4, 1.0, 0.2).castShadow = false;
  box(0.03, 1.55, 0.03, gm.cyan, g, 0.4, 1.0, 0.2).castShadow = false;
  // topper sign
  if (!MAT.vpTopper) { const t = TX.textTex(['VIDEO POKER', 'JACKS OR BETTER'], { w: 512, h: 160, bg: '#0a0a30', colors: ['#ffd23f', '#9fc0ff'], weights: [1.1, 0.6] }); MAT.vpTopper = screenMat(t, 1.2); }
  box(0.78, 0.26, 0.06, MAT.chrome, g, 0, 2.05, -0.1);
  mesh(new THREE.PlaneGeometry(0.72, 0.225), MAT.vpTopper, g, 0, 2.05, -0.068).castShadow = false;
  batch.addObject(g);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.465), screenMat(attractTex('videopoker', o.pay, { table: o.pay, pays: Odds2.VP_PAYS[o.pay] })));
  scr.position.set(0, 1.42, 0.153); scr.rotation.x = -0.22;
  fr.add(scr); scene.add(fr); fr.updateMatrixWorld(true);
  registerScreen(o, 'videopoker', fr, scr, { eye: [-0.2, 1.5, 0.82], look: [-0.2, 1.37, 0.14], fov: 44 });
  const s = seatOf(o); chairAt(batch, s.x, s.y, s.face, MAT.velvetBlue, 0.62);
}

function terminal(o, scene, batch, kind) {
  const g = objFrame(o), fr = objFrame(o);
  const bm = kind === 'keno' ? bodyMats().keno : bodyMats().race, gm = glowMats();
  rbox(0.5, 0.9, 0.34, 0.03, bm, g, 0, 0.45, -0.04);
  rbox(0.62, 0.44, 0.1, 0.03, MAT.blackGloss, g, 0, 1.08, 0.0, -0.32);
  box(0.56, 0.04, 0.22, MAT.blackGloss, g, 0, 0.9, 0.16, 0.12);
  for (let i = 0; i < 4; i++) box(0.07, 0.02, 0.05, i % 2 ? gm.yellow : gm.green, g, -0.18 + i * 0.12, 0.925, 0.17, 0.12).castShadow = false;
  batch.addObject(g);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.36), screenMat(attractTex(kind, '', null), 1.1));
  scr.position.set(0, 1.08, 0.058); scr.rotation.x = -0.32;
  fr.add(scr); scene.add(fr); fr.updateMatrixWorld(true);
  registerScreen(o, kind, fr, scr, null);
  const s = seatOf(o); chairAt(batch, s.x, s.y, s.face, kind === 'keno' ? MAT.velvet : MAT.velvetBlue, 0.62);
}

function lotteryKiosk(o, scene, batch) {
  const g = objFrame(o), fr = objFrame(o), gm = glowMats();
  rbox(0.7, 1.6, 0.5, 0.04, bodyMats().lotto, g, 0, 0.8, -0.05);
  box(0.6, 0.5, 0.03, MAT.chrome, g, 0, 1.15, 0.215, -0.15);
  rbox(0.44, 0.06, 0.16, 0.02, MAT.blackGloss, g, 0, 0.66, 0.2);
  box(0.36, 0.012, 0.03, gm.yellow, g, 0, 0.7, 0.28).castShadow = false;
  if (!MAT.lottoTopper) { const t = TX.textTex(['SCRATCH', 'CARDS'], { w: 512, h: 256, bg: '#280a3a', colors: ['#ffd23f', '#ff5aa0'] }); MAT.lottoTopper = screenMat(t, 1.3); }
  box(0.74, 0.36, 0.08, MAT.chrome, g, 0, 1.82, -0.1);
  mesh(new THREE.PlaneGeometry(0.68, 0.32), MAT.lottoTopper, g, 0, 1.82, -0.058).castShadow = false;
  box(0.03, 1.6, 0.03, gm.pink, g, -0.36, 0.8, 0.2).castShadow = false;
  box(0.03, 1.6, 0.03, gm.pink, g, 0.36, 0.8, 0.2).castShadow = false;
  batch.addObject(g);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.405), screenMat(attractTex('lottery', '', null)));
  scr.position.set(0, 1.15, 0.235); scr.rotation.x = -0.15;
  fr.add(scr); scene.add(fr); fr.updateMatrixWorld(true);
  registerScreen(o, 'lottery', fr, scr, { eye: [-0.19, 1.4, 0.8], look: [-0.19, 1.15, 0.2], fov: 44 });
  const s = seatOf(o); chairAt(batch, s.x, s.y, s.face, MAT.velvet, 0.62);
}

// Big wall boards: live canvases owned by tablefx2 (attract mode when nobody plays)
function wallScreen(o, scene, batch, kind) {
  const fr = objFrame(o), g = objFrame(o);
  const w = W(o.w), h = w * 9 / 16, cy = kind === 'race' ? 3.0 : 2.6;
  box(w + 0.3, h + 0.3, 0.2, MAT.blackGloss, g, 0, cy, -0.02);
  box(w + 0.36, 0.06, 0.24, MAT.gold, g, 0, cy + h / 2 + 0.16, -0.02);
  box(w + 0.36, 0.06, 0.24, MAT.gold, g, 0, cy - h / 2 - 0.16, -0.02);
  batch.addObject(g);
  const live = new LiveScreen(1024, 576, kind === 'race' ? drawRace : drawKeno, 1280, 720);
  const m = wallMesh(w, h, live);
  m.position.set(0, cy, 0.095);
  fr.add(m); scene.add(fr); fr.updateMatrixWorld(true);
  NEWGAME.walls[kind] = { o, kind, frame: fr, mesh: m, live, w, h, cy };
}
function wallMesh(w, h, live) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat(live.tex, 1.15)); }

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
function kidneyShape(w, d) {
  const s = new THREE.Shape(), hw = w / 2;
  s.moveTo(-hw, -d * 0.45); s.lineTo(hw, -d * 0.45);
  s.bezierCurveTo(hw * 1.05, d * 0.2, hw * 0.55, d * 0.55, 0, d * 0.55);
  s.bezierCurveTo(-hw * 0.55, d * 0.55, -hw * 1.05, d * 0.2, -hw, -d * 0.45);
  return s;
}
function shapeTopGeo(shape, w, d) {
  const g = new THREE.ShapeGeometry(shape, 32);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, 1 - (p.getY(i) + d * 0.45) / d);
  g.rotateX(-Math.PI / 2); g.scale(1, 1, -1);
  const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

// Three Card Poker felt: bet circles are laid out in local table metres and the
// same coordinates are used to drop chips on them (td.spots).
const TCP_SPOTS = { ante: [-0.2, 0.6, 0.14], play: [0.24, 0.6, 0.14], pp: [-0.72, 0.5, 0.17] };
function tcpFelt(w, d) {
  const CW = 1600, CH = Math.round(1600 * d / w);
  const fc = (x, z) => [(x / w + 0.5) * CW, ((z + 0.45 * d) / d) * CH];
  return TX.canvasTex(CW, CH, (g) => {
    const bg = g.createRadialGradient(CW / 2, CH * 0.7, 50, CW / 2, CH * 0.7, CW * 0.7); bg.addColorStop(0, '#0f7a45'); bg.addColorStop(1, '#0a4a2a');
    g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * CW, Math.random() * CH, 2, 2); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f2c14e'; g.font = `900 ${CW * 0.045}px Georgia, serif`;
    const [tx, ty] = fc(0, -0.34); g.fillText('THREE CARD POKER', tx, ty);
    g.font = `700 ${CW * 0.02}px Georgia, serif`; g.fillStyle = '#e8dcae';
    g.fillText('DEALER QUALIFIES WITH QUEEN HIGH OR BETTER', ...fc(0, -0.2));
    g.fillText('STRAIGHT FLUSH 5:1 · THREE OF A KIND 4:1 · STRAIGHT 1:1  (ANTE BONUS)', ...fc(0, 0.86));
    // dealer + player card slots
    g.strokeStyle = 'rgba(242,193,78,0.5)'; g.lineWidth = 3;
    for (const [z, label] of [[-0.05, 'DEALER'], [0.3, 'PLAYER']]) {
      for (let i = 0; i < 3; i++) { const [x, y] = fc(-0.15 + i * 0.15, z); rrect(g, x - 0.05 * CW / w, y - 0.07 * CH / d, 0.1 * CW / w, 0.14 * CH / d, 8); g.stroke(); }
      g.fillStyle = 'rgba(242,193,78,0.6)'; g.font = `700 ${CW * 0.017}px Georgia, serif`; g.fillText(label, ...fc(0.42, z));
    }
    // bet circles
    for (const [name, [x, z, r]] of Object.entries(TCP_SPOTS)) {
      const [cx, cy] = fc(x, z), rr = r * CW / w;
      g.strokeStyle = name === 'pp' ? '#ff9bd0' : '#f2c14e'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.stroke();
      g.fillStyle = name === 'pp' ? '#ff9bd0' : '#f2c14e'; g.font = `800 ${CW * 0.022}px Georgia, serif`;
      g.fillText(name === 'pp' ? 'PAIR' : name.toUpperCase(), cx, cy - (name === 'pp' ? rr * 0.25 : 0)); if (name === 'pp') g.fillText('PLUS', cx, cy + rr * 0.3);
    }
    g.fillStyle = '#ff9bd0'; g.font = `700 ${CW * 0.016}px Georgia, serif`;
    g.fillText('SF 40 · 3K 30 · STR 6 · FL 3 · PAIR 1', ...fc(-0.72, 0.72));
  });
}

function cardTableLike(o, batch, kind) {
  const g = objFrame(o);
  const { w, d } = localSize(o);
  const shape = kidneyShape(w, d), feltY = 0.86;
  box(w * 0.55, 0.7, d * 0.4, MAT.woodDark, g, 0, 0.35, -d * 0.05);
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 32 });
  body.rotateX(-Math.PI / 2); body.scale(1, 1, -1);
  mesh(body, MAT.woodDark, g, 0, feltY - 0.1, 0);
  mesh(shapeTopGeo(shape, w, d), new THREE.MeshStandardMaterial({ map: tcpFelt(w, d), roughness: 0.95 }), g, 0, feltY + 0.002, 0);
  const pts = shape.getPoints(64).filter(p => p.y > -d * 0.44);
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, feltY + 0.05, -p.y)));
  mesh(new THREE.TubeGeometry(curve, 80, 0.07, 10, false), MAT.leatherBlack, g);
  box(w * 0.36, 0.05, 0.28, MAT.darkMetal, g, 0, feltY + 0.03, -d * 0.3);
  if (!MAT.rackChips) MAT.rackChips = ['#e8e8e8', '#c0121f', '#1f7a3a', '#151515', '#6a2c8a', '#e0a020'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
  for (let i = 0; i < 12; i++) cyl(0.02, 0.02, 0.26, MAT.rackChips[i % 6], g, -w * 0.16 + i * w * 0.029, feltY + 0.075, -d * 0.3).rotation.x = Math.PI / 2;
  rbox(0.14, 0.12, 0.2, 0.02, new THREE.MeshStandardMaterial({ color: '#c0c0d0', transparent: true, opacity: 0.4, roughness: 0.05 }), g, w * 0.3, feltY + 0.06, -d * 0.28);
  const lim = TX.textTex(['THREE CARD POKER', `ANTE $${o.minBet}–$${o.maxBet.toLocaleString('en-US')}`], { w: 512, h: 256, bg: '#101014', color: '#ffd23f', colors: ['#fff', '#ffd23f'] });
  mesh(new THREE.PlaneGeometry(0.3, 0.15), screenMat(lim, 0.9), g, -w * 0.42, feltY + 0.16, -d * 0.35, -0.3).castShadow = false;
  box(Math.min(w * 0.7, 2.4), 0.08, 0.6, MAT.ledWarm, g, 0, 3.3, 0).castShadow = false;
  box(Math.min(w * 0.7, 2.4) + 0.1, 0.18, 0.7, MAT.gold, g, 0, 3.4, 0);
  batch.addObject(g);
  tableSeats(o).forEach(s => chairAt(batch, s.x, s.y, s.face, MAT.leather, 0.72));
  const spots = {}; for (const [k, [x, z]] of Object.entries(TCP_SPOTS)) spots[k] = [x, z];
  tableData.push({ o, frame: objFrame(o), feltY, w, d, kind: 'threecard', spots });
}

// Sic Bo layout in felt-canvas pixels (1800 x 900). Shared by the felt drawing and the chip spots.
const SB = { CW: 1800, CH: 900 };
export function sicboSpot(key, n) {
  const c = 350;                       // centre block starts here
  switch (key) {
    case 'small': return { x: 30, y: 20, w: 300, h: 860 };
    case 'big': return { x: 1470, y: 20, w: 300, h: 860 };
    case 'triple': return { x: n <= 3 ? c + (n - 1) * 118 : 1120 + (n - 4) * 108 + 0, y: 20, w: n <= 3 ? 116 : 106, h: 210 };
    case 'double': return { x: c + (n - 1) * 183, y: 240, w: 181, h: 160 };
    case 'total': return { x: c + (n - 4) * 78.5, y: 412, w: 77, h: 166 };
    case 'anytriple': return { x: c, y: 590, w: 1100, h: 110 };
    case 'single': return { x: c + (n - 1) * 183, y: 712, w: 181, h: 168 };
  }
  return { x: 900, y: 450, w: 10, h: 10 };
}
function sicboFelt() {
  const { CW, CH } = SB;
  return TX.canvasTex(CW, CH, (g) => {
    const bg = g.createRadialGradient(CW / 2, CH / 2, 50, CW / 2, CH / 2, CW * 0.6); bg.addColorStop(0, '#0e7a48'); bg.addColorStop(1, '#083f26');
    g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const box = (r, fill, stroke = '#f2c14e') => { g.fillStyle = fill; rrect(g, r.x, r.y, r.w, r.h, 12); g.fill(); g.strokeStyle = stroke; g.lineWidth = 4; g.stroke(); };
    const pips = (cx, cy, v, s) => { const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[v]; g.fillStyle = v === 1 || v === 4 ? '#ff5050' : '#fff'; for (const [px, py] of P) { g.beginPath(); g.arc(cx + px * s, cy + py * s, s * 0.34, 0, 7); g.fill(); } };
    // small / big
    for (const [k, label, sub, col] of [['small', 'SMALL', '4 – 10', '#7a1a1a'], ['big', 'BIG', '11 – 17', '#1a2a7a']]) {
      const r = sicboSpot(k); box(r, col);
      g.fillStyle = '#fff'; g.font = '900 96px Georgia, serif'; g.fillText(label, r.x + r.w / 2, r.y + r.h * 0.38);
      g.font = '700 46px Georgia, serif'; g.fillStyle = '#f2c14e'; g.fillText(sub, r.x + r.w / 2, r.y + r.h * 0.52); g.fillText('PAYS 1 TO 1', r.x + r.w / 2, r.y + r.h * 0.62);
      g.font = '600 30px Georgia, serif'; g.fillStyle = '#ffd0d0'; g.fillText('LOSES ON ANY TRIPLE', r.x + r.w / 2, r.y + r.h * 0.75);
    }
    // triples with the dice cage between them
    for (let n = 1; n <= 6; n++) { const r = sicboSpot('triple', n); box(r, '#0b3f6a'); pips(r.x + r.w / 2, r.y + 74, n, 20); g.fillStyle = '#fff'; g.font = '800 28px Georgia'; g.fillText('×3', r.x + r.w / 2, r.y + 150); g.font = '700 26px Georgia'; g.fillStyle = '#f2c14e'; g.fillText('180:1', r.x + r.w / 2, r.y + 184); }
    g.strokeStyle = '#f2c14e'; g.lineWidth = 5; g.beginPath(); g.arc(900, 128, 100, 0, 7); g.stroke(); g.fillStyle = 'rgba(242,193,78,0.55)'; g.font = '800 30px Georgia'; g.fillText('DICE', 900, 128);
    for (let n = 1; n <= 6; n++) { const r = sicboSpot('double', n); box(r, '#12603a'); pips(r.x + r.w / 2 - 26, r.y + 60, n, 15); pips(r.x + r.w / 2 + 26, r.y + 60, n, 15); g.fillStyle = '#f2c14e'; g.font = '700 30px Georgia'; g.fillText('10:1', r.x + r.w / 2, r.y + 128); }
    const tot = { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 };
    for (let n = 4; n <= 17; n++) { const r = sicboSpot('total', n); box(r, n % 2 ? '#5a1a5a' : '#3a2a6a'); g.fillStyle = '#fff'; g.font = '900 54px Georgia'; g.fillText(String(n), r.x + r.w / 2, r.y + 62); g.font = '700 25px Georgia'; g.fillStyle = '#f2c14e'; g.fillText(tot[n] + ':1', r.x + r.w / 2, r.y + 124); }
    { const r = sicboSpot('anytriple'); box(r, '#0b3f6a'); g.fillStyle = '#fff'; g.font = '900 50px Georgia'; g.fillText('ANY TRIPLE  ·  30 TO 1', r.x + r.w / 2, r.y + r.h / 2); }
    for (let n = 1; n <= 6; n++) { const r = sicboSpot('single', n); box(r, '#7a5a10'); pips(r.x + r.w / 2, r.y + 70, n, 22); g.fillStyle = '#fff'; g.font = '700 26px Georgia'; g.fillText('1:1 · 2:1 · 3:1', r.x + r.w / 2, r.y + 140); }
    g.fillStyle = 'rgba(242,193,78,0.5)'; g.font = '700 26px Georgia'; g.fillText('SIC BO', 900, 640);
  });
}
const sbPt = (td, key, n) => { const r = sicboSpot(key, n); const cx = r.x + r.w / 2, cy = r.y + r.h / 2; return [(cx / SB.CW - 0.5) * td.w * 0.96, (cy / SB.CH - 0.5) * td.d * 0.92]; };

function sicboTable(o, batch) {
  const g = objFrame(o);
  const { w, d } = localSize(o);
  const feltY = 0.86;
  box(w * 0.85, 0.7, d * 0.75, MAT.woodDark, g, 0, 0.35, 0);
  rbox(w, 0.1, d, 0.04, MAT.woodDark, g, 0, feltY - 0.05, 0);
  mesh(new THREE.PlaneGeometry(w * 0.96, d * 0.92), new THREE.MeshStandardMaterial({ map: sicboFelt(), roughness: 0.95 }), g, 0, feltY + 0.002, 0, -Math.PI / 2);
  const rail = new THREE.Shape(); rail.moveTo(-w / 2, -d / 2); rail.lineTo(w / 2, -d / 2); rail.lineTo(w / 2, d / 2); rail.lineTo(-w / 2, d / 2); rail.closePath();
  const curve = new THREE.CatmullRomCurve3(rail.getPoints(4).map(p => new THREE.Vector3(p.x * 0.98, feltY + 0.05, p.y * 0.98)), true, 'catmullrom', 0.05);
  mesh(new THREE.TubeGeometry(curve, 60, 0.06, 8, true), MAT.leatherBlack, g);
  // dice cage: brass ring + glass dome over the DICE circle
  const cz = (128 / SB.CH - 0.5) * d * 0.92;
  cyl(0.24, 0.26, 0.03, MAT.gold, g, 0, feltY + 0.015, cz, 32);
  const dome = mesh(new THREE.SphereGeometry(0.235, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false }), g, 0, feltY + 0.03, cz);
  dome.castShadow = false;
  cyl(0.2, 0.2, 0.006, new THREE.MeshStandardMaterial({ color: '#1a1a22', roughness: 0.6 }), g, 0, feltY + 0.032, cz, 32);
  const lim = TX.textTex(['SIC BO', `MIN $${o.minBet} · MAX $${o.maxBet.toLocaleString('en-US')}`], { w: 512, h: 256, bg: '#101014', color: '#ffd23f', colors: ['#fff', '#ffd23f'] });
  mesh(new THREE.PlaneGeometry(0.3, 0.15), screenMat(lim, 0.9), g, -w * 0.4, feltY + 0.16, -d * 0.4, -0.3).castShadow = false;
  box(Math.min(w * 0.7, 2.4), 0.08, 0.6, MAT.ledWarm, g, 0, 3.3, 0).castShadow = false;
  box(Math.min(w * 0.7, 2.4) + 0.1, 0.18, 0.7, MAT.gold, g, 0, 3.4, 0);
  batch.addObject(g);
  tableSeats(o).forEach(s => chairAt(batch, s.x, s.y, s.face, MAT.leather, 0.72));
  const td = { o, frame: objFrame(o), feltY, w, d, kind: 'sicbo', cage: [0, cz] };
  td.spotFn = (key, n) => sbPt(td, key, n);
  tableData.push(td);
}

// ---------------------------------------------------------------------------
// Entry points used by build.js
// ---------------------------------------------------------------------------
export function buildNewGameProp(t, o, scene, batch) {
  switch (t) {
    case 'videopoker': vpMachine(o, scene, batch); break;
    case 'keno': terminal(o, scene, batch, 'keno'); break;
    case 'racebook': terminal(o, scene, batch, 'racebook'); break;
    case 'lottery': lotteryKiosk(o, scene, batch); break;
    case 'raceScreen': wallScreen(o, scene, batch, 'race'); break;
    case 'kenoScreen': wallScreen(o, scene, batch, 'keno'); break;
    case 'threecard': cardTableLike(o, batch, 'threecard'); break;
    case 'sicbo': sicboTable(o, batch); break;
  }
}

export function buildNewGameSigns(scene, batch) {
  const signs = [
    ['VIDEO POKER', 53.5, 41.9, '#2fe0ff'], ['SPORTSBOOK', 54.3, 45.0, '#3dff7a'], ['KENO', 62.9, 45.0, '#ff2fb0'], ['SCRATCH CARDS', 66.6, 42.9, '#ffd23f', true],
    ['THREE CARD POKER', 65.2, 11.8, '#ff9a3d'], ['SIC BO', 65.1, 31.4, '#ff5a5a'],
  ];
  for (const [text, x, z, col, side] of signs) {
    const t = TX.textTex(text, { w: 1024, h: 200, color: '#fff', glow: col, blur: 30 });
    const mat = new THREE.MeshStandardMaterial({ map: t, emissive: col, emissiveMap: t, emissiveIntensity: glowIntensity(col), color: '#000', transparent: true, depthWrite: false });
    const w = Math.min(6, 1.1 + text.length * 0.42), h = w * 200 / 1024;
    const y = 5.3;
    for (const face of [0, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z + (face ? -0.03 : 0.03)); m.rotation.y = (face ? Math.PI : 0) + (side ? Math.PI / 2 : 0);
      if (side) m.position.set(x + (face ? -0.03 : 0.03), y, z);
      scene.add(m);
    }
    const bx = new THREE.Mesh(new THREE.BoxGeometry(side ? 0.05 : w + 0.2, h + 0.2, side ? w + 0.2 : 0.05), MAT.blackGloss); bx.position.set(x, y, z); scene.add(bx);
    for (const dx of [-w / 2 + 0.2, w / 2 - 0.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, CEIL - y - h / 2 - 0.1, 4), MAT.chrome); p.position.set(side ? x : x + dx, y + h / 2 + (CEIL - y - h / 2) / 2, side ? z + dx : z); scene.add(p); }
  }
}
