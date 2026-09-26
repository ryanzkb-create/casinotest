'use strict';

let phoneOpen = false;
let phoneApp = 'home';

const APPS = [
  { id: 'bank', icon: '🏦', name: 'Bank' },
  { id: 'shark', icon: '🦈', name: 'Tony' },
  { id: 'messages', icon: '💬', name: 'Messages' },
  { id: 'stats', icon: '📊', name: 'Reality Check' },
  { id: 'rewards', icon: '🎟️', name: 'Rewards' },
  { id: 'help', icon: '🆘', name: 'Get Help' },
];

function togglePhone() { phoneOpen ? closePhone() : openPhone(); }
function openPhone(app = 'home') {
  if (screenOpen || S.ended) return;
  if (modalOpen) closeModal();
  if (modalOpen) return;
  phoneOpen = true;
  clearMovement();
  $('#phone').classList.remove('hidden');
  showApp(app);
}
function closePhone() {
  if (!phoneOpen) return;
  phoneOpen = false;
  $('#phone').classList.add('hidden');
  if (typeof relockMouse === 'function') setTimeout(relockMouse, 0);   // back to mouse look, like GTA
}

function showApp(id) {
  phoneApp = id;
  $('#phone-time').textContent = clockText();
  const scr = $('#phone-screen');
  scr.innerHTML = '';
  if (id !== 'home') {
    const back = el('button', 'phone-back', '‹ Home');
    back.onclick = () => showApp('home');
    scr.appendChild(back);
  }
  const body = el('div', 'phone-body');
  scr.appendChild(body);
  ({ home: appHome, bank: appBank, shark: appShark, messages: appMessages, stats: appStats, rewards: appRewards, help: appHelp })[id](body);
  updateHUD(true);
}

function appHome(body) {
  body.innerHTML = `<div class="phone-status">
      <div>${clockText()}</div>
      <div>Cash <b>${fmt(S.cash)}</b></div>
      <div>Debt <b class="${totalDebt() > 0 ? 'lose' : ''}">${fmt(totalDebt())}</b> / ${fmtShort(CONFIG.GAME_OVER_DEBT)} limit</div>
    </div><div class="app-grid"></div>`;
  const grid = body.querySelector('.app-grid');
  APPS.forEach(a => {
    const b = el('button', 'app-icon', `<span>${a.icon}</span>${a.name}`);
    if (a.id === 'messages' && S.unread) b.innerHTML += `<i class="dot-badge">${S.unread}</i>`;
    if (a.id === 'shark' && sharkOverdue()) b.innerHTML += '<i class="dot-badge">!</i>';
    b.onclick = () => showApp(a.id);
    grid.appendChild(b);
  });
}

function amountButtons(amounts, onPick) {
  const row = el('div', 'phone-row');
  amounts.filter(a => a.value > 0).forEach(a => {
    const b = el('button', 'pbtn ' + (a.cls || ''), a.label);
    b.onclick = () => onPick(a.value);
    row.appendChild(b);
  });
  return row;
}

