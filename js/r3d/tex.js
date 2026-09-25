// Procedural textures (all drawn on canvases at load time, so there's nothing to download)
import * as THREE from 'three';

export const MAX_ANISO = { v: 8 };
let seed = 1234567;
export function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
export function rpick(a) { return a[Math.floor(rnd() * a.length)]; }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTex(w, h, draw, o = {}) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h, c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO.v;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  return t;
}

function grain(g, w, h, n, a, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = rnd() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${a})`;
    g.fillRect(rnd() * w, rnd() * h, size, size);
  }
}

// Draw something so it wraps seamlessly across tile edges
function wrapDraw(w, h, x, y, r, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
    if (x + dx + r < 0 || x + dx - r > w || y + dy + r < 0 || y + dy - r > h) continue;
    fn(x + dx, y + dy);
  }
}

// ---------------------------------------------------------------------------
// Casino carpet: dark base, ornate medallions, swirling vines and bursts of
// colour (the busy pattern is deliberate: it keeps eyes on the games)
// ---------------------------------------------------------------------------
const CARPETS = {
  carpet: { base: '#3d0a1c', a: '#e0a93a', b: '#1d8a8a', c: '#c23a7a', d: '#5a2380' },
  carpetTables: { base: '#0e2a26', a: '#e0b04a', b: '#b8325a', c: '#2f9fb0', d: '#6a2c8a' },
  carpetBlue: { base: '#101a3c', a: '#d8a848', b: '#3aa0c8', c: '#b83a78', d: '#2e5a9a' },
};
export function carpetTex(kind, repeat) {
  const p = CARPETS[kind] || CARPETS.carpet;
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = p.base; g.fillRect(0, 0, w, h);
    // background vines
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w, y = rnd() * h, r = 90 + rnd() * 120;
      const col = rpick([p.b, p.d, p.c]);
      wrapDraw(w, h, x, y, r + 40, (cx, cy) => {
        g.strokeStyle = col; g.lineWidth = 7 + rnd() * 5; g.globalAlpha = 0.75;
        g.beginPath();
        const a0 = rnd() * 6.28;
        for (let t = 0; t <= 1; t += 0.02) {
          const a = a0 + t * 4.2, rr = r * (1 - t * 0.7);
          const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
          t === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
        }
        g.stroke();
        // leaves along the vine
        for (let k = 0; k < 5; k++) {
          const a = a0 + k * 0.8, rr = r * (1 - k * 0.12);
          const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
          g.fillStyle = rpick([p.a, p.c, p.b]);
          g.beginPath(); g.ellipse(px, py, 16, 7, a + 1.2, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
      });
    }
    // gold medallions on a lattice
    const step = 256;
    for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 4; gy++) {
      const cx = gx * step + (gy % 2 ? step / 2 : 0) + step / 4, cy = gy * step + step / 4;
      wrapDraw(w, h, cx, cy, 80, (x, y) => {
        g.save(); g.translate(x, y);
        for (let k = 0; k < 8; k++) {
          g.rotate(Math.PI / 4);
          g.fillStyle = p.a; g.beginPath(); g.ellipse(0, -38, 11, 30, 0, 0, 7); g.fill();
          g.fillStyle = p.c; g.beginPath(); g.ellipse(0, -36, 5, 16, 0, 0, 7); g.fill();
        }
        g.fillStyle = p.d; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
        g.fillStyle = p.a; g.beginPath(); g.arc(0, 0, 12, 0, 7); g.fill();
        g.strokeStyle = p.a; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 70, 0, 7); g.stroke();
        g.restore();
      });
    }
    // scattered stars and dots
    for (let i = 0; i < 220; i++) {
      const x = rnd() * w, y = rnd() * h;
      g.fillStyle = rpick([p.a, p.b, p.c]);
      g.beginPath(); g.arc(x, y, 3 + rnd() * 5, 0, 7); g.fill();
    }
    grain(g, w, h, 90000, 0.07, 2);
  }, { repeat });
}

export function marbleTex(kind, repeat) {
  const dark = kind === 'marbleDark';
  return canvasTex(1024, 1024, (g, w, h) => {
    const tile = 512;
    for (let tx = 0; tx < 2; tx++) for (let ty = 0; ty < 2; ty++) {
      const x0 = tx * tile, y0 = ty * tile;
      const grd = g.createLinearGradient(x0, y0, x0 + tile, y0 + tile);
      if (dark) { grd.addColorStop(0, '#15120f'); grd.addColorStop(1, '#221c16'); }
      else { grd.addColorStop(0, '#d6cbbb'); grd.addColorStop(1, '#c4b6a2'); }
      g.fillStyle = grd; g.fillRect(x0, y0, tile, tile);
      g.save(); g.beginPath(); g.rect(x0, y0, tile, tile); g.clip();
      for (let i = 0; i < 16; i++) {
        g.strokeStyle = dark ? `rgba(210,170,90,${0.15 + rnd() * 0.35})` : `rgba(120,110,100,${0.1 + rnd() * 0.3})`;
        g.lineWidth = 0.6 + rnd() * 2.2;
        g.beginPath();
        let x = x0 + rnd() * tile, y = y0;
        g.moveTo(x, y);
        while (y < y0 + tile) { x += (rnd() - 0.5) * 40; y += 10 + rnd() * 14; g.lineTo(x, y); }
        g.stroke();
      }
      g.restore();
      g.strokeStyle = dark ? 'rgba(200,160,70,0.8)' : 'rgba(90,80,70,0.35)';
      g.lineWidth = dark ? 3 : 2;
      g.strokeRect(x0 + 1, y0 + 1, tile - 2, tile - 2);
    }
    grain(g, w, h, 30000, 0.03);
  }, { repeat });
}

export function woodTex(repeat) {
  return canvasTex(512, 512, (g, w, h) => {
    for (let i = 0; i < 16; i++) {
      const y = i * 32;
      const base = 60 + rnd() * 25;
      g.fillStyle = `rgb(${base + 40},${base + 12},${base - 20})`;
      g.fillRect(0, y, w, 32);
      for (let k = 0; k < 40; k++) {
        g.strokeStyle = `rgba(30,15,5,${0.05 + rnd() * 0.12})`;
        g.lineWidth = 1;
        g.beginPath(); const yy = y + rnd() * 32; g.moveTo(0, yy);
        g.bezierCurveTo(w * 0.3, yy + (rnd() - 0.5) * 6, w * 0.6, yy + (rnd() - 0.5) * 6, w, yy);
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y, w, 2);
      g.fillRect((rnd() * w) | 0, y, 2, 32);
    }
  }, { repeat });
}

export function tilesTex(repeat) {
  return canvasTex(512, 512, (g, w, h) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#d9d2c4' : '#cfc6b6';
      g.fillRect(i * 256, j * 256, 256, 256);
    }
    grain(g, w, h, 20000, 0.04);
    g.strokeStyle = '#9d9585'; g.lineWidth = 3;
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, h); g.moveTo(0, i * 256); g.lineTo(w, i * 256); g.stroke(); }
  }, { repeat });
}

export function sidewalkTex(repeat) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#a5a29b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = 150 + rnd() * 30;
      g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
      g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
    }
    grain(g, w, h, 40000, 0.12);
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(40,40,40,0.25)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 3 + rnd() * 6, 0, 7); g.fill(); } // gum
  }, { repeat });
}

export function asphaltTex(repeat) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2b2c30'; g.fillRect(0, 0, w, h);
    grain(g, w, h, 80000, 0.14, 2);
    grain(g, w, h, 4000, 0.25, 3);
    g.strokeStyle = 'rgba(15,15,15,0.6)'; g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
  }, { repeat });
}

export function stoneTex(repeat, color = '#d8c7a3') {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    grain(g, w, h, 30000, 0.06, 3);
    g.strokeStyle = 'rgba(80,60,40,0.35)'; g.lineWidth = 2;
    for (let y = 0; y < h; y += 64) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      for (let x = (y / 64) % 2 ? 0 : 64; x < w; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); }
    }
  }, { repeat });
}

// ---------------------------------------------------------------------------
// Text / sign textures
// ---------------------------------------------------------------------------
export function textTex(lines, o = {}) {
  const w = o.w || 1024, h = o.h || 256;
  return canvasTex(w, h, (g) => {
    if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
    if (o.border) { g.strokeStyle = o.border; g.lineWidth = o.borderW || 10; g.strokeRect(6, 6, w - 12, h - 12); }
    const arr = Array.isArray(lines) ? lines : [lines];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const weights = o.weights || arr.map((_, i) => (i === 0 ? 1 : o.sub || 0.55));
    const total = weights.reduce((a, b) => a + b, 0);
    let y = h * 0.08;
    arr.forEach((ln, i) => {
      const lh = (h * 0.84) * weights[i] / total;
      let size = lh * 0.82;
      g.font = `${o.weight || 900} ${size}px ${o.font || '"Anton", "Arial Black", Impact, sans-serif'}`;
      const mw = g.measureText(ln).width;
      if (mw > w * 0.92) { size *= (w * 0.92) / mw; g.font = `${o.weight || 900} ${size}px ${o.font || '"Anton", "Arial Black", Impact, sans-serif'}`; }
      if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = o.blur || 24; }
      g.fillStyle = (o.colors && o.colors[i]) || o.color || '#fff';
      g.fillText(ln, w / 2, y + lh / 2);
      if (o.glow) { g.shadowBlur = 0; g.fillText(ln, w / 2, y + lh / 2); }
      y += lh;
    });
  });
}

// Building windows (emissive map)
export function windowsTex(cols, rows, lit = 0.45, palette = ['#ffd9a0', '#ffe9c4', '#bcd8ff', '#fff2d0']) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (rnd() < lit) {
        g.fillStyle = rpick(palette);
        g.globalAlpha = 0.45 + rnd() * 0.55;
        g.fillRect(i * cw + cw * 0.15, j * rh + rh * 0.18, cw * 0.7, rh * 0.6);
      }
    }
    g.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------------------
// Table felts
// ---------------------------------------------------------------------------
const FELT = { base: '#0d5b34', dark: '#0a4428', line: '#f2e3b0' };
function feltBase(g, w, h, color = FELT.base) {
  const grd = g.createRadialGradient(w / 2, h * 0.6, 50, w / 2, h * 0.6, w * 0.7);
  grd.addColorStop(0, color); grd.addColorStop(1, FELT.dark);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  grain(g, w, h, 60000, 0.05, 2);
}
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

// Blackjack & baccarat: dealer side at the top (v = 0), players along the curve.
export function feltTex(kind) {
  return canvasTex(2048, 1024, (g, w, h) => {
    feltBase(g, w, h, kind === 'baccarat' ? '#123f6b' : kind === 'vip' ? '#5b1020' : FELT.base);
    g.strokeStyle = FELT.line; g.fillStyle = FELT.line; g.lineWidth = 5;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const arc = (r, a0, a1) => { g.beginPath(); g.arc(w / 2, -h * 0.55, r, a0, a1); g.stroke(); };
    if (kind === 'blackjack' || kind === 'vip') {
      arc(h * 1.12, 0.22 * Math.PI, 0.78 * Math.PI);
      arc(h * 1.24, 0.24 * Math.PI, 0.76 * Math.PI);
      g.font = 'italic 700 58px Georgia, serif';
      curvedText(g, 'BLACKJACK PAYS 6 TO 5', w / 2, -h * 0.55, h * 1.02, 0.5 * Math.PI);
      g.font = '600 34px Georgia, serif';
      curvedText(g, 'Dealer must draw to 16 and stand on all 17s', w / 2, -h * 0.55, h * 0.95, 0.5 * Math.PI);
      curvedText(g, 'INSURANCE PAYS 2 TO 1', w / 2, -h * 0.55, h * 1.18, 0.5 * Math.PI);
      // betting circles along the curve
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.3 + i * 0.1);
        const x = w / 2 + Math.cos(a) * h * 1.36, y = -h * 0.55 + Math.sin(a) * h * 1.36;
        g.lineWidth = 6; g.beginPath(); g.arc(x, y, 60, 0, 7); g.stroke();
        g.lineWidth = 3; g.beginPath(); g.arc(x, y, 48, 0, 7); g.stroke();
      }
      g.font = '900 64px Georgia, serif';
      g.fillText(kind === 'vip' ? 'GOLDEN MIRAGE · PRIVÉ' : 'GOLDEN MIRAGE', w / 2, h * 0.12);
    } else if (kind === 'baccarat') {
      g.font = '900 64px Georgia, serif';
      g.fillText('BACCARAT', w / 2, h * 0.12);
      g.lineWidth = 6;
      for (const [r, label] of [[h * 1.08, 'TIE PAYS 8 TO 1'], [h * 1.22, 'BANKER'], [h * 1.36, 'PLAYER']]) {
        arc(r, 0.2 * Math.PI, 0.8 * Math.PI);
        g.font = '800 44px Georgia, serif';
        curvedText(g, label, w / 2, -h * 0.55, r + 36, 0.5 * Math.PI);
      }
    }
  });
}

function curvedText(g, text, cx, cy, r, mid) {
  const chars = [...text];
  let total = 0;
  const widths = chars.map(c => { const m = g.measureText(c).width; total += m; return m; });
  let a = mid + (total / r) / 2;
  for (let i = 0; i < chars.length; i++) {
    const cw = widths[i] / r;
    a -= cw / 2;
    g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(a - Math.PI / 2);
    g.fillText(chars[i], 0, 0); g.restore();
    a -= cw / 2;
  }
}

// Roulette layout: 0/00 column + 12x3 grid + outside bets, wheel end at the left.
export function rouletteFeltTex() {
  return canvasTex(2048, 1024, (g, w, h) => {
    feltBase(g, w, h);
    const x0 = 560, y0 = 170, cw = 102, ch = 170;
    g.lineWidth = 4; g.strokeStyle = FELT.line;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // zeros
    for (const [i, label] of [[0, '0'], [1, '00']]) {
      g.fillStyle = '#0c7a3e'; g.fillRect(x0 - 120, y0 + i * ch * 1.5, 118, ch * 1.5);
      g.strokeRect(x0 - 120, y0 + i * ch * 1.5, 118, ch * 1.5);
      g.fillStyle = '#fff'; g.font = '800 64px Georgia, serif'; g.fillText(label, x0 - 61, y0 + i * ch * 1.5 + ch * 0.75);
    }
    for (let c = 0; c < 12; c++) for (let r = 0; r < 3; r++) {
      const n = c * 3 + (3 - r);
      const x = x0 + c * cw, y = y0 + r * ch;
      g.strokeRect(x, y, cw, ch);
      g.fillStyle = REDS.has(n) ? '#b3121f' : '#141414';
      g.beginPath(); g.ellipse(x + cw / 2, y + ch / 2, 36, 50, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = '800 52px Georgia, serif';
      g.save(); g.translate(x + cw / 2, y + ch / 2); g.rotate(-Math.PI / 2); g.fillText(n, 0, 2); g.restore();
    }
    g.font = '800 50px Georgia, serif'; g.fillStyle = FELT.line;
    ['1st 12', '2nd 12', '3rd 12'].forEach((s, i) => { g.strokeRect(x0 + i * cw * 4, y0 + ch * 3, cw * 4, 110); g.fillText(s, x0 + i * cw * 4 + cw * 2, y0 + ch * 3 + 55); });
    const outs = ['1-18', 'EVEN', '◆', '◆', 'ODD', '19-36'];
    outs.forEach((s, i) => {
      const x = x0 + i * cw * 2, y = y0 + ch * 3 + 110;
      g.strokeRect(x, y, cw * 2, 110);
      if (s === '◆') { g.fillStyle = i === 2 ? '#b3121f' : '#111'; g.beginPath(); g.moveTo(x + cw, y + 18); g.lineTo(x + cw + 60, y + 55); g.lineTo(x + cw, y + 92); g.lineTo(x + cw - 60, y + 55); g.fill(); g.fillStyle = FELT.line; }
      else g.fillText(s, x + cw, y + 55);
    });
    g.font = '700 32px Georgia, serif';
    g.fillText('Straight up pays 35 to 1 · Double zero wheel', x0 + cw * 6, 90);
  });
}

export function crapsFeltTex() {
  return canvasTex(2048, 1024, (g, w, h) => {
    feltBase(g, w, h);
    g.strokeStyle = FELT.line; g.fillStyle = FELT.line; g.lineWidth = 6;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeRect(60, 60, w - 120, h - 120);
    // place numbers
    const nums = ['4', '5', 'SIX', '8', 'NINE', '10'];
    nums.forEach((n, i) => {
      const x = 420 + i * 200;
      g.strokeRect(x, 110, 200, 200);
      g.font = '900 78px Georgia, serif'; g.fillText(n, x + 100, 210);
    });
    g.strokeRect(420, 330, 1200, 150); g.font = '900 80px Georgia, serif'; g.fillText('COME', 1020, 405);
    g.strokeRect(420, 500, 1200, 150);
    g.font = '800 44px Georgia, serif'; g.fillText('FIELD  2 · 3 · 4 · 9 · 10 · 11 · 12', 1020, 575);
    g.strokeRect(420, 670, 1200, 100); g.font = '800 48px Georgia, serif'; g.fillText("DON'T PASS BAR", 1020, 720);
    g.beginPath(); g.moveTo(140, 870); g.lineTo(1900, 870); g.stroke();
    g.beginPath(); g.moveTo(140, 790); g.lineTo(1900, 790); g.stroke();
    g.font = '900 72px Georgia, serif'; g.fillText('PASS LINE', 1020, 830);
    g.save(); g.translate(250, 450); g.rotate(-Math.PI / 2); g.font = '800 60px Georgia, serif'; g.fillText("DON'T COME BAR", 0, 0); g.restore();
  });
}

// ---------------------------------------------------------------------------
// Playing cards: one atlas with 52 faces and a back (13 x 5 grid)
// ---------------------------------------------------------------------------
export const CARD_W = 150, CARD_H = 210;
const SUIT_CH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const PIPS = {
  A: [[0.5, 0.5]], 2: [[0.5, 0.2], [0.5, 0.8]], 3: [[0.5, 0.2], [0.5, 0.5], [0.5, 0.8]],
  4: [[0.3, 0.2], [0.7, 0.2], [0.3, 0.8], [0.7, 0.8]], 5: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.5], [0.3, 0.8], [0.7, 0.8]],
  6: [[0.3, 0.2], [0.7, 0.2], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]],
  7: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]],
  8: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.5, 0.65], [0.3, 0.8], [0.7, 0.8]],
  9: [[0.3, 0.18], [0.7, 0.18], [0.3, 0.39], [0.7, 0.39], [0.5, 0.5], [0.3, 0.61], [0.7, 0.61], [0.3, 0.82], [0.7, 0.82]],
  10: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.29], [0.3, 0.39], [0.7, 0.39], [0.3, 0.61], [0.7, 0.61], [0.5, 0.71], [0.3, 0.82], [0.7, 0.82]],
};
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['S', 'H', 'D', 'C'];
export function cardAtlas() {
  const tex = canvasTex(CARD_W * 13, CARD_H * 5, (g) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    SUITS.forEach((s, row) => RANKS.forEach((r, col) => {
      const x = col * CARD_W, y = row * CARD_H;
      const red = s === 'H' || s === 'D';
      roundRect(g, x + 2, y + 2, CARD_W - 4, CARD_H - 4, 12, '#fbfaf6');
      g.strokeStyle = '#c9c4b8'; g.lineWidth = 2; g.stroke();
      g.fillStyle = red ? '#c0121f' : '#141414';
      g.font = '800 30px Georgia, serif';
      g.fillText(r, x + 20 + (r === '10' ? 4 : 0), y + 26);
      g.font = '28px serif'; g.fillText(SUIT_CH[s], x + 20, y + 54);
      g.save(); g.translate(x + CARD_W - 20, y + CARD_H - 26); g.rotate(Math.PI);
      g.font = '800 30px Georgia, serif'; g.fillText(r, 0, 0); g.font = '28px serif'; g.fillText(SUIT_CH[s], 0, -28); g.restore();
      const ix = x + 32, iy = y + 34, iw = CARD_W - 64, ih = CARD_H - 68;
      if (PIPS[r]) {
        g.font = `${r === 'A' ? 84 : 40}px serif`;
        for (const [px, py] of PIPS[r]) {
          g.save(); g.translate(ix + px * iw, iy + py * ih); if (py > 0.55) g.rotate(Math.PI); g.fillText(SUIT_CH[s], 0, 0); g.restore();
        }
      } else {
        // court card: framed portrait panel
        g.fillStyle = red ? '#f3d9a0' : '#d8e2f0'; g.fillRect(ix, iy, iw, ih);
        g.strokeStyle = red ? '#c0121f' : '#1f3a93'; g.lineWidth = 3; g.strokeRect(ix, iy, iw, ih);
        g.fillStyle = red ? '#c0121f' : '#1f3a93';
        g.font = '900 64px Georgia, serif'; g.fillText(r, ix + iw / 2, iy + ih * 0.42);
        g.font = '40px serif'; g.fillText(SUIT_CH[s], ix + iw / 2, iy + ih * 0.78);
        g.fillStyle = '#c9a227'; g.beginPath(); g.moveTo(ix + iw / 2 - 22, iy + 22); g.lineTo(ix + iw / 2 - 12, iy + 8); g.lineTo(ix + iw / 2, iy + 20); g.lineTo(ix + iw / 2 + 12, iy + 8); g.lineTo(ix + iw / 2 + 22, iy + 22); g.fill();
      }
    }));
    // back (row 4, col 0)
    const x = 0, y = 4 * CARD_H;
    roundRect(g, x + 2, y + 2, CARD_W - 4, CARD_H - 4, 12, '#fbfaf6');
    roundRect(g, x + 10, y + 10, CARD_W - 20, CARD_H - 20, 8, '#8b0f1f');
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
    for (let i = -CARD_H; i < CARD_W + CARD_H; i += 10) { g.beginPath(); g.moveTo(x + 10 + i, y + 10); g.lineTo(x + 10 + i - CARD_H, y + CARD_H - 10); g.stroke(); g.beginPath(); g.moveTo(x + 10 + i - CARD_H, y + 10); g.lineTo(x + 10 + i, y + CARD_H - 10); g.stroke(); }
    g.fillStyle = '#f2c14e'; g.font = '900 34px Georgia, serif'; g.fillText('GM', x + CARD_W / 2, y + CARD_H / 2);
  });
  tex.anisotropy = MAX_ANISO.v;
  return tex;
}
export function cardUV(rank, suit) {
  const col = rank === 'back' ? 0 : RANKS.indexOf(rank), row = rank === 'back' ? 4 : SUITS.indexOf(suit);
  return { u0: col / 13, u1: (col + 1) / 13, v0: 1 - (row + 1) / 5, v1: 1 - row / 5 };
}
function roundRect(g, x, y, w, h, r, fill) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------
export const CHIP_COLORS = { 1: '#e8e8e8', 5: '#c0121f', 25: '#1f7a3a', 100: '#151515', 500: '#6a2c8a', 1000: '#e0a020', 5000: '#8a5a2a', 25000: '#1f5fb0', 100000: '#d0406a' };
export function chipFaceTex(value) {
  const col = CHIP_COLORS[value] || '#555';
  return canvasTex(256, 256, (g) => {
    g.fillStyle = col; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
    g.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) { g.save(); g.translate(128, 128); g.rotate(i * Math.PI / 4); g.fillRect(-14, -128, 28, 34); g.restore(); }
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 4; g.setLineDash([10, 8]); g.beginPath(); g.arc(128, 128, 84, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#f7f3e8'; g.beginPath(); g.arc(128, 128, 72, 0, 7); g.fill();
    g.fillStyle = col === '#e8e8e8' ? '#333' : col; g.textAlign = 'center'; g.textBaseline = 'middle';
    const label = value >= 1000 ? (value / 1000) + 'K' : String(value);
    g.font = `900 ${label.length > 3 ? 44 : 60}px Georgia, serif`; g.fillText(label, 128, 124);
    g.font = '700 16px Georgia, serif'; g.fillText('GOLDEN MIRAGE', 128, 168);
  });
}
export function chipEdgeTex(value) {
  const col = CHIP_COLORS[value] || '#555';
  return canvasTex(256, 16, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 4, 0, 14, h);
  });
}

// ---------------------------------------------------------------------------
// Slot machines
// ---------------------------------------------------------------------------
export const SLOT_STYLE = {
  'Lucky 777': { a: '#ff2d55', b: '#ffd23f', bg: ['#3a0010', '#8a0a2a'], sym: ['7', 'BAR', '🍒', '★', '💎'] },
  'Golden Dragon': { a: '#ffb300', b: '#ff3b1f', bg: ['#2a0a00', '#7a1a00'], sym: ['🐉', '🏮', '💰', '🧧', '🀄'] },
  'Diamond Blaze': { a: '#3de0ff', b: '#b36bff', bg: ['#050a30', '#20107a'], sym: ['💎', '7', '★', '🔔', 'BAR'] },
  'Pharaoh’s Riches': { a: '#ffd23f', b: '#1fc8a8', bg: ['#1a1000', '#5a3a00'], sym: ['𓂀', '🐍', '👑', '⚱️', '🪙'] },
  'Stampede Gold': { a: '#ff8a00', b: '#ffe066', bg: ['#1a0c02', '#6a3a10'], sym: ['🦬', '🦅', '🐺', '🌵', '🪙'] },
  'Cash Tornado': { a: '#3dff7a', b: '#ffffff', bg: ['#021a0a', '#0a5a2a'], sym: ['💵', '🌪️', '💰', '7', '★'] },
  'Mega Wheel': { a: '#ff3df0', b: '#ffd23f', bg: ['#1a0030', '#50108a'], sym: ['7', '💎', '★', 'BAR', '🍒'] },
};

export function slotTopperTex(theme) {
  const st = SLOT_STYLE[theme] || SLOT_STYLE['Lucky 777'];
  return canvasTex(1024, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, st.bg[1]); grd.addColorStop(1, st.bg[0]);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // light rays
    g.save(); g.translate(w / 2, h * 0.55);
    for (let i = 0; i < 24; i++) { g.rotate(Math.PI / 12); g.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(255,220,120,0.08)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-60, -700); g.lineTo(60, -700); g.fill(); }
    g.restore();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = st.a; g.shadowBlur = 30;
    g.font = '900 150px "Anton", Impact, sans-serif';
    const grd2 = g.createLinearGradient(0, h * 0.25, 0, h * 0.7);
    grd2.addColorStop(0, '#fff6c8'); grd2.addColorStop(0.5, st.b); grd2.addColorStop(1, st.a);
    g.fillStyle = grd2;
    g.fillText(theme.toUpperCase(), w / 2, h * 0.46, w * 0.92);
    g.shadowBlur = 0;
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.strokeText(theme.toUpperCase(), w / 2, h * 0.46, w * 0.92);
    g.font = '800 54px "Barlow Condensed", Arial, sans-serif'; g.fillStyle = '#fff';
    g.fillText('PROGRESSIVE · 5 REELS · 243 WAYS', w / 2, h * 0.82);
    g.strokeStyle = st.b; g.lineWidth = 12; g.strokeRect(8, 8, w - 16, h - 16);
  });
}

// Main screen of a slot machine: a live canvas redrawn at a low rate
export class SlotScreen {
  constructor(theme, w = 512, h = 400, n = 5) {
    this.n = n;
    this.st = SLOT_STYLE[theme] || SLOT_STYLE['Lucky 777'];
    this.theme = theme;
    this.canvas = makeCanvas(w, h);
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.offsets = Array.from({ length: n }, () => rnd() * 10);
    this.speeds = Array(n).fill(0);
    this.result = null;
    this.strips = Array.from({ length: n }, () => Array.from({ length: 12 }, () => rpick(this.st.sym)));
    this.flash = 0;
    this.message = '';
    this.draw();
  }
  draw() {
    const g = this.g, { width: w, height: h } = this.canvas, st = this.st;
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, st.bg[1]); grd.addColorStop(1, st.bg[0]);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const n = this.n;
    const reelW = w * 0.92 / n - w * 0.004, top = h * 0.12, rh = h * 0.72;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let r = 0; r < n; r++) {
      const x = w * 0.04 + r * (reelW + w * 0.004);
      const rg = g.createLinearGradient(0, top, 0, top + rh);
      rg.addColorStop(0, '#bdb8a8'); rg.addColorStop(0.15, '#fffdf4'); rg.addColorStop(0.85, '#fffdf4'); rg.addColorStop(1, '#bdb8a8');
      g.fillStyle = rg; g.fillRect(x, top, reelW, rh);
      g.save(); g.beginPath(); g.rect(x, top, reelW, rh); g.clip();
      const cell = rh / 3;
      const off = this.offsets[r];
      const base = Math.floor(off);
      const frac = off - base;
      const blur = Math.min(1, Math.abs(this.speeds[r]) / 25);
      for (let k = -1; k < 4; k++) {
        const idx = ((base + k) % 12 + 12) % 12;
        const sym = this.result && this.speeds[r] === 0 && k >= 0 && k < 3 ? this.result[r][k] : this.strips[r][idx];
        const y = top + (k + frac) * cell + cell / 2 - cell * 0;
        g.globalAlpha = 1 - blur * 0.55;
        g.font = `${sym.length > 2 ? '900 ' + (cell * 0.36) + 'px Impact' : (cell * 0.6) + 'px serif'}`;
        g.fillStyle = sym === '7' ? '#d0121f' : sym === 'BAR' ? '#111' : '#222';
        g.fillText(sym, x + reelW / 2, y);
        if (blur > 0.2) { g.globalAlpha = blur * 0.25; g.fillText(sym, x + reelW / 2, y - cell * 0.18); g.fillText(sym, x + reelW / 2, y + cell * 0.18); }
      }
      g.globalAlpha = 1; g.restore();
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.strokeRect(x, top, reelW, rh);
    }
    // payline
    g.strokeStyle = this.flash > 0 && Math.floor(this.flash * 8) % 2 ? '#fff' : st.a; g.lineWidth = 4;
    g.beginPath(); g.moveTo(w * 0.02, top + rh / 2); g.lineTo(w * 0.98, top + rh / 2); g.stroke();
    // bottom bar
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = this.flash > 0 ? st.b : '#fff'; g.font = `800 ${h * 0.075}px "Barlow Condensed", Arial, sans-serif`;
    g.fillText(this.message || this.theme.toUpperCase(), w / 2, h * 0.93);
    g.fillStyle = st.b; g.font = `900 ${h * 0.08}px "Anton", Impact, sans-serif`;
    g.fillText(this.theme.toUpperCase(), w / 2, h * 0.06);
    this.tex.needsUpdate = true;
  }
  update(dt) {
    let moving = false;
    for (let r = 0; r < this.n; r++) {
      if (this.speeds[r] !== 0) {
        moving = true;
        this.offsets[r] += this.speeds[r] * dt;
        if (this.stopAt && this.stopAt[r] !== undefined && this.clock >= this.stopAt[r]) { this.speeds[r] = 0; this.offsets[r] = Math.round(this.offsets[r]); }
      }
    }
    this.clock = (this.clock || 0) + dt;
    if (this.flash > 0) this.flash -= dt;
    return moving || this.flash > 0;
  }
  spin(result, duration = 1.6) {
    this.result = result;
    this.clock = 0;
    this.speeds = Array.from({ length: this.n }, (_, i) => 22 + i);
    this.stopAt = Array.from({ length: this.n }, (_, i) => duration * 0.45 + i * duration * (0.55 / this.n));
    this.message = 'GOOD LUCK!';
  }
}

// Scrolling LED jackpot meter
export function jackpotCanvas(w = 1024, h = 160) {
  const c = makeCanvas(w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { canvas: c, g: c.getContext('2d'), tex: t };
}
