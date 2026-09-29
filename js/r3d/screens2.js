// Canvas screen graphics for the second wave of games: video poker machine, keno
// board, race book board and scratch card kiosk. Each draw function paints one
// frame from a plain state object; tablefx2.js owns the textures and animation.
import { CARD_W as ATLAS_W, CARD_H as ATLAS_H } from './tex.js';

const RANK_COL = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_ROW = ['♠', '♥', '♦', '♣'];
const DISPLAY = '"Anton", "Arial Black", Impact, sans-serif';
const LABEL = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

export function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function txt(g, s, x, y, size, color = '#fff', align = 'center', font = DISPLAY, glow) {
  g.font = `${size}px ${font}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color;
  if (glow) { g.shadowColor = glow; g.shadowBlur = size * 0.35; }
  g.fillText(s, x, y);
  g.shadowBlur = 0;
}
const money = n => '$' + Math.round(n).toLocaleString('en-US');

// A playing card from the shared 3D atlas. k: flip progress 0 (back) .. 1 (face)
function drawCard(g, atlas, card, x, y, w, h, k = 1) {
  const s = Math.abs(1 - 2 * k) ;
  const cw = Math.max(2, w * (k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2));
  const cx = x + (w - cw) / 2;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
  const back = k < 0.5 || !card;
  const col = back ? 0 : RANK_COL.indexOf(card.r), row = back ? 4 : Math.max(0, SUIT_ROW.indexOf(card.s));
  if (atlas) {
    g.drawImage(atlas, col * ATLAS_W, row * ATLAS_H, ATLAS_W, ATLAS_H, cx, y, cw, h);
  } else {
    g.fillStyle = back ? '#8b0f1f' : '#fbfaf6'; rrect(g, cx, y, cw, h, 10); g.fill();
    if (!back) txt(g, card.r + card.s, cx + cw / 2, y + h / 2, h * 0.3, card.s === '♥' || card.s === '♦' ? '#c0121f' : '#111');
  }
  g.restore();
  return s;
}

// ---------------------------------------------------------------------------
// Video poker: paytable, five cards, HOLD flags
// ---------------------------------------------------------------------------
export const VP_ROWS = [['RF', 'ROYAL FLUSH'], ['SF', 'STRAIGHT FLUSH'], ['4K', 'FOUR OF A KIND'], ['FH', 'FULL HOUSE'], ['F', 'FLUSH'], ['S', 'STRAIGHT'], ['3K', 'THREE OF A KIND'], ['2P', 'TWO PAIR'], ['JB', 'JACKS OR BETTER']];
export function drawVideoPoker(g, W, H, st, atlas) {
  const t = st.t || 0;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a1a5c'); bg.addColorStop(1, '#040a2a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const pays = st.pays || { RF: 800, SF: 50, '4K': 25, FH: 9, F: 6, S: 4, '3K': 3, '2P': 2, JB: 1 };
  // paytable
  const top = 14, rowH = 31, x0 = 30, tw = W - 60;
  g.fillStyle = 'rgba(0,0,40,0.75)'; rrect(g, x0, top, tw, rowH * 9 + 12, 10); g.fill();
  g.strokeStyle = '#ffd23f'; g.lineWidth = 3; rrect(g, x0, top, tw, rowH * 9 + 12, 10); g.stroke();
  const colX = [0, 1, 2, 3, 4].map(i => x0 + tw - 60 - (4 - i) * 112);
  g.fillStyle = 'rgba(255,210,63,0.16)'; g.fillRect(colX[4] - 52, top + 4, 108, rowH * 9 + 4);        // max-coin column
  VP_ROWS.forEach(([k, name], r) => {
    const y = top + 6 + r * rowH + rowH / 2;
    const win = st.win && st.win.cat === k;
    if (win) { g.fillStyle = Math.floor(t * 6) % 2 ? 'rgba(255,255,255,0.9)' : 'rgba(255,60,80,0.85)'; g.fillRect(x0 + 6, y - rowH / 2 + 1, tw - 12, rowH - 2); }
    const c = win ? '#111' : (k === 'FH' || k === 'F') ? '#7dffb0' : '#ffe680';
    txt(g, name, x0 + 24, y, 26, c, 'left', LABEL);
    for (let i = 0; i < 5; i++) {
      const v = k === 'RF' && i === 4 ? 4000 : pays[k] * (i + 1);
      txt(g, String(v), colX[i] + 42, y, 26, win ? '#111' : i === 4 ? '#fff' : '#cfe0ff', 'right', LABEL);
    }
  });
  // cards
  const cw = 168, ch = cw * ATLAS_H / ATLAS_W, gap = 26, cx0 = (W - (cw * 5 + gap * 4)) / 2, cy = 344;
  for (let i = 0; i < 5; i++) {
    const x = cx0 + i * (cw + gap);
    const card = st.cards && st.cards[i];
    const k = st.flip ? st.flip[i] : card ? 1 : 0;
    drawCard(g, atlas, card, x, cy, cw, ch, card ? k : 0);
    if (st.hold && st.hold[i]) {
      g.fillStyle = '#ffd23f'; rrect(g, x + 10, cy + ch + 8, cw - 20, 34, 6); g.fill();
      txt(g, 'HELD', x + cw / 2, cy + ch + 26, 28, '#111', 'center', DISPLAY);
      g.strokeStyle = '#ffd23f'; g.lineWidth = 5; rrect(g, x - 3, cy - 3, cw + 6, ch + 6, 12); g.stroke();
    } else if (st.phase === 'hold') {
      txt(g, `${i + 1}`, x + cw / 2, cy + ch + 26, 26, 'rgba(255,255,255,0.4)', 'center', LABEL);
    }
  }
  // result / status bar
  g.fillStyle = 'rgba(0,0,30,0.85)'; g.fillRect(0, H - 92, W, 92);
  g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, H - 92); g.lineTo(W, H - 92); g.stroke();
  const msg = st.message || (st.phase === 'hold' ? 'HOLD CARDS THEN DRAW' : 'PRESS DEAL');
  const flash = st.win && Math.floor(t * 5) % 2;
  txt(g, msg, W / 2, H - 58, st.win ? 46 : 36, st.win ? (flash ? '#fff' : '#ffd23f') : '#9fc0ff', 'center', DISPLAY, st.win ? '#ffb000' : null);
  txt(g, `BET ${st.betText || ''}`, 28, H - 22, 26, '#ffd23f', 'left', LABEL);
  txt(g, `${st.title || 'JACKS OR BETTER'}`, W / 2, H - 22, 24, '#7d97d8', 'center', LABEL);
  txt(g, `CREDIT ${st.credit || ''}`, W - 28, H - 22, 26, '#7dffb0', 'right', LABEL);
}

// ---------------------------------------------------------------------------
// Keno: ball cage + 80-number board
// ---------------------------------------------------------------------------
export function drawKeno(g, W, H, st) {
  const t = st.t || 0;
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#12002e'); bg.addColorStop(1, '#00122e');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  txt(g, 'KENO', 190, 50, 74, '#ffd23f', 'center', DISPLAY, '#ff9a00');
  txt(g, 'PICK UP TO 10 · 20 BALLS DRAWN FROM 80', 190, 96, 22, '#b9a8ff', 'center', LABEL);
  // ball cage
  const cx = 190, cy = 290, R = 135;
  g.save();
  g.strokeStyle = 'rgba(200,220,255,0.85)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  g.fillStyle = 'rgba(120,160,255,0.10)'; g.fill();
  g.beginPath(); g.arc(cx, cy, R - 4, 0, 7); g.clip();
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = t * (0.9 + (i % 5) * 0.31) + i * 2.4, r2 = (0.18 + 0.72 * Math.abs(Math.sin(i * 3.1 + t * (0.6 + (i % 3) * 0.2)))) * (R - 24);
    const bx = cx + Math.cos(a) * r2, by = cy + Math.sin(a * 1.13) * r2;
    g.fillStyle = ['#ff4d57', '#ffd23f', '#3dff7a', '#2fe0ff', '#b36bff', '#ff9a3d'][i % 6];
    g.beginPath(); g.arc(bx, by, 15, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(bx - 5, by - 5, 5, 0, 7); g.fill();
  }
  g.restore();
  // last ball
  if (st.last) {
    const pulse = 1 + Math.sin(t * 10) * 0.03 * (st.drawing ? 1 : 0);
    g.save(); g.translate(190, 500); g.scale(pulse, pulse);
    const gr = g.createRadialGradient(-14, -14, 4, 0, 0, 62); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#ffe680'); gr.addColorStop(1, '#e0900a');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 62, 0, 7); g.fill();
    txt(g, String(st.last), 0, 4, 74, '#3a1a00', 'center', DISPLAY);
    g.restore();
  } else txt(g, st.picks && st.picks.length ? 'READY' : 'PICK YOUR NUMBERS', 190, 500, 32, '#7d97d8', 'center', LABEL);
  txt(g, `${(st.drawn || []).length} / 20 DRAWN`, 190, 590, 30, '#fff', 'center', LABEL);
  if (st.spots) txt(g, `${st.spots} SPOT${st.spots > 1 ? 'S' : ''} · ${st.hits ? st.hits.length : 0} CATCH`, 190, 628, 28, '#7dffb0', 'center', LABEL);
  // board
  const bx0 = 400, by0 = 24, cw = 84, chh = 72, gap = 4;
  const picks = new Set(st.picks || []), drawn = new Set(st.drawn || []);
  for (let i = 0; i < 80; i++) {
    const num = i + 1, col = i % 10, row = Math.floor(i / 10);
    const x = bx0 + col * (cw + gap), y = by0 + row * (chh + gap);
    const p = picks.has(num), d = drawn.has(num), hit = p && d;
    let fill = '#1a2a60', ink = '#cfe0ff';
    if (d) { fill = '#e0a010'; ink = '#2a1600'; }
    if (hit) { fill = Math.floor(t * 5) % 2 && !st.drawing ? '#ffffff' : '#3dff7a'; ink = '#003a12'; }
    g.fillStyle = fill; rrect(g, x, y, cw, chh, 10); g.fill();
    if (p && !hit) { g.strokeStyle = '#ff2fb0'; g.lineWidth = 6; rrect(g, x + 3, y + 3, cw - 6, chh - 6, 8); g.stroke(); ink = d ? ink : '#ff9be0'; }
    if (p) { g.fillStyle = hit ? '#004a1a' : '#ff2fb0'; g.beginPath(); g.arc(x + cw - 14, y + 14, 7, 0, 7); g.fill(); }
    if (st.cursor === num && !st.drawing && !(st.drawn && st.drawn.length)) { g.strokeStyle = '#fff'; g.lineWidth = 4; rrect(g, x - 1, y - 1, cw + 2, chh + 2, 11); g.stroke(); }
    txt(g, String(num), x + cw / 2, y + chh / 2 + 3, 40, ink, 'center', DISPLAY);
  }
  // pay strip
  if (st.payLine) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(bx0, H - 70, 10 * (cw + gap), 56); txt(g, st.payLine, bx0 + 5 * (cw + gap), H - 42, 26, '#ffe680', 'center', LABEL); }
  if (st.message) {
    g.fillStyle = 'rgba(0,0,0,0.7)'; rrect(g, bx0 + 60, 250, 10 * (cw + gap) - 120, 90, 16); g.fill();
    txt(g, st.message, bx0 + 5 * (cw + gap), 296, 44, st.win ? '#ffd23f' : '#fff', 'center', DISPLAY, st.win ? '#ff9a00' : null);
  }
}

// ---------------------------------------------------------------------------
// Race book: odds board and animated race
// ---------------------------------------------------------------------------
function drawHorse(g, x, y, s, color, phase, silk) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const gallop = Math.sin(phase) ;
  g.fillStyle = '#3a2412'; g.strokeStyle = '#3a2412'; g.lineCap = 'round';
  // legs
  g.lineWidth = 6;
  const legs = [[-24, 0], [-14, Math.PI], [16, Math.PI * 0.5], [26, Math.PI * 1.5]];
  for (const [lx, off] of legs) { const a = Math.sin(phase + off) * 0.7; g.beginPath(); g.moveTo(lx, 6); g.lineTo(lx + Math.sin(a) * 20, 6 + Math.cos(a) * 24); g.stroke(); }
  // body
  g.beginPath(); g.ellipse(0, 0, 36, 15, -0.05 * gallop, 0, 7); g.fill();
  // neck + head
  g.beginPath(); g.moveTo(26, -6); g.lineTo(44, -26 + gallop * 2); g.lineTo(58, -18 + gallop * 2); g.lineTo(46, -4); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-34, -4); g.quadraticCurveTo(-52, 6 + gallop * 6, -46, 22); g.lineWidth = 5; g.stroke();
  // jockey in silks
  g.fillStyle = silk; g.beginPath(); g.ellipse(2, -22, 11, 15, 0.4, 0, 7); g.fill();
  g.fillStyle = '#f1c27d'; g.beginPath(); g.arc(12, -38, 6, 0, 7); g.fill();
  g.fillStyle = silk; g.beginPath(); g.arc(12, -40, 6.5, Math.PI, 0); g.fill();
  g.restore();
}
export function drawRace(g, W, H, st) {
  const t = st.t || 0;
  const horses = st.horses || [];
  const n = Math.max(1, horses.length);
  g.fillStyle = '#04120a'; g.fillRect(0, 0, W, H);
  // header
  g.fillStyle = '#0a2a1a'; g.fillRect(0, 0, W, 78);
  txt(g, 'GOLDEN MIRAGE RACEWAY', 28, 40, 48, '#ffd23f', 'left', DISPLAY, '#ff9a00');
  txt(g, st.race ? `RACE ${st.race}` : '', W - 28, 40, 40, '#fff', 'right', DISPLAY);
  // odds board
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 78, 400, H - 78 - 64);
  txt(g, 'NO.  RUNNER', 20, 104, 24, '#7d97d8', 'left', LABEL); txt(g, 'WIN', 292, 104, 24, '#7d97d8', 'right', LABEL); txt(g, 'PLACE', 384, 104, 24, '#7d97d8', 'right', LABEL);
  const rowH = Math.min(70, (H - 78 - 64 - 40) / n);
  horses.forEach((h, i) => {
    const y = 130 + i * rowH;
    const mine = st.mine === i;
    if (mine) { g.fillStyle = 'rgba(255,210,63,0.22)'; g.fillRect(4, y - 2, 392, rowH - 4); }
    g.fillStyle = h.color; g.beginPath(); g.arc(34, y + rowH / 2 - 4, 17, 0, 7); g.fill();
    txt(g, String(i + 1), 34, y + rowH / 2 - 2, 24, '#111', 'center', DISPLAY);
    txt(g, h.name, 62, y + rowH / 2 - 3, 28, '#fff', 'left', LABEL);
    txt(g, h.winText, 292, y + rowH / 2 - 3, 32, '#ffe680', 'right', DISPLAY);
    txt(g, h.placeText, 384, y + rowH / 2 - 3, 28, '#9fe6b0', 'right', LABEL);
  });
  if (st.overround) txt(g, `BOOK ${(st.overround * 100).toFixed(0)}%`, 200, H - 96, 30, '#ff8a8a', 'center', DISPLAY);
  // track
  const tx0 = 420, tx1 = W - 70, ty0 = 90, laneH = (H - 90 - 70) / n;
  g.fillStyle = '#2f7a2f'; g.fillRect(tx0 - 10, ty0 - 8, W - tx0 + 10, H - ty0 - 60);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? '#3d8a36' : '#357f32'; g.fillRect(tx0 - 10, ty0 + i * laneH, W - tx0 + 10, laneH);
  }
  g.fillStyle = '#e8e8e8'; g.fillRect(tx1 + 6, ty0 - 8, 10, H - ty0 - 60);       // finish post
  for (let r = 0; r < 16; r++) { g.fillStyle = r % 2 ? '#111' : '#fff'; g.fillRect(tx1 + 16, ty0 - 8 + r * ((H - ty0 - 60) / 16), 14, (H - ty0 - 60) / 16); }
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.setLineDash([12, 12]);
  for (let i = 1; i < 4; i++) { const x = tx0 + (tx1 - tx0) * i / 4; g.beginPath(); g.moveTo(x, ty0); g.lineTo(x, H - 62); g.stroke(); }
  g.setLineDash([]);
  horses.forEach((h, i) => {
    const p = st.pos ? st.pos[i] : 0;
    const x = tx0 + 30 + (tx1 - tx0 - 60) * p, y = ty0 + i * laneH + laneH * 0.62;
    const running = st.running;
    drawHorse(g, x, y, Math.min(1.1, laneH / 70), '#3a2412', running ? t * 16 + i : 0.6, h.color);
    txt(g, String(i + 1), x - 44, y - laneH * 0.35, 20, '#fff', 'center', DISPLAY);
    if (st.finished && st.finished[i]) txt(g, ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'][st.finished[i] - 1], tx1 + 44, ty0 + i * laneH + laneH / 2, 24, st.finished[i] <= 2 ? '#ffd23f' : '#ddd', 'left', DISPLAY);
  });
  // ticker
  g.fillStyle = '#000'; g.fillRect(0, H - 60, W, 60);
  txt(g, st.message || 'PLACE YOUR BETS', W / 2, H - 30, 38, st.win ? '#ffd23f' : '#fff', 'center', DISPLAY, st.win ? '#ff9a00' : null);
}

// ---------------------------------------------------------------------------
// Scratch card kiosk
// ---------------------------------------------------------------------------
export function drawScratch(g, W, H, st) {
  const t = st.t || 0;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1a0a3a'); bg.addColorStop(1, '#0a0420');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  txt(g, 'LUCKY SCRATCH', W / 2, 56, 72, '#ffd23f', 'center', DISPLAY, '#ff9a00');
  // card
  const cx = 110, cy = 110, cw = W - 220, ch = 470;
  g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 24; g.shadowOffsetY = 10;
  const cg = g.createLinearGradient(cx, cy, cx + cw, cy + ch); cg.addColorStop(0, '#ff3d7f'); cg.addColorStop(1, '#ffb400');
  g.fillStyle = cg; rrect(g, cx, cy, cw, ch, 26); g.fill(); g.restore();
  txt(g, st.price ? `MATCH 3 AMOUNTS TO WIN · CARD ${money(st.price)}` : 'BUY A CARD', W / 2, cy + 40, 32, '#fff', 'center', LABEL);
  const cells = st.cells || [];
  const cols = 3, rows = 2, gw = 226, gh = 150, gx = (W - (gw * cols + 24 * (cols - 1))) / 2, gy = cy + 82;
  for (let i = 0; i < 6; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = gx + c * (gw + 24), y = gy + r * (gh + 24);
    const v = cells[i];
    g.fillStyle = '#fffbe8'; rrect(g, x, y, gw, gh, 14); g.fill();
    if (v !== undefined) {
      const win = st.winCells && st.winCells.includes(i) && (st.scr ? st.scr[i] >= 1 : true);
      if (win) { g.fillStyle = Math.floor(t * 4) % 2 ? '#c8ffd8' : '#fff59a'; rrect(g, x, y, gw, gh, 14); g.fill(); }
      txt(g, money(v), x + gw / 2, y + gh / 2 + 4, v >= 100000 ? 40 : 52, win ? '#008a2a' : '#5a1a3a', 'center', DISPLAY);
    }
    const k = st.scr ? st.scr[i] : 0;
    if (k < 1) {
      g.save(); rrect(g, x, y, gw, gh, 14); g.clip();
      const fg = g.createLinearGradient(x, y, x + gw, y + gh); fg.addColorStop(0, '#c9ccd2'); fg.addColorStop(0.5, '#eef0f4'); fg.addColorStop(1, '#a9adb6');
      g.fillStyle = fg; g.globalAlpha = 1;
      // foil is wiped from left to right
      g.fillRect(x + gw * k, y, gw * (1 - k) + 1, gh);
      g.fillStyle = '#7d818c'; g.font = `40px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (k < 0.5) g.fillText('SCRATCH', x + gw / 2 + gw * k / 2, y + gh / 2);
      g.restore();
    }
  }
  const win = st.result > 0;
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, H - 130, W, 130);
  txt(g, st.message || 'PRESS SPACE TO SCRATCH', W / 2, H - 82, 46, win ? '#ffd23f' : '#fff', 'center', DISPLAY, win ? '#ff9a00' : null);
  txt(g, st.sub || '', W / 2, H - 34, 26, '#b9a8ff', 'center', LABEL);
}

