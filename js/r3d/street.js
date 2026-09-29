// The Strip: casino facade, hotel tower, pylon sign, road, traffic, skyline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './tex.js';
import { MAT, W, K } from './build.js';

export const CURB_Z = W(1130);
export const LANE_Z = [CURB_Z + 1.75, CURB_Z + 5.25, CURB_Z + 10.75, CURB_Z + 14.25];
const ROAD_W = 16;

function tf(x, y, z, ry = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function emissivePlane(tex, w, h, intensity = 1.6, color = '#fff', transparent = false) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: color, emissiveMap: tex, emissiveIntensity: intensity, color: '#000', transparent, depthWrite: !transparent }));
}

// Asphalt with damp patches: the roughness map marks puddles/oil, main.js lowers material.roughness at night for a wet look
function asphalt(map) {
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return new THREE.MeshStandardMaterial({ map, normalMap: TX.normalMapFrom(map, { strength: 2.4, noise: 0.4, blur: 0 }),
    roughnessMap: TX.roughMapFrom(map, (l, x, y) => 1 - 0.75 * sm(0.58, 0.68, TX.cloud(x / 64, y / 64, 8) * 0.7 + TX.cloud(x / 16, y / 16, 32) * 0.3) - l * 0.3), roughness: 0.95 });
}
function paved(map) {
  return new THREE.MeshStandardMaterial({ map, normalMap: TX.normalMapFrom(map, { strength: 1.6, noise: 0.25, blur: 0 }), roughness: 0.8 });
}

