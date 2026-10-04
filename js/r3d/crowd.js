// Maps game entities (player, NPCs) to animated Rocketbox people.
//
// Entity fields the crowd reads (all optional, set by js/npcs.js, combat.js, world.js):
//   pose      'stand' | 'walk' | 'run' | 'sprint' | 'sit' | 'aim' | 'hands' | 'down'
//   seated    true when sitting (with seatY: the height of the seat)
//   face      yaw the body turns toward (map space, atan2(dx, dy))
//   activity  'talk' | 'listen' | 'drink' | 'phone' | 'text' | 'cheer' | 'clap' | 'sad' | 'angry' | 'nervous'
//             | 'dance' | 'cower' | 'radio' | 'wave'
//   carry     'tray' (waitresses carry drinks)
//   gait      'patrol' (slow, watchful walk) | 'brisk'
//   look      an entity or {x, y} map point the head turns toward
//   bubble/bubbleT  speech: the jaw moves while a bubble is showing
//   hp        a drop in hp plays a hit reaction; pose 'down' plays the fall
//
// API for game code (also exposed as Render3D.dealerGesture / react / tableReact):
//   crowd.dealerGesture(tableOrDealer, kind, { toward })  kind: deal flip collect payout shuffle spin throw wave
//                                                        toward: entity or {x, y} the hand reaches for; returns seconds
//   crowd.react(entity, kind)     kind: cheer clap groan sip nod shake shrug wave flinch cower  (sitting people use
//                                 seated versions of the same reactions)
//   crowd.tableReact(table, 'win' | 'bigwin' | 'lose')   everybody seated at a table reacts, the dealer too
//   crowd.gesture(entity, kind)   the same as react (kept for older callers)
import * as THREE from 'three';
import { Human, prepareAvatar, DEALER_MOVE_NAMES } from './people.js';
import { W } from './build.js';

const gender = f => (/Female|Party/.test(f) ? 'f' : 'm');
const A = (...files) => files.map(f => [f, gender(f)]);
const CIVIL_M = ['Male_Adult_01', 'Male_Adult_03', 'Male_Adult_05', 'Male_Adult_06', 'Male_Adult_07', 'Male_Adult_09', 'Male_Adult_10', 'Male_Adult_12', 'Male_Adult_13', 'Male_Adult_14', 'Male_Adult_17'];
const CIVIL_F = ['Female_Adult_01', 'Female_Adult_02', 'Female_Adult_03', 'Female_Adult_05', 'Female_Adult_08', 'Female_Adult_09', 'Female_Adult_12', 'Female_Adult_15', 'Female_Adult_17'];
const AVATARS = {
  player: A('Business_Male_01'),
  dealer: A('Business_Male_06', 'Business_Female_03', 'Business_Male_07', 'Business_Female_04', 'Business_Male_04', 'Business_Female_01'),
  bartender: A('Business_Male_06', 'Business_Male_07'),
  waitress: A('Female_Party_02', 'Female_Party_01', 'Female_Adult_17'),
  guard: A('Security_Male_01', 'Security_Male_01', 'Security_Female_01'),
  vendor: A('Chef_Female_01', 'Male_Adult_14'),
  clerk: A('Business_Female_03', 'Business_Male_02', 'Business_Female_04', 'Business_Male_04'),
  cashierClerk: A('Business_Female_03', 'Business_Female_01'),
  gambler: A(...CIVIL_M, ...CIVIL_F, 'Female_Party_01', 'Business_Male_02', 'Business_Male_05', 'Business_Male_03', 'Business_Female_02', 'Business_Female_04', 'Business_Male_04', 'Business_Male_07'),
  pedestrian: A(...CIVIL_M, ...CIVIL_F, 'Female_Party_01'),
  homeless: A('Male_Adult_04'),
  robber: A('Male_Adult_18'),
  thug: A('Business_Male_03', 'Business_Male_05', 'Male_Adult_10'),
  police: A('Police_Male_01', 'Police_Male_03'),
};
// Loaded before the game starts (staff, the player, the first faces on the floor). The rest stream in
// afterwards, so the first frame does not wait for 40 avatars.
export const AVATAR_FILES = ['Business_Male_01', 'Business_Male_06', 'Business_Female_03', 'Female_Party_02', 'Female_Party_01', 'Security_Male_01',
  'Chef_Female_01', 'Business_Male_02', 'Police_Male_01', 'Male_Adult_18', 'Business_Male_03', 'Male_Adult_04', 'Male_Adult_06', 'Female_Adult_01',
  'Business_Female_02', 'Male_Adult_13'];
