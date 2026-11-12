// Lista Ostrzeżeń przed niebezpiecznymi stronami CERT Polska (hole.cert.pl): publiczna, darmowa, aktualizowana
// na bieżąco. Pobieramy CAŁĄ listę (TXT, domena w linii) i sprawdzamy adresy u siebie – CERT nie dowiaduje się,
// jakie strony oglądasz. Wpis obejmuje też subdomeny (example.com → sub.example.com).
// Pobieranie leniwe (przy pierwszym sprawdzaniu), najwyżej raz na 12 h; plik trzymamy w IndexedDB.

export const CERT_URL = "https://hole.cert.pl/domains/v2/domains.txt";
export const MAX_AGE_MS = 12 * 3_600_000;
const DB = "fact-checker-lists", STORE = "lists", KEY = "cert";

let cache = null;      // { at, text, n } – text z \n na początku i końcu (szybkie indexOf)
let loading = null;

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, mode);
      const r = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(r?.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

// Tekst listy → postać do wyszukiwania; pomija puste linie i komentarze.
export function prepare(raw = "") {
  const lines = String(raw).split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#") && /^[a-z0-9.-]+$/.test(l));
  return { text: `\n${lines.join("\n")}\n`, n: lines.length };
}
// Czy host (albo jego domena nadrzędna) jest na liście; zwraca znaleziony wpis albo "".
export function lookup(prepared, host) {
  if (!prepared?.text || !host) return "";
  const parts = String(host).toLowerCase().replace(/^www\./, "").split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join(".");
    if (prepared.text.includes(`\n${d}\n`)) return d;
  }
  return "";
}

async function download(fetchFn) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const r = await fetchFn(CERT_URL, { signal: ctl.signal, cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const p = prepare(await r.text());
    if (!p.n) throw new Error("empty list");
    // ucięty plik albo strona błędu: nie zastępujemy dobrej kopii dużo krótszą
    if (cache?.n && p.n < cache.n * 0.5) throw new Error(`list shrank from ${cache.n} to ${p.n}`);
    return p;
  } finally { clearTimeout(timer); }
}

// Lista gotowa do sprawdzania albo null (jeszcze się pobiera / brak sieci i brak kopii).
// wait=false: nie czeka na pobieranie – zwraca kopię (nawet starszą) i odświeża w tle.
export async function certList({ wait = true, force = false, fetchFn = (...a) => fetch(...a), onLoaded = null } = {}) {
  if (!cache) {
    const saved = await idb("readonly", (st) => st.get(KEY)).catch(() => null);
    if (saved?.text) cache = saved;
  }
  const stale = !cache || force || Date.now() - cache.at > MAX_AGE_MS;
  if (stale && !loading) {
    loading = download(fetchFn)
      .then(async (p) => {
        cache = { at: Date.now(), ...p };
        await idb("readwrite", (st) => st.put(cache, KEY)).catch(() => {});
        onLoaded?.(cache);
        return cache;
      })
      .catch((e) => { console.warn("Lista Ostrzeżeń CERT:", e.message); return cache; })
      .finally(() => { loading = null; });
  }
  if (stale && (wait || !cache)) return wait ? await loading || cache : cache;
  return cache;
}
export const certInfo = () => (cache ? { at: cache.at, n: cache.n } : null);
export async function certInfoStored() {
  if (cache) return certInfo();
  const saved = await idb("readonly", (st) => st.get(KEY)).catch(() => null);
  return saved?.text ? { at: saved.at, n: saved.n } : null;
}
