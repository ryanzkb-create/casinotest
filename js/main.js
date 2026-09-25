'use strict';


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
  updateWeaponHUD();
  updateHUD(true);
}

function showIntro() {
  const s = showScreen(`
    <div class="intro-kicker">LAS VEGAS · THE STRIP · 8:00 PM</div>
    <h1>Golden Mirage</h1>
    <p class="tagline">You just arrived with <b>${fmt(CONFIG.START_CASH)}</b>. The house has never lost. Try to keep it.</p>
    <div class="intro-grid">
      <div><h3>Controls</h3>
        <p><b>WASD</b> walk · <b>Shift</b> run · <b>drag</b> to turn the camera · <b>scroll</b> or <b>C</b> to zoom.
        <b>Tap</b> a spot to walk there. <b>E</b> talk / play / use. <b>P</b> phone. <b>Q</b> switch weapon, <b>F</b> fire.</p></div>
      <div><h3>Survive</h3>
        <p>Keep your <b>hunger</b>, <b>thirst</b>, <b>energy</b> and <b>health</b> up. Eat, drink, sleep at the hotel or on the street. Talk to the people you meet.</p></div>
      <div><h3>Gamble</h3>
        <p>Slots, roulette, blackjack, craps, baccarat and the Big Six wheel, all with <b>real casino odds</b>. Bet big and the casino gives you free drinks, meals and rooms.</p></div>
      <div><h3>The streets</h3>
        <p>Robbers wait outside at night, especially for big winners. The <b>gun store</b> on the Strip sells pistols, shotguns and body armor.</p></div>
      <div><h3>Debt</h3>
        <p>Broke? Your phone can get a loan from the <b>bank</b> or from <b>Tony the loan shark</b>. Pay Tony late and his crew comes for you. <b>Debt over ${fmtShort(CONFIG.GAME_OVER_DEBT)} ends the game.</b></p></div>
    </div>
    <p class="warning">Every game here has a house edge. This game shows why gambling always loses money in the end, just like the real thing.</p>
    <button class="btn primary big" id="start-btn">Walk into the casino</button>`);
  s.querySelector('#start-btn').onclick = () => { hideScreen(); sfx('far'); };
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
      <div><span>Robbed</span><b>${st.robbed}× (${fmt(st.robbedAmount)})</b></div>
      <div><span>Spent on guns & armor</span><b>${fmt(st.gunSpend)}</b></div>
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
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  setupInput();
  $('#phoneBtn').onclick = () => togglePhone();
  $('#fireBtn').onclick = () => fireWeapon();
  $('#weaponBtn').onclick = () => { if (!blocked()) cycleWeapon(); };
  $('#phone-close').onclick = () => closePhone();
  $('#modal-close').onclick = () => closeModal();
  $('#helpBtn').onclick = () => { if (!modalOpen && !phoneOpen) showIntro(); };
  startGame();
  showIntro();
  requestAnimationFrame(frame);
}

init();
