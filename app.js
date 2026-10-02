import * as C from './calc.js';
import { parseHealthPayload } from './health.js';

const STORE_KEY = 'makra-data-v1';
const BACKUP_KEY = 'makra-last-backup';
const DAY_NAMES = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
const DAY_SHORT = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
const MACRO_LABEL = { carbs: 'Sacharidy', protein: 'Bielkoviny', fat: 'Tuky', fiber: 'Vláknina' };
const LEVEL_TEXT = { great: 'výborný deficit', good: 'dobrý deficit', ok: 'mierny deficit', bad: 'prebytok', none: 'bez zápisu' };

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
  d.settings = { ...def.settings, ...d.settings };
  d.settings.targets = { ...def.settings.targets, ...d.settings.targets };
  for (const k of ['bazal', 'stepCoef']) {
    if (!Array.isArray(d.settings[k])) d.settings[k] = [{ from: d.settings.startDate, value: Number(d.settings[k]) }];
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
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => document.hidden && flush());

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
const TITLES = { day: 'Deň', weeks: 'Týždne', goal: 'Cieľ', settings: 'Nastavenia' };
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
  ({ day: renderDay, weeks: renderWeeks, goal: renderGoal, settings: renderSettings })[tab](view);
}

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

    <section class="card hero" id="hero"></section>

    <section class="card">
      <h2>Jedlo <button class="btn small secondary" id="from-health">Nahrať zo Zdravia</button></h2>
      <div id="health-box"></div>
      <div class="fields">
        ${field({ id: 'kcal', label: 'Zjedené kalórie', unit: 'kcal', value: day.kcal, cls: 'full', mode: 'numeric' })}
        ${field({ id: 'carbs', label: 'Sacharidy', unit: 'g', value: day.carbs })}
        ${field({ id: 'protein', label: 'Bielkoviny', unit: 'g', value: day.protein })}
        ${field({ id: 'fat', label: 'Tuky', unit: 'g', value: day.fat })}
        ${field({ id: 'fiber', label: 'Vláknina', unit: 'g', value: day.fiber })}
      </div>
    </section>

    <section class="card">
      <h2>Pohyb</h2>
      <div class="fields">
        ${field({ id: 'gym', label: 'Posilka', unit: 'kcal', value: day.gym, mode: 'numeric' })}
        ${field({ id: 'sport', label: 'Šport (beh, futbal…)', unit: 'kcal', value: day.sport, mode: 'numeric' })}
        ${field({ id: 'steps', label: 'Kroky bez športovania', unit: 'krokov', value: day.steps, mode: 'numeric', cls: 'full' })}
        ${field({ id: 'weight', label: 'Váha', unit: 'kg', value: day.weight, placeholder: fmt(prevWeight, 1), hint: 'prázdne = posledná zapísaná', cls: 'full' })}
      </div>
      <div id="move-calc"></div>
    </section>

    <section class="card" id="macros"></section>

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

  for (const key of ['kcal', 'carbs', 'protein', 'fat', 'fiber', 'gym', 'sport', 'steps', 'weight']) {
    $('#' + key, view).addEventListener('input', (e) => setDayField(key, parseNum(e.target.value)));
  }
  $('#note', view).addEventListener('input', (e) => setDayField('note', e.target.value.trim() || undefined));
  $('#from-health', view).addEventListener('click', () => { healthPanelOpen = !healthPanelOpen; renderHealthBox(view); });
  renderHealthBox(view);
  updateDayComputed();
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
    renderHealthBox(view, { error: e.message, paste: true });
    return;
  }
  const date = p.date || pendingHealth() || currentDate;
  const prev = data.days[date] ? { ...data.days[date] } : undefined;
  data.days[date] = { ...(data.days[date] || {}), ...p.values };
  save(true);
  setPendingHealth(null);
  healthPanelOpen = false;
  lastImport = { date, prev, values: p.values };
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

