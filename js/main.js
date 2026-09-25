'use strict';

const canvas = document.getElementById('game');

function startGame() {
  S = newState();
  buildWorld();
  resetEntities();
  newShoe(6);
  closeModal(true);
  closePhone();
  hideScreen();
  addMsg('🎩 Casino Host', `Welcome to the Golden Mirage! Your ${fmt(CONFIG.START_CASH)} is loaded on your players card. Good luck! 🍀`);
  S.unread = 1;
  updateHUD(true);
}

function showIntro() {
  const s = showScreen(`
    <h1>🎰 The House Always Wins</h1>
    <p class="tagline">You just arrived in Las Vegas with <b>${fmt(CONFIG.START_CASH)}</b>. Try to keep it.</p>
    <div class="intro-grid">
      <div><h3>🎮 Controls</h3>
        <p><b>WASD / Arrow keys</b> or <b>tap/click</b> to walk.<br>
        <b>E</b> / <b>Space</b> or tap an object to use it.<br>
        <b>P</b> or 📱 to open your phone.</p></div>
      <div><h3>🧍 Survive</h3>
        <p>Watch your <b>hunger</b>, <b>thirst</b> and <b>energy</b>. Eat at the food court, drink at the bar, sleep at the hotel (or on the street). If any hits zero you collapse and get a hospital bill.</p></div>
      <div><h3>🎲 Gamble</h3>
        <p>Slots, roulette, blackjack, craps, baccarat and the Big Six wheel, all using <b>real casino odds</b>. Bet enough and the casino gives you free drinks, meals and rooms.</p></div>
      <div><h3>💸 Debt</h3>
        <p>Once you are broke, your phone lets you borrow from the <b>bank</b> or from <b>Tony the loan shark</b>. If Tony isn't paid on time, his crew will come for you. <b>Debt over ${fmtShort(CONFIG.GAME_OVER_DEBT)} = game over.</b></p></div>
    </div>
    <p class="warning">⚠️ Every game has a house edge. This game is designed to show you why gambling always loses money in the end. Just like the real thing.</p>
    <button class="btn primary big" id="start-btn">Enter the casino</button>`);
  s.querySelector('#start-btn').onclick = () => { hideScreen(); };
}

function endGame(reason) {
  if (S.ended) return;
  S.ended = true;
  closeModal(true);
  closePhone();
  const st = S.stats;
  const net = netWorth() - CONFIG.START_CASH;
  const gambleNet = st.returned - st.wagered;
  let title, intro;
  if (reason === 'debt') {
    title = '💀 GAME OVER: Buried in Debt';
    intro = `<p>Your debt passed <b>${fmt(CONFIG.GAME_OVER_DEBT)}</b>. You arrived with ${fmt(CONFIG.START_CASH)}. Now you owe ${fmt(totalDebt())}.</p>
      <p>There is no "one more bet" that fixes this. In real life this is where people lose their homes, families and sometimes their lives.</p>`;
  } else if (net >= 0) {
    title = '🚌 You Walked Away Ahead';
    intro = `<p>You left with <b>${fmt(S.cash)}</b>, ${fmt(net)} more than you started with. You were lucky and, most importantly, you <b>stopped</b>.</p>
      <p>Most people don't. The casino counts on you coming back, and over enough bets the house edge always wins.</p>`;
  } else if (totalDebt() > 0) {
    title = '🚌 You Left Town… With Debt';
    intro = `<p>You got on the bus with <b>${fmt(S.cash)}</b>, but you still owe <b class="lose">${fmt(totalDebt())}</b>. Debts don't disappear when you leave town${S.shark.owed > 0 ? ', and Tony knows where you live' : ''}.</p>`;
  } else {
    title = '🚌 You Walked Away';
    intro = `<p>You left with <b>${fmt(S.cash)}</b>, <b class="lose">${fmt(-net)}</b> less than the ${fmt(CONFIG.START_CASH)} you arrived with.</p>
      <p>Walking away was the smartest bet you made all trip. The only sure way to win is not to play.</p>`;
  }

  const s = showScreen(`
    <h1>${title}</h1>
    ${intro}
    <div class="end-stats">
      <div><span>Time in the casino</span><b>${durationText(S.minutes - 20 * 60)}</b></div>
      <div><span>Bets placed</span><b>${st.rounds}</b></div>
      <div><span>Total wagered</span><b>${fmt(st.wagered)}</b></div>
      <div><span>Gambling result</span><b class="${gambleNet >= 0 ? 'win' : 'lose'}">${fmt(gambleNet)}</b></div>
      <div><span>House edge predicted</span><b class="lose">${fmt(-st.expectedLoss)}</b></div>
      <div><span>Biggest win</span><b>${fmt(st.biggestWin)}</b></div>
      <div><span>Money borrowed</span><b>${fmt(st.borrowed)}</b></div>
      <div><span>Interest charged</span><b class="lose">${fmt(st.interest)}</b></div>
      <div><span>Comps received</span><b>${fmt(st.compsValue)}</b></div>
      <div><span>Times collapsed / harassed</span><b>${st.collapses} / ${st.harassed}</b></div>
      <div><span>Final net worth</span><b class="${netWorth() >= 0 ? '' : 'lose'}">${fmt(netWorth())}</b></div>
    </div>
    <p class="warning">The house edge is small on each bet, but it never stops working. The more you bet, the more certain your loss.</p>
    <p class="muted">Gambling problem? Call or text <b>1-800-GAMBLER</b> (US) or visit gamblersanonymous.org.</p>
    <button class="btn primary big" id="restart-btn">Start again with ${fmtShort(CONFIG.START_CASH)}</button>`);
  s.querySelector('#restart-btn').onclick = () => startGame();
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let lastFrame = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - lastFrame) / 1000);
  lastFrame = t;
  if (!S.ended && !modalOpen && !phoneOpen && !screenOpen) {
    updateWorld(dt);
    advanceTime(dt * CONFIG.MIN_PER_SEC);
    afterAction();
  }
  render(t);
  updateHUD();
  requestAnimationFrame(frame);
}

function init() {
  resizeCanvas(canvas);
  window.addEventListener('resize', () => resizeCanvas(canvas));
  setupInput(canvas);
  $('#phoneBtn').onclick = () => togglePhone();
  $('#phone-close').onclick = () => closePhone();
  $('#modal-close').onclick = () => closeModal();
  $('#helpBtn').onclick = () => { if (!modalOpen && !phoneOpen) showIntro(); };
  startGame();
  showIntro();
  requestAnimationFrame(frame);
}

init();
