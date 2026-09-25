// Maps game entities (player, NPCs) to animated Rocketbox people.
import * as THREE from 'three';
import { Human, prepareAvatar } from './people.js';
import { W } from './build.js';

const AVATARS = {
  player: [['Business_Male_01', 'm']],
  dealer: [['Business_Male_06', 'm'], ['Business_Female_03', 'f']],
  bartender: [['Business_Male_06', 'm']],
  waitress: [['Female_Party_02', 'f'], ['Female_Party_01', 'f']],
  guard: [['Security_Male_01', 'm']],
  vendor: [['Chef_Female_01', 'f']],
  clerk: [['Business_Female_03', 'f'], ['Business_Male_02', 'm']],
  cashierClerk: [['Business_Female_03', 'f']],
  gambler: [['Business_Male_02', 'm'], ['Business_Male_05', 'm'], ['Male_Adult_06', 'm'], ['Male_Adult_13', 'm'], ['Female_Party_01', 'f'],
    ['Female_Adult_01', 'f'], ['Female_Adult_03', 'f'], ['Business_Female_02', 'f'], ['Male_Adult_04', 'm'], ['Business_Male_03', 'm']],
  pedestrian: [['Male_Adult_06', 'm'], ['Male_Adult_13', 'm'], ['Female_Adult_01', 'f'], ['Female_Adult_03', 'f'], ['Business_Female_02', 'f']],
  homeless: [['Male_Adult_04', 'm']],
  robber: [['Male_Adult_18', 'm']],
  thug: [['Business_Male_03', 'm'], ['Business_Male_05', 'm']],
  police: [['Police_Male_01', 'm']],
};
export const AVATAR_FILES = [...new Set(Object.values(AVATARS).flat().map(a => a[0]))];

const SIT_IDLES = { m: ['sit_table_idle_neutral_01', 'sit_table_idle_nervous_01', 'sit_table_gestic_thoughtful', 'sit_table_breathe_01'], f: ['sit_table_idle_neutral_01', 'sit_table_gestic_thoughtful', 'sit_table_breathe_01'] };
const STAND_IDLES = ['idle_neutral_01', 'idle_neutral_02', 'idle_look_around_01', 'idle_waiting_01'];
const _pv = new THREE.Matrix4(), _frustum = new THREE.Frustum(), _sphere = new THREE.Sphere(new THREE.Vector3(), 1.6);

export class Crowd {
  constructor(scene, templates, lib) {
    this.scene = scene;
    this.templates = templates;
    this.lib = lib;
    this.rigs = new Map();
    this.hash = 0;
  }

  pickAvatar(e) {
    const list = AVATARS[e === player ? 'player' : e.role] || AVATARS.gambler;
    if (e.avatar) return e.avatar;
    const h = (e.name ? [...e.name].reduce((a, c) => a + c.charCodeAt(0), 0) : 0) + Math.floor(Math.random() * 1000);
    e.avatar = list[h % list.length];
    return e.avatar;
  }

  rigFor(e) {
    let r = this.rigs.get(e);
    if (r) return r;
    const [file, g] = this.pickAvatar(e);
    const tpl = this.templates[file];
    if (!tpl) return null;
    const isPlayer = e === player;
    let idle = STAND_IDLES[Math.floor(Math.random() * STAND_IDLES.length)];
    if (e.role === 'homeless') idle = 'sit_table_breathe_01';
    if (e.role === 'guard' || e.role === 'thug') idle = 'idle_waiting_01';
    if (e.drunk) idle = 'idle_drunk_01';
    if (isPlayer) idle = 'idle_neutral_01';
    const h = new Human(tpl, g, this.lib, { idle, shades: e.role === 'thug', scale: e.role === 'guard' ? 1.03 : 0.97 + Math.random() * 0.06 });
    h.root.traverse(o => { o.userData.entity = e; });
    this.scene.add(h.root);
    r = { h, e, lastX: e.x, lastY: e.y, speed: 0, activityT: Math.random() * 10, phase: Math.floor(Math.random() * 4) };
    this.rigs.set(e, r);
    return r;
  }