const ALL_FILES = [...new Set(Object.values(AVATARS).flat().map(a => a[0]))];
// civilians first, alternating so both genders appear early
export const AVATAR_LAZY = (() => {
  const rest = ALL_FILES.filter(f => !AVATAR_FILES.includes(f));
  const civ = rest.filter(f => /Adult|Party/.test(f) && !/Security|Police/.test(f));
  const other = rest.filter(f => !civ.includes(f));
  const m = civ.filter(f => gender(f) === 'm'), fm = civ.filter(f => gender(f) === 'f'), out = [];
  for (let i = 0; i < Math.max(m.length, fm.length); i++) { if (fm[i]) out.push(fm[i]); if (m[i]) out.push(m[i]); }
  return [...out, ...other];
})();

const SIT_IDLES = { m: ['sit_table_idle_neutral_01', 'sit_table_idle_nervous_01', 'sit_table_gestic_thoughtful', 'sit_table_breathe_01'], f: ['sit_table_idle_neutral_01', 'sit_table_gestic_thoughtful', 'sit_table_breathe_01'] };
const STAND_IDLES = ['idle_neutral_01', 'idle_neutral_02', 'idle_waiting_01'];
const UNIFORM = new Set(['dealer', 'bartender', 'guard', 'police', 'vendor', 'clerk', 'cashierClerk', 'waitress', 'robber', 'thug', 'homeless']);
const DEALER_MOVES_BY_TABLE = { blackjack: ['deal', 'deal', 'flip', 'collect', 'shuffle'], baccarat: ['deal', 'flip', 'collect', 'payout'], roulette: ['spin', 'collect', 'payout', 'spin'], craps: ['collect', 'payout', 'wave', 'throw'], bigsix: ['spin', 'collect', 'payout'] };
const _pv = new THREE.Matrix4(), _frustum = new THREE.Frustum(), _sphere = new THREE.Sphere(new THREE.Vector3(), 1.6);
const _look = new THREE.Vector3(), _fwd = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOf = arr => arr[Math.floor(Math.random() * arr.length)];
const angDiff = (a, b) => ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const tableKind = t => (t && t.type ? (t.type.startsWith('blackjack') ? 'blackjack' : t.type.startsWith('baccarat') ? 'baccarat' : t.type) : 'blackjack');

export class Crowd {
  constructor(scene, templates, lib) {
    this.scene = scene;
    this.templates = templates;
    this.lib = lib;
    this.rigs = new Map();
    this.list = [];
    this.hash = 0;
    this.swapT = 0;
    this.camPos = new THREE.Vector3();
    this.camDir = new THREE.Vector3(0, 0, -1);
  }

  // Load the remaining avatars in the background. loader(file) resolves to a parsed glTF scene.
  async streamAvatars(files, loader, concurrency = 2) {
    const queue = files.filter(f => !this.templates[f]);
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift();
        try { const sc = await loader(f); if (sc) this.templates[f] = prepareAvatar(sc); } catch (err) { console.warn('avatar', f, err); }
        await new Promise(r => setTimeout(r, 40));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  }

  pickAvatar(e) {
    const list = AVATARS[e === player ? 'player' : e.role] || AVATARS.gambler;
    if (e.avatar) return e.avatar;
    const civil = e !== player && (e.role === 'gambler' || e.role === 'pedestrian');
    const pool = civil && e.female !== undefined ? list.filter(a => (a[1] === 'f') === !!e.female) : list;
    e.avatar = pickOf(pool.length ? pool : list);
    return e.avatar;
  }