// ---------------------------------------------------------------------------
// Bank: legal, lower limit, reasonable interest, refuses bad credit
// ---------------------------------------------------------------------------
function appBank(body) {
  const b = S.bank, C = CONFIG.BANK;
  const rate = b.late ? C.lateRate : C.rate;
  body.innerHTML = `<h3>🏦 First National Bank</h3>
    <div class="card-box">
      <div>Credit rating: <b class="${b.credit === 'good' ? 'win' : 'lose'}">${b.credit === 'good' ? 'GOOD' : 'DELINQUENT'}</b></div>
      <div>Loan balance: <b>${fmt(b.owed)}</b></div>
      ${b.owed > 0.5 ? `<div>Due: <b>${S.minutes > b.due ? '<span class="lose">OVERDUE</span>' : 'in ' + durationText(b.due - S.minutes)}</b></div>` : ''}
      <div>Interest: ${(rate * 100).toFixed(1)}% per day (≈${Math.round(rate * 365 * 100)}% APR)</div>
      <div class="muted">Lifetime credit limit: ${fmt(C.maxTotal)} · used ${fmt(b.borrowedTotal)}</div>
    </div>`;

  if (b.owed > 0.5) {
    body.appendChild(el('div', 'phone-sub', 'Make a payment'));
    body.appendChild(amountButtons([
      { label: '$10K', value: Math.min(10_000, b.owed) },
      { label: '$50K', value: Math.min(50_000, b.owed) },
      { label: 'Pay in full', value: b.owed, cls: 'primary' },
    ], amt => {
      if (S.cash < amt) { toast(`You only have ${fmt(S.cash)}.`, 'danger'); return; }
      S.cash -= amt; b.owed -= amt;
      if (b.owed < 0.5) { b.owed = 0; b.principal = 0; b.due = null; toast('🏦 Bank loan paid off!', 'win'); }
      else toast(`🏦 Paid ${fmt(amt)}.`);
      afterAction(); showApp('bank');
    }));
  }

  body.appendChild(el('div', 'phone-sub', 'Emergency personal loan'));
  const avail = C.maxTotal - b.borrowedTotal;
  if (b.credit !== 'good') {
    body.appendChild(el('p', 'lose', 'Application DENIED. Your account is delinquent. We cannot extend further credit.'));
  } else if (S.cash >= CONFIG.BROKE_THRESHOLD) {
    body.appendChild(el('p', 'muted', `Emergency loans are for customers with less than ${fmt(CONFIG.BROKE_THRESHOLD)} available. You currently have ${fmt(S.cash)}.`));
  } else if (avail <= 0) {
    body.appendChild(el('p', 'lose', 'Application DENIED. You have reached your credit limit.'));
  } else {
    body.appendChild(el('p', 'muted', `Repay within ${C.termDays} days. Miss the deadline and you'll get a ${C.lateFee * 100}% late fee, a higher rate, and a ruined credit score.`));
    body.appendChild(amountButtons([
      { label: '$25K', value: Math.min(25_000, avail) },
      { label: '$100K', value: Math.min(100_000, avail) },
      { label: `Max ${fmtShort(avail)}`, value: avail, cls: 'primary' },
    ], amt => {
      if (b.owed <= 0.5) { b.due = S.minutes + C.termDays * 1440; b.late = false; }
      b.owed += amt; b.principal += amt; b.borrowedTotal += amt;
      S.cash += amt; S.stats.borrowed += amt;
      addMsg('🏦 First National Bank', `Your loan of ${fmt(amt)} has been approved and deposited. Due ${clockText(b.due)}.`);
      lesson('borrow', 'Borrowing money to gamble is one of the clearest signs of a gambling problem. The odds do not get any better with borrowed money.');
      afterAction(); showApp('bank');
    }));
  }
}

