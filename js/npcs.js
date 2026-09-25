'use strict';

// ---------------------------------------------------------------------------
// People in the world: appearance, behaviour and dialogue
// ---------------------------------------------------------------------------
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0662f', '#5c3a1e', '#eac086'];
const HAIRS = ['#1a1a1a', '#2b1b10', '#3b2314', '#6b4423', '#a67b5b', '#d6b36a', '#8a8a8a', '#7a2e1e'];
const TOPS = ['#1f3a93', '#c0392b', '#2c3e50', '#ecf0f1', '#27ae60', '#8e44ad', '#d35400', '#34495e', '#f1c40f', '#7f8c8d', '#e84393'];
const BOTTOMS = ['#1b1f2a', '#2c3e50', '#3d3d3d', '#5b4636', '#1e3a5f', '#6b6b6b', '#c8b68e'];
const MALE_NAMES = ['Frank', 'Earl', 'Vinnie', 'Marcus', 'Ray', 'Dwayne', 'Hank', 'Luis', 'Kenji', 'Walt', 'Tommy', 'Andre', 'Gus'];
const FEMALE_NAMES = ['Linda', 'Rosa', 'Tanya', 'Maggie', 'Keisha', 'Diane', 'Mei', 'Carla', 'Brenda', 'Sofia', 'Joyce'];

function makeLook(role, forceFemale) {
  const female = forceFemale !== undefined ? forceFemale : Math.random() < 0.45;
  const L = {
    female, skin: pick(SKINS), hair: pick(HAIRS),
    hairStyle: female ? pick(['long', 'bun', 'bob', 'long']) : pick(['short', 'short', 'bald', 'buzz', 'slick']),
    top: pick(TOPS), bottom: pick(BOTTOMS), shoes: '#111',
    height: rand(0.94, 1.06), build: rand(0.92, 1.15),
    beard: !female && Math.random() < 0.25, glasses: Math.random() < 0.15,
    hat: null, jacket: null, vest: null, tie: null, skirt: female && Math.random() < 0.35, mask: false, shades: false,
  };
  switch (role) {
    case 'gambler':
      if (Math.random() < 0.3) { L.jacket = pick(['#1c1c1c', '#2c3e50', '#4a3b2a']); L.top = '#f5f5f5'; L.tie = pick(['#8b0000', '#1f3a93', '#111']); }
      if (!female && Math.random() < 0.15) L.hat = 'cowboy';
      break;
    case 'dealer': case 'bartender':
      L.top = '#f5f5f5'; L.vest = '#121212'; L.bottom = '#121212'; L.tie = '#7a0000'; L.skirt = false; L.hat = null; break;
    case 'waitress':
      L.female = true; L.hairStyle = pick(['bun', 'long']); L.top = '#8b0a1a'; L.bottom = '#111'; L.skirt = true; L.beard = false; break;
    case 'guard':
      L.female = false; L.hairStyle = 'buzz'; L.top = '#1a1d24'; L.jacket = '#1a1d24'; L.bottom = '#1a1d24'; L.hat = 'cap'; L.beard = false; L.build = 1.2; L.tie = '#000'; break;
    case 'clerk': case 'cashierClerk':
      L.jacket = '#1f2a44'; L.top = '#f5f5f5'; L.bottom = '#1f2a44'; L.tie = '#c9a227'; break;
    case 'vendor':
      L.top = '#f5f5f5'; L.bottom = '#333'; L.hat = 'chef'; L.skirt = false; break;
    case 'homeless':
      L.female = false; L.top = '#5a4a3a'; L.jacket = '#4a3f2a'; L.bottom = '#3a3a2a'; L.beard = true; L.hat = 'beanie'; L.hair = '#6b6b6b'; L.skirt = false; break;
    case 'robber':
      L.female = false; L.top = '#262626'; L.bottom = '#1c2230'; L.hat = 'hood'; L.mask = true; L.skirt = false; L.beard = false; break;
    case 'thug':
      L.female = false; L.top = '#141414'; L.jacket = '#2a1d14'; L.bottom = '#15151d'; L.shades = true; L.hairStyle = 'slick'; L.build = 1.25; L.skirt = false; L.hat = null; break;
    case 'pedestrian':
      if (Math.random() < 0.3) L.hat = 'cap';
      break;
  }
  return L;
}

