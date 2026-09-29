'use strict';

// ---------------------------------------------------------------------------
// Golden Mirage audio: a fully procedural WebAudio engine (no sound files).
//
//   window.sfxPlay(name, opts)   fire a one-shot sound. Safe to call at any time
//                                (does nothing until audio has been unlocked by a click/key).
//   window.audio                 { start, setVolume(kind, 0..1), mute(bool), toggleMute(), isMuted(),
//                                  volumes, setTension(0..2), ready }
//
// Sound names (opts: { vol, pan, level, surface, run, n }):
//   ui:      ui_click ui_open ui_close ui_start notify notify_soft alert good ach phone_ring phone_open register coin
//   casino:  chip chips card_deal card_flip shuffle slot_spin slot_win slot_ldw slot_near jackpot win_small win_big
//            lose roulette_spin dice_roll wheel_spin
//   world:   step (surface: carpet|marble|wood|tiles|pavement) door eat drink siren faint flatline heartbeat
//   combat:  pistol shotgun far reload shell ricochet empty hurt punch hitmarker kill cock stinger
// Kept for the old combat.js API: sfx('far' | 'hurt' | 'pistol' | 'shotgun').
//
// The engine is built by makeAudioEngine(ctx) so it can run on a live AudioContext or an
// OfflineAudioContext (used to verify levels without speakers, see audio._offline).
// ---------------------------------------------------------------------------
(function () {
  const DEFAULTS = { master: 0.8, sfx: 1, music: 0.55, amb: 0.8, muted: false };
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pk = arr => arr[Math.floor(Math.random() * arr.length)];

  function makeAudioEngine(ctx, cfg) {
    const sr = ctx.sampleRate;
    // ---- graph: buses -> master -> limiter -> out --------------------------------------------------
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 10; limiter.ratio.value = 8;
    limiter.attack.value = 0.003; limiter.release.value = 0.25;
    master.connect(limiter); limiter.connect(ctx.destination);
    const bus = n => { const g = ctx.createGain(); g.connect(master); return g; };
    const sfxBus = bus(), musicBus = bus(), ambBus = bus();
    // synthetic room reverb (decaying stereo noise)
    const reverb = ctx.createConvolver();
    { const len = Math.floor(sr * 1.7), ir = ctx.createBuffer(2, len, sr);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      reverb.buffer = ir; }
    const revIn = ctx.createGain(); revIn.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.32;
    revIn.connect(reverb); reverb.connect(revOut); revOut.connect(master);

    // ---- noise sources -------------------------------------------------------------------------------
    function makeNoise(kind, secs) {
      const len = Math.floor(sr * secs), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
      return b;
    }
    const NB = { white: makeNoise('white', 2), pink: makeNoise('pink', 4), brown: makeNoise('brown', 4) };

    let voices = 0;
    const endVoice = node => { voices++; node.onended = () => { voices--; }; };

    // route a node to a bus with optional pan and reverb send
    function route(node, o, defBus) {
      let out = node;
      if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); out.connect(p); out = p; }
      out.connect(o.dest || defBus || sfxBus);
      if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; out.connect(s); s.connect(revIn); }
    }

    // oscillator with a percussive envelope
    function tone(o) {
      if (voices > 90) return;
      const t = o.t, dur = o.dur || 0.2, vol = o.vol == null ? 0.2 : o.vol;
      const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + dur);
      const g = ctx.createGain(), a = o.a == null ? 0.004 : o.a;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + a);
      if (o.hold) g.gain.setValueAtTime(vol, t + o.hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let n = osc;
      if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); n = f; }
      n.connect(g);
      route(g, o);
      osc.start(t); osc.stop(t + dur + 0.05); endVoice(osc);
    }
    // filtered noise burst
    function hit(o) {
      if (voices > 90) return;
      const t = o.t, dur = o.dur || 0.08, vol = o.vol == null ? 0.2 : o.vol;
      const src = ctx.createBufferSource(); src.buffer = NB[o.noise || 'white'];
      const f = ctx.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 2000, t);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur);
      f.Q.value = o.q == null ? 0.9 : o.q;
      const g = ctx.createGain(), a = o.a == null ? 0.002 : o.a;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g);
      route(g, o);
      src.start(t, Math.random() * 1.2, dur + 0.05); endVoice(src);
    }
    const bell = (t, f, vol, o = {}) => {
      const d = o.dur || 1.1;
      tone(Object.assign({}, o, { t, f, dur: d, vol, a: 0.002, rev: o.rev == null ? 0.5 : o.rev }));
      tone(Object.assign({}, o, { t, f: f * 2.76, dur: d * 0.35, vol: vol * 0.4, a: 0.002, rev: 0.3 }));
    };
    const coin = (t, vol, o = {}) => {
      const f = rnd(2400, 3600);
      tone(Object.assign({ t, f, f2: f * 1.25, dur: 0.16, vol: vol * 0.7, type: 'triangle' }, o));
      tone(Object.assign({ t: t + 0.03, f: f * 1.5, dur: 0.22, vol: vol * 0.4 }, o));
      hit(Object.assign({ t, f: 6000, dur: 0.03, vol: vol * 0.3 }, o));
    };
    const thump = (t, vol, f = 150, f2 = 45, dur = 0.18, o = {}) => tone(Object.assign({ t, f, f2, dur, vol, a: 0.002 }, o));

    // ---- one-shot sound library ----------------------------------------------------------------------
    const V = o => (o.vol == null ? 1 : o.vol);
    const SFX = {
      ui_click(t, o) { tone({ t, f: 1900, f2: 1300, dur: 0.04, vol: 0.12 * V(o), type: 'triangle' }); hit({ t, f: 5000, dur: 0.015, vol: 0.08 * V(o) }); },
      ui_open(t, o) { tone({ t, f: 520, f2: 900, dur: 0.1, vol: 0.06 * V(o) }); },
      ui_close(t, o) { tone({ t, f: 800, f2: 480, dur: 0.1, vol: 0.05 * V(o) }); },
      ui_start(t, o) { [261.6, 329.6, 392, 523.3].forEach((f, i) => bell(t + i * 0.07, f, 0.09 * V(o), { dur: 1.8 })); },
      notify(t, o) { bell(t, 1318.5, 0.11 * V(o), { dur: 0.8 }); bell(t + 0.11, 1760, 0.11 * V(o), { dur: 0.9 }); },
      notify_soft(t, o) { bell(t, 1046.5, 0.06 * V(o), { dur: 0.7 }); bell(t + 0.09, 1568, 0.05 * V(o), { dur: 0.7 }); },
      good(t, o) { bell(t, 784, 0.1 * V(o), { dur: 0.7 }); bell(t + 0.1, 988, 0.1 * V(o), { dur: 0.9 }); },
      alert(t, o) { for (let i = 0; i < 2; i++) tone({ t: t + i * 0.15, f: 233, f2: 210, dur: 0.13, vol: 0.09 * V(o), type: 'sawtooth', lp: 900 }); },
      ach(t, o) { [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(t + i * 0.09, f, 0.1 * V(o), { dur: 1.4 })); },
      phone_ring(t, o) {
        for (let c = 0; c < 2; c++) for (let i = 0; i < 2; i++) {
          const s = t + c * 1.1 + i * 0.22;
          tone({ t: s, f: 440, dur: 0.18, vol: 0.06 * V(o), type: 'triangle' }); tone({ t: s, f: 480, dur: 0.18, vol: 0.06 * V(o), type: 'triangle' });
        }
      },
      phone_open(t, o) { tone({ t, f: 1200, dur: 0.05, vol: 0.05 * V(o), type: 'triangle' }); tone({ t: t + 0.06, f: 1600, dur: 0.06, vol: 0.05 * V(o), type: 'triangle' }); },
      register(t, o) {
        hit({ t, f: 4500, dur: 0.05, vol: 0.14 * V(o) }); hit({ t: t + 0.06, f: 3000, dur: 0.04, vol: 0.1 * V(o) });
        bell(t + 0.1, 2093, 0.1 * V(o), { dur: 0.9 }); coin(t + 0.18, 0.1 * V(o));
      },
      coin(t, o) { coin(t, 0.14 * V(o), o.pan ? { pan: o.pan } : {}); },

      // --- casino ---
      chip(t, o) {
        const p = o.pan || 0;
        hit({ t, f: 3300 * rnd(0.9, 1.1), q: 4, dur: 0.035, vol: 0.32 * V(o), pan: p });
        tone({ t, f: 1500 * rnd(0.9, 1.1), f2: 950, dur: 0.03, vol: 0.09 * V(o), pan: p });
      },
      chips(t, o) { const n = o.n || 4; for (let i = 0; i < n; i++) SFX.chip(t + i * rnd(0.03, 0.07), { vol: rnd(0.6, 1) * V(o) }); },
      card_deal(t, o) { hit({ t, ft: 'highpass', f: 4500, dur: 0.07, vol: 0.12 * V(o), a: 0.01 }); hit({ t: t + 0.06, f: 2400, dur: 0.02, vol: 0.09 * V(o) }); },
      card_flip(t, o) { hit({ t, ft: 'highpass', f: 3500, f2: 7000, dur: 0.08, vol: 0.12 * V(o), a: 0.015 }); hit({ t: t + 0.08, f: 1800, dur: 0.02, vol: 0.1 * V(o) }); },
      shuffle(t, o) { for (let i = 0; i < 14; i++) hit({ t: t + i * 0.055 + rnd(0, 0.02), ft: 'highpass', f: rnd(3500, 6000), dur: 0.05, vol: 0.06 * V(o), a: 0.01 }); },
      slot_spin(t, o) {
        const dur = o.dur || 1.7;
        tone({ t, f: 82, dur: dur + 0.1, vol: 0.05 * V(o), type: 'sawtooth', lp: 260, a: 0.2, hold: dur - 0.2 });
        for (let i = 0; i < 22; i++) { const s = t + Math.pow(i / 22, 0.85) * dur * 0.95; hit({ t: s, f: 2600 + (i % 3) * 300, q: 3, dur: 0.02, vol: 0.06 * V(o), pan: ((i % 3) - 1) * 0.25 }); }
        [0.6, 0.85, 1.0].forEach((k, i) => { const s = t + dur * k; thump(s, 0.18 * V(o), 130, 60, 0.12); hit({ t: s, ft: 'lowpass', f: 900, dur: 0.06, vol: 0.12 * V(o) }); });
      },
      slot_win(t, o) {
        const lvl = o.level || 1, sc = [72, 76, 79, 84, 88, 91, 96];
        const n = 4 + lvl * 3;
        for (let i = 0; i < n; i++) bell(t + i * 0.085, mtof(sc[i % sc.length] + (i >= sc.length ? 12 : 0)), 0.07 * V(o), { dur: 0.9 });
        if (lvl >= 2) for (let i = 0; i < 10 * lvl; i++) coin(t + 0.3 + i * rnd(0.05, 0.1), 0.08 * V(o), { pan: rnd(-0.6, 0.6) });
      },
      slot_ldw(t, o) { SFX.slot_win(t, { level: 1, vol: 0.85 * V(o) }); },  // a loss disguised as a win still celebrates
      slot_near(t, o) { for (let i = 0; i < 4; i++) tone({ t: t + i * 0.06, f: 700 + i * 180, dur: 0.07, vol: 0.05 * V(o), type: 'square', lp: 2500 }); },
      jackpot(t, o) {
        const chord = [261.6, 329.6, 392, 523.3];
        [0, 0.4, 0.8].forEach((d, k) => chord.forEach(f => tone({ t: t + d, f: f * (k === 2 ? 2 : 1), dur: k === 2 ? 1.8 : 0.5, vol: 0.05 * V(o), type: 'sawtooth', lp: 2200, a: 0.02, rev: 0.4 })));
        for (let i = 0; i < 16; i++) tone({ t: t + i * 0.2, f: i % 2 ? 900 : 640, dur: 0.2, vol: 0.03 * V(o), type: 'triangle' });
        for (let i = 0; i < 60; i++) coin(t + 0.6 + i * rnd(0.04, 0.07), 0.08 * V(o), { pan: rnd(-0.8, 0.8) });
        for (let i = 0; i < 8; i++) bell(t + 1 + i * 0.25, mtof(84 + [0, 4, 7, 12][i % 4]), 0.07 * V(o), { dur: 1.5 });
      },
      win_small(t, o) { bell(t, 880, 0.09 * V(o), { dur: 0.6 }); bell(t + 0.1, 1174.7, 0.09 * V(o), { dur: 0.8 }); SFX.chips(t + 0.25, { n: 3, vol: 0.7 * V(o) }); },
      win_big(t, o) { [523.3, 659.3, 784, 1046.5].forEach((f, i) => bell(t + i * 0.09, f, 0.1 * V(o), { dur: 1.2 })); for (let i = 0; i < 16; i++) coin(t + 0.4 + i * rnd(0.05, 0.09), 0.08 * V(o), { pan: rnd(-0.6, 0.6) }); },
      lose(t, o) { SFX.chips(t, { n: 5, vol: 0.5 * V(o), pan: 0 }); tone({ t: t + 0.05, f: 196, f2: 150, dur: 0.3, vol: 0.035 * V(o), lp: 500 }); },
      roulette_spin(t, o) {
        const dur = o.dur || 4.2;
        hit({ t, noise: 'pink', f: 700, f2: 300, q: 1.2, dur, vol: 0.07 * V(o), a: 0.3 });
        let s = 0.15, gap = 0.03;
        while (s < dur - 0.4) { hit({ t: t + s, f: 3800, q: 6, dur: 0.02, vol: 0.09 * V(o) }); s += gap; gap *= 1.11; }
        for (let i = 0; i < 4; i++) { const b = t + s + i * (0.09 + i * 0.04); hit({ t: b, f: 2800 - i * 300, q: 5, dur: 0.03, vol: (0.16 - i * 0.03) * V(o) }); tone({ t: b, f: 900 - i * 120, dur: 0.05, vol: 0.04 * V(o) }); }
      },
      dice_roll(t, o) {
        let s = 0, gap = 0.04;
        for (let i = 0; i < 10; i++) { hit({ t: t + s, f: rnd(1600, 3800), q: 2, dur: 0.03, vol: rnd(0.08, 0.17) * V(o), pan: rnd(-0.3, 0.3) }); tone({ t: t + s, f: rnd(180, 300), f2: 90, dur: 0.05, vol: 0.06 * V(o) }); s += gap; gap *= 1.2; }
        hit({ t: t + s + 0.05, f: 900, ft: 'lowpass', dur: 0.05, vol: 0.12 * V(o) });
      },
      wheel_spin(t, o) { const dur = o.dur || 4; let s = 0, gap = 0.035; while (s < dur) { hit({ t: t + s, f: 2200, q: 5, dur: 0.02, vol: 0.09 * V(o) }); s += gap; gap *= 1.07; } },

      // --- world ---
      step(t, o) {
        const surf = o.surface || 'carpet', run = o.run ? 1.35 : 1, j = rnd(0.88, 1.12), v = V(o) * run, p = (o.pan || 0);
        if (surf === 'carpet') { hit({ t, ft: 'lowpass', f: 420 * j, dur: 0.075, vol: 0.13 * v, q: 0.5, pan: p }); tone({ t, f: 95 * j, dur: 0.06, vol: 0.06 * v }); }
        else if (surf === 'marble' || surf === 'tiles') { hit({ t, f: 2700 * j, q: 2, dur: 0.035, vol: 0.16 * v, pan: p, rev: 0.25 }); hit({ t, ft: 'lowpass', f: 900, dur: 0.05, vol: 0.08 * v }); tone({ t, f: 1900 * j, dur: 0.05, vol: 0.02 * v, rev: 0.2 }); }
        else if (surf === 'wood') { hit({ t, f: 750 * j, q: 1.5, dur: 0.06, vol: 0.16 * v, pan: p }); tone({ t, f: 150 * j, f2: 110, dur: 0.08, vol: 0.07 * v }); }
        else { hit({ t, f: 1400 * j, q: 0.9, dur: 0.06, vol: 0.15 * v, pan: p }); hit({ t, ft: 'highpass', f: 5000, dur: 0.03, vol: 0.04 * v }); }
      },
      door(t, o) { hit({ t, noise: 'pink', f: 300, f2: 1600, q: 0.8, dur: 0.5, vol: 0.09 * V(o), a: 0.15 }); },
      eat(t, o) { for (let i = 0; i < 4; i++) hit({ t: t + i * 0.16, ft: 'lowpass', f: 900, dur: 0.07, vol: 0.13 * V(o) }); },
      drink(t, o) { for (let i = 0; i < 3; i++) { tone({ t: t + i * 0.22, f: 260, f2: 130, dur: 0.14, vol: 0.09 * V(o) }); hit({ t: t + i * 0.22, ft: 'lowpass', f: 700, dur: 0.12, vol: 0.05 * V(o) }); } },
      siren(t, o) { for (let i = 0; i < 4; i++) tone({ t: t + i * 0.4, f: i % 2 ? 640 : 900, dur: 0.4, vol: 0.05 * V(o), type: 'triangle', lp: 1800, rev: 0.4 }); },
      faint(t, o) { tone({ t, f: 300, f2: 60, dur: 1.2, vol: 0.12 * V(o), lp: 700, a: 0.05 }); hit({ t, noise: 'brown', ft: 'lowpass', f: 400, dur: 1.2, vol: 0.12 * V(o) }); },
      flatline(t, o) { tone({ t, f: 1000, dur: 1.4, vol: 0.05 * V(o), hold: 1.2, lp: 3000 }); },
      heartbeat(t, o) { const v = V(o); thump(t, 0.34 * v, 68, 42, 0.14); thump(t + 0.17, 0.24 * v, 60, 38, 0.12); },

      // --- combat ---
      pistol(t, o) {
        const v = V(o);
        hit({ t, f: 2000, f2: 900, q: 0.6, dur: 0.1, vol: 0.55 * v }); hit({ t, ft: 'lowpass', f: 5000, dur: 0.2, vol: 0.32 * v });
        thump(t, 0.5 * v, 170, 45, 0.2); hit({ t: t + 0.03, ft: 'lowpass', f: 1100, dur: 0.6, vol: 0.16 * v, rev: 0.9 });
      },
      shotgun(t, o) {
        const v = V(o);
        hit({ t, f: 1400, f2: 500, q: 0.5, dur: 0.16, vol: 0.7 * v }); hit({ t, ft: 'lowpass', f: 3200, dur: 0.3, vol: 0.45 * v });
        thump(t, 0.7 * v, 120, 30, 0.34); hit({ t: t + 0.04, ft: 'lowpass', f: 800, dur: 0.95, vol: 0.2 * v, rev: 1 });
        SFX.cock(t + 0.42, { vol: 0.7 * v });
      },
      far(t, o) { const v = V(o); hit({ t, ft: 'lowpass', f: 1800, dur: 0.14, vol: 0.32 * v, rev: 0.6 }); thump(t, 0.22 * v, 130, 50, 0.16); hit({ t: t + 0.05, ft: 'lowpass', f: 700, dur: 0.5, vol: 0.09 * v, rev: 0.9 }); },
      cock(t, o) { hit({ t, f: 1800, q: 5, dur: 0.03, vol: 0.2 * V(o) }); hit({ t: t + 0.11, f: 1300, q: 5, dur: 0.035, vol: 0.24 * V(o) }); tone({ t: t + 0.11, f: 700, dur: 0.05, vol: 0.05 * V(o), type: 'square', lp: 1500 }); },
      reload(t, o) { hit({ t, f: 1600, q: 5, dur: 0.03, vol: 0.2 * V(o) }); hit({ t: t + 0.18, f: 900, q: 1, dur: 0.14, vol: 0.13 * V(o) }); hit({ t: t + 0.42, f: 2000, q: 6, dur: 0.035, vol: 0.24 * V(o) }); },
      shell(t, o) { [0, 0.09, 0.16].forEach((d, i) => { tone({ t: t + d, f: 4200 - i * 300, dur: 0.06 - i * 0.01, vol: (0.06 - i * 0.015) * V(o) }); }); },
      ricochet(t, o) { tone({ t, f: 2400, f2: 650, dur: 0.38, vol: 0.06 * V(o), lp: 4000, pan: o.pan }); hit({ t, f: 3200, dur: 0.06, vol: 0.09 * V(o), pan: o.pan }); },
      empty(t, o) { hit({ t, f: 1500, q: 4, dur: 0.025, vol: 0.14 * V(o) }); },
      hurt(t, o) { const v = V(o); thump(t, 0.5 * v, 110, 50, 0.16); hit({ t, ft: 'lowpass', f: 500, dur: 0.25, vol: 0.25 * v }); tone({ t: t + 0.02, f: 190, f2: 110, dur: 0.2, vol: 0.07 * v, type: 'sawtooth', lp: 700 }); },
      punch(t, o) { thump(t, 0.45 * V(o), 130, 60, 0.12); hit({ t, f: 900, dur: 0.06, vol: 0.2 * V(o) }); },
      hitmarker(t, o) { tone({ t, f: 2200, dur: 0.035, vol: 0.09 * V(o), type: 'triangle' }); },
      kill(t, o) { tone({ t, f: 1300, dur: 0.06, vol: 0.09 * V(o), type: 'triangle' }); tone({ t: t + 0.07, f: 1900, dur: 0.1, vol: 0.09 * V(o), type: 'triangle' }); },
      stinger(t, o) {
        [55, 58, 82.4].forEach(f => tone({ t, f, dur: 1.6, vol: 0.09 * V(o), type: 'sawtooth', lp: 500, a: 0.02, rev: 0.5 }));
        thump(t, 0.5 * V(o), 90, 35, 0.5);
      },
    };

    // rate limiting so repeated triggers never pile up into a wall of noise
    const lastAt = {}, MIN_GAP = { step: 0.12, ui_click: 0.04, chip: 0.02, coin: 0.02, hitmarker: 0.05, notify: 0.12, notify_soft: 0.2, alert: 0.25, heartbeat: 0.3, card_deal: 0.05 };
    function play(name, o) {
      o = o || {};
      const fn = SFX[name];
      if (!fn) return false;
      const now = ctx.currentTime, gap = MIN_GAP[name] != null ? MIN_GAP[name] : 0.06;
      if (!o.force && lastAt[name] != null && now - lastAt[name] < gap) return false;
      lastAt[name] = now;
      fn(now + (o.delay || 0) + 0.005, o);
      return true;
    }

    // ---- ambience beds --------------------------------------------------------------------------------
    const beds = {};
    function loopNoise(kind) { const s = ctx.createBufferSource(); s.buffer = NB[kind]; s.loop = true; s.start(0, Math.random() * 2); return s; }
    function lfo(param, rate, depth) { const o = ctx.createOscillator(); o.frequency.value = rate; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return o; }
    function buildBeds() {
      // casino murmur + air-conditioning hum
      const cg = ctx.createGain(); cg.gain.value = 0; const cLP = ctx.createBiquadFilter(); cLP.type = 'lowpass'; cLP.frequency.value = 1500;
      { const n = loopNoise('pink'); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.5;
        const g = ctx.createGain(); g.gain.value = 0.22; lfo(g.gain, 0.11, 0.06); n.connect(bp); bp.connect(g); g.connect(cLP); }
      { const n = loopNoise('brown'); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; const g = ctx.createGain(); g.gain.value = 0.16; n.connect(lp); lp.connect(g); g.connect(cLP); }
      cLP.connect(cg); cg.connect(ambBus); beds.casino = { gain: cg, lp: cLP };
      // street: wind + traffic rumble
      const sg = ctx.createGain(); sg.gain.value = 0; const sLP = ctx.createBiquadFilter(); sLP.type = 'lowpass'; sLP.frequency.value = 1200;
      { const n = loopNoise('pink'); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; const g = ctx.createGain(); g.gain.value = 0.16; lfo(g.gain, 0.07, 0.07); lfo(lp.frequency, 0.05, 220); n.connect(lp); lp.connect(g); g.connect(sLP); }
      { const n = loopNoise('brown'); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; const g = ctx.createGain(); g.gain.value = 0.34; lfo(g.gain, 0.09, 0.1); n.connect(lp); lp.connect(g); g.connect(sLP); }
      sLP.connect(sg); sg.connect(ambBus); beds.street = { gain: sg, lp: sLP };
    }

    // one-off ambience details, called from the scheduler
    const AMB = {
      slotChime(t) {
        const sc = [79, 83, 86, 88, 91, 95], pan = rnd(-0.9, 0.9), n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) bell(t + i * 0.09, mtof(pk(sc)), 0.022, { dur: 0.7, pan, dest: ambBus, rev: 0.6 });
      },
      coins(t) { const pan = rnd(-0.9, 0.9); for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) coin(t + i * rnd(0.05, 0.12), 0.03, { pan, dest: ambBus, rev: 0.5 }); },
      cheer(t) { hit({ t, noise: 'pink', f: 500, f2: 1200, q: 0.7, dur: 1.4, vol: 0.06, a: 0.4, dest: ambBus, pan: rnd(-0.7, 0.7), rev: 0.6 }); },
      car(t) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const src = ctx.createBufferSource(); src.buffer = NB.pink; src.loop = true; src.start(t, 0, 4);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(900, t + 1.4); f.frequency.exponentialRampToValueAtTime(240, t + 3);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 1.4); g.gain.linearRampToValueAtTime(0.0001, t + 3);
        const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-dir * 0.9, t); p.pan.linearRampToValueAtTime(dir * 0.9, t + 3);
        src.connect(f); f.connect(g); g.connect(p); p.connect(ambBus); src.stop(t + 3.1);
        tone({ t, f: 62, f2: 55, dur: 3, vol: 0.03, type: 'sawtooth', lp: 200, a: 1.2, dest: ambBus, pan: dir * 0.3 });
      },
      horn(t) { const p = rnd(-0.8, 0.8); tone({ t, f: 370, dur: 0.35, vol: 0.03, type: 'square', lp: 1200, dest: ambBus, pan: p, rev: 0.5 }); tone({ t, f: 466, dur: 0.35, vol: 0.03, type: 'square', lp: 1200, dest: ambBus, pan: p, rev: 0.5 }); },
      siren(t) { for (let i = 0; i < 8; i++) tone({ t: t + i * 0.6, f: i % 2 ? 620 : 880, dur: 0.6, vol: 0.012, type: 'sine', lp: 900, a: 0.15, dest: ambBus, pan: 0.6, rev: 0.7 }); },
      bird(t) { const f = rnd(2600, 4200); for (let i = 0; i < 3; i++) tone({ t: t + i * 0.11, f, f2: f * 1.3, dur: 0.08, vol: 0.012, dest: ambBus, pan: rnd(-0.8, 0.8), rev: 0.4 }); },
      club(t) { for (let i = 0; i < 8; i++) { thump(t + i * 0.5, 0.035, 90, 45, 0.16, { dest: ambBus, pan: 0.5, lp: 160 }); } },
    };
    let nextAmb = { casino: 0, street: 0 };
    function ambSchedule(until, area, night) {
      const now = ctx.currentTime;
      if (nextAmb.casino < now) nextAmb.casino = now + rnd(0.5, 2);
      if (nextAmb.street < now) nextAmb.street = now + rnd(2, 5);
      if (area.inside) while (nextAmb.casino < until) {
        const r = Math.random();
        if (r < 0.6) AMB.slotChime(nextAmb.casino); else if (r < 0.9) AMB.coins(nextAmb.casino); else AMB.cheer(nextAmb.casino);
        nextAmb.casino += rnd(0.7, 3.2);
      }
      if (!area.inside) while (nextAmb.street < until) {
        const r = Math.random();
        if (r < 0.5) AMB.car(nextAmb.street); else if (r < 0.62) AMB.horn(nextAmb.street);
        else if (night) { if (r < 0.7) AMB.siren(nextAmb.street); else if (r < 0.85) AMB.club(nextAmb.street); }
        else if (r < 0.9) AMB.bird(nextAmb.street);
        nextAmb.street += rnd(2.5, 8);
      }
    }

    // ---- generative lounge music + tension layer --------------------------------------------------------
    const mus = { lp: null, gain: null, beat: 0, next: 0, bpm: 88, started: false, tension: null, tGain: null, tNext: 0, tLevel: 0, tBeat: 0 };
    const CHORDS = [
      { b: 38, v: [53, 57, 60, 64], s: [62, 64, 65, 67, 69, 72] },   // Dm9
      { b: 43, v: [53, 59, 62, 64], s: [67, 69, 71, 72, 74, 76] },   // G13
      { b: 36, v: [55, 59, 62, 64], s: [64, 67, 69, 71, 72, 74] },   // Cmaj9
      { b: 41, v: [57, 60, 64, 67], s: [65, 67, 69, 72, 74, 76] },   // Fmaj9
      { b: 47, v: [57, 62, 65, 69], s: [62, 65, 67, 69, 71, 74] },   // Bm7b5
      { b: 40, v: [56, 59, 62, 66], s: [64, 66, 68, 71, 74, 76] },   // E7
      { b: 45, v: [55, 59, 60, 64], s: [64, 67, 69, 71, 72, 76] },   // Am9
      { b: 45, v: [55, 59, 60, 64], s: [64, 67, 69, 71, 72, 74] },   // Am9
    ];
    function buildMusic() {
      mus.lp = ctx.createBiquadFilter(); mus.lp.type = 'lowpass'; mus.lp.frequency.value = 9000;
      mus.gain = ctx.createGain(); mus.gain.gain.value = 0;
      mus.lp.connect(mus.gain); mus.gain.connect(musicBus);
      const r = ctx.createGain(); r.gain.value = 0.5; mus.lp.connect(r); r.connect(revIn);
      mus.started = true; mus.next = ctx.currentTime + 0.1;
    }
    function epiano(t, f, vol, dur) {
      tone({ t, f, dur, vol, a: 0.006, dest: mus.lp }); tone({ t, f: f * 2, dur: dur * 0.6, vol: vol * 0.32, dest: mus.lp });
      tone({ t, f: f * 7.01, dur: 0.12, vol: vol * 0.1, dest: mus.lp });
    }
    function musicBeat() {
      const beatDur = 60 / mus.bpm, t0 = mus.next, i = mus.beat, bar = Math.floor(i / 4) % 8, b = i % 4, ch = CHORDS[bar], nx = CHORDS[(bar + 1) % 8];
      const sw = beatDur * 0.62;
      // walking bass
      let bn = ch.b;
      if (b === 1) bn = ch.b + 7; else if (b === 2) bn = ch.b + (Math.random() < 0.5 ? 4 : 3) + 0; else if (b === 3) bn = nx.b + (Math.random() < 0.5 ? 1 : -1);
      tone({ t: t0, f: mtof(bn + (bn < 38 ? 12 : 0)), dur: beatDur * 0.95, vol: 0.2, type: 'triangle', a: 0.01, lp: 700, dest: mus.lp });
      // piano comping
      if (b === 0) ch.v.forEach((n, k) => epiano(t0 + k * 0.012, mtof(n), 0.026, 2.2));
      if (b === 1 && Math.random() < 0.7) ch.v.slice(1).forEach(n => epiano(t0 + sw, mtof(n), 0.018, 1.0));
      if (b === 3 && Math.random() < 0.4) ch.v.slice(0, 3).forEach(n => epiano(t0 + sw, mtof(n + 12), 0.014, 0.8));
      // brushes on the ride: "spang-a-lang"
      hit({ t: t0, ft: 'highpass', f: 7000, dur: 0.09, vol: 0.03, a: 0.01, dest: mus.lp });
      if (b === 1 || b === 3) hit({ t: t0 + sw, ft: 'highpass', f: 7000, dur: 0.06, vol: 0.02, a: 0.01, dest: mus.lp });
      if (b === 1 || b === 3) hit({ t: t0, f: 2600, q: 0.7, dur: 0.06, vol: 0.03, dest: mus.lp });   // foot hat on 2 and 4
      // vibraphone lead: a short phrase on some bars
      if (b === 0 && Math.random() < 0.6) mus.phrase = { n: 2 + Math.floor(Math.random() * 3), at: Math.floor(rnd(0, 3)) };
      if (mus.phrase && mus.phrase.at === b) {
        let idx = Math.floor(rnd(1, ch.s.length - 1));
        for (let k = 0; k < mus.phrase.n; k++) {
          const nt = ch.s[Math.max(0, Math.min(ch.s.length - 1, idx))] + (Math.random() < 0.2 ? 12 : 0), s = t0 + (k === 0 ? 0 : sw) + k * beatDur * 0.5;
          tone({ t: s, f: mtof(nt), dur: 1.3, vol: 0.03, a: 0.004, dest: mus.lp }); tone({ t: s, f: mtof(nt) * 4, dur: 0.2, vol: 0.008, dest: mus.lp });
          idx += Math.random() < 0.6 ? -1 : 1;
        }
        mus.phrase = null;
      }
      mus.next += beatDur; mus.beat++;
    }
    function tensionBeat() {
      const lvl = mus.tLevel, bpm = lvl > 1 ? 132 : 92, beatDur = 60 / bpm, t0 = mus.tNext;
      thump(t0, 0.32, 70, 38, 0.22, { dest: mus.tGain });
      if (mus.tBeat % 2 === 1) thump(t0 + beatDur * 0.5, 0.16, 62, 36, 0.14, { dest: mus.tGain });
      for (let k = 0; k < 2; k++) hit({ t: t0 + k * beatDur * 0.5, ft: 'highpass', f: 8000, dur: 0.02, vol: lvl > 1 ? 0.05 : 0.025, dest: mus.tGain });
      if (lvl > 1 && mus.tBeat % 4 === 0) [55, 58].forEach(f => tone({ t: t0, f: f * 2, dur: beatDur * 1.8, vol: 0.05, type: 'sawtooth', lp: 700, dest: mus.tGain }));
      mus.tNext += beatDur; mus.tBeat++;
    }
    function buildTension() {
      mus.tGain = ctx.createGain(); mus.tGain.gain.value = 0; mus.tGain.connect(musicBus);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lfo(lp.frequency, 0.18, 140);
      [55, 58.3, 82.4].forEach(f => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(lp); o.start(); });
      lp.connect(mus.tGain); mus.tNext = ctx.currentTime + 0.1;
    }
    function setTension(level) {
      level = Math.max(0, Math.min(2, level | 0));
      if (level > 0 && !mus.tGain) buildTension();
      if (level > mus.tLevel && level > 0) play('stinger', { vol: 0.8 });
      mus.tLevel = level;
      const now = ctx.currentTime;
      if (mus.tGain) mus.tGain.gain.setTargetAtTime(level ? (level > 1 ? 1 : 0.7) : 0, now, level ? 0.4 : 1.2);
      if (level && mus.tNext < now) mus.tNext = now + 0.05;
    }

    // area state: what should be audible right now
    const area = { inside: true, seated: false, night: false };
    function setArea(a) {
      Object.assign(area, a);
      const now = ctx.currentTime, tc = 0.6;
      if (!beds.casino) return;
      beds.casino.gain.gain.setTargetAtTime(area.inside ? (area.seated ? 0.5 : 1) : 0.1, now, tc);
      beds.casino.lp.frequency.setTargetAtTime(area.inside ? 1500 : 500, now, tc);
      beds.street.gain.gain.setTargetAtTime(area.inside ? (area.night ? 0.06 : 0.1) : (area.night ? 0.8 : 1), now, tc);
      beds.street.lp.frequency.setTargetAtTime(area.inside ? 350 : 1400, now, tc);
      if (mus.gain) {
        const tense = mus.tLevel > 0;
        mus.gain.gain.setTargetAtTime(tense ? 0.15 : area.inside ? (area.seated ? 0.65 : 1) : 0.28, now, tc);
        mus.lp.frequency.setTargetAtTime(area.inside ? 9000 : 700, now, tc);
      }
    }
    function sched(until) {           // called from a timer (live) or directly (offline render)
      if (mus.started) { while (mus.next < until) musicBeat(); }
      if (mus.tGain && mus.tLevel > 0) while (mus.tNext < until) tensionBeat();
      ambSchedule(until, area, area.night);
    }
    function setVolumes(c) {
      const now = ctx.currentTime;
      master.gain.setTargetAtTime(c.muted ? 0 : c.master, now, 0.05);
      sfxBus.gain.setTargetAtTime(c.sfx * 2, now, 0.05);   // one-shots are authored quiet; trim them up to sit above the beds
      musicBus.gain.setTargetAtTime(c.music, now, 0.05);
      ambBus.gain.setTargetAtTime(c.amb, now, 0.05);
    }
    function startBeds() { buildBeds(); buildMusic(); setVolumes(cfg); setArea({}); }
    setVolumes(cfg);
    return { ctx, play, sfxNames: Object.keys(SFX), setVolumes, setArea, setTension, sched, startBeds, area, master, musicBus, sfxBus, ambBus, mus };
  }

  // ---- live wrapper -------------------------------------------------------------------------------------
  const saved = (typeof SETTINGS !== 'undefined' && SETTINGS.audio) || {};
  const cfg = Object.assign({}, DEFAULTS, saved);
  if (typeof SETTINGS !== 'undefined') SETTINGS.audio = cfg;
  const persist = () => { if (typeof saveSettings === 'function') saveSettings(); };

  const audio = {
    ready: false, eng: null, ctx: null, volumes: cfg,
    start() {
      if (audio.eng) { if (audio.ctx.state === 'suspended' && !cfg.muted) audio.ctx.resume().catch(() => {}); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audio.ctx = new AC({ latencyHint: 'interactive' });
        audio.eng = makeAudioEngine(audio.ctx, cfg);
        audio.eng.startBeds();
        audio.ready = true;
        if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
        setInterval(() => { if (audio.eng && audio.ctx.state === 'running') audio.eng.sched(audio.ctx.currentTime + 0.6); }, 150);
      } catch (e) { audio.eng = null; audio.ready = false; }
    },
    setVolume(kind, v) { if (kind in cfg) { cfg[kind] = Math.max(0, Math.min(1, +v)); if (audio.eng) audio.eng.setVolumes(cfg); persist(); } },
    mute(m) {
      cfg.muted = !!m; persist();
      if (audio.eng) { audio.eng.setVolumes(cfg); if (cfg.muted) audio.ctx.suspend().catch(() => {}); else audio.ctx.resume().catch(() => {}); }
    },
    toggleMute() { audio.mute(!cfg.muted); return cfg.muted; },
    isMuted: () => cfg.muted,
    setTension(l) { if (audio.eng) { audio.eng.setTension(l); audio.eng.setArea({}); } },
    play(name, o) { return audio.eng && !cfg.muted && audio.ctx.state === 'running' ? audio.eng.play(name, o) : false; },
    // Render a sound (or the music/ambience) in an OfflineAudioContext and report levels; used for verification.
    async _offline(name, secs = 3, opts = {}) {
      const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const rate = 44100, oc = new OC(2, Math.ceil(rate * secs), rate);
      const eng = makeAudioEngine(oc, Object.assign({}, DEFAULTS, { muted: false }));
      if (name === 'music' || name === 'ambience' || name === 'tension') {
        eng.startBeds(); eng.setArea(Object.assign({ inside: name !== 'ambience' || !opts.street }, opts));
        if (name === 'tension') eng.setTension(opts.level || 1);
        eng.sched(secs);
      } else eng.play(name, Object.assign({ force: true }, opts));
      const buf = await oc.startRendering();
      const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1), N = d0.length;
      let peak = 0, sum = 0, nan = 0, zc = 0, prev = 0, firstLoud = -1;
      for (let i = 0; i < N; i++) {
        const v = (d0[i] + d1[i]) / 2; if (v !== v) nan++;
        const a = Math.abs(v); if (a > peak) peak = a; sum += v * v;
        if (firstLoud < 0 && a > 0.01) firstLoud = i / rate;
        if ((v > 0) !== (prev > 0)) zc++; prev = v;
      }
      // spectral centroid over the loudest 8192-sample window (naive DFT on 64 bins)
      let best = 0, bs = 0; for (let s = 0; s + 8192 < N; s += 4096) { let e = 0; for (let i = 0; i < 8192; i += 8) e += d0[s + i] * d0[s + i]; if (e > best) { best = e; bs = s; } }
      let num = 0, den = 0; const bins = 64;
      for (let k = 1; k < bins; k++) { const f = 60 * Math.pow(2, k / 6); if (f > rate / 2) break; let re = 0, im = 0; for (let i = 0; i < 2048; i++) { const w = d0[bs + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / 2048)); re += w * Math.cos(2 * Math.PI * f * i / rate); im -= w * Math.sin(2 * Math.PI * f * i / rate); } const m = Math.hypot(re, im); num += f * m; den += m; }
      return { name, secs, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / N).toFixed(4), nan, zcr: Math.round(zc / secs), centroidHz: den ? Math.round(num / den) : 0, firstSoundAt: +firstLoud.toFixed(3) };
    },
    names() { return ['ui_click', 'ui_open', 'ui_close', 'ui_start', 'notify', 'notify_soft', 'alert', 'good', 'ach', 'phone_ring', 'phone_open', 'register', 'coin', 'chip', 'chips', 'card_deal', 'card_flip', 'shuffle', 'slot_spin', 'slot_win', 'slot_ldw', 'slot_near', 'jackpot', 'win_small', 'win_big', 'lose', 'roulette_spin', 'dice_roll', 'wheel_spin', 'step', 'door', 'eat', 'drink', 'siren', 'faint', 'flatline', 'heartbeat', 'pistol', 'shotgun', 'far', 'reload', 'shell', 'ricochet', 'empty', 'hurt', 'punch', 'hitmarker', 'kill', 'cock', 'stinger']; },
  };
  window.audio = audio;
  window.sfxPlay = (name, opts) => { try { return audio.play(name, opts); } catch (e) { return false; } };

  // Unlock on the first user gesture (browsers refuse to start audio before one).
  const unlock = () => { audio.start(); if (audio.ready) ['pointerdown', 'keydown', 'touchend', 'click'].forEach(ev => window.removeEventListener(ev, unlock, true)); };
  ['pointerdown', 'keydown', 'touchend', 'click'].forEach(ev => window.addEventListener(ev, unlock, true));
  // pause audio when the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (!audio.eng) return;
    if (document.hidden) audio.ctx.suspend().catch(() => {}); else if (!cfg.muted) audio.ctx.resume().catch(() => {});
  });

  // ---- game glue: ambience by area, tension music, heartbeat, footsteps -----------------------------------
  // Runs on a 250 ms timer (never per frame). Reads the game's globals defensively.
  let hbNext = 0, lastArea = '';
  function zoneFloor() {
    let f = 'carpet';
    try {
      if (player.y > CASINO_BOTTOM) return 'pavement';
      for (const z of ZONES) if (z.floor && player.x >= z.x && player.x <= z.x + z.w && player.y >= z.y && player.y <= z.y + z.h) f = z.floor;
    } catch (e) { /* world not ready */ }
    if (f === 'sidewalk') return 'pavement';
    if (f === 'marbleDark') return 'marble';
    if (f.indexOf('carpet') === 0) return 'carpet';
    return f;
  }
  audio.surface = 'carpet';
  setInterval(() => {
    if (!audio.ready || typeof S === 'undefined' || !S || !audio.eng) return;
    try {
      audio.surface = zoneFloor();
      const inside = player.y < CASINO_BOTTOM;
      const seated = typeof gameSession !== 'undefined' && !!gameSession;
      const night = typeof isNight === 'function' ? isNight() : false;
      const key = inside + '|' + seated + '|' + night + '|' + (audio.eng.mus.tLevel);
      let tl = 0;
      if (typeof activeOf === 'function' && !S.ended) {
        const hostile = typeof hostiles === 'function' ? hostiles().length : 0;
        const stalking = activeOf('robber').length + activeOf('thug').length;
        tl = hostile ? 2 : stalking ? 1 : 0;
      }
      if (tl !== audio.eng.mus.tLevel) audio.eng.setTension(tl);
      if (key !== lastArea) { lastArea = key; audio.eng.setArea({ inside, seated, night }); }
      // heartbeat at low health (faster as health drops)
      const now = audio.ctx.currentTime;
      if (S.health < 35 && !S.ended && !cfg.muted) {
        const period = 0.55 + (S.health / 35) * 0.6;
        if (hbNext < now - 1) hbNext = now;
        while (hbNext < now + 0.3) { audio.eng.play('heartbeat', { delay: Math.max(0, hbNext - now), vol: 1 - S.health / 60, force: true }); hbNext += period; }
      }
    } catch (e) { /* keep the timer alive */ }
  }, 250);
})();

