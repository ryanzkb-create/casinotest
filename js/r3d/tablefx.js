// 3D visuals for the casino games: cards, chips, dice, roulette ball, Big Six,
// slot reels and the seated camera views. Game logic lives in js/games.js and
// calls into this through window.Render3D.tables().
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tableData, ROULETTE_ORDER, W, objFrame } from './build.js';
import * as TX from './tex.js';

const CARD_W = 0.095, CARD_H = 0.133;       // ~1.5x real cards so they read from the seat
const CHIP_R = 0.031, CHIP_H = 0.0058;      // ~1.3x real size so stacks read from the seat
const DENOMS = [100000, 25000, 5000, 1000, 500, 100, 25, 5, 1];
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);

export class TableFX {
  constructor(scene, crowd) {
    this.scene = scene;
    this.crowd = crowd;
    this.t = 0;
    this.tweens = [];
    for (const td of tableData) {
      td.frame.updateMatrixWorld(true);
      if (td.kind === 'roulette') td.spin = 0.45 + Math.random() * 0.3;
      td.cards = []; td.chips = [];
    }
    // cards
    this.atlas = TX.cardAtlas();
    this.cardFront = new THREE.MeshStandardMaterial({ map: this.atlas, roughness: 0.45 });
    this.cardGeoCache = {};
    // chips
    this.chipMats = {};
    this.chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 28);
    // dice
    const pips = { 1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]], 4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]], 5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]], 6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]] };
    const faceMat = v => new THREE.MeshPhysicalMaterial({ map: TX.canvasTex(128, 128, g => { g.fillStyle = '#d4101f'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff'; for (const [x, y] of pips[v]) { g.beginPath(); g.arc(x * 128, y * 128, 11, 0, 7); g.fill(); } }), roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.93 });
    // material order: +x, -x, +y, -y, +z, -z
    this.diceMats = [3, 4, 1, 6, 2, 5].map(faceMat);
    this.diceGeo = new RoundedBoxGeometry(0.036, 0.036, 0.036, 3, 0.005);   // ~2x real dice so pips read from the rail
    this.dice = [];
  }

  td(o) { return tableData.find(t => t.o === o); }
  L(td, x, y, z) { return td.frame.localToWorld(new THREE.Vector3(x, y, z)); }

  tween(dur, fn) {
    return new Promise(res => this.tweens.push({ t: 0, dur, fn, res }));
  }

  update(dt) {
    this.t += dt;
    this.tweens = this.tweens.filter(tw => {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k, dt);
      if (k >= 1) { tw.res(); return false; }
      return true;
    });
    for (const td of tableData) {
      if (td.kind === 'roulette' && td.wheel && !td.busy) {
        const { rotor, ball } = td.wheel.userData;
        rotor.rotation.y += dt * td.spin;
        const a = (td.restPocket ?? 1.1) - rotor.rotation.y;
        ball.position.set(Math.cos(a) * 0.3, 0.075, Math.sin(a) * 0.3);
      }
      if (td.kind === 'bigsix' && !td.busy) td.wheel.rotation.z += dt * 0.12;
    }
    if (this.slot) this.slot.screen.update(dt), this.slot.screen.draw();
  }

  // -------------------------------------------------------------------------
  // Seated / standing camera views
  // -------------------------------------------------------------------------
  seatView(o) {
    if (o.type === 'slots') {
      const f = objFrame(o); f.updateMatrixWorld(true);
      const big = !!o.big;
      return { pos: f.localToWorld(new THREE.Vector3(0.22, big ? 1.85 : 1.62, big ? 1.2 : 0.98)), look: f.localToWorld(new THREE.Vector3(0, big ? 1.5 : 1.36, 0.1)), fov: 50 };
    }
    const td = this.td(o);
    if (!td) return null;
    if (td.kind === 'bigsix') return { pos: this.L(td, 0.55, 2.0, 3.4), look: this.L(td, 0, 2.45, 0), fov: 55 };
    if (td.kind === 'craps') return { pos: this.L(td, 0.2, 1.62, td.d / 2 + 0.55), look: this.L(td, 0, td.feltY, -0.15), fov: 55 };
    if (td.kind === 'roulette') return { pos: this.L(td, 0.15, 1.65, td.d / 2 + 0.95), look: this.L(td, -0.2, td.feltY, -0.05), fov: 56 };
    return { pos: this.L(td, 0.04, 1.5, td.d * 0.5 + 0.42), look: this.L(td, 0, td.feltY, td.d * 0.02), fov: 52 };
  }

  // Close-up on the roulette wheel while it spins (like GTA Online)
  wheelView(o) {
    const td = this.td(o);
    if (!td || !td.wheel) return this.seatView(o);
    const c = td.wheel.getWorldPosition(new THREE.Vector3());
    const off = new THREE.Vector3(0.3, 0.85, 0.7).applyQuaternion(td.frame.quaternion);
    return { pos: c.clone().add(off), look: c.clone().add(new THREE.Vector3(0, 0.02, 0)), fov: 44 };
  }

  // -------------------------------------------------------------------------
  // Cards
  // -------------------------------------------------------------------------
  makeCard(card) {
    const g = new THREE.Group();
    const uv = TX.cardUV(card.r, TX.SUITS[['♠', '♥', '♦', '♣'].indexOf(card.s)] || card.s);
    const key = card.r + card.s;
    const mk = (u) => {
      const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
      const a = geo.attributes.uv;
      a.setXY(0, u.u0, u.v1); a.setXY(1, u.u1, u.v1); a.setXY(2, u.u0, u.v0); a.setXY(3, u.u1, u.v0);
      geo.rotateX(-Math.PI / 2);
      return geo;
    };
    if (!this.cardGeoCache[key]) this.cardGeoCache[key] = mk(uv);
    if (!this.cardGeoCache.back) { const b = mk(TX.cardUV('back')); b.rotateZ(Math.PI); this.cardGeoCache.back = b; }
    const front = new THREE.Mesh(this.cardGeoCache[key], this.cardFront);
    const back = new THREE.Mesh(this.cardGeoCache.back, this.cardFront);
    front.position.y = 0.0004; back.position.y = -0.0004;
    front.castShadow = back.castShadow = true;
    g.add(front, back);
    return g;
  }

  cardSpot(td, hand, idx) {
    const y = td.feltY + 0.003 + idx * 0.0008;
    if (td.kind === 'baccarat' || td.kind === 'vip' && td.o.type === 'baccarat_hl') {
      const baseX = hand === 'player' ? -0.36 : 0.1;
      return this.L(td, baseX + idx * 0.105, y, td.d * 0.02);
    }
    if (hand === 'dealer') return this.L(td, -0.1 + idx * 0.075, y, -td.d * 0.1);
    return this.L(td, -0.06 + idx * 0.042, y, td.d * 0.22 - idx * 0.022);
  }

  async deal(o, hand, idx, card, faceUp = true) {
    const td = this.td(o); if (!td) return;
    const c = this.makeCard(card);
    const from = this.L(td, td.w * 0.3, td.feltY + 0.1, -td.d * 0.25);
    const to = this.cardSpot(td, hand, idx);
    c.position.copy(from);
    const yaw = td.frame.rotation.y + (hand === 'dealer' ? 0 : (Math.random() - 0.5) * 0.12);
    c.rotation.set(0, yaw, Math.PI);
    this.scene.add(c);
    td.cards.push(c);
    c.userData = { hand, idx, faceUp };
    await this.tween(0.42, k => {
      const e = easeOut(k);
      c.position.lerpVectors(from, to, e);
      c.position.y += Math.sin(k * Math.PI) * 0.12;
      c.rotation.z = faceUp ? Math.PI * (1 - e) : Math.PI;
    });
  }

  async flip(o, hand, idx) {
    const td = this.td(o); if (!td) return;
    const c = td.cards.find(x => x.userData.hand === hand && x.userData.idx === idx);
    if (!c || c.userData.faceUp) return;
    c.userData.faceUp = true;
    const y0 = c.position.y;
    await this.tween(0.35, k => { c.rotation.z = Math.PI * (1 - ease(k)); c.position.y = y0 + Math.sin(k * Math.PI) * 0.05; });
  }

  async clear(o) {
    const td = this.td(o); if (!td) return;
    const cards = td.cards.splice(0);
    const to = this.L(td, -td.w * 0.3, td.feltY + 0.05, -td.d * 0.28);
    const starts = cards.map(c => c.position.clone());
    await this.tween(0.45, k => cards.forEach((c, i) => c.position.lerpVectors(starts[i], to, ease(k))));
    cards.forEach(c => this.scene.remove(c));
    await this.clearChips(o);
  }

  // -------------------------------------------------------------------------
  // Chips
  // -------------------------------------------------------------------------
  chipMat(v) {
    if (!this.chipMats[v]) this.chipMats[v] = [
      new THREE.MeshStandardMaterial({ map: TX.chipEdgeTex(v), roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ map: TX.chipFaceTex(v), roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: TX.chipFaceTex(v), roughness: 0.35 }),
    ];
    return this.chipMats[v];
  }
  stack(amount, maxStacks = 5) {
    const g = new THREE.Group();
    let left = Math.round(amount), s = 0, n = 0;
    for (const d of DENOMS) {
      let count = Math.floor(left / d);
      if (!count) continue;
      count = Math.min(count, 14);
      left -= count * d;
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(this.chipGeo, this.chipMat(d));
        m.position.set((s % 3) * CHIP_R * 2.15, CHIP_H / 2 + i * CHIP_H, Math.floor(s / 3) * CHIP_R * 2.15);
        m.rotation.y = Math.random() * 6;
        m.castShadow = true;
        g.add(m); n++;
      }
      s++;
      if (s >= maxStacks) break;
    }
    return g;
  }
  betSpot(td) {
    if (td.kind === 'roulette' || td.kind === 'craps' || td.kind === 'bigsix') return null;
    if (td.kind === 'baccarat' || td.o.type === 'baccarat_hl') return this.L(td, 0, td.feltY + 0.001, td.d * 0.3);
    return this.L(td, 0, td.feltY + 0.001, td.d * 0.36);
  }
  // Baccarat felt bands (see tex.js feltTex): TIE, BANKER and PLAYER arcs
  baccaratSpot(o, side) {
    const td = this.td(o); if (!td) return null;
    const z = { tie: 0.15, banker: 0.29, player: 0.44 }[side] ?? 0.44;
    return this.L(td, 0.14, td.feltY + 0.001, td.d * z);
  }
  async placeBet(o, amount, at) {
    const td = this.td(o); if (!td) return;
    const spot = at || this.betSpot(td) || this.L(td, 0, td.feltY + 0.001, td.d * 0.3);
    const st = this.stack(amount);
    st.rotation.y = td.frame.rotation.y;
    const from = this.L(td, 0.15, td.feltY + 0.25, td.d * 0.55 + 0.3);
    st.position.copy(from);
    this.scene.add(st);
    td.chips.push(st);
    await this.tween(0.35, k => { st.position.lerpVectors(from, spot, easeOut(k)); });
  }
  async resolveChips(o, won, payout) {
    const td = this.td(o); if (!td) return;
    if (won && payout > 0) {
      const spot = (td.chips[0] ? td.chips[0].position.clone() : this.L(td, 0, td.feltY, td.d * 0.3)).add(new THREE.Vector3(0.08, 0, 0).applyQuaternion(td.frame.quaternion));
      const pay = this.stack(payout);
      pay.rotation.y = td.frame.rotation.y;
      const from = this.L(td, 0, td.feltY + 0.05, -td.d * 0.3);
      this.scene.add(pay); td.chips.push(pay);
      await this.tween(0.4, k => pay.position.lerpVectors(from, spot, easeOut(k)));
    }
    const to = won ? this.L(td, 0.2, td.feltY + 0.2, td.d * 0.55 + 0.4) : this.L(td, 0, td.feltY + 0.05, -td.d * 0.3);
    const chips = td.chips.splice(0);
    const starts = chips.map(c => c.position.clone());
    await this.tween(0.5, k => chips.forEach((c, i) => c.position.lerpVectors(starts[i], to, ease(k))));
    chips.forEach(c => this.scene.remove(c));
  }
  async clearChips(o) {
    const td = this.td(o); if (!td) return;
    td.chips.splice(0).forEach(c => this.scene.remove(c));
  }

  // -------------------------------------------------------------------------
  // Roulette
  // -------------------------------------------------------------------------
  roulettePoint(td, key, num) {
    // felt texture: 2048 x 1024, layout constants from tex.js rouletteFeltTex
    const x0 = 560, y0 = 170, cw = 102, ch = 170;
    let cx, cy;
    const outs = { low: 0, even: 1, red: 2, black: 3, odd: 4, high: 5 };
    if (key === 'straight') {
      if (num === 0) { cx = x0 - 61; cy = y0 + ch * 0.75; }
      else if (num === -1) { cx = x0 - 61; cy = y0 + ch * 2.25; }
      else { const c = Math.floor((num - 1) / 3), r = 2 - ((num - 1) % 3); cx = x0 + c * cw + cw / 2; cy = y0 + r * ch + ch / 2; }
    } else if (key in outs) { cx = x0 + outs[key] * cw * 2 + cw; cy = y0 + ch * 3 + 165; }
    else { const i = +key.slice(1) - 1; cx = x0 + i * cw * 4 + cw * 2; cy = y0 + ch * 3 + 55; }
    const pw = td.w * 0.96, pd = td.d * 0.92;
    return this.L(td, (cx / 2048 - 0.5) * pw, td.feltY + 0.001, (cy / 1024 - 0.5) * pd);
  }
  async rouletteBet(o, key, num, amount) {
    const td = this.td(o); if (!td) return;
    await this.placeBet(o, amount, this.roulettePoint(td, key, num));
  }
  // Spin the wheel; the ball comes to rest in the pocket for `number` (-1 = 00)
  async rouletteSpin(o, number, dur = 6.5) {
    const td = this.td(o); if (!td || !td.wheel) return;
    td.busy = true;
    const { rotor, ball } = td.wheel.userData;
    const i = ROULETTE_ORDER.indexOf(number);
    const pocketA = ((i + 0.5) / 38) * Math.PI * 2 - Math.PI / 2;
    const rot0 = rotor.rotation.y;
    const rotSpeed = 2.2;
    let ballA = Math.random() * 6.28;
    const landT = 0.72;
    await this.tween(dur, (k, dt) => {
      // rotor decelerates
      rotor.rotation.y = rot0 + rotSpeed * dur * (k - k * k / 2);
      if (k < landT) {
        const kk = k / landT;
        const sp = (1 - kk) * 14 + 2;               // ball speed (rad/s) opposite to rotor
        ballA -= sp * dt;
        const r = 0.41 - Math.max(0, kk - 0.75) * 0.3;
        const bounce = kk > 0.8 ? Math.abs(Math.sin(kk * 60)) * 0.012 * (1 - kk) * 5 : 0;
        ball.position.set(Math.cos(ballA) * r, 0.085 - Math.max(0, kk - 0.75) * 0.03 + bounce, Math.sin(ballA) * r);
      } else {
        // locked into the pocket, travelling with the rotor
        const target = pocketA - rotor.rotation.y;
        const m = Math.min(1, (k - landT) / 0.08);
        let d = target - ballA; d = Math.atan2(Math.sin(d), Math.cos(d));
        const a = ballA + d * m;
        if (m >= 1) ballA = target;
        ball.position.set(Math.cos(a) * 0.3, 0.075, Math.sin(a) * 0.3);
      }
    });
    td.restPocket = pocketA;
    td.busy = false;
  }

  // -------------------------------------------------------------------------
  // Craps dice
  // -------------------------------------------------------------------------
  faceQuat(v) {
    const e = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] }[v];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28).multiply(q);
  }
  async throwDice(o, a, b) {
    const td = this.td(o); if (!td) return;
    this.dice.forEach(d => this.scene.remove(d));
    this.dice = [a, b].map(() => { const m = new THREE.Mesh(this.diceGeo, this.diceMats); m.castShadow = true; this.scene.add(m); return m; });
    const y = td.feltY + 0.018;
    const starts = [this.L(td, -0.06, y + 0.3, td.d / 2 - 0.1), this.L(td, 0.06, y + 0.3, td.d / 2 - 0.1)];
    const wall = [this.L(td, -0.15 + Math.random() * 0.1, y + 0.02, -td.d / 2 + 0.05), this.L(td, 0.1 + Math.random() * 0.1, y + 0.02, -td.d / 2 + 0.05)];
    const ends = [this.L(td, -0.2 + Math.random() * 0.2, y, -td.d * 0.15 + Math.random() * 0.2), this.L(td, 0.05 + Math.random() * 0.25, y, -td.d * 0.1 + Math.random() * 0.2)];
    const finals = [this.faceQuat(a), this.faceQuat(b)];
    const spins = this.dice.map(() => new THREE.Vector3(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10));
    await this.tween(1.5, (k, dt) => {
      this.dice.forEach((d, i) => {
        if (k < 0.5) { const kk = k / 0.5; d.position.lerpVectors(starts[i], wall[i], kk); d.position.y += Math.sin(kk * Math.PI) * 0.15; }
        else { const kk = (k - 0.5) / 0.5; d.position.lerpVectors(wall[i], ends[i], easeOut(kk)); d.position.y = y + Math.abs(Math.sin(kk * Math.PI * 3)) * 0.05 * (1 - kk); }
        if (k < 0.8) { d.rotation.x += spins[i].x * dt * (1 - k); d.rotation.y += spins[i].y * dt * (1 - k); d.rotation.z += spins[i].z * dt * (1 - k); }
        else d.quaternion.slerp(finals[i], Math.min(1, (k - 0.8) / 0.2 + 0.2));
      });
    });
    this.dice.forEach((d, i) => d.quaternion.copy(finals[i]));
  }
  puck(o, point) {
    const td = this.td(o); if (!td) return;
    if (!td.puck) {
      const on = TX.textTex(['ON'], { w: 128, h: 128, bg: '#fff', color: '#111' });
      const off = TX.textTex(['OFF'], { w: 128, h: 128, bg: '#111', color: '#fff' });
      td.puck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 24), [new THREE.MeshStandardMaterial({ color: '#888' }), new THREE.MeshStandardMaterial({ map: on }), new THREE.MeshStandardMaterial({ map: off })]);
      td.puck.castShadow = true; this.scene.add(td.puck);
    }
    const nums = [4, 5, 6, 8, 9, 10];
    const i = nums.indexOf(point);
    const x = i >= 0 ? (420 + i * 200 + 100) / 2048 - 0.5 : -0.35;
    td.puck.position.copy(this.L(td, x * td.w, td.feltY + 0.007, (i >= 0 ? 150 / 1024 - 0.5 : -0.3) * td.d));
    td.puck.rotation.x = i >= 0 ? 0 : Math.PI;
  }

  // -------------------------------------------------------------------------
  // Big Six
  // -------------------------------------------------------------------------
  bigSixOrder(o) { const td = this.td(o); return td ? td.order : null; }
  async bigSixSpin(o, index, dur = 5.5) {
    const td = this.td(o); if (!td) return;
    td.busy = true;
    const a = ((index + 0.5) / 54) * Math.PI * 2 - Math.PI / 2;
    const cur = td.wheel.rotation.z;
    let target = Math.PI / 2 + a;
    while (target < cur + Math.PI * 6) target += Math.PI * 2;
    const clap = td.clapper;
    await this.tween(dur, k => {
      td.wheel.rotation.z = cur + (target - cur) * easeOut(k);
      if (clap) clap.rotation.z = Math.sin(td.wheel.rotation.z * 54) * 0.25 * (1 - k);
    });
    td.busy = false;
  }

  // -------------------------------------------------------------------------
  // Slot machine you're sitting at: its own 3-reel screen
  // -------------------------------------------------------------------------
  slotOpen(o) {
    this.slotClose();
    const f = objFrame(o); f.updateMatrixWorld(true);
    const s = o.big ? 1.35 : 1;
    const screen = new TX.SlotScreen(o.theme, 640, 520, 3);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62 * s, 0.5 * s), new THREE.MeshStandardMaterial({ map: screen.tex, emissive: '#fff', emissiveMap: screen.tex, emissiveIntensity: 1.05, color: '#000' }));
    m.position.set(0, 1.42 * (o.big ? 1.05 : 1), 0.157 * s);
    m.rotation.x = -0.2;
    f.add(m);
    this.scene.add(f);
    screen.message = 'PRESS SPIN';
    screen.draw();
    this.slot = { o, frame: f, screen };
  }
  slotClose() { if (this.slot) { this.scene.remove(this.slot.frame); this.slot = null; } }
  async slotSpin(reels, dur = 1.6) {
    if (!this.slot) return;
    const s = this.slot.screen;
    s.spin(reels, dur);
    await this.tween(dur + 0.1, () => {});
  }
  slotMessage(text, flash) { if (this.slot) { this.slot.screen.message = text; if (flash) this.slot.screen.flash = 2; } }
}
