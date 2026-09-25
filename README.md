# 🎰 Golden Mirage (The House Always Wins)

A browser-based casino life simulator built to show one thing: **gambling always loses money in the long run.**

You arrive in Las Vegas with **US$2,000,000**. Walk your character around the Golden Mirage Casino, play the games, and keep yourself fed, hydrated and rested. Every game uses real-world casino odds, so the house edge slowly (or quickly) takes your money.

## How to play

The game is rendered in 3D with [Three.js](https://threejs.org), loaded from the jsDelivr CDN, so you need an internet connection.

- **Easiest:** open `dist/golden-mirage.html` (a single bundled file) in any modern browser.
- **From source:** browsers block ES modules on `file://`, so serve the folder first, e.g. `python3 -m http.server`, then open http://localhost:8000. If the 3D renderer can't load, the game falls back to a simple 2D top-down view.
- After changing the source, rebuild the bundle with `python3 tools/build_single.py`.

| Action | Keys / touch |
| --- | --- |
| Walk / run | WASD or arrow keys, hold Shift to run, or tap where you want to go |
| Camera | Drag to turn, scroll / pinch or `C` to zoom |
| Talk / play / use | `E`, `Space`, or tap the person or object |
| Phone | `P` or the 📱 button |
| Switch weapon / fire | `Q` / `F`, or the on-screen buttons (tap an enemy to shoot at them) |
| Close window | `Esc` |

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
- A GTA-style third-person camera, a rotating radar, a day/night cycle, neon signs, street traffic and palm-lined sidewalks on the Strip.
- Dealers, seated gamblers, cocktail waitresses, security guards, bartenders, pedestrians and a homeless man named Eddie. Walk up to anyone to talk: some tell you their stories, some want to borrow money, and the dealers will tell you the truth about the odds.

### Robbers, guns and self-defense
- Robbers wait outside, especially at night and after people see you win big. When one stops you, you can hand over the cash, run, fight with your fists, or draw a weapon.
- The **gun store** on the Strip sells a pistol, a pump shotgun, ammo and body armor. Shootouts are real-time: keep moving, fire with `F` or by tapping the enemy.
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

---
*If gambling is a problem for you or someone you know, call or text 1-800-GAMBLER (US) or visit gamblersanonymous.org.*