// ---------------------------------------------------------------------------
// Loan shark: lends more, 10%/day compounding, sends his crew when late
// ---------------------------------------------------------------------------
function appShark(body) {
  const k = S.shark, C = CONFIG.SHARK;
  const vig = Math.max(0, k.owed - k.principal);
  const overdue = sharkOverdue();
  body.innerHTML = `<h3>🦈 Tony <span class="muted">(no credit checks)</span></h3>
    <div class="chat">
      <div class="bubble">I lend to anyone. ${(C.rate * 100)}% a day, compounded. You pay on time, we're friends. You don't… my boys come find you. Wherever you are.</div>
      ${k.owed > 0.5 ? `<div class="bubble">You owe me <b>${fmt(k.owed)}</b> (principal ${fmt(k.principal)} + vig ${fmt(vig)}). ${overdue
        ? `<b class="lose">You're ${k.overdueDays} day(s) LATE.</b> +${C.penalty * 100}% penalty every day.`
        : `Due in <b>${durationText(k.due - S.minutes)}</b>.`}</div>` : ''}
    </div>`;

  if (k.owed > 0.5) {
    body.appendChild(el('div', 'phone-sub', 'Pay Tony'));
    body.appendChild(amountButtons([
      { label: `Pay the vig (${fmtShort(vig)})`, value: vig >= 100 ? vig : 0, cls: 'primary' },
      { label: '$50K', value: Math.min(50_000, k.owed) },
      { label: `All ${fmtShort(k.owed)}`, value: k.owed },
    ], amt => {
      if (S.cash < amt) { toast(`You only have ${fmt(S.cash)}. Tony doesn't take IOUs.`, 'danger'); return; }
      S.cash -= amt;
      const wasVig = vig >= 100 && Math.abs(amt - vig) < 0.01;
      k.owed -= amt;
      k.principal = Math.min(k.principal, k.owed);
      if (k.owed < 0.5) {
        k.owed = 0; k.principal = 0; k.due = null; k.overdueDays = 0; k.nextThug = null; k.reminded = false;
        addMsg('🦈 Tony', "Pleasure doing business. You know where to find me. 😉");
      } else if (wasVig) {
        k.due = Math.max(k.due, S.minutes + C.extendDays * 1440);
        k.overdueDays = 0; k.nextThug = null; k.reminded = false;
        addMsg('🦈 Tony', `Vig received. You got until ${clockText(k.due)}. The principal is still ${fmt(k.principal)}.`);
        lesson('vig', 'Paying only the interest ("the vig") never reduces what you owe. That is how loan sharks keep people trapped for years.');
      } else toast(`🦈 Paid Tony ${fmt(amt)}.`);
      afterAction(); showApp('shark');
    }));
  }

  body.appendChild(el('div', 'phone-sub', 'Borrow from Tony'));
  const avail = C.maxOutstanding - k.owed;
  if (S.cash >= CONFIG.BROKE_THRESHOLD) {
    body.appendChild(el('div', 'bubble', `You got ${fmt(S.cash)}, kid. Go spend it. Call me when you're dry.`));
  } else if (overdue) {
    body.appendChild(el('div', 'bubble lose', "Borrow MORE? You haven't paid me back yet. Get outta here."));
  } else if (avail < 1000) {
    body.appendChild(el('div', 'bubble', "You're tapped out with me. Pay down what you owe first."));
  } else {
    body.appendChild(amountButtons([
      { label: '$50K', value: Math.min(50_000, avail) },
      { label: '$200K', value: Math.min(200_000, avail) },
      { label: `${fmtShort(avail)}`, value: avail, cls: 'danger' },
    ], amt => {
      if (k.owed <= 0.5) { k.due = S.minutes + C.termDays * 1440; k.overdueDays = 0; k.nextThug = null; k.reminded = false; }
      k.owed += amt; k.principal += amt;
      S.cash += amt; S.stats.borrowed += amt;
      addMsg('🦈 Tony', `${fmt(amt)} in your hands. Clock's ticking: ${C.rate * 100}% a day. Due ${clockText(k.due)}. Don't make me come looking.`);
      lesson('shark', `At ${C.rate * 100}% a day compounded, a loan shark debt doubles in about a week. It is designed to be impossible to repay.`);
      afterAction(); if (!S.ended) showApp('shark');
    }));
  }
}

function appMessages(body) {
  S.unread = 0;
  body.innerHTML = '<h3>💬 Messages</h3>';
  if (!S.messages.length) body.appendChild(el('p', 'muted', 'No messages yet.'));
  [...S.messages].reverse().forEach(m => {
    body.appendChild(el('div', 'msg', `<div class="msg-from">${m.from}<span>${clockText(m.time)}</span></div><div>${m.text}</div>`));
  });
}