export function buildStreet(scene, batch, dyn, models) {
  const FZ = W(1004); // outside face of the casino front wall
  // ground planes
  const sw = new THREE.Mesh(new THREE.PlaneGeometry(500, CURB_Z - FZ + 0.4), paved(TX.sidewalkTex([125, 2])));
  sw.rotation.x = -Math.PI / 2; sw.position.set(45, 0.02, (FZ + CURB_Z) / 2); sw.receiveShadow = true; scene.add(sw);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(500, ROAD_W), asphalt(TX.asphaltTex([100, 4])));
  road.rotation.x = -Math.PI / 2; road.position.set(45, 0.0, CURB_Z + ROAD_W / 2); road.receiveShadow = true; scene.add(road);
  dyn.wetRoad = road.material;
  const sw2 = new THREE.Mesh(new THREE.PlaneGeometry(500, 6), paved(TX.sidewalkTex([125, 1.5])));
  sw2.rotation.x = -Math.PI / 2; sw2.position.set(45, 0.14, CURB_Z + ROAD_W + 3); sw2.receiveShadow = true; scene.add(sw2);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: '#3a3226', roughness: 1 }));
  far.rotation.x = -Math.PI / 2; far.position.set(45, -0.05, 0); far.receiveShadow = true; scene.add(far);

  // curbs
  const curbMat = new THREE.MeshStandardMaterial({ color: '#c9c5bb', roughness: 0.7 });
  batch.add(new THREE.BoxGeometry(500, 0.15, 0.3), curbMat, tf(45, 0.075, CURB_Z));
  batch.add(new THREE.BoxGeometry(500, 0.15, 0.3), curbMat, tf(45, 0.075, CURB_Z + ROAD_W));
  // raised median with palms
  batch.add(new THREE.BoxGeometry(500, 0.2, 1.6), new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.8 }), tf(45, 0.1, CURB_Z + ROAD_W / 2));
  batch.add(new THREE.BoxGeometry(500, 0.02, 1.3), new THREE.MeshStandardMaterial({ color: '#4a6a2a', roughness: 1 }), tf(45, 0.21, CURB_Z + ROAD_W / 2));
  // lane markings
  const dash = new THREE.PlaneGeometry(3, 0.14); dash.rotateX(-Math.PI / 2);
  const white = new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.6 });
  for (const z of [CURB_Z + 3.5, CURB_Z + 12.5]) for (let x = -200; x < 290; x += 7) batch.add(dash, white, tf(x, 0.012, z), { noShadow: true });
  // crosswalk in front of the entrance
  const stripe = new THREE.PlaneGeometry(0.45, ROAD_W - 0.6); stripe.rotateX(-Math.PI / 2);
  for (let i = 0; i < 7; i++) batch.add(stripe, white, tf(W(850) + 0.3 + i * 0.9, 0.013, CURB_Z + ROAD_W / 2), { noShadow: true });

  buildFacade(scene, batch, dyn, FZ);
  buildKiosks(batch, dyn);

  // street lights along both curbs
  let li = 0, lampMat = null;
  for (let x = -60; x < 150; x += 16) {
    for (const [z, side] of [[CURB_Z - 0.5, 1], [CURB_Z + ROAD_W + 0.5, -1]]) {
      if (side === 1 && x > 36 && x < 54) continue; // canopy
      const g = new THREE.Group(); g.position.set(x, 0, z);
      mesh(new THREE.CylinderGeometry(0.09, 0.14, 9, 10), MAT.darkMetal, g, 0, 4.5, 0);
      mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), MAT.darkMetal, g, 0, 8.9, side * 1.1);
      const head = mesh(new THREE.BoxGeometry(0.5, 0.12, 0.9), MAT.darkMetal, g, 0, 8.85, side * 2.1);
      if (!lampMat) { lampMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffe2b0', emissiveIntensity: 0.3 }); dyn.nightMats.push({ m: lampMat, day: 0.3, night: 6 }); }
      mesh(new THREE.PlaneGeometry(0.4, 0.8), lampMat, g, 0, 8.78, side * 2.1).rotation.x = Math.PI / 2;
      batch.addObject(g);
      if (li++ % 3 === 0 && x > -20 && x < 110 && dyn.streetSpots !== false) {
        const l = new THREE.SpotLight('#ffd8a0', 0, 30, 0.9, 0.6, 1.4);
        l.position.set(x, 8.6, z + side * 2.1);
        l.target.position.set(x, 0, z + side * 2.1);
        scene.add(l, l.target);
        dyn.nightLights.push({ l, day: 0, night: 32 });
      }
    }
  }
  // palms on the median and the far sidewalk
  for (let x = -120; x < 220; x += 14) palm(batch, x + 3, CURB_Z + ROAD_W / 2, 1 + TX.rnd() * 0.25);
  for (let x = -120; x < 220; x += 18) if (!(x > 36 && x < 56)) palm(batch, x + 9, CURB_Z - 0.9, 0.9 + TX.rnd() * 0.2);

  // traffic lights at the crosswalk
  for (const [x, z, ry] of [[W(850) - 1, CURB_Z - 0.4, 0], [W(950) + 1, CURB_Z + ROAD_W + 0.4, Math.PI]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), MAT.darkMetal, g, 0, 3, 0);
    mesh(new THREE.BoxGeometry(0.08, 0.08, 5), MAT.darkMetal, g, 0, 5.9, 2.5);
    mesh(new THREE.BoxGeometry(0.4, 1.1, 0.3), MAT.blackMatte, g, 0, 5.4, 4.6);
    batch.addObject(g);
    const lamps = ['#ff2a1a', '#ffb31a', '#2aff6a'].map((c, i) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshStandardMaterial({ color: '#000', emissive: c, emissiveIntensity: 0.1 }));
      m.position.set(x + Math.sin(ry) * 4.6 - Math.cos(ry) * 0, 5.75 - i * 0.34, z + Math.cos(ry) * 4.6 + 0.16 * Math.cos(ry));
      m.rotation.y = ry;
      scene.add(m);
      return m.material;
    });
    dyn.trafficLights.push(lamps);
  }

  buildSkyline(scene, batch, dyn);
  buildCars(scene, dyn, models);
}

