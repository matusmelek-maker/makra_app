import * as C from './calc.js';
import { parseHealthPayload } from './health.js';
import * as Cloud from './cloud.js';

const STORE_KEY = 'makra-data-v1';
const BACKUP_KEY = 'makra-last-backup';
const UNDO_IMPORT_KEY = 'makra-before-import'; // stav pred posledným nahratím zálohy
const DAY_NAMES = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
const DAY_SHORT = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
const MACRO_LABEL = { carbs: 'Sacharidy', protein: 'Bielkoviny', fat: 'Tuky', fiber: 'Vláknina' };
const LEVEL_TEXT = { great: 'priveľký deficit – už je to veľa', good: 'výborný deficit', ok: 'mierny deficit', bad: 'prebytok', none: 'bez zápisu' };
const levelText = (lvl, balance) => (lvl !== 'none' && Math.round(balance) === 0 ? 'nula – rovnováha' : LEVEL_TEXT[lvl]);

// ---------- storage ----------
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.error(e);
  }
  return C.defaultData();
}
function migrate(d) {
  const def = C.defaultData();
  // trávenie pribudlo neskôr: staré dáta dostanú 0 % od začiatku sledovania
  if (d.settings && !d.settings.tef && d.settings.startDate) d.settings.tef = [{ from: d.settings.startDate, value: 0 }];
  d.settings = { ...def.settings, ...d.settings };
  d.settings.targets = { ...def.settings.targets, ...d.settings.targets };
  for (const k of ['bazal', 'stepCoef', 'tef']) {
    if (!Array.isArray(d.settings[k]) || !d.settings[k].length) {
      d.settings[k] = [{ from: d.settings.startDate, value: Number(d.settings[k]) || 0 }];
    }
  }
  d.days ||= {};
  d.measurements ||= [];
  return d;
}
let saveTimer;
let dirty = false;
function flush() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    dirty = false;
  } catch (e) {
    toast('Nepodarilo sa uložiť!');
  }
}
function save(now = false) {
  dirty = true;
  clearTimeout(saveTimer);
  if (now) flush();
  else saveTimer = setTimeout(flush, 300);
  scheduleCloud();
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  flush();
  if (cloudPending) syncCloud({ keepalive: true }); // pri odchode z appky pošli zálohu hneď
});

// ---------- automatická záloha na GitHub ----------
let cloudTimer;
let cloudPending = false;
function scheduleCloud() {
  if (!Cloud.cloudEnabled()) return;
  cloudPending = true;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => syncCloud(), 90e3); // najviac raz za 1,5 min počas písania
}
async function syncCloud(opts = {}) {
  clearTimeout(cloudTimer);
  if (!Cloud.cloudEnabled()) return { ok: false };
  flush();
  cloudPending = false;
  const r = await Cloud.pushBackup(data, opts);
  if (r.ok && !r.skipped) localStorage.setItem(BACKUP_KEY, new Date().toISOString());
  if (!r.ok && r.status !== 0) cloudPending = r.status !== -2;
  if (tab === 'settings') renderCloudStatus();
  return r;
}

