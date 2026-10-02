// Automatická záloha do súkromného GitHub repozitára cez GitHub API (súbor makra-data.json).
// Token a stav synchronizácie sú len v tomto zariadení (localStorage) – nikdy nie v dátach ani v zálohe.

const CFG_KEY = 'makra-cloud'; // { repo, token, path }
const STATE_KEY = 'makra-cloud-state'; // { sha, at, hash, days, error, errorAt, paused }
export const DEFAULT_REPO = 'matusmelek-maker/makra_data';
const DEFAULT_PATH = 'makra-data.json';

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
function write(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

export const cloudConfig = () => read(CFG_KEY);
export const cloudState = () => read(STATE_KEY);
export const cloudEnabled = () => {
  const c = cloudConfig();
  return Boolean(c.token && c.repo);
};
export function setCloudConfig(cfg) {
  write(CFG_KEY, cfg);
  write(STATE_KEY, {}); // nový repozitár/token -> začni odznova
}
export function clearCloud() {
  try {
    localStorage.removeItem(CFG_KEY);
    localStorage.removeItem(STATE_KEY);
  } catch {}
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// krátky odtlačok obsahu, aby sa rovnaké dáta neposielali znova
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + str.length;
}

function api(opts = {}) {
  const { repo, token, path = DEFAULT_PATH } = cloudConfig();
  return fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    ...opts,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
}

export function errorText(status) {
  if (status === 401) return 'Token je neplatný alebo vypršal – vytvor nový a vlož ho sem.';
  if (status === 403) return 'Token nemá právo zapisovať – pri tokene musí byť Contents: Read and write.';
  if (status === 404) return 'Repozitár sa nenašiel alebo k nemu token nemá prístup.';
  if (status === 0) return 'Bez internetu – zálohujem, keď bude spojenie.';
  return `Chyba GitHubu (${status}).`;
}

// Pošle dáta na GitHub. force = aj keď sa nezmenili / aj keď v telefóne ubudlo veľa dní.
export async function pushBackup(data, { force = false, keepalive = false } = {}) {
  if (!cloudEnabled()) return { ok: false, status: -1 };
  const st = cloudState();
  const core = JSON.stringify(data);
  const h = hash(core);
  const days = Object.keys(data.days || {}).length;
  if (!force && st.hash === h && !st.error) return { ok: true, skipped: true };
  // poistka: prázdne dáta alebo oveľa menej dní než v poslednej zálohe sa automaticky neposielajú
  if (!force && (days === 0 || (st.days && days < st.days * 0.5))) {
    write(STATE_KEY, { ...st, paused: true });
    return { ok: false, status: -2 };
  }
  const json = JSON.stringify({ ...data, exported: new Date().toISOString() }, null, 1);
  const body = (sha) => JSON.stringify({
    message: `Záloha ${new Date().toLocaleString('sk-SK')} (${days} dní)`,
    content: b64(json),
    ...(sha ? { sha } : {}),
  });
  try {
    let res = await api({ method: 'PUT', body: body(st.sha), keepalive: keepalive && json.length < 45000 });
    if (res.status === 409 || res.status === 422) {
      // súbor sa medzitým zmenil (alebo ešte neexistuje) -> zisti aktuálnu verziu a skús znova
      const g = await api();
      const sha = g.ok ? (await g.json()).sha : undefined;
      res = await api({ method: 'PUT', body: body(sha) });
    }
    if (!res.ok) {
      write(STATE_KEY, { ...st, error: errorText(res.status), errorAt: new Date().toISOString() });
      return { ok: false, status: res.status };
    }
    const j = await res.json();
    write(STATE_KEY, { sha: j.content.sha, at: new Date().toISOString(), hash: h, days });
    return { ok: true };
  } catch {
    write(STATE_KEY, { ...st, error: errorText(0), errorAt: new Date().toISOString() });
    return { ok: false, status: 0 };
  }
}

// Stiahne poslednú zálohu z GitHubu (objekt dát)
export async function pullBackup() {
  const res = await api({ headers: { Accept: 'application/vnd.github.raw+json' } });
  if (res.status === 404) throw new Error('Na GitHube zatiaľ nie je žiadna záloha (alebo token nemá prístup).');
  if (!res.ok) throw new Error(errorText(res.status));
  return JSON.parse(await res.text());
}
