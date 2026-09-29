'use strict';

// ---------------------------------------------------------------------------
// Gamepad support (standard mapping): sticks move/look, LT aim, RT fire,
// A interact, B back, X walk, Y phone, RB weapon, LB camera, L3 sprint, Start pause.
// Menus, the phone and the casino tables are navigable with the D-pad and A/B.
// Polling only runs while a pad is connected.
// ---------------------------------------------------------------------------
(function () {
  const pad = window.GMPad = { active: false, connected: false, rumble() {} };
  const prev = {};
  let last = 0, running = false;
  let padMove = false, padAim = false, padSprint = false, holdT = {};
  const DZ = 0.2;

  const getPad = () => {
    const list = (navigator.getGamepads && navigator.getGamepads()) || [];
    for (const p of list) if (p && p.connected) return p;
    return null;
  };
  const stick = (x, y) => {
    const m = Math.hypot(x, y);
    if (m < DZ) return [0, 0, 0];
    const k = Math.min(1, (m - DZ) / (1 - DZ)), c = Math.pow(k, 1.4);
    return [x / m * c, y / m * c, c];
  };

  pad.rumble = (strong, weak, ms) => {
    const p = getPad();
    const a = p && (p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]));
    try {
      if (a && a.playEffect) a.playEffect('dual-rumble', { startDelay: 0, duration: ms || 100, strongMagnitude: strong, weakMagnitude: weak });
      else if (a && a.pulse) a.pulse(Math.max(strong, weak), ms || 100);
    } catch (e) { /* not supported */ }
  };

  const deactivate = () => { if (pad.active) { pad.active = false; document.body.classList.remove('pad'); } };
  ['keydown', 'mousedown', 'touchstart'].forEach(ev => window.addEventListener(ev, deactivate, true));
  window.addEventListener('gamepadconnected', e => {
    pad.connected = true;
    if (typeof toast === 'function') toast('🎮 Controller connected' + (e.gamepad && e.gamepad.id ? ': ' + String(e.gamepad.id).slice(0, 40) : ''), 'info', 2500);
    start();
  });
  window.addEventListener('gamepaddisconnected', () => { pad.connected = !!getPad(); if (!pad.connected) { pad.active = false; document.body.classList.remove('pad'); releaseHeld(); } });

  function releaseHeld() {
    if (padMove) { touch.mx = touch.my = 0; touch.active = false; padMove = false; }
    if (padAim) { view.aiming = false; padAim = false; }
    if (padSprint) { keys['shift'] = false; padSprint = false; }
  }
  function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(loop); }

  const down = (p, i) => !!(p.buttons[i] && p.buttons[i].pressed);
  const val = (p, i) => (p.buttons[i] ? p.buttons[i].value : 0);
  const pressed = (p, i) => { const d = down(p, i), r = d && !prev[i]; return r; };
  // press, then repeat while held (for D-pad bet changes and menu moves)
  function repeat(p, i, dt) {
    const d = down(p, i);
    if (!d) { holdT[i] = 0; return false; }
    if (!prev[i]) { holdT[i] = -0.35; return true; }
    holdT[i] += dt;
    if (holdT[i] >= 0.12) { holdT[i] = 0; return true; }
    return false;
  }
  const visible = e => e.offsetParent !== null;
  const focusables = root => root ? [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter(visible) : [];
  function moveFocus(root, dir) {
    const f = focusables(root); if (!f.length) return;
    let i = f.indexOf(document.activeElement);
    i = i < 0 ? (dir > 0 ? 0 : f.length - 1) : (i + dir + f.length) % f.length;
    f[i].focus({ preventScroll: false }); f[i].scrollIntoView({ block: 'nearest' });
    if (window.sfxPlay) sfxPlay('ui_click', { vol: 0.5 });
  }
  function adjustFocused(dir) {
    const a = document.activeElement;
    if (a && a.tagName === 'INPUT' && a.type === 'range') { a.value = String(+a.value + dir * (+a.step || 1)); a.dispatchEvent(new Event('input', { bubbles: true })); return true; }
    if (a && a.tagName === 'SELECT') { a.selectedIndex = Math.max(0, Math.min(a.options.length - 1, a.selectedIndex + dir)); a.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    return false;
  }
  function menuInput(p, dt, root) {
    if (repeat(p, 13, dt)) moveFocus(root, 1);
    else if (repeat(p, 12, dt)) moveFocus(root, -1);
    else if (repeat(p, 15, dt)) { if (!adjustFocused(1)) moveFocus(root, 1); }
    else if (repeat(p, 14, dt)) { if (!adjustFocused(-1)) moveFocus(root, -1); }
    if (pressed(p, 0)) {
      const a = document.activeElement;
      if (a && root && root.contains(a) && a.click) a.click();
      else { const f = focusables(root).find(b => b.classList.contains('primary')) || focusables(root)[0]; if (f) f.focus(); }
    }
  }

  function tableInput(p, dt) {
    const tut = document.getElementById('tutorial');
    if (tut && !tut.classList.contains('hidden')) {
      if (pressed(p, 0) || pressed(p, 15)) tutorialNext(); else if (pressed(p, 14)) tutorialPrev(); else if (pressed(p, 1)) tutorialNext(true);
      return;
    }
    const g = gameSession, fake = { preventDefault() {} };
    if (repeat(p, 12, dt)) changeBet(1);
    else if (repeat(p, 13, dt)) changeBet(-1);
    if (pressed(p, 14)) gameKey('arrowleft', fake);
    if (pressed(p, 15)) gameKey('arrowright', fake);
    if (pressed(p, 8)) maxBet();
    const btns = [...document.querySelectorAll('#gu-buttons .gu-btn:not(:disabled)')].filter(b => {
      const k = b.querySelector('kbd'); return !k || !/^(↑↓|T|Esc)$/.test(k.textContent);
    });
    const primary = btns.find(b => b.classList.contains('primary')) || btns[0], others = btns.filter(b => b !== primary);
    if (pressed(p, 0) && primary) primary.click();
    if (pressed(p, 2) && others[0]) others[0].click();
    if (pressed(p, 3) && others[1]) others[1].click();
    if (pressed(p, 1) && !g.busy) leaveGame();
  }

  function loop(t) {
    const p = getPad();
    if (!p) { running = false; pad.connected = false; return; }
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    try { frame(p, dt); } catch (e) { /* a bad frame must never stop the loop */ }
    for (let i = 0; i < p.buttons.length; i++) prev[i] = down(p, i);
    requestAnimationFrame(loop);
  }

  function frame(p, dt) {
    const [lx, ly, lm] = stick(p.axes[0] || 0, p.axes[1] || 0);
    const [rx, ry, rm] = stick(p.axes[2] || 0, p.axes[3] || 0);
    let anyBtn = false;
    for (let i = 0; i < p.buttons.length; i++) if (down(p, i) && !prev[i]) anyBtn = true;
    if ((lm > 0.35 || rm > 0.35 || anyBtn) && !pad.active) { pad.active = true; document.body.classList.add('pad'); }
    if (typeof S === 'undefined' || !S) return;
    const inSession = typeof gameSession !== 'undefined' && gameSession;

    if (typeof screenOpen !== 'undefined' && screenOpen) {
      releaseHeld();
      const root = document.getElementById('screen');
      if (!document.activeElement || !root.contains(document.activeElement)) { if (anyBtn) { const f = focusables(root); (f.find(b => b.id === 'start-btn' && !b.disabled) || f.find(b => b.classList.contains('primary')) || f[0] || root).focus(); } }
      menuInput(p, dt, root);
      return;
    }
    if (modalOpen) {
      releaseHeld();
      const root = document.getElementById('modal');
      if (!root.contains(document.activeElement) && anyBtn) { const f = focusables(document.getElementById('modal-body')); if (f[0]) f[0].focus(); }
      menuInput(p, dt, root);
      if (pressed(p, 1)) closeModal();
      return;
    }
    if (phoneOpen) {
      releaseHeld();
      const root = document.getElementById('phone-screen');
      if (!root.contains(document.activeElement) && anyBtn) { const f = focusables(root); if (f[0]) f[0].focus(); }
      menuInput(p, dt, root);
      if (pressed(p, 1)) { if (phoneApp !== 'home') showApp('home'); else closePhone(); }
      if (pressed(p, 3)) closePhone();
      return;
    }
    if (inSession) { releaseHeld(); tableInput(p, dt); return; }
    if (S.ended) return;

    // ---- free roam ----
    if (pressed(p, 9) && window.GMFeel) { GMFeel.pause(); return; }
    if (lm > 0) { touch.mx = lx; touch.my = ly; touch.active = true; padMove = true; }
    else if (padMove) { touch.mx = touch.my = 0; touch.active = false; padMove = false; padSprint = false; keys['shift'] = false; }
    if (pressed(p, 10) && padMove) padSprint = !padSprint;
    if (padSprint) keys['shift'] = true;
    if (rm > 0) {
      view.yaw -= rx * dt * 2.8 * SETTINGS.sens;
      view.pitch = clamp(view.pitch + ry * dt * 2.0 * SETTINGS.sens, -0.55, 1.15);
    }
    const lt = val(p, 6), rt = val(p, 7);
    if (lt > 0.3) { view.aiming = true; padAim = true; } else if (padAim) { view.aiming = false; padAim = false; }
    if (rt > 0.5 && S.equipped) fireWeapon();
    else if (rt > 0.5 && typeof hostiles === 'function' && hostiles().length) fireWeapon();
    if (pressed(p, 5)) cycleWeapon();
    if (pressed(p, 4)) view.zoom = view.zoom > 1.2 ? 0.8 : view.zoom < 0.9 ? 1 : 1.35;
    if (pressed(p, 2)) { view.walk = !view.walk; toast(view.walk ? 'Walking' : 'Jogging', 'info', 1200); }
    if (pressed(p, 3)) togglePhone();
    if (pressed(p, 0)) { const tg = nearbyTarget(); if (tg) useTarget(tg); }
  }

  // a pad already connected before the page loaded only announces itself after a button press
  if (getPad()) { pad.connected = true; start(); }
})();