  // Appearance variety: clothes hue, hair tone, height / build, glasses and hats
  makeLook(e, file, g) {
    const role = e === player ? 'player' : e.role;
    const civil = role === 'gambler' || role === 'pedestrian';
    const look = { scale: 1, width: 1 };
    const seed = e.lookSeed || (e.lookSeed = {});
    if (seed.done) return seed.look;
    if (civil) {
      look.scale = (g === 'f' ? 0.97 : 1.0) * rnd(0.96, 1.05);
      look.width = rnd(0.95, 1.08);
      if (Math.random() < 0.72) look.body = [Math.floor(Math.random() * 12) / 12, pickOf([0.85, 1, 1.12]), pickOf([0.78, 0.9, 1])];
      if (Math.random() < 0.4) look.hair = [0, pickOf([0.7, 1]), pickOf([0.6, 0.85, 1.2]), Math.random() < 0.3 ? 0.5 : 0];
      const day = typeof S !== 'undefined' && S.minutes % 1440 > 480 && S.minutes % 1440 < 1080;
      if (Math.random() < (role === 'pedestrian' && day ? 0.3 : 0.07)) look.shades = true;
      else if (Math.random() < 0.09) look.glasses = true;
      if (g === 'm' && !look.shades && Math.random() < (role === 'pedestrian' ? 0.18 : 0.05)) look.hat = 'cap';
      if (g === 'm' && !look.hat && !look.shades && role === 'gambler' && Math.random() < 0.05) look.hat = 'cowboy';
      if (look.hat === 'cap') look.hatColor = pickOf(['#22314f', '#7a1f1f', '#2f4f2f', '#3a3a3a', '#a08040']);
    } else if (role === 'guard') { look.scale = 1.03; }
    else if (role === 'thug') { look.shades = true; look.scale = 1.03; }
    else if (role === 'player') { look.scale = 1.0; }
    else look.scale = rnd(0.98, 1.03);
    seed.done = true; seed.look = look;
    return look;
  }

  buildRig(e, file, g, tpl) {
    const isPlayer = e === player;
    const role = isPlayer ? 'player' : e.role;
    const look = this.makeLook(e, file, g);
    let idle = pickOf(STAND_IDLES);
    if (role === 'homeless') idle = 'sit_table_breathe_01';
    if (role === 'guard' || role === 'thug' || role === 'police') idle = 'idle_waiting_01';
    if (e.drunk) idle = 'idle_drunk_01';
    if (isPlayer) idle = 'idle_neutral_01';
    const h = new Human(tpl, g, this.lib, {
      idle, scale: look.scale, look: look.body || look.hair ? { body: look.body, hair: look.hair } : null,
      shades: look.shades, glasses: look.glasses, hat: look.hat, hatColor: look.hatColor,
    });
    if (look.width !== 1) h.model.scale.x = h.model.scale.z = h.model.scale.x * look.width;
    h.root.traverse(o => { o.userData.entity = e; });
    this.scene.add(h.root);
    return h;
  }

  rigFor(e) {
    let r = this.rigs.get(e);
    if (r) return r;
    const [want, g] = this.pickAvatar(e);
    let file = want, tpl = this.templates[want];
    if (!tpl) {
      // not streamed in yet: wear a loaded avatar of the same gender until the real one arrives
      const list = (AVATARS[e === player ? 'player' : e.role] || AVATARS.gambler).filter(a => this.templates[a[0]] && a[1] === g);
      const pool = list.length ? list : Object.keys(this.templates).filter(f => gender(f) === g && !/Security|Police|Chef/.test(f)).map(f => [f, g]);
      if (!pool.length) return null;
      [file] = pickOf(pool); tpl = this.templates[file];
    }
    const h = this.buildRig(e, file, g, tpl);
    const isPlayer = e === player;
    r = { h, e, file, want, g, lastX: e.x, lastY: e.y, speed: 0, activityT: Math.random() * 10, phase: Math.floor(Math.random() * 4), turnRate: 0,
      lastHp: e.hp, lastHealth: isPlayer ? S.health : 0, idleT: rnd(4, 12), dealerT: rnd(1, 6), glanceT: rnd(1, 5), glanceUntil: 0, wanderT: rnd(2, 6),
      seatY: e.seatY || 0, react: null, fall: 0, lookYaw: 0 };
    this.rigs.set(e, r);
    return r;
  }

