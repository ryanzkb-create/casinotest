'use strict';

// ---------------------------------------------------------------------------
// Progression and depth: reality-check achievements, the objective helper, the
// VIP host and casino credit line ("marker"), player-driven street and casino
// events, room service and sleep quality, the news ticker and the epilogue.
// Nothing here changes any game odds; comps and offers always cost more in
// expected losses than they pay out, and the game says so.
// ---------------------------------------------------------------------------
(function () {
  const wrap = (name, make) => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (...a) { return make(orig, a, this); };
  };
  const play = (n, o) => { if (window.sfxPlay) window.sfxPlay(n, o); };
  const started = () => !!(window.GMSave && GMSave.started);
  const HOST = '🎩 Diana, VIP Host';

  // all extra per-run state lives in S.x so it saves and resets with the run
  function X() {
    if (!S.x) S.x = {};
    const x = S.x;
    x.ach = x.ach || {};
    x.marker = x.marker || { owed: 0, principal: 0, due: null, overdueDays: 0, borrowed: 0, fees: 0, reminded: false };
    x.host = x.host || { day: -1, active: null, offer: null, done: 0, expired: 0 };
    x.events = x.events || {};
    x.bj = x.bj || [];
    x.spent = x.spent || 0; x.atmFees = 0 + (x.atmFees || 0);
    x.chase = x.chase || 0; x.winStreak = x.winStreak || 0; x.lastBet = x.lastBet || 0; x.lastProfit = x.lastProfit || 0;
    x.lastEvent = x.lastEvent || 0; x.bjBan = x.bjBan || 0; x.flags = x.flags || {};
    return x;
  }
  const dayNum = () => Math.floor(S.minutes / 1440);
  const gambleNet = () => S.stats.returned - S.stats.wagered;

  // ---- third debt source: the casino marker --------------------------------------------------------------
  const MARKER = { fee: 0.25, termDays: 5, overdueRate: 0.05, minWagered: 50_000 };
  const markerOverdue = () => { const m = X().marker; return m.owed > 0.5 && m.due !== null && S.minutes > m.due; };
  function markerLimit() {
    const m = X().marker;
    const cap = Math.min(500_000, Math.max(10_000, Math.round(S.stats.wagered * 0.10 / 5000) * 5000));
    return S.stats.wagered >= MARKER.minWagered ? Math.max(0, cap - m.principal) : 0;
  }
  function takeMarker(amount, viaAtm) {
    const m = X().marker;
    const owedAdd = Math.round(amount * (1 + MARKER.fee));
    if (m.owed <= 0.5) { m.due = S.minutes + MARKER.termDays * 1440; m.overdueDays = 0; m.reminded = false; }
    m.owed += owedAdd; m.principal += amount; m.borrowed += amount; m.fees += owedAdd - amount;
    let cash = amount;
    if (viaAtm) { const fee = 7.99 + Math.round(amount * 0.05); cash -= fee; X().atmFees += fee; }
    S.cash += cash; S.stats.borrowed += amount;
    play('register');
    addMsg('🏦 Golden Mirage Credit', `Marker approved: ${fmt(amount)} advanced. You owe ${fmt(owedAdd)} (${MARKER.fee * 100}% finance charge) by ${clockText(m.due)}. After that: ${MARKER.overdueRate * 100}% per day and your rewards are suspended.`);
    lesson('marker', 'A casino "marker" is a loan the casino makes so you can keep playing. The 25% charge is paid before you have placed a single bet, which means you start every session behind.');
    afterAction();
  }
  function markerAccrue(dm) {
    const m = X().marker;
    if (m.owed <= 0.5) return;
    if (!m.reminded && m.due !== null && m.due - S.minutes < 720 && S.minutes < m.due) {
      m.reminded = true;
      addMsg('🏦 Golden Mirage Credit', `Reminder: your marker of ${fmt(m.owed)} is due in ${durationText(m.due - S.minutes)}. We would hate for this to affect your rewards status.`);
    }
    if (S.minutes > m.due) {
      const before = m.owed;
      m.owed *= Math.pow(1 + MARKER.overdueRate, dm / 1440);
      S.stats.interest += m.owed - before;
      const od = Math.floor((S.minutes - m.due) / 1440) + 1;
      while (m.overdueDays < od) {
        m.overdueDays++;
        if (m.overdueDays === 1) {
          S.bank.credit = 'bad';
          addMsg(HOST, `I am sorry to say your marker is past due. Your rewards status is suspended, the balance now grows ${MARKER.overdueRate * 100}% a day, and it has been reported to the credit bureaus. Please settle it in the Host app.`);
        } else addMsg('🏦 Golden Mirage Credit', `Day ${m.overdueDays} overdue. You now owe ${fmt(m.owed)}.`);
      }
    }
  }
  wrap('totalDebt', orig => orig() + (S && S.x && S.x.marker ? S.x.marker.owed : 0));
  wrap('advanceTime', (orig, a) => { const m0 = S.minutes; const r = orig(...a); const dm = S.minutes - m0; if (dm > 0 && S.x && S.x.marker) markerAccrue(dm); return r; });
  wrap('tierIndex', orig => (S && S.x && S.x.marker && markerOverdue() ? 0 : orig()));   // rewards are suspended while a marker is overdue

  // ATM: convenience is the product. Cash advances against the casino credit line, with fees.
  window.atm = function () {
    const limit = markerLimit(), m = X().marker;
    const btns = [];
    if (limit > 0) [5000, 25000, 100000].forEach(v => {
      const amt = Math.min(v, limit);
      if (amt >= 1000 && !btns.some(b => b.amt === amt)) btns.push({ amt, label: `Cash advance ${fmt(amt)}: fee ${fmt(7.99 + Math.round(amt * 0.05))} now, ${fmt(Math.round(amt * (1 + MARKER.fee)))} owed`, cls: 'danger', fn: () => { closeModal(true); takeMarker(amt, true); toast(`🏧 ${fmt(amt)} dispensed (fees taken).`, 'danger'); }, });
    });
    infoDialog('🏧 ATM', `<p>Available balance: <b>${fmt(S.cash)}</b></p>
      <p>${limit > 0 ? `Your players card has a casino credit line available: <b>${fmt(limit)}</b>.` : `Credit line: <span class="muted">not available until you have wagered ${fmt(MARKER.minWagered)}.</span>`}</p>
      ${m.owed > 0.5 ? `<p>Marker balance: <b class="lose">${fmt(m.owed)}</b></p>` : ''}
      <p class="muted">Casinos put ATMs right on the gaming floor so you never have to leave to get more money. Cash advances add fees on top of the interest.</p>`, btns);
  };

  // ---- VIP host: offers and the credit line -----------------------------------------------------------------
  function avgEdge() { return S.stats.wagered > 0 ? S.stats.expectedLoss / S.stats.wagered : 0.03; }
  function makeOffer() {
    const st = S.stats, h = X().host;
    const req = Math.min(250_000, Math.max(10_000, Math.round(st.wagered * 0.2 / 5000) * 5000));
    let type = 'freeplay';
    if (gambleNet() < -100_000) type = Math.random() < 0.7 ? 'comeback' : 'room';
    else if (tierIndex() >= 2 && Math.random() < 0.4) type = 'room';
    const o = { type, req, expires: S.minutes + 1440 };
    if (type === 'freeplay') { o.reward = Math.round(req * 0.008); o.title = `$${o.reward.toLocaleString()} FREE PLAY`; o.pitch = 'Just for you: play today and we will load free play onto your card.'; }
    if (type === 'comeback') { o.reward = Math.round(req * 0.006); o.title = 'WE MISS YOU!'; o.pitch = `Rough night? Come back and let us make it right: ${fmt(o.reward)} free play plus dinner for two.`; }
    if (type === 'room') { o.reward = CONFIG.HOTEL_PRICE; o.title = 'A COMPLIMENTARY SUITE'; o.pitch = 'Your suite is reserved. Stay as our guest, and enjoy your evening on us.'; }
    h.offer = o;
    addMsg(HOST, `${o.title}: ${o.pitch} Open the Host app for details.`);
  }
  function hostTick() {
    const h = X().host;
    if (h.active) {
      const a = h.active, done = S.stats.wagered - a.startWagered;
      if (done >= a.req && !blocked()) {
        h.active = null; h.done++;
        S.cash += a.reward; S.stats.compsValue += a.reward;
        const exp = S.stats.expectedLoss - a.startExp, act = (S.stats.returned - S.stats.wagered) - a.startNet;
        addMsg(HOST, `Congratulations! ${fmt(a.reward)} has been credited to your card. Enjoy!`);
        infoDialog('🎩 Offer complete', `<p>You received <b>${fmt(a.reward)}</b> of "free" play.</p>
          <p>To get it you wagered <b>${fmt(a.req)}</b>. Over that stretch the house edge expected to take <b class="lose">${fmt(exp)}</b>; your actual result was <b class="${act >= 0 ? 'win' : 'lose'}">${fmt(act)}</b>.</p>
          <p class="muted">This is how "gifts" work: they are priced from your expected losses, so they always cost you more than they are worth.</p>`);
        play('register'); afterAction();
      } else if (done < a.req && S.minutes > a.expires) {
        h.active = null; h.expired++;
        addMsg(HOST, `Your offer expired with ${fmt(a.req - done)} of play still to go. Do not worry: a new one will be waiting tomorrow.`);
        lesson('offerexp', 'Offers with a deadline are designed to make you play longer than you planned. Missing one costs you nothing; chasing one costs money.');
      }
    }
    if (h.day !== dayNum() && !h.active && S.stats.wagered >= 5000) { h.day = dayNum(); makeOffer(); }
  }
  function appHost(body) {
    const x = X(), h = x.host, m = x.marker, st = S.stats;
    body.innerHTML = `<h3>🎩 VIP Host</h3>
      <div class="chat"><div class="bubble">Hi, it is Diana, your personal host at the Golden Mirage. Anything you need, day or night. 😊</div></div>`;
    // offer
    if (h.active) {
      const a = h.active, done = Math.max(0, st.wagered - a.startWagered), pct = clamp(done / a.req * 100, 0, 100);
      body.appendChild(el('div', 'card-box', `<b>Active offer: ${a.title}</b>
        <div class="progress"><div style="width:${pct}%"></div></div>
        <div>Wagered ${fmt(done)} of ${fmt(a.req)} · expires in ${durationText(a.expires - S.minutes)}</div>
        <div class="muted">Reward: ${fmt(a.reward)}. Expected loss for the play needed: about ${fmt(a.req * avgEdge())}.</div>`));
    } else if (h.offer && h.offer.expires > S.minutes) {
      const o = h.offer, box = el('div', 'card-box offer-card', `<div class="offer-title">${o.title}</div><div>${o.pitch}</div>
        <div class="muted">Wager ${fmt(o.req)} within 24 hours to receive ${fmt(o.reward)}.</div>`);
      const math = el('div', 'offer-math hidden', `<b>The math they don't show:</b> wagering ${fmt(o.req)} at your average house edge (${(avgEdge() * 100).toFixed(1)}%) is expected to cost you about <b class="lose">${fmt(o.req * avgEdge())}</b> to collect <b>${fmt(o.reward)}</b>. The "gift" is a discount on money you were going to lose.`);
      const row = el('div', 'phone-row');
      const acc = el('button', 'pbtn primary', 'Accept offer');
      acc.onclick = () => { h.active = { type: o.type, title: o.title, req: o.req, reward: o.reward, expires: S.minutes + 1440, startWagered: st.wagered, startExp: st.expectedLoss, startNet: st.returned - st.wagered }; h.offer = null; play('good'); lesson('offer', 'Offers are personalised from your betting history. A "free" reward that needs you to bet ten or a hundred times its value is a cost, not a gift.'); showApp('host'); };
      const why = el('button', 'pbtn', 'Show the math');
      why.onclick = () => math.classList.toggle('hidden');
      row.appendChild(acc); row.appendChild(why);
      box.appendChild(row); box.appendChild(math); body.appendChild(box);
    } else {
      body.appendChild(el('p', 'muted', st.wagered >= 5000 ? 'No offers right now. Diana will text you when a new one is ready (they tend to arrive when you are losing).' : 'Play a few games and Diana will start sending you special offers.'));
    }
    // credit line
    body.appendChild(el('div', 'phone-sub', 'Casino credit line (marker)'));
    const limit = markerLimit();
    body.appendChild(el('div', 'card-box', `<div>Balance owed: <b class="${m.owed > 0.5 ? 'lose' : ''}">${fmt(m.owed)}</b>${m.owed > 0.5 ? ` · ${markerOverdue() ? '<span class="lose">OVERDUE</span>' : 'due in ' + durationText(m.due - S.minutes)}` : ''}</div>
      <div class="muted">Terms: ${MARKER.fee * 100}% finance charge up front, due in ${MARKER.termDays} days, then ${MARKER.overdueRate * 100}% a day, rewards suspended and a credit report.</div>
      ${S.stats.wagered < MARKER.minWagered ? `<div class="muted">Unlocks after you have wagered ${fmt(MARKER.minWagered)}. The casino only lends to people it expects to keep playing.</div>` : `<div>Available: <b>${fmt(limit)}</b></div>`}`));
    if (m.owed > 0.5) {
      body.appendChild(amountButtons([
        { label: '$10K', value: Math.min(10_000, m.owed) },
        { label: '$50K', value: Math.min(50_000, m.owed) },
        { label: 'Pay in full', value: m.owed, cls: 'primary' },
      ], amt => {
        if (S.cash < amt) { toast(`You only have ${fmt(S.cash)}.`, 'danger'); return; }
        S.cash -= amt; m.owed -= amt; m.principal = Math.min(m.principal, m.owed);
        if (m.owed < 0.5) { m.owed = 0; m.principal = 0; m.due = null; m.overdueDays = 0; addMsg(HOST, 'Thank you, your marker is settled. Your rewards are active again. We hope to see you back at the tables soon!'); }
        else toast(`🎩 Paid ${fmt(amt)} toward your marker.`);
        play('register'); afterAction(); showApp('host');
      }));
    }
    if (limit >= 1000) {
      body.appendChild(el('div', 'muted', 'Take a marker:'));
      body.appendChild(amountButtons([
        { label: '$10K', value: Math.min(10_000, limit) },
        { label: '$50K', value: Math.min(50_000, limit) },
        { label: `Max ${fmtShort(limit)}`, value: limit, cls: 'danger' },
      ], amt => { takeMarker(amt, false); if (!S.ended) showApp('host'); }));
    }
    body.appendChild(el('p', 'muted', `Comps received: ${fmt(st.compsValue)}. The house edge expected you to lose ${fmt(st.expectedLoss)} to earn them.`));
  }

  // ---- achievements ("reality checks") ------------------------------------------------------------------------
  const ACH = [
    { id: 'first_bet', icon: '🎲', name: 'The first bet', desc: 'Placed your first bet. Nobody plans for it to be more than one.', ok: () => S.stats.rounds >= 1 },
    { id: 'rounds100', icon: '🔁', name: 'One hundred bets', desc: 'Every bet is a small tax. After 100 you have paid a lot of it.', ok: () => S.stats.rounds >= 100 },
    { id: 'lost100k', icon: '💸', name: 'First $100k lost', desc: 'Your gambling result reached -$100,000.', ok: () => gambleNet() <= -100_000 },
    { id: 'lost500k', icon: '🏦', name: 'Half a million to the house', desc: 'Your gambling result reached -$500,000.', ok: () => gambleNet() <= -500_000 },
    { id: 'half', icon: '📉', name: 'Half of it gone', desc: 'Your net worth fell below $1,000,000.', ok: () => netWorth() < CONFIG.START_CASH / 2 },
    { id: 'chased', icon: '🏃', name: 'Chased losses', desc: 'Raised your bet right after a loss, three times. It is the classic sign of problem gambling.', ok: () => X().chase >= 3 },
    { id: 'cold', icon: '🥶', name: '"I must be due"', desc: 'Lost 8 bets in a row. A win is never "due".', ok: () => S.stats.lossStreak >= 8 },
    { id: 'wagered1m', icon: '🎰', name: 'Bet a million dollars', desc: 'Total wagered passed $1,000,000. The house expects to keep a slice of every dollar of it.', ok: () => S.stats.wagered >= 1_000_000 },
    { id: 'ldw', icon: '🎭', name: 'Fooled by a fake win', desc: 'Got a celebration for a "win" that paid less than you bet.', ok: () => !!S.lessonsShown.ldw },
    { id: 'nearmiss', icon: '😬', name: 'So close!', desc: 'Saw a near miss. They are shown on purpose.', ok: () => !!S.lessonsShown.nearmiss },
    { id: 'comped', icon: '🎁', name: 'Free is never free', desc: 'Accepted a comp. It was paid for with your expected losses.', ok: () => S.stats.compsValue > 0 },
    { id: 'platinum', icon: '💎', name: 'Platinum', desc: 'The casino treats you like royalty because you are worth a lot to them.', ok: () => S.tierIdx >= 3 },
    { id: 'bait', icon: '🪝', name: 'Took the bait', desc: 'Completed a host offer. Read the math afterwards.', ok: () => X().host.done >= 1 },
    { id: 'broke', icon: '🪙', name: 'Down to your last $1,000', desc: 'Cash below $1,000.', ok: () => !!S.brokeNotified },
    { id: 'bank', icon: '🏧', name: 'Borrowed to gamble', desc: 'Took a bank loan.', ok: () => S.bank.borrowedTotal > 0 },
    { id: 'marker', icon: '✍️', name: 'Signed a marker', desc: 'Borrowed from the casino itself, at 25% before the first bet.', ok: () => X().marker.borrowed > 0 },
    { id: 'shark', icon: '🦈', name: 'Took a loan shark loan', desc: 'Borrowed from Tony at 10% a day.', ok: () => X().flags.shark || S.shark.principal > 0 },
    { id: 'vig', icon: '⛓️', name: 'Paid only the vig', desc: 'Paid just the interest. The debt stayed exactly where it was.', ok: () => !!S.lessonsShown.vig },
    { id: 'pawn', icon: '💍', name: 'Sold your things', desc: 'Pawned something to keep playing.', ok: () => !S.inventory.watch || !S.inventory.ring || !S.inventory.laptop },
    { id: 'ring', icon: '💔', name: 'The wedding ring', desc: 'Sold the wedding ring. Home noticed.', ok: () => !S.inventory.ring },
    { id: 'street', icon: '📦', name: 'Slept on the street', desc: 'Slept outside on cardboard.', ok: () => !!X().flags.street },
    { id: 'hospital', icon: '🚑', name: 'Ended up in the hospital', desc: 'Collapsed and woke up with a bill.', ok: () => S.stats.collapses > 0 },
    { id: 'robbed', icon: '🥷', name: 'Robbed', desc: 'Someone took your cash on the Strip.', ok: () => S.stats.robbed > 0 },
    { id: 'crew', icon: '🕴️', name: "Tony's crew found you", desc: 'Debt collectors caught up with you.', ok: () => S.stats.harassed > 0 },
    { id: 'tout', icon: '🗣️', name: 'Paid a tout', desc: 'Paid a stranger for a "sure thing". It was not.', ok: () => !!X().flags.tout },
    { id: 'ritual', icon: '🍀', name: 'Lucky ritual', desc: 'Tried a superstition. The odds did not care.', ok: () => !!X().flags.ritual },
    { id: 'banned', icon: '🚫', name: 'Backed off blackjack', desc: 'Casinos welcome losers and eject winners.', ok: () => X().bjBan > 0 },
    { id: 'day3', icon: '📆', name: 'Three days in', desc: 'Survived 3 days without leaving.', ok: () => S.minutes - 20 * 60 >= 3 * 1440 },
    { id: 'day7', icon: '🗓️', name: 'A week without windows', desc: 'Survived 7 days without leaving.', ok: () => S.minutes - 20 * 60 >= 7 * 1440 },
    { id: 'walked', icon: '🚌', name: 'Walked away', desc: 'Got on the bus. The only sure win.', ok: () => false, endOnly: true },
    { id: 'walked_ahead', icon: '🍀', name: 'Walked away ahead', desc: 'Left with more than you arrived with (which is luck, not skill).', ok: () => false, endOnly: true },
  ];
  function unlock(a) {
    const x = X();
    if (x.ach[a.id]) return;
    x.ach[a.id] = S.minutes;
    const c = window.GMSave ? GMSave.career() : null;
    const first = c && !c.achievements[a.id];
    if (c) { c.achievements[a.id] = c.achievements[a.id] || Date.now(); GMSave.saveCareer(); }
    toast(`🏆 <b>Reality check:</b> ${a.icon} ${a.name}${first ? '' : ''}<br><span class="muted">${a.desc}</span>`, 'ach', 6500);
  }
  function checkAch() { for (const a of ACH) if (!a.endOnly && !X().ach[a.id]) { try { if (a.ok()) unlock(a); } catch (e) { /* ignore */ } } }

  // track bets for chasing, streaks and card-counter style attention
  wrap('settle', (orig, [game, bet, returned, edge]) => {
    const x = X();
    if (x.lastProfit < 0 && bet >= x.lastBet * 1.5 && bet >= 100) x.chase++;
    const profit = orig(game, bet, returned, edge);
    x.lastBet = bet; x.lastProfit = profit;
    x.winStreak = profit > 0 ? x.winStreak + 1 : 0;
    if (profit >= 100_000) x.pitboss = true;
    if (/Blackjack/.test(game)) {
      x.bj.push({ bet, profit }); if (x.bj.length > 10) x.bj.shift();
      const sum = x.bj.reduce((s, r) => s + r.profit, 0), lo = Math.min(...x.bj.map(r => r.bet)), hi = Math.max(...x.bj.map(r => r.bet));
      if (x.bj.length >= 8 && sum >= 40_000 && hi / lo >= 4) { x.security = true; x.bj = []; }
    }
    return profit;
  });
  wrap('pay', (orig, a) => { const ok = orig(...a); if (ok && S.x) S.x.spent = (S.x.spent || 0) + a[0]; return ok; });
  wrap('streetSleep', (orig, a) => { X().flags.street = true; return orig(...a); });
  wrap('startGame', (orig, a) => {
    const o = a[0], x = X();
    if (o && /blackjack/.test(o.type) && S.minutes < x.bjBan) {
      infoDialog('🚫 Blackjack: not tonight', `<p>A pit boss steps in: "Sir, we're going to ask you to play something else. We're not comfortable with your play at these tables."</p>
        <p>You can play again in <b>${durationText(x.bjBan - S.minutes)}</b>.</p>
        <p class="muted">Casinos love losing players and quietly eject winning ones. You can be barred for winning; nobody is ever barred for losing.</p>`);
      return;
    }
    return orig(...a);
  });

  // ---- dynamic events ------------------------------------------------------------------------------------------
  const cool = (k, hours) => { const x = X(); return !x.events[k] || S.minutes - x.events[k] >= hours * 60; };
  const mark = k => { const x = X(); x.events[k] = S.minutes; x.lastEvent = S.minutes; };
  const EVENTS = {
    tout: {
      ok: () => !isOutside() && (S.stats.lossStreak >= 3 || S.cash < CONFIG.START_CASH * 0.7) && cool('tout', 8), w: 3,
      run() {
        infoDialog('🗣️ "Psst. I have a system."', `<p>A man in a loud jacket sidles up. "Nine blacks in a row, friend. Red is DUE. Bet big on red. For $500 I'll show you the pattern that never fails."</p>`, [
          { label: 'Pay $500 for the tip', cls: 'danger', fn: () => { if (!pay(500)) return; X().flags.tout = true; closeModal(true); infoDialog('📝 The "system"', '<p>He hands you a napkin: <b>"Bet red."</b> and disappears into the crowd.</p><p>Red has exactly the same odds as before (18 in 38 on American roulette). Past spins do not change the next one. You paid $500 for nothing.</p>'); } },
          { label: 'Wave him off', fn: () => { closeModal(true); toast('Good instinct. "Sure things" are always for sale to someone else.', 'win'); } },
        ]);
      },
    },
    hothand: {
      ok: () => X().winStreak >= 3 && cool('hothand', 6), w: 6,
      run() {
        const say = txt => { closeModal(true); infoDialog('🍀 Superstition', txt); };
        infoDialog('🔥 "I\'m hot!"', `<p>Three wins in a row. Your palms itch. Something tells you the streak is <i>yours</i>. What do you do?</p>`, [
          { label: 'Rub the machine for luck', fn: () => { X().flags.ritual = true; say('<p>You rub it. It feels lucky. The next result is generated by the same random numbers as the last one: nothing changed, except that you feel more in control.</p><p class="muted">Rituals and "hot streaks" are how the brain turns pure chance into skill.</p>'); } },
          { label: 'Switch to a "lucky" seat', fn: () => { X().flags.ritual = true; say('<p>You move. The odds move with you: they are identical everywhere in the room. A machine is never "due" or "cold".</p>'); } },
          { label: 'Bet bigger: ride the streak', cls: 'danger', fn: () => say('<p>Bigger bets do not make wins more likely. They make the expected loss bigger: the same percentage, of a bigger number.</p>') },
          { label: 'Stay calm, keep bets the same', cls: 'primary', fn: () => say('<p>The best move is the least exciting one. A streak is a coincidence, not a trend. Better still: cash out while ahead.</p>') },
        ]);
      },
    },
    pickpocket: {
      ok: () => S.cash >= 5000 && cool('pickpocket', 10), w: 2,
      run() {
        const amt = Math.round(clamp(S.cash * 0.02, 200, 3000));
        infoDialog('🫳 A tug at your pocket', `<p>Someone bumps you hard in the crowd and you feel a hand near your pocket.</p>`, [
          { label: 'Grab the hand!', cls: 'danger', fn: () => { closeModal(true); if (Math.random() < 0.4) toast('You catch his wrist. He drops your wallet and vanishes.', 'win'); else { S.cash -= amt; toast(`🫳 He wriggles free. ${fmt(amt)} gone.`, 'danger'); afterAction(); } } },
          { label: 'Check your pockets', fn: () => { closeModal(true); if (Math.random() < 0.6) toast('Everything is there. Phew.'); else { S.cash -= amt; toast(`💸 Your wallet is ${fmt(amt)} lighter.`, 'danger'); afterAction(); } } },
        ]);
      },
    },
    drunk: {
      ok: () => !isOutside() && cool('drunk', 10), w: 2,
      run() {
        infoDialog('🥴 Walt, the drunk gambler', `<p>A man leans on you, reeking of whisky. "Buddy! Lend me three hundred. I'm DUE, I can feel it. I'll pay you back double, I swear."</p>`, [
          { label: 'Lend him $300', fn: () => { if (S.cash < 300) { toast('You cannot spare it.'); return; } S.cash -= 300; closeModal(true); toast('💸 He is gone before you finish blinking.', 'danger'); afterAction(); } },
          { label: 'Buy him a coffee ($7)', fn: () => { if (!pay(7)) return; closeModal(true); infoDialog('☕ Walt, sober-ish', `<p>Over the coffee he tells you he lost his house at this casino, three years ago. "I always thought the next bet would fix it."</p><p class="muted">Almost everyone at the tables thinks they are the exception.</p>`); } },
          { label: 'Say no', fn: () => closeModal(true) },
        ]);
      },
    },
    pitboss: {
      ok: () => !!X().pitboss && !isOutside(), w: 20,
      run() {
        X().pitboss = false;
        infoDialog('🤵 A pit boss appears', `<p>"What a run, sir! Dinner is on the house at the steakhouse tonight, and we'll keep your seat warm."</p>`, [
          { label: 'Accept the comp dinner', cls: 'primary', fn: () => { closeModal(true); S.stats.compsValue += 240; eat(100, 30, 10, 90); toast('🥩 Comp dinner: fully fed (90 minutes).'); lesson('pitboss', 'The pit boss is paid to keep big winners at the table. Dinner is free because the longer you stay, the more likely the house edge takes the winnings back.'); } },
          { label: 'Politely decline', fn: () => { closeModal(true); toast('Leaving while ahead is the hardest move in gambling.', 'win'); } },
        ]);
      },
    },
    security: {
      ok: () => !!X().security && !isOutside(), w: 30,
      run() {
        const x = X(); x.security = false; x.bjBan = S.minutes + 1440;
        infoDialog('🕶️ Security would like a word', `<p>Two men in suits walk you away from the table. "We've been watching your bet sizes. You are welcome to enjoy any other game, but not blackjack. Not for a while."</p>
          <p class="muted">Blackjack banned for 24 hours. Casinos do not mind you losing. They mind you winning.</p>`);
      },
    },
  };
  function eventTick() {
    const x = X();
    if (!started() || blocked() || S.ended || player.seated) return;
    if (typeof hostiles === 'function' && hostiles().length) return;
    if (S.minutes - x.lastEvent < 120) return;
    const cands = Object.keys(EVENTS).filter(k => { try { return EVENTS[k].ok(); } catch (e) { return false; } });
    if (!cands.length) return;
    const tot = cands.reduce((s, k) => s + EVENTS[k].w, 0);
    let r = Math.random() * tot, pickK = cands[0];
    for (const k of cands) { r -= EVENTS[k].w; if (r <= 0) { pickK = k; break; } }
    if ((pickK === 'pitboss' || pickK === 'security') || Math.random() < 0.35) { mark(pickK); play('alert', { vol: 0.5 }); EVENTS[pickK].run(); }
  }

  // ---- hotel: sleep quality and room service -----------------------------------------------------------------
  function sleepQuality(street) {
    let q = 1; const why = [];
    if (totalDebt() > 0) { q -= 0.15; why.push('worrying about your debt'); }
    if (sharkOverdue()) { q -= 0.2; why.push("Tony's overdue threats"); }
    if (S.stats.lossStreak >= 5) { q -= 0.1; why.push('replaying your losses'); }
    if (S.thirst < 30 || S.hunger < 30) { q -= 0.1; why.push('going to bed hungry or thirsty'); }
    if (street) { q -= 0.25; why.push('the cold pavement and the noise'); }
    else if (tierIndex() >= 4) q += 0.1;
    return { q: clamp(q, 0.35, 1), why };
  }
  wrap('sleep', (orig, [hours, gain, maxE]) => {
    const sq = sleepQuality(isOutside());
    X().lastSleep = sq;
    const r = orig(hours, gain * sq.q, maxE);
    if (isOutside()) toast(`😴 Sleep quality ${Math.round(sq.q * 100)}%${sq.why.length ? ': ' + sq.why.join(', ') : ''}`, 'info', 5000);
    return r;
  });
  window.hotel = function () {
    const t = tierIndex(), comp = t >= 3, suite = t >= 4, room = suite ? 'Penthouse Suite' : 'Deluxe Room';
    const roomSvc = comp ? 'comped' : '$85';
    const buttons = [
      { label: comp ? `Sleep in the ${room} (free)` : `Book a room — ${fmt(CONFIG.HOTEL_PRICE)}`, cls: 'primary', fn: () => {
        if (comp) S.stats.compsValue += suite ? 2500 : CONFIG.HOTEL_PRICE;
        else if (!pay(CONFIG.HOTEL_PRICE)) { toast('Card declined. The street is free…', 'danger'); return; }
        closeModal(true);
        sleep(8, 100, 100);
        afterAction();
        if (S.ended) return;
        const sq = X().lastSleep || { q: 1, why: [] };
        infoDialog(suite ? '🌇 Penthouse Suite' : '🛏️ Hotel Room', `<p>You slept 8 hours. Sleep quality: <b class="${sq.q < 0.75 ? 'lose' : 'win'}">${Math.round(sq.q * 100)}%</b>${sq.why.length ? ` (${sq.why.join(', ')})` : ''}.</p>
          <p>It's now <b>${clockText()}</b>.</p>
          ${comp ? '<p class="muted">The casino gave you this room because, by their math, you are worth far more to them at the tables.</p>' : ''}${statLine()}`, [
          { label: `Order breakfast to the room (${roomSvc})`, fn: () => { if (comp) S.stats.compsValue += 85; else if (!pay(85)) return; closeModal(true); eat(45, 25, 0, 30); toast('🍳 Room service: hunger +45, thirst +25.'); } },
        ]);
      } },
      { label: `Room service to the lobby lounge (${roomSvc})`, fn: () => { if (comp) S.stats.compsValue += 85; else if (!pay(85)) return; closeModal(true); eat(45, 25, 0, 30); toast('🍳 Room service: hunger +45, thirst +25.'); lesson('roomsvc', 'Room service costs several times what the same meal costs a block away. Convenience is priced into everything at a resort.'); } },
    ];
    infoDialog('🛎️ Hotel Front Desk', `<p>${comp ? `Welcome back, valued ${TIERS[t].name} guest! Your <b>${room}</b> is complimentary.` : `A room for the night is <b>${fmt(CONFIG.HOTEL_PRICE)}</b>. (Platinum members stay free.)`}</p>
      <p>Sleeping 8 hours restores your energy. Worry about debt or losses makes for a poorer night's sleep.</p>${statLine()}`, buttons);
  };

  // ---- objective helper -----------------------------------------------------------------------------------------
  let objEl = null, tickerEl = null, objLast = '';
  function nearest(types) {
    let best = null, bd = 1e9;
    for (const o of OBJECTS) { if (!types.includes(o.type)) continue; const cx = o.x + o.w / 2, cy = o.y + o.h / 2, d = Math.hypot(cx - player.x, cy - player.y); if (d < bd) { bd = d; best = { o, cx, cy, d }; } }
    return best;
  }
  const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  function arrowTo(t) {
    const dx = t.cx - player.x, dy = t.cy - player.y, yaw = view.yaw;
    const fwd = dx * -Math.sin(yaw) + dy * -Math.cos(yaw), rt = dx * Math.cos(yaw) + dy * -Math.sin(yaw);
    const a = Math.atan2(rt, fwd), i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    return ARROWS[i];
  }
  function objective() {
    const x = X(), h = x.host;
    if (S.health < 30) return { t: 'You are badly hurt. Rest, eat and drink to recover', types: ['hotel', 'buffet'] };
    if (S.thirst < 25) return { t: 'You are dehydrated. Get a drink of water', types: ['fountain', 'tap', 'bar'] };
    if (S.hunger < 25) return { t: 'You are starving. Find some food', types: ['hotdog', 'buffet', 'soup', 'steak'] };
    if (S.energy < 25) return { t: 'You are exhausted. Get some sleep', types: ['hotel', 'streetsleep'] };
    if (sharkOverdue()) return { t: `Tony's late-payment crew is coming. Pay him on your phone (P) or get out of town`, types: ['busstop'] };
    if (markerOverdue()) return { t: 'Your casino marker is overdue. Repay it in the Host app on your phone' };
    if (S.shark.owed > 0.5 && S.shark.due !== null && S.shark.due - S.minutes < 1440) return { t: `Tony is owed ${fmtShort(S.shark.owed)} in ${durationText(S.shark.due - S.minutes)}. Repay on your phone` };
    if (S.bank.owed > 0.5 && S.bank.due !== null && S.bank.due - S.minutes < 1440) return { t: `Your bank loan is due in ${durationText(S.bank.due - S.minutes)}. Repay on your phone` };
    if (isNight() && isOutside() && S.cash > 5000) return { t: 'It is night and you are carrying cash on the Strip. Head back inside', types: ['hotel'] };
    if (h.active) return { t: `Host offer: wager ${fmtShort(Math.max(0, h.active.req - (S.stats.wagered - h.active.startWagered)))} more for ${fmtShort(h.active.reward)} "free" (read the math in the Host app)` };
    if (S.unread > 0 && S.stats.rounds > 0) return { t: `You have ${S.unread} unread message${S.unread > 1 ? 's' : ''}. Check your phone` };
    if (S.cash < CONFIG.BROKE_THRESHOLD) return { t: totalDebt() > 0 ? 'You are broke and in debt. The bus stop is the only exit that costs nothing more' : 'You are broke. Walk away: the bus stop is the only thing left that is free', types: ['busstop', 'soup'] };
    if (totalDebt() > 0) return { t: `Debt: ${fmtShort(totalDebt())} and growing. Repay it, or leave town`, types: ['busstop'] };
    if (S.stats.rounds === 0) return { t: 'Look around, then try a game: walk up to a table or slot machine and press the use key. Every game favours the house', types: ['slots', 'roulette', 'blackjack'] };
    if (netWorth() >= CONFIG.START_CASH) return { t: 'You are ahead. The only sure way to keep it is to stop: take the bus out of town', types: ['busstop'] };
    return { t: `You are down ${fmtShort(CONFIG.START_CASH - netWorth())}. Keep yourself fed and rested, or cut your losses at the bus stop`, types: ['busstop'] };
  }
  function objectiveTick() {
    if (!objEl) return;
    if (!started() || S.ended) { if (objLast) { objEl.classList.add('hidden'); objLast = ''; } return; }
    const ob = objective();
    let txt = ob.t;
    if (ob.types) { const n = nearest(ob.types); if (n && n.d > 60) txt += `  ${arrowTo(n)} ${Math.round(n.d / 20)} m`; }
    if (txt !== objLast) { objLast = txt; objEl.querySelector('span').textContent = txt; objEl.classList.remove('hidden'); }
  }

  // ---- news ticker ---------------------------------------------------------------------------------------------
  const FACTS = [
    ['Casinos in Nevada win around $15 billion a year from players. Every dollar of it was a player\'s.', 'Nevada Gaming Control Board figures, rounded'],
    ['About 1% of US adults (roughly 2.5 million people) are estimated to have a severe gambling problem, and several million more have milder ones.', 'National Council on Problem Gambling estimate'],
    ['Research links problem gambling with depression, anxiety and a higher risk of suicidal thoughts. Help: call or text 1-800-GAMBLER, 24/7.', 'Public health research; helpline is free and confidential'],
    ['American roulette has a 5.26% house edge because of its two green zeros. A European single-zero wheel has 2.7%.', 'Standard probability'],
    ['A slot machine returns only part of what goes in. Typical return-to-player settings are somewhere below 100%, often in the 85–95% range.', 'Industry ranges vary by jurisdiction'],
    ['Loyalty-club comps are worked out from your expected loss, not your winnings. A bigger comp means the casino expects to win more from you.', 'How casino marketing typically works'],
    ['Chasing losses, betting more to win money back, is one of the classic warning signs of problem gambling.', 'Common diagnostic criteria'],
    ['A roulette wheel that has landed on red ten times is still 47.4% likely to land on red next spin (18 of 38). The wheel has no memory.', 'Probability'],
    ['At 10% interest a day, compounded, a $1,000 loan-shark debt grows to about $17,400 in 30 days.', 'Arithmetic: 1.10 to the 30th power'],
    ['Paying 6:5 instead of 3:2 for a blackjack raises the house edge by about 1.4 percentage points.', 'Standard blackjack analysis'],
    ['Casinos are built with few clocks and few windows, so it is easy to lose track of time. It is a widely reported design choice.', 'Casino design research'],
    ['Big Six wheel bets carry house edges of roughly 11% to 24%, among the worst in the building.', 'Standard probability'],
    ['Setting a loss limit before you play and walking away when you reach it is the most reliable way to control spending. Not playing is the only way to be sure.', 'Responsible gambling guidance'],
  ];
  let tickIdx = 0, factIdx = 0, tickLast = 0;
  function tickerItem() {
    const i = tickIdx++, st = S.stats;
    if (i % 3 === 2) {
      if (st.rounds > 0) return { t: `Your night so far: ${fmt(st.wagered)} wagered, ${fmt(gambleNet())} result. The house edge predicted about ${fmt(-st.expectedLoss)}.`, s: 'From your own play' };
      return { t: 'Vegas Daily (fictional): "Tonight the Golden Mirage floor is packed. Overheard at every table: \'I\'m due.\'"', s: 'Fictional headline' };
    }
    const f = FACTS[factIdx++ % FACTS.length];
    return { t: f[0], s: f[1] };
  }
  function tickerTick(force) {
    if (!tickerEl) return;
    const now = performance.now();
    if (!force && now - tickLast < 14000) return;
    tickLast = now;
    if (!started() || S.ended) { tickerEl.classList.add('hidden'); return; }
    const it = tickerItem();
    tickerEl.classList.remove('hidden');
    tickerEl.classList.add('swap');
    setTimeout(() => { tickerEl.querySelector('.tk-text').textContent = it.t; tickerEl.querySelector('.tk-src').textContent = it.s; tickerEl.classList.remove('swap'); }, 350);
  }

  // ---- master tick (1 Hz, never per frame) ---------------------------------------------------------------------
  let tickN = 0;
  setInterval(() => {
    if (!S || !started() || S.ended) { objectiveTick(); tickerTick(); return; }
    tickN++;
    const x = X();
    if (S.shark.owed > 0.5) x.flags.shark = true;
    checkAch();
    hostTick();
    objectiveTick();
    tickerTick();
    if (tickN % 6 === 0) eventTick();
  }, 1000);

  // ---- epilogue ----------------------------------------------------------------------------------------------
  const wrapEndGame = () => {
  wrap('endGame', (orig, [reason]) => {
      if (S.ended) return;
      const x = X();
      if (reason === 'walkaway') {
        const net0 = netWorth() - CONFIG.START_CASH;
        unlockById('walked'); if (net0 >= 0) unlockById('walked_ahead');
      }
      checkAch();
      if (window.GMSave) GMSave.recordEnd(reason === 'debt' ? 'debt' : 'walkaway');
      orig(reason);
      play(reason === 'debt' ? 'flatline' : 'good');
      try { epilogue(reason); } catch (e) { /* the base ending is already on screen */ }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrapEndGame); else wrapEndGame();
  function unlockById(id) { const a = ACH.find(z => z.id === id); if (a) unlock(a); }
  function epilogue(reason) {
    const box = document.querySelector('#screen .screen-box');
    if (!box) return;
    const st = S.stats, x = X(), net = netWorth() - CONFIG.START_CASH, gNet = gambleNet();
    const inter = st.interest, markerFees = x.marker.fees, atmFees = x.atmFees, gun = st.gunSpend, living = Math.max(0, x.spent - gun), robbed = st.robbedAmount;
    const known = gNet - inter - markerFees - atmFees - living - gun - robbed;
    const other = net - known;
    const row = (label, v, note) => `<div><span>${label}${note ? `<em>${note}</em>` : ''}</span><b class="${v < 0 ? 'lose' : v > 0 ? 'win' : ''}">${fmt(v)}</b></div>`;
    const kept = clamp((S.cash - totalDebt()) / CONFIG.START_CASH * 100, -999, 999);
    const years = Math.abs(net) / 60000;
    const luck = gNet + st.expectedLoss;
    const ach = Object.keys(x.ach).length;
    const story = reason === 'debt'
      ? 'The last thing you see is a notification: "Your account has been referred to collections." There is no bet that fixes this. There never was.'
      : net >= 0
        ? 'The bus rumbles past the neon. You are ahead, and you know exactly how lucky that is. Somewhere behind you a sign is still promising the next one will be different.'
        : 'The bus rumbles past the neon and the sign that promised the next one would be different. You are lighter than when you arrived, and a little wiser. Most people never get on the bus.';
    const html = `<div class="epilogue">
      <h2>Where the money went</h2>
      <p class="story">${story}</p>
      <div class="end-stats">
        ${row('Lost to the house edge (expected)', -st.expectedLoss, 'what the odds predicted')}
        ${row('Luck (good or bad)', luck, 'actual result minus expected')}
        ${row('Interest on debt', -inter)}
        ${markerFees + atmFees > 0 ? row('Casino credit fees', -(markerFees + atmFees), 'marker charge + ATM fees') : ''}
        ${row('Food, drinks, rooms', -living)}
        ${robbed > 0 ? row('Stolen from you', -robbed) : ''}
        ${gun > 0 ? row('Guns and armor', -gun) : ''}
        ${Math.abs(other) > 1000 ? row('Everything else', other, 'hospital, fines, thefts, pawn sales') : ''}
        ${row('Total change', net)}
      </div>
      <div class="end-stats">
        <div><span>You kept</span><b class="${kept < 100 ? 'lose' : ''}">${kept.toFixed(0)}% of your $2M</b></div>
        <div><span>"Free" comps received</span><b>${fmt(st.compsValue)}</b></div>
        <div><span>Cost of those comps to you (expected)</span><b class="lose">${fmt(st.expectedLoss)}</b></div>
        <div><span>Reality checks unlocked this run</span><b>${ach} of ${ACH.length}</b></div>
        ${net < 0 ? `<div><span>For scale</span><b>${years.toFixed(1)} years of a $60,000 salary</b></div>` : ''}
      </div>
      ${window.GMSave ? `<h3>Career</h3>${GMSave.careerHTML()}` : ''}
    </div>`;
    const anchor = box.querySelector('.warning');
    const wrapEl = document.createElement('div'); wrapEl.innerHTML = html;
    if (anchor) box.insertBefore(wrapEl, anchor); else box.appendChild(wrapEl);
  }

  // ---- career panel (pause menu) --------------------------------------------------------------------------------
  function renderCareer(box) {
    const lifetime = window.GMSave ? GMSave.career().achievements : {};
    const x = S && S.x ? S.x.ach || {} : {};
    const n = ACH.filter(a => x[a.id]).length;
    box.innerHTML = `<h3>This run</h3><p class="muted">${n} of ${ACH.length} reality checks unlocked. They are honest ones: none of them reward winning.</p>
      <div class="ach-grid">${ACH.map(a => `<div class="ach ${x[a.id] ? 'got' : ''}"><span class="ach-i">${a.icon}</span><div><b>${a.name}</b><small>${a.desc}</small>${!x[a.id] && lifetime[a.id] ? '<em>unlocked in an earlier run</em>' : ''}</div></div>`).join('')}</div>
      <h3>Career</h3>${window.GMSave ? GMSave.careerHTML() : ''}`;
  }

  // ---- exports & phone hook --------------------------------------------------------------------------------------
  window.GMMissions = { renderCareer, achievements: ACH, objective, X, markerOverdue, hostBadge: () => { const h = X().host; return !!(h.offer && h.offer.expires > S.minutes && !h.active); }, checkAch, tickerTick, makeOffer, takeMarker, markerLimit, sleepQuality, EVENTS };
  window.EXTRA_APPS = Object.assign(window.EXTRA_APPS || {}, { host: appHost });
  if (typeof APPS !== 'undefined') APPS.splice(4, 0, { id: 'host', icon: '🎩', name: 'VIP Host', badge: () => window.GMMissions.hostBadge() });

  function init() {
    objEl = document.createElement('div'); objEl.id = 'objective'; objEl.className = 'hidden'; objEl.innerHTML = '<b>OBJECTIVE</b><span></span>';
    objEl.setAttribute('aria-live', 'polite'); document.body.appendChild(objEl);
    tickerEl = document.createElement('div'); tickerEl.id = 'ticker'; tickerEl.className = 'hidden'; tickerEl.innerHTML = '<b>NEWS</b><span class="tk-text"></span><em class="tk-src"></em>';
    document.body.appendChild(tickerEl);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
