'use strict';

// ---------------------------------------------------------------------------
// Game feel: sound hooks, camera shake, hit markers, damage vignette, death
// slow-mo, sprint stamina, pause menu, settings, key display and rebinding,
// accessibility (text size, reduced motion, colour-blind palette).
// Everything here wraps existing globals so the original files stay small.
// ---------------------------------------------------------------------------
(function () {
  const wrap = (name, make) => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (...a) { return make(orig, a, this); };
  };
  const play = (n, o) => { if (window.sfxPlay) window.sfxPlay(n, o); };
  const later = (fn, ms) => setTimeout(fn, ms);

  // ---- accessibility settings ---------------------------------------------------------------------------
  const prefersReduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const A11Y = SETTINGS.a11y = Object.assign({ textScale: 1, reduceMotion: prefersReduced, colorblind: false, rumble: true }, SETTINGS.a11y || {});
  function applyA11y() {
    document.documentElement.style.setProperty('--ts', String(A11Y.textScale));
    document.body.classList.toggle('reduce-motion', !!A11Y.reduceMotion);
    document.body.classList.toggle('cb', !!A11Y.colorblind);
    document.body.classList.toggle('ts-big', A11Y.textScale > 1);
  }

  // ---- key bindings (display + rebind) ------------------------------------------------------------------
  const ACTIONS = [
    ['forward', 'Move forward', 'w'], ['back', 'Move back', 's'], ['left', 'Move left', 'a'], ['right', 'Move right', 'd'],
    ['sprint', 'Sprint (hold)', 'shift'], ['walk', 'Toggle walk', 'x'], ['interact', 'Talk / use / sit', 'e'],
    ['phone', 'Phone', 'p'], ['weapon', 'Switch weapon', 'q'], ['fire', 'Fire', 'f'], ['camera', 'Camera distance', 'v'],
  ];
  const KEYNAME = { shift: 'Shift', ' ': 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', enter: 'Enter', tab: 'Tab' };
  const keyLabel = k => KEYNAME[k] || (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1));
  SETTINGS.keymap = SETTINGS.keymap || {};            // action -> custom key
  const customKey = act => SETTINGS.keymap[act] || (ACTIONS.find(a => a[0] === act) || [])[2];
  let remap = {}, blocked = {};
  function rebuildRemap() {
    remap = {}; blocked = {};
    for (const [act, , def] of ACTIONS) {
      const c = SETTINGS.keymap[act];
      if (c && c !== def) { remap[c] = def; blocked[def] = true; }
    }
  }
  rebuildRemap();
  let rebinding = null, synth = false;
  window.addEventListener('keydown', e => {
    if (!rebinding || e.__gm) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const k = e.key.toLowerCase();
    if (k === 'escape') { rebinding.done(); return; }
    const act = rebinding.act;
    // another action that used this key loses it (the swap keeps things unambiguous)
    for (const [a2] of ACTIONS) if (a2 !== act && customKey(a2) === k) SETTINGS.keymap[a2] = '';
    SETTINGS.keymap[act] = k;
    for (const [a2, , d2] of ACTIONS) if (SETTINGS.keymap[a2] === '') delete SETTINGS.keymap[a2];
    saveSettings(); rebuildRemap(); rebinding.done();
  }, true);
  ['keydown', 'keyup'].forEach(type => window.addEventListener(type, e => {
    if (synth || rebinding || e.__gm || (typeof gameSession !== 'undefined' && gameSession)) return;
    if (!Object.keys(remap).length && !Object.keys(blocked).length) return;
    const t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    let to = null;
    if (remap[k]) to = remap[k]; else if (blocked[k]) { e.stopImmediatePropagation(); e.preventDefault(); return; } else return;
    e.stopImmediatePropagation(); e.preventDefault();
    const ev = new KeyboardEvent(type, { key: to === 'shift' ? 'Shift' : to, bubbles: true, cancelable: true, repeat: e.repeat });
    ev.__gm = true; synth = true;
    try { document.body.dispatchEvent(ev); } finally { synth = false; }
  }, true));

  // ---- stamina ----------------------------------------------------------------------------------------------
  const stamina = window.GMStamina = { v: 100, ok: true };
  let stBar = null, stLast = -1;
  function buildStaminaBar() {
    const host = document.querySelector('#hud-radar .hbars');
    if (!host) return;
    stBar = document.createElement('div');
    stBar.id = 'stamina'; stBar.title = 'Stamina'; stBar.innerHTML = '<div></div>';
    host.parentNode.insertBefore(stBar, host.nextSibling);
  }

  // ---- camera shake (read by js/r3d/main.js each frame) ----------------------------------------------------
  let trauma = 0, traumaT = performance.now();
  const shakeScale = () => (A11Y.reduceMotion ? 0.15 : 1);
  function addTrauma(v) { const now = performance.now(); trauma = Math.max(0, trauma - (now - traumaT) / 1000 * 1.8); traumaT = now; trauma = Math.min(1, trauma + v * shakeScale()); }
  function shakeOffset(pos) {
    if (trauma <= 0) return;
    const now = performance.now();
    trauma = Math.max(0, trauma - (now - traumaT) / 1000 * 1.8); traumaT = now;
    if (trauma <= 0) return;
    const m = trauma * trauma * 0.09, t = now / 1000;
    pos.x += (Math.sin(t * 61) + Math.sin(t * 37.7)) * 0.5 * m;
    pos.y += (Math.sin(t * 53.3) + Math.sin(t * 29.1)) * 0.5 * m;
    pos.z += (Math.sin(t * 47.9) + Math.sin(t * 71.3)) * 0.5 * m;
  }

  // ---- overlays: hit marker, low-health vignette, death fade ------------------------------------------------
  let hitEl = null, deathEl = null;
  function buildOverlays() {
    hitEl = document.createElement('div'); hitEl.id = 'hitmarker'; hitEl.innerHTML = '<i></i><i></i><i></i><i></i>'; document.body.appendChild(hitEl);
    const low = document.createElement('div'); low.id = 'lowhp'; document.body.appendChild(low);
    deathEl = document.createElement('div'); deathEl.id = 'deathfx'; document.body.appendChild(deathEl);
    const t = document.getElementById('toasts'); if (t) t.setAttribute('aria-live', 'polite');
    const p = document.getElementById('prompt'); if (p) p.setAttribute('aria-live', 'polite');
  }
  function hitMarker(kill) {
    if (!hitEl) return;
    hitEl.classList.remove('on', 'kill'); void hitEl.offsetWidth; hitEl.classList.add('on'); if (kill) hitEl.classList.add('kill');
  }

  // ---- rumble / pad glue --------------------------------------------------------------------------------------
  const rumble = (strong, weak, ms) => { if (A11Y.rumble && window.GMPad && GMPad.rumble) GMPad.rumble(strong, weak, ms); };

  // ---- time scale (death slow-mo) ----------------------------------------------------------------------------
  const F = window.GMFeel = {
    timeScale: 1, dying: false, shakeOffset, addTrauma, hitMarker, rumble, A11Y, applyA11y,
    interactKey() { return (window.GMPad && GMPad.active) ? 'A' : keyLabel(customKey('interact')).toUpperCase(); },
    keyLabel, customKey, ACTIONS,
  };

  // ---- footsteps + stamina on every world update ---------------------------------------------------------------
  let stepT = 0;
  wrap('updateWorld', (orig, [dt]) => {
    if (F.dying) clearMovement();
    orig(dt * F.timeScale);
    // stamina
    if (player.pose === 'sprint') { stamina.v = Math.max(0, stamina.v - dt * 22); if (stamina.v <= 0 && stamina.ok) { stamina.ok = false; toast('😮‍💨 Out of breath. Catch your wind.', 'info', 1800); } }
    else stamina.v = Math.min(100, stamina.v + dt * (player.moving ? 9 : 16));
    if (!stamina.ok && stamina.v >= 30) stamina.ok = true;
    const r = Math.round(stamina.v / 2);
    if (stBar && r !== stLast) { stLast = r; stBar.firstChild.style.width = stamina.v + '%'; stBar.classList.toggle('show', stamina.v < 99); stBar.classList.toggle('empty', !stamina.ok); }
    // footsteps tied to movement speed
    if (player.moving && !player.seated) {
      stepT -= dt;
      if (stepT <= 0) {
        const p = player.pose;
        stepT = p === 'sprint' ? 0.27 : p === 'run' ? 0.36 : 0.55;
        play('step', { surface: window.audio ? audio.surface : 'carpet', run: p === 'sprint' || p === 'run', pan: (Math.random() - 0.5) * 0.2 });
      }
    } else stepT = Math.min(stepT, 0.05);
  });

  // ---- sound + feel hooks on the game's own functions ---------------------------------------------------------
  let ringNext = false;
  const recentToast = new Map();
  wrap('toast', (orig, [text, kind, ms]) => {
    const now = performance.now(), key = kind + '|' + text;
    if (recentToast.has(key) && now - recentToast.get(key) < 1500) return;
    recentToast.set(key, now);
    if (recentToast.size > 40) for (const [k, t] of recentToast) if (now - t > 3000) recentToast.delete(k);
    if (kind === 'phone') { if (ringNext) { play('phone_ring'); ringNext = false; } else play('notify'); }
    else if (kind === 'danger') play('alert');
    else if (kind === 'win') play('good');
    else if (kind === 'lesson') play('notify_soft');
    else if (kind === 'ach') play('ach');
    return orig(text, kind, ms);
  });
  wrap('addMsg', (orig, [from, text]) => { if (/Tony|Unknown|Marker|Credit/.test(from)) ringNext = true; const r = orig(from, text); ringNext = false; return r; });
  wrap('openModal', (orig, a) => { play('ui_open'); return orig(...a); });
  wrap('closeModal', (orig, a) => { const was = modalOpen; const r = orig(...a); if (was && !modalOpen) play('ui_close'); return r; });
  wrap('openPhone', (orig, a) => { const was = phoneOpen; const r = orig(...a); if (!was && phoneOpen) play('phone_open'); return r; });
  wrap('closePhone', (orig, a) => { const was = phoneOpen; const r = orig(...a); if (was) play('phone_open'); return r; });
  wrap('eat', (orig, a) => { play(a[0] >= a[1] && a[0] > 0 ? 'eat' : 'drink'); return orig(...a); });
  wrap('pay', (orig, a) => { const ok = orig(...a); if (ok && a[0] >= 20) play('register'); return ok; });
  wrap('cycleWeapon', (orig, a) => { const before = S.equipped; const r = orig(...a); if (S.equipped !== before) play(S.equipped ? 'cock' : 'ui_click', { vol: 0.6 }); return r; });
  wrap('newShoe', (orig, a) => { if (typeof gameSession !== 'undefined' && gameSession) play('shuffle'); return orig(...a); });
  wrap('takeStake', (orig, a) => { const ok = orig(...a); if (ok) play('chips', { n: a[0] >= 10000 ? 6 : 3 }); return ok; });
  wrap('startGame', (orig, a) => { const was = typeof gameSession !== 'undefined' && gameSession; const r = orig(...a); if (!was && gameSession) play('chip', { vol: 0.6 }); return r; });
  // buying ammo sounds like a reload; every button gets a soft click
  let ammoSeen = null;
  wrap('updateWeaponHUD', (orig, a) => {
    const tot = S.ammo ? (S.ammo.pistol || 0) + (S.ammo.shotgun || 0) : 0;
    if (ammoSeen !== null && tot > ammoSeen) play('reload');
    ammoSeen = tot;
    return orig(...a);
  });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button') && !e.target.closest('#gu-buttons')) play('ui_click'); }, true);
  wrap('interact', (orig, a) => { const o = a[0]; if (o && ['hotel', 'cashier', 'gunstore', 'pawn', 'busstop'].includes(o.type)) play('door'); return orig(...a); });

  // settle: win / loss cues (slot jingles celebrate even a "win" that is really a loss: that is the point)
  wrap('settle', (orig, [game, bet, returned, edge]) => {
    const profit = orig(game, bet, returned, edge);
    const mult = bet > 0 ? returned / bet : 0;
    if (game === 'Slots') {
      if (mult >= 100) play('jackpot', { force: true });
      else if (mult >= 20) play('slot_win', { level: 3, force: true });
      else if (mult >= 5) play('slot_win', { level: 2, force: true });
      else if (mult >= 1) play('slot_win', { level: 1, force: true });
      else if (mult > 0) play('slot_ldw', { force: true });
    } else if (profit > 0) play(profit >= 25000 ? 'win_big' : 'win_small', { delay: 0.1 });
    else if (profit < 0) play('lose', { delay: 0.1 });
    return profit;
  });

  // per-game action sounds: triggered when the game accepted the bet / action
  function hookGames() {
    const cashNow = () => S.cash;
    const on = (obj, m, fn) => {
      if (!obj || typeof obj[m] !== 'function') return;
      const orig = obj[m];
      obj[m] = function (...a) { const c0 = cashNow(); const r = orig.apply(this, a); try { fn(c0, a); } catch (e) { /* audio must never break a game */ } return r; };
    };
    const staked = c0 => S.cash < c0 - 1e-9;
    const g = () => (typeof gameSession !== 'undefined' ? gameSession : null);
    try { on(SLOTS, 'spin', c0 => { if (staked(c0)) play('slot_spin', { dur: 1.7, force: true }); }); } catch (e) { /* game missing */ }
    try { on(ROULETTE, 'spin', c0 => { if (staked(c0)) play('roulette_spin', { delay: 1.5, dur: 4.5, force: true }); }); } catch (e) { /* game missing */ }
    try { on(BLACKJACK, 'deal', c0 => { if (staked(c0)) [0.6, 1.0, 1.4, 1.8].forEach(d => play('card_deal', { delay: d, force: true })); }); } catch (e) { /* game missing */ }
    try { on(BLACKJACK, 'hit', () => { const s = g(); if (s && s.acting) play('card_deal', { delay: 0.15, force: true }); }); } catch (e) { /* game missing */ }
    try { on(BLACKJACK, 'double', c0 => { if (staked(c0)) { play('chips', { n: 3 }); play('card_deal', { delay: 0.5, force: true }); } }); } catch (e) { /* game missing */ }
    try { on(BLACKJACK, 'dealerPlay', () => { const s = g(); if (s && s.acting) play('card_flip', { delay: 0.2, force: true }); }); } catch (e) { /* game missing */ }
    try { on(BACCARAT, 'deal', c0 => { if (staked(c0)) [0.7, 1.15, 1.6, 2.05].forEach(d => play('card_deal', { delay: d, force: true })); }); } catch (e) { /* game missing */ }
    try { on(CRAPS, 'roll', () => { const s = g(); if (s && s.rolling) play('dice_roll', { delay: 0.3, force: true }); }); } catch (e) { /* game missing */ }
    try { on(BIGSIX_GAME, 'spin', c0 => { if (staked(c0)) play('wheel_spin', { dur: 4, delay: 0.3, force: true }); }); } catch (e) { /* game missing */ }
  }
  hookGames();

  // weapons: recoil shake, hit markers, ricochets, casings
  wrap('fireWeapon', (orig, a) => {
    const foes = typeof hostiles === 'function' ? hostiles() : [];
    const w = S.equipped || (foes.length && typeof bestWeapon === 'function' ? bestWeapon() : null), ammo0 = w ? S.ammo[w] : 0;
    const hp0 = foes.map(n => n.hp), noAmmo = w && ammo0 <= 0;
    const r = orig(...a);
    if (noAmmo) { play('empty'); return r; }
    if (w && S.ammo[w] < ammo0) {
      addTrauma(w === 'shotgun' ? 0.5 : 0.24); rumble(w === 'shotgun' ? 1 : 0.6, 0.4, w === 'shotgun' ? 180 : 90);
      later(() => play('shell', { vol: 0.8 }), 350);
      const hurt = foes.some((n, i) => n.hp < hp0[i]);
      const killed = foes.some((n, i) => n.hp < hp0[i] && n.state === 'down');
      if (hurt) { hitMarker(killed); later(() => play(killed ? 'kill' : 'hitmarker'), 40); }
      else if (foes.length && Math.random() < 0.7) later(() => play('ricochet', { pan: (Math.random() - 0.5) * 1.4 }), 120);
    } else if (!w && !foes.length) { /* nothing fired */ }
    return r;
  });
  wrap('damagePlayer', (orig, a) => {
    if (F.dying) return true;
    const h0 = S.health, ar0 = S.armor;
    const r = orig(...a);
    const lost = (h0 - S.health) + (ar0 - S.armor);
    if (lost > 0) { addTrauma(Math.min(0.7, 0.2 + lost / 50)); rumble(0.7, 0.9, 160); }
    return r;
  });

  // death: a slow-motion beat before the hospital screen
  wrap('collapse', (orig, a) => {
    if (a[0] !== 'injury') { play('faint'); return orig(...a); }
    if (F.dying) return;
    F.dying = true; F.timeScale = A11Y.reduceMotion ? 1 : 0.2;
    clearMovement(); play('flatline'); play('hurt');
    if (deathEl) deathEl.classList.add('on');
    rumble(1, 1, 500);
    later(() => {
      F.timeScale = 1; F.dying = false;
      if (deathEl) deathEl.classList.remove('on');
      orig(...a);
    }, A11Y.reduceMotion ? 500 : 1700);
  });

  // ---- settings panel (used by the intro screen and the pause menu) ---------------------------------------
  function settingsPanel(noSens) {
    const cfg = window.audio ? audio.volumes : { master: 0.8, sfx: 1, music: 0.55, amb: 0.8, muted: false };
    const wrapEl = el('div', 'settings-block');
    const slider = (label, key, min, max, step, get, set, fmtv) => {
      const id = 'sl-' + key + '-' + Math.random().toString(36).slice(2, 6);
      const row = el('div', 'set-slider');
      row.innerHTML = `<label for="${id}">${label} <b></b></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}">`;
      const inp = row.querySelector('input'), val = row.querySelector('b');
      inp.value = get(); val.textContent = fmtv(get());
      inp.oninput = () => { set(+inp.value); val.textContent = fmtv(+inp.value); };
      return row;
    };
    const pct = v => Math.round(v * 100) + '%';
    const chk = (label, get, set) => {
      const row = el('label', 'set-check'); row.innerHTML = `<input type="checkbox"> <span>${label}</span>`;
      const c = row.querySelector('input'); c.checked = !!get(); c.onchange = () => set(c.checked); return row;
    };
    wrapEl.appendChild(el('h3', '', 'Sound'));
    wrapEl.appendChild(chk('Mute all sound', () => cfg.muted, v => { if (window.audio) audio.mute(v); }));
    [['Master volume', 'master'], ['Effects', 'sfx'], ['Music', 'music'], ['Ambience', 'amb']].forEach(([l, k]) =>
      wrapEl.appendChild(slider(l, k, 0, 1, 0.05, () => cfg[k], v => { if (window.audio) audio.setVolume(k, v); }, pct)));
    wrapEl.appendChild(el('h3', '', 'Controls & comfort'));
    if (!noSens) wrapEl.appendChild(slider('Mouse &amp; touch look speed', 'sens', 0.4, 3, 0.1, () => SETTINGS.sens, v => { SETTINGS.sens = v; saveSettings(); }, v => v.toFixed(1) + '×'));
    wrapEl.appendChild(el('h3', '', 'Accessibility'));
    const ts = el('div', 'set-slider');
    ts.innerHTML = '<label>Text size</label><select><option value="1">Normal</option><option value="1.15">Large</option><option value="1.3">Extra large</option></select>';
    const sel = ts.querySelector('select'); sel.value = String(A11Y.textScale);
    sel.onchange = () => { A11Y.textScale = +sel.value; saveSettings(); applyA11y(); };
    wrapEl.appendChild(ts);
    wrapEl.appendChild(chk('Reduce motion (less camera shake and animation)', () => A11Y.reduceMotion, v => { A11Y.reduceMotion = v; saveSettings(); applyA11y(); }));
    wrapEl.appendChild(chk('Colour-blind friendly HUD (blue / orange, patterned warnings)', () => A11Y.colorblind, v => { A11Y.colorblind = v; saveSettings(); applyA11y(); }));
    wrapEl.appendChild(chk('Controller rumble', () => A11Y.rumble, v => { A11Y.rumble = v; saveSettings(); }));
    return wrapEl;
  }

  function controlsPanel() {
    const box = el('div', 'controls-panel');
    const rows = ACTIONS.map(([act, label]) => `<div class="kb-row"><span>${label}</span><button class="btn kb-btn" data-act="${act}">${keyLabel(customKey(act))}</button></div>`).join('');
    box.innerHTML = `<p class="muted">Click a key to rebind it, then press the new key (Esc cancels). Arrow keys always move too.</p>
      <div class="kb-grid">${rows}</div>
      <div class="kb-fixed">
        <div class="kb-row"><span>Look</span><b>Mouse (click the game to capture it)</b></div>
        <div class="kb-row"><span>Aim / shoot</span><b>Right mouse / left click</b></div>
        <div class="kb-row"><span>Camera distance</span><b>Mouse wheel or ${keyLabel(customKey('camera'))}</b></div>
        <div class="kb-row"><span>Pause menu</span><b>Esc</b></div>
        <div class="kb-row"><span>At tables</span><b>↑↓ bet · ←→ choose · Enter play · H / S / D blackjack · T tutorial</b></div>
      </div>
      <h3>Controller</h3>
      <div class="kb-fixed">
        <div class="kb-row"><span>Move / look</span><b>Left stick / right stick</b></div>
        <div class="kb-row"><span>Aim / fire</span><b>LT / RT</b></div>
        <div class="kb-row"><span>Interact / back</span><b>A / B</b></div>
        <div class="kb-row"><span>Phone / walk</span><b>Y / X</b></div>
        <div class="kb-row"><span>Switch weapon / camera</span><b>RB / LB</b></div>
        <div class="kb-row"><span>Sprint</span><b>Click left stick</b></div>
        <div class="kb-row"><span>Pause</span><b>Start</b></div>
        <div class="kb-row"><span>Tables</span><b>D-pad bet / choose · A play · X Y other actions · B leave</b></div>
      </div>
      <div class="btn-row"><button class="btn ghost" id="kb-reset">Reset keys</button></div>`;
    box.querySelectorAll('.kb-btn').forEach(b => {
      b.onclick = () => {
        b.textContent = 'press a key…'; b.classList.add('listening');
        rebinding = { act: b.dataset.act, done: () => { rebinding = null; renderPause('controls'); } };
      };
    });
    box.querySelector('#kb-reset').onclick = () => { SETTINGS.keymap = {}; saveSettings(); rebuildRemap(); renderPause('controls'); };
    return box;
  }

  // ---- pause menu -------------------------------------------------------------------------------------------
  let pauseBody = null;
  function pause() {
    if (modalOpen || phoneOpen || screenOpen || S.ended || (typeof gameSession !== 'undefined' && gameSession)) return;
    pauseBody = el('div', 'pause-body');
    openModal('⏸ Paused', pauseBody, () => { pauseBody = null; rebinding = null; return true; });
    renderPause('main');
  }
  function renderPause(view) {
    if (!pauseBody) return;
    pauseBody.innerHTML = '';
    const back = () => { const b = el('button', 'btn ghost', '‹ Back'); b.onclick = () => renderPause('main'); return b; };
    if (view === 'main') {
      const list = el('div', 'pause-list');
      const item = (label, fn, cls) => { const b = el('button', 'btn ' + (cls || ''), label); b.onclick = fn; list.appendChild(b); return b; };
      item('▶ Resume', () => closeModal(true), 'primary');
      item('⚙ Settings', () => renderPause('settings'));
      item('⌨ Controls', () => renderPause('controls'));
      item('🏆 Achievements & career', () => renderPause('career'));
      item('💾 Save game', () => { if (window.GMSave) { GMSave.save(true); toast('💾 Game saved.', 'info', 1500); } });
      item('📖 How to play', () => { closeModal(true); showIntro(); });
      item('↺ Restart', () => renderPause('restart'), 'danger');
      pauseBody.appendChild(list);
      const st = el('p', 'muted', `${clockText()} · Net ${fmt(netWorth() - CONFIG.START_CASH)} · Autosaves every 20 seconds.`);
      pauseBody.appendChild(st);
    } else if (view === 'settings') {
      pauseBody.appendChild(settingsPanel()); pauseBody.appendChild(back());
    } else if (view === 'controls') {
      pauseBody.appendChild(controlsPanel()); pauseBody.appendChild(back());
    } else if (view === 'career') {
      const box = el('div', 'career-panel');
      if (window.GMMissions) GMMissions.renderCareer(box); else box.textContent = 'Not available.';
      pauseBody.appendChild(box); pauseBody.appendChild(back());
    } else if (view === 'restart') {
      pauseBody.appendChild(el('p', '', 'Start over with a fresh $2,000,000? Your current run will be lost (it still counts toward your career stats).'));
      const row = el('div', 'btn-row');
      const yes = el('button', 'btn danger', 'Yes, restart'); yes.onclick = () => { closeModal(true); if (window.GMSave) GMSave.abandon(); newGame(); };
      row.appendChild(yes); row.appendChild(back()); pauseBody.appendChild(row);
    }
  }
  F.pause = pause; F.settingsPanel = settingsPanel;

  // auto-pause when the player releases the mouse (Esc) or the window loses focus during play
  let started = false;
  F.markStarted = () => { started = true; };
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement || !started) return;
    later(() => { if (!document.pointerLockElement && started && !blocked() && !F.dying && document.hasFocus()) pause(); }, 80);
  });
  window.addEventListener('blur', () => { if (started && !blocked()) later(() => { if (!blocked() && !document.hasFocus()) pause(); }, 50); });

  // low-health vignette and colour-blind state, checked a few times a second (not per frame)
  setInterval(() => {
    document.body.classList.toggle('lowhp-on', !!S && !S.ended && S.health < 35);
  }, 300);

  // settings block for the intro screen (called from showIntro in main.js)
  F.decorateIntro = root => {
    const box = root.querySelector('.settings');
    if (box) box.appendChild(settingsPanel(true));
    const start = root.querySelector('#start-btn');
    if (start) start.addEventListener('click', () => { started = true; if (window.audio) audio.start(); play('ui_start'); });
  };

  function buildMuteButton() {
    const host = document.getElementById('corner-buttons');
    if (!host || document.getElementById('muteBtn')) return;
    const b = document.createElement('button');
    b.id = 'muteBtn'; b.title = 'Sound on / off'; b.setAttribute('aria-label', 'Toggle sound');
    const paint = () => { b.textContent = window.audio && audio.isMuted() ? '🔇' : '🔊'; b.style.fontSize = '17px'; };
    b.onclick = () => { if (window.audio) audio.toggleMute(); paint(); };
    paint(); host.appendChild(b);
  }
  function init() { applyA11y(); buildStaminaBar(); buildOverlays(); buildMuteButton(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
