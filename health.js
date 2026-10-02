// Import jedla z Apple Zdravia: skratka v iPhone skopíruje do schránky slovník (JSON), napr.
// {"app":"makra-zdravie","date":"2026-10-02","kcal":2140,"carbs":231.5,"protein":150,"fat":70.2,"fiber":21}

const KEYS = {
  kcal: ['kcal', 'energia', 'energy', 'kalorie', 'kalórie'],
  carbs: ['carbs', 'sacharidy'],
  protein: ['protein', 'bielkoviny'],
  fat: ['fat', 'tuky'],
  fiber: ['fiber', 'vlaknina', 'vláknina'],
};
const KJ_PER_KCAL = 4.184;

// Skratky môžu poslať číslo, text so slovenským formátom ("2 140,5") aj s jednotkou ("2 140 kcal", "8 950 kJ"),
// prípadne zoznam hodnôt. Vráti { n, kj } alebo undefined.
function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? { n: v, kj: false } : undefined;
  if (Array.isArray(v)) {
    const parts = v.map(toNum).filter(Boolean);
    return parts.length ? { n: parts.reduce((s, p) => s + p.n, 0), kj: parts.some((p) => p.kj) } : undefined;
  }
  if (v && typeof v === 'object') {
    const inner = ['value', 'Value', 'magnitude', 'quantity'].map((k) => v[k]).find((x) => x !== undefined);
    const r = toNum(inner);
    if (r && /kj/i.test(String(v.unit ?? v.Unit ?? ''))) r.kj = true;
    return r;
  }
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\s\u00a0\u202f]/g, '');
  const m = s.match(/-?\d[\d.,]*/);
  if (!m) return undefined;
  let num = m[0];
  if (num.includes(',') && num.includes('.')) {
    // posledný oddeľovač je desatinný, ten prvý sú tisícky
    num = num.lastIndexOf(',') > num.lastIndexOf('.') ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '');
  } else {
    num = num.replace(',', '.');
  }
  const n = Number(num);
  return Number.isFinite(n) ? { n, kj: /kj/i.test(s) } : undefined;
}

// Zoznam záznamov zo Zdravia ako text (každý na riadku, napr. "120 kcal") -> súčet
function sumList(v) {
  const lines = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\r\n;]+/) : [];
  const parts = lines.map(toNum).filter(Boolean);
  if (!parts.length) return undefined;
  return { n: parts.reduce((s, p) => s + (p.kj ? p.n / KJ_PER_KCAL : p.n), 0), kj: false, count: parts.length };
}

function normDate(v) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

// Vráti { date?, values: {kcal, carbs, protein, fat, fiber}, raw } alebo hodí chybu so slovenskou správou
export function parseHealthPayload(text) {
  let obj;
  try {
    obj = JSON.parse(String(text).trim());
  } catch {
    throw new Error('V schránke nie sú údaje zo Zdravia. Spusti najprv skratku.');
  }
  if (!obj || typeof obj !== 'object') throw new Error('Neplatné údaje zo Zdravia.');
  const lower = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase().trim(), v]));

  const values = {};
  for (const [key, aliases] of Object.entries(KEYS)) {
    // prednosť má zoznam záznamov (<kľúč>_list), sčítaný tu v appke; inak hotový súčet zo skratky
    const list = sumList(aliases.map((a) => lower[a + '_list']).find((v) => v !== undefined));
    const single = toNum(aliases.map((a) => lower[a]).find((v) => v !== undefined));
    const r = list && list.n > 0 ? list : single || list;
    if (!r || r.n < 0) continue;
    if (key === 'kcal') values.kcal = Math.round(r.kj ? r.n / KJ_PER_KCAL : r.n);
    else values[key] = Math.round(r.n * 10) / 10;
  }
  if (!Object.keys(values).length) throw new Error('V údajoch chýbajú kalórie aj makrá.');
  if (!Object.values(values).some((v) => v > 0)) throw new Error('V Zdraví zatiaľ nie je za tento deň zapísané žiadne jedlo.');
  if (values.kcal > 15000) throw new Error('Kalórie vyzerajú ako kJ – v Zdraví nastav jednotku energie na kcal.');

  // Skratka niekedy pošle 0, hoci v Zdraví záznamy sú -> nulou neprepisuj (kalórie sa potom dopočítajú z makier)
  const zeros = Object.keys(values).filter((k) => values[k] === 0);
  zeros.forEach((k) => delete values[k]);
  const kcalZero = zeros.includes('kcal');

  return { date: normDate(lower.date ?? lower.datum ?? lower['dátum']), values, raw: obj, kcalZero, zeros };
}