function makeNPC(role, x, y, opts = {}) {
  const female = opts.female;
  const look = makeLook(role, female);
  return Object.assign({
    role, x, y, look,
    name: opts.name || (look.female ? pick(FEMALE_NAMES) : pick(MALE_NAMES)),
    face: opts.face !== undefined ? opts.face : 0, pose: 'stand', anim: rand(0, 10),
    tx: x, ty: y, wait: rand(0, 4), speed: rand(35, 60), area: null,
    bubble: null, bubbleT: 0, talk: true, hp: 100, hostile: false,
  }, opts);
}

// Seats in front of tables & machines (the renderer draws stools here)
function tableSeats(o) {
  const n = o.type === 'bigsix' ? 0 : o.type === 'craps' ? 4 : 3;
  const seats = [];
  for (let i = 0; i < n; i++) seats.push({ x: o.x + o.w * (i + 1) / (n + 1), y: o.y + o.h + 14 });
  return seats;
}
function slotSeat(o) { return { x: o.x + o.w / 2, y: o.y + o.h + 14 }; }

const DEALER_TABLES = ['blackjack', 'blackjack_hl', 'baccarat', 'baccarat_hl', 'roulette', 'craps', 'bigsix'];

function spawnNPCs() {
  npcs = [];
  const face = { south: 0, north: Math.PI };
  for (const o of OBJECTS) {
    if (DEALER_TABLES.includes(o.type)) {
      npcs.push(makeNPC('dealer', o.x + o.w / 2, o.y - 14, { face: face.south, table: o }));
      tableSeats(o).forEach(s => {
        if (Math.random() < 0.55) npcs.push(makeNPC('gambler', s.x, s.y, { face: face.north, pose: 'sit', seated: true }));
      });
    }
    if (o.type === 'slots' && Math.random() < 0.4) {
      const s = slotSeat(o);
      npcs.push(makeNPC('gambler', s.x, s.y, { face: face.north, pose: 'sit', seated: true, slot: o }));
    }
  }
  const staff = [
    ['bartender', 1585, 505, 'bar'], ['vendor', 1480, 76, 'hotdog'], ['vendor', 1655, 76, 'buffet'],
    ['vendor', 1505, 246, 'steak'], ['clerk', 1540, 766, 'hotel'], ['cashierClerk', 160, 656, 'cashier'],
  ];
  staff.forEach(([role, x, y, service]) => npcs.push(makeNPC(role, x, y, { face: face.south, service })));
  npcs.push(makeNPC('guard', 830, 962, { face: face.south, name: 'Officer Reyes' }));
  npcs.push(makeNPC('guard', 970, 962, { face: face.south, name: 'Officer Dunn' }));
  npcs.push(makeNPC('guard', 1000, 300, { area: 'casino', speed: 45, name: 'Officer Park' }));
  npcs.push(makeNPC('waitress', 900, 520, { area: 'casino', speed: 55 }));
  npcs.push(makeNPC('waitress', 300, 300, { area: 'casino', speed: 55 }));
  for (let i = 0; i < 10; i++) {
    const p = randomWalkable('casino');
    npcs.push(makeNPC('gambler', p.x, p.y, { area: 'casino' }));
  }
  npcs.push(makeNPC('homeless', 228, 1060, { face: face.south, pose: 'sit', name: 'Eddie' }));
  for (let i = 0; i < 5; i++) {
    const p = randomWalkable('street');
    npcs.push(makeNPC('pedestrian', p.x, p.y, { area: 'street', speed: rand(45, 70) }));
  }
}

function sayBubble(n, text, secs = 4) { n.bubble = text; n.bubbleT = secs; }

