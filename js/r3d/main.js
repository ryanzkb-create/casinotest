// Golden Mirage 3D engine entry point.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import * as TX from './tex.js';
import { initMaterials, buildShell, buildProps, Batcher, tableData, drawJackpot, W, K, getSlotMaterials, CEIL, MAT } from './build.js';
import { buildStreet, drawPylon, LANE_Z } from './street.js';
import { decodeAnimLibrary, prepareAvatar } from './people.js';
import { Crowd, AVATAR_FILES } from './crowd.js';
import { TableFX } from './tablefx.js';

const canvas = document.getElementById('game3d');
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
// Safari's WebGL (on Metal) is noticeably slower than Chrome's, especially at retina resolution
const SAFARI = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
// Graphics presets: 0 low, 1 medium, 2 high. "auto" picks medium on desktop and low on phones;
// the player can override it in Settings (stored by js/world.js) and ?q= forces a level for testing.
const PRESETS = [
  { pr: 1, shadows: 0, lights: 3, spots: false, gtao: false, smaa: false, dyn: 0.15, crowd: { maxDist: 30, shadowDist: 0 } },
  { pr: SAFARI ? 1 : 1.25, shadows: 1024, lights: 7, spots: true, gtao: false, smaa: true, dyn: 0.1, crowd: { maxDist: 40, shadowDist: 10 } },
  { pr: 1.5, shadows: 2048, lights: 12, spots: true, gtao: true, smaa: false, msaa: 4, dyn: 0.08, crowd: { maxDist: 55, shadowDist: 16 } },
];
// The Mac app (desktop/) runs Chrome's GPU pipeline on a known machine: High at full retina resolution
const APP = !!(window.desktop && window.desktop.isApp);
if (APP) PRESETS[2].pr = 2;
const QUALITY = (() => {
  const pref = typeof SETTINGS !== 'undefined' ? SETTINGS.quality : 'auto';
  let level = pref === 'auto' || pref === undefined ? (APP ? 2 : MOBILE ? 0 : 1) : +pref;
  const q = new URLSearchParams(location.search).get('q');
  const forced = q !== null && q !== '';
  if (forced) level = +q;
  level = Math.max(0, Math.min(2, level || 0));
  return { level, forced, safari: SAFARI, ...PRESETS[level], crowd: { ...PRESETS[level].crowd } };
})();

let renderer, scene, camera, composer, bloom, gtao, smaa, gradePass;
let sun, hemi, sky, stars, envInterior, envExterior, envNight;
let crowd, tables;
const dyn = { scene: null, ads: [], jackpots: [], bigWheels: [], nightMats: [], nightLights: [], trafficLights: [], neon: [], cars: [] };
const clock = { t: 0, last: 0 };

// ---------------------------------------------------------------------------
// Asset loading (fetch with progress, or embedded base64 in single-file builds)
// ---------------------------------------------------------------------------
const ASSETS = [
  ['anims', 'assets/anims.bin'],
  ['interior', 'assets/interior.hdr'],
  ['exterior', 'assets/exterior.hdr'],
  ['car', 'assets/props/car.glb'],
  ['sofa', 'assets/props/sofa.glb'],
  ['chair', 'assets/props/chair.glb'],
  ...AVATAR_FILES.map(f => ['p:' + f, `assets/people/${f}.glb`]),
];

function b64ToBuffer(b64) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

async function loadAll(onProgress) {
  const out = {};
  const sizes = {}; const done = {};
  let total = 0;
  const report = () => {
    let got = 0, tot = 0;
    for (const [k] of ASSETS) { got += done[k] || 0; tot += sizes[k] || 400_000; }
    onProgress(Math.min(0.99, got / tot));
  };
  // hosts that only serve text get base64 copies of the assets (see tools/build_single.py)
  const suffix = window.__ASSET_SUFFIX || '';
  const decode = buf => (suffix ? b64ToBuffer(new TextDecoder().decode(buf)) : buf);
  await Promise.all(ASSETS.map(async ([key, path]) => {
    if (window.__ASSETS && window.__ASSETS[path]) { out[key] = b64ToBuffer(window.__ASSETS[path]); done[key] = sizes[key] = out[key].byteLength; report(); return; }
    const res = await fetch(path + suffix);
    if (!res.ok) throw new Error('Failed to load ' + path);
    const len = +res.headers.get('content-length') || 0;
    sizes[key] = len || 400_000;
    if (!res.body || !res.body.getReader) { out[key] = decode(await res.arrayBuffer()); done[key] = sizes[key]; report(); return; }
    const reader = res.body.getReader(); const chunks = []; let got = 0;
    for (;;) {
      const { done: d, value } = await reader.read();
      if (d) break;
      chunks.push(value); got += value.length; done[key] = got; report();
    }
    const buf = new Uint8Array(got); let p = 0; for (const c of chunks) { buf.set(c, p); p += c.length; }
    out[key] = decode(buf.buffer); sizes[key] = got;
    total += got;
  }));
  onProgress(1);
  return out;
}

