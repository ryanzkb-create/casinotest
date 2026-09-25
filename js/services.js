'use strict';

const INTERACT_LABELS = {
  slots: 'Play slot machine', roulette: 'Play roulette', blackjack: 'Play blackjack',
  blackjack_hl: 'Play VIP blackjack', baccarat: 'Play baccarat', baccarat_hl: 'Play VIP baccarat',
  craps: 'Play craps', bigsix: 'Spin the Big Six wheel',
  hotdog: 'Buy a hot dog', buffet: 'Eat at the buffet', steak: 'Dine at the steakhouse',
  bar: 'Order a drink', hotel: 'Get a hotel room', cashier: 'Visit the cashier', atm: 'Use the ATM',
  fountain: 'Drink water', tap: 'Drink from tap', poster: 'Read the poster', noclock: 'Look around',
  streetsleep: 'Sleep on the street', soup: 'Get a free meal', pawn: 'Pawn your stuff',
  busstop: 'Leave town for good',
};
function interactLabel(o) { return INTERACT_LABELS[o.type] || 'Interact'; }

function interact(o) {
  if (modalOpen || phoneOpen || screenOpen || S.ended) return;
  clearMovement();
  const gambling = ['slots', 'roulette', 'blackjack', 'blackjack_hl', 'baccarat', 'baccarat_hl', 'craps', 'bigsix'];
  if (gambling.includes(o.type) && S.cash < 1) {
    infoDialog('Out of money', `<p>You don't have any cash left to gamble.</p>
      <p>Check your 📱 <b>phone</b> for loan options… or maybe it's time to stop.</p>`);
    return;
  }
  switch (o.type) {
    case 'slots': return openSlots();
    case 'roulette': return openRoulette();
    case 'blackjack': return openBlackjack(false);
    case 'blackjack_hl': return openBlackjack(true);
    case 'baccarat': return openBaccarat(false);
    case 'baccarat_hl': return openBaccarat(true);
    case 'craps': return openCraps();
    case 'bigsix': return openBigSix();
    case 'hotdog': return foodStand();
    case 'buffet': return buffet();
    case 'steak': return steakhouse();
    case 'bar': return bar();
    case 'hotel': return hotel();
    case 'fountain': case 'tap': return drinkWater(o.type === 'tap');
    case 'cashier': return cashier();
    case 'atm': return atm();
    case 'poster': return helpPoster();
    case 'noclock': return noClock();
    case 'streetsleep': return streetSleep();
    case 'soup': return soupKitchen();
    case 'pawn': return pawnShop();
    case 'busstop': return busStop();
  }
}

function statLine() {
  return `<div class="statline">🍔 ${Math.round(S.hunger)} · 💧 ${Math.round(S.thirst)} · ⚡ ${Math.round(S.energy)} · Cash ${fmt(S.cash)}</div>`;
}

function pay(price) {
  if (S.cash < price) { toast(`You can't afford that (${fmt(price)}).`, 'danger'); return false; }
  S.cash -= price;
  return true;
}

function eat(h, t, e, mins) {
  S.hunger = clamp(S.hunger + h, 0, 100);
  S.thirst = clamp(S.thirst + t, 0, 100);
  S.energy = clamp(S.energy + e, 0, 100);
  advanceTime(mins);
  afterAction();
}

function foodStand() {
  infoDialog('🌭 Hot Dog Stand', `<p>A greasy but filling hot dog and a soda.</p>${statLine()}`, [
    { label: 'Hot dog + soda — $14', cls: 'primary', fn: () => {
      if (!pay(14)) return;
      eat(30, 15, 0, 10); closeModal(true); toast('🌭 Hunger +30, Thirst +15');
    } },
  ]);
}

function buffet() {
  const free = hasTier('Gold');
  infoDialog('🍱 All-You-Can-Eat Buffet', `<p>Crab legs, prime rib, desserts. ${free ? '<b>FREE for Gold members!</b>' : 'Free for Gold members and above.'}</p>${statLine()}`, [
    { label: free ? 'Eat (comped)' : 'Eat — $65', cls: 'primary', fn: () => {
      if (free) S.stats.compsValue += 65; else if (!pay(65)) return;
      eat(70, 20, 0, 60); closeModal(true);
      toast('🍱 Hunger +70, Thirst +20 (1 hour)');
      if (free) lesson('buffetcomp', 'That "free" buffet costs the casino about $15. They know you will spend far more at the tables afterwards.');
    } },
  ]);
}