function renderHealthBox(view, { error, paste } = {}) {
  const box = $('#health-box', view);
  if (!box) return;
  if (error || paste) {
    box.innerHTML = `<div class="callout ${error ? 'bg-bad' : 'bg-none'}" style="margin:0 0 12px">
      ${error ? `<div style="margin-bottom:8px">${esc(error)}</div>` : ''}
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
    const parts = [
      v.kcal !== undefined && `${fmt(v.kcal)} kcal`,
      v.carbs !== undefined && `S ${fmt(v.carbs)}`,
      v.protein !== undefined && `B ${fmt(v.protein)}`,
      v.fat !== undefined && `T ${fmt(v.fat)}`,
      v.fiber !== undefined && `V ${fmt(v.fiber)} g`,
    ].filter(Boolean).join(' · ');
    box.innerHTML = `<div class="callout bg-good" style="margin:0 0 12px;display:flex;gap:8px;align-items:center;justify-content:space-between">
      <span>Zo Zdravia: <b class="num">${parts}</b></span>
      <button class="btn small secondary" id="health-undo">Vrátiť</button></div>`;
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
  if (Object.keys(day).length) data.days[currentDate] = day;
  else delete data.days[currentDate];
  save();
  updateDayComputed();
}

function updateDayComputed() {
  const c = C.computeDay(data, currentDate);
  const lvl = C.dayLevel(c.balance, c.eaten > 0);

  $('#hero').innerHTML = `
    <div class="big num lvl-${lvl}">${c.eaten > 0 ? fmtSigned(c.balance) : '—'} <small style="font-size:18px">kcal</small></div>
    <div class="label">${c.eaten > 0 ? 'Bilancia dňa · ' + LEVEL_TEXT[lvl] : 'Zapíš zjedené kalórie a pohyb'}</div>
    <div class="breakdown">
      <div><b class="num">${fmt(c.eaten)}</b><span>zjedené${c.kcalFromMacros ? ' (z makier)' : ''}</span></div>
      <div><b class="num">${fmtMinus(c.bazal)}</b><span>bazál</span></div>
      <div><b class="num">${fmtMinus(c.burned)}</b><span>pohyb</span></div>
    </div>`;

  const kcalHint = $('[data-hint="kcal"]');
  kcalHint.textContent = c.macroKcal > 0 ? `z makier: ${fmt(c.macroKcal)} kcal` + (c.day.kcal ? '' : ' (použije sa toto)') : '';
  $('#kcal').placeholder = c.macroKcal > 0 ? fmt(c.macroKcal) : '';

  $('#move-calc').innerHTML = `
    <div class="calc-line"><span class="muted">Kroky → kalórie <small>(${fmt(c.stepIndex, 4)} kcal/krok)</small></span><b class="num">${fmt(c.stepKcal)} kcal</b></div>
    <div class="calc-line"><span class="muted">Výdaj pohybom spolu</span><b class="num">${fmt(c.burned)} kcal</b></div>`;

  const bars = C.MACROS.map((m) => {
    const eaten = c.eatenMacro[m];
    const target = c.targets[m];
    const pct = target > 0 ? Math.min(100, (eaten / target) * 100) : 0;
    const over = eaten > target * 1.05 && m !== 'protein' && m !== 'fiber';
    const diff = c.diff[m];
    return `<div class="macro">
      <div class="row"><b>${MACRO_LABEL[m]}</b><span class="num">${fmt(eaten, eaten % 1 ? 1 : 0)} / ${fmt(target)} g
        <span class="${diff > 0 ? (over ? 'lvl-bad' : 'lvl-good') : 'muted'}">(${fmtSigned(diff)})</span></span></div>
      <div class="bar"><i class="${over ? 'over' : ''}" style="width:${pct}%"></i></div>
    </div>`;
  }).join('');
  const left = c.carbsLeft;
  $('#macros').innerHTML = `
    <h2>Makrá <small>cieľ ${fmt(c.targetKcalBase)} kcal + výdaj${c.burned ? ' = ' + fmt(c.targetKcalTotal) + ' kcal' : ''}</small></h2>
    ${bars}
    <div class="callout ${left > 0 ? 'bg-ok' : 'bg-good'}">
      ${left > 0
        ? `Ešte môžeš doplniť <b class="num">${fmt(left)} g</b> sacharidov.`
        : `Sacharidy splnené${left < -1 ? ` (o <b class="num">${fmt(-left)} g</b> viac)` : ''}.`}
      <div class="muted" style="font-size:13px;margin-top:4px">Sacharidy = ${fmt(data.settings.targets.carbs)} g + výdaj pohybom / 4,1</div>
    </div>
    <details style="margin-top:12px">
      <summary>▸ Rýchly výpočet (odhad výdaja dopredu)</summary>
      <div class="fields">
        ${field({ id: 'quick', label: 'Odhadovaný výdaj', unit: 'kcal', value: undefined, mode: 'numeric', hint: null })}
        <div class="field"><label>Sacharidy na deň</label><div class="stat" style="padding:12px"><b id="quick-out" class="num">—</b></div></div>
      </div>
    </details>`;
  $('#quick').addEventListener('input', (e) => {
    const v = parseNum(e.target.value);
    $('#quick-out').textContent = v === undefined ? '—' : fmt(data.settings.targets.carbs + v / C.KCAL_PER_G.carbs) + ' g';
  });
}

// ---------- WEEKS ----------
function renderWeeks(view) {
  const weeks = C.computeWeeks(data).filter((w) => w.hasData || w.monday === C.mondayOf(C.today())).reverse();
  if (!weeks.length) {
    view.innerHTML = '<div class="empty">Zatiaľ žiadne záznamy.</div>';
    return;
  }
  const legend = `<div class="legend" style="margin-top:4px">
    <span class="bg-great">deň &lt; −400</span><span class="bg-good">−400 až −100</span>
    <span class="bg-ok">−100 až 0</span><span class="bg-bad">&gt; 0</span></div>`;
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
          <span>Kalórie mínus bazál</span><span>${fmtSigned(w.eaten - w.bazal)} kcal</span>
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
  const weights = Object.entries(data.days).filter(([, d]) => d.weight).sort(([a], [b]) => a.localeCompare(b));
  const weightSeries = [{ date: s.startDate, y: s.startWeight }, ...weights.map(([date, d]) => ({ date, y: d.weight }))]
    .filter((p, i, arr) => i === 0 || p.y !== arr[i - 1].y || i === arr.length - 1);

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

    <section class="card">
      <h2>Zostávajúce kalórie do cieľa</h2>
      <div id="chart-remaining"></div>
    </section>

    <section class="card">
      <h2>Váha</h2>
      <div id="chart-weight"></div>
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

  lineChart($('#chart-remaining', view), g.series.map((p) => ({ date: p.date, y: p.remaining })), { unit: 'kcal', dec: 0, area: true });
  lineChart($('#chart-weight', view), weightSeries, { unit: 'kg', dec: 1 });
  renderMeasurements();

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
    renderGoal(view);
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
    renderMeasurements();
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
        ${field({ id: 's-goal', label: 'Cieľ schudnúť tuku', unit: 'kg', value: s.goalFatKg, hint: `= ${fmt(s.goalFatKg * C.KCAL_PER_KG_FAT)} kcal` })}
      </div>
    </section>

    <section class="card">
      <h2>Výpočty <small>platí od dátumu</small></h2>
      ${history('bazal', 'Bazálny metabolizmus', 'kcal', 'numeric')}
      ${history('stepCoef', 'Koeficient krokov (× váha = kcal/krok)', '', 'decimal')}
    </section>

    <section class="card">
      <h2>Denné makrá bez výdaja</h2>
      <div class="fields">
        ${C.MACROS.map((m) => field({ id: 't-' + m, label: MACRO_LABEL[m], unit: 'g', value: s.targets[m], hint: null })).join('')}
      </div>
      <div class="calc-line"><span class="muted">Spolu</span><b id="t-kcal" class="num"></b></div>
    </section>

    <section class="card">
      <h2>Apple Zdravie</h2>
      <p class="muted" style="margin:0 0 12px;font-size:14px">V sekcii Deň ťukni <b>Nahrať zo Zdravia</b>: appka spustí
        skratku, tá prečíta kalórie a makrá z Kalorických tabuliek a po návrate ich vložíš. V Zdraví musí byť jednotka
        energie <b>kcal</b>. <a href="https://github.com/matusmelek-maker/makra_app/blob/main/NAVOD-SKRATKA.md" target="_blank" rel="noopener">Návod na skratku</a></p>
      <div class="field"><label for="s-shortcut">Názov skratky (presne ako v appke Skratky)</label>
        <input id="s-shortcut" type="text" value="${esc(s.shortcutName)}" style="padding-right:12px"></div>
    </section>

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
      <p class="muted" style="font-size:13px">Záznamov: ${Object.keys(data.days).length} dní, ${data.measurements.length} meraní.</p>
    </section>

    <section class="card">
      <h2>Nebezpečná zóna</h2>
      <button class="btn danger" id="wipe">Vymazať všetky dáta v tomto zariadení</button>
    </section>
    <p class="muted" style="text-align:center;font-size:12px">Makrá · offline aplikácia</p>`;

  const bind = (id, fn) => $('#' + id, view).addEventListener('input', (e) => { fn(e.target.value); save(); });
  bind('s-start', (v) => v && (s.startDate = v));
  bind('s-shortcut', (v) => { s.shortcutName = v.trim() || 'Makrá zo Zdravia'; });
  bind('s-weight', (v) => { const n = parseNum(v); if (n) s.startWeight = n; });
  bind('s-goal', (v) => {
    const n = parseNum(v);
    if (n) s.goalFatKg = n;
    $('[data-hint="s-goal"]').textContent = `= ${fmt(s.goalFatKg * C.KCAL_PER_KG_FAT)} kcal`;
  });
  const updT = () => {
    $('#t-kcal').textContent = fmt(C.MACROS.reduce((a, m) => a + s.targets[m] * C.KCAL_PER_G[m], 0)) + ' kcal';
  };
  C.MACROS.forEach((m) => bind('t-' + m, (v) => { const n = parseNum(v); if (n !== undefined) s.targets[m] = n; updT(); }));
  updT();

  $$('[data-hist]', view).forEach((row) => {
    const arr = s[row.dataset.hist];
    const h = arr[Number(row.dataset.i)];
    $$('input', row).forEach((inp) => inp.addEventListener('input', () => {
      if (inp.dataset.k === 'from') { if (inp.value) h.from = inp.value; }
      else { const n = parseNum(inp.value); if (n) h.value = n; }
      arr.sort((a, b) => a.from.localeCompare(b.from));
      save();
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

async function importData(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== 'makra' || !d.days || !d.settings) throw new Error('format');
    const n = Object.keys(d.days).length;
    if (!confirm(`Nahrať zálohu (${n} dní, ${(d.measurements || []).length} meraní)? Aktuálne dáta v zariadení sa nahradia.`)) return;
    data = migrate(d);
    save(true);
    toast(`Nahraté: ${n} dní`);
    render();
  } catch (err) {
    toast('Neplatný súbor zálohy');
  }
}

// ---------- start ----------
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
