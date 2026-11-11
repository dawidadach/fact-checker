// Pamięć werdyktów: ten sam tekst albo ten sam obrazek (mem, infografika) sprawdzony wcześniej dostaje
// wynik od razu z pamięci – z datą sprawdzenia, bez kosztów i czekania. Popularne memy krążą tygodniami.
// Tekst rozpoznajemy po skrócie (SHA-256) z samych liter i cyfr, obrazek – po „odcisku” (niżej), który wytrzymuje
// inny rozmiar zrzutu i kompresję. Obrazek rozpoznajemy też osobno, niezależnie od tekstu posta.
// Wszystko zostaje w przeglądarce (IndexedDB).

import { MEMORY_STORE, tx } from "./history.js";

const MAX_ENTRIES = 500;

export const normText = (s) => [...String(s || "").toLowerCase().normalize("NFKC")].filter((c) => /[\p{L}\p{N}]/u.test(c)).join("");

export async function textHash(text) {
  const n = normText(text);
  if (!n) return "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(n));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- odciski obrazków ----------
// Każdy obrazek dostaje odcisk z trzech części:
//  d – stary dHash 64 bity (zgodność z wpisami z 0.5.0),
//  w – dHash 240 bitów z siatki 16×16 (szybkie wstępne porównanie),
//  h – miniatura 128×128 w skali szarości (base64): porównanie bloków 8×8 łapie lokalne różnice – ten sam szablon
//      mema z INNYM napisem albo infografika z podmienioną dużą liczbą ma podobny ogólny wygląd, ale różni się
//      w blokach z tekstem, więc NIE jest uznana za ten sam obrazek.
// Zrzut tego samego obrazka w innym rozmiarze / innej kompresji JPEG zmienia piksele tylko trochę i wszędzie po równo.
// Pomiary (ten sam obrazek w innej skali / kompresji: maks. różnica bloku ≤ 16; ten sam szablon z innym napisem,
// podmieniona duża cyfra: ≥ 70) – stąd próg 24.
// Ograniczenie: zmiana drobnego tekstu (kilka pikseli) bywa niewykrywalna – dlatego wynik z pamięci zawsze
// pokazuje datę i odczytany wtedy tekst obrazka, a „Sprawdź ponownie” wymusza świeże sprawdzenie.

// dHash: bit = piksel jaśniejszy od sąsiada po prawej (wiersz po wierszu); gray – w×h.
export function dhashRows(gray, w, h) {
  let bits = "";
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) bits += gray[y * w + x] > gray[y * w + x + 1] ? "1" : "0";
  while (bits.length % 4) bits += "0";
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}
export const dhashFromGray = (gray) => dhashRows(gray, 9, 8); // 64 bity (9×8)
export function downsample(gray, w, f) {
  const nw = w / f, out = new Array(nw * nw).fill(0);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) out[Math.floor(y / f) * nw + Math.floor(x / f)] += gray[y * w + x] / (f * f);
  return out;
}
const toB64 = (arr) => btoa(String.fromCharCode(...arr.map((v) => Math.max(0, Math.min(255, Math.round(v))))));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Odcisk z szarej siatki 128×128 (+ ewentualnie stary 9×8).
export function fingerprintFromGray(gray128, gray9x8 = null) {
  const g16 = downsample(gray128, 128, 8);
  return { v: 2, ...(gray9x8 ? { d: dhashFromGray(gray9x8) } : {}), w: dhashRows(g16, 16, 16), h: toB64(gray128) };
}
async function grayOf(blob, w, h, quality) {
  const bmp = await createImageBitmap(blob, quality ? { resizeWidth: w, resizeHeight: h, resizeQuality: quality } : undefined);
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const px = ctx.getImageData(0, 0, w, h).data;
  const gray = [];
  for (let i = 0; i < px.length; i += 4) gray.push(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
  return gray;
}
export async function imageFingerprint(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return fingerprintFromGray(await grayOf(blob, 128, 128, "high"), await grayOf(blob, 9, 8));
}
export async function imageHash(dataUrl) { return (await imageFingerprint(dataUrl)).d; } // zgodność wstecz

export function hamming(a = "", b = "") {
  if (!a || a.length !== b.length) return 9999;
  let d = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    for (; x; x &= x - 1) d++;
  }
  return d;
}
// Różnice w blokach 8×8 miniatur n×n (po wyrównaniu jasności): { max, mean } – średnia różnica na piksel (0–255).
export function blockDiff(gA, gB, n = 128, bs = 8) {
  const a = fromB64(gA), b = fromB64(gB);
  if (a.length !== n * n || b.length !== n * n) return { max: 255, mean: 255 };
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  const k = n / bs, blocks = [];
  for (let by = 0; by < k; by++) for (let bx = 0; bx < k; bx++) {
    let sum = 0;
    for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) {
      const i = (by * bs + y) * n + bx * bs + x;
      sum += Math.abs((a[i] - ma) - (b[i] - mb));
    }
    blocks.push(sum / (bs * bs));
  }
  return { max: Math.max(...blocks), mean: blocks.reduce((s, v) => s + v, 0) / blocks.length };
}
export const LIMITS = { wide: 0.12, blockMax: 24, blockMean: 8, legacy: 3 };
// Czy to ten sam obrazek? a, b – odciski (albo stary zapis: sam dHash 64-bitowy jako tekst).
export function imageDistance(a, b) {
  const A = typeof a === "string" ? { d: a } : a || {}, B = typeof b === "string" ? { d: b } : b || {};
  if (A.w && B.w && A.h && B.h) {
    const wide = hamming(A.w, B.w) / (A.w.length * 4);
    if (wide > LIMITS.wide) return { same: false, wide };
    const blk = blockDiff(A.h, B.h);
    return { same: blk.max <= LIMITS.blockMax && blk.mean <= LIMITS.blockMean, wide, ...blk };
  }
  if (A.d && B.d) { const h = hamming(A.d, B.d); return { same: h <= LIMITS.legacy, legacy: h }; }
  return { same: false };
}
export const sameImage = (a, b) => imageDistance(a, b).same;