function palm(batch, x, z, s) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  const bark = new THREE.MeshStandardMaterial({ color: '#7a6040', roughness: 0.95 });
  const lean = (TX.rnd() - 0.5) * 0.3;
  for (let i = 0; i < 10; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.17 - i * 0.006, 0.21 - i * 0.006, 0.95, 9), bark, g, Math.sin(i * 0.12) * lean * 4, i * 0.92 + 0.46, 0);
    seg.rotation.z = -lean * 0.3;
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3d7a2e', roughness: 0.75, side: THREE.DoubleSide });
  const top = 9.4;
  for (let i = 0; i < 12; i++) {
    const leaf = new THREE.PlaneGeometry(0.7, 3.6, 1, 6);
    const p = leaf.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 1.8; p.setZ(k, -y * y * 0.12); p.setX(k, p.getX(k) * Math.max(0.15, 1 - Math.abs(y - 1.2) * 0.45)); }
    leaf.translate(0, 1.8, 0);
    const m = mesh(leaf, leafMat, g, Math.sin(9 * 0.12) * lean * 4, top, 0);
    m.rotation.set(1.05 + TX.rnd() * 0.35, i / 12 * Math.PI * 2 + TX.rnd() * 0.3, 0, 'YXZ');
  }
  batch.addObject(g);
}