  // Per frame: place every rig, but only animate and draw the ones the camera
  // can actually see. Distant people animate at a lower rate and only people
  // near the camera cast shadows (the big costs on slower GPUs and Safari).
  update(dt, list, camera, opts = {}) {
    const seen = new Set();
    const maxDist = opts.maxDist || 45, shadowDist = opts.shadowDist ?? 14;
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const cx = camera.position.x, cz = camera.position.z;
    this.frame = (this.frame || 0) + 1;
    for (const e of list) {
      seen.add(e);
      const r = this.rigFor(e);
      if (!r) continue;
      const h = r.h;
      const px = W(e.x), pz = W(e.y);
      const dist = Math.hypot(px - cx, pz - cz);
      _sphere.center.set(px, 1, pz);
      const visible = e === player || (dist < maxDist && _frustum.intersectsSphere(_sphere));
      h.root.visible = visible;
      // speed from actual movement (map units → metres)
      const moved = Math.hypot(e.x - r.lastX, e.y - r.lastY) * 0.05;
      const inst = dt > 0 ? moved / dt : 0;
      r.speed += (Math.min(inst, 9) - r.speed) * Math.min(1, dt * 10);
      r.lastX = e.x; r.lastY = e.y;
      h.root.position.set(px, e.seatY || 0, pz);
      // smooth rotation
      const want = e.face || 0;
      let cur = h.root.rotation.y;
      let d = ((want - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      h.root.rotation.y = cur + d * Math.min(1, dt * 12);
      if (!visible) { r.acc = (r.acc || 0) + dt; continue; }
      const shadow = dist < shadowDist || e === player;
      if (shadow !== r.shadow) { r.shadow = shadow; h.root.traverse(o => { if (o.isMesh) o.castShadow = shadow; }); }
      // animation level of detail: every frame close up, every 2nd/4th frame further away
      r.acc = (r.acc || 0) + dt;
      const step = dist < 12 || e === player ? 1 : dist < 25 ? 2 : 4;
      if ((this.frame + r.phase) % step !== 0) continue;
      this.animate(r, e, r.acc);
      h.update(Math.min(r.acc, 0.25));
      r.acc = 0;
    }
    for (const [e, r] of this.rigs) {
      if (!seen.has(e)) { this.scene.remove(r.h.root); this.rigs.delete(e); }
    }
  }

  animate(r, e, dt) {
    const h = r.h;
    const pose = e.pose;
    h.pose = pose === 'aim' ? 'aim' : pose === 'hands' ? 'hands' : pose === 'down' ? 'down' : 'none';
    h.aimPitch = e.aimPitch || 0;
    const armed = e === player ? S.equipped : (e.role === 'robber' || e.role === 'thug') && pose !== 'down' && e.state !== 'leave';
    const kind = e === player ? S.equipped : 'pistol';
    h.setWeapon(armed ? kind : null);
    if (pose === 'sit' || e.seated) {
      if (!r.sitClip || r.activityT <= 0) {
        const list = SIT_IDLES[h.gender];
        r.sitClip = list[Math.floor(Math.random() * list.length)];
        r.activityT = 12 + Math.random() * 20;
      }
      r.activityT -= dt;
      h.setBase(r.sitClip, 0.6);
      return;
    }
    if (pose === 'down') { h.setBase('idle_neutral_01', 0.2); return; }
    if (e.activity && r.speed < 0.2) {
      const clip = { talk: 'gestic_talk_neutral_01', listen: 'gestic_listen_neutral_01', drink: 'drink_drinking', phone: 'cell_phone_talk_01', cheer: 'cheer_01', clap: 'claphands_01', sad: 'gestic_listen_sad_01', angry: 'idle_angry_01', nervous: 'idle_nervous_01' }[e.activity];
      if (clip) { h.setBase(clip, 0.4); return; }
    }
    const style = e.drunk ? 'drunk' : 'normal';
    h.setMotion(r.speed, style);
  }

  gesture(e, kind) {
    const r = this.rigs.get(e);
    if (!r) return;
    const clip = { nod: 'gestic_listen_accept_01', shake: 'gestic_listen_deny_01', shrug: 'gestic_shrug_01', cheer: 'cheer_01', clap: 'claphands_01' }[kind] || kind;
    r.h.gesture(clip, kind === 'cheer' ? 4 : kind === 'clap' ? 3.5 : undefined);
  }

  // Chest position (world space) for aiming / hit tests
  chest(e, out = new THREE.Vector3()) {
    const r = this.rigs.get(e);
    if (r && r.h.bones.Spine2) return r.h.bones.Spine2.getWorldPosition(out);
    return out.set(W(e.x), 1.3, W(e.y));
  }
  head(e, out = new THREE.Vector3()) {
    const r = this.rigs.get(e);
    if (r && r.h.bones.Head) return r.h.bones.Head.getWorldPosition(out);
    return out.set(W(e.x), 1.7, W(e.y));
  }
  hand(e, out = new THREE.Vector3()) {
    const r = this.rigs.get(e);
    if (r && r.h.gun && r.h.gun.visible) return r.h.gun.getWorldPosition(out);
    if (r && r.h.bones.R_Hand) return r.h.bones.R_Hand.getWorldPosition(out);
    return out.set(W(e.x), 1.4, W(e.y));
  }
}
