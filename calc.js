// Výpočty prenesené z Excelu "kalorie - ja" (hárky ciel, suhrn, zapis_minusovych_kalorii, zapis makra).

export const KCAL_PER_KG_FAT = 7700;
export const KCAL_PER_G = { carbs: 4.1, protein: 4.1, fat: 9, fiber: 1 };
export const MACROS = ['carbs', 'protein', 'fat', 'fiber'];

// ---- dátumy (ISO "YYYY-MM-DD", vždy v lokálnom čase) ----
export function iso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function today() {
  return iso(new Date());
}
export function mondayOf(s) {
  const d = parseIso(s);
  return addDays(s, -((d.getDay() + 6) % 7));
}

// Hodnota platná k dátumu z histórie [{from, value}] (napr. koeficient krokov, bazál)
export function valueAt(history, date) {
  let v = history[0]?.value;
  for (const h of [...history].sort((a, b) => a.from.localeCompare(b.from))) {
    if (h.from <= date) v = h.value;
  }
  return v;
}

// Posledná zapísaná váha k dátumu (stĺpec G sa v Exceli ťahal dole)
export function weightAt(data, date) {
  let best = null;
  for (const [d, day] of Object.entries(data.days)) {
    if (day.weight && d <= date && (!best || d > best)) best = d;
  }
  return best ? data.days[best].weight : data.settings.startWeight;
}

export function macroKcal(day) {
  return MACROS.reduce((s, m) => s + (Number(day[m]) || 0) * KCAL_PER_G[m], 0);
}

// Zjedené kcal: ručne zapísané, inak dopočítané z makier
export function eatenKcal(day) {
  if (day.kcal) return Number(day.kcal);
  return macroKcal(day);
}

// Jeden deň = riadok zapis_minusovych_kalorii + bunka v suhrn!S:Y
export function computeDay(data, date) {
  const day = data.days[date] || {};
  const s = data.settings;
  const weight = weightAt(data, date);
  const stepCoef = valueAt(s.stepCoef, date);
  const stepIndex = stepCoef * weight; // E = koef * váha
  const steps = Number(day.steps) || 0;
  const stepKcal = steps * stepIndex; // F = D * E
  const gym = Number(day.gym) || 0;
  const sport = Number(day.sport) || 0;
  const burned = gym + sport + stepKcal; // I = SUM(F, C, B)
  const eaten = eatenKcal(day);
  const bazal = eaten ? valueAt(s.bazal, date) : 0; // bazál sa ráta len keď je zapísané jedlo
  const balance = eaten - burned - bazal;

  // zapis makra
  const t = s.targets;
  const targetKcalBase = MACROS.reduce((sum, m) => sum + t[m] * KCAL_PER_G[m], 0); // H
  const carbsTarget = t.carbs + burned / KCAL_PER_G.carbs; // S = N + I/4.1
  const hasMacros = MACROS.some((m) => day[m] !== undefined && day[m] !== '' && day[m] !== null);
  const eatenMacro = Object.fromEntries(MACROS.map((m) => [m, Number(day[m]) || 0]));
  const targets = { carbs: carbsTarget, protein: t.protein, fat: t.fat, fiber: t.fiber };
  const diff = Object.fromEntries(MACROS.map((m) => [m, eatenMacro[m] - targets[m]])); // T..W

  return {
    date, day, weight, stepCoef, stepIndex, steps, stepKcal, gym, sport, burned,
    eaten, kcalFromMacros: !day.kcal && eaten > 0, macroKcal: macroKcal(day),
    bazal, balance, hasData: eaten > 0 || burned > 0,
    targetKcalBase, targetKcalTotal: burned ? targetKcalBase + burned : 0, // J
    carbsLeft: carbsTarget - eatenMacro.carbs, // R
    hasMacros, eatenMacro, targets, diff,
  };
}

// Rozsah od začiatku (alebo prvého záznamu) po dnešok / posledný záznam
export function dateRange(data) {
  const keys = Object.keys(data.days).sort();
  const start = [data.settings.startDate, keys[0]].filter(Boolean).sort()[0] || today();
  const lastKey = keys[keys.length - 1];
  const end = lastKey && lastKey > today() ? lastKey : today();
  return { start, end };
}

// suhrn: jeden riadok na týždeň (Po–Ne)
export function computeWeeks(data) {
  const { start, end } = dateRange(data);
  const weeks = [];
  for (let mon = mondayOf(start); mon <= end; mon = addDays(mon, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => computeDay(data, addDays(mon, i)));
    const sum = (f) => days.reduce((s, d) => s + f(d), 0);
    weeks.push({
      monday: mon,
      sunday: addDays(mon, 6),
      days,
      eaten: sum((d) => d.eaten), // I
      bazal: sum((d) => d.bazal), // J
      gym: sum((d) => d.gym), // L
      sport: sum((d) => d.sport), // M
      stepKcal: sum((d) => d.stepKcal), // N
      steps: sum((d) => d.steps), // O
      burned: sum((d) => d.burned), // P
      result: sum((d) => d.balance), // Q
      hasData: days.some((d) => d.hasData),
    });
  }
  return weeks;
}

// ciel: koľko kcal ešte treba spáliť (A1 = C18*7700 + C19) a priebeh pre graf (stĺpec R)
export function computeGoal(data) {
  const s = data.settings;
  const goalKcal = s.goalFatKg * KCAL_PER_KG_FAT;
  const { start, end } = dateRange(data);
  const series = [];
  let total = 0;
  let lastDataDate = null;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const c = computeDay(data, d);
    total += c.balance;
    if (c.hasData) lastDataDate = d;
    series.push({ date: d, remaining: goalKcal + total, balance: c.balance, hasData: c.hasData, weight: c.weight });
  }
  const remaining = goalKcal + total;
  const burnedSoFar = -total;

  // tempo z posledných 28 dní so zápisom -> odhad dátumu cieľa
  const recent = series.filter((x) => x.hasData).slice(-28);
  const avgDaily = recent.length ? recent.reduce((s2, x) => s2 + x.balance, 0) / recent.length : 0;
  let eta = null;
  if (avgDaily < 0 && remaining > 0 && lastDataDate) {
    eta = addDays(lastDataDate, Math.ceil(remaining / -avgDaily));
  }
  return {
    goalKcal, remaining, burnedSoFar,
    remainingKg: remaining / KCAL_PER_KG_FAT,
    burnedKg: burnedSoFar / KCAL_PER_KG_FAT,
    progress: Math.max(0, Math.min(1, burnedSoFar / goalKcal)),
    series: series.filter((x) => !lastDataDate || x.date <= lastDataDate),
    avgDaily, eta,
    currentWeight: weightAt(data, end),
  };
}

// Farby podľa podmieneného formátovania v Exceli
export function dayLevel(v, hasData = true) {
  if (!hasData) return 'none';
  if (v < -400) return 'great';
  if (v < -100) return 'good';
  if (v <= 0) return 'ok';
  return 'bad';
}
export function weekLevel(v, hasData = true) {
  if (!hasData) return 'none';
  if (v < -2800) return 'great';
  if (v < -700) return 'good';
  if (v <= 0) return 'ok';
  return 'bad';
}

export function defaultData() {
  const t = today();
  return {
    app: 'makra',
    version: 1,
    settings: {
      startDate: t,
      bazal: [{ from: t, value: 1980 }],
      startWeight: 100,
      goalFatKg: 10,
      stepCoef: [{ from: t, value: 0.000595 }],
      targets: { carbs: 110, protein: 140, fat: 70, fiber: 25 },
    },
    days: {},
    measurements: [],
  };
}