function parseGLB(buffer) {
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', gltf => {
    // sample models can carry their own lights and cameras; the scene sets up its own
    const extras = [];
    gltf.scene.traverse(o => { if (o.isLight || o.isCamera) extras.push(o); });
    extras.forEach(o => o.removeFromParent());
    resolve(gltf);
  }, reject));
}
function parseHDR(buffer, pmrem, scale = 1) {
  const data = new RGBELoader().setDataType(THREE.FloatType).parse(buffer);
  const px = new Float32Array(data.data);
  for (let i = 0; i < px.length; i += 4) { px[i] *= scale; px[i + 1] *= scale; px[i + 2] *= scale; }
  const t = new THREE.DataTexture(px, data.width, data.height, THREE.RGBAFormat, THREE.FloatType);
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true;
  t.needsUpdate = true;
  const env = pmrem.fromEquirectangular(t).texture;
  t.dispose();
  return env;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
async function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.pr));
  renderer.shadowMap.enabled = QUALITY.shadows > 0;
  renderer.shadowMap.type = QUALITY.level >= 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;   // refreshed from render(), every frame or every few frames
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  TX.MAX_ANISO.v = Math.min(QUALITY.level >= 2 ? 16 : 8, renderer.capabilities.getMaxAnisotropy());

  const progress = p => { if (window.onRender3DProgress) window.onRender3DProgress(p); };
  const assets = await loadAll(progress);

  scene = new THREE.Scene();
  dyn.scene = scene;
  scene.fog = new THREE.Fog('#1a1024', 120, 900);
  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 2500);

  const pmrem = new THREE.PMREMGenerator(renderer);
  envInterior = parseHDR(assets.interior, pmrem, 0.5);
  envExterior = parseHDR(assets.exterior, pmrem, 1);
  envNight = parseHDR(assets.exterior, pmrem, 0.07);
  scene.environment = envInterior;

  // sky
  sky = new Sky();
  sky.scale.setScalar(2000);
  const su = sky.material.uniforms;
  su.turbidity.value = 6; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.005; su.mieDirectionalG.value = 0.85;
  scene.add(sky);
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 1500; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.4 + 0.1; sp.push(Math.cos(a) * Math.cos(e) * 1500, Math.sin(e) * 1500, Math.sin(a) * Math.cos(e) * 1500); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, fog: false }));
  scene.add(stars);

  // lights
  hemi = new THREE.HemisphereLight('#ffe9cc', '#4a2430', 1.1);
  scene.add(hemi);
  sun = new THREE.DirectionalLight('#fff0d8', 2.5);
  sun.castShadow = true;
  const ss = QUALITY.shadows || 1024;
  sun.shadow.mapSize.set(ss, ss);
  const sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  // interior accent lights (colourful casino glow + warm pools over the tables)
  // every light is evaluated for every lit pixel, so lower presets keep only the most important
  const accents = [[52, 9, '#ffd9a0', 45], [60, 24, '#ffd9a0', 45], [20, 20, '#3dc8ff', 30], [75, 10, '#ffcf8a', 40], [20, 46, '#3de0ff', 35], [80, 43, '#ffb070', 35], [9, 8, '#ff3db0', 30],
    [31, 30, '#ffb03d', 30], [9, 30, '#b36bff', 30], [85, 31, '#ffe0b0', 35], [45, 25, '#ffe0b0', 30], [8, 44, '#ffd070', 30]];
  for (const [x, z, c, i] of accents.slice(0, QUALITY.lights)) {
    const l = new THREE.PointLight(c, i * 0.22, 18, 2);
    l.position.set(x, 4.6, z);
    scene.add(l);
  }

  // world
  initMaterials();
  // decode every model in parallel (texture decoding runs off the main thread)
  const parseOr = (buf, label) => parseGLB(buf).then(g => g.scene, e => { console.warn(label, e); return null; });
  const avatarJobs = AVATAR_FILES.map(f => parseOr(assets['p:' + f], 'avatar ' + f));
  const [sofa, chair, car] = await Promise.all([parseOr(assets.sofa, 'sofa'), parseOr(assets.chair, 'chair'), parseOr(assets.car, 'car')]);
  const models = { sofa, chair, car };
  const batch = new Batcher();
  buildShell(scene, batch, dyn);
  buildProps(scene, batch, dyn, models);
  dyn.streetSpots = QUALITY.spots;
  buildStreet(scene, batch, dyn, models);
  batch.build(scene);

  // people
  const lib = decodeAnimLibrary(assets.anims);
  const templates = {};
  (await Promise.all(avatarJobs)).forEach((sc, i) => { if (sc) templates[AVATAR_FILES[i]] = prepareAvatar(sc); });
  crowd = new Crowd(scene, templates, lib);
  tables = new TableFX(scene, crowd);

  setupPost();
  buildFX();
  resize();
  canvas.classList.remove('hidden');
  document.getElementById('game').classList.add('hidden');
  window.Render3D._dbg = { THREE, renderer, scene, bloom, sun, hemi, camera, composer, envInterior, envExterior, gradePass };
  window.Render3D.ready = true;
  if (window.onRender3DReady) window.onRender3DReady();
}