function steakhouse() {
  infoDialog('🥩 Prime Steakhouse', `<p>Wagyu steak, lobster tail, fine wine. For high rollers.</p>${statLine()}`, [
    { label: 'Dine — $240', cls: 'primary', fn: () => {
      if (!pay(240)) return;
      eat(100, 30, 10, 90); closeModal(true); toast('🥩 Fully fed! Energy +10 (90 minutes)');
    } },
  ]);
}

function bar() {
  const free = hasTier('Silver');
  const price = p => free ? 'comped' : '$' + p;
  const buy = (p, fn) => () => {
    if (free) S.stats.compsValue += p; else if (!pay(p)) return;
    fn(); closeModal(true);
  };
  infoDialog('🍸 The Lucky Bar', `<p>${free ? '<b>Drinks are FREE for Silver members and above.</b>' : 'Reach Silver status to drink for free.'}</p>${statLine()}`, [
    { label: `Water (${price(6)})`, fn: buy(6, () => { eat(0, 35, 0, 5); toast('💧 Thirst +35'); }) },
    { label: `Coffee (${price(7)})`, fn: buy(7, () => { eat(0, 15, 20, 10); toast('☕ Energy +20, Thirst +15'); }) },
    { label: `Energy drink (${price(9)})`, fn: buy(9, () => { eat(0, 20, 30, 5); toast('⚡ Energy +30, Thirst +20'); }) },
    { label: `Cocktail (${price(22)})`, cls: 'primary', fn: buy(22, () => {
      eat(0, 20, -5, 15); toast('🍸 Thirst +20, Energy −5');
      lesson('alcohol', 'Casinos hand out free alcohol because drinking lowers your inhibitions and makes you bet bigger.');
    }) },
  ]);
}

function drinkWater(street) {
  eat(0, 20, 0, 5);
  toast(street ? '🚰 Lukewarm tap water. Thirst +20' : '🚰 Free water. Thirst +20');
}

function sleep(hours, energyGain, maxEnergy) {
  S.energy = clamp(S.energy + energyGain, 0, Math.max(maxEnergy, S.energy));
  advanceTime(hours * 60, true);
}

function hotel() {
  const t = tierIndex();
  const comp = t >= 3;
  const suite = t >= 4;
  const room = suite ? 'Penthouse Suite' : 'Deluxe Room';
  infoDialog('🛎️ Hotel Front Desk', `<p>${comp
      ? `Welcome back, valued ${TIERS[t].name} guest! Your <b>${room}</b> is complimentary.`
      : `A room for the night is <b>${fmt(CONFIG.HOTEL_PRICE)}</b>. (Platinum members stay free.)`}</p>
      <p>Sleeping 8 hours restores all your energy.</p>${statLine()}`, [
    { label: comp ? `Sleep in the ${room} (free)` : `Book a room — ${fmt(CONFIG.HOTEL_PRICE)}`, cls: 'primary', fn: () => {
      if (comp) S.stats.compsValue += suite ? 2500 : CONFIG.HOTEL_PRICE;
      else if (!pay(CONFIG.HOTEL_PRICE)) {
        toast('Card declined. The street is free…', 'danger');
        return;
      }
      closeModal(true);
      sleep(8, 100, 100);
      afterAction();
      if (S.ended) return;
      infoDialog(suite ? '🌇 Penthouse Suite' : '🛏️ Hotel Room',
        `<p>You slept 8 hours in a comfortable bed. Energy fully restored.</p>
         <p>It's now <b>${clockText()}</b>.</p>
         ${comp ? '<p class="muted">The casino gave you this room because, by their math, you are worth far more to them at the tables.</p>' : ''}
         ${statLine()}`);
    } },
  ]);
}

function streetSleep() {
  infoDialog('📦 Cardboard on the Sidewalk', `<p>It's free, but it's cold and not safe. You'll recover some energy (max 80).</p>
    <p class="muted">There is a real chance someone robs you while you sleep.</p>${statLine()}`, [
    { label: 'Sleep here', cls: 'primary', fn: () => {
      closeModal(true);
      let text = '';
      const roll = Math.random();
      if (roll < 0.15) {
        sleep(3, 25, 80);
        text = '<p>🚓 A police officer wakes you after 3 hours: "Can\'t sleep here. Move along."</p>';
      } else {
        sleep(7, 60, 80);
        text = '<p>You slept 7 rough hours on cardboard. Your back hurts.</p>';
      }
      if (S.cash > 0 && Math.random() < 0.35) {
        const stolen = Math.min(S.cash, Math.round(rand(150, 3000)));
        S.cash -= stolen;
        text += `<p class="lose">🦹 You wake up to find your wallet lighter: <b>${fmt(stolen)}</b> was stolen.</p>`;
      }
      afterAction();
      if (S.ended) return;
      infoDialog('🌅 Waking up on the street', text + `<p>It's now <b>${clockText()}</b>.</p>` + statLine());
    } },
  ]);
}

