// Ikonka „sprawdź” przy tytułach artykułów (content/articles.js) – wspólne dla tła i panelu.
// Opcja domyślnie wyłączona. Trzy tryby:
//   off  – wyłączone,
//   list – na serwisach z listy poniżej (polskie i zagraniczne; każdy można odznaczyć) + dodane przez Ciebie,
//   all  – na wszystkich stronach z artykułami (jedna zgoda przeglądarki na wszystkie strony https).
// Skrypt ikonek sam niczego nie czyta i nie wysyła: rozpoznaje artykuł po budowie strony (znaczniki og:type,
// schema.org, nagłówek h1) i pokazuje ikonkę po najechaniu na tytuł. Artykuł pobiera dopiero kliknięcie.

import { VERDICTS } from "./factcheck.js";
import { LEVEL_TONE } from "./summary.js";

// Lista serwisów: największe portale, dzienniki, telewizje i radia, tygodniki opinii (różne strony sporu),
// serwisy gospodarcze, agencje. Wpis = domena (z subdomenami, np. wiadomosci.onet.pl) albo dokładny host
// (exact – gdy domena obejmuje dużo więcej niż serwis informacyjny, np. abcnews.go.com).
const PL = [
  // portale
  "onet.pl", "wp.pl", "interia.pl", "gazeta.pl", "o2.pl", "natemat.pl", "naszemiasto.pl",
  // telewizje i radia
  "tvn24.pl", "polsatnews.pl", "tvp.info", "tvrepublika.pl", "rmf24.pl", "radiozet.pl", "tokfm.pl", "polskieradio24.pl",
  // dzienniki
  "rp.pl", "wyborcza.pl", "wyborcza.biz", "fakt.pl", "se.pl", "dziennik.pl", "gazetaprawna.pl",
  // tygodniki i serwisy opinii
  "polityka.pl", "newsweek.pl", "wprost.pl", "dorzeczy.pl", "wpolityce.pl", "niezalezna.pl", "tygodnikpowszechny.pl",
  "gosc.pl", "oko.press", "krytykapolityczna.pl", "salon24.pl",
  // gospodarka
  "money.pl", "bankier.pl", "businessinsider.com.pl", "pb.pl", "parkiet.com", "forsal.pl", "infor.pl",
  // agencja
  "pap.pl",
];
const WORLD = [
  // USA
  "nytimes.com", "washingtonpost.com", "wsj.com", "usatoday.com", "cnn.com", "foxnews.com", "nbcnews.com", "cbsnews.com",
  { id: "abcnews.go.com", exact: true }, "npr.org", "apnews.com", "bloomberg.com", "cnbc.com", "politico.com", "axios.com",
  "nypost.com", "latimes.com", "theatlantic.com", "newsweek.com", "businessinsider.com", "huffpost.com", "breitbart.com",
  { id: "news.yahoo.com", exact: true },
  // Wielka Brytania
  "bbc.com", "bbc.co.uk", "theguardian.com", "reuters.com", "dailymail.co.uk", "independent.co.uk", "telegraph.co.uk",
  "thetimes.com", { id: "news.sky.com", exact: true }, "ft.com", "economist.com",
  // Europa i świat
  "politico.eu", "euronews.com", "dw.com", "france24.com", "aljazeera.com", "lemonde.fr", "lefigaro.fr", "spiegel.de",
  "zeit.de", "faz.net", "bild.de", "elpais.com", "kyivindependent.com",
];

const entry = (e, group) => {
  const { id, exact = false } = typeof e === "string" ? { id: e } : e;
  return { id, group, label: id, origins: [exact ? `https://${id}/*` : `https://*.${id}/*`] };
};
export const ARTICLE_SITES = [...PL.map((e) => entry(e, "pl")), ...WORLD.map((e) => entry(e, "world"))];
export const ARTICLE_GROUPS = ["pl", "world"];
const BY_ID = new Map(ARTICLE_SITES.map((s) => [s.id, s]));
export const articleSite = (id) => BY_ID.get(id) || null;

export const ARTICLE_SCRIPT_ID = "fc-article-buttons";
export const ARTICLE_SCRIPT_FILE = "content/articles.js";
export const ALL_ORIGINS = ["https://*/*"];
// Na Facebooku i X są ikonki przy postach; YouTube i Google to nie artykuły.
export const ARTICLE_EXCLUDE = [
  "https://*.facebook.com/*", "https://*.x.com/*", "https://*.twitter.com/*", "https://*.youtube.com/*", "https://*.google.com/*",
];
export const ARTICLE_MODES = ["off", "list", "all"];