function setupPost() {
  // High: hardware multisampling (crisp edges on geometry and people) instead of SMAA
  composer = QUALITY.msaa
    ? new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: QUALITY.msaa }))
    : new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (QUALITY.gtao) {
    gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.5, scale: 1 });
    composer.addPass(gtao);
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.3, 4.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.28 }, uSat: { value: 1.12 }, uContrast: { value: 1.06 }, uWarm: { value: 0.02 }, uHurt: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette, uSat, uContrast, uWarm, uHurt; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
        float l = dot(col, vec3(0.299,0.587,0.114)); col = mix(vec3(l), col, uSat);
        col = (col - 0.5) * uContrast + 0.5; col.r += uWarm; col.b -= uWarm * 0.5;
        vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * uVignette * 2.2; col *= v;
        col = mix(col, vec3(l * 0.6 + 0.2, 0.0, 0.0), uHurt * 0.4);
        gl_FragColor = vec4(col, c.a); }`,
  });
  composer.addPass(gradePass);
  // retina screens are sharp enough without SMAA's three extra full-screen passes
  if (QUALITY.smaa && renderer.getPixelRatio() < 1.4) { smaa = new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()); composer.addPass(smaa); }
}

// ---------------------------------------------------------------------------
// Effects: tracers, muzzle flash, impacts
// ---------------------------------------------------------------------------
let tracers = [], muzzle, impacts;
function buildFX() {
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 4, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe8a0', transparent: true, opacity: 0.9 }));
    m.visible = false; scene.add(m); tracers.push(m);
  }
  // a real light only on High: every light adds shader work to every pixel all the time
  muzzle = QUALITY.level >= 2 ? new THREE.PointLight('#ffb050', 0, 6, 2) : new THREE.Object3D();
  scene.add(muzzle);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff0b0' }));
  flash.visible = false; scene.add(flash); muzzle.userData.flash = flash;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function updateFX() {
  tracers.forEach(t => { t.visible = false; });
  muzzle.intensity = 0; muzzle.userData.flash.visible = false;
  (typeof fx !== 'undefined' ? fx : []).forEach((f, i) => {
    const t = tracers[i % tracers.length];
    const a = f.from ? crowd.hand(f.from, _v1) : _v1.set(W(f.x1), 1.4, W(f.y1));
    const b = f.to ? crowd.chest(f.to, _v2) : _v2.set(W(f.x2), f.y3d || 1.2, W(f.y2));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    t.position.copy(mid);
    t.scale.set(1, a.distanceTo(b), 1);
    t.quaternion.setFromUnitVectors(_up, b.clone().sub(a).normalize());
    t.material.color.set(f.enemy ? '#ff9a70' : '#ffe8a0');
    t.visible = true;
    muzzle.position.copy(a); muzzle.intensity = 25;
    muzzle.userData.flash.position.copy(a); muzzle.userData.flash.visible = true;
  });
}

// ---------------------------------------------------------------------------
// Day / night and interior / exterior
// ---------------------------------------------------------------------------
const sunDir = new THREE.Vector3();
let insideMix = 1;
function updateEnvironment(dt) {
  const hr = (S.minutes % 1440) / 60;
  const elev = Math.sin(((hr - 6) / 12) * Math.PI);          // -1..1
  const day = THREE.MathUtils.clamp(elev * 1.4 + 0.15, 0, 1);
  const inside = player.y < CASINO_BOTTOM - 10;
  insideMix += ((inside ? 1 : 0) - insideMix) * Math.min(1, dt * 3);
  const phi = THREE.MathUtils.degToRad(90 - Math.max(-10, elev * 70));
  const theta = THREE.MathUtils.degToRad(200 + (hr - 12) * 10);
  sunDir.setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  stars.material.opacity = 1 - day;
  sky.visible = true;

  const px = W(player.x), pz = W(player.y);
  if (inside) {
    // interior: bright, warm key light from the ceiling fixtures
    sun.position.set(px + 4, 20, pz + 6);
    sun.color.set('#ffe6c4');
    sun.intensity = 1.4;
    hemi.color.set('#ffe9cc'); hemi.groundColor.set('#5a2a38'); hemi.intensity = 0.6;
    scene.environment = envInterior;
    renderer.toneMappingExposure = 1.12;
    scene.fog.near = 120; scene.fog.far = 900; scene.fog.color.set('#1a1024');
  } else {
    sun.position.set(px + sunDir.x * 60, Math.max(8, sunDir.y * 60), pz + sunDir.z * 60);
    sun.color.set(day > 0.4 ? '#fff2dc' : '#ffb27a').lerp(new THREE.Color('#8aa0ff'), 1 - Math.min(1, day * 2));
    sun.intensity = 0.25 + day * 2.8;
    hemi.color.set(day > 0.3 ? '#bcd4ff' : '#3a4a8a'); hemi.groundColor.set('#40302a'); hemi.intensity = 0.35 + day * 0.9;
    scene.environment = day > 0.35 ? envExterior : envNight;
    renderer.toneMappingExposure = 0.95 + (1 - day) * 0.15;
    scene.fog.color.set(day > 0.3 ? '#c8b8a8' : '#140e22'); scene.fog.near = 150; scene.fog.far = 1200;
  }
  sun.target.position.set(px, 0, pz);
  const night = inside ? 1 : 1 - day;
  for (const n of dyn.nightMats) n.m.emissiveIntensity = n.day + (n.night - n.day) * (1 - day);
  for (const n of dyn.nightLights) n.l.intensity = n.day + (n.night - n.day) * (1 - day);
  if (dyn.mountains) dyn.mountains.color.set(day > 0.3 ? '#a898a0' : '#2a2438');
  if (bloom) bloom.strength = inside ? 0.5 : 0.35 + (1 - day) * 0.3;
}

// ---------------------------------------------------------------------------
// GTA-style camera
// ---------------------------------------------------------------------------
const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, fov: 60, override: null, overrideT: 0, dist: 3.3 };
const _p = new THREE.Vector3(), _r = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

function mapFree(x, z) {
  // x,z in metres → map units; checks walls & solid objects
  const mx = x / K, my = z / K;
  if (mx < 2 || mx > WORLD.w - 2) return false;
  for (const o of OBJECTS) {
    if (!o.solid || o.road) continue;
    if (!(o.wall || o.decor === 'pillar' || o.decor === 'glassWall' || o.decor === 'pylon' || ['soup', 'pawn', 'gunstore', 'hotel', 'cashier', 'bar', 'hotdog', 'buffet', 'steak'].includes(o.type))) continue;
    if (mx > o.x - 3 && mx < o.x + o.w + 3 && my > o.y - 3 && my < o.y + o.h + 3) return false;
  }
  // casino outer walls (the front wall only blocks where there's no door)
  if (my < 4 && my > -30) return false;
  return true;
}

function updateCamera(dt) {
  const aiming = !!view.aiming;
  const pitch = THREE.MathUtils.clamp(view.pitch, -0.55, 1.15);
  const inside = player.y < CASINO_BOTTOM;
  const wantDist = aiming ? 1.35 : (player.pose === 'sprint' ? 4.1 : 3.4) * view.zoom;
  const shoulder = aiming ? 0.62 : 0.45;
  cam.dist += (wantDist - cam.dist) * Math.min(1, dt * 8);
  cam.fov += ((aiming ? 46 : 62) - cam.fov) * Math.min(1, dt * 8);
  const yaw = view.yaw;
  _p.set(W(player.x), 1.62, W(player.y));
  _r.set(Math.cos(yaw), 0, -Math.sin(yaw));
  _b.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const pivot = _p.clone().addScaledVector(_r, shoulder);
  // collision: walk back from the pivot until something is in the way
  let d = cam.dist;
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * cam.dist;
    _d.copy(pivot).addScaledVector(_b, t);
    const blocked = !mapFree(_d.x, _d.z) || (inside && _d.y > CEIL - 0.3) || (!inside && _d.z < W(CASINO_BOTTOM + 20) && player.y > CASINO_BOTTOM) || (inside && _d.z > W(CASINO_BOTTOM - 4));
    if (blocked) { d = Math.max(0.35, t - cam.dist / steps); break; }
  }
  const target = pivot.clone().addScaledVector(_b, d);
  if (target.y < 0.25) target.y = 0.25;
  const look = pivot.clone().addScaledVector(_b, -12);
  if (cam.override) {
    cam.overrideT = Math.min(1, cam.overrideT + dt * 1.6);
    const e = cam.overrideT * cam.overrideT * (3 - 2 * cam.overrideT);
    cam.pos.lerp(cam.override.pos, e);
    cam.look.lerp(cam.override.look, e);
    camera.fov += ((cam.override.fov || 50) - camera.fov) * Math.min(1, dt * 4);
  } else {
    const jump = !cam.init || cam.pos.distanceTo(target) > 15;
    const k = jump ? 1 : 1 - Math.exp(-dt * 18);
    cam.pos.lerp(target, k);
    cam.look.lerp(look, jump ? 1 : 1 - Math.exp(-dt * 22));
    camera.fov = cam.fov;
    cam.init = true;
  }
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
let fpsAcc = 0, fpsN = 0, fpsCheck = 0, lastDraw = 0;
const _ndc = new THREE.Vector3();
function render(time) {
  if (!window.Render3D.ready) return;
  const t = time / 1000;
  const dt = Math.min(0.1, clock.last ? t - clock.last : 0.016);
  clock.last = t; clock.t += dt;

  updateEnvironment(dt);
  updateCamera(dt);
  camera.updateMatrixWorld();
  crowd.update(dt, [player, ...npcs], camera, QUALITY.crowd);
  tables.update(dt, t);
  updateDynamic(dt, t);
  updateFX();
  gradePass.uniforms.uHurt.value = Math.max(0, 1 - (S.health || 100) / 40) * 0.6;
  renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled && (frameN++ % shadowEvery === 0);
  composer.render(dt);
  updateBubbles();

  // adaptive quality: step down one notch at a time while the frame rate is low
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (fps < 42 && !QUALITY.forced) degrade(fps);
  }
}

let shadowEvery = QUALITY.level >= 2 ? 1 : 2, frameN = 0;
function degrade(fps) {
  const pr = renderer.getPixelRatio();
  if (gtao && gtao.enabled) gtao.enabled = false;
  else if (pr > 1.5) { renderer.setPixelRatio(1.5); resize(); }
  else if (pr > 1) { renderer.setPixelRatio(1); resize(); }
  else if (smaa && smaa.enabled && fps < 36) smaa.enabled = false;
  else if (QUALITY.crowd.maxDist > 30 && fps < 34) { QUALITY.crowd.maxDist = 30; QUALITY.crowd.shadowDist = 6; }
  else if (renderer.shadowMap.enabled && shadowEvery < 4 && fps < 32) shadowEvery = 4;
  else if (bloom.enabled && fps < 28) bloom.enabled = false;
  else if (pr > 0.75 && fps < 24) { renderer.setPixelRatio(0.75); resize(); }
}

// Speech bubbles: HTML labels pinned above heads
const bubbleEls = new Map();
const _bf = new THREE.Vector3(), _bh = new THREE.Vector3(), _bt = new THREE.Vector3();
function updateBubbles() {
  const root = document.getElementById('bubbles');
  if (!root) return;
  const seen = new Set();
  camera.getWorldDirection(_bf);
  for (const n of npcs) {
    if (!n.bubble || !(n.bubbleT > 0)) continue;
    crowd.head(n, _bh); _bh.y += 0.3;
    _bt.copy(_bh).sub(camera.position);
    const dist = _bt.length();
    if (dist > 16 || _bt.dot(_bf) <= 0) continue;
    _ndc.copy(_bh).project(camera);
    if (Math.abs(_ndc.x) > 1.05 || Math.abs(_ndc.y) > 1.05) continue;
    let e = bubbleEls.get(n);
    if (!e) { e = document.createElement('div'); e.className = 'bubble3d'; root.appendChild(e); bubbleEls.set(n, e); }
    if (e.textContent !== n.bubble) e.textContent = n.bubble;
    const x = (_ndc.x * 0.5 + 0.5) * innerWidth, y = (-_ndc.y * 0.5 + 0.5) * innerHeight;
    e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${Math.max(0.6, Math.min(1, 7 / dist)).toFixed(3)}) translate(-50%, -100%)`;
    e.style.opacity = Math.min(1, n.bubbleT * 2).toFixed(2);
    seen.add(n);
  }
  for (const [n, e] of bubbleEls) if (!seen.has(n)) { e.remove(); bubbleEls.delete(n); }
}