let data = load();
let tab = 'day';
let currentDate = C.today();
let lastImport = null; // posledný import zo Zdravia, kvôli tlačidlu "Vrátiť"

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const nf = (dec) => new Intl.NumberFormat('sk-SK', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmt = (n, dec = 0) => nf(dec).format(Math.abs(n) < 0.5 * 10 ** -dec ? 0 : n);
const fmtSigned = (n, dec = 0) => (n > 0.5 * 10 ** -dec ? '+' : '') + fmt(n, dec);
const fmtMinus = (n, dec = 0) => (n >= 0.5 * 10 ** -dec ? '−' : '') + fmt(n, dec);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function dmy(s, withYear = true) {
  const [y, m, d] = s.split('-');
  return withYear ? `${+d}.${+m}.${y}` : `${+d}.${+m}.`;
}
function parseNum(v) {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
function inputVal(n) {
  return n === undefined || n === null ? '' : String(n).replace('.', ',');
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}
function field({ id, label, unit = '', value, placeholder = '', hint = '', cls = '', mode = 'decimal' }) {
  return `<div class="field ${cls}">
    <label for="${id}">${label}</label>
    <div class="wrap"><input id="${id}" name="${id}" type="text" inputmode="${mode}" autocomplete="off"
      value="${esc(inputVal(value))}" placeholder="${esc(placeholder)}">${unit ? `<span class="unit">${unit}</span>` : ''}</div>
    ${hint !== null ? `<div class="hint" data-hint="${id}">${hint}</div>` : ''}
  </div>`;
}

// ---------- navigation ----------
const TITLES = { day: 'Deň', weeks: 'Týždne', stats: 'Štatistika', goal: 'Cieľ', settings: 'Nastavenia' };
function go(t) {
  tab = t;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $('#title').textContent = TITLES[t];
  render();
  window.scrollTo(0, 0);
}
$$('.tabbar button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));

function render() {
  const view = $('#view');
  ({ day: renderDay, weeks: renderWeeks, stats: renderStats, goal: renderGoal, settings: renderSettings })[tab](view);
}

// ---------- zbaliteľné karty: ťuk na nadpis karty ju zbalí/rozbalí, appka si to pamätá ----------
const FOLD_KEY = 'makra-collapsed';
let folded;
try {
  folded = new Set(JSON.parse(localStorage.getItem(FOLD_KEY)) || []);
} catch {
  folded = new Set();
}
function foldKey(card) {
  const h2 = card.querySelector(':scope > h2');
  return `${tab}:${card.id || (h2?.firstChild?.textContent || '').trim()}`;
}
function applyFold(view) {
  $$('.card', view).forEach((card) => {
    if (!card.querySelector(':scope > h2')) return; // karty bez nadpisu (bilancia dňa, kruh cieľa) ostávajú otvorené
    card.classList.add('foldable');
    card.classList.toggle('collapsed', folded.has(foldKey(card)));
  });
}
function setFold(card, on) {
  const k = foldKey(card);
  if (on) folded.add(k);
  else folded.delete(k);
  card.classList.toggle('collapsed', on);
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify([...folded]));
  } catch {}
}
document.addEventListener('click', (e) => {
  const h2 = e.target.closest('.card.foldable > h2');
  if (!h2) return;
  const card = h2.parentElement;
  // tlačidlo v nadpise (napr. Nahrať zo Zdravia, + Pridať) kartu len otvorí
  if (e.target.closest('button, a, input, select, label')) {
    if (card.classList.contains('collapsed')) setFold(card, false);
    return;
  }
  setFold(card, !card.classList.contains('collapsed'));
});

// ---------- DAY ----------
function renderDay(view) {
  const d = parseD(currentDate);
  const day = data.days[currentDate] || {};
  const isToday = currentDate === C.today();
  const prevWeight = C.weightAt(data, C.addDays(currentDate, -1));
  $('#title').textContent = isToday ? 'Dnes' : TITLES.day;

  view.innerHTML = `
    <div class="datenav">
      <button class="iconbtn" data-nav="-1" aria-label="Predošlý deň">‹</button>
      <div class="date">
        <strong>${DAY_NAMES[d.getDay()]}</strong><span>${dmy(currentDate)}</span>
        <input type="date" id="pick" value="${currentDate}" aria-label="Vybrať dátum">
      </div>
      <button class="iconbtn" data-nav="1" aria-label="Ďalší deň">›</button>
    </div>
    ${isToday ? '' : '<div style="text-align:center;margin-top:8px"><button class="chip-btn" id="gotoday">Späť na dnes</button></div>'}

    <section class="card" id="food">
      <h2>Kalórie a makrá <button class="btn small secondary" id="from-health">Nahrať zo Zdravia</button></h2>
      <div class="food-top keep">
        <div class="food-ring" id="food-ring"></div>
        <div class="bal" id="bal"></div>
      </div>
      <div id="health-box"></div>
      <div class="mrows">
        <div class="mrow">
          <label for="kcal"><i class="dot dot-kcal"></i>Kalórie</label>
          <div class="field"><div class="wrap"><input id="kcal" name="kcal" type="text" inputmode="numeric" autocomplete="off"
            value="${esc(inputVal(day.kcal))}"><span class="unit">kcal</span></div></div>
          <span class="mt num" id="mt-kcal"></span>
          <div class="bar"><i id="mb-kcal"></i></div>
          <div class="mhint" id="kcal-hint"></div>
        </div>
        ${C.MACROS.map((m) => `
        <div class="mrow">
          <label for="${m}"><i class="dot dot-${m}"></i>${MACRO_LABEL[m]}</label>
          <div class="field"><div class="wrap"><input id="${m}" name="${m}" type="text" inputmode="decimal" autocomplete="off"
            value="${esc(inputVal(day[m]))}"><span class="unit">g</span></div></div>
          <span class="mt num" id="mt-${m}"></span>
          <div class="bar"><i id="mb-${m}"></i></div>
        </div>`).join('')}
      </div>
      <div id="macro-advice" style="margin-top:14px"></div>
      <p class="muted" style="font-size:13px;margin:10px 0 0">Cieľ makier nastavíš v sekcii <b>Cieľ → Môj plán makier</b>.</p>
    </section>

    <section class="card">
      <h2>Pohyb</h2>
      <div class="fields">
        ${field({ id: 'gym', label: 'Posilka', unit: 'kcal', value: day.gym, mode: 'numeric' })}
        ${field({ id: 'sport', label: 'Šport (beh, futbal…)', unit: 'kcal', value: day.sport, mode: 'numeric' })}
        ${field({ id: 'steps', label: 'Kroky za deň', unit: 'krokov', value: day.steps, mode: 'numeric', hint: 'všetky, aj z behu' })}
        ${field({ id: 'sportSteps', label: 'z toho pri behu/športe', unit: 'krokov', value: day.sportSteps, mode: 'numeric', hint: 'odpočítajú sa · beh ≈ 160 krokov/min' })}
        ${field({ id: 'weight', label: 'Váha', unit: 'kg', value: day.weight, placeholder: fmt(prevWeight, 1), hint: 'prázdne = posledná zapísaná · z váhy sa rátajú kalórie z krokov', cls: 'full' })}
      </div>
      <div id="move-calc"></div>
    </section>

    <section class="card">
      <h2>Poznámka</h2>
      <div class="field"><textarea id="note" rows="2" placeholder="napr. zmena tréningu, choroba…">${esc(day.note)}</textarea></div>
    </section>
  `;

  $$('[data-nav]', view).forEach((b) => b.addEventListener('click', () => {
    currentDate = C.addDays(currentDate, Number(b.dataset.nav));
    renderDay(view);
  }));
  $('#gotoday', view)?.addEventListener('click', () => { currentDate = C.today(); renderDay(view); });
  $('#pick', view).addEventListener('change', (e) => { if (e.target.value) { currentDate = e.target.value; renderDay(view); } });

  for (const key of ['kcal', 'carbs', 'protein', 'fat', 'fiber', 'gym', 'sport', 'steps', 'sportSteps', 'weight']) {
    $('#' + key, view).addEventListener('input', (e) => setDayField(key, parseNum(e.target.value)));
  }
  $('#note', view).addEventListener('input', (e) => setDayField('note', e.target.value.trim() || undefined));
  $('#from-health', view).addEventListener('click', () => { healthPanelOpen = !healthPanelOpen; renderHealthBox(view); });
  renderHealthBox(view);
  updateDayComputed();
  applyFold(view);
}

// ---------- import z Apple Zdravia ----------
// Webová appka nemá prístup k Zdraviu. Preto: appka spustí skratku v iPhone s dátumom -> skratka prečíta
// Zdravie a skopíruje údaje do schránky -> po návrate do appky sa vložia (ťuknutie + "Vložiť").
const PENDING_KEY = 'makra-health-pending';
let healthPanelOpen = false;

function pendingHealth() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY));
    return p && Date.now() - p.at < 30 * 60e3 ? p.date : null; // platí 30 min
  } catch {
    return null;
  }
}
function setPendingHealth(date) {
  try {
    if (date) localStorage.setItem(PENDING_KEY, JSON.stringify({ date, at: Date.now() }));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
}

function runHealthShortcut(date) {
  setPendingHealth(date);
  const name = data.settings.shortcutName || 'Makrá zo Zdravia';
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${date}`;
}

async function pasteHealth(view) {
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    renderHealthBox(view, { paste: true });
    return;
  }
  applyHealth(text, view);
}

function applyHealth(text, view) {
  let p;
  try {
    p = parseHealthPayload(text);
  } catch (e) {
    renderHealthBox(view, { error: e.message, paste: true, raw: text });
    return;
  }
  const date = p.date || pendingHealth() || currentDate;
  const prev = data.days[date] ? { ...data.days[date] } : undefined;
  const day = { ...(data.days[date] || {}), ...p.values };
  // kalórie neprišli -> dopočítaj ich z makier ako Kalorické tabuľky; ručne zapísané kalórie neprepisuj
  let kcalEst = false;
  if (p.values.kcal !== undefined) delete day.kcalEst;
  else if (!day.kcal || day.kcalEst) {
    const est = Math.round(C.labelKcal(day));
    if (est > 0) Object.assign(day, { kcal: est, kcalEst: (kcalEst = true) });
  }
  data.days[date] = day;
  save(true);
  setPendingHealth(null);
  healthPanelOpen = false;
  lastImport = { date, prev, values: p.values, raw: JSON.stringify(p.raw, null, 1), kcalZero: p.kcalZero, kcalNoSamples: p.kcalNoSamples, kcalEst, zeros: p.zeros };
  currentDate = date;
  renderDay(view);
  toast(`Načítané zo Zdravia za ${dmy(date)}`);
}

// Po návrate zo Skratiek ukáž krok 2
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && tab === 'day' && pendingHealth()) renderHealthBox($('#view'));
});

function closeHealth(view) {
  healthPanelOpen = false;
  setPendingHealth(null);
  renderHealthBox(view);
}

// Čo presne poslala skratka – pomáha pri ladení skratky
function rawDetails(raw) {
  if (!raw) return '';
  const txt = String(raw).slice(0, 1500);
  return `<details style="margin-top:8px"><summary>▸ Čo presne poslala skratka</summary>
    <pre style="white-space:pre-wrap;word-break:break-all;font-size:12px;margin:6px 0 0">${esc(txt)}</pre></details>`;
}

function renderHealthBox(view, { error, paste, raw } = {}) {
  const box = $('#health-box', view);
  if (!box) return;
  if (error || paste) {
    box.innerHTML = `<div class="callout ${error ? 'bg-bad' : 'bg-none'}" style="margin:0 0 12px">
      ${error ? `<div style="margin-bottom:8px">${esc(error)}</div>${rawDetails(raw)}` : ''}
      <div class="field"><label for="health-paste" style="color:inherit">Podrž prst v poli a daj <b>Vložiť</b>:</label>
        <textarea id="health-paste" rows="2" placeholder='{"kcal": …}'></textarea></div>
      <div class="btn-row" style="margin-top:8px"><button class="btn small secondary" id="health-cancel">Zrušiť</button></div>
    </div>`;
    $('#health-paste', box).addEventListener('input', (e) => e.target.value.trim() && applyHealth(e.target.value, view));
    $('#health-cancel', box).addEventListener('click', () => closeHealth(view));
    return;
  }
  const pend = pendingHealth();
  if (healthPanelOpen || pend) {
    box.innerHTML = `<div class="callout bg-none" style="margin:0 0 12px">
      <div class="field"><label for="health-date">Za deň</label><input id="health-date" type="date" value="${pend || currentDate}"></div>
      <div class="btn-row" style="margin-top:10px;flex-direction:column">
        <button class="btn ${pend ? 'secondary' : ''}" id="health-run">1. Načítať zo Zdravia</button>
        <button class="btn ${pend ? '' : 'secondary'}" id="health-paste-btn">2. Vložiť údaje</button>
      </div>
      <div style="font-size:13px;margin-top:10px">${pend
        ? `Skratka načítava ${dmy(pend)}. Keď skončí, vráť sa sem a ťukni <b>2. Vložiť údaje</b> → <b>Vložiť</b>.`
        : 'Ťukni <b>1</b> → v iPhone sa spustí skratka → vráť sa sem → ťukni <b>2</b> → <b>Vložiť</b>.'}</div>
      <div style="text-align:right;margin-top:6px"><button class="chip-btn" id="health-close">Zavrieť</button></div>
    </div>`;
    $('#health-run', box).addEventListener('click', () => runHealthShortcut($('#health-date', box).value || currentDate));
    $('#health-paste-btn', box).addEventListener('click', () => pasteHealth(view));
    $('#health-close', box).addEventListener('click', () => closeHealth(view));
    return;
  }
  if (lastImport && lastImport.date === currentDate) {
    const v = lastImport.values;
    const dayNow = data.days[lastImport.date] || {};
    const parts = [
      v.kcal !== undefined && `${fmt(v.kcal)} kcal`,
      lastImport.kcalEst && `≈ ${fmt(dayNow.kcal)} kcal`,
      v.carbs !== undefined && `S ${fmt(v.carbs)}`,
      v.protein !== undefined && `B ${fmt(v.protein)}`,
      v.fat !== undefined && `T ${fmt(v.fat)}`,
      v.fiber !== undefined && `V ${fmt(v.fiber)} g`,
      v.steps !== undefined && `${fmt(v.steps)} krokov`,
      v.sportSteps !== undefined && `z toho šport ${fmt(v.sportSteps)}`,
      v.sport !== undefined && `šport ${fmt(v.sport)} kcal`,
      v.gym !== undefined && `posilka ${fmt(v.gym)} kcal`,
    ].filter(Boolean).join(' · ');
    const noKcal = v.kcal === undefined;
    const zeroMacros = (lastImport.zeros || []).filter((k) => C.MACROS.includes(k)).map((k) => MACRO_LABEL[k].toLowerCase());
    const notes = [];
    if (lastImport.kcalEst) {
      notes.push(`Kalórie zo Zdravia neprišli – dopočítal som ich z makier ako Kalorické tabuľky
        (4 · 4 · 9 · 2 kcal na gram): <b class="num">${fmt(dayNow.kcal)} kcal</b>. Môžu sa líšiť o pár kcal.`);
    } else if (noKcal) {
      notes.push(dayNow.kcal
        ? `Kalórie zo Zdravia neprišli – nechal som tvoje zapísané: <b class="num">${fmt(dayNow.kcal)} kcal</b>.`
        : 'Kalórie neprišli – pozri nižšie, čo poslala skratka.');
    }
    if (noKcal && lastImport.kcalNoSamples) {
      notes.push(`Skratka v Zdraví nenašla ani jeden záznam <b>Energia v potrave</b> – zrejme ich nemá povolené čítať:
        Zdravie → Výživa → Energia v potrave → Zdroje údajov a prístup → Skratky.`);
    }
    const warn = zeroMacros.length ? `Ako 0 prišlo: ${zeroMacros.join(', ')} – tie som neprepísal.` : '';
    box.innerHTML = `<div class="callout ${warn ? 'bg-ok' : 'bg-good'}" style="margin:0 0 12px">
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <span>Zo Zdravia: <b class="num">${parts || '—'}</b></span>
        <span style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn small secondary" id="health-undo">Vrátiť</button>
          <button class="btn small secondary" id="health-hide" aria-label="Skryť">✕</button></span></div>
      ${warn ? `<div style="margin-top:8px">${warn}</div>` : ''}
      <details style="margin-top:8px"><summary>▸ Podrobnosti</summary>
        ${notes.map((n) => `<div style="margin-top:6px;font-size:14px">${n}</div>`).join('')}
        ${rawDetails(lastImport.raw)}</details>
    </div>`;
    $('#health-hide', box).addEventListener('click', () => { lastImport = null; renderHealthBox(view); });
    $('#health-undo', box).addEventListener('click', () => {
      if (lastImport.prev) data.days[lastImport.date] = lastImport.prev;
      else delete data.days[lastImport.date];
      lastImport = null;
      save(true);
      renderDay(view);
    });
    return;
  }
  box.innerHTML = '';
}

function parseD(s) { return C.parseIso(s); }

function setDayField(key, value) {
  const day = { ...(data.days[currentDate] || {}) };
  if (value === undefined) delete day[key];
  else day[key] = value;
  if (key === 'kcal') delete day.kcalEst; // ručne zapísané kalórie už nie sú odhad
  if (Object.keys(day).length) data.days[currentDate] = day;
  else delete data.days[currentDate];
  save();
  updateDayComputed();
}

function updateDayComputed() {
  const c = C.computeDay(data, currentDate);
  const lvl = C.dayLevel(c.balance, c.eaten > 0);

  // bilancia dňa vedľa kruhu (predtým samostatná karta hore)
  $('#bal').innerHTML = `
    <div class="bal-num num lvl-${lvl}">${c.eaten > 0 ? fmtSigned(c.balance) : '—'} <small>kcal</small></div>
    <div class="bal-label">${c.eaten > 0 ? 'Bilancia dňa · ' + levelText(lvl, c.balance) : 'Zapíš jedlo a pohyb'}</div>
    <div class="bal-lines">
      <span>zjedené${c.kcalFromMacros ? ' (z makier)' : c.day.kcalEst ? ' (≈)' : ''}</span><b class="num">${fmt(c.eaten)}</b>
      <span>bazál</span><b class="num">${fmtMinus(c.bazal)}</b>
      ${c.tef ? `<span>trávenie</span><b class="num">${fmtMinus(c.tef)}</b>` : ''}
      <span>pohyb</span><b class="num">${fmtMinus(c.burned)}</b>
    </div>`;

  // kalórie: koľko som mal mať a koľko mám (ako riadky makier)
  const kOver = c.eaten > c.targetKcalTotal * 1.05;
  const kUnder = c.eaten < c.targetKcalTotal * 0.95;
  // nad cieľ, ale stále v deficite = žltá; prebytok = červená
  const kCls = kOver ? (c.balance < 0 ? 'ok' : 'bad') : kUnder ? 'ok' : 'good';
  $('#mt-kcal').innerHTML = `/ ${fmt(c.targetKcalTotal)} <span class="lvl-${kCls}">(${fmtSigned(c.eaten - c.targetKcalTotal)})</span>`;
  const kBar = $('#mb-kcal');
  kBar.className = kCls === 'bad' ? 'over' : kCls === 'ok' ? 'under' : '';
  kBar.style.width = (c.targetKcalTotal > 0 ? Math.min(100, (c.eaten / c.targetKcalTotal) * 100) : 0) + '%';
  $('#kcal-hint').innerHTML = `cieľ ${fmt(c.targetKcalBase)}${c.burned ? ` + výdaj ${fmt(c.burned)}` : ''}${c.targetTef >= 1 ? ` + trávenie ${fmt(c.targetTef)}` : ''}
    = ${fmt(c.targetKcalTotal)} kcal${c.macroKcal > 0 ? ` · z makier ${fmt(c.macroKcal)} kcal${c.day.kcal ? '' : ' (použije sa toto)'}` : ''}`;
  $('#kcal').placeholder = c.macroKcal > 0 ? fmt(c.macroKcal) : '';

  $('#move-calc').innerHTML = (c.sportSteps ? `
    <div class="calc-line"><span class="muted">Kroky bez športovania <small>(${fmt(c.steps)} − ${fmt(c.sportSteps)})</small></span><b class="num">${fmt(c.walkSteps)}</b></div>` : '') + `
    <div class="calc-line"><span class="muted">Kroky → kalórie <small>(${fmt(c.stepIndex, 4)} kcal/krok pri ${fmt(c.weight, 1)} kg)</small></span><b class="num">${fmt(c.stepKcal)} kcal</b></div>
    <div class="calc-line"><span class="muted">Výdaj pohybom spolu</span><b class="num">${fmt(c.burned)} kcal</b></div>`;

  // jedlo a makrá v jednej karte: kruh s kalóriami + riadok na každé makro (políčka sa neprekresľujú, len čísla)
  $('#food-ring').innerHTML = foodRing(c);
  for (const m of C.MACROS) {
    const eaten = c.eatenMacro[m];
    const target = c.targets[m];
    const pct = target > 0 ? Math.min(100, (eaten / target) * 100) : 0;
    // nad cieľ: sacharidy a tuky červené (bielkoviny a vláknina navyše nevadia); chýba viac ako 5 %: žlté
    const over = eaten > target * 1.05 && m !== 'protein' && m !== 'fiber';
    const under = eaten < target * 0.95;
    $('#mt-' + m).innerHTML = `/ ${fmt(target)} g <span class="${over ? 'lvl-bad' : under ? 'lvl-ok' : 'lvl-good'}">(${fmtSigned(c.diff[m])})</span>`;
    const bar = $('#mb-' + m);
    bar.className = over ? 'over' : under ? 'under' : '';
    bar.style.width = pct + '%';
  }
  const a = macroAdvice(c);
  $('#macro-advice').innerHTML = `<div class="callout bg-${a.level}" style="margin:0">
      ${a.lines.map((l, i) => `<div${i ? ' style="margin-top:6px"' : ''}>${l}</div>`).join('')}
      <div class="muted" style="font-size:13px;margin-top:6px">Sacharidy = ${fmt(c.baseTargets.carbs)} g + ${c.targetTef >= 1 ? '(výdaj pohybom + trávenie)' : 'výdaj pohybom'} / 4,1${c.extraKcal >= 1 ? ' − tuky a bielkoviny navyše / 4,1' : ''}</div>
    </div>`;
}

// Kruh: koľko z cieľa kalórií je zjedené, farebne rozdelené podľa makier; nad cieľ = červený vonkajší oblúk
function foodRing(c) {
  const R = 46;
  const L = 2 * Math.PI * R;
  const target = c.targetKcalTotal;
  const eaten = c.eaten;
  const fill = target > 0 ? Math.min(1, eaten / target) : 0;
  const parts = C.MACROS.map((m) => [m, c.eatenMacro[m] * C.KCAL_PER_G[m]]);
  const sum = parts.reduce((a, [, k]) => a + k, 0);
  let off = 0;
  let segs = '';
  if (fill > 0 && sum > 0) {
    for (const [m, k] of parts) {
      const len = (fill * L * k) / sum;
      if (len < 0.5) continue;
      segs += `<circle class="seg" r="${R}" cx="60" cy="60" style="stroke:var(--c-${m})"
        stroke-dasharray="${len} ${L - len}" stroke-dashoffset="${-off}"/>`;
      off += len;
    }
  } else if (fill > 0) {
    segs = `<circle class="seg" r="${R}" cx="60" cy="60" style="stroke:var(--accent)" stroke-dasharray="${fill * L} ${L}"/>`;
  }
  const over = eaten - target;
  const R2 = 56;
  const L2 = 2 * Math.PI * R2;
  const ovr = over > 0 && target > 0
    ? `<circle class="ovr" r="${R2}" cx="60" cy="60" stroke-dasharray="${Math.min(1, over / target) * L2} ${L2}"/>` : '';
  const leftCls = over > 50 ? (c.balance < 0 ? 'lvl-ok' : 'lvl-bad') : 'lvl-good';
  const leftTxt = eaten <= 0 ? 'nič zapísané' : over > 0 ? `+${fmt(over)} nad cieľ` : `zostáva ${fmt(-over)}`;
  return `<svg viewBox="0 0 120 120" role="img" aria-label="Zjedené ${fmt(eaten)} z ${fmt(target)} kcal">
    <g transform="rotate(-90 60 60)"><circle class="trk" r="${R}" cx="60" cy="60"/>${segs}${ovr}</g>
    <text class="rb num" x="60" y="54">${fmt(eaten)}</text>
    <text class="rs" x="60" y="69">z ${fmt(target)} kcal</text>
    <text class="rl ${leftCls}" x="60" y="82">${leftTxt}</text>
  </svg>`;
}

// Rozbor makier: koľko sacharidov ešte zostáva po odrátaní tukov/bielkovín navyše a čo chýba
function macroAdvice(c) {
  const lines = [];
  const kc = C.KCAL_PER_G.carbs;
  const left = c.carbsLeft;
  const leftAdj = left - c.extraKcal / kc;
  const extra = ['fat', 'protein'].filter((m) => c.diff[m] > 0.5)
    .map((m) => `${MACRO_LABEL[m].toLowerCase()} +${fmt(c.diff[m])} g`).join(', ');
  let level = 'good';

  if (left <= 0) {
    lines.push(`Sacharidy splnené${left < -1 ? ` (o <b class="num">${fmt(-left)} g</b> viac)` : ''}.`);
    if (left < -5) level = 'bad';
  } else if (c.extraKcal >= 1 && leftAdj <= 0) {
    lines.push(`Sacharidy už nedopĺňaj. Podľa cieľa zostáva ${fmt(left)} g, ale ${extra} nad cieľ
      (≈ <b class="num">${fmt(c.extraKcal)} kcal</b>, ako ${fmt(c.extraKcal / kc)} g sacharidov) to prevyšujú.`);
    level = 'bad';
  } else if (c.extraKcal >= 1) {
    lines.push(`Ešte môžeš doplniť <b class="num">${fmt(leftAdj)} g</b> sacharidov
      (z ${fmt(left)} g som odrátal ${extra} ≈ ${fmt(c.extraKcal)} kcal).`);
    level = 'ok';
  } else {
    lines.push(`Ešte môžeš doplniť <b class="num">${fmt(left)} g</b> sacharidov.`);
    level = 'ok';
  }

  const missing = ['protein', 'fiber'].filter((m) => c.eatenMacro[m] < c.targets[m] * 0.95)
    .map((m) => `${MACRO_LABEL[m].toLowerCase()} <b class="num">${fmt(-c.diff[m])} g</b>`);
  if (c.hasMacros && missing.length) {
    lines.push(`Chýba: ${missing.join(', ')}${leftAdj <= 0 ? ' – dopĺňaj ich bez ďalších tukov a sacharidov (napr. tvaroh, kuracie, zelenina).' : '.'}`);
    if (level === 'good') level = 'ok';
  }

  if (c.hasMacros && c.eaten > 0) {
    const d = c.eaten - c.targetKcalTotal;
    lines.push(`Spolu zjedené <b class="num">${fmt(c.eaten)}</b> z ${fmt(c.targetKcalTotal)} kcal
      <span class="${d > 50 ? 'lvl-bad' : ''}">(${fmtSigned(d)})</span>.`);
    // nad plánom neznamená prebytok: cieľ už obsahuje plánovaný deficit
    if (d > 50 && c.balance < 0) {
      lines.push(`Deň je stále v deficite <b class="num">${fmtSigned(c.balance)} kcal</b>, len menšom ako plánovaných
        ${fmtSigned(c.plannedBalance)} kcal (cieľ ${fmt(c.targetKcalBase)} − bazál ${fmt(c.targetKcalBase - c.plannedBalance)}).`);
    }
  }
  // červená len pri prebytku; nad plánom, ale v deficite = žltá
  if (level === 'bad' && c.eaten > 0 && c.balance < 0) level = 'ok';
  return { lines, level };
}

// Môj plán makier (sekcia Cieľ) – jediné miesto, kde sa nastavuje denný cieľ makier.
// Plán sa ukladá hneď; appka z neho každý deň ráta gramy z aktuálnej váhy a bazálu.
function renderCalc(card) {
  const s = data.settings;
  const t = C.today();
  const w = C.weightAt(data, t);
  const bazal = C.valueAt(s.bazal, t);
  const tefPct = C.valueAt(s.tef, t) || 0;
  const kc = C.KCAL_PER_G;
  const r2 = (n) => Math.round(n * 100) / 100;
  if (!s.plan) {
    // prvé otvorenie: plán z doterajších pevných gramov (ako v Exceli), aby sa nič nezmenilo
    const cur = s.targets;
    const base = C.MACROS.reduce((sum, m) => sum + cur[m] * kc[m], 0);
    s.plan = { deficit: Math.round(bazal - base), proteinPerKg: r2(cur.protein / w), fatPerKg: r2(cur.fat / w), fiber: cur.fiber };
    save(true);
  }
  const p = s.plan;
  // priemer krokov bez športu za posledných 14 dní so zápisom (len na odhad dňa s pohybom)
  const recent = Array.from({ length: 14 }, (_, i) => C.computeDay(data, C.addDays(t, -i - 1))).filter((d) => d.walkSteps > 0);
  const avgSteps = recent.length ? Math.round(recent.reduce((a, d) => a + d.walkSteps, 0) / recent.length / 500) * 500 : 6000;

  card.innerHTML = `
    <h2>Môj plán makier</h2>
    <p class="muted" style="margin-top:0;font-size:14px">Tu nastavuješ denný cieľ – ukladá sa hneď. Bielkoviny a tuky appka
      ráta z aktuálnej váhy, sacharidy sú zvyšok po bazáli a deficite. Pohyb a trávenie pripočíta každý deň sama.</p>
    <div class="calc-line"><span class="muted">Váha · bazál · trávenie</span>
      <b class="num">${fmt(w, 1)} kg · ${fmt(bazal)} kcal · ${fmt(tefPct, tefPct % 1 ? 1 : 0)} %</b></div>
    <p class="muted" style="font-size:12px;margin:2px 0 12px">Váhu zapisuješ v sekcii Deň, bazál a trávenie v Nastaveniach.</p>
    <div class="fields">
      ${field({ id: 'k-deficit', label: 'Deficit', unit: 'kcal/deň', value: p.deficit, mode: 'numeric', hint: '' })}
      ${field({ id: 'k-fiber', label: 'Vláknina', unit: 'g', value: p.fiber, mode: 'numeric', hint: null })}
      ${field({ id: 'k-protein', label: 'Bielkoviny', unit: 'g/kg', value: p.proteinPerKg, hint: '' })}
      ${field({ id: 'k-fat', label: 'Tuky', unit: 'g/kg', value: p.fatPerKg, hint: '' })}
    </div>
    <div id="k-rest" style="margin-top:12px"></div>
    <details style="margin-top:12px">
      <summary>▸ Deň s pohybom (odhad dopredu)</summary>
      <div class="fields">
        ${field({ id: 'k-steps', label: 'Kroky bez športu', unit: 'krokov', value: avgSteps, mode: 'numeric', hint: null })}
        ${field({ id: 'k-gym', label: 'Posilka', unit: 'kcal', value: 0, mode: 'numeric', hint: null })}
        ${field({ id: 'k-sport', label: 'Šport', unit: 'kcal', value: 0, mode: 'numeric', hint: null })}
      </div>
      <div id="k-move" style="margin-top:12px"></div>
    </details>`;

  const num = (id, def = 0) => parseNum($('#' + id, card).value) ?? def;
  const tef = tefPct / 100;

  // koľko čoho zjesť pri danom pohybe (kcal) – rovnaké vzorce ako sekcia Deň
  const table = (move) => {
    const total = (bazal + move - p.deficit) / (1 - tef); // jedlo − trávenie = bazál + pohyb − deficit
    const P = p.proteinPerKg * w;
    const F = p.fatPerKg * w;
    const V = p.fiber;
    const S = (total - P * kc.protein - F * kc.fat - V * kc.fiber) / kc.carbs;
    const row = (label, g, kcal) => `<span>${label}</span><span class="num">${fmt(g)} g · ${fmt(kcal)} kcal
      ${total > 0 ? `<small class="muted">(${fmt((kcal / total) * 100)} %)</small>` : ''}</span>`;
    const warn = [];
    if (S < 50) warn.push(`Na sacharidy zostáva len ${fmt(Math.max(0, S))} g – zníž deficit alebo tuky.`);
    if (p.deficit > 400) warn.push('Deficit nad 400 kcal je podľa tvojich pravidiel už veľa.');
    if (p.deficit < 0) warn.push('Záporný deficit = prebytok (priberanie).');
    return `<div class="callout bg-${warn.length ? 'ok' : 'good'}" style="margin:0">
      <div>Zjedz <b class="num" style="font-size:20px">${fmt(total)} kcal</b></div>
      <div class="kv" style="margin-top:8px">
        ${row('Sacharidy', Math.max(0, S), Math.max(0, S) * kc.carbs)}
        ${row('Bielkoviny', P, P * kc.protein)}
        ${row('Tuky', F, F * kc.fat)}
        ${row('Vláknina', V, V * kc.fiber)}
      </div>
      <div class="muted" style="font-size:13px;margin-top:8px">Výdaj: bazál ${fmt(bazal)}${move ? ` + pohyb ${fmt(move)}` : ''}
        + trávenie ${fmt(total * tef)} = ${fmt(bazal + move + total * tef)} kcal · bilancia ${fmtSigned(-p.deficit)} kcal</div>
      ${warn.map((x) => `<div style="margin-top:6px">${x}</div>`).join('')}
    </div>`;
  };

  const update = () => {
    $('[data-hint="k-protein"]', card).textContent = `= ${fmt(p.proteinPerKg * w)} g · výskum: 1,6–2,2 g/kg (Morton 2018)`;
    $('[data-hint="k-fat"]', card).textContent = `= ${fmt(p.fatPerKg * w)} g · EFSA: 20–35 % energie`;
    $('[data-hint="k-deficit"]', card).textContent = `≈ ${fmt((p.deficit * 7) / C.KCAL_PER_KG_FAT, 2)} kg tuku za týždeň`;
    $('#k-rest', card).innerHTML = `<div class="muted" style="font-size:13px;margin-bottom:6px">Deň bez pohybu</div>${table(0)}`;
    const move = num('k-steps') * C.valueAt(s.stepCoef, t) * w + num('k-gym') + num('k-sport');
    $('#k-move', card).innerHTML = table(move);
  };
  // plán: ukladá sa hneď
  const planField = (id, key) => $('#' + id, card).addEventListener('input', (e) => {
    const n = parseNum(e.target.value);
    if (n === undefined) return;
    p[key] = n;
    save();
    update();
  });
  planField('k-deficit', 'deficit');
  planField('k-protein', 'proteinPerKg');
  planField('k-fat', 'fatPerKg');
  planField('k-fiber', 'fiber');
  ['k-steps', 'k-gym', 'k-sport'].forEach((id) => $('#' + id, card).addEventListener('input', update));
  update();
}

// ---------- WEEKS ----------
function renderWeeks(view) {
  const weeks = C.computeWeeks(data).filter((w) => w.hasData || w.monday === C.mondayOf(C.today())).reverse();
  if (!weeks.length) {
    view.innerHTML = '<div class="empty">Zatiaľ žiadne záznamy.</div>';
    return;
  }
  const legend = `<div class="legend" style="margin-top:4px">
    <span class="bg-great">deň &lt; −400 priveľa</span><span class="bg-good">−400 až −100 výborne</span>
    <span class="bg-ok">−100 až 0 mierne</span><span class="bg-bad">&gt; 0 prebytok</span></div>`;
  view.innerHTML = legend + weeks.map((w) => {
    const lvl = C.weekLevel(w.result, w.hasData);
    const chips = w.days.map((d) => {
      const dl = C.dayLevel(d.balance, d.eaten > 0);
      const wd = C.parseIso(d.date).getDay();
      return `<button class="daychip bg-${dl}" data-date="${d.date}">
        <small>${DAY_SHORT[wd]} ${dmy(d.date, false)}</small><b>${d.eaten > 0 ? fmtSigned(d.balance) : '·'}</b></button>`;
    }).join('');
    return `<section class="card">
      <div class="week-head"><span class="range">${dmy(w.monday, false)} – ${dmy(w.sunday)}</span>
        <span class="res num lvl-${lvl}">${fmtSigned(w.result)}</span></div>
      <div class="daychips">${chips}</div>
      <details><summary>▸ Detail týždňa</summary>
        <div class="kv">
          <span>Zjedené spolu</span><span>${fmt(w.eaten)} kcal</span>
          <span>Bazál (${w.days.filter((d) => d.bazal).length} dní)</span><span>${fmtMinus(w.bazal)} kcal</span>
          ${w.tef ? `<span>Trávenie potravy</span><span>${fmtMinus(w.tef)} kcal</span>` : ''}
          <span>Kalórie mínus bazál${w.tef ? ' a trávenie' : ''}</span><span>${fmtSigned(w.eaten - w.bazal - w.tef)} kcal</span>
          <span>Posilka</span><span>${fmtMinus(w.gym)} kcal</span>
          <span>Športovanie</span><span>${fmtMinus(w.sport)} kcal</span>
          <span>Kroky (${fmt(w.steps)})</span><span>${fmtMinus(w.stepKcal)} kcal</span>
          <span>Pohyb spolu</span><span>${fmtMinus(w.burned)} kcal</span>
          <span><b>Výsledok za 7 dní</b></span><span><b class="lvl-${lvl}">${fmtSigned(w.result, 2)} kcal</b></span>
          <span>≈ tuku</span><span>${fmtSigned(w.result / C.KCAL_PER_KG_FAT, 2)} kg</span>
        </div>
      </details>
    </section>`;
  }).join('');
  $$('.daychip', view).forEach((b) => b.addEventListener('click', () => { currentDate = b.dataset.date; go('day'); }));
}

// ---------- GOAL ----------
function renderGoal(view) {
  const g = C.computeGoal(data);
  const s = data.settings;
  const R = 52;
  const circ = 2 * Math.PI * R;
  view.innerHTML = `
    <section class="card">
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 120 120">
          <circle class="track" cx="60" cy="60" r="${R}"/>
          <circle class="val" cx="60" cy="60" r="${R}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - g.progress)}"/>
          <text x="60" y="60">${fmt(g.progress * 100)} %</text>
        </svg>
        <div>
          <div class="muted" style="font-size:14px">Zostáva spáliť</div>
          <div style="font-size:30px;font-weight:700;letter-spacing:-0.02em" class="num">${fmt(g.remaining)} kcal</div>
          <div class="muted num">≈ ${fmt(g.remainingKg, 1)} kg tuku z ${fmt(s.goalFatKg)} kg</div>
        </div>
      </div>
      <div class="stats" style="margin-top:16px">
        <div class="stat"><span>Spálené doteraz</span><b>${fmt(g.burnedSoFar)} kcal</b></div>
        <div class="stat"><span>≈ tuku</span><b>${fmt(g.burnedKg, 2)} kg</b></div>
        <div class="stat"><span>Priemer/deň (28 dní)</span><b class="lvl-${C.dayLevel(g.avgDaily)}">${fmtSigned(g.avgDaily)} kcal</b></div>
        <div class="stat"><span>Odhad cieľa</span><b>${g.eta ? dmy(g.eta) : '—'}</b></div>
        <div class="stat"><span>Počiatočná váha</span><b>${fmt(s.startWeight, 1)} kg</b></div>
        <div class="stat"><span>Aktuálna váha</span><b>${fmt(g.currentWeight, 1)} kg <small class="${g.currentWeight <= s.startWeight ? 'lvl-good' : 'lvl-bad'}">(${fmtSigned(g.currentWeight - s.startWeight, 1)})</small></b></div>
      </div>
    </section>

    <section class="card" id="calc-card"></section>`;

  renderCalc($('#calc-card', view));
  applyFold(view);
}

// ---------- ŠTATISTIKA ----------
function renderStats(view) {
  const s = data.settings;
  const g = C.computeGoal(data);
  const weights = Object.entries(data.days).filter(([, d]) => d.weight).sort(([a], [b]) => a.localeCompare(b));
  const weightSeries = [{ date: s.startDate, y: s.startWeight }, ...weights.map(([date, d]) => ({ date, y: d.weight }))]
    .filter((p, i, arr) => i === 0 || p.y !== arr[i - 1].y || i === arr.length - 1);
  const meas = [...data.measurements].sort((a, b) => a.date.localeCompare(b.date));
  const fatSeries = meas.filter((m) => m.fatKg).map((m) => ({ date: m.date, y: m.fatKg }));
  const muscleSeries = meas.filter((m) => m.muscleKg).map((m) => ({ date: m.date, y: m.muscleKg }));

  // prehľad: posledné meranie oproti prvému (tuk aj v % z váhy v deň merania)
  const stat = (label, series, unit, goodDown) => {
    if (!series.length) return '';
    const a = series[0];
    const b = series[series.length - 1];
    const d = b.y - a.y;
    const good = goodDown ? d <= 0 : d >= 0;
    return `<div class="stat"><span>${label}</span><b>${fmt(b.y, 1)} ${unit}
      ${series.length > 1 ? `<small class="${good ? 'lvl-good' : 'lvl-bad'}">(${fmtSigned(d, 1)})</small>` : ''}</b></div>`;
  };
  const lastFat = meas.filter((m) => m.fatKg).slice(-1)[0];
  const fatPct = lastFat ? (lastFat.fatKg / C.weightAt(data, lastFat.date)) * 100 : null;

  view.innerHTML = `
    <section class="card">
      <h2>Prehľad tela <small>${meas.length ? `merania ${dmy(meas[0].date)} – ${dmy(meas[meas.length - 1].date)}` : ''}</small></h2>
      <div class="stats">
        ${stat('Váha', weightSeries, 'kg', true)}
        ${stat('Tuk', fatSeries, 'kg', true)}
        ${fatPct ? `<div class="stat"><span>Tuk z váhy</span><b>${fmt(fatPct, 1)} %</b></div>` : ''}
        ${stat('Svaly', muscleSeries, 'kg', false)}
      </div>
      ${meas.length ? '' : '<p class="muted" style="font-size:14px;margin-bottom:0">Pridaj meranie z InBody dole v karte Merania.</p>'}
    </section>

    <section class="card">
      <h2>Váha</h2>
      <div id="chart-weight"></div>
    </section>

    <section class="card">
      <h2>Tuk <small>InBody</small></h2>
      <div id="chart-fat"></div>
    </section>

    <section class="card">
      <h2>Svaly <small>InBody</small></h2>
      <div id="chart-muscle"></div>
    </section>

    <section class="card">
      <h2>Zostávajúce kalórie do cieľa</h2>
      <div id="chart-remaining"></div>
    </section>

    <section class="card">
      <h2>Merania (InBody) <small><button class="btn small secondary" id="add-meas">+ Pridať</button></small></h2>
      <form id="meas-form" hidden>
        <div class="fields">
          <div class="field full"><label for="m-date">Dátum</label><input id="m-date" type="date" value="${C.today()}"></div>
          ${field({ id: 'm-bazal', label: 'Bazál', unit: 'kcal', mode: 'numeric', hint: null })}
          ${field({ id: 'm-fat', label: 'Tuk', unit: 'kg', hint: null })}
          ${field({ id: 'm-muscle', label: 'Svaly', unit: 'kg', hint: null })}
          <div class="field"><label for="m-setbazal">Použiť bazál vo výpočte</label>
            <select id="m-setbazal"><option value="1">áno, od tohto dátumu</option><option value="0">nie</option></select></div>
          <div class="field full"><label for="m-note">Poznámka</label><textarea id="m-note" rows="2"></textarea></div>
        </div>
        <div class="btn-row" style="margin-top:12px"><button class="btn" type="submit">Uložiť meranie</button>
          <button class="btn secondary" type="button" id="meas-cancel">Zrušiť</button></div>
      </form>
      <ul class="list" id="meas-list"></ul>
    </section>`;

  lineChart($('#chart-weight', view), weightSeries, { unit: 'kg', dec: 1 });
  lineChart($('#chart-fat', view), fatSeries, { unit: 'kg', dec: 1 });
  lineChart($('#chart-muscle', view), muscleSeries, { unit: 'kg', dec: 1 });
  lineChart($('#chart-remaining', view), g.series.map((p) => ({ date: p.date, y: p.remaining })), { unit: 'kcal', dec: 0, area: true });
  renderMeasurements();
  applyFold(view);

  const form = $('#meas-form', view);
  $('#add-meas', view).addEventListener('click', () => { form.hidden = false; $('#m-bazal').focus(); });
  $('#meas-cancel', view).addEventListener('click', () => { form.hidden = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const m = {
      date: $('#m-date').value || C.today(),
      bazal: parseNum($('#m-bazal').value),
      fatKg: parseNum($('#m-fat').value),
      muscleKg: parseNum($('#m-muscle').value),
      note: $('#m-note').value.trim() || undefined,
    };
    data.measurements.push(JSON.parse(JSON.stringify(m)));
    data.measurements.sort((a, b) => a.date.localeCompare(b.date));
    if (m.bazal && $('#m-setbazal').value === '1') {
      data.settings.bazal = data.settings.bazal.filter((h) => h.from !== m.date);
      data.settings.bazal.push({ from: m.date, value: m.bazal });
      data.settings.bazal.sort((a, b) => a.from.localeCompare(b.from));
    }
    save(true);
    toast('Meranie uložené');
    renderStats(view);
  });
}

function renderMeasurements() {
  const list = $('#meas-list');
  if (!data.measurements.length) {
    list.innerHTML = '<li class="muted">Žiadne merania.</li>';
    return;
  }
  list.innerHTML = [...data.measurements].reverse().map((m, i) => `
    <li><div><b>${dmy(m.date)}</b><br><span class="muted">
      ${m.bazal ? `bazál ${fmt(m.bazal)} kcal · ` : ''}${m.fatKg ? `tuk ${fmt(m.fatKg, 1)} kg · ` : ''}${m.muscleKg ? `svaly ${fmt(m.muscleKg, 1)} kg` : ''}
      ${m.note ? `<br>${esc(m.note)}` : ''}</span></div>
      <button class="btn small danger" data-del="${data.measurements.length - 1 - i}" aria-label="Zmazať">✕</button></li>`).join('');
  $$('[data-del]', list).forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Zmazať toto meranie?')) return;
    data.measurements.splice(Number(b.dataset.del), 1);
    save(true);
    render(); // prekresli aj grafy
  }));
}

// Jednoduchý SVG čiarový graf s ťahaním prstom
function lineChart(el, points, { unit = '', dec = 0, area = false } = {}) {
  if (points.length < 2) {
    el.innerHTML = '<div class="empty">Málo dát na graf.</div>';
    return;
  }
  const W = 360, H = 200, pl = 40, pr = 8, pt = 10, pb = 22;
  const t0 = C.parseIso(points[0].date).getTime();
  const t1 = C.parseIso(points[points.length - 1].date).getTime();
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const x = (d) => pl + ((C.parseIso(d).getTime() - t0) / (t1 - t0 || 1)) * (W - pl - pr);
  const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const step = niceStep((hi - lo) / 4);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const months = [];
  const dd = C.parseIso(points[0].date);
  dd.setDate(1);
  for (dd.setMonth(dd.getMonth() + 1); dd.getTime() <= t1; dd.setMonth(dd.getMonth() + 1)) months.push(C.iso(dd));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const short = (v) => (Math.abs(v) >= 10000 ? fmt(v / 1000) + 'k' : fmt(v, step < 1 ? 1 : 0));
  const last = points[points.length - 1];

  el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Graf">
    ${ticks.map((v) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis" x="${pl - 5}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('')}
    ${months.map((m) => `<text class="axis" x="${x(m)}" y="${H - 6}" text-anchor="middle">${dmy(m, false)}</text>`).join('')}
    ${area ? `<path class="area" d="${path}L${x(last.date)},${H - pb}L${x(points[0].date)},${H - pb}Z"/>` : ''}
    <path class="line" d="${path}"/>
    <circle class="dot" cx="${x(last.date)}" cy="${y(last.y)}" r="4"/>
    <line class="cursor" y1="${pt}" y2="${H - pb}" x1="-10" x2="-10"/>
    <circle class="dot cur" r="5" cx="-10" cy="-10"/>
  </svg><div class="chart-tip">${dmy(last.date)}: <b>${fmt(last.y, dec)} ${unit}</b></div>`;

  const svg = $('svg', el), tip = $('.chart-tip', el), cur = $('.cursor', el), dot = $('.cur', el);
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px)) best = p;
    cur.setAttribute('x1', x(best.date));
    cur.setAttribute('x2', x(best.date));
    dot.setAttribute('cx', x(best.date));
    dot.setAttribute('cy', y(best.y));
    tip.innerHTML = `${dmy(best.date)}: <b>${fmt(best.y, dec)} ${unit}</b>`;
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
}
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// ---------- SETTINGS ----------
function renderSettings(view) {
  const s = data.settings;
  const lastBackup = localStorage.getItem(BACKUP_KEY);
  const daysSince = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 864e5) : null;
  const history = (key, label, unit, mode) => `
    <div class="field full"><label>${label}</label></div>
    ${s[key].map((h, i) => `
      <div class="fields" style="margin-bottom:8px" data-hist="${key}" data-i="${i}">
        <div class="field"><input type="date" value="${h.from}" data-k="from" aria-label="Platí od"></div>
        <div class="field"><div class="wrap"><input type="text" inputmode="${mode}" value="${inputVal(h.value)}" data-k="value" aria-label="${label}"><span class="unit">${unit}</span></div></div>
      </div>`).join('')}
    <div id="prev-${key}" style="margin-bottom:8px"></div>
    <div class="btn-row" style="margin-bottom:12px">
      <button class="btn small secondary" data-add-hist="${key}">+ zmena od dátumu</button>
      ${s[key].length > 1 ? `<button class="btn small danger" data-rm-hist="${key}">odobrať poslednú</button>` : ''}
    </div>`;

  view.innerHTML = `
    <section class="card">
      <h2>Cieľ</h2>
      <div class="fields">
        <div class="field full"><label for="s-start">Začiatok sledovania</label><input id="s-start" type="date" value="${s.startDate}"></div>
        ${field({ id: 's-weight', label: 'Počiatočná váha', unit: 'kg', value: s.startWeight, hint: null })}
        ${field({ id: 's-curweight', label: 'Aktuálna váha', unit: 'kg', value: data.days[C.today()]?.weight, placeholder: fmt(C.weightAt(data, C.today()), 1), hint: '' })}
        ${field({ id: 's-goal', label: 'Cieľ schudnúť tuku', unit: 'kg', value: s.goalFatKg, hint: `= ${fmt(s.goalFatKg * C.KCAL_PER_KG_FAT)} kcal` })}
      </div>
    </section>

    <section class="card">
      <h2>Výpočty <small>platí od dátumu</small></h2>
      ${history('bazal', 'Bazálny metabolizmus', 'kcal', 'numeric')}
      ${history('stepCoef', 'Koeficient krokov (× váha = kcal/krok)', '', 'decimal')}
      ${history('tef', 'Trávenie potravy (TEF)', '% z jedla', 'decimal')}
      <p class="muted" style="font-size:13px;margin:0">Trávením telo spáli časť zjedenej energie – bielkoviny ~25 %,
        sacharidy ~8 %, tuky ~3 %, spolu bežne okolo 10 %. V Exceli nebolo, preto je predvolene 0 %.
        Zapni ho cez <b>+ zmena od dátumu</b>, staré dni ostanú rovnaké.</p>
    </section>

    <section class="card">
      <h2>Apple Zdravie</h2>
      <p class="muted" style="margin:0 0 12px;font-size:14px">V sekcii Deň ťukni <b>Nahrať zo Zdravia</b>: appka spustí
        skratku, tá prečíta kalórie a makrá z Kalorických tabuliek a po návrate ich vložíš. V Zdraví musí byť jednotka
        energie <b>kcal</b>. <a href="https://github.com/matusmelek-maker/makra_app/blob/main/NAVOD-SKRATKA.md" target="_blank" rel="noopener">Návod na skratku</a></p>
      <div class="field"><label for="s-shortcut">Názov skratky (presne ako v appke Skratky)</label>
        <input id="s-shortcut" type="text" value="${esc(s.shortcutName)}" style="padding-right:12px"></div>
    </section>

    <section class="card" id="cloud-card"></section>

    <section class="card">
      <h2>Záloha dát</h2>
      <p class="muted" style="margin-top:0;font-size:14px">Dáta sú uložené iba v tomto telefóne/prehliadači.
        Pravidelne si stiahni zálohu (JSON) – napr. do iCloud/Google Drive.</p>
      <p style="font-size:14px" class="${daysSince === null || daysSince > 7 ? 'lvl-bad' : 'lvl-good'}">
        Posledná záloha: ${lastBackup ? `${dmy(lastBackup.slice(0, 10))} (pred ${daysSince} dňami)` : 'ešte nikdy'}</p>
      <div class="btn-row">
        <button class="btn" id="export">Stiahnuť zálohu</button>
        <button class="btn secondary" id="import">Nahrať zálohu</button>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
      </div>
      ${localStorage.getItem(UNDO_IMPORT_KEY) ? '<div class="btn-row" style="margin-top:8px"><button class="btn small secondary" id="undo-import">Vrátiť posledné nahratie zálohy</button></div>' : ''}
      <p class="muted" style="font-size:13px;margin-bottom:0">Nahratie zálohu s dátami v telefóne zlúči – nič sa nevymaže.</p>
      <p class="muted" style="font-size:13px">Záznamov: ${Object.keys(data.days).length} dní, ${data.measurements.length} meraní.</p>
    </section>

    <section class="card">
      <h2>Nebezpečná zóna</h2>
      <button class="btn danger" id="wipe">Vymazať všetky dáta v tomto zariadení</button>
    </section>
    <p class="muted" style="text-align:center;font-size:12px">Makrá · offline aplikácia · <span id="app-version"></span></p>`;
  caches?.keys?.().then((keys) => {
    const v = keys.map((k) => k.match(/^makra-v(\d+)$/)?.[1]).filter(Boolean).sort((a, b) => b - a)[0];
    const el = $('#app-version');
    if (el) el.textContent = v ? `verzia ${v}` : '';
  }).catch(() => {});

  const bind = (id, fn) => $('#' + id, view).addEventListener('input', (e) => { fn(e.target.value); save(); });
  bind('s-start', (v) => v && (s.startDate = v));
  bind('s-shortcut', (v) => { s.shortcutName = v.trim() || 'Makrá zo Zdravia'; });
  bind('s-weight', (v) => { const n = parseNum(v); if (n) s.startWeight = n; updPrev(); });
  // aktuálna váha = váha zapísaná k dnešnému dňu (rovnako ako pole Váha v sekcii Deň)
  bind('s-curweight', (v) => {
    const t = C.today();
    const n = parseNum(v);
    const day = { ...(data.days[t] || {}) };
    if (n) day.weight = n;
    else delete day.weight;
    if (Object.keys(day).length) data.days[t] = day;
    else delete data.days[t];
    updPrev();
  });
  // čo sa z nastavení práve ráta – aby bolo vidno, že zmena funguje
  function updPrev() {
    const t = C.today();
    const w = C.weightAt(data, t);
    const k = C.valueAt(s.stepCoef, t);
    let wDate = null;
    for (const [d, day] of Object.entries(data.days)) if (day.weight && d <= t && (!wDate || d > wDate)) wDate = d;
    $('[data-hint="s-curweight"]', view).textContent = wDate
      ? `posledná zapísaná ${dmy(wDate)} · zmena sa zapíše k dnešku`
      : 'zatiaľ nezapísaná – použije sa počiatočná · zmena sa zapíše k dnešku';
    $('#prev-bazal', view).innerHTML = `<div class="calc-line"><span class="muted">Dnes platí</span>
      <b class="num">${fmt(C.valueAt(s.bazal, t))} kcal/deň</b></div>`;
    const tp = C.valueAt(s.tef, t) || 0;
    $('#prev-tef', view).innerHTML = `<div class="calc-line"><span class="muted">Dnes platí ${fmt(tp, tp % 1 ? 1 : 0)} %</span>
      <b class="num">z 2 000 kcal jedla = ${fmt(20 * tp)} kcal</b></div>`;
    $('#prev-stepCoef', view).innerHTML = `<div class="calc-line"><span class="muted">Dnes: ${fmt(k, 6)} × ${fmt(w, 1)} kg</span>
      <b class="num">${fmt(k * w, 4)} kcal/krok</b></div>
      <div class="calc-line"><span class="muted">10 000 krokov</span><b class="num">${fmt(k * w * 1e4)} kcal</b></div>`;
  }
  updPrev();
  bind('s-goal', (v) => {
    const n = parseNum(v);
    if (n) s.goalFatKg = n;
    $('[data-hint="s-goal"]').textContent = `= ${fmt(s.goalFatKg * C.KCAL_PER_KG_FAT)} kcal`;
  });

  $$('[data-hist]', view).forEach((row) => {
    const arr = s[row.dataset.hist];
    const h = arr[Number(row.dataset.i)];
    $$('input', row).forEach((inp) => inp.addEventListener('input', () => {
      if (inp.dataset.k === 'from') { if (inp.value) h.from = inp.value; }
      else { const n = parseNum(inp.value); if (n || (n === 0 && row.dataset.hist === 'tef')) h.value = n; }
      arr.sort((a, b) => a.from.localeCompare(b.from));
      save();
      updPrev();
    }));
  });
  $$('[data-add-hist]', view).forEach((b) => b.addEventListener('click', () => {
    const arr = s[b.dataset.addHist];
    arr.push({ from: C.today(), value: arr[arr.length - 1].value });
    save(true);
    renderSettings(view);
  }));
  $$('[data-rm-hist]', view).forEach((b) => b.addEventListener('click', () => {
    s[b.dataset.rmHist].pop();
    save(true);
    renderSettings(view);
  }));

  $('#export', view).addEventListener('click', exportData);
  $('#import', view).addEventListener('click', () => $('#import-file').click());
  $('#import-file', view).addEventListener('change', importData);
  $('#undo-import', view)?.addEventListener('click', undoImport);
  renderCloud($('#cloud-card', view));
  applyFold(view);
  $('#wipe', view).addEventListener('click', () => {
    if (!confirm('Naozaj vymazať všetky dáta? Najprv si stiahni zálohu!')) return;
    if (!confirm('Posledné potvrdenie – vymazať?')) return;
    data = C.defaultData();
    save(true);
    toast('Dáta vymazané');
    renderSettings(view);
  });
}

