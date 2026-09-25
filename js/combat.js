'use strict';

// ---------------------------------------------------------------------------
// Weapons, robbers, Tony's crew and shootouts
// ---------------------------------------------------------------------------
const WEAPONS = {
  pistol: { name: '9mm Pistol', icon: '🔫', price: 1_500, ammoName: 'rounds', ammoPack: 30, ammoPrice: 90, dmg: 38, cool: 0.35 },
  shotgun: { name: 'Pump Shotgun', icon: '💥', price: 3_200, ammoName: 'shells', ammoPack: 16, ammoPrice: 120, dmg: 95, cool: 0.95 },
};
const ARMOR_PRICE = 900;

let fx = [];          // short-lived visual effects (tracers, muzzle flashes)
let fightCtx = null;  // { kind: 'robber' | 'thug', loot, inside }

function resetCombat() {
  fx = [];
  fightCtx = null;
}

function hostiles() { return npcs.filter(n => n.hostile && n.pose !== 'down'); }
function activeOf(role) { return npcs.filter(n => n.role === role && n.state !== 'gone' && n.state !== 'down'); }
function removeNPC(n) { n.state = 'gone'; npcs = npcs.filter(x => x !== n); }

// ---------------------------------------------------------------------------
// Sound (tiny WebAudio synth so there are no files to load)
// ---------------------------------------------------------------------------
let audioCtx = null;
function sfx(kind) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const len = kind === 'shotgun' ? 0.45 : 0.25;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, kind === 'hurt' ? 1 : 3);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const f = audioCtx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = kind === 'hurt' ? 500 : kind === 'shotgun' ? 1400 : 2400;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(kind === 'far' ? 0.25 : 0.6, t);
    src.connect(f); f.connect(g); g.connect(audioCtx.destination);
    src.start(t);
  } catch (e) { /* audio unavailable */ }
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------
function isNight() { const h = (S.minutes % 1440) / 60; return h >= 20 || h < 6; }

function spawnRobber() {
  const fromLeft = player.x > 900;
  const x = fromLeft ? Math.max(10, player.x - 650) : Math.min(1790, player.x + 650);
  const r = makeNPC('robber', x, 1112, { name: 'Masked man', talk: false, speed: 140, state: 'approach', hp: 100 });
  npcs.push(r);
  toast('👀 Someone in a hoodie is walking straight toward you…', 'danger', 4000);
}

function spawnThugs(count) {
  for (let i = 0; i < count; i++) {
    const t = makeNPC('thug', 880 + i * 40, 1112, { name: "Tony's guy", talk: false, speed: 175 + 15 * S.shark.overdueDays, state: 'approach', hp: 150, t: 0 });
    npcs.push(t);
  }
  toast(`🕴️ ${count > 1 ? 'Two of Tony\'s guys just showed up' : 'One of Tony\'s guys just showed up'}… and they're looking for you.`, 'danger', 5000);
}

