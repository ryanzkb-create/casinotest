'use strict';

// ---------------------------------------------------------------------------
// Save / load and career stats. The whole game state S is versioned and
// autosaved to localStorage every 20 seconds (and when the tab is hidden).
// Every storage call is wrapped: private windows and blocked storage just mean
// "no save", never an error.
// ---------------------------------------------------------------------------
(function () {
  const KEY = 'gm_save_v1', CAREER_KEY = 'gm_career_v1', VERSION = 1;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const Save = window.GMSave = { started: false, lastSaved: 0 };

  // ---- career (kept across runs) ------------------------------------------------------------------------
  const blankCareer = () => ({ runs: 0, endings: { debt: 0, walkaway: 0, abandoned: 0 }, biggestWin: 0, longestSurvivalMin: 0, lowestNetEscaped: null, bestNetEscaped: null, totalWagered: 0, totalLost: 0, achievements: {}, last: null });
  function loadCareer() {
    try { const c = JSON.parse(store.get(CAREER_KEY) || 'null'); if (c && typeof c === 'object') return Object.assign(blankCareer(), c, { endings: Object.assign(blankCareer().endings, c.endings || {}) }); } catch (e) { /* corrupt */ }
    return blankCareer();
  }
  let career = loadCareer();
  Save.career = () => career;
  Save.saveCareer = () => store.set(CAREER_KEY, JSON.stringify(career));
  function trackBests() {
    if (!S) return;
    career.biggestWin = Math.max(career.biggestWin, S.stats.biggestWin || 0);
    career.longestSurvivalMin = Math.max(career.longestSurvivalMin, S.minutes - 20 * 60);
  }
  // End of a run: 'debt' | 'walkaway' | 'abandoned'
  Save.recordEnd = reason => {
    if (!S) return;
    trackBests();
    const st = S.stats, net = netWorth();
    career.runs++;
    career.endings[reason] = (career.endings[reason] || 0) + 1;
    career.totalWagered += st.wagered;
    career.totalLost += Math.max(0, st.wagered - st.returned);
    if (reason === 'walkaway') {
      career.lowestNetEscaped = career.lowestNetEscaped == null ? net : Math.min(career.lowestNetEscaped, net);
      career.bestNetEscaped = career.bestNetEscaped == null ? net : Math.max(career.bestNetEscaped, net);
    }
    career.last = { reason, net, days: (S.minutes - 20 * 60) / 1440, bets: st.rounds, wagered: st.wagered, when: Date.now() };
    Save.saveCareer();
    store.del(KEY);
  };
  Save.abandon = () => { if (S && !S.ended && Save.started && S.stats.rounds > 0) Save.recordEnd('abandoned'); else store.del(KEY); };

  Save.careerHTML = () => {
    const c = career, f = v => (v == null ? '–' : fmt(v));
    return `<div class="end-stats">
      <div><span>Runs played</span><b>${c.runs}</b></div>
      <div><span>Ended in debt / walked away</span><b>${c.endings.debt} / ${c.endings.walkaway}</b></div>
      <div><span>Biggest single win</span><b>${fmt(c.biggestWin)}</b></div>
      <div><span>Longest survival</span><b>${durationText(c.longestSurvivalMin)}</b></div>
      <div><span>Lowest net worth walked away with</span><b>${f(c.lowestNetEscaped)}</b></div>
      <div><span>Best net worth walked away with</span><b>${f(c.bestNetEscaped)}</b></div>
      <div><span>Lifetime wagered</span><b>${fmt(c.totalWagered)}</b></div>
      <div><span>Lifetime lost to the house edge (net)</span><b class="lose">${fmt(c.totalLost)}</b></div>
    </div>`;
  };

  // ---- saving ---------------------------------------------------------------------------------------------
  Save.hasSave = () => !!Save.peek();
  Save.peek = () => {
    const raw = store.get(KEY);
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (!d || d.v !== VERSION || !d.S || typeof d.S.cash !== 'number' || typeof d.S.minutes !== 'number') return null;
      return d;
    } catch (e) { return null; }
  };
  // Saving mid-round keeps the stake taken: leaving a table during a spin forfeits the bet, so a reload can't undo a loss.
  Save.save = force => {
    if (!S || S.ended || !Save.started) return false;
    if (!force && typeof gameSession !== 'undefined' && gameSession && gameSession.busy && Date.now() - Save.lastSaved < 60000) { /* still fine: stake already deducted */ }
    trackBests(); Save.saveCareer();
    const ok = store.set(KEY, JSON.stringify({ v: VERSION, t: Date.now(), S, player: { x: player.x, y: player.y, face: player.face }, view: { yaw: view.yaw } }));
    if (ok) Save.lastSaved = Date.now();
    return ok;
  };
  function merge(base, saved) {
    for (const k of Object.keys(saved)) {
      const b = base[k], s = saved[k];
      if (b && typeof b === 'object' && !Array.isArray(b) && s && typeof s === 'object' && !Array.isArray(s)) merge(b, s);
      else base[k] = s;
    }
    return base;
  }
  Save.load = () => {
    const d = Save.peek();
    if (!d) return false;
    newGame();                                   // rebuild the world, then overwrite the state
    S = merge(newState(), d.S);
    S.ended = false;
    if (d.player && !hits(d.player.x, d.player.y)) { player.x = d.player.x; player.y = d.player.y; player.face = d.player.face || Math.PI; }
    if (d.view) view.yaw = d.view.yaw || 0;
    if (typeof updateWeaponHUD === 'function') updateWeaponHUD();
    updateHUD(true);
    addMsg('🎩 Casino Host', 'Welcome back to the Golden Mirage. We saved your seat.');
    S.unread = Math.max(0, S.unread - 1);
    Save.begin();
    return true;
  };
  Save.begin = () => { Save.started = true; if (window.GMFeel) GMFeel.markStarted(); if (window.audio) audio.start(); };

  setInterval(() => Save.save(false), 20000);
  window.addEventListener('pagehide', () => Save.save(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) Save.save(true); });

  // ---- intro screen: Continue / New game / career ---------------------------------------------------------
  Save.decorateIntro = root => {
    const start = root.querySelector('#start-btn');
    if (!start) return;
    const sv = Save.started ? null : Save.peek();
    const c = career;
    if (c.runs > 0) {
      const line = document.createElement('p'); line.className = 'muted career-line';
      line.innerHTML = `Career: ${c.runs} run${c.runs > 1 ? 's' : ''} · biggest win ${fmtShort(c.biggestWin)} · longest survival ${durationText(c.longestSurvivalMin)}` +
        (c.lowestNetEscaped != null ? ` · lowest walk-away ${fmtShort(c.lowestNetEscaped)}` : '');
      start.parentNode.insertBefore(line, start);
    }
    if (Save.started) {
      const label = () => { if (!start.disabled) start.textContent = 'Resume'; };
      label(); const t = setInterval(() => { if (!document.body.contains(start)) clearInterval(t); else label(); }, 300);
      return;
    }
    if (!sv) return;
    const net = sv.S.cash - (sv.S.bank.owed + sv.S.shark.owed + sv.S.medical + (sv.S.x && sv.S.x.marker ? sv.S.x.marker.owed : 0)) - CONFIG.START_CASH;
    const row = document.createElement('div'); row.className = 'continue-row';
    const cont = document.createElement('button'); cont.className = 'btn primary big'; cont.id = 'continue-btn';
    cont.innerHTML = `Continue<small>${clockText(sv.S.minutes)} · ${fmtShort(sv.S.cash)} cash · ${net >= 0 ? '+' : '−'}${fmtShort(Math.abs(net))} vs start</small>`;
    cont.disabled = start.disabled;
    cont.onclick = () => { if (Save.load()) hideScreen(); };
    row.appendChild(cont);
    const tag = root.querySelector('.tagline');
    if (tag) tag.parentNode.insertBefore(row, tag.nextSibling); else start.parentNode.insertBefore(row, start);
    let armed = false;
    const relabel = () => { if (!start.disabled) start.textContent = armed ? 'Erase my save and start over?' : 'New game'; cont.disabled = start.disabled; };
    relabel();
    const t = setInterval(() => { if (!document.body.contains(start)) clearInterval(t); else relabel(); }, 300);
    start.addEventListener('click', e => {
      if (!armed) { armed = true; relabel(); e.stopImmediatePropagation(); e.preventDefault(); setTimeout(() => { armed = false; relabel(); }, 5000); }
    }, true);
  };
})();