function buildFacade(scene, batch, dyn, FZ) {
  const stoneMap = TX.stoneTex([30, 5], '#c9b48e');
  const stone = new THREE.MeshStandardMaterial({ map: stoneMap, normalMap: TX.normalMapFrom(stoneMap, { strength: 1.8, noise: 0.3, blur: 0 }), roughness: 0.75 });
  const H = 16;
  const x1 = W(DOOR.x1), x2 = W(DOOR.x2);
  // wall pieces either side of the entrance, plus the part above it
  batch.add(new THREE.BoxGeometry(x1 + 20, H, 0.6), stone, tf((x1 - 20) / 2, H / 2, FZ - 0.3));
  batch.add(new THREE.BoxGeometry(90 - x2 + 20, H, 0.6), stone, tf((x2 + 90 + 20) / 2, H / 2, FZ - 0.3));
  batch.add(new THREE.BoxGeometry(x2 - x1, H - 4.2, 0.6), stone, tf((x1 + x2) / 2, 4.2 + (H - 4.2) / 2, FZ - 0.3));
  // roof slab (keeps the interior from showing through at high angles)
  batch.add(new THREE.BoxGeometry(130, 0.5, 50), stone, tf(45, H, 25));
  // gold bands and pilasters
  for (const y of [4.6, 9.5, H - 0.4]) batch.add(new THREE.BoxGeometry(130, 0.3, 0.3), MAT.gold, tf(45, y, FZ + 0.05));
  for (let x = -18; x <= 108; x += 6) {
    if (x > x1 - 4 && x < x2 + 4) continue;
    batch.add(new THREE.BoxGeometry(0.9, H, 0.35), new THREE.MeshStandardMaterial({ color: '#efe2c4', roughness: 0.55 }), tf(x, H / 2, FZ + 0.1));
    batch.add(new THREE.BoxGeometry(1.2, 0.5, 0.5), MAT.gold, tf(x, H - 0.8, FZ + 0.15));
    // lit panels between pilasters
    const lit = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb45a', emissiveIntensity: 0.35 });
    batch.add(new THREE.PlaneGeometry(4.2, 3.6), lit, tf(x + 3, 7, FZ + 0.02), { noShadow: true });
  }
  // glass entrance wall with revolving-style doors
  const glass = MAT.glass;
  batch.add(new THREE.BoxGeometry(x2 - x1, 4.2, 0.05), glass, tf((x1 + x2) / 2, 2.1, FZ - 0.05), { noShadow: true });
  batch.add(new THREE.BoxGeometry(x2 - x1 + 0.2, 0.2, 0.3), MAT.gold, tf((x1 + x2) / 2, 4.2, FZ));

  // porte-cochère canopy
  const cx = (x1 + x2) / 2, cz = FZ + 3.1, cw = 13.2, cd = 6.4;
  batch.add(new THREE.BoxGeometry(cw, 0.7, cd), MAT.blackGloss, tf(cx, 6.2, cz));
  batch.add(new THREE.BoxGeometry(cw + 0.3, 0.9, 0.3), MAT.gold, tf(cx, 6.2, cz + cd / 2));
  for (const px of [cx - 6.4, cx + 6.4]) batch.add(new THREE.CylinderGeometry(0.35, 0.4, 6, 16), MAT.gold, tf(px, 3, cz + cd / 2 - 0.3));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), MAT.bulb, 26 * 12);
  const dm = new THREE.Object3D(); let k = 0;
  for (let i = 0; i < 26; i++) for (let j = 0; j < 12; j++) { dm.position.set(cx - cw / 2 + 0.3 + i * (cw - 0.6) / 25, 5.82, cz - cd / 2 + 0.3 + j * (cd - 0.6) / 11); dm.updateMatrix(); bulbs.setMatrixAt(k++, dm.matrix); }
  scene.add(bulbs);
  dyn.canopyBulbs = bulbs;
  const canopySign = TX.textTex('GOLDEN MIRAGE', { w: 1024, h: 160, color: '#fff3c4', glow: '#ffb000', blur: 30 });
  const cs = emissivePlane(canopySign, cw * 0.9, cw * 0.9 * 160 / 1024, 5, '#ffcf6a', true);
  cs.position.set(cx, 6.2, cz + cd / 2 + 0.17); scene.add(cs);

  // big neon letters on the facade top
  const neon = TX.textTex(['GOLDEN MIRAGE', 'CASINO · HOTEL · RESORT'], { w: 2048, h: 512, color: '#fff2c0', colors: ['#fff2c0', '#ff9ad0'], glow: '#ff3d7f', blur: 40, weights: [1, 0.35] });
  const ns = emissivePlane(neon, 30, 7.5, 2.6, '#ffffff', true);
  ns.position.set(cx, H - 3.6, FZ + 0.25); scene.add(ns);
  dyn.neon.push(ns.material);

  // hotel tower rising behind the casino
  const tw = 56, td = 18, th = 104, tx = 45, tz = -11; // behind the casino, rising above the facade
  const winTex = TX.windowsTex(22, 34, 0.55);
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.repeat.set(3, 3);
  const towerMat = new THREE.MeshStandardMaterial({ color: '#c8b48c', roughness: 0.35, metalness: 0.5, emissive: '#fff', emissiveMap: winTex, emissiveIntensity: 1 });
  dyn.nightMats.push({ m: towerMat, day: 0.15, night: 1.3 });
  batch.add(new THREE.BoxGeometry(tw, th, td), towerMat, tf(tx, th / 2, tz), { noShadow: true });
  for (let i = 0; i < 12; i++) batch.add(new THREE.BoxGeometry(0.5, th, 0.6), MAT.gold, tf(tx - tw / 2 + 2 + i * (tw - 4) / 11, th / 2, tz + td / 2 + 0.2), { noShadow: true });
  batch.add(new THREE.BoxGeometry(tw + 2, 3, td + 2), MAT.gold, tf(tx, th + 1.5, tz), { noShadow: true });
  const crown = TX.textTex('GOLDEN MIRAGE', { w: 2048, h: 256, color: '#fff3c4', glow: '#ffb000', blur: 40 });
  const cr = emissivePlane(crown, 44, 5.5, 5, '#ffcf6a', true);
  cr.position.set(tx, th - 5, tz + td / 2 + 0.6); scene.add(cr);
  const crownLight = new THREE.Mesh(new THREE.BoxGeometry(tw + 2.2, 0.3, td + 2.2), MAT.ledWarm);
  crownLight.position.set(tx, th + 3.1, tz); scene.add(crownLight);

  // pylon sign with an animated LED screen
  const py = OBJECTS.find(o => o.decor === 'pylon');
  if (py) {
    const px = W(py.x + py.w / 2), pz = W(py.y + py.h / 2);
    batch.add(new THREE.BoxGeometry(2.2, 3, 1.2), new THREE.MeshStandardMaterial({ map: TX.stoneTex([1, 1], '#cbb48a'), roughness: 0.7 }), tf(px, 1.5, pz));
    batch.add(new THREE.BoxGeometry(0.8, 26, 0.8), MAT.gold, tf(px, 13, pz));
    const top = TX.textTex(['GOLDEN', 'MIRAGE'], { w: 1024, h: 1024, color: '#fff3c4', glow: '#ffb000', blur: 40, weights: [1, 1] });
    const tp = emissivePlane(top, 7, 7, 5, '#ffcf6a');
    tp.position.set(px, 24, pz + 0.61); scene.add(tp);
    const tp2 = tp.clone(); tp2.rotation.y = Math.PI; tp2.position.z = pz - 0.61; scene.add(tp2);
    batch.add(new THREE.BoxGeometry(7.4, 7.4, 1.2), MAT.blackGloss, tf(px, 24, pz));
    const led = TX.jackpotCanvas(768, 512);
    const scr = emissivePlane(led.tex, 6.4, 4.2, 1.8);
    scr.position.set(px, 16.5, pz + 0.61); scene.add(scr);
    const scr2 = scr.clone(); scr2.rotation.y = Math.PI; scr2.position.z = pz - 0.61; scene.add(scr2);
    batch.add(new THREE.BoxGeometry(6.8, 4.6, 1.1), MAT.blackGloss, tf(px, 16.5, pz));
    dyn.pylon = led;
    led.pos = new THREE.Vector3(px, 16.5, pz);
  }
}