async function exportData() {
  flush();
  const json = JSON.stringify({ ...data, exported: new Date().toISOString() }, null, 1);
  const name = `makra-zaloha-${C.today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: name });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
    toast('Záloha pripravená');
    if (tab === 'settings') render();
  } catch (e) {
    if (e.name !== 'AbortError') toast('Export zlyhal');
  }
}

const daysWord = (n) => (n === 1 ? 'deň' : n >= 2 && n <= 4 ? 'dni' : 'dní');

// Zlúčenie zálohy: to, čo je v telefóne, má prednosť; zo zálohy sa doplní len to, čo chýba
function mergeBackup(cur, bak) {
  const days = { ...cur.days };
  for (const [k, day] of Object.entries(bak.days)) days[k] = { ...day, ...(cur.days[k] || {}) };
  const measDates = new Set(cur.measurements.map((m) => m.date));
  const measurements = [...cur.measurements, ...bak.measurements.filter((m) => !measDates.has(m.date))]
    .sort((a, b) => a.date.localeCompare(b.date));
  return { ...cur, days, measurements };
}

function undoImport() {
  try {
    const u = JSON.parse(localStorage.getItem(UNDO_IMPORT_KEY));
    if (!u || !confirm(`Vrátiť dáta do stavu pred nahratím zálohy (${dmy(u.at.slice(0, 10))})?`)) return;
    data = migrate(u.data);
    save(true);
    localStorage.removeItem(UNDO_IMPORT_KEY);
    toast('Vrátené pred nahratie zálohy');
    render();
  } catch {
    toast('Nie je čo vrátiť');
  }
}

async function importData(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  let d;
  try {
    d = JSON.parse(await f.text());
    if (d.app !== 'makra' || !d.days || !d.settings) throw new Error('format');
  } catch (err) {
    toast('Neplatný súbor zálohy');
    return;
  }
  applyBackup(d);
}

// Nahratie zálohy (zo súboru alebo z GitHubu): do prázdneho zariadenia celá, inak zlúčenie
function applyBackup(d) {
  const n = Object.keys(d.days).length;
  const empty = !Object.keys(data.days).length && !data.measurements.length;
  const added = Object.keys(d.days).filter((k) => !data.days[k]).length;
  const both = n - added;
  const msg = empty
    ? `Nahrať zálohu (${n} dní, ${(d.measurements || []).length} meraní)?`
    : `Zlúčiť zálohu s dátami v telefóne?\n\n• pridá sa ${added} ${daysWord(added)}, ktoré v telefóne chýbajú\n` +
      (both ? `• ${both} ${daysWord(both)} už máš – pri nich sa doplnia len prázdne polia\n` : '') +
      '• nič sa nevymaže ani neprepíše';
  if (!confirm(msg)) return;
  const bak = migrate(d);
  const takeSettings = !empty && JSON.stringify(bak.settings) !== JSON.stringify(data.settings) &&
    confirm(`Prevziať aj nastavenia zo zálohy?\n\nV zálohe: bazál ${fmt(C.valueAt(bak.settings.bazal, C.today()))} kcal, ` +
      `počiatočná váha ${fmt(bak.settings.startWeight, 1)} kg, cieľ ${fmt(bak.settings.goalFatKg, 1)} kg, od ${dmy(bak.settings.startDate)}.\n` +
      `Teraz: bazál ${fmt(C.valueAt(data.settings.bazal, C.today()))} kcal, váha ${fmt(data.settings.startWeight, 1)} kg, ` +
      `cieľ ${fmt(data.settings.goalFatKg, 1)} kg, od ${dmy(data.settings.startDate)}.\n\nOK = zo zálohy, Zrušiť = nechať moje`);
  flush();
  try { localStorage.setItem(UNDO_IMPORT_KEY, JSON.stringify({ at: new Date().toISOString(), data })); } catch {}
  data = empty ? bak : mergeBackup(data, bak);
  if (takeSettings) data.settings = { ...bak.settings, shortcutName: data.settings.shortcutName };
  save(true);
  toast(empty ? `Nahraté: ${n} ${daysWord(n)}` : `Zlúčené: +${added} ${daysWord(added)}`);
  render();
}

function renderCloud(card) {
  const on = Cloud.cloudEnabled();
  const cfg = Cloud.cloudConfig();
  card.innerHTML = `
    <h2>Automatická záloha <small>GitHub</small></h2>
    <p class="muted" style="margin-top:0;font-size:14px">Appka po každej zmene sama pošle zálohu do tvojho súkromného
      repozitára na GitHube. Ostane tam aj história všetkých verzií. Token je uložený len v tomto zariadení.
      <a href="https://github.com/matusmelek-maker/makra_app/blob/main/NAVOD-ZALOHA.md" target="_blank" rel="noopener">Návod</a></p>
    <div id="cloud-status" style="font-size:14px;margin-bottom:12px"></div>
    ${on ? `
      <div class="btn-row">
        <button class="btn" id="cloud-now">Zálohovať teraz</button>
        <button class="btn secondary" id="cloud-pull">Obnoviť z GitHubu</button>
      </div>
      <div class="btn-row" style="margin-top:8px"><button class="btn small danger" id="cloud-off">Odpojiť</button></div>` : `
      <div class="field"><label for="c-repo">Repozitár</label>
        <input id="c-repo" type="text" value="${esc(cfg.repo || Cloud.DEFAULT_REPO)}" autocapitalize="off" autocorrect="off" spellcheck="false" style="padding-right:12px"></div>
      <div class="field"><label for="c-token">Token (github_pat_…)</label>
        <input id="c-token" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="padding-right:12px"></div>
      <div class="btn-row"><button class="btn" id="cloud-save">Uložiť a zálohovať teraz</button></div>`}`;
  renderCloudStatus();

  $('#cloud-save', card)?.addEventListener('click', async () => {
    const repo = $('#c-repo', card).value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$|\/$/g, '');
    const token = $('#c-token', card).value.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return toast('Vyplň repozitár aj token');
    Cloud.setCloudConfig({ repo, token });
    renderCloud(card);
    $('#cloud-status', card).textContent = 'Skúšam zálohovať…';
    const r = await syncCloud({ force: true });
    toast(r.ok ? 'Záloha na GitHube funguje ✓' : 'Zálohovanie zlyhalo – pozri správu');
  });
  $('#cloud-now', card)?.addEventListener('click', async () => {
    $('#cloud-status', card).textContent = 'Zálohujem…';
    const r = await syncCloud({ force: true });
    toast(r.ok ? 'Zálohované na GitHub ✓' : 'Zálohovanie zlyhalo');
  });
  $('#cloud-pull', card)?.addEventListener('click', async () => {
    try {
      const d = await Cloud.pullBackup();
      if (d.app !== 'makra' || !d.days || !d.settings) throw new Error('Záloha na GitHube má neplatný formát.');
      applyBackup(d);
    } catch (e) {
      toast(e.message || 'Obnovenie zlyhalo');
    }
  });
  $('#cloud-off', card)?.addEventListener('click', () => {
    if (!confirm('Odpojiť automatickú zálohu? Token sa z tohto zariadenia vymaže, záloha na GitHube ostane.')) return;
    Cloud.clearCloud();
    renderCloud(card);
  });
}

function renderCloudStatus() {
  const el = $('#cloud-status');
  if (!el) return;
  if (!Cloud.cloudEnabled()) {
    el.innerHTML = '<span class="muted">Vypnutá – vlož token a zapni ju.</span>';
    return;
  }
  const st = Cloud.cloudState();
  const when = (s) => new Date(s).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ok = st.at ? `<span class="lvl-good">✓ Posledná záloha ${when(st.at)} (${st.days} ${daysWord(st.days)})</span>` : '';
  const err = st.paused
    ? '<div class="lvl-ok" style="margin-top:4px">V telefóne je oveľa menej dní ako v poslednej zálohe, preto som automatické zálohovanie zastavil, aby sa záloha neprepísala. Ak je to v poriadku, ťukni Zálohovať teraz.</div>'
    : st.error ? `<div class="lvl-bad" style="margin-top:4px">${esc(st.error)}</div>` : '';
  el.innerHTML = (ok || '<span class="muted">Zatiaľ bez zálohy.</span>') + err;
}

// ---------- start ----------
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // appka z plochy sa často len prebudí -> pri návrate skontroluj, či nie je nová verzia
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  // nová verzia prevzala riadenie -> raz načítaj stránku znova (dáta sa najprv uložia)
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    flush();
    location.reload();
  });
}
render();
// po spustení dobehni zálohu, ak minule nevyšla; trvalé chyby ukáž
if (Cloud.cloudEnabled()) {
  setTimeout(async () => {
    const r = await syncCloud();
    if (!r.ok && [401, 403, 404].includes(r.status)) toast('Záloha na GitHub nefunguje – pozri Nastavenia');
  }, 4000);
}