function soupKitchen() {
  const day = Math.floor(S.minutes / 1440);
  const used = S.lastSoupDay === day;
  infoDialog('🍲 Community Soup Kitchen', `<p>Volunteers serve a free hot meal once a day. No questions asked.</p>
    ${used ? '<p class="muted">You already ate here today. Come back tomorrow.</p>' : ''}${statLine()}`, [
    { label: 'Get a meal (free)', cls: 'primary', disabled: used, fn: () => {
      S.lastSoupDay = day;
      eat(45, 25, 5, 45); closeModal(true);
      toast('🍲 Hunger +45, Thirst +25. A volunteer gives you a helpline card.');
      lesson('soup', 'Many people who end up at soup kitchens lost everything to addiction, gambling included. Help is available: 1-800-GAMBLER (US).');
    } },
  ]);
}

const PAWN_ITEMS = {
  watch: { name: 'Luxury watch', worth: 12_000, offer: 3_200 },
  ring: { name: 'Wedding ring', worth: 4_000, offer: 850 },
  laptop: { name: 'Laptop', worth: 1_800, offer: 300 },
};
function pawnShop() {
  const items = Object.entries(PAWN_ITEMS).filter(([k]) => S.inventory[k]);
  infoDialog('💍 Lucky Pawn & Loan', `<p>"Whatcha got? Cash on the spot."</p>
    ${items.length ? '' : '<p class="muted">You have nothing left to sell.</p>'}${statLine()}`,
    items.map(([k, it]) => ({
      label: `Sell ${it.name} (worth ${fmt(it.worth)}) for ${fmt(it.offer)}`, fn: () => {
        S.inventory[k] = false;
        S.cash += it.offer;
        advanceTime(10);
        afterAction();
        closeModal(true);
        toast(`💍 Sold your ${it.name.toLowerCase()} for ${fmt(it.offer)}.`);
        lesson('pawn', 'Pawn shops pay a small fraction of what things are worth. Selling possessions to keep gambling is a serious warning sign.');
        if (k === 'ring') addMsg('💔 Home', 'Where is your wedding ring? We need to talk. Please come home.');
      },
    })));
}

function cashier() {
  const st = S.stats;
  infoDialog('💰 Cashier Cage', `<p>"Would you like to cash in some chips?"</p>
    <p>Your balance is <b>${fmt(S.cash)}</b>. You have bet a total of <b>${fmt(st.wagered)}</b> tonight.</p>
    <p class="muted">Casinos swap your money for plastic chips because chips don't feel like real money. That makes it easier to bet more.</p>`);
  lesson('chips', 'Chips, credits and "points" are all ways to hide how much real money you are losing.');
}

function atm() {
  infoDialog('🏧 ATM', `<p>Available balance: <b>${fmt(S.cash)}</b></p>
    <p>Withdrawal fee: $7.99. Daily limit reached?</p>
    <p class="muted">Casinos put ATMs right on the gaming floor so you never have to leave to get more money.</p>`);
}

function helpPoster() {
  infoDialog('📋 Problem Gambling Poster', `
    <h3>Gambling problem? Call 1-800-GAMBLER</h3>
    <p>Signs of a gambling problem:</p>
    <ul>
      <li>Betting more to win back losses ("chasing")</li>
      <li>Borrowing money or selling things to gamble</li>
      <li>Lying to family about how much you gamble</li>
      <li>Feeling restless or irritable when trying to stop</li>
    </ul>
    <p>Free, confidential help is available 24/7. Gamblers Anonymous: <b>gamblersanonymous.org</b>.
    Outside the US, search for your local problem gambling helpline.</p>`);
}

function noClock() {
  infoDialog('🪟 Look around…', `<p>No clocks on the walls. No windows. Bright lights and ringing machines at every hour.</p>
    <p>Casinos are designed so you lose track of time. It's currently <b>${clockText()}</b>. You only know because of your phone.</p>`);
}

function busStop() {
  const debt = totalDebt();
  const net = netWorth() - CONFIG.START_CASH;
  infoDialog('🚏 Greyhound Bus Out of Town', `<p>You could get on this bus and leave the casino behind. <b>Forever.</b></p>
    <p>Cash in hand: <b>${fmt(S.cash)}</b>${debt > 0 ? ` · Debt: <b class="lose">${fmt(debt)}</b>` : ''}</p>
    <p>Result so far: <b class="${net >= 0 ? 'win' : 'lose'}">${net >= 0 ? '+' : ''}${fmt(net)}</b></p>
    <p class="muted">This ends the game.</p>`, [
    { label: 'Walk away for good', cls: 'primary', fn: () => { closeModal(true); endGame('walkaway'); } },
  ]);
}