let dynT = 0;
function updateDynamic(dt, t) {
  dynT += dt;
  // slot machine screens (attract mode) at ~12 fps
  const sms = getSlotMaterials();
  for (const sm of Object.values(sms)) {
    const s = sm.screen;
    if (!s.spinning && Math.random() < dt * 0.25) {
      const syms = s.st.sym;
      s.spin([0, 1, 2, 3, 4].map(() => [TX.rpick(syms), TX.rpick(syms), TX.rpick(syms)]), 1.8);
      s.spinning = true;
    }
    const active = s.update(dt);
    if (s.spinning && !active) { s.spinning = false; s.message = Math.random() < 0.3 ? 'WINNER!' : 'PLAY ' + s.theme.toUpperCase(); if (s.message === 'WINNER!') s.flash = 1.5; }
  }
  if (dynT > QUALITY.dyn) {
    // only redraw (and re-upload) screens that are close enough to read
    const cp = camera.position;
    if (cp.x < 52 && cp.z < 50) for (const sm of Object.values(sms)) sm.screen.draw();
    for (const j of dyn.jackpots) { j.value += 0.37 + Math.random() * 3; if (cp.distanceTo(j.pos) < 30) drawJackpot(j, t); }
    if (dyn.pylon && cp.distanceTo(dyn.pylon.pos) < 110) drawPylon(dyn.pylon, t);
    dynT = 0;
  }
  for (const w of dyn.bigWheels) w.rotation.z += dt * 0.6;
  MAT.bulb.emissiveIntensity = 4.6 + Math.sin(t * 7) * 0.5;
  for (const n of dyn.neon) n.emissiveIntensity = Math.sin(t * 2.1) > 0.985 ? 1.2 : 5;
  // traffic lights
  const phase = (t % 20) / 20;
  for (const lamps of dyn.trafficLights) {
    lamps[0].emissiveIntensity = phase < 0.45 ? 3 : 0.1;
    lamps[1].emissiveIntensity = phase >= 0.45 && phase < 0.55 ? 3 : 0.1;
    lamps[2].emissiveIntensity = phase >= 0.55 ? 3 : 0.1;
  }
  // traffic
  // from deep inside the casino the street is behind walls: skip drawing the traffic
  const carsVisible = camera.position.z > W(CASINO_BOTTOM) - 14;
  if (dyn.cars) cars.forEach((c, i) => {
    const car = dyn.cars[i % dyn.cars.length];
    if (!car) return;
    const lane = c.lane % 4;
    car.position.set(W(c.x), 0, LANE_Z[lane]);
    car.rotation.y = lane < 2 ? Math.PI : 0;
    car.visible = carsVisible;
  });
}

// ---------------------------------------------------------------------------
// API used by the game
// ---------------------------------------------------------------------------
function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); }
}

// Which hostile is under (or closest to) the crosshair?
function aimPick(maxAngle = 0.14) {
  let best = null, bd = maxAngle;
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  for (const n of npcs) {
    if (!n.hostile || n.pose === 'down') continue;
    const c = crowd.chest(n, new THREE.Vector3());
    const to = c.clone().sub(camera.position);
    if (to.dot(fwd) <= 0) continue;
    _ndc.copy(c).project(camera);
    const d = Math.hypot(_ndc.x * camera.aspect, _ndc.y) * 0.5;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function setView(v) {
  if (!v) { cam.override = null; return; }
  cam.override = { pos: v.pos.clone(), look: v.look.clone(), fov: v.fov };
  cam.overrideT = 0;
}

window.Render3D = {
  ready: false, render, resize, aimPick, setView,
  gesture: (e, kind) => crowd && crowd.gesture(e, kind),
  tables: () => tables,
  cameraYaw: () => view.yaw,
  quality: QUALITY,
};

init().catch(err => {
  console.error('3D renderer failed, using 2D fallback', err);
  canvas.classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  if (window.onRender3DFailed) window.onRender3DFailed(err);
});
