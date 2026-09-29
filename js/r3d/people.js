// Realistic people: Microsoft Rocketbox avatars (MIT licence) driven by the
// Rocketbox motion-capture library (walks, runs, sitting at a table, talking,
// nodding, cheering, drinking…) plus a procedural layer on top of it:
//   - overlays: aim, hands up, tray, phone, cheer, dance, crouch, cower, dealer gestures…
//   - head look-at, blinking (eyelid bones), jaw movement while speaking
//   - hit reactions, recoil and a ragdoll-lite fall
//   - runtime variation (clothes / hair tints, scale, glasses, hats)
// Assets are converted to compact GLB/binary files by tools in /tools.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Speed at which the feet slide backwards while planted (m/s), measured on the toe bones of the
// original clips. Playing a clip at (movement speed / this) keeps the feet from skating.
const CLIP_SPEED = {
  m: { walk_neutral_01: 1.02, walk_slow_01: 0.8, walk_drunk: 0.8, run_neutral_01: 3.2, run_fast_01: 5.0 },
  f: { walk_neutral_01: 1.23, walk_slow_01: 0.85, walk_drunk: 0.91, run_neutral_01: 3.0, run_fast_01: 5.0 },
};

// ---------------------------------------------------------------------------
// Animation library (binary: u32 header length, JSON header, int16 data)
// ---------------------------------------------------------------------------
export function decodeAnimLibrary(buffer) {
  const dv = new DataView(buffer);
  const hlen = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, hlen)));
  const start = 4 + hlen + (hlen % 2);
  const data = new Int16Array(buffer.slice(start));
  const lib = { m: {}, f: {} };
  for (const c of header.clips) {
    const tracks = [];
    const allTimes = new Float32Array(c.frames);
    for (let i = 0; i < c.frames; i++) allTimes[i] = i / c.fps;
    for (const [ni, q, constant, o] of c.tracks) {
      const n = q ? 4 : 3;
      const count = constant ? 1 : c.frames;
      const values = new Float32Array(count * n);
      const k = q ? 1 / 32767 : 1 / 10;
      for (let i = 0; i < values.length; i++) values[i] = data[o + i] * k;
      const times = constant ? new Float32Array([0]) : allTimes;
      const name = header.names[ni];
      tracks.push(q ? new THREE.QuaternionKeyframeTrack(name, times, values) : new THREE.VectorKeyframeTrack(name, times, values));
    }
    lib[c.g][c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
  }
  return lib;
}

// ---------------------------------------------------------------------------
// Avatar templates
// ---------------------------------------------------------------------------
// The converted avatars split each body into 3-15 primitives but only use 2-4
// materials. Every primitive is its own draw call (twice with shadows), so merge
// the pieces that share a material and a skeleton. Quantized attributes are
// expanded to plain arrays first so they can be concatenated.
const GET = ['getX', 'getY', 'getZ', 'getW'];
function plainGeometry(g, names) {
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const a = g.getAttribute(n), size = a.itemSize, count = a.count;
    const arr = n === 'skinIndex' ? new Uint16Array(count * size) : new Float32Array(count * size);
    for (let c = 0; c < size; c++) { const get = GET[c]; for (let i = 0; i < count; i++) arr[i * size + c] = a[get](i); }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  const idx = g.index ? g.index.array : Uint32Array.from({ length: g.getAttribute('position').count }, (_, i) => i);
  out.setIndex(new THREE.BufferAttribute(Uint32Array.from(idx), 1));
  return out;
}
function mergeByMaterial(root) {
  const groups = new Map();
  root.traverse(o => {
    if (!o.isSkinnedMesh || Array.isArray(o.material)) return;
    const k = o.parent.uuid + '|' + o.material.uuid + '|' + o.skeleton.uuid;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const names = Object.keys(list[0].geometry.attributes).filter(n => list.every(m => m.geometry.getAttribute(n)));
    const merged = mergeGeometries(list.map(m => plainGeometry(m.geometry, names)), false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    list[0].geometry = merged;
    list.slice(1).forEach(m => m.removeFromParent());
  }
}

export function prepareAvatar(scene) {
  mergeByMaterial(scene);
  scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const m = o.material;
      if (m.map) { m.map.anisotropy = 4; }
      m.envMapIntensity = 0.9;
      if (/head/i.test(m.name)) { m.roughness = 0.5; }
      if (/opacity/i.test(m.name)) { m.alphaTest = 0.45; m.side = THREE.DoubleSide; m.transparent = false; }
    }
  });
  return scene;
}

