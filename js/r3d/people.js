// Realistic people: Microsoft Rocketbox avatars (MIT licence) driven by the
// Rocketbox motion-capture library (walks, runs, sitting at a table, talking,
// nodding, cheering, drinking…). Assets are converted to compact GLB/binary
// files by tools in /tools.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Root speeds measured from the original (root-motion) clips, in m/s
const CLIP_SPEED = {
  m: { walk_neutral_01: 1.01, walk_slow_01: 0.82, walk_drunk: 0.82, run_neutral_01: 2.88, run_fast_01: 5.84 },
  f: { walk_neutral_01: 1.21, walk_slow_01: 0.89, walk_drunk: 0.9, run_neutral_01: 2.77, run_fast_01: 5.38 },
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

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

const LOOPED = /^(idle|walk|run|sit_|gestic_talk|gestic_listen_neutral|gestic_listen_sad|drink|cell_phone|cheer|claphands)/;

export class Human {
  constructor(template, gender, lib, opts = {}) {
    this.gender = gender;
    this.lib = lib[gender];
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(template);
    this.model.scale.setScalar(0.01 * (opts.scale || 1));
    this.root.add(this.model);
    this.bones = {};
    this.model.traverse(o => { if (o.isBone) this.bones[o.name.replace('Bip01_', '')] = o; });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.base = null;       // current looping action
    this.baseName = '';
    this.oneShot = null;
    this.pose = 'none';     // procedural overlay: none | aim | hands | down
    this.idleClip = opts.idle || 'idle_neutral_01';
    this.setBase(this.idleClip, 0);
    if (this.base) this.base.time = Math.random() * this.base.getClip().duration;
    this.addWeapon();
    if (opts.shades) this.addShades();
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

  // Locomotion with the playback rate matched to how fast the body is moving
  setMotion(speed, style = 'normal') {
    const S = CLIP_SPEED[this.gender];
    let clip;
    if (speed < 0.15) clip = this.idleClip;
    else if (style === 'drunk') clip = 'walk_drunk';
    else if (speed < 1.8) clip = 'walk_neutral_01';
    else if (speed < 4.2) clip = 'run_neutral_01';
    else clip = 'run_fast_01';
    this.setBase(clip, 0.25);
    if (this.base && S[clip]) this.base.timeScale = THREE.MathUtils.clamp(speed / S[clip], 0.6, 1.6);
    else if (this.base) this.base.timeScale = 1;
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

  addShades() {
    const head = this.bones.Head;
    const g = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 14), new THREE.MeshStandardMaterial({ color: '#050505', metalness: 0.6, roughness: 0.08 }));
    g.position.set(8.5, 9.2, 0);
    head.add(g);
  }

  setWeapon(kind) {
    this.gun.visible = !!kind;
    if (kind) { this.gun.userData.pistol.visible = kind === 'pistol'; this.gun.userData.shotgun.visible = kind === 'shotgun'; }
  }

  update(dt) {
    if (this.oneShot) {
      this.oneShotT += dt;
      if (this.oneShotT > this.oneShotEnd - 0.25) { this.oneShot.fadeOut(0.25); this.oneShot = null; }
    }
    this.mixer.update(dt);
    this.applyPose();
  }

  // Procedural poses layered over the motion capture. Each bone is turned so the
  // direction toward its child points where we want (in the character's space).
  pointBone(bone, child, dir, w = 1) {
    const axis = _a.copy(child.position).normalize();
    const wq = bone.getWorldQuaternion(_q1);
    const cur = _b.copy(axis).applyQuaternion(wq);
    const want = _c.copy(dir).applyQuaternion(this.root.getWorldQuaternion(_q3)).normalize();
    const target = _q2.setFromUnitVectors(cur, want).multiply(wq);
    const local = bone.parent.getWorldQuaternion(_q3).invert().multiply(target);
    bone.quaternion.slerp(local, w);
    bone.updateMatrixWorld(true);
  }

  applyPose() {
    const b = this.bones;
    if (this.pose === 'aim' || this.pose === 'hands') {
      this.root.updateMatrixWorld(true);
      if (this.pose === 'aim') {
        const pitch = this.aimPitch || 0;
        const fwd = _d.set(-0.06, Math.sin(pitch), Math.cos(pitch));
        this.pointBone(b.R_UpperArm, b.R_Forearm, fwd);
        this.pointBone(b.R_Forearm, b.R_Hand, fwd);
        this.pointBone(b.L_UpperArm, b.L_Forearm, _e.set(-0.2, -0.25 + Math.sin(pitch), 0.95));
        this.pointBone(b.L_Forearm, b.L_Hand, _e.set(-0.85, Math.sin(pitch) * 0.6, 0.5));
      } else {
        this.pointBone(b.R_UpperArm, b.R_Forearm, _d.set(-0.8, 0.55, 0.1));
        this.pointBone(b.R_Forearm, b.R_Hand, _d.set(-0.05, 1, 0.1));
        this.pointBone(b.L_UpperArm, b.L_Forearm, _d.set(0.8, 0.55, 0.1));
        this.pointBone(b.L_Forearm, b.L_Hand, _d.set(0.05, 1, 0.1));
      }
    }
    if (this.pose === 'down') {
      this.model.rotation.x = -Math.PI / 2;
      this.model.position.y = 0.18;
      this.model.position.z = -0.9;
    } else if (this.model.rotation.x !== 0) {
      this.model.rotation.x = 0; this.model.position.set(0, 0, 0);
    }
  }
}