let chatterT = 3;
function updateNPCs(dt) {
  for (const n of npcs) {
    n.anim += dt;
    if (n.bubbleT > 0) { n.bubbleT -= dt; if (n.bubbleT <= 0) n.bubble = null; }
    if (n.hostile || n.role === 'robber' || n.role === 'thug') continue; // combat.js drives these
    if (n.pose === 'down') continue;
    if (!n.area) { n.pose = n.seated ? 'sit' : 'stand'; continue; }
    if (n.wait > 0) { n.wait -= dt; n.pose = 'stand'; continue; }
    const vx = n.tx - n.x, vy = n.ty - n.y, d = Math.hypot(vx, vy);
    if (d < 3) {
      n.wait = rand(1.5, 7);
      const p = randomWalkable(n.area); n.tx = p.x; n.ty = p.y;
      n.pose = 'stand';
      continue;
    }
    n.pose = 'walk';
    n.face = lerpAngle(n.face, Math.atan2(vx, vy), Math.min(1, dt * 6));
    if (!moveEntity(n, vx / d * n.speed * dt, vy / d * n.speed * dt, 10)) {
      const p = randomWalkable(n.area); n.tx = p.x; n.ty = p.y;
    }
  }

  // Ambient chatter near the player
  chatterT -= dt;
  if (chatterT <= 0) {
    chatterT = rand(3, 6);
    const near = npcs.filter(n => !n.bubble && !n.hostile && n.pose !== 'down' && AMBIENT[n.role] &&
      Math.hypot(n.x - player.x, n.y - player.y) < 320);
    if (near.length) { const n = pick(near); sayBubble(n, pick(AMBIENT[n.role])); }
  }
}

const AMBIENT = {
  gambler: ['Come on, lucky seven!', 'Just one more spin…', "I'm due for a win!", 'Daddy needs a new pair of shoes!', 'Not again…',
    "It's gotta hit soon.", 'Where did the night go?', 'Hit me!', 'I was up twenty grand an hour ago…', 'ATM, be right back.'],
  dealer: ['Place your bets.', 'No more bets!', 'Good luck, folks.', 'Winner on the table.', 'Dealer wins.'],
  waitress: ['Cocktails? Cocktails!', 'Complimentary drinks for players!', 'Can I get you anything?'],
  guard: ['Keep it moving.', 'Evening.', 'No photos on the floor, please.'],
  pedestrian: ['Vegas, baby!', 'Where is my hotel again?', 'I just lost my rent money…', 'Hey, watch it!', "What a night."],
  homeless: ['Spare some change?', 'God bless.', 'Cold one tonight…'],
  bartender: ['What can I get you?', 'Last call is never.'],
  vendor: ['Hot dogs! Get your hot dogs!', 'Buffet is open!'],
};

