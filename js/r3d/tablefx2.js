// TableFX extensions for the second wave of games (video poker, keno, race book,
// scratch cards, Three Card Poker, Sic Bo). Installed onto TableFX.prototype from
// tablefx.js with one line; everything here is self-contained.
import * as THREE from 'three';
import { tableData } from './build.js';
import { NEWGAME, LiveScreen } from './games3d.js';
import { drawVideoPoker, drawScratch } from './screens2.js';

const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const NEW_MACHINES = ['videopoker', 'keno', 'racebook', 'lottery'];
const screenMat = map => new THREE.MeshStandardMaterial({ map, emissive: '#fff', emissiveMap: map, emissiveIntensity: 1.1, color: '#000', roughness: 0.25 });
const wallKind = o => (o.type === 'keno' ? 'keno' : o.type === 'racebook' ? 'race' : null);

const METHODS = {
  // -------------------------------------------------------------------------
  // Seated camera views
  // -------------------------------------------------------------------------
  seatView2(o) {
    if (o.type === 'videopoker' || o.type === 'lottery') {
      const m = NEWGAME.machines.get(o); if (!m || !m.view) return null;
      const v = m.view, f = m.frame;
      return { pos: f.localToWorld(new THREE.Vector3(...v.eye)), look: f.localToWorld(new THREE.Vector3(...v.look)), fov: v.fov };
    }
    if (o.type === 'keno' || o.type === 'racebook') {
      // frontal view of the wall board, shifted so it clears the left-hand panel
      const wall = NEWGAME.walls[wallKind(o)]; if (!wall) return null;
      const race = o.type === 'racebook', sh = race ? 0.35 : 0.4;
      const pos = wall.frame.localToWorld(new THREE.Vector3(-sh, 1.4, 3.3));   // in front of the seated player's head
      const look = wall.frame.localToWorld(new THREE.Vector3(-sh, wall.cy - (race ? 0.45 : 0.3), 0));
      return { pos, look, fov: race ? 58 : 50 };
    }
    if (o.type === 'threecard') {
      const td = this.td(o); if (!td) return null;
      return { pos: this.L(td, -0.25, 1.55, td.d * 0.5 + 0.5), look: this.L(td, -0.25, td.feltY, 0.12), fov: 54 };
    }
    if (o.type === 'sicbo') {
      const td = this.td(o); if (!td) return null;
      return { pos: this.L(td, -0.45, 1.55, td.d / 2 + 0.62), look: this.L(td, -0.45, td.feltY, -0.05), fov: 62 };
    }
    return null;
  },

  // -------------------------------------------------------------------------
  // Live screens
  // -------------------------------------------------------------------------
  screenOf(o) {
    if (o.type === 'keno' || o.type === 'racebook') { const w = NEWGAME.walls[wallKind(o)]; return w ? w.live : null; }
    const m = NEWGAME.machines.get(o); return m ? m.live || null : null;
  },
  openScreen(o) {
    this.fx2 = this.fx2 || { active: new Set(), acc: 0, ats: 0, particles: [] };
    if (o.type === 'keno' || o.type === 'racebook') {
      const w = NEWGAME.walls[wallKind(o)]; if (!w) return null;
      w.busy = true; w.live.atlas = this.atlas.image; w.live.state = { t: 0 };
      this.fx2.active.add(w);
      return w.live;
    }
    const m = NEWGAME.machines.get(o); if (!m) return null;
    if (!m.live) { m.live = new LiveScreen(768, 576, o.type === 'lottery' ? drawScratch : drawVideoPoker, 1024, 768); m.live.atlas = this.atlas.image; m.liveMat = screenMat(m.live.tex); }
    m.live.state = { t: 0 };
    m.mesh.material = m.liveMat;
    this.fx2.active.add(m);
    return m.live;
  },
  closeScreen(o) {
    if (!this.fx2) return;
    if (o.type === 'keno' || o.type === 'racebook') {
      const w = NEWGAME.walls[wallKind(o)]; if (w) { w.busy = false; w.att = null; this.fx2.active.delete(w); }
      return;
    }
    const m = NEWGAME.machines.get(o);
    if (m) { m.mesh.material = m.idle; this.fx2.active.delete(m); }
  },

  update2(dt) {
    const f = this.fx2; if (!f) return;
    f.acc += dt; f.ats += dt;
    const step = f.acc >= 1 / 30;
    if (step) {
      for (const a of f.active) { if (a.live) { a.live.draw(this.t); } }
      f.acc = 0;
    }
    // idle wall boards animate when the player is close
    if (f.ats >= 0.1) {
      const d = f.ats; f.ats = 0;
      const near = w => typeof player !== 'undefined' && Math.hypot(player.x - (w.o.x + w.o.w / 2), player.y - w.o.y) < 950;
      for (const kind of ['race', 'keno']) {
        const w = NEWGAME.walls[kind]; if (!w || w.busy || !near(w)) continue;
        this.attract2(w, d);
      }
    }
    // celebration particles
    if (f.particles.length) {
      f.particles = f.particles.filter(p => {
        p.life += dt;
        const a = p.pts.geometry.attributes.position;
        for (let i = 0; i < p.n; i++) {
          p.vel[i * 3 + 1] -= 3.2 * dt;
          a.array[i * 3] += p.vel[i * 3] * dt; a.array[i * 3 + 1] += p.vel[i * 3 + 1] * dt; a.array[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
        }
        a.needsUpdate = true;
        p.pts.material.opacity = Math.max(0, 1 - Math.pow(p.life / p.dur, 2));
        if (p.life >= p.dur) { this.scene.remove(p.pts); p.pts.geometry.dispose(); p.pts.material.dispose(); return false; }
        return true;
      });
    }
  },
  // Attract mode for the shared wall boards (a demo race / demo keno draw)
  attract2(w, dt) {
    const O = window.Odds2 || Odds2;
    if (!w.att) w.att = { t: 0, phase: 0, balls: [], nextBall: 0 };
    const a = w.att; a.t += dt;
    const s = w.live.state;
    if (w.kind === 'race') {
      if (!a.field) { a.field = O.raceField(6); a.order = O.raceOrder(a.field); a.t = 0; a.n = (a.n || 0) + 1; }
      const dur = 10;
      Object.assign(s, this.raceFrame(a.field, a.order, Math.min(1.25, a.t / dur)), { race: 100 + a.n, message: a.t < 1.5 ? 'AND THEY\'RE OFF!' : a.t > dur ? 'PLACE YOUR BETS · NEXT RACE SOON' : 'DEMO RACE', running: a.t < dur + 1.2 });
      if (a.t > dur + 5) a.field = null;
    } else {
      if (!a.draw || a.t > 26) { a.draw = O.kenoDraw(); a.t = 0; }
      const k = Math.min(20, Math.floor(a.t / 0.7));
      s.drawn = a.draw.slice(0, k); s.last = a.draw[k - 1] || null; s.picks = []; s.drawing = k < 20; s.message = k >= 20 && a.t > 15 ? 'PICK UP TO 10 NUMBERS AT A TERMINAL' : null;
    }
    w.live.draw(this.t);
  },
  // Horse positions for time fraction k (1 = winner finishes). order = horse indices, first to last.
  raceFrame(field, order, k) {
    const pos = [], finished = [];
    field.horses.forEach(h => {
      const rank = order.indexOf(h.i);
      const T = 1 + rank * 0.05;
      const u = Math.min(1, k / T);
      const wob = 0.045 * Math.sin(u * Math.PI * (2.4 + (h.i % 3) * 0.7) + h.i * 1.9) * (1 - u);
      pos[h.i] = Math.min(1, u + wob);
      finished[h.i] = k >= T ? rank + 1 : 0;
    });
    return { pos, finished };
  },
  async raceRun(field, order, dur = 9.5) {
    const w = NEWGAME.walls.race; if (!w) return;
    const s = w.live.state;
    s.running = true;
    await this.tween(dur * 1.25, k => Object.assign(s, this.raceFrame(field, order, k * 1.25)));
    s.running = false;
  },

  // -------------------------------------------------------------------------
  // Celebration: a fountain of gold sparks from a machine or table
  // -------------------------------------------------------------------------
  celebrate(o, level = 1) {
    this.fx2 = this.fx2 || { active: new Set(), acc: 0, ats: 0, particles: [] };
    let origin;
    const m = NEWGAME.machines.get(o), td = this.td(o);
    if (m) origin = m.frame.localToWorld(new THREE.Vector3(0, 1.5, 0.3));
    else if (td) origin = this.L(td, 0, td.feltY + 0.1, td.d * 0.15);
    else { const w = NEWGAME.walls[wallKind(o) || 'race']; if (!w) return; origin = w.frame.localToWorld(new THREE.Vector3(0, w.cy - w.h * 0.4, 0.5)); }
    const up = m ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 1, 0);
    const n = 40 + level * 50;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([origin.x, origin.y, origin.z], i * 3);
      const a = Math.random() * 6.283, sp = 0.6 + Math.random() * (0.9 + level * 0.4);
      vel.set([Math.cos(a) * sp * 0.6, 1.6 + Math.random() * 1.8 * up.y, Math.sin(a) * sp * 0.6], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: level > 2 ? '#fff3b0' : '#ffcf40', size: 0.045, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.fx2.particles.push({ pts, n, vel, life: 0, dur: 1.6 + level * 0.4 });
  },

  // -------------------------------------------------------------------------
  // Sic Bo: three dice tumbling under the dome
  // -------------------------------------------------------------------------
  sicboSpot(o, key, n) { const td = this.td(o); return td && td.spotFn ? this.L(td, td.spotFn(key, n)[0], td.feltY + 0.001, td.spotFn(key, n)[1]) : null; },
  async sicboRoll(o, dice) {
    const td = this.td(o); if (!td) return;
    (td.sbDice || []).forEach(d => this.scene.remove(d));
    const cx = td.cage[0], cz = td.cage[1], y = td.feltY + 0.05;
    td.sbDice = dice.map(() => { const m = new THREE.Mesh(this.diceGeo, this.diceMats); m.scale.setScalar(1.5); m.castShadow = true; this.scene.add(m); return m; });
    const finals = dice.map(v => this.faceQuat(v));
    const rest = dice.map((_, i) => this.L(td, cx + Math.cos(i * 2.1 + 0.6) * 0.07, y - 0.026, cz + Math.sin(i * 2.1 + 0.6) * 0.07));
    const spins = dice.map(() => new THREE.Vector3(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15));
    const seeds = dice.map(() => Math.random() * 100);
    await this.tween(2.0, (k, dt) => {
      td.sbDice.forEach((d, i) => {
        if (k < 0.75) {
          const r = 0.14 * Math.min(1, k * 6), ph = this.t * (9 + i * 2.3) + seeds[i];
          d.position.copy(this.L(td, cx + Math.cos(ph) * r * 0.8, y + Math.abs(Math.sin(ph * 1.7)) * 0.11 * (1 - k), cz + Math.sin(ph * 1.3) * r * 0.8));
          d.rotation.x += spins[i].x * dt; d.rotation.y += spins[i].y * dt; d.rotation.z += spins[i].z * dt;
        } else {
          const kk = (k - 0.75) / 0.25;
          d.position.lerp(rest[i], easeOut(kk) * 0.5 + 0.1);
          d.quaternion.slerp(finals[i], Math.min(1, kk * 1.4 + 0.1));
        }
      });
    });
    td.sbDice.forEach((d, i) => { d.position.copy(rest[i]); d.quaternion.copy(finals[i]); });
  },
  // Blackjack split: the two cards of the pair slide apart into hands A and B
  async splitHand(o) {
    const td = this.td(o); if (!td) return;
    const find = i => td.cards.find(c => c.userData.hand === 'player' && c.userData.idx === i);
    const a = find(0), b = find(1); if (!a || !b) return;
    a.userData = { hand: 'playerA', idx: 0, faceUp: true }; b.userData = { hand: 'playerB', idx: 0, faceUp: true };
    const fa = a.position.clone(), fb = b.position.clone(), ta = this.cardSpot(td, 'playerA', 0), tb = this.cardSpot(td, 'playerB', 0);
    await this.tween(0.4, k => { const e = ease(k); a.position.lerpVectors(fa, ta, e); b.position.lerpVectors(fb, tb, e); a.position.y += Math.sin(k * Math.PI) * 0.04; b.position.y += Math.sin(k * Math.PI) * 0.04; });
  },
  sicboClearDice(o) { const td = this.td(o); if (td && td.sbDice) { td.sbDice.forEach(d => this.scene.remove(d)); td.sbDice = null; } },
};

export function installFX2(TF) {
  const P = TF.prototype;
  const seatView0 = P.seatView, update0 = P.update, clear0 = P.clear, cardSpot0 = P.cardSpot;
  Object.assign(P, METHODS);
  P.seatView = function (o) { return this.seatView2(o) || seatView0.call(this, o); };
  P.update = function (dt, t) { update0.call(this, dt, t); this.update2(dt); };
  P.clear = async function (o) {
    if (NEW_MACHINES.includes(o.type)) { this.closeScreen(o); return; }
    if (o.type === 'sicbo') this.sicboClearDice(o);
    return clear0.call(this, o);
  };
  P.cardSpot = function (td, hand, idx) {
    if (td.kind === 'threecard') {
      const y = td.feltY + 0.003 + idx * 0.0008;
      return hand === 'dealer' ? this.L(td, -0.15 + idx * 0.15, y, -0.05) : this.L(td, -0.15 + idx * 0.15, y, 0.3);
    }
    if (hand === 'playerA' || hand === 'playerB') return this.L(td, (hand === 'playerA' ? -0.24 : 0.14) + idx * 0.042, td.feltY + 0.003 + idx * 0.0008, td.d * 0.22 - idx * 0.022);
    return cardSpot0.call(this, td, hand, idx);
  };
  // wall boards keep their screens dark when nobody is near: nothing else to install
  void tableData;
}