export function drawPylon(led, t) {
  const { g, canvas, tex } = led;
  const w = canvas.width, h = canvas.height;
  const slides = [
    ['WIN BIG', 'TONIGHT', '#ff2fb0', '#ffd23f'],
    ['$2,000,000', 'MEGA JACKPOT', '#ffd23f', '#2fe0ff'],
    ['LOOSEST SLOTS', 'ON THE STRIP*', '#3dff7a', '#ffffff'],
    ['GAMBLING PROBLEM?', 'CALL 1-800-GAMBLER', '#ffffff', '#ffd23f'],
  ];
  const i = Math.floor(t / 4) % slides.length;
  const [a, b, c1, c2] = slides[i];
  const p = (t % 4) / 4;
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, `hsl(${(t * 30) % 360},70%,18%)`); grd.addColorStop(1, `hsl(${(t * 30 + 120) % 360},70%,8%)`);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 12; r++) { g.fillStyle = `rgba(255,255,255,${0.03 + 0.03 * Math.sin(t * 3 + r)})`; g.beginPath(); g.arc(w / 2, h / 2, 40 + r * 40 + (p * 40), 0, 7); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowBlur = 30; g.shadowColor = c1;
  g.fillStyle = c1; g.font = `900 ${i === 1 ? 120 : 96}px "Anton", Impact, sans-serif`;
  g.fillText(a, w / 2, h * 0.4, w * 0.92);
  g.fillStyle = c2; g.font = '800 60px "Barlow Condensed", Arial, sans-serif';
  g.fillText(b, w / 2, h * 0.72, w * 0.92);
  g.shadowBlur = 0;
  // LED pixel grid
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, h);
  for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
  tex.needsUpdate = true;
}

function storefront(batch, o, cfg) {
  const x = W(o.x + o.w / 2), z = W(o.y + o.h / 2), w = W(o.w), d = W(o.h);
  const zf = W(o.y + o.h); // front face
  const body = new THREE.MeshStandardMaterial({ color: cfg.wall, roughness: 0.8 });
  batch.add(new THREE.BoxGeometry(w, 4, d + 0.5), body, tf(x, 2, z - 0.25));
  batch.add(new THREE.BoxGeometry(w * 0.26, 2.3, 0.06), MAT.blackGloss, tf(x - w * 0.28, 1.15, zf + 0.01));
  const win = new THREE.MeshStandardMaterial({ color: '#000', emissive: cfg.window, emissiveIntensity: 1.2 });
  batch.add(new THREE.PlaneGeometry(w * 0.48, 1.5), win, tf(x + w * 0.16, 1.55, zf + 0.02), { noShadow: true });
  const awn = new THREE.BoxGeometry(w + 0.2, 0.08, 1.2);
  awn.rotateX(0.28);
  batch.add(awn, new THREE.MeshStandardMaterial({ color: cfg.awning, roughness: 0.8 }), tf(x, 2.75, zf + 0.55));
  const t = TX.textTex(cfg.text, { w: 1024, h: 256, color: cfg.color, glow: cfg.color, bg: '#120a08', sub: 0.5 });
  const s = emissivePlane(t, w * 0.92, 0.9, 1.8);
  s.position.set(x, 3.45, zf + 0.03);
  batch.add(s.geometry, s.material, tf(x, 3.45, zf + 0.03), { noShadow: true });
}

