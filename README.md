# 🎰 Golden Mirage (The House Always Wins)

A browser-based casino life simulator built to show one thing: **gambling always loses money in the long run.**

You arrive in Las Vegas with **US$2,000,000**. Walk your character around the Golden Mirage Casino, play the games, and keep yourself fed, hydrated and rested. Every game uses real-world casino odds, so the house edge slowly (or quickly) takes your money.

## How to play

The game is rendered in 3D with [Three.js](https://threejs.org) (loaded from the jsDelivr CDN), so you need an internet connection.

- **Easiest:** open `dist/golden-mirage.html` in any modern desktop browser. It's a single file with every script, model and animation embedded, so it's about 20 MB.
- **Hosted (e.g. Vercel):** the repo root is a static site with no build step: `index.html` loads the engine from `js/` and streams the models from `assets/`. `vercel.json` only adds browser caching for `assets/`.
- **From source:** browsers block ES modules and `fetch` on `file://`, so serve the folder first, e.g. `python3 -m http.server`, then open http://localhost:8000. If the 3D renderer can't load, the game falls back to a simple 2D top-down view.
- **Rebuild** after changing the source: `python3 tools/build_single.py` (needs Node.js, since it runs esbuild through `npx`). `python3 tools/build_single.py --web OUT_DIR` writes a lighter page plus an `assets/` folder for web hosting (add `--text-assets` for hosts that only serve text files, and `--fragment` for hosts that wrap the page in their own `<html>` skeleton).

### Mac app (recommended on a Mac)
The `desktop/` folder wraps the game in its own Mac app (Electron, not the App Store). It plays better than a browser tab: it runs at full retina resolution on the **High** preset with multisample anti-aliasing and ambient occlusion, works offline, and **Esc** can close the phone and go straight back to mouse look (browsers never allow that).

- **Download:** on GitHub open **Actions → Mac app**, pick the latest successful run and download `golden-mirage-mac` under *Artifacts*. Unzip it and open the `.dmg` for your Mac (`arm64` for Apple Silicon M1–M4, `x64` for Intel), then drag Golden Mirage into Applications.
- **First launch:** the app isn't notarised by Apple, so macOS blocks it the first time. Right-click the app and choose **Open**, or go to **System Settings → Privacy & Security** and click **Open Anyway**. If macOS says the app is damaged, run `xattr -cr "/Applications/Golden Mirage.app"` in Terminal once.
- **Signed and notarized (no warning):** with an Apple Developer Program account, create a *Developer ID Application* certificate, export it as a `.p12`, and add the repository secrets listed at the top of `.github/workflows/mac-app.yml` (`MAC_CERT_P12` as base64, `MAC_CERT_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). The next build signs and notarizes the app automatically.
- **Build it yourself** (needs Node.js 20+ and Python 3): `cd desktop && npm install && npm start` to run it, or `npm run dist` to make the `.dmg` files in `desktop/dist/`.

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Look around | Click the game to capture the mouse, then move it | Drag with your right thumb |
| Move | WASD, `Shift` to sprint, `X` to toggle walking | Left thumb stick, RUN button |
| Camera distance | Mouse wheel or `V` | |
| Talk / sit down at a game / use | `E` (face the person or object) | Tap the prompt |
| Aim / shoot | Hold right mouse, then left click or `F` | AIM, then FIRE |
| Switch weapon | `Q` | Q button |
| Phone | `P` | 📱 button |
| Pause menu (settings, controls, achievements, restart) | `Esc` (or release the mouse) | |
| Close window / stand up from a game | `Esc` | ✕ / Leave |

Every key can be **rebound** in *Pause > Controls* (with a live display of the current keys). Sprinting now uses a stamina bar under the radar.

**Controller** (any standard gamepad): left stick move, right stick look, `LT` aim, `RT` fire, `A` use / talk / sit, `B` back, `X` walk/jog, `Y` phone, `RB` switch weapon, `LB` camera distance, click left stick to sprint, `Start` pause. Menus, the phone and the casino tables work with the D-pad and `A` / `B` (at tables: D-pad up/down changes the bet, left/right chooses, `A` plays, `X` / `Y` are the other actions). Rumble is supported and can be switched off.

**Settings** (on the start screen, in the pause menu, or the **?** button in game): sound (master, effects, music, ambience, mute), look speed for mouse and touch, text size, reduced motion, a colour-blind friendly HUD, controller rumble and a graphics preset. *Auto* picks High in the Mac app, Medium in browsers on computers and Low on phones; if the game stutters (Safari on a retina Mac is the most demanding case), choose **Low**. The game also steps its quality down by itself when the frame rate drops.

### Playing the casino games
Walk up to a slot machine or table and press `E` to sit down. The camera moves to your seat and the game is played in 3D: the dealer deals real cards, chips stack up on the felt, the roulette ball drops into a pocket, dice bounce across the craps table and the Big Six wheel clicks to a stop. The first time you sit at each game a short **tutorial** explains the rules, the payouts and the real house edge. Press `T` at any time to see it again.

| At the table | Keys |
| --- | --- |
| Change bet | `↑` / `↓` (or the − / + buttons) · `M` max bet on slots |
| Choose a bet (roulette, baccarat, craps, Big Six) | `←` / `→` or click the options · `Z` / `X` picks a roulette number |
| Play (spin, deal, roll) | `Enter` / `Space` |
| Blackjack | `H` hit · `S` stand · `D` double · `X` split · `I` insurance |
| Video poker | `Space` deal/draw · `1`–`5` hold · `H` hint |
| Three Card Poker | `Enter` deal, then `Enter` play / `F` fold · `←→` Ante/Play, Pair Plus |
| Keno | click numbers (or `←→` + `F`) · `Q` quick pick · `C` clear · `Space` draw |
| Sic Bo | `←→` bet type · `Z`/`X` number · `Enter` add bet · `Space` roll · `C` clear |
| Race book | `←→` runner · `B` win/place · `Space` run the race |
| Scratch cards | `Space` buy + scratch |
| Tutorial / leave | `T` / `Esc` |

## Features

### Sound
All audio is generated in your browser with WebAudio (there are no sound files). It starts after your first click or key press.
- A busy casino floor (crowd murmur, distant slot chimes and coins, air conditioning) that fades to the Strip (wind, traffic, sirens at night, a distant club, birds by day) when you step outside, plus a generative lounge-jazz band that plays in the casino and turns muffled outside.
- Slot reels, win jingles (which also celebrate "wins" that lose money, on purpose), a jackpot fanfare, chips, cards, the roulette ball, dice and the Big Six wheel.
- Footsteps that follow your speed and the floor: carpet, marble, wood, tile and pavement.
- Gunshots, ricochets, shell casings, hit markers, a heartbeat when your health is low, and tense music when someone is hunting you.
- Phone rings and message pings, UI clicks, and achievement chimes. Other code can call `window.sfxPlay('name')` (it does nothing until audio is unlocked).

### Save, career and progression
- **Autosave** every 20 seconds (and when the tab is hidden). The start screen offers **Continue** or **New game**. Leaving a table mid-spin forfeits the stake, so reloading cannot undo a loss.
- **Career stats** across runs: biggest win, longest survival, lowest and best net worth walked away with, lifetime wagered and lost.
- **Reality-check achievements**: honest ones ("First $100k lost", "Chased losses", "Took a loan shark loan", "Fooled by a fake win", "Took the bait"...). None reward winning.
- An **objective helper** at the top of the screen tells you what to do next (eat, repay Tony, go home) with a direction and distance.
- A **news ticker** with headlines about gambling harms and real statistics (each tagged with its source and marked approximate; the fictional headlines are labelled as fictional).
- The **VIP host** on your phone (Diana) sends "free play" and "we miss you" offers. Accepting one asks you to wager a large sum; the app shows the math of what that will cost you, and afterwards compares the "gift" with your actual expected loss.
- A **casino credit line (marker)**, the third debt source: 25% finance charge up front, due in 5 days, then 5% a day, rewards suspended and a credit report. The **ATM** offers cash advances against it with extra fees.
- **Player-driven events**: a stranger selling a "sure thing", the hot-hand superstition prompt, a pickpocket, a drunk asking for a loan, a pit boss with a comp dinner after a big win, and security ejecting a winning blackjack player.
- **Hotel**: room service, and **sleep quality** that suffers from debt worry, a losing streak, hunger or sleeping on the street.
- The **walk-away epilogue** breaks down where the money went: house edge, luck, interest, credit fees, living costs, robberies and more.

### Feel
Camera shake on shots and hits, hit markers, a red vignette at low health, a slow-motion beat before the hospital when you are knocked out, sprint stamina, GTA-style help text that shows `A` on a controller, and a pause menu. Text size, reduced motion (also follows the system setting) and a colour-blind palette with patterned warnings are in Settings.

### Casino games (real odds)
| Game | House edge |
| --- | --- |
| Slot machines (with near-misses and "losses disguised as wins") | 8% |
| American roulette (0 and 00) | 5.26% |
| Blackjack (6:5 payout, dealer hits soft 17; split and double supported) and VIP Blackjack | ~2% |
| Blackjack Insurance side bet (offered on a dealer Ace) | 7.4% |
| Craps (Pass / Don't Pass) | 1.41% / 1.36% |
| Craps Odds bet behind the line (`O`) | 0% (true odds, but only after a line bet) |
| Baccarat and VIP Baccarat (Player / Banker / Tie, with scoreboard) | 1.24% / 1.06% / 14.4% |
| Big Six Wheel | 11% – 24% |
| **Video Poker**, Jacks or Better (three paytables on the floor: 9/6, 8/5, 6/5) | 0.46% / 2.70% / 5.01% with perfect play (measured 0.65% / 3.06% / 5.19% with the in-game hold hint) |
| **Three Card Poker**: Ante/Play · Pair Plus | 3.37% of the Ante (about 2% of money wagered) · 7.28% |
| **Keno** (80 numbers, pick 1–10) | 25% – 29% depending on spots (exact per pick count) |
| **Sic Bo** (bet slip): Small/Big · single · double · any triple · specific triple · totals | 2.78% · 7.87% · 18.5% · 13.9% · 16.2% · 9.7%–19% |
| **Race Book** (6 runners, posted odds, overround shown) | about 16% Win · 15% Place (board adds to ~119%) |
| **Scratch cards** | 36.6% |

The new games are in the **Sportsbook & Keno Lounge** (south of the table pits, east of the entrance walkway: video poker bank, race book and keno terminals in front of big wall screens, scratch card kiosks) and in the table pits (Three Card Poker and Sic Bo, next to the Big Six wheel). Their odds live in `js/odds2.js` and are checked by scripts in `tools/odds/`, which load the same code that pays you:

| Check | Command | Result |
| --- | --- | --- |
| Video poker, 3M hands each with the in-game hold hint | `node tools/odds/poker.js 3000000 vp` | 9/6: 0.65% edge (published perfect play 0.46%) · 8/5: 3.06% (2.70%) · 6/5: 5.19% (5.01%). The hint is a strategy table, not a full solver, so it gives back a little more than perfect play |
| Three Card Poker, 3M hands, Q-6-4 strategy | `node tools/odds/poker.js 3000000 tcp` | Ante/Play 3.34% of the Ante (1.99% of money wagered; published 3.37%) · Pair Plus 7.28% exact by enumerating all 22,100 hands |
| Keno (exact hypergeometric + simulation), sic bo (exact over 216 outcomes + simulation), race book, scratch cards | `node tools/odds/keno_sicbo_scratch_race.js` | Keno 25.0% – 29.8% for 1–10 spots · Sic Bo as above · Race book win 16.4% / place 15.1%, board sums to 118.7% · Scratch cards 36.6% |
| The real game code (`games.js`, `games2.js`, `games2b.js`) played headlessly, money conservation checked | `node tools/odds/headless_games.js 30000` | measured edges agree with the exact values within simulation noise |
| Every seat and machine reachable from the entrance | `node tools/layout_check.js` | 237 interactive objects, 0 unreachable |

### Survival
- **Hunger, thirst and energy** drop over time. If any of them hits zero you collapse, lose 12 hours and get a hospital bill.
- **Food court** (hot dogs, buffet, steakhouse), **bar**, and free **water fountains**.
- **Hotel** rooms cost money, unless you've gambled enough to be comped.
- **Sleep on the street** for free, but you may be robbed or moved on by police.
- **Soup kitchen** gives one free meal a day. The **pawn shop** buys your belongings for a fraction of their value.

### The world and its people
- An over-the-shoulder GTA-style camera with mouse look, camera collision and an aiming mode, a rotating radar, a day/night cycle with a real sky, neon signs, street traffic and palm-lined sidewalks on the Strip.
- A bright, busy casino floor: patterned carpet, crystal chandeliers, rows of animated slot machines under progressive jackpot signs, blackjack, roulette, craps, baccarat and Big Six tables, a high-limit room, a bar, a food court and a hotel lobby.
- Realistic motion-captured people (Microsoft Rocketbox avatars) who walk, sit, talk on the phone, drink, cheer and clap when someone wins big.
- Dealers, seated gamblers, cocktail waitresses, security guards, bartenders, pedestrians and a homeless man named Eddie. Walk up to anyone to talk: some tell you their stories, some want to borrow money, and the dealers will tell you the truth about the odds.

### Robbers, guns and self-defense
- Robbers wait outside, especially at night and after people see you win big. When one stops you, you can hand over the cash, run, fight with your fists, or draw a weapon.
- The **gun store** on the Strip sells a pistol, a pump shotgun, ammo and body armor. Shootouts are real-time: keep moving, hold right mouse to aim over the shoulder and click (or `F`) to fire.
- You can also fight back against Tony's crew, but it doesn't erase the debt: Tony adds 25% "damages" and sends more people next time.
- Firing a gun when nobody is attacking you gets you fined, and inside the casino security confiscates your weapons.
- If your health reaches zero you wake up in hospital with a $25,000 bill.

### Casino rewards (comps)
The more you bet, the more "free" stuff you get: free drinks (Silver), free buffet (Gold), a free hotel room (Platinum), and the penthouse suite (Diamond). The game shows how little these comps are worth compared to what they cost you.

### Phone
- **Bank**: legal loans with a lower limit. Available once you're broke. Miss the deadline and you get a late fee, a higher rate and ruined credit.
- **Tony (loan shark)**: lends more with no credit checks, but charges **10% a day, compounded**. Pay late and his crew will hunt you down in the casino to take your cash and beat you up. Paying only "the vig" (the interest) buys you time but never reduces what you owe.
- **Messages**: texts from the casino host, the bank, Tony and home.
- **Reality Check**: your real results compared to what the house edge predicted.
- **Rewards** and **Get Help** (problem gambling resources).

### Endings
- **Game over** when your total debt (bank, Tony, casino marker and medical bills) passes **$1,000,000**.
- Or take the **bus out of town** at any time to walk away with whatever you have left.

Either way you can start again with $2M, and the house will win again.

## Credits and licenses

- 3D people and animations: [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox) (MIT). Converted to compressed glTF, animations repacked into `assets/anims.bin`.
- Car: "Ferrari 458 Italia" by [vicent091036](https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6), as shipped with the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf), interior removed.
- Lighting: `royal_esplanade` and `venice_sunset` HDR environments from the three.js examples (from HDRI Haven / Poly Haven, CC0), downsampled.
- Sofa and chair: `GlamVelvetSofa` and `ChairDamaskPurplegold` from the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) (© 2021 Wayfair LLC, CC BY 4.0).
- Engine: [three.js](https://threejs.org) (MIT). Everything else (casino, street, tables, cards, chips, slot screens, textures) is generated in code.

---
*If gambling is a problem for you or someone you know, call or text 1-800-GAMBLER (US) or visit gamblersanonymous.org.*
