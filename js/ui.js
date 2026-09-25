'use strict';

const $ = sel => document.querySelector(sel);

let modalOpen = false;
let screenOpen = false;
let modalOnClose = null;

function toast(text, kind = 'info', ms) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = text;
  $('#toasts').appendChild(el);
  const life = ms || (kind === 'lesson' ? 9000 : 3500);
  setTimeout(() => el.classList.add('fade'), life - 400);
  setTimeout(() => el.remove(), life);
  const all = $('#toasts').children;
  while (all.length > 5) all[0].remove();
}

function lesson(key, text) {
  if (S.lessonsShown[key]) return;
  S.lessonsShown[key] = true;
  toast('💡 ' + text, 'lesson');
}

function openModal(title, bodyEl, onClose) {
  $('#modal-title').textContent = title;
  const body = $('#modal-body');
  body.innerHTML = '';
  if (typeof bodyEl === 'string') body.innerHTML = bodyEl;
  else body.appendChild(bodyEl);
  $('#modal').classList.remove('hidden');
  modalOpen = true;
  modalOnClose = onClose || null;
  if (typeof clearMovement === 'function') clearMovement();
}

function closeModal(force = false) {
  if (!modalOpen) return;
  if (modalOnClose) {
    const ok = modalOnClose();
    if (!force && ok === false) return; // round in progress
  }
  $('#modal').classList.add('hidden');
  $('#modal-close').classList.remove('hidden');
  modalOpen = false;
  modalOnClose = null;
}

// Simple info dialog with action buttons: [{label, cls, fn}]
function infoDialog(title, html, buttons = []) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="info">${html}</div>`;
  const row = document.createElement('div');
  row.className = 'btn-row';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.cls || '');
    btn.innerHTML = b.label;
    if (b.disabled) btn.disabled = true;
    btn.onclick = () => b.fn(btn);
    row.appendChild(btn);
  });
  const close = document.createElement('button');
  close.className = 'btn ghost';
  close.textContent = 'Leave';
  close.onclick = () => closeModal();
  row.appendChild(close);
  wrap.appendChild(row);
  openModal(title, wrap);
  return wrap;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
let hudTimer = 0;
function updateHUD(force) {
  const now = performance.now();
  if (!force && now - hudTimer < 100) return;
  hudTimer = now;
  $('#h-cash').textContent = fmt(S.cash);
  const debt = totalDebt();
  $('#h-debt').textContent = fmt(debt);
  $('#h-debt').parentElement.classList.toggle('danger', debt > 0);
  const net = netWorth() - CONFIG.START_CASH;
  $('#h-net').textContent = (net >= 0 ? '+' : '') + fmt(net);
  $('#h-net').className = net >= 0 ? 'pos' : 'neg';
  $('#h-time').textContent = clockText();
  $('#h-tier').textContent = TIERS[tierIndex()].name;
  ['hunger', 'thirst', 'energy'].forEach(k => {
    const v = S[k];
    const bar = $('#b-' + k);
    bar.style.width = v + '%';
    bar.parentElement.parentElement.classList.toggle('low', v < 25);
  });
  $('#b-health').style.width = S.health + '%';
  $('#b-health').parentElement.classList.toggle('low', S.health < 30);
  $('#b-armor').style.width = S.armor + '%';
  const heat = sharkOverdue() ? Math.min(5, S.shark.overdueDays + S.tonyAngry) : 0;
  $('#heat').innerHTML = heat ? '★'.repeat(heat) + '<span>' + '★'.repeat(5 - heat) + '</span>' : '';
  const debtPct = clamp(debt / CONFIG.GAME_OVER_DEBT * 100, 0, 100);
  $('#b-debt').style.width = debtPct + '%';
  $('#debt-meter').classList.toggle('hidden', debt <= 0);
  const badge = $('#badge');
  badge.textContent = S.unread;
  badge.classList.toggle('hidden', S.unread === 0);
}

// ---------------------------------------------------------------------------
// Full-screen overlays (intro, endings)
// ---------------------------------------------------------------------------
function showScreen(html) {
  const s = $('#screen');
  s.innerHTML = `<div class="screen-box">${html}</div>`;
  s.classList.remove('hidden');
  screenOpen = true;
  if (typeof clearMovement === 'function') clearMovement();
  return s;
}
function hideScreen() {
  $('#screen').classList.add('hidden');
  screenOpen = false;
}