// Ustawienia: articleButtons (off|list|all), articleSitesOff (odznaczone serwisy z listy – nowe serwisy
// z kolejnych wersji są więc od razu zaznaczone), articleCustom (hosty dodane przez Ciebie).
export function articleConfig(s = {}) {
  const mode = ARTICLE_MODES.includes(s?.articleButtons) ? s.articleButtons : "off";
  const off = new Set(Array.isArray(s?.articleSitesOff) ? s.articleSitesOff : []);
  const custom = [...new Set((Array.isArray(s?.articleCustom) ? s.articleCustom : []).map(cleanHost).filter(Boolean))];
  return { mode, off, custom, sites: ARTICLE_SITES.filter((x) => !off.has(x.id)).map((x) => x.id) };
}
// Host dodany ręcznie: bez www., małe litery; adres (https://…) też przejdzie.
export function cleanHost(h) {
  let s = String(h || "").trim().toLowerCase();
  if (/^[a-z]+:\/\//.test(s)) { try { s = new URL(s).hostname; } catch { return ""; } }
  s = s.replace(/^www\./, "").replace(/\/.*$/, "").replace(/\.$/, "");
  return /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(s) ? s : "";
}
// Serwis z listy, do którego należy host (wiadomosci.onet.pl → onet.pl), albo null.
export function siteOfHost(host) {
  const h = cleanHost(host);
  if (!h) return null;
  for (const s of ARTICLE_SITES) {
    const exact = !s.origins[0].includes("*.");
    if (exact ? h === s.id : h === s.id || h.endsWith(`.${s.id}`)) return s;
  }
  return null;
}
export const customOrigins = (host) => [`https://*.${host}/*`];
// Wzorce adresów (matches) dla włączonej konfiguracji – bez sprawdzania zgód.
export function wantedOrigins(cfg) {
  if (cfg.mode === "all") return [...ALL_ORIGINS];
  if (cfg.mode !== "list") return [];
  const out = [...cfg.sites.flatMap((id) => BY_ID.get(id)?.origins || []), ...cfg.custom.flatMap(customOrigins)];
  return [...new Set(out)];
}
// Czy wzorzec jest objęty zgodami przeglądarki (lista z chrome.permissions.getAll().origins).
export function covered(pattern, granted = []) {
  if (granted.includes(pattern) || granted.includes("<all_urls>") || granted.includes("*://*/*")) return true;
  if (pattern.startsWith("https://") && granted.includes("https://*/*")) return true;
  const host = pattern.replace(/^https:\/\//, "").replace(/\/\*$/, "");
  if (host.startsWith("*.")) return false;
  // dokładny host (abcnews.go.com) objęty zgodą na całą domenę (*.go.com)
  return granted.some((g) => {
    const m = /^https:\/\/\*\.([^/]+)\/\*$/.exec(g);
    return m && (host === m[1] || host.endsWith(`.${m[1]}`));
  });
}
// Czy adres strony pasuje do wzorca (https://*.onet.pl/*, https://abcnews.go.com/*, https://*/*).
export function urlMatches(pattern, url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const m = /^(https?|\*):\/\/([^/]+)\/(.*)$/.exec(pattern);
  if (!m) return pattern === "<all_urls>" && /^https?:$/.test(u.protocol);
  if (m[1] !== "*" && `${m[1]}:` !== u.protocol) return false;
  const host = m[2], h = u.hostname;
  if (host === "*") return true;
  if (host.startsWith("*.")) return h === host.slice(2) || h.endsWith(host.slice(1));
  return h === host;
}

// ---------- znaczek z oceną przy tytule ----------
// Adres artykułu do zapamiętania oceny: bez #, bez parametrów śledzących (utm_…, fbclid…), bez www. i końcowego /.
const TRACKING = /^(utm_.*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|_ga|_gl|ref|ref_src|ref_url|src|source|cmpid|ito|xtor|ocid|smid|at_.*|s_cid|ns_.*|share|via|amp)$/i;
export function articleKey(url) {
  let u;
  try { u = new URL(url); } catch { return ""; }
  if (!/^https?:$/.test(u.protocol)) return "";
  const q = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const path = u.pathname.replace(/\/+$/, "") || "/";
  return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path}${q.length ? `?${new URLSearchParams(q)}` : ""}`;
}
export const MARKS_KEY = "articleMarks";
export const MAX_MARKS = 1000;
// Dopisuje ocenę (pod adresem strony i adresem kanonicznym) i wyrzuca stare wpisy.
export function addMark(marks = {}, keys = [], mark, { maxAgeDays = 30, now = Date.now() } = {}) {
  const out = {};
  const fresh = now - maxAgeDays * 86_400_000;
  for (const [k, v] of Object.entries(marks || {})) if ((v?.at || 0) >= fresh) out[k] = v;
  for (const k of new Set(keys.filter(Boolean))) out[k] = mark;
  const all = Object.entries(out);
  if (all.length <= MAX_MARKS) return out;
  return Object.fromEntries(all.sort(([, a], [, b]) => (b.at || 0) - (a.at || 0)).slice(0, MAX_MARKS));
}
export function findMark(marks = {}, keys = [], { maxAgeDays = 30, now = Date.now() } = {}) {
  const fresh = now - maxAgeDays * 86_400_000;
  for (const k of keys) {
    const m = k && marks?.[k];
    if (m && (m.at || 0) >= fresh) return m;
  }
  return null;
}
// Napis i kolor znaczka: { level } – ocena całości; { verdict, n: 1 } – jedyne twierdzenie; { verdict, n > 1 } – kilka
// twierdzeń bez oceny całości (kolor najsłabszego); { n: 0 } – nic do sprawdzenia.
export function markView(m, t) {
  if (!m) return null;
  if (m.level) return { label: t(`level.${m.level}`), tone: LEVEL_TONE[m.level] || "muted" };
  const tone = VERDICTS[m.verdict]?.tone || "muted";
  if (m.verdict && (m.n || 1) <= 1) return { label: t(`verdict.${m.verdict}`), tone };
  if (m.verdict) return { label: t("art.claims", { n: m.n }), tone };
  return { label: t("art.none"), tone: "muted" };
}