// ---------------------------------------------------------------------------
// Consequences
// ---------------------------------------------------------------------------
function collapse(cause) {
  closeModal(true);
  closePhone();
  const st = S.stats;
  st.collapses++;
  const bill = CONFIG.HOSPITAL_BILL;
  const paid = Math.min(S.cash, bill);
  S.cash -= paid;
  S.medical += bill - paid;
  S.hunger = Math.max(S.hunger, 55);
  S.thirst = Math.max(S.thirst, 60);
  S.energy = Math.max(S.energy, 50);
  advanceTime(12 * 60, true);
  player.x = 900; player.y = 1104; player.target = null;
  const why = { hunger: 'from hunger', thirst: 'from dehydration', energy: 'from exhaustion' }[cause];
  infoDialog('🚑 You collapsed', `<p>You collapsed ${why} and woke up in the hospital 12 hours later.</p>
    <p>Hospital bill: <b>${fmt(bill)}</b>${bill - paid > 0 ? ` (you could only pay ${fmt(paid)}; <b class="lose">${fmt(bill - paid)}</b> became medical debt)` : ''}.</p>
    <p class="muted">Gamblers often skip meals and sleep. Casinos are built to keep you playing for hours.</p>`);
  afterAction();
}

function harass() {
  const k = S.shark;
  S.stats.harassed++;
  const sev = k.overdueDays;
  let html = '';
  if (S.cash > 0) {
    const take = Math.min(S.cash, Math.max(500, Math.round(k.owed * 0.15)));
    S.cash -= take;
    const credited = take * 0.5;
    k.owed = Math.max(0, k.owed - credited);
    k.principal = Math.min(k.principal, k.owed);
    html += `<p>They empty your pockets: <b class="lose">${fmt(take)}</b> taken. "Collection fee" is half, so only ${fmt(credited)} comes off your debt.</p>`;
  }
  if (sev >= 2 || Math.random() < 0.5) {
    const bill = 2_500 * sev;
    S.energy = clamp(S.energy - (25 + 10 * sev), 1, 100);
    S.medical += bill;
    html += `<p>They beat you up. Energy −${25 + 10 * sev}. Medical bill: <b class="lose">${fmt(bill)}</b> added to your debt.</p>`;
  } else {
    html += '<p>One of them grabs your collar: "Tony wants his money. Next time we won\'t be so nice."</p>';
  }
  html += `<p>You still owe Tony <b>${fmt(k.owed)}</b>. Pay at least the interest ("the vig") on your phone to make them back off.</p>`;
  closeModal(true);
  closePhone();
  infoDialog("🕴️ Tony's crew found you", html);
  addMsg('🦈 Tony', "That was a warning. Pay up.");
  afterAction();
}

// Called after anything that changes money/stats.
function afterAction() {
  if (S.ended) return;
  if (S.cash < CONFIG.BROKE_THRESHOLD && !S.brokeNotified) {
    S.brokeNotified = true;
    addMsg('🏦 First National Bank', `Short on funds? You may qualify for an emergency personal loan of up to ${fmt(CONFIG.BANK.maxTotal)}. Apply now in the Bank app!`);
    addMsg('❓ Unknown number', "Heard you had a rough night. I help people like you. No credit checks. Big money, fast. Call me. — T");
    lesson('broke', `You started with ${fmt(CONFIG.START_CASH)} and the casino now has almost all of it. This is not bad luck: it is the house edge doing exactly what it was designed to do.`);
  }
  if (totalDebt() > CONFIG.GAME_OVER_DEBT) { endGame('debt'); return; }
  if (checkVitals()) return;
  for (const k of ['hunger', 'thirst', 'energy']) {
    if (S[k] < 20 && !S.lowWarned[k]) {
      S.lowWarned[k] = true;
      toast({ hunger: '🍔 You are starving. Eat something!', thirst: '💧 You are very thirsty. Drink something!', energy: '⚡ You are exhausted. Get some sleep!' }[k], 'danger', 5000);
    }
    if (S[k] > 35) S.lowWarned[k] = false;
  }
  updateHUD(true);
}

function checkVitals() {
  if (S.ended) return false;
  const cause = ['thirst', 'hunger', 'energy'].find(k => S[k] <= 0);
  if (!cause) return false;
  collapse(cause);
  return true;
}