function appStats(body) {
  const st = S.stats;
  const gambleNet = st.returned - st.wagered;
  const rows = Object.entries(st.games).map(([name, g]) =>
    `<tr><td>${name}</td><td>${g.rounds}</td><td>${fmtShort(g.wagered)}</td><td class="${g.returned - g.wagered >= 0 ? 'win' : 'lose'}">${fmtShort(g.returned - g.wagered)}</td><td>${(g.edge * 100).toFixed(1)}%</td></tr>`).join('');
  body.innerHTML = `<h3>📊 Reality Check</h3>
    <div class="card-box">
      <div>Started with: <b>${fmt(CONFIG.START_CASH)}</b></div>
      <div>Cash now: <b>${fmt(S.cash)}</b> · Debt: <b class="lose">${fmt(totalDebt())}</b></div>
      <div>Net worth: <b class="${netWorth() >= 0 ? '' : 'lose'}">${fmt(netWorth())}</b></div>
    </div>
    <div class="card-box">
      <div>Bets placed: <b>${st.rounds}</b></div>
      <div>Total wagered: <b>${fmt(st.wagered)}</b></div>
      <div>Gambling result: <b class="${gambleNet >= 0 ? 'win' : 'lose'}">${fmt(gambleNet)}</b></div>
      <div>Expected loss (house edge math): <b class="lose">${fmt(-st.expectedLoss)}</b></div>
      <div>Biggest single win: <b>${fmt(st.biggestWin)}</b></div>
      <div>Peak cash: <b>${fmt(st.peakCash)}</b></div>
      <div>"Free" comps received: <b>${fmt(st.compsValue)}</b></div>
      <div>Borrowed: <b>${fmt(st.borrowed)}</b> · Interest charged: <b class="lose">${fmt(st.interest)}</b></div>
    </div>
    ${rows ? `<table class="stats-table"><tr><th>Game</th><th>Bets</th><th>Wagered</th><th>Result</th><th>Edge</th></tr>${rows}</table>` : ''}
    <p class="muted">${gambleNet > 0
      ? 'You are ahead right now, but that is short-term luck. The more you keep playing, the closer your result gets to the expected loss.'
      : 'Every game here has a built-in house edge. Over time, your losses always move toward the expected-loss number.'}</p>`;
}

function appRewards(body) {
  const idx = tierIndex(), t = TIERS[idx], next = TIERS[idx + 1];
  const pct = next ? clamp((S.stats.wagered - t.min) / (next.min - t.min) * 100, 0, 100) : 100;
  body.innerHTML = `<h3>🎟️ Golden Rewards Club</h3>
    <div class="card-box tier-card">
      <div class="tier-name">${t.name}</div>
      <div>${t.perks}</div>
      ${next ? `<div class="progress"><div style="width:${pct}%"></div></div>
      <div class="muted">Bet ${fmt(next.min - S.stats.wagered)} more to reach ${next.name}: ${next.perks}</div>` : '<div>Top tier reached!</div>'}
    </div>
    <div class="card-box">
      ${TIERS.map(x => `<div>${x === t ? '▶ ' : ''}<b>${x.name}</b> (${fmtShort(x.min)} wagered): ${x.perks}</div>`).join('')}
    </div>
    <p class="muted">You received ${fmt(S.stats.compsValue)} in comps. The house edge expected you to lose ${fmt(S.stats.expectedLoss)} to earn them.</p>`;
}

function appHelp(body) {
  body.innerHTML = `<h3>🆘 Get Help</h3>
    <div class="card-box">
      <p><b>National Problem Gambling Helpline (US)</b><br>Call or text <b>1-800-GAMBLER</b>, 24/7, free and confidential.</p>
      <p><b>Gamblers Anonymous</b><br>gamblersanonymous.org</p>
      <p>Outside the US? Search for your local problem gambling helpline.</p>
    </div>
    <div class="card-box">
      <b>Facts</b>
      <ul>
        <li>Every casino game is designed to make the house money over time.</li>
        <li>No betting system can beat a negative-expectation game.</li>
        <li>"Almost winning" and flashing lights are designed to keep you playing.</li>
        <li>The only way to guarantee you don't lose is to not play.</li>
      </ul>
    </div>`;
}
