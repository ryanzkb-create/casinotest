# 🎰 Golden Mirage (The House Always Wins)

A browser-based casino life simulator built to show one thing: **gambling always loses money in the long run.**

You arrive in Las Vegas with **US$2,000,000**. Walk your character around the Golden Mirage Casino, play the games, and keep yourself fed, hydrated and rested. Every game uses real-world casino odds, so the house edge slowly (or quickly) takes your money.

## How to play

The game is rendered in 3D with [Three.js](https://threejs.org) (loaded from the jsDelivr CDN), so you need an internet connection.

- **Easiest:** open `dist/golden-mirage.html` in any modern desktop browser. It's a single file with every script, model and animation embedded, so it's about 20 MB.
- **From source:** browsers block ES modules and `fetch` on `file://`, so serve the folder first, e.g. `python3 -m http.server`, then open http://localhost:8000. If the 3D renderer can't load, the game falls back to a simple 2D top-down view.
- **Rebuild** after changing the source: `python3 tools/build_single.py` (needs Node.js, since it runs esbuild through `npx`). `python3 tools/build_single.py --web OUT_DIR` writes a lighter page plus an `assets/` folder for web hosting (add `--text-assets` for hosts that only serve text files, and `--fragment` for hosts that wrap the page in their own `<html>` skeleton).

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Look around | Click the game to capture the mouse, then move it | Drag with your right thumb |
| Move | WASD, `Shift` to sprint, `X` to toggle walking | Left thumb stick, RUN button |
| Camera distance | Mouse wheel or `V` | |
| Talk / sit down at a game / use | `E` (face the person or object) | Tap the prompt |
| Aim / shoot | Hold right mouse, then left click or `F` | AIM, then FIRE |
| Switch weapon | `Q` | Q button |
| Phone | `P` | 📱 button |
| Close window / stand up from a game | `Esc` | ✕ / Leave |

### Playing the casino games
Walk up to a slot machine or table and press `E` to sit down. The camera moves to your seat and the game is played in 3D: the dealer deals real cards, chips stack up on the felt, the roulette ball drops into a pocket, dice bounce across the craps table and the Big Six wheel clicks to a stop. The first time you sit at each game a short **tutorial** explains the rules, the payouts and the real house edge. Press `T` at any time to see it again.

| At the table | Keys |
| --- | --- |
| Change bet | `↑` / `↓` (or the − / + buttons) · `M` max bet on slots |
| Choose a bet (roulette, baccarat, craps, Big Six) | `←` / `→` or click the options · `Z` / `X` picks a roulette number |
| Play (spin, deal, roll) | `Enter` / `Space` |
| Blackjack | `H` hit · `S` stand · `D` double |
| Tutorial / leave | `T` / `Esc` |

## Features

### Casino games (real odds)
| Game | House edge |
| --- | --- |
| Slot machines (with near-misses and "losses disguised as wins") | 8% |
| American roulette (0 and 00) | 5.26% |
| Blackjack (6:5 payout, dealer hits soft 17) and VIP Blackjack | ~2% |
| Craps (Pass / Don't Pass) | 1.41% / 1.36% |
| Baccarat and VIP Baccarat (Player / Banker / Tie) | 1.24% / 1.06% / 14.4% |
| Big Six Wheel | 11% – 24% |

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
- **Game over** when your total debt passes **$1,000,000**.
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