function buildKiosks(batch, dyn) {
  for (const o of OBJECTS) {
    if (o.type === 'soup') storefront(batch, o, { wall: '#5c6a50', window: '#ffd8a0', awning: '#2e6b30', text: ['COMMUNITY', 'SOUP KITCHEN'], color: '#ffffff' });
    if (o.type === 'pawn') storefront(batch, o, { wall: '#5a4a6a', window: '#ffd23f', awning: '#6a1b9a', text: ['PAWN & LOAN', 'CASH FOR GOLD'], color: '#ffd23f' });
    if (o.type === 'gunstore') storefront(batch, o, { wall: '#3e362e', window: '#ffb080', awning: '#7a0a0a', text: ['GUNS & AMMO', 'SELF DEFENSE'], color: '#ff3b30' });
    if (o.type === 'busstop') {
      const x = W(o.x + o.w / 2), z = W(o.y + o.h / 2), w = W(o.w), d = W(o.h);
      batch.add(new THREE.BoxGeometry(w, 0.1, d), MAT.darkMetal, tf(x, 2.6, z));
      batch.add(new THREE.BoxGeometry(w, 2.4, 0.04), MAT.glass, tf(x, 1.3, z - d / 2), { noShadow: true });
      batch.add(new THREE.BoxGeometry(w * 0.7, 0.08, 0.45), MAT.woodDark, tf(x, 0.48, z - d * 0.25));
      for (const px of [x - w / 2, x + w / 2]) batch.add(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), MAT.darkMetal, tf(px, 1.3, z - d / 2));
      const ad = TX.textTex(['NEED HELP?', '1-800-GAMBLER'], { w: 512, h: 768, bg: '#0e3a5a', color: '#fff', colors: ['#ffd23f', '#fff'] });
      const p = emissivePlane(ad, 1.2, 1.8, 1.1);
      batch.add(p.geometry, p.material, tf(x + w / 2 - 0.1, 1.3, z, -Math.PI / 2), { noShadow: true });
      const bus = TX.textTex(['BUS', 'OUT OF TOWN'], { w: 512, h: 256, bg: '#0e7490', color: '#fff', sub: 0.5 });
      const b = emissivePlane(bus, 1.2, 0.6, 1);
      batch.add(b.geometry, b.material, tf(x - w / 2 - 0.4, 2.9, z + d / 2), { noShadow: true });
      batch.add(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8), MAT.chrome, tf(x - w / 2 - 0.4, 1.6, z + d / 2 - 0.05));
    }
    if (o.type === 'streetsleep') {
      const x = W(o.x + o.w / 2), z = W(o.y + o.h / 2), w = W(o.w), d = W(o.h);
      const card = new THREE.MeshStandardMaterial({ color: '#a4845a', roughness: 1 });
      batch.add(new THREE.BoxGeometry(w * 0.9, 0.03, d * 0.9), card, tf(x, 0.03, z));
      batch.add(new THREE.BoxGeometry(w * 0.5, 0.14, d * 0.6), new THREE.MeshStandardMaterial({ color: '#4a4a6a', roughness: 1 }), tf(x + w * 0.1, 0.1, z));
      batch.add(new THREE.BoxGeometry(0.9, 0.7, 0.7), card, tf(x - w * 0.4, 0.35, z - d * 0.2));
      batch.add(new THREE.BoxGeometry(0.8, 0.5, 0.5), MAT.chrome, tf(x + w * 0.55, 0.6, z - d * 0.1));
    }
    if (o.type === 'tap') {
      const x = W(o.x + o.w / 2), z = W(o.y + o.h / 2);
      batch.add(new THREE.CylinderGeometry(0.12, 0.15, 1, 12), MAT.darkMetal, tf(x, 0.5, z));
      batch.add(new THREE.BoxGeometry(0.06, 0.06, 0.25), MAT.chrome, tf(x, 0.95, z + 0.12));
    }
  }
  // trash cans, newspaper boxes, hydrant
  const can = new THREE.MeshStandardMaterial({ color: '#2a3a2a', metalness: 0.4, roughness: 0.5 });
  for (const x of [14, 31, 54, 75]) batch.add(new THREE.CylinderGeometry(0.3, 0.27, 0.95, 16), can, tf(x, 0.47, W(1122)));
  batch.add(new THREE.CylinderGeometry(0.14, 0.16, 0.7, 12), new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.4 }), tf(W(1060), 0.35, W(1122)));
  for (const [x, c] of [[W(1000), '#1f4ea0'], [W(1012), '#c0121f']]) batch.add(new THREE.BoxGeometry(0.5, 1.1, 0.45), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), tf(x, 0.55, W(1118)));
}