// ---------------------------------------------------------------------------
// Appearance variation: hue / saturation / brightness shifts on the clothes
// texture (skin tones are left alone) and on the hair, done in the shader so
// one texture serves many looks. Materials are cached per look.
// ---------------------------------------------------------------------------
const TINT_GLSL = `
vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)), d/(q.x+e), q.x); }
vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
`;
function makeTinted(mat, look, kind) {
  const m = mat.clone();
  const u = { uTint: { value: new THREE.Vector4(look[0], look[1], look[2], kind === 'hair' ? look[3] : 0) }, uGuard: { value: kind === 'body' ? 1 : 0 } };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = 'uniform vec4 uTint; uniform float uGuard;\n' + TINT_GLSL + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 hsv = rgb2hsv(diffuseColor.rgb);
        float hh = hsv.x > 0.9 ? hsv.x - 1.0 : hsv.x;
        float skin = uGuard * smoothstep(-0.07, -0.02, hh) * (1.0 - smoothstep(0.09, 0.14, hh)) * smoothstep(0.1, 0.2, hsv.y) * (1.0 - smoothstep(0.8, 0.95, hsv.y));
        vec3 t = hsv2rgb(vec3(fract(hsv.x + uTint.x), clamp(hsv.y * uTint.y, 0.0, 1.0), hsv.z * uTint.z));
        float g = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        t = mix(t, vec3(g * 1.7 + 0.05), uTint.w);
        diffuseColor.rgb = mix(t, diffuseColor.rgb, skin); }`);
  };
  m.customProgramCacheKey = () => 'tint-' + kind;
  m.userData.tint = u;
  return m;
}
// look: { body: [hue, sat, val] | null, hair: [hue, sat, val, grey] | null }
function variantMaterials(template, look) {
  const cache = template.userData.variants || (template.userData.variants = new Map());
  const key = (look.body ? look.body.join(',') : '-') + '|' + (look.hair ? look.hair.join(',') : '-');
  let map = cache.get(key);
  if (map) return map;
  map = new Map();
  template.traverse(o => {
    if (!o.isMesh || map.has(o.material)) return;
    const n = o.material.name;
    if (/opacity|hair/i.test(n) && look.hair) map.set(o.material, makeTinted(o.material, look.hair, 'hair'));
    else if (/body/i.test(n) && look.body) map.set(o.material, makeTinted(o.material, look.body, 'body'));
  });
  cache.set(key, map);
  return map;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
// scratch space used only inside pointBone / rotBone (callers build their arguments in _q1.._q4)
const _p1 = new THREE.Quaternion(), _p2 = new THREE.Quaternion(), _p3 = new THREE.Quaternion(), _p4 = new THREE.Quaternion();
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pc = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const clamp = THREE.MathUtils.clamp;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

const LOOPED = /^(idle|walk|run|sit_|gestic_talk|gestic_listen_neutral|gestic_listen_sad|drink|cell_phone|cheer|claphands)/;

// Keyframed arm gestures for the dealers. Directions are in the character's own
// space (+Z forward, +Y up, -X the character's right) for the RIGHT arm; the left
// arm mirrors them when 'both' is set. 'a' is how much of the target yaw is applied.
const DEALER_MOVES = {
  deal:    { dur: 1.15, keys: [
    { t: 0,    u: [-.2, -.9, .2],   f: [.2, -.5, .8],  a: 0 },
    { t: .2,   u: [-.3, -.6, .6],   f: [.3, -.35, .9], a: .2 },
    { t: .45,  u: [-.35, -.45, .8], f: [.1, -.25, .96], a: 1 },
    { t: .6,   u: [-.35, -.45, .8], f: [.1, -.15, .98], a: 1, roll: .6 },
    { t: .95,  u: [-.2, -.8, .4],   f: [.3, -.4, .85],  a: .2 },
    { t: 1.15, u: [-.1, -1, .1],    f: [.1, -.9, .3],   a: 0 }] },
  flip:    { dur: 1.0, keys: [
    { t: 0,    u: [-.2, -.9, .2],   f: [.2, -.5, .8],  a: 0 },
    { t: .3,   u: [-.3, -.55, .75], f: [.05, -.3, .95], a: 1 },
    { t: .5,   u: [-.3, -.55, .75], f: [.05, -.3, .95], a: 1, roll: 2.4 },
    { t: .75,  u: [-.3, -.6, .7],   f: [.05, -.3, .95], a: 1, roll: 2.4 },
    { t: 1.0,  u: [-.1, -1, .1],    f: [.1, -.9, .3],   a: 0 }] },
  collect: { dur: 1.3, both: true, keys: [
    { t: 0,    u: [-.2, -.9, .2],   f: [.2, -.5, .8],  a: 0 },
    { t: .3,   u: [-.35, -.35, .85], f: [.05, -.15, .98], a: .6 },
    { t: .7,   u: [-.3, -.6, .7],   f: [.3, -.3, .9],   a: .3 },
    { t: 1.0,  u: [-.25, -.8, .5],  f: [.5, -.45, .75], a: 0 },
    { t: 1.3,  u: [-.1, -1, .1],    f: [.1, -.9, .3],   a: 0 }] },
  payout:  { dur: 1.3, both: true, keys: [
    { t: 0,    u: [-.2, -.9, .2],   f: [.2, -.5, .8],  a: 0 },
    { t: .25,  u: [-.3, -.6, .6],   f: [.4, -.3, .85],  a: 0 },
    { t: .6,   u: [-.35, -.4, .85], f: [.1, -.15, .98], a: .5 },
    { t: 1.0,  u: [-.25, -.7, .6],  f: [.3, -.4, .85],  a: 0 },
    { t: 1.3,  u: [-.1, -1, .1],    f: [.1, -.9, .3],   a: 0 }] },
  shuffle: { dur: 1.8, both: true, keys: [
    { t: 0,    u: [-.15, -.9, .3],  f: [.55, -.4, .75], a: 0 },
    { t: .3,   u: [-.2, -.75, .5],  f: [.6, -.3, .75],  a: 0 },
    { t: .6,   u: [-.15, -.9, .3],  f: [.5, -.45, .75], a: 0 },
    { t: .9,   u: [-.2, -.75, .5],  f: [.6, -.3, .75],  a: 0 },
    { t: 1.2,  u: [-.15, -.9, .3],  f: [.5, -.45, .75], a: 0 },
    { t: 1.8,  u: [-.1, -1, .1],    f: [.1, -.9, .3],   a: 0 }] },
  spin:    { dur: 1.4, keys: [
    { t: 0,    u: [-.2, -.9, .2],   f: [.2, -.5, .8],  a: 0 },
    { t: .35,  u: [-.35, .1, .9],   f: [.2, .2, .95],   a: 1 },
    { t: .6,   u: [-.35, -.2, .9],  f: [.1, -.5, .85],  a: 1, roll: 1.0 },
    { t: .9,   u: [-.3, -.6, .7],   f: [.2, -.4, .85],  a: .3 },
    { t: 1.4,  u: [-.1, -1, .1],    f: [.1, -.9, .3],   a: 0 }] },
  throw:   { dur: 1.2, keys: [
    { t: 0,    u: [-.2, -.9, .2],   f: [.2, -.5, .8],  a: 0 },
    { t: .3,   u: [-.4, -.1, -.5],  f: [.1, .3, -.9],   a: 0 },
    { t: .55,  u: [-.3, .1, .9],    f: [.1, .2, .97],   a: 1 },
    { t: .9,   u: [-.3, -.6, .7],   f: [.2, -.4, .85],  a: .3 },
    { t: 1.2,  u: [-.1, -1, .1],    f: [.1, -.9, .3],   a: 0 }] },
  wave:    { dur: 1.6, keys: [
    { t: 0,    u: [-.2, -.9, .2],   f: [.2, -.5, .8],  a: 0 },
    { t: .3,   u: [-.85, .3, .3],   f: [-.4, .9, .1],   a: 0 },
    { t: .5,   u: [-.85, .3, .3],   f: [-.9, .6, .1],   a: 0 },
    { t: .7,   u: [-.85, .3, .3],   f: [-.4, .9, .1],   a: 0 },
    { t: .9,   u: [-.85, .3, .3],   f: [-.9, .6, .1],   a: 0 },
    { t: 1.6,  u: [-.1, -1, .1],    f: [.1, -.9, .3],   a: 0 }] },
};
export const DEALER_MOVE_NAMES = Object.keys(DEALER_MOVES);

const M_ = (v) => new THREE.Vector3(v[0], v[1], v[2]).normalize();
const _ku = new THREE.Vector3(), _kf = new THREE.Vector3(), _ku2 = new THREE.Vector3(), _kf2 = new THREE.Vector3();

export class Human {
  constructor(template, gender, lib, opts = {}) {
    this.gender = gender;
    this.lib = lib[gender];
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(template);
    this.model.scale.setScalar(0.01 * (opts.scale || 1));
    this.baseScale = 0.01 * (opts.scale || 1);
    this.root.add(this.model);
    if (opts.look) {
      const map = variantMaterials(template, opts.look);
      this.model.traverse(o => { if (o.isMesh && map.has(o.material)) o.material = map.get(o.material); });
    }
    this.bones = {};
    this.model.traverse(o => { if (o.isBone) this.bones[o.name.replace('Bip01_', '')] = o; });
    const b = this.bones;
    // rest state of the face bones (eyelids, jaw) that the procedural layer moves
    this.face = ['REyeBlinkTop', 'LEyeBlinkTop', 'REyeBlinkBottom', 'LEyeBlinkBottom'].filter(n => b[n]).map(n => [b[n], b[n].position.clone(), n]);
    this.jaw = b.MJaw ? { bone: b.MJaw, rest: b.MJaw.quaternion.clone() } : null;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.base = null;       // current looping action
    this.baseName = '';
    this.oneShot = null;
    this.pose = 'none';     // procedural overlay: none | aim | hands | down
    this.t = Math.random() * 100;
    this.ovw = {};          // overlay name -> current weight
    this.ovt = {};          // overlay name -> target weight
    this.lookTarget = null; // world-space point to look at (or null)
    this.lookW = 0;
    this.ly = 0; this.lp = 0;
    this.speaking = false;
    this.blinkT = 1 + Math.random() * 4; this.blinkP = -1;
    this.jawOpen = 0;
    this.leanTarget = 0; this.lean = 0;
    this.hit = null; this.recoil = 0;
    this.dealer = null;
    this.downT = 0; this.downDir = 1; this.downOn = false;
    this.crouchD = 0; this.crouchTarget = 0;
    this.danceStyle = Math.floor(Math.random() * 3);
    this.props = {};
    this.idleClip = opts.idle || 'idle_neutral_01';
    this.setBase(this.idleClip, 0);
    if (this.base) this.base.time = Math.random() * this.base.getClip().duration;
    this.addWeapon();
    if (opts.shades) this.addAccessory('shades');
    if (opts.glasses) this.addAccessory('glasses');
    if (opts.hat) this.addAccessory(opts.hat, opts.hatColor);
    if (opts.tray) this.setProp('tray', true);
  }

  action(name) {
    if (!this.lib[name]) return null;
    if (!this.actions[name]) {
      const a = this.mixer.clipAction(this.lib[name]);
      if (LOOPED.test(name) && !/^(walk|run)/.test(name) && this.lib[name].duration > 5) a.setLoop(THREE.LoopPingPong, Infinity);
      else if (!LOOPED.test(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[name] = a;
    }
    return this.actions[name];
  }

  setBase(name, fade = 0.3) {
    if (this.baseName === name) return;
    const next = this.action(name);
    if (!next) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (this.base && fade > 0) this.base.crossFadeTo(next, fade, false);
    else if (this.base) this.base.stop();
    this.base = next;
    this.baseName = name;
  }

  // Locomotion with the playback rate matched to how fast the body is moving,
  // so the feet stay planted: each clip is used only around the speed it was
  // captured at and its time scale is speed / captured speed.
  setMotion(speed, style = 'normal') {
    const S = CLIP_SPEED[this.gender];
    let clip;
    if (speed < 0.12) clip = this.idleClip;
    else if (style === 'drunk') clip = 'walk_drunk';
    else if (speed < 0.95 && style !== 'brisk') clip = 'walk_slow_01';
    else if (speed < 1.75) clip = 'walk_neutral_01';
    else if (speed < 4.6) clip = 'run_neutral_01';
    else clip = 'run_fast_01';
    this.setBase(clip, clip === this.idleClip || /^idle/.test(this.baseName) ? 0.3 : 0.22);
    if (this.base && S[clip]) this.base.timeScale = clamp(speed / S[clip], 0.45, 1.75);
    else if (this.base) this.base.timeScale = 1;
    this.moving = speed;
  }

  // Stepping on the spot while the body turns (no root motion, so a slow walk
  // at a rate matched to the turn speed)
  setTurn(rate) {
    const clip = 'walk_slow_01';
    this.setBase(clip, 0.2);
    if (this.base) this.base.timeScale = clamp(Math.abs(rate) / 2.4, 0.5, 1.2) * 0.9;
  }

  setIdle(name) {
    if (!this.lib[name]) return;
    this.idleClip = name;
    if (!/^(walk|run)/.test(this.baseName)) this.setBase(name, 0.4);
  }

  // Play a gesture once (nod, head shake, shrug…) and return to the base loop
  gesture(name, duration) {
    const a = this.action(name);
    if (!a || !this.base) return;
    if (this.oneShot) this.oneShot.fadeOut(0.2);
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.enabled = true;
    a.setEffectiveWeight(1); a.fadeIn(0.25); a.play();
    this.base.setEffectiveWeight(1);
    this.oneShot = a;
    this.oneShotEnd = Math.min(duration || a.getClip().duration, a.getClip().duration);
    this.oneShotT = 0;
  }

  // -------------------------------------------------------------------------
  // Props and accessories
  // -------------------------------------------------------------------------
  addWeapon() {
    const hand = this.bones.R_Hand;
    this.gun = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#1a1a1c', metalness: 0.85, roughness: 0.32 });
    const wood = new THREE.MeshStandardMaterial({ color: '#4a2e1a', roughness: 0.55 });
    const pistol = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(18, 3.2, 2.6), metal); slide.position.set(9, 3.5, 0);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(3.6, 10, 2.5), metal); grip.position.set(1, -1.5, 0); grip.rotation.z = -0.2;
    pistol.add(slide, grip);
    const shotgun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 62, 10), metal); barrel.rotation.z = Math.PI / 2; barrel.position.set(28, 3, 0);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(28, 6.5, 3.2), wood); stock.position.set(-14, -0.5, 0);
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 15, 10), wood); pump.rotation.z = Math.PI / 2; pump.position.set(26, 0.5, 0);
    shotgun.add(barrel, stock, pump);
    this.gun.add(pistol, shotgun);
    this.gun.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.gun.userData = { pistol, shotgun };
    // Biped hand: +X runs along the fingers
    this.gun.position.set(8, 1.5, 0);
    this.gun.rotation.set(0, 0, 0);
    this.gun.visible = false;
    hand.add(this.gun);
  }

  // Head-bone space: +X up, +Y forward, +Z the character's left (units: cm)
  addAccessory(kind, color) {
    const head = this.bones.Head;
    if (!head || this.props[kind]) return;
    const g = new THREE.Group();
    if (kind === 'shades' || kind === 'glasses') {
      const dark = kind === 'shades';
      const lens = new THREE.MeshStandardMaterial({ color: dark ? '#060606' : '#9ab', metalness: dark ? 0.6 : 0.2, roughness: dark ? 0.08 : 0.05, transparent: !dark, opacity: dark ? 1 : 0.28 });
      const frame = new THREE.MeshStandardMaterial({ color: dark ? '#050505' : '#2a2018', roughness: 0.4 });
      for (const s of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 5.2), lens); l.position.set(0, 0, s * 3.3); g.add(l);
        const r = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.5, 5.7), frame); r.position.set(0, -0.15, s * 3.3); g.add(r);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), frame); arm.position.set(0, -4.6, s * 6.2); g.add(arm);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1.6), frame); bridge.position.set(1, 0, 0); g.add(bridge);
      g.position.set(11.2, 9.3, 0);
    } else if (kind === 'cap' || kind === 'cowboy') {
      // built in a natural frame (+Y up, +Z forward, +X left) and turned into head-bone space
      const f = new THREE.Group();
      f.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(AZ, AX, AY));
      if (kind === 'cap') {
        const mat = new THREE.MeshStandardMaterial({ color: color || '#22314f', roughness: 0.75, side: THREE.DoubleSide });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(10.1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), mat);
        dome.scale.set(0.93, 1, 1.06); dome.position.set(0, 10.6, 0.6);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 9.2, 0.6, 18, 1, false, -Math.PI / 2, Math.PI), mat);
        brim.scale.set(0.95, 1, 1.05); brim.position.set(0, 14.7, 2.4); brim.rotation.x = -0.12;
        f.add(dome, brim);
      } else {
        const mat = new THREE.MeshStandardMaterial({ color: color || '#5a3d24', roughness: 0.8, side: THREE.DoubleSide });
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 8.5, 9.5, 18), mat); crown.position.set(0, 19.5, 0.4);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 15.5, 0.8, 24), mat); brim.position.set(0, 14.8, 0.6); brim.scale.set(0.9, 1, 1);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 1.6, 18), new THREE.MeshStandardMaterial({ color: '#1b1209', roughness: 0.6 })); band.position.set(0, 15.9, 0.4);
        f.add(crown, brim, band);
      }
      g.add(f);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    head.add(g);
    this.props[kind] = g;
  }

  // Held props: tray (waitress), phone, glass
  setProp(kind, on) {
    if (!on) { if (this.props[kind]) this.props[kind].visible = false; return; }
    if (!this.props[kind]) {
      const g = new THREE.Group();
      if (kind === 'tray') {
        const silver = new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.9, roughness: 0.25 });
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 0.9, 20), silver);
        g.add(disc);
        const glassM = new THREE.MeshStandardMaterial({ color: '#dfe8ee', transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1 });
        const drink = new THREE.MeshStandardMaterial({ color: '#d4551f', roughness: 0.3 });
        [[6, 4], [-4, 7], [-2, -7], [7, -5]].forEach(([x, z], i) => {
          const gl = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.1, 9, 10), glassM); gl.position.set(x, 4.9, z);
          const liq = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 1.95, 5.5, 10), i % 2 ? drink : new THREE.MeshStandardMaterial({ color: '#e8b830', roughness: 0.3 })); liq.position.set(x, 3.6, z);
          g.add(gl, liq);
        });
        this.props.trayHand = this.bones.L_Hand;
      } else if (kind === 'phone') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(14, 0.9, 6.8), new THREE.MeshStandardMaterial({ color: '#0d0d10', metalness: 0.4, roughness: 0.25 }));
        const screen = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.1, 5.8), new THREE.MeshBasicMaterial({ color: '#6fb6ff' })); screen.position.y = 0.52;
        g.add(body, screen);
        this.bones.R_Hand.add(g);
      } else if (kind === 'glass') {
        const glassM = new THREE.MeshStandardMaterial({ color: '#e6eef2', transparent: true, opacity: 0.6, roughness: 0.05 });
        const liq = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.2, 6.5, 10), new THREE.MeshStandardMaterial({ color: '#c8862b', roughness: 0.3 })); liq.position.y = -0.6;
        const gl = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 2.4, 11, 10), glassM);
        g.add(gl, liq);
        this.bones.R_Hand.add(g);
      }
      g.traverse(o => { if (o.isMesh) o.castShadow = kind !== 'phone'; });
      if (kind === 'tray') { this.model.add(g); }
      this.props[kind] = g;
    }
    this.props[kind].visible = true;
    // place in hand space (X along the fingers)
    if (kind === 'phone') { this.props.phone.position.set(9, 1.2, 1); this.props.phone.rotation.set(0, 0, 0); }
    if (kind === 'glass') { this.props.glass.position.set(10, 1.5, 0); this.props.glass.rotation.set(0, 0, Math.PI / 2); }
  }

  setWeapon(kind) {
    this.gun.visible = !!kind;
    if (kind) { this.gun.userData.pistol.visible = kind === 'pistol'; this.gun.userData.shotgun.visible = kind === 'shotgun'; }
  }

  // -------------------------------------------------------------------------
  // Procedural layer controls
  // -------------------------------------------------------------------------
  ov(name, on) { this.ovt[name] = on ? 1 : 0; if (this.ovw[name] === undefined) this.ovw[name] = 0; }
  ovOnly(...names) { for (const k of Object.keys(this.ovt)) this.ovt[k] = names.includes(k) ? 1 : 0; for (const n of names) if (this.ovw[n] === undefined) this.ovw[n] = 0; }

  // Dealer gesture; yaw = direction of the target relative to where the dealer faces (radians, + = left)
  dealerMove(kind, yaw = 0) {
    const m = DEALER_MOVES[kind];
    if (!m) return 0;
    this.dealer = { m, t: 0, yaw: clamp(yaw, -1.4, 1.4) };
    return m.dur;
  }

  // Short involuntary reaction. dir: unit vector (character space) the impulse pushes the body toward
  flinch(strength = 1, dirX = 0, dirZ = -1) {
    this.hit = { t: 0, s: strength, x: dirX, z: dirZ };
  }
  kick() { this.recoil = 1; }

  fall(on, dir = 1) {
    if (on && !this.downOn) { this.downOn = true; this.downDir = dir; this.downT = 0; this.limb = [Math.random(), Math.random(), Math.random(), Math.random()]; }
    else if (!on && this.downOn) { this.downOn = false; }
  }

  update(dt) {
    this.t += dt;
    if (this.oneShot) {
      this.oneShotT += dt;
      if (this.oneShotT > this.oneShotEnd - 0.25) { this.oneShot.fadeOut(0.25); this.oneShot = null; }
    }
    this.mixer.update(dt);
    // overlay weights ease toward their targets
    let any = false;
    for (const k in this.ovt) {
      const w = this.ovw[k], to = this.ovt[k];
      this.ovw[k] = w + clamp(to - w, -dt * 4.5, dt * 4.5);
      if (this.ovw[k] > 0.003) any = true;
    }
    const aimW = this.pose === 'aim' ? 1 : 0;
    this.aimW = (this.aimW || 0) + clamp(aimW - (this.aimW || 0), -dt * 8, dt * 8);
    this.handsW = (this.handsW || 0) + clamp((this.pose === 'hands' ? 1 : 0) - (this.handsW || 0), -dt * 5, dt * 5);
    this.leanW = (this.lean || 0) + clamp(this.leanTarget - (this.lean || 0), -dt * 3, dt * 3);
    this.lean = this.leanW;
    this.crouchD += clamp(this.crouchTarget - this.crouchD, -dt * 2.2, dt * 2.2);
    if (this.dealer) { this.dealer.t += dt; if (this.dealer.t > this.dealer.m.dur) this.dealer = null; }
    if (this.hit) { this.hit.t += dt; if (this.hit.t > 0.7) this.hit = null; }
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 7);
    if (this.downOn || this.downT > 0) this.downT = clamp(this.downT + (this.downOn ? dt : -dt * 1.2) / 0.85, 0, 1);
    this.applyPose(dt, any);
  }

  // -------------------------------------------------------------------------
  // Bone helpers. Each bone is turned so the direction toward its child points
  // where we want (in the character's space).
  // -------------------------------------------------------------------------
  pointBone(bone, child, dir, w = 1) {
    const axis = _pa.copy(child.position).normalize();
    const wq = bone.getWorldQuaternion(_p1);
    const cur = _pb.copy(axis).applyQuaternion(wq);
    const want = _pc.copy(dir).applyQuaternion(this.model.getWorldQuaternion(_p3)).normalize();
    const target = _p2.setFromUnitVectors(cur, want).multiply(wq);
    const local = bone.parent.getWorldQuaternion(_p3).invert().multiply(target);
    bone.quaternion.slerp(local, w);
    bone.updateMatrixWorld(true);
  }

  // rotate a bone by a rotation given in character space
  rotBone(bone, q, w = 1) {
    const mq = this.model.getWorldQuaternion(_p3);
    const wq = bone.getWorldQuaternion(_p1);
    const delta = _p2.copy(mq).multiply(q).multiply(_p4.copy(mq).invert());
    const target = delta.multiply(wq);
    const local = bone.parent.getWorldQuaternion(_p3).invert().multiply(target);
    bone.quaternion.slerp(local, w);
    bone.updateMatrixWorld(true);
  }

  arm(side, u, f, w, roll = 0) {
    const b = this.bones;
    if (w <= 0.003) return;
    if (side === 'L') { u = _ku2.set(-u.x, u.y, u.z); f = _kf2.set(-f.x, f.y, f.z); }
    this.pointBone(b[side + '_UpperArm'], b[side + '_Forearm'], u, w);
    this.pointBone(b[side + '_Forearm'], b[side + '_Hand'], f, w);
    if (roll) {
      _q1.setFromAxisAngle(_a.copy(b[side + '_Hand'].position).normalize(), roll * (side === 'R' ? 1 : -1) * w);
      b[side + '_Hand'].quaternion.multiply(_q1);
      b[side + '_Hand'].updateMatrixWorld(true);
    }
  }

  // Two-link leg solver: knee angles that lower the pelvis by `d` metres with the ankles under the hips
  legAngles(d) {
    const b = this.bones;
    const Lt = b.R_Calf.position.length(), Lc = b.R_Foot.position.length();
    const V = (Lt + Lc) - d * 100 / (this.baseScale / 0.01);
    let lo = 0, hi = 1.45;
    for (let i = 0; i < 18; i++) {
      const a = (lo + hi) / 2, bb = Math.asin(Math.min(1, Lt / Lc * Math.sin(a)));
      if (Lt * Math.cos(a) + Lc * Math.cos(bb) > V) lo = a; else hi = a;
    }
    const a = (lo + hi) / 2;
    return [a, Math.asin(Math.min(1, Lt / Lc * Math.sin(a)))];
  }

  bendLegs(a, bb, w = 1) {
    const b = this.bones;
    for (const s of ['R', 'L']) {
      const k = s === 'R' ? -1 : 1;
      const foot = b[s + '_Foot'];
      const fq = foot.getWorldQuaternion(_q4).clone();
      this.pointBone(b[s + '_Thigh'], b[s + '_Calf'], _d.set(k * 0.16 * Math.sin(a), -Math.cos(a), Math.sin(a)).normalize(), w);
      this.pointBone(b[s + '_Calf'], b[s + '_Foot'], _e.set(k * 0.05, -Math.cos(bb), -Math.sin(bb)).normalize(), w);
      // keep the feet flat on the floor
      foot.quaternion.copy(foot.parent.getWorldQuaternion(_q3).invert().multiply(fq));
      foot.updateMatrixWorld(true);
    }
  }

  // Lower the pelvis by d metres with the feet planted
  crouch(d) {
    const [a, bb] = this.legAngles(d);
    this.model.position.y = -d;
    this.root.updateMatrixWorld(true);
    this.bendLegs(a, bb);
  }

  applyLook(dt) {
    const b = this.bones;
    if (!b.Head || !b.Neck) return;
    let ty = 0, tp = 0;
    const want = this.lookTarget && this.lookW > 0.01;
    if (want) {
      const head = b.Head.getWorldPosition(_a);
      const d = _b.copy(this.lookTarget).sub(head);
      d.applyQuaternion(_q1.copy(this.model.getWorldQuaternion(_q2)).invert());
      ty = clamp(Math.atan2(d.x, d.z), -1.15, 1.15) * this.lookW;
      tp = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.5, 0.55) * this.lookW;
      if (Math.abs(Math.atan2(d.x, d.z)) > 2.2) { ty = 0; tp = 0; } // behind us: don't wring the neck
    }
    const k = Math.min(1, dt * 7);
    this.ly += (ty - this.ly) * k; this.lp += (tp - this.lp) * k;
    if (Math.abs(this.ly) < 0.004 && Math.abs(this.lp) < 0.004) return;
    const parts = [[b.Spine2, 0.14, 0.05], [b.Neck, 0.36, 0.4], [b.Head, 0.5, 0.55]];
    for (const [bone, ky, kp] of parts) {
      _q2.setFromAxisAngle(AY, this.ly * ky);
      _q3.setFromAxisAngle(AX, -this.lp * kp);
      this.rotBone(bone, _q2.multiply(_q3), 1);
    }
  }

  applyFace(dt) {
    // blinking: the eyelid bones slide down/up over the eyes
    this.blinkT -= dt;
    if (this.blinkP < 0 && this.blinkT <= 0) { this.blinkP = 0; this.blinkT = 2 + Math.random() * 4.5; if (Math.random() < 0.15) this.blinkT = 0.25; }
    let lid = 0;
    if (this.blinkP >= 0) { this.blinkP += dt / 0.16; lid = Math.sin(Math.min(1, this.blinkP) * Math.PI); if (this.blinkP >= 1) this.blinkP = -1; }
    if (this.hit) lid = Math.max(lid, 0.9);
    for (const [bone, rest, n] of this.face) {
      bone.position.copy(rest);
      bone.position.x += (/Top/.test(n) ? -1 : 0.6) * 1.15 * lid;
    }
    if (this.jaw) {
      const target = this.speaking ? 0.06 + 0.22 * Math.abs(Math.sin(this.t * 11) * Math.sin(this.t * 4.3 + 1)) : 0;
      this.jawOpen += (target - this.jawOpen) * Math.min(1, dt * 18);
      this.jaw.bone.quaternion.copy(this.jaw.rest).multiply(_q1.setFromAxisAngle(AZ, this.jawOpen));
    }
  }

  applyPose(dt, anyOv) {
    const b = this.bones;
    const t = this.t;
    const ow = this.ovw;
    const near = this.detail !== false;
    // the fall replaces everything else
    if (this.downT > 0) { this.applyFall(); return; }
    if (this.model.rotation.x !== 0 || this.model.position.y !== 0 || this.model.position.z !== 0) { this.model.rotation.x = 0; this.model.position.set(0, 0, 0); }
    if (near) this.model.updateMatrixWorld(true);
    if (!near) return;
    if (this.crouchD > 0.005) this.crouch(this.crouchD);
    // torso: forward lean (sprint), breathing, dance sway, cower hunch, slump, hit
    {
      let pitch = this.lean * 0.16 + (ow.cower || 0) * 0.5 + (ow.slump || 0) * 0.32 + (ow.text || 0) * 0.12;
      let yaw = 0, roll = 0;
      if (ow.dance > 0.01) { yaw += Math.sin(t * 6.2 + this.danceStyle) * 0.22 * ow.dance; roll += Math.sin(t * 3.1) * 0.08 * ow.dance; pitch += Math.sin(t * 6.2) * 0.05 * ow.dance; }
      if (this.recoil > 0) pitch -= 0.06 * this.recoil;
      if (this.hit) { const h = this.hit, e = Math.exp(-h.t * 5) * Math.sin(Math.min(1, h.t / 0.09) * Math.PI / 2); pitch += -h.z * 0.28 * h.s * e; roll += h.x * 0.14 * h.s * e; yaw += h.x * 0.1 * h.s * e; }
      pitch += Math.sin(t * 1.7) * 0.006; // breathing
      if (Math.abs(pitch) + Math.abs(yaw) + Math.abs(roll) > 0.004) {
        _q2.setFromAxisAngle(AX, pitch); _q3.setFromAxisAngle(AY, yaw); _q2.multiply(_q3); _q3.setFromAxisAngle(AZ, roll); _q2.multiply(_q3);
        this.rotBone(b.Spine, _q1.copy(_q2).slerp(_q4.identity(), 0.5), 1);
        this.rotBone(b.Spine1, _q1.copy(_q2).slerp(_q4.identity(), 0.5), 1);
      }
    }
    this.applyLook(dt);
    // head-only reactions
    if (ow.slump > 0.01 || ow.cower > 0.01 || ow.text > 0.01) {
      this.rotBone(b.Head, _q2.setFromAxisAngle(AX, (ow.slump || 0) * 0.35 + (ow.cower || 0) * 0.4 + (ow.text || 0) * 0.3), 1);
    }
    if (this.hit) {
      const h = this.hit, e = Math.exp(-h.t * 6) * Math.sin(Math.min(1, h.t / 0.07) * Math.PI / 2);
      this.rotBone(b.Head, _q2.setFromAxisAngle(AX, -h.z * 0.35 * h.s * e), 1);
    }
    // ---- arms: lowest priority first, later ones blend over the earlier ones ----
    if (ow.dance > 0.01) this.danceArms(ow.dance, t);
    if (ow.radio > 0.01) this.arm('R', M_([-.25, -.35, .55]), M_([.85, .6, .1]), ow.radio);
    if (ow.text > 0.01) { const u = M_([-.1, -.8, .35]), f = M_([.45, .5, .75]); this.arm('R', u, f, ow.text); this.arm('L', u, f, ow.text); }
    if (ow.cheer > 0.01) {
      const p = Math.sin(t * 9) * 0.25;
      this.arm('R', _ku.set(-.35 - p * .3, .95, .15), _kf.set(-.15, 1, .1 + p * .2), ow.cheer);
      this.arm('L', _ku.set(-.35 + p * .3, .95, .15), _kf.set(-.15, 1, .1 - p * .2), ow.cheer);
    }
    if (ow.sitcheer > 0.01) {
      const p = Math.sin(t * 8) * 0.3;
      this.arm('R', _ku.set(-.45, .55, .6), _kf.set(-.1 + p * .3, 1, .2), ow.sitcheer);
      this.arm('L', _ku.set(-.45, .55, .6), _kf.set(-.1 - p * .3, 1, .2), ow.sitcheer);
    }
    if (ow.slump > 0.01) { this.arm('R', _ku.set(-.2, -.6, .7), _kf.set(.2, .85, .55), ow.slump * 0.9); }
    if (ow.sip > 0.01) {
      const k = 0.5 + 0.5 * Math.sin(t * 1.4);
      this.arm('R', _ku.set(-.12, -.5 - k * .1, .8), _kf.set(.1, .7 + k * .25, .65 - k * .2), ow.sip);
    }
    if (ow.tray > 0.01) { this.arm('L', _ku.set(-.15, -.8, .35), _kf.set(.35, .05, .93), ow.tray); }
    if (ow.cower > 0.01) { this.arm('R', _ku.set(-.35, .1, .9), _kf.set(.85, .4, .1), ow.cower); this.arm('L', _ku.set(-.35, .1, .9), _kf.set(.85, .4, .1), ow.cower); }
    if (this.dealer) this.dealerArms();
    if (this.hit && this.hit.t < 0.4) {
      const h = this.hit, e = Math.exp(-h.t * 7) * Math.sin(Math.min(1, h.t / 0.06) * Math.PI / 2) * h.s;
      this.arm('R', _ku.set(-.75, -.3, .5), _kf.set(-.5, .1, .8), e * 0.7);
      this.arm('L', _ku.set(-.75, -.3, .5), _kf.set(-.5, .1, .8), e * 0.7);
    }
    if (this.aimW > 0.01) {
      const w = this.aimW;
      const pitch = (this.aimPitch || 0) + this.recoil * 0.1;
      const fwd = _d.set(-0.06, Math.sin(pitch), Math.cos(pitch));
      this.pointBone(b.R_UpperArm, b.R_Forearm, fwd, w);
      this.pointBone(b.R_Forearm, b.R_Hand, fwd, w);
      this.pointBone(b.L_UpperArm, b.L_Forearm, _e.set(-0.2, -0.25 + Math.sin(pitch), 0.95), w);
      this.pointBone(b.L_Forearm, b.L_Hand, _e.set(-0.85, Math.sin(pitch) * 0.6, 0.5), w);
    }
    if (this.handsW > 0.01) {
      const w = this.handsW;
      this.pointBone(b.R_UpperArm, b.R_Forearm, _d.set(-0.8, 0.55, 0.1), w);
      this.pointBone(b.R_Forearm, b.R_Hand, _d.set(-0.05, 1, 0.1), w);
      this.pointBone(b.L_UpperArm, b.L_Forearm, _d.set(0.8, 0.55, 0.1), w);
      this.pointBone(b.L_Forearm, b.L_Hand, _d.set(0.05, 1, 0.1), w);
    }
    // tray stays level whatever the hand does
    if (this.props.tray && this.props.tray.visible) {
      const tr = this.props.tray, hand = b.L_Hand;
      tr.position.set(0, 0, 0);
      hand.updateWorldMatrix(true, false);
      // hand-local position ~11 cm along the fingers, then flatten
      const wp = _a.set(11, 0.5, 0).applyMatrix4(hand.matrixWorld);
      this.model.worldToLocal(wp);
      tr.position.copy(wp); tr.position.y += 3;
      tr.quaternion.copy(_q1.copy(this.model.getWorldQuaternion(_q2)).invert());
    }
    this.applyFace(dt);
  }

  danceArms(w, t) {
    const s = this.danceStyle, p = Math.sin(t * 6.2 + s), q = Math.sin(t * 6.2 + s + Math.PI);
    if (s === 0) { // hands up, pumping
      this.arm('R', _ku.set(-.55, .7 + p * .25, .3), _kf.set(-.2, 1, .2), w);
      this.arm('L', _ku.set(-.55, .7 + q * .25, .3), _kf.set(-.2, 1, .2), w);
    } else if (s === 1) { // sway with one arm high
      this.arm('R', _ku.set(-.7, .9, .1), _kf.set(-.5 + p * .5, .8, .1), w);
      this.arm('L', _ku.set(-.2, -.4 + q * .2, .6), _kf.set(.3, -.2 + q * .3, .9), w);
    } else { // disco point
      this.arm('R', _ku.set(-.5, .3 + p * .5, .7), _kf.set(-.3, .5 + p * .5, .8), w);
      this.arm('L', _ku.set(-.3, -.3 + q * .3, .5), _kf.set(.2, -.3, .9), w);
    }
  }

  dealerArms() {
    const d = this.dealer, m = d.m, keys = m.keys;
    let i = 0; while (i < keys.length - 2 && d.t > keys[i + 1].t) i++;
    const k0 = keys[i], k1 = keys[i + 1];
    const s = smooth((d.t - k0.t) / (k1.t - k0.t));
    const lerpDir = (a, b, out) => out.set(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s).normalize();
    const u = lerpDir(k0.u, k1.u, _ku), f = lerpDir(k0.f, k1.f, _kf);
    const a = (k0.a || 0) + ((k1.a || 0) - (k0.a || 0)) * s;
    const roll = (k0.roll || 0) + ((k1.roll || 0) - (k0.roll || 0)) * s;
    _q2.setFromAxisAngle(AY, d.yaw * a);
    u.applyQuaternion(_q2); f.applyQuaternion(_q2);
    const w = Math.min(1, d.t / 0.14, (m.dur - d.t) / 0.25);
    this.arm('R', u, f, w, roll);
    if (m.both) this.arm('L', u, f, w, 0);
  }

  // Ragdoll-lite: knees buckle, the pelvis drops, the body topples and the limbs splay
  applyFall() {
    const b = this.bones, u = this.downT, dir = this.downDir; // dir +1 backwards, -1 forwards
    const m = this.model, sc = this.baseScale / 0.01;
    const bounce = u > 0.78 ? Math.sin((u - 0.78) * 4.5 * Math.PI) * 0.05 * (1 - u) * 4.5 : 0;
    const phi = -dir * (Math.pow(u, 1.5) * (Math.PI / 2 - 0.03) + bounce);
    const H = 0.92 * sc;
    const ty = 0.14 + (H - 0.14) * (1 - smooth(Math.min(1, u * 1.2)));
    const tz = -dir * 0.3 * smooth(u);
    m.rotation.x = phi;
    m.position.set(0, ty - H * Math.cos(phi), tz - H * Math.sin(phi));
    this.root.updateMatrixWorld(true);
    const L = this.limb || [0.5, 0.5, 0.5, 0.5];
    // knees buckle first, then the legs sprawl
    const buckle = Math.sin(Math.min(1, u * 1.8) * Math.PI) * 0.5 + 0.1 * smooth(u);
    const [a, bb] = this.legAngles(buckle * 0.75);
    this.bendLegs(a, bb, 1 - smooth((u - 0.55) * 2.2));
    const w = smooth(u * 1.5);
    const splay = smooth((u - 0.5) * 2);
    this.pointBone(b.R_UpperArm, b.R_Forearm, _d.set(-0.9 - L[0] * .2, -0.2 + L[1] * .5, 0.1 + L[2] * .3).normalize(), w);
    this.pointBone(b.R_Forearm, b.R_Hand, _d.set(-0.8, -0.1 + L[2] * .4, 0.3).normalize(), w);
    this.pointBone(b.L_UpperArm, b.L_Forearm, _d.set(0.6 + L[3] * .3, 0.55 - L[1] * .3, 0.5).normalize(), w);
    this.pointBone(b.L_Forearm, b.L_Hand, _d.set(0.3, 0.6, 0.2 + L[0] * .5).normalize(), w);
    this.pointBone(b.R_Thigh, b.R_Calf, _d.set(-0.32 - L[1] * .2, -1, 0.05).normalize(), splay);
    this.pointBone(b.L_Thigh, b.L_Calf, _d.set(0.2 + L[2] * .2, -1, -0.05 + L[3] * .3).normalize(), splay);
    this.pointBone(b.R_Calf, b.R_Foot, _d.set(-0.2, -1, -0.2 * L[0]).normalize(), splay);
    this.pointBone(b.L_Calf, b.L_Foot, _d.set(0.1, -1, 0.15 * L[1]).normalize(), splay);
    this.rotBone(b.Head, _q2.setFromAxisAngle(AZ, (L[0] - 0.5) * 0.6).multiply(_q3.setFromAxisAngle(AX, dir > 0 ? -0.2 : 0.3)), w);
    this.applyFace(0.016);
  }
}