  // Per frame: place every rig, but only animate and draw the ones the camera
  // can actually see. Distant people animate at a lower rate and only people
  // near the camera cast shadows (the big costs on slower GPUs and Safari).
  update(dt, list, camera, opts = {}) {
    const seen = new Set();
    this.list = list;
    const maxDist = opts.maxDist || 45, shadowDist = opts.shadowDist ?? 14;
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const cx = camera.position.x, cz = camera.position.z;
    this.camPos.copy(camera.position);
    camera.getWorldDirection(this.camDir);
    this.frame = (this.frame || 0) + 1;
    this.time = (this.time || 0) + dt;
    // enemy gunfire kicks the shooter's arm back
    if (typeof fx !== 'undefined') for (const f of fx) if (f.from && !f._kicked) { f._kicked = true; const r = this.rigs.get(f.from); if (r) r.h.kick(); }
    for (const e of list) {
      seen.add(e);
      const r = this.rigFor(e);
      if (!r) continue;
      const h = r.h;
      const px = W(e.x), pz = W(e.y);
      const dist = Math.hypot(px - cx, pz - cz);
      _sphere.center.set(px, 1, pz);
      const isPlayer = e === player;
      const visible = isPlayer || (dist < maxDist && _frustum.intersectsSphere(_sphere));
      h.root.visible = visible;
      r.visible = visible;
      // speed from actual movement (map units → metres)
      const moved = Math.hypot(e.x - r.lastX, e.y - r.lastY) * 0.05;
      const inst = dt > 0 ? moved / dt : 0;
      r.speed += (Math.min(inst, 9) - r.speed) * Math.min(1, dt * 10);
      if (inst > 12) r.speed = 0; // teleports (seat changes) are not walking
      r.lastX = e.x; r.lastY = e.y;
      // sitting down / standing up: the seat height eases instead of jumping
      const wantY = e.seatY || 0;
      r.seatY += (wantY - r.seatY) * Math.min(1, dt * 4);
      if (Math.abs(wantY - r.seatY) < 0.002) r.seatY = wantY;
      h.root.position.set(px, r.seatY, pz);
      // body turns at a limited speed (and steps on the spot when it turns while standing still)
      const want = e.face || 0;
      const cur = h.root.rotation.y;
      const d = angDiff(cur, want);
      const seated = e.pose === 'sit' || e.seated;
      const maxRate = seated || isPlayer ? 14 : r.speed > 0.4 ? 8 : 3.4;
      const step = Math.max(-maxRate * dt, Math.min(maxRate * dt, d * Math.min(1, dt * 12)));
      h.root.rotation.y = cur + step;
      r.turnRate += ((dt > 0 ? Math.abs(step) / dt : 0) - r.turnRate) * Math.min(1, dt * 8);
      if (!visible) { r.acc = (r.acc || 0) + dt; continue; }
      const shadow = dist < shadowDist || isPlayer;
      if (shadow !== r.shadow) { r.shadow = shadow; h.root.traverse(o => { if (o.isMesh) o.castShadow = shadow; }); }
      // animation level of detail: every frame close up, every 2nd/4th frame further away
      r.acc = (r.acc || 0) + dt;
      const step2 = dist < 12 || isPlayer ? 1 : dist < 25 ? 2 : 4;
      if ((this.frame + r.phase) % step2 !== 0) continue;
      h.detail = dist < 30 || isPlayer || e.hostile;
      r.dist = dist;
      this.animate(r, e, r.acc, dist);
      h.update(Math.min(r.acc, 0.25));
      r.acc = 0;
    }
    for (const [e, r] of this.rigs) {
      if (!seen.has(e)) { this.scene.remove(r.h.root); this.rigs.delete(e); }
    }
    // swap stand-in avatars for the real ones once they are loaded (only while off screen)
    this.swapT -= dt;
    if (this.swapT <= 0) {
      this.swapT = 1.2;
      for (const [e, r] of this.rigs) {
        if (r.file === r.want || !this.templates[r.want] || r.visible) continue;
        const h = this.buildRig(e, r.want, r.g, this.templates[r.want]);
        this.scene.remove(r.h.root);
        h.root.position.copy(r.h.root.position); h.root.rotation.y = r.h.root.rotation.y;
        r.h = h; r.file = r.want; r.sitClip = null;
        break;
      }
    }
  }