function buildSkyline(scene, batch, dyn) {
  const names = ['EMERALD PALACE', 'NEPTUNE', 'THE ROYALE', 'SILVER SANDS', 'CRYSTAL KEY', 'SAHARA STAR', 'LUCKY LADY'];
  let x = -150, n = 0;
  const z0 = CURB_Z + ROAD_W + 6;
  while (x < 250) {
    const w = 22 + TX.rnd() * 26, pod = 10 + TX.rnd() * 6, th = 40 + TX.rnd() * 110, d = 30;
    const hue = TX.rpick(['#c7b89a', '#8fa3b8', '#b8a0a0', '#a8b8a0', '#d0c0a8', '#707a8a']);
    // podium with neon name
    batch.add(new THREE.BoxGeometry(w, pod, d), new THREE.MeshStandardMaterial({ color: hue, roughness: 0.6 }), tf(x + w / 2, pod / 2, z0 + d / 2), { noShadow: true });
    const neonCol = TX.rpick(['#ff2fb0', '#2fe0ff', '#ffd23f', '#3dff7a', '#ff6a2f', '#b36bff']);
    const t = TX.textTex(names[n % names.length], { w: 1024, h: 180, color: '#fff', glow: neonCol, blur: 30 });
    const sgn = emissivePlane(t, Math.min(w * 0.9, 20), Math.min(w * 0.9, 20) * 180 / 1024, 5, neonCol, true);
    sgn.position.set(x + w / 2, pod - 2.2, z0 - 0.05); sgn.rotation.y = Math.PI; scene.add(sgn);
    // LED billboard on some podiums
    if (n % 2 === 0) {
      const bb = TX.textTex([TX.rpick(['LIVE MUSIC', 'ALL YOU CAN EAT', 'MAGIC SHOW', 'POOL PARTY']), TX.rpick(['TONIGHT', 'FROM $19.99', 'SOLD OUT', 'EVERY DAY'])], { w: 1024, h: 512, bg: '#0a0610', color: '#fff', colors: [neonCol, '#fff'] });
      const b = emissivePlane(bb, 8, 4, 1.6);
      b.position.set(x + w * 0.3, pod + 3, z0 - 0.3); b.rotation.y = Math.PI; scene.add(b);
    }
    // tower
    const tw = w * (0.55 + TX.rnd() * 0.3);
    const wt = TX.windowsTex(10 + (tw / 3 | 0), 20 + (th / 4 | 0), 0.4 + TX.rnd() * 0.3);
    const tm = new THREE.MeshStandardMaterial({ color: hue, roughness: 0.3, metalness: 0.5, emissive: '#fff', emissiveMap: wt, emissiveIntensity: 1 });
    dyn.nightMats.push({ m: tm, day: 0.1, night: 1.2 });
    batch.add(new THREE.BoxGeometry(tw, th, 18), tm, tf(x + w / 2, pod + th / 2, z0 + 12), { noShadow: true });
    const crown = new THREE.MeshStandardMaterial({ color: '#000', emissive: neonCol, emissiveIntensity: 5 });
    batch.add(new THREE.BoxGeometry(tw + 0.4, 0.4, 18.4), crown, tf(x + w / 2, pod + th, z0 + 12), { noShadow: true });
    x += w + 4 + TX.rnd() * 6; n++;
  }
  // flanking buildings beside the casino
  for (const [cx, w] of [[-26, 50], [116, 50]]) {
    const wt = TX.windowsTex(14, 16, 0.35);
    const m = new THREE.MeshStandardMaterial({ color: '#8a7a6a', roughness: 0.6, emissive: '#fff', emissiveMap: wt, emissiveIntensity: 1 });
    dyn.nightMats.push({ m, day: 0.08, night: 1 });
    batch.add(new THREE.BoxGeometry(w, 40, 55), m, tf(cx, 20, 25), { noShadow: true });
  }
  // distant mountains
  const mt = TX.canvasTex(2048, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#5a4a6a'); grd.addColorStop(1, '#2a2030');
    g.fillStyle = grd; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.35 + Math.sin(x * 0.004) * 40 + Math.sin(x * 0.013) * 25 + TX.rnd() * 8);
    g.lineTo(w, h); g.fill();
  });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(900, 900, 120, 64, 1, true), new THREE.MeshBasicMaterial({ map: mt, transparent: true, side: THREE.BackSide, fog: false, color: '#9a8aa0' }));
  ring.position.set(45, 40, 40);
  scene.add(ring);
  dyn.mountains = ring.material;
}

