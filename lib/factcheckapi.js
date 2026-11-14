// Gotowe fact-checki: Google Fact Check Tools – Claim Search API.
// Przeszukuje ten sam zbiór co Google Fact Check Explorer: artykuły redakcji fact-checkingowych oznaczone
// standardem ClaimReview (np. Demagog, AFP Sprawdzam, Konkret24, PolitiFact…). Wysyłamy tylko krótkie
// hasło (słowa kluczowe twierdzenia) – nigdy całego tekstu ani transkrypcji.

const ENDPOINT = "https://factchecktools.googleapis.com/v1alpha1/claims:search";

export class FactCheckApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// Spłaszcza odpowiedź: jedno twierdzenie może mieć kilka recenzji (różne redakcje).
export function flattenClaims(json) {
  const out = [];
  for (const c of json?.claims || []) {
    for (const r of c.claimReview || []) {
      if (!/^https?:\/\//.test(r.url || "")) continue;
      out.push({
        claim: String(c.text || ""),
        claimant: String(c.claimant || ""),
        claimDate: String(c.claimDate || ""),
        publisher: String(r.publisher?.name || r.publisher?.site || hostOf(r.url)),
        site: String(r.publisher?.site || hostOf(r.url)),
        url: r.url,
        title: String(r.title || ""),
        rating: String(r.textualRating || ""),
        date: String(r.reviewDate || ""),
        lang: String(r.languageCode || ""),
      });
    }
  }
  return out;
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export async function searchClaims({ key, query, lang = "", signal, pageSize = 10, fetchFn = globalThis.fetch }) {
  const u = new URL(ENDPOINT);
  u.searchParams.set("query", query);
  u.searchParams.set("pageSize", String(pageSize));
  if (lang) u.searchParams.set("languageCode", lang);
  u.searchParams.set("key", key);
  const r = await fetchFn(u.toString(), { signal });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { msg = (await r.json())?.error?.message || msg; } catch { /* brak JSON */ }
    throw new FactCheckApiError(msg, r.status);
  }
  return flattenClaims(await r.json());
}

// Słowa do porównań: małe litery, bez polskich znaków, rdzeń = pierwsze 5 liter (odmiana: „inflacja/inflacji”).
const STOP = new Set("oraz ktory ktora ktore jest byly bylo bedzie przez ponad przed jako tego tych tylko takze wiec gdzie kiedy dlaczego wszyscy wszystkie wszystko about that this with from have were been their there which would could should after before more than into".split(" "));
// Liczby z tekstu („2,5” = „2.5”, „1 000” = „1000”) – osobno lata i pozostałe.
export function numbersOf(text) {
  const all = (String(text || "").replace(/(\d)[\s\u00a0](?=\d{3}\b)/g, "$1").match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "."));
  const years = new Set(all.filter((n) => /^(19|20)\d\d$/.test(n)));
  return { years, other: new Set(all.filter((n) => !years.has(n))) };
}
export function stems(text) {
  const out = new Set();
  const { years, other } = numbersOf(text);
  for (const n of [...years, ...other]) if (n.length >= 2) out.add(n);
  const words = String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l")
    .replace(/\d+(?:[.,]\d+)?%?/g, " ").split(/[^a-z]+/).filter(Boolean);
  for (const w of words) {
    if (w.length < 4 || STOP.has(w)) continue;
    out.add(w.slice(0, 5));
  }
  return out;
}
const disjoint = (a, b) => a.size && b.size && ![...a].some((x) => b.has(x));
// Hasło do wyszukiwarki: słowa kluczowe od modelu albo najbardziej znaczące słowa twierdzenia.
export function queryFor(claim) {
  const kw = String(claim?.keywords || "").replace(/[„”"«»]/g, " ").replace(/\s+/g, " ").trim();
  if (kw) return kw.split(" ").slice(0, 8).join(" ");
  const words = String(claim?.claim || "").replace(/[„”"«»(),.;:!?]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 || /\d/.test(w)).filter((w) => !STOP.has(w.toLowerCase()));
  return words.slice(0, 7).join(" ");
}

// Jak bardzo wynik pasuje do naszego twierdzenia (0–1): część naszych rdzeni obecna w twierdzeniu/tytule wyniku.
// Inne liczby (2,5% ≠ 25%) albo inny rok w obu tekstach – to fact-check innego twierdzenia.
export function relevance(claim, item) {
  const mine = `${claim?.claim || ""} ${claim?.keywords || ""}`, theirs = `${item.claim} ${item.title}`;
  const na = numbersOf(mine), nb = numbersOf(theirs);
  if (disjoint(na.other, nb.other) || disjoint(na.years, nb.years)) return 0;
  const a = stems(mine);
  if (!a.size) return 0;
  const b = stems(theirs);
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  if (common < 2) return 0;
  return common / Math.min(a.size, 8);
}

// Wybiera do 3 najlepiej pasujących recenzji (różne adresy), preferując język treści.
export function pickFactChecks(claim, items, { max = 3, min = 0.34, lang = "" } = {}) {
  return items
    .map((it) => ({ ...it, score: relevance(claim, it) + (lang && it.lang === lang ? 0.05 : 0) }))
    .filter((it) => it.score >= min)
    .sort((x, y) => y.score - x.score)
    .filter((it, i, arr) => arr.findIndex((o) => o.url === it.url) === i)
    .slice(0, max)
    .map(({ score, ...it }) => ({ ...it, score: Math.round(score * 100) / 100 }));
}

// Ocena redakcji (dowolny tekst, różne języki) → ton jak u naszych werdyktów: good / warn / bad / muted.
export function ratingTone(text) {
  const r = String(text || "").toLowerCase();
  if (!r) return "muted";
  if (/(half|częściow|czesciow|mixed|partly|partial|mieszan|nieścisł|niescisl|exaggerat|przesad|wymaga kontekstu|needs context)/.test(r)) return "warn";
  if (/(fałsz|falsz|false|fake|nieprawd|manipul|mislead|wprowadza|incorrect|missing context|out of context|bez kontekstu|wyrwane|pants on fire|błędn|bledn|wrong|hoax|scam|bzdur|fabricat|zmyślon|zmyslon)/.test(r)) return "bad";
  if (/(prawd|true|correct|accurate|verified|potwierdz)/.test(r)) return "good";
  return "muted";
}

// Czy ocena innej redakcji wyraźnie przeczy naszej (prawda ↔ fałsz)?
export function conflicts(ourTone, items) {
  if (ourTone !== "good" && ourTone !== "bad") return false;
  return items.some((it) => { const t = ratingTone(it.rating); return (ourTone === "good" && t === "bad") || (ourTone === "bad" && t === "good"); });
}