  // Where should this person be looking (world point), or null
  lookTarget(r, e, dist) {
    const h = r.h;
    const pt = (o, hh) => _look.set(W(o.x), hh, W(o.y));
    if (e === player) {
      _look.copy(this.camPos).addScaledVector(this.camDir, 10);
      return _look;
    }
    if (e.look) {
      const o = e.look;
      return pt(o, o === player ? (player.seated ? 1.3 : 1.6) : o.role ? (o.seated ? 1.3 + (o.seatY || 0) : 1.6) : (o.h || 1.05));
    }
    if (dist > 22 || e.hostile) return null;
    const tm = this.time;
    if (r.holdUntil > tm && r.lookHold) return pt(r.lookHold, r.lookHold.role ? 1.3 : 1.0);
    if (e.role === 'dealer') {
      // watch the players at the table
      if (tm > (r.dlT || 0)) { r.dlT = tm + rnd(2, 5); const seats = this.list.filter(g => g.seated && g.role === 'gambler' && Math.hypot(g.x - e.x, g.y - e.y) < 260); r.dl = seats.length && Math.random() < 0.8 ? pickOf(seats) : null; }
      if (r.dl) return pt(r.dl, 1.3 + (r.dl.seatY || 0));
    }
    if (e.seated && e.role === 'gambler') {
      // players watch the dealer, their cards / machine, or the room
      if (tm > (r.seatLookT || 0)) { r.seatLookT = tm + rnd(1.5, 4.5); const c = Math.random(); r.seatLook = c < 0.5 ? 0 : c < 0.85 ? 1 : 2; r.sd = undefined; }
      if (r.sd === undefined) { let best = null, bd = 260; for (const g of this.list) if (g.role === 'dealer') { const dd = Math.hypot(g.x - e.x, g.y - e.y); if (dd < bd) { bd = dd; best = g; } } r.sd = best; }
      const f = e.face || 0;
      if (r.seatLook === 0 && r.sd) return pt(r.sd, 1.6);
      if (r.seatLook === 1) return _look.set(W(e.x) + Math.sin(f) * 0.8, 0.95 + (e.seatY || 0), W(e.y) + Math.cos(f) * 0.8);
      return _look.set(W(e.x) + Math.sin(f) * 3, 1.3 + (e.seatY || 0), W(e.y) + Math.cos(f) * 3);
    }
    // glance at the player when they come near, then look away again
    const dx = e.x - player.x, dy = e.y - player.y, pd = Math.hypot(dx, dy) * 0.05;
    const t = this.time;
    if (pd < 6.5 && !e.seated && e.role !== 'thug') {
      const toP = Math.atan2(player.x - e.x, player.y - e.y);
      const inFront = Math.abs(angDiff(e.face || 0, toP)) < 1.9;
      if (t > r.glanceUntil && t > r.glanceT && inFront) { r.glanceUntil = t + rnd(1.4, 3.6); r.glanceT = r.glanceUntil + rnd(3, 9); }
      if (t < r.glanceUntil) return pt(player, 1.6);
    }
    // idle wandering eyes on people standing about
    if (r.speed < 0.2 && t > r.wanderT) { r.wanderT = t + rnd(3, 8); r.wander = { y: rnd(-0.9, 0.9), p: rnd(-0.1, 0.15), until: t + rnd(0.8, 2.2) }; }
    if (r.wander && t < r.wander.until && r.speed < 0.2) {
      const a = (e.face || 0) + r.wander.y;
      const hh = h.bones.Head ? h.root.position.y + (e.seated ? 1.25 : 1.6) : 1.6;
      return _look.set(W(e.x) + Math.sin(a) * 4, hh + r.wander.p * 4, W(e.y) + Math.cos(a) * 4);
    }
    return null;
  }