// ---------------------------------------------------------------------------
// Per-frame update
// ---------------------------------------------------------------------------
function updateCombat(dt) {
  fx = fx.filter(f => (f.t -= dt) > 0);

  // Robbers prey on people outside, especially at night and after a big win
  if (isOutside() && S.minutes >= S.nextRobber && !activeOf('robber').length) {
    let chance = isNight() ? 0.55 : 0.2;
    if (S.marked) chance += 0.35;
    if (S.cash < 200) chance *= 0.3;
    if (Math.random() < chance) { spawnRobber(); S.marked = false; }
    S.nextRobber = S.minutes + randInt(90, 180);
  }

  // Tony's crew
  const k = S.shark;
  if (sharkOverdue() && k.nextThug !== null && S.minutes >= k.nextThug && !activeOf('thug').length) {
    spawnThugs(S.tonyAngry > 0 ? 2 : 1);
    k.nextThug = S.minutes + Math.max(60, 240 - 50 * k.overdueDays - 40 * S.tonyAngry);
  }

  for (const n of [...npcs]) {
    if (n.role !== 'robber' && n.role !== 'thug') continue;
    const vx = player.x - n.x, vy = player.y - n.y, d = Math.hypot(vx, vy) || 1;
    switch (n.state) {
      case 'approach': {
        n.pose = 'walk';
        if (n.role === 'robber' && player.y < CASINO_BOTTOM - 20) { n.state = 'leave'; break; } // guards at the door
        if (n.role === 'thug' && !sharkOverdue()) { n.state = 'leave'; break; }
        n.t = (n.t || 0) + dt;
        if (d < 30 || (n.role === 'thug' && n.t > 16)) { confront(n); break; }
        n.face = Math.atan2(vx, vy);
        const sp = n.speed * dt;
        if (!moveEntity(n, vx / d * sp, vy / d * sp, 10)) moveEntity(n, (Math.random() - 0.5) * sp * 3, (Math.random() - 0.5) * sp * 3, 10);
        break;
      }
      case 'fight': {
        n.face = Math.atan2(vx, vy);
        n.pose = 'aim';
        const sp = 90 * dt;
        if (d > 200) moveEntity(n, vx / d * sp, vy / d * sp, 10);
        else if (d < 90) moveEntity(n, -vx / d * sp, -vy / d * sp, 10);
        else moveEntity(n, -vy / d * sp * 0.6 * (n.strafe || 1), vx / d * sp * 0.6 * (n.strafe || 1), 10);
        if (Math.random() < dt * 0.4) n.strafe = -(n.strafe || 1);
        n.cool -= dt;
        if (n.cool <= 0 && !blocked()) {
          n.cool = rand(0.9, 1.7);
          const acc = (n.role === 'thug' ? 0.45 : 0.38) * (d < 160 ? 1 : 0.7) * (player.moving ? 0.75 : 1);
          const hit = Math.random() < acc;
          fx.push(hit ? { from: n, to: player, x1: n.x, y1: n.y, x2: player.x, y2: player.y, t: 0.07, enemy: true }
            : { from: n, x1: n.x, y1: n.y, x2: player.x + rand(-40, 40), y2: player.y + rand(-40, 40), t: 0.07, enemy: true });
          sfx('far');
          if (hit) damagePlayer(n.role === 'thug' ? randInt(12, 20) : randInt(9, 16));
        }
        if (n.role === 'robber' && n.hp < 40 && Math.random() < dt * 0.8) {
          n.state = 'flee'; n.hostile = false;
          toast('The robber panics and runs off.', 'win');
          checkFightOver();
        }
        break;
      }
      case 'leave': case 'flee': {
        n.pose = 'run';
        const ex = n.role === 'thug' ? 900 : (n.x < 900 ? -40 : 1840), ey = 1112;
        const ux = ex - n.x, uy = ey - n.y, ud = Math.hypot(ux, uy);
        if (ud < 12) { removeNPC(n); break; }
        n.face = Math.atan2(ux, uy);
        n.x += ux / ud * 190 * dt; n.y += uy / ud * 190 * dt;
        break;
      }
      case 'down':
        n.downT -= dt;
        if (n.downT <= 0) removeNPC(n);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Confrontations
// ---------------------------------------------------------------------------
function bestWeapon() {
  if (S.weapons.shotgun && S.ammo.shotgun > 0) return 'shotgun';
  if (S.weapons.pistol && S.ammo.pistol > 0) return 'pistol';
  return null;
}

function confront(n) {
  leaveGame(true);
  if (blocked()) { closeModal(true); closePhone(); }
  clearMovement();
  n.face = Math.atan2(player.x - n.x, player.y - n.y);
  player.face = Math.atan2(n.x - player.x, n.y - player.y);
  n.state = 'confront';
  n.pose = 'aim';
  const armed = bestWeapon();
  if (n.role === 'thug') return confrontThug(n, armed);

  if (S.cash <= 0) {
    n.state = 'leave';
    S.health = clamp(S.health - 10, 1, 100);
    infoDialog('🥷 Mugged… for nothing', '<p>"Empty pockets? Useless." He shoves you to the ground and walks off.</p><p>Health −10</p>');
    afterAction();
    return;
  }
  const loot = Math.round(Math.min(S.cash, clamp(S.cash * rand(0.08, 0.15), 300, S.marked ? 40_000 : 25_000)));
  const handOver = () => {
    S.cash -= loot; S.stats.robbed++; S.stats.robbedAmount += loot;
    n.state = 'flee';
    closeModal(true);
    toast(`🥷 He grabs ${fmt(loot)} and disappears into the night.`, 'danger', 5000);
    afterAction();
  };
  const buttons = [
    { label: `Hand over ${fmt(loot)}`, fn: handOver },
    { label: 'Run for it', fn: () => {
      closeModal(true);
      if (Math.random() < 0.4) { n.state = 'leave'; toast('🏃 You got away!', 'win'); return; }
      sfx('hurt');
      if (damagePlayer(25, true, loot)) return;
      toast('He catches you, hits you hard, and takes the money.', 'danger', 5000);
      handOver();
    } },
    { label: 'Fight with your fists', fn: () => {
      closeModal(true);
      if (Math.random() < 0.25) { n.state = 'flee'; toast('👊 You land a punch and he runs off!', 'win'); S.stats.fightsWon++; return; }
      sfx('hurt');
      if (damagePlayer(35, true, loot)) return;
      handOver();
    } },
  ];
  if (armed) buttons.unshift({ label: `Draw your ${WEAPONS[armed].name}`, cls: 'danger', fn: () => startFight([n], 'robber', loot) });
  infoDialog('🥷 "Your money. NOW."', `<p>A masked man pulls a gun on you. "Nice and easy. Give me the cash."</p>
    <p>You're carrying <b>${fmt(S.cash)}</b>.</p>
    ${armed ? '' : '<p class="muted">You don\'t have a weapon. The gun store is on the Strip.</p>'}`, buttons);
  lockDialog();
}

// A confrontation can't be dismissed: you have to pick an option
function lockDialog() {
  $('#modal-close').classList.add('hidden');
  const leave = [...document.querySelectorAll('#modal-body .btn.ghost')].pop();
  if (leave) leave.remove();
  modalOnClose = () => false;
}

function confrontThug(n, armed) {
  const others = activeOf('thug');
  if (!armed) { others.forEach(t => { t.state = 'leave'; }); harass(); return; }
  infoDialog("🕴️ Tony's crew found you", `<p>"Tony wants his money. You can make this easy, or you can make this hard."</p>
    <p>You owe Tony <b>${fmt(S.shark.owed)}</b>. You have a ${WEAPONS[armed].name} on you.</p>
    <p class="muted">Fighting back won't erase the debt. Tony will be furious.</p>`, [
    { label: 'Take what\'s coming', fn: () => { others.forEach(t => { t.state = 'leave'; }); closeModal(true); harass(); } },
    { label: `Draw your ${WEAPONS[armed].name}`, cls: 'danger', fn: () => {
      if (others.length < 2) {
        const extra = makeNPC('thug', n.x + 60, n.y + 20, { name: "Tony's guy", talk: false, speed: 170, hp: 150 });
        npcs.push(extra); others.push(extra);
      }
      startFight(others, 'thug');
    } },
  ]);
  lockDialog();
}

function startFight(list, kind, loot = 0) {
  closeModal(true);
  fightCtx = { kind, loot, inside: !isOutside() };
  list.forEach(n => { n.state = 'fight'; n.hostile = true; n.talk = false; n.cool = rand(0.7, 1.4); n.strafe = Math.random() < 0.5 ? 1 : -1; });
  S.equipped = bestWeapon();
  toast('⚠️ SHOOTOUT! Hold <b>right mouse</b> (or AIM) to aim, <b>left click</b>, <b>F</b> or FIRE to shoot. <b>Q</b> switches weapon. Keep moving!', 'danger', 6000);
  updateWeaponHUD();
}

function checkFightOver() {
  if (!fightCtx || hostiles().length) return;
  const ctx = fightCtx;
  fightCtx = null;
  if (ctx.kind === 'robber') {
    advanceTime(60);
    infoDialog('🚓 Police on scene', `<p>Police arrive and take your statement. They rule it self-defense.</p>
      <p>That took an hour. You kept your ${fmt(S.cash)}… this time.</p>
      <p class="muted">You fought off a robber, but the casino is still taking your money one bet at a time.</p>`);
  } else {
    const k = S.shark;
    S.tonyAngry++;
    const fee = k.owed * 0.25;
    k.owed += fee;
    k.nextThug = S.minutes + 90;
    addMsg('🦈 Tony', `You put my guys in the hospital?! Your debt just went up ${fmt(fee)} for "damages". Now I send more. You can't shoot your way out of what you owe me.`);
    infoDialog('🕴️ You fought off Tony\'s crew', `<p>They're down, for now. But you still owe Tony <b class="lose">${fmt(k.owed)}</b> (+25% "damages").</p>
      <p class="muted">Violence doesn't cancel a debt. It only makes the next visit worse.</p>`);
  }
  afterAction();
}

// ---------------------------------------------------------------------------
// Player weapons
// ---------------------------------------------------------------------------
let fireCool = 0;
setInterval(() => { fireCool = Math.max(0, fireCool - 0.05); }, 50);

function cycleWeapon() {
  const owned = [null, ...Object.keys(WEAPONS).filter(w => S.weapons[w])];
  if (owned.length === 1) { toast('You don\'t own a weapon. There\'s a gun store on the Strip.'); return; }
  const i = owned.indexOf(S.equipped);
  S.equipped = owned[(i + 1) % owned.length];
  toast(S.equipped ? `${WEAPONS[S.equipped].icon} ${WEAPONS[S.equipped].name} equipped` : '✋ Weapon holstered');
  updateWeaponHUD();
}

function fireWeapon(target) {
  if (blocked()) return;
  if (!S.equipped) {
    if (hostiles().length) { S.equipped = bestWeapon(); updateWeaponHUD(); }
    if (!S.equipped) { if (hostiles().length) toast('No weapon or ammo!', 'danger'); return; }
  }
  const w = WEAPONS[S.equipped];
  if (fireCool > 0) return;
  if (S.ammo[S.equipped] <= 0) { toast(`Out of ${w.ammoName}!`, 'danger'); return; }
  const foes = hostiles();
  const r3 = window.Render3D && Render3D.ready;
  let aimed = false;
  if ((!target || !target.hostile) && r3) { target = Render3D.aimPick(view.aiming ? 0.1 : 0.22); aimed = !!target && view.aiming; }
  if (!target || !target.hostile) {
    // soft lock-on to the nearest threat when not aiming precisely
    target = null;
    let bd = view.aiming && r3 ? 0 : 480;
    foes.forEach(f => { const d = Math.hypot(f.x - player.x, f.y - player.y); if (d < bd) { bd = d; target = f; } });
  }
  S.ammo[S.equipped]--;
  fireCool = w.cool;
  player.shootT = 0.5;
  sfx(S.equipped);
  updateWeaponHUD();
  if (!target) {
    const dir = view.aiming || r3 ? view.yaw + Math.PI : player.face;
    player.face = dir;
    const fx2 = player.x + Math.sin(dir) * 300, fy2 = player.y + Math.cos(dir) * 300;
    fx.push({ from: player, x1: player.x, y1: player.y, x2: fx2, y2: fy2, y3d: Math.max(0.05, 1.4 - Math.tan(view.pitch) * 15), t: 0.07 });
    if (!foes.length) recklessDischarge();
    return;
  }
  player.face = Math.atan2(target.x - player.x, target.y - player.y);
  const d = Math.hypot(target.x - player.x, target.y - player.y);
  let chance = S.equipped === 'shotgun' ? (d < 150 ? 0.92 : d < 300 ? 0.5 : 0.15) : clamp(0.85 - d / 900, 0.25, 0.85);
  if (aimed) chance = Math.min(0.97, chance + 0.12);
  const hit = Math.random() < chance;
  fx.push(hit ? { from: player, to: target, x1: player.x, y1: player.y, x2: target.x, y2: target.y, t: 0.07 }
    : { from: player, x1: player.x, y1: player.y, x2: target.x + rand(-35, 35), y2: target.y + rand(-35, 35), t: 0.07 });
  if (!hit) return;
  target.hp -= w.dmg * rand(0.85, 1.15);
  target.hitT = 0.2;
  if (target.hp <= 0) {
    target.hp = 0; target.hostile = false; target.state = 'down'; target.pose = 'down'; target.downT = 8;
    S.stats.fightsWon++;
    checkFightOver();
  }
}

function recklessDischarge() {
  const inside = !isOutside();
  const fine = inside ? 5_000 : 1_000;
  const paid = Math.min(S.cash, fine);
  S.cash -= paid;
  S.medical += fine - paid; // unpaid fines pile onto your debts too
  if (inside) {
    S.weapons = { pistol: false, shotgun: false };
    S.ammo = { pistol: 0, shotgun: 0 };
    S.equipped = null;
    advanceTime(120);
    updateWeaponHUD();
    infoDialog('🚨 Security tackles you', `<p>Firing a gun on the casino floor? Security wrestles you to the ground and hands you over to the police.</p>
      <p>Your weapons are confiscated, you're held for 2 hours and fined <b>${fmt(fine)}</b>.</p>`);
  } else {
    toast(`🚓 People scream and scatter. Police fine you ${fmt(fine)} for firing a gun in public.`, 'danger', 5000);
  }
  afterAction();
}

function damagePlayer(dmg, silent, koLoot = 0) {
  if (S.armor > 0) {
    const absorbed = Math.min(S.armor, dmg * 0.6);
    S.armor -= absorbed; dmg -= absorbed;
  }
  S.health = clamp(S.health - dmg, 0, 100);
  if (!silent) sfx('hurt');
  const h = $('#hurt');
  h.classList.remove('flash'); void h.offsetWidth; h.classList.add('flash');
  if (S.health <= 0) {
    // everyone takes what they came for and leaves
    const ctx = fightCtx;
    fightCtx = null;
    npcs.forEach(n => { if (n.role === 'robber' || n.role === 'thug') { n.hostile = false; n.state = 'leave'; } });
    const loot = ctx && ctx.kind === 'robber' ? ctx.loot * 2 : koLoot;
    if (loot) {
      const take = Math.min(S.cash, loot);
      S.cash -= take; S.stats.robbed++; S.stats.robbedAmount += take;
    }
    if (ctx && ctx.kind === 'thug') S.shark.owed *= 1.1;
    collapse('injury');
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Gun store
// ---------------------------------------------------------------------------
function gunStore() {
  const rows = [];
  Object.entries(WEAPONS).forEach(([id, w]) => {
    if (!S.weapons[id]) rows.push({ label: `${w.icon} ${w.name} — ${fmt(w.price)} (incl. ${w.ammoPack} ${w.ammoName})`, cls: 'primary', fn: () => {
      if (!pay(w.price)) return;
      S.weapons[id] = true; S.ammo[id] += w.ammoPack; S.equipped = id; S.stats.gunSpend += w.price;
      advanceTime(20);
      closeModal(true);
      toast(`${w.icon} You bought a ${w.name}. Press Q to holster/switch, F to fire.`, 'win', 5000);
      lesson('gun', 'A gun might stop a robber, but it can\'t protect you from the house edge. Most of the money you lose here, you hand over willingly.');
      updateWeaponHUD(); afterAction();
    } });
    else rows.push({ label: `${w.ammoPack} ${w.ammoName} — ${fmt(w.ammoPrice)}`, fn: () => {
      if (!pay(w.ammoPrice)) return;
      S.ammo[id] += w.ammoPack; S.stats.gunSpend += w.ammoPrice;
      closeModal(true); toast(`Bought ${w.ammoPack} ${w.ammoName}.`); updateWeaponHUD(); afterAction();
    } });
  });
  rows.push({ label: `🦺 Body armor — ${fmt(ARMOR_PRICE)}`, disabled: S.armor >= 100, fn: () => {
    if (!pay(ARMOR_PRICE)) return;
    S.armor = 100; S.stats.gunSpend += ARMOR_PRICE;
    closeModal(true); toast('🦺 Body armor on. It absorbs most of the damage from hits.'); afterAction();
  } });
  infoDialog('🔫 Gun Store', `<p>"Lotta desperate people out there at night. You look like you could use some protection."</p>
    <div class="card-box">
      ${Object.entries(WEAPONS).map(([id, w]) => `<div>${w.icon} ${w.name}: ${S.weapons[id] ? `<b>owned</b>, ${S.ammo[id]} ${w.ammoName}` : 'not owned'}</div>`).join('')}
      <div>🦺 Armor: <b>${Math.round(S.armor)}</b>/100</div>
    </div>${statLine()}`, rows);
}

function updateWeaponHUD() {
  const el = $('#weapon');
  if (!el) return;
  if (!S.equipped) { el.innerHTML = '✋'; el.title = 'Unarmed (Q to switch)'; }
  else {
    const w = WEAPONS[S.equipped];
    el.innerHTML = `${w.icon}<small>${S.ammo[S.equipped]}</small>`;
    el.title = w.name;
  }
  $('#fireBtn').classList.toggle('hidden', !S.equipped);
}