function crowdReact() {
  npcs.forEach(n => {
    if ((n.role === 'gambler' || n.role === 'dealer' || n.role === 'waitress') && Math.hypot(n.x - player.x, n.y - player.y) < 260)
      sayBubble(n, pick(['Whoa!', 'Nice hit!', 'Lucky!', 'Let it ride!', 'Share the love!', 'Big winner!']), 5);
  });
  lesson('marked', 'People noticed your big win. Word travels fast. Robbers look for people carrying winnings outside at night.');
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
const GAMBLER_LINES = [
  "I've been here fourteen hours. I'm due for a big one, I can feel it.",
  "Don't tell my wife I'm here. I told her I was at a conference.",
  'I was up $40,000 last night. Then I kept playing…',
  "See that machine? It hasn't paid out all day. It's gotta hit soon!",
  'My system never fails. Double after every loss! …I\'m just having a bad run.',
  'I only came for the free buffet. That was three days ago.',
  'You notice there are no clocks in here? What time is it, anyway?',
  'I lost my house because of this place. I still come back. Don\'t know why.',
  'Diamond status, baby! They comp my room. …I lost $300,000 to get it.',
  'The trick is to quit while you\'re ahead. I\'ll quit right after this next win.',
];
const PED_LINES = [
  'You heading into the Golden Mirage? Good luck, you\'ll need it.',
  'Watch your wallet around here at night. Muggers wait outside the casinos.',
  'Just lost my rent money. Great trip. Really great.',
  'My buddy borrowed from some guy named Tony. Haven\'t seen him since.',
  'Vegas wasn\'t built on winners, pal.',
];

function talkDialog(n, line, buttons = []) {
  n.face = Math.atan2(player.x - n.x, player.y - n.y);
  player.face = Math.atan2(n.x - player.x, n.y - player.y);
  sayBubble(n, line.length > 40 ? line.slice(0, 38) + '…' : line, 4);
  const roleName = { gambler: 'Gambler', dealer: 'Dealer', waitress: 'Cocktail waitress', guard: 'Casino security',
    homeless: 'Homeless man', pedestrian: 'Pedestrian' }[n.role] || '';
  infoDialog(`💬 ${n.name}`, `<div class="talk"><div class="talk-role">${roleName}</div><p class="talk-line">"${line}"</p></div>`, buttons);
}

function talkTo(n) {
  if (blocked()) return;
  clearMovement();
  if (n.service) {
    n.face = Math.atan2(player.x - n.x, player.y - n.y);
    const t = OBJECTS.find(o => o.type === n.service);
    if (t) return interact(t);
  }
  switch (n.role) {
    case 'gambler': {
      const line = pick(GAMBLER_LINES);
      const borrow = Math.random() < 0.25;
      if (borrow) {
        talkDialog(n, "Hey, you look lucky. Lend me $200? I'll pay you back double, I swear.", [
          { label: 'Lend $200', fn: () => {
            if (!pay(200)) return;
            closeModal(true);
            sayBubble(n, 'You\'re a lifesaver!', 4);
            toast(`${n.name} takes your $200 straight to the slot machines. You never see it again.`);
            afterAction();
          } },
        ]);
      } else talkDialog(n, line);
      break;
    }
    case 'dealer': {
      const lines = [
        'Welcome to my table. Minimum bets are posted. Good luck.',
        "Between you and me? Nobody beats this table in the long run. I just deal the cards.",
        'The house thanks you for your business.',
        "Tips are appreciated. They come out of your stack, of course.",
      ];
      talkDialog(n, pick(lines), [
        { label: 'Play this table', cls: 'primary', fn: () => { closeModal(true); interact(n.table); } },
        { label: 'Tip $100', fn: () => {
          if (!pay(100)) return;
          closeModal(true); sayBubble(n, 'Thank you, sir!', 3); afterAction();
        } },
      ]);
      break;
    }
    case 'waitress': {
      const free = hasTier('Silver');
      talkDialog(n, free ? 'Complimentary cocktail for our Silver members?' : "Drinks are complimentary for rewards members. Otherwise it's $12.", [
        { label: free ? 'Cocktail (free)' : 'Cocktail ($12)', cls: 'primary', fn: () => {
          if (free) S.stats.compsValue += 12; else if (!pay(12)) return;
          eat(0, 20, -5, 5); closeModal(true); sayBubble(n, 'Enjoy! Good luck out there.', 3);
          lesson('alcohol', 'Casinos hand out free alcohol because drinking lowers your inhibitions and makes you bet bigger.');
        } },
        { label: free ? 'Water (free)' : 'Water ($4)', fn: () => {
          if (!free && !pay(4)) return;
          eat(0, 30, 0, 3); closeModal(true);
        } },
      ]);
      break;
    }
    case 'guard': {
      let line = 'Evening. Keep it civil and we won\'t have a problem.';
      if (S.equipped) line = 'I see that piece. Keep it holstered in here, or you\'re out on the street.';
      else if (sharkOverdue()) line = 'Couple of guys in leather jackets were asking about you. I\'d watch my back if I were you.';
      else if (S.cash < CONFIG.BROKE_THRESHOLD) line = "Rough night? You wouldn't be the first. Don't go borrowing from the wrong people.";
      talkDialog(n, line);
      break;
    }
    case 'homeless': {
      const broke = S.cash < CONFIG.BROKE_THRESHOLD;
      const line = broke
        ? "Soup kitchen next door serves a hot meal once a day. Tell 'em Eddie sent you. And stay off Tony's books."
        : pick(['Spare some change, friend? I was a Diamond member once. Now look at me.',
          'I had a house, a wife, a boat. Lost it all in there, one "sure thing" at a time.',
          "Careful after dark. The muggers wait for folks who won big inside."]);
      talkDialog(n, line, broke ? [] : [
        { label: 'Give $20', fn: () => { if (!pay(20)) return; closeModal(true); sayBubble(n, 'God bless you.', 4); afterAction(); } },
        { label: 'Give $500', fn: () => {
          if (!pay(500)) return; closeModal(true); sayBubble(n, 'I… thank you. Truly.', 5);
          toast("Eddie: \"Listen. Get out of this town while you still have something.\"");
          afterAction();
        } },
      ]);
      break;
    }
    case 'pedestrian':
      talkDialog(n, pick(PED_LINES));
      break;
    default:
      talkDialog(n, '…');
  }
}