  animate(r, e, dt, dist) {
    const h = r.h;
    const isPlayer = e === player;
    const pose = e.pose;
    h.pose = pose === 'aim' ? 'aim' : pose === 'hands' ? 'hands' : 'none';
    h.aimPitch = e.aimPitch || 0;
    h.speaking = !!(e.bubble && e.bubbleT > 0);
    const armed = isPlayer ? S.equipped : (e.role === 'robber' || e.role === 'thug') && pose !== 'down' && e.state !== 'leave';
    const kind = isPlayer ? S.equipped : 'pistol';
    h.setWeapon(armed ? kind : null);
    // gunshots kick the arm back
    if (isPlayer) { if (e.shootT > 0.44 && !r.shotKick) { h.kick(); r.shotKick = true; } else if (e.shootT < 0.3) r.shotKick = false; }
    // hit reactions: a drop in hp (NPCs) or health (player)
    let hit = false;
    if (isPlayer) { if (S.health < r.lastHealth - 0.5) hit = true; r.lastHealth = S.health; }
    else if (e.hp !== undefined) { if (e.hp < r.lastHp - 0.5) hit = true; r.lastHp = e.hp; }
    if (hit) {
      let dx = 0, dz = -1;
      const src = isPlayer ? null : player;
      if (src) {
        const px = e.x - src.x, py = e.y - src.y, l = Math.hypot(px, py) || 1, f = e.face || 0;
        dz = (px * Math.sin(f) + py * Math.cos(f)) / l; dx = (px * Math.cos(f) - py * Math.sin(f)) / l;
      }
      r.hitDir = dz;
      h.flinch(isPlayer ? 0.8 : 1, dx, dz);
    }
    // look at things
    const lt = h.detail ? this.lookTarget(r, e, dist) : null;
    if (lt) { h.lookTarget = lt; h.lookW = 1; } else { h.lookTarget = null; h.lookW = 0; }
    // reactions requested by game code (cheer, groan, sip…)
    let react = r.react;
    if (react && this.time > react.until) react = r.react = null;

    if (pose === 'down' || (isPlayer && S.health <= 0)) {
      if (!h.downOn) h.fall(true, r.hitDir === undefined ? (Math.random() < 0.65 ? 1 : -1) : (r.hitDir < 0 ? 1 : -1));
      h.setBase('idle_neutral_01', 0.2);
      h.ovOnly();
      return;
    }
    if (h.downOn) { h.fall(false); }
    const seated = pose === 'sit' || e.seated;
    let ov = [];
    let prop = null;
    if (seated) {
      if (!r.sitClip || r.activityT <= 0) {
        const list = SIT_IDLES[h.gender];
        r.sitClip = list[Math.floor(Math.random() * list.length)];
        r.activityT = 12 + Math.random() * 20;
      }
      r.activityT -= dt;
      h.setBase(r.sitClip, 0.6);
      h.crouchTarget = 0; h.leanTarget = 0;
      const a = react ? react.kind : e.activity;
      if (a === 'cheer' || a === 'clap') ov.push('sitcheer');
      else if (a === 'groan' || a === 'sad') ov.push('slump');
      else if (a === 'sip' || a === 'drink') { ov.push('sip'); prop = 'glass'; }
      else if (a === 'cower') { ov.push('cower'); }
      else if (a === 'text' || a === 'phone') { ov.push('text'); prop = 'phone'; }
      this.applyProps(h, prop);
      h.ovOnly(...ov);
      return;
    }
    // ---- standing ------------------------------------------------------
    const activity = react && react.kind === 'cower' ? 'cower' : e.activity;
    h.crouchTarget = activity === 'cower' ? 0.5 : 0;
    h.leanTarget = isPlayer && r.speed > 4.6 ? 1 : (e.state === 'flee' || e.state === 'leave') && r.speed > 3 ? 0.6 : 0;
    if (activity === 'cower') ov.push('cower');
    if (activity === 'dance') ov.push('dance');
    if (activity === 'radio') ov.push('radio');
    if (activity === 'text') { ov.push('text'); prop = 'phone'; }
    if (e.carry === 'tray') ov.push('tray');
    if (r.speed < 0.25 && pose !== 'aim' && pose !== 'hands' && !e.hostile && activity !== 'cower') {
      const clip = { talk: 'gestic_talk_neutral_01', excited: 'gestic_talk_excited_01', listen: 'gestic_listen_neutral_01', drink: 'drink_drinking', phone: 'cell_phone_talk_01', cheer: 'cheer_01', clap: 'claphands_01', sad: 'gestic_listen_sad_01', angry: 'idle_angry_01', nervous: 'idle_nervous_01', dance: 'idle_neutral_02', text: 'idle_neutral_01', radio: 'idle_waiting_01', wave: 'idle_neutral_01' }[activity];
      if (activity === 'phone') prop = 'phone';
      if (activity === 'drink') prop = 'glass';
      if (activity === 'wave' && !r.waveT) r.waveT = 1;
      if (clip) { h.setBase(clip, 0.4); this.finish(r, h, e, ov, prop, dt); return; }
    }
    if (e.activity === 'cower' || activity === 'cower') { h.setBase('idle_neutral_01', 0.3); this.finish(r, h, e, ov, prop, dt); return; }
    if (react && !react.done && !isPlayer) {
      react.done = true;
      const c = { cheer: 'cheer_01', clap: 'claphands_01', groan: 'gestic_listen_sad_01', nod: 'gestic_listen_accept_01', shake: 'gestic_listen_deny_01', shrug: 'gestic_shrug_01' }[react.kind];
      if (c) h.gesture(c, { cheer: 3.5, clap: 3, groan: 3.2, shake: 3, shrug: 1.8, nod: 2.5 }[react.kind]);
    }
    // locomotion. Turning on the spot steps the feet instead of sliding
    const style = e.drunk ? 'drunk' : e.gait === 'brisk' ? 'brisk' : 'normal';
    if (r.speed < 0.12 && r.turnRate > 0.9 && r.turnRate < 7 && pose !== 'aim' && !isPlayer) h.setTurn(r.turnRate);
    else h.setMotion(e.gait === 'patrol' ? Math.min(r.speed, 0.9) : r.speed, style);
    this.finish(r, h, e, ov, prop, dt);
  }