// Klucz treści: { text: skrót tekstu, images: [odciski] }.
export async function contentKey({ text = "", images = [] }) {
  const imgs = [];
  for (const im of images) {
    try { imgs.push(await imageFingerprint(im.thumb || im.dataUrl)); } catch { imgs.push(null); }
  }
  return { text: await textHash(text), images: imgs };
}
export function sameContent(a, b) {
  if (!a || !b || a.text !== b.text) return false;
  if ((a.images || []).length !== (b.images || []).length) return false;
  return a.images.every((h, i) => h && b.images[i] && sameImage(h, b.images[i]));
}
const hasKey = (k) => !!(k && (k.text || k.images?.length));

// Wpis: { id, key, at, lang, provider, model, kind, title, claims, imageNotes }
export async function findInMemory(key, { lang, maxAgeDays = 30 } = {}) {
  if (!hasKey(key) || !(maxAgeDays > 0)) return null;
  const all = (await tx("readonly", (st) => st.getAll(), MEMORY_STORE)) || [];
  const fresh = Date.now() - maxAgeDays * 86_400_000;
  return all.filter((e) => e.at >= fresh && (!lang || e.lang === lang) && sameContent(key, e.key)).sort((a, b) => b.at - a.at)[0] || null;
}
// Każdy obrazek osobno – niezależnie od tekstu (ten sam mem w innym poście, sam obrazek po wcześniejszym poście…).
// Zwraca dla każdego odcisku najnowsze dopasowanie: { at, lang, provider, model, note, claims } albo null.
// Dopasowanie bierzemy z dowolnego wpisu, w którym ten obrazek był: jego opis i twierdzenia „z obrazka N”.
export async function findImages(fps = [], { lang, maxAgeDays = 30 } = {}) {
  if (!fps.length || !(maxAgeDays > 0)) return fps.map(() => null);
  const all = (await tx("readonly", (st) => st.getAll(), MEMORY_STORE)) || [];
  const fresh = Date.now() - maxAgeDays * 86_400_000;
  const pool = all.filter((e) => e.at >= fresh && (!lang || e.lang === lang)).sort((a, b) => b.at - a.at);
  return fps.map((fp) => {
    if (!fp) return null;
    let noteOnly = null; // obrazek opisany, ale bez twierdzeń – użyjemy, gdy nigdzie nie ma pełniejszego wyniku
    for (const e of pool) {
      for (const [i, other] of (e.key?.images || []).entries()) {
        if (!other || !sameImage(fp, other)) continue;
        const note = (e.imageNotes || []).find((n) => n.index === i + 1) || null;
        const claims = (e.claims || []).filter((c) => c.image === i + 1);
        if (!note && !claims.length) continue; // obrazek był, ale bez analizy – szukamy dalej
        const hit = { at: e.at, lang: e.lang, provider: e.provider || "", model: e.model || "", note, claims };
        if (claims.length) return hit;
        noteOnly ??= hit;
      }
    }
    return noteOnly;
  });
}

export async function saveToMemory(entry) {
  if (!hasKey(entry?.key)) return;
  const all = (await tx("readonly", (st) => st.getAll(), MEMORY_STORE)) || [];
  const same = all.filter((e) => e.lang === entry.lang && sameContent(entry.key, e.key));
  const extra = all.length - same.length + 1 - MAX_ENTRIES;
  const oldest = extra > 0 ? all.filter((e) => !same.includes(e)).sort((a, b) => a.at - b.at).slice(0, extra) : [];
  await tx("readwrite", (st) => {
    for (const e of [...same, ...oldest]) st.delete(e.id);
    return st.put({ id: crypto.randomUUID(), ...entry, at: entry.at || Date.now() });
  }, MEMORY_STORE);
}
export const memoryCount = () => tx("readonly", (st) => st.count(), MEMORY_STORE);
export const clearMemory = () => tx("readwrite", (st) => st.clear(), MEMORY_STORE);