// ---------------------------------------------------------------------------
// Small static textures for cabinets that are not being played
// ---------------------------------------------------------------------------
export function drawAttract(g, W, H, kind, extra) {
  if (kind === 'videopoker') return drawVideoPoker(g, W, H, { t: 0, pays: extra && extra.pays, title: 'JACKS OR BETTER ' + (extra ? extra.table : ''), message: 'PRESS DEAL', cards: [] });
  const bg = g.createLinearGradient(0, 0, 0, H);
  if (kind === 'keno') { bg.addColorStop(0, '#2a0a5a'); bg.addColorStop(1, '#0a0a2a'); g.fillStyle = bg; g.fillRect(0, 0, W, H); txt(g, 'KENO', W / 2, H * 0.36, H * 0.34, '#ffd23f', 'center', DISPLAY, '#ff9a00'); txt(g, 'TOUCH TO PLAY', W / 2, H * 0.72, H * 0.13, '#b9a8ff', 'center', LABEL); }
  else if (kind === 'racebook') { bg.addColorStop(0, '#0a3a1a'); bg.addColorStop(1, '#03150a'); g.fillStyle = bg; g.fillRect(0, 0, W, H); txt(g, 'RACE BOOK', W / 2, H * 0.36, H * 0.26, '#ffd23f', 'center', DISPLAY, '#ff9a00'); txt(g, 'BET ON THE RUNNERS', W / 2, H * 0.72, H * 0.12, '#9fe6b0', 'center', LABEL); }
  else { bg.addColorStop(0, '#3a0a5a'); bg.addColorStop(1, '#1a0420'); g.fillStyle = bg; g.fillRect(0, 0, W, H); txt(g, 'SCRATCH', W / 2, H * 0.28, H * 0.22, '#ffd23f', 'center', DISPLAY, '#ff9a00'); txt(g, 'CARDS', W / 2, H * 0.5, H * 0.2, '#ff5aa0', 'center', DISPLAY); txt(g, 'INSTANT WIN?', W / 2, H * 0.78, H * 0.1, '#b9a8ff', 'center', LABEL); }
}