  // props, overlays and idle variety shared by every standing state
  finish(r, h, e, ov, prop, dt) {
    if (e.carry === 'tray') { h.setProp('tray', true); } else if (h.props.tray) h.setProp('tray', false);
    this.applyProps(h, prop);
    h.ovOnly(...ov);
    // dealers keep busy: deal, flip, collect… between the moments game code triggers a gesture
    if (e.role === 'dealer' && e.table && !h.dealer) {
      r.dealerT -= dt;
      if (r.dealerT <= 0) { r.dealerT = rnd(4, 9); this.dealerGesture(e, pickOf(DEALER_MOVES_BY_TABLE[tableKind(e.table)] || ['collect'])); }
    }
    // variety: a look around, a shrug, a different way of standing
    if (!e.activity && !e.hostile && r.speed < 0.1 && !/aim|hands/.test(e.pose || '') && !(e === player)) {
      r.idleT -= dt;
      if (r.idleT <= 0) {
        r.idleT = rnd(7, 16);
        const c = Math.random();
        if (c < 0.3) h.gesture('idle_look_around_01', 4);
        else if (c < 0.45) h.gesture('gestic_shrug_01', 1.8);
        else h.setIdle(pickOf(STAND_IDLES));
      }
    }
    if (r.waveT) { r.waveT = 0; h.dealerMove('wave', 0); }
  }

