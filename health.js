// Import jedla z Apple Zdravia: skratka v iPhone skopíruje do schránky slovník (JSON), napr.
// {"app":"makra-zdravie","date":"2026-10-02","kcal":2140,"carbs":231.5,"protein":150,"fat":70.2,"fiber":21}

const KEYS = {
  kcal: ['kcal', 'energia', 'energy', 'kalorie', 'kalórie'],
  carbs: ['carbs', 'sacharidy'],
  protein: ['protein', 'bielkoviny'],
  fat: ['fat', 'tuky'],
  fiber: ['fiber', 'vlaknina', 'vláknina'],
};

// Skratky môžu poslať číslo aj text so slovenskou čiarkou ("12,5") či medzerou ("2 140")
function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return v.trim() && Number.isFinite(n) ? n : undefined;
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

// Vráti { date?, values: {kcal, carbs, protein, fat, fiber} } alebo hodí chybu so slovenskou správou
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
    const raw = aliases.map((a) => lower[a]).find((v) => v !== undefined);
    const n = toNum(raw);
    if (n !== undefined && n >= 0) values[key] = key === 'kcal' ? Math.round(n) : Math.round(n * 10) / 10;
  }
  if (!Object.keys(values).length) throw new Error('V údajoch chýbajú kalórie aj makrá.');
  if (!Object.values(values).some((v) => v > 0)) throw new Error('V Zdraví zatiaľ nie je za tento deň zapísané žiadne jedlo.');
  if (values.kcal > 15000) throw new Error('Kalórie vyzerajú ako kJ – v Zdraví nastav jednotku energie na kcal.');

  return { date: normDate(lower.date ?? lower.datum ?? lower['dátum']), values };
}