function buildCars(scene, dyn, models) {
  if (!models.car) return;
  // normalise the car: length 4.6 m along +X, wheels on the ground
  const src = models.car;
  const b = new THREE.Box3().setFromObject(src), size = b.getSize(new THREE.Vector3());
  const alongZ = size.z > size.x;
  const holder = new THREE.Group();
  holder.add(src);
  if (alongZ) src.rotation.y = Math.PI / 2;
  const b2 = new THREE.Box3().setFromObject(holder), s2 = b2.getSize(new THREE.Vector3());
  const k = 4.6 / s2.x;
  src.scale.multiplyScalar(k);
  const b3 = new THREE.Box3().setFromObject(holder), c3 = b3.getCenter(new THREE.Vector3());
  src.position.x -= c3.x; src.position.z -= c3.z; src.position.y -= b3.min.y;
  // find which end has the headlights
  let head = null;
  src.traverse(o => { if (o.isMesh && /^lights$/.test(o.name)) head = o; });
  let flip = false;
  if (head) { const hb = new THREE.Box3().setFromObject(head); flip = hb.getCenter(new THREE.Vector3()).x < 0; }
  if (flip) src.rotation.y += Math.PI;
  // Bake the ~30 separate parts of the model into one mesh per material (the car
  // doesn't animate), so each car is a handful of draw calls.
  const template = mergeCar(holder);
  const headLamp = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff6e0', emissiveIntensity: 2 });
  const tailLamp = new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff1a1a', emissiveIntensity: 1.5 });
  const paints = ['#b3121f', '#f2c14e', '#101014', '#e8e8e8', '#1f4ea0', '#6a6a70', '#0f6a4a', '#d06a1a', '#5a1a7a'];
  dyn.cars = [];
  for (let i = 0; i < 9; i++) {
    const car = template.clone(true);
    const paint = new THREE.MeshPhysicalMaterial({ color: paints[i % paints.length], metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.18 });
    car.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      o.material = { paint, head: headLamp, tail: tailLamp }[o.userData.role] || o.material;
    });
    scene.add(car);
    dyn.cars.push(car);
  }
}

const GET = ['getX', 'getY', 'getZ', 'getW'];
function mergeCar(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map();
  root.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const role = /^lights$/.test(o.name) ? 'head' : /lights_red/.test(o.name) ? 'tail' : /Body_Color|body/i.test(o.material.name + o.name) ? 'paint' : '';
    const key = o.material.uuid + '|' + role;
    if (!groups.has(key)) groups.set(key, { material: o.material, role, list: [] });
    groups.get(key).list.push(o);
  });
  const out = new THREE.Group();
  for (const { material, role, list } of groups.values()) {
    const names = ['position', 'normal', 'uv'].filter(n => list.every(o => o.geometry.getAttribute(n)));
    const geos = list.map(o => {
      const src = o.geometry, g = new THREE.BufferGeometry();
      for (const n of names) {   // expand quantized attributes to floats before transforming
        const a = src.getAttribute(n), arr = new Float32Array(a.count * a.itemSize);
        for (let c = 0; c < a.itemSize; c++) for (let i = 0; i < a.count; i++) arr[i * a.itemSize + c] = a[GET[c]](i);
        g.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize));
      }
      const count = src.getAttribute('position').count;
      g.setIndex(new THREE.BufferAttribute(src.index ? Uint32Array.from(src.index.array) : Uint32Array.from({ length: count }, (_, i) => i), 1));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      return g;
    });
    const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, material);
    m.userData.role = role;
    out.add(m);
  }
  return out;
}