  applyProps(h, prop) {
    if (h.props.phone) h.props.phone.visible = prop === 'phone';
    if (h.props.glass) h.props.glass.visible = prop === 'glass';
    if (prop === 'phone' && !h.props.phone) h.setProp('phone', true);
    if (prop === 'glass' && !h.props.glass) h.setProp('glass', true);
  }

  // ---------------------------------------------------------------------
  // Game-facing API
  // ---------------------------------------------------------------------
  dealerFor(t) {
    if (t && t.role === 'dealer') return t;
    return this.list.find(e => e.role === 'dealer' && e.table === t) || null;
  }

  // kind: deal | flip | collect | payout | shuffle | spin | throw | wave. Returns the duration in seconds.
  dealerGesture(tableOrDealer, kind, opts = {}) {
    const e = this.dealerFor(tableOrDealer);
    const r = e && this.rigs.get(e);
    if (!r) return 0;
    let yaw = 0;
    let target = opts.toward;
    if (!target && kind !== 'wave') {
      // hand cards to a random seated player, otherwise reach for the middle of the table
      const seats = this.list.filter(g => g.seated && g.role === 'gambler' && Math.hypot(g.x - e.x, g.y - e.y) < 260);
      target = seats.length && (kind === 'deal' || kind === 'payout' || kind === 'flip') ? pickOf(seats) : e.table ? { x: e.table.x + e.table.w / 2, y: e.table.y + e.table.h / 2 } : null;
    }
    if (target) yaw = angDiff(e.face || 0, Math.atan2(target.x - e.x, target.y - e.y));
    // if the wanted move needs the arms and the person is busy, still play it (the overlay wins)
    const dur = r.h.dealerMove(kind, yaw);
    if (dur) { r.dealerT = dur + rnd(2, 6); if (target) { r.lookHold = target; r.holdUntil = this.time + dur; } }
    return dur;
  }

  // Reactions: cheer, clap, groan, sip, nod, shake, shrug, wave, flinch, cower
  react(e, kind, secs) {
    const r = this.rigs.get(e);
    if (!r) return;
    if (kind === 'flinch') { r.h.flinch(1, 0, -1); return; }
    if (kind === 'wave') { r.h.dealerMove('wave', 0); return; }
    const dur = secs || (kind === 'cheer' ? 4 : kind === 'clap' ? 3.5 : kind === 'sip' ? 3 : kind === 'cower' ? 6 : 3);
    r.react = { kind, until: this.time + dur, done: false };
  }
  gesture(e, kind) {
    const map = { nod: 'nod', shake: 'shake', shrug: 'shrug', cheer: 'cheer', clap: 'clap', groan: 'groan', sip: 'sip' };
    this.react(e, map[kind] || kind);
  }

  // Everyone at a table reacts to a round: 'win' | 'bigwin' | 'lose'
  tableReact(table, kind) {
    for (const e of this.list) {
      if (e === player || e.pose === 'down') continue;
      if (e.role === 'dealer' && e.table === table) {
        this.dealerGesture(e, kind === 'lose' ? 'collect' : 'payout');
        continue;
      }
      if (e.role !== 'gambler' && e.role !== 'pedestrian') continue;
      const cx = Math.max(table.x, Math.min(e.x, table.x + table.w)), cy = Math.max(table.y, Math.min(e.y, table.y + table.h));
      if (Math.hypot(e.x - cx, e.y - cy) > 90) continue;
      const roll = Math.random();
      if (kind === 'lose') { if (roll < 0.14) this.react(e, e.seated ? 'groan' : 'shake'); }
      else if (roll < (kind === 'bigwin' ? 0.85 : 0.45)) this.react(e, roll < 0.5 ? 'cheer' : 'clap');
    }
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

export { DEALER_MOVE_NAMES };
