// Sygnały oszustwa – lokalnie, bez modelu (0 tokenów). Typowe dla polskiego internetu: fałszywe „inwestycje” ze
// znanymi twarzami (reklama → podrobiony artykuł „Onetu” czy „TVN24”), „dopłata do paczki”, „zablokowane konto”.
// Dwie warstwy: adres (strona i linki z posta) oraz treść. Wynik to obserwacje z powodami, nie werdykt –
// model potwierdza je w ocenie całości (rodzaj treści „możliwe oszustwo”).

// Marki, pod które najczęściej podszywają się oszuści: oficjalne domeny i słowa, które zdradzają podróbkę w adresie.
export const BRANDS = [
  { name: "PKO BP", domains: ["pkobp.pl", "pko.pl", "ipko.pl"], tokens: ["pkobp", "ipko", "pko-bp", "pkobank"] },
  { name: "mBank", domains: ["mbank.pl", "mbank.com"], tokens: ["mbank"] },
  { name: "ING", domains: ["ing.pl", "ing.com"], tokens: ["ingbank", "ing-bank", "ingbankslaski", "mojeing", "moje-ing"] },
  { name: "Santander", domains: ["santander.pl", "santander.com"], tokens: ["santander"] },
  { name: "Pekao", domains: ["pekao.com.pl", "pekao24.pl", "pekaobh.pl"], tokens: ["pekao", "pekao24"] },
  { name: "Millennium", domains: ["bankmillennium.pl"], tokens: ["millennium", "bankmillennium", "millenet"] },
  { name: "Alior Bank", domains: ["aliorbank.pl"], tokens: ["aliorbank", "alior"] },
  { name: "Credit Agricole", domains: ["credit-agricole.pl"], tokens: ["creditagricole", "credit-agricole"] },
  { name: "BNP Paribas", domains: ["bnpparibas.pl", "bnpparibas.com"], tokens: ["bnpparibas", "bnp-paribas"] },
  { name: "BLIK", domains: ["blik.com"], tokens: ["blik"] },
  { name: "PayU", domains: ["payu.pl", "payu.com"], tokens: ["payu"] },
  { name: "Przelewy24", domains: ["przelewy24.pl"], tokens: ["przelewy24"] },
  { name: "PayPal", domains: ["paypal.com", "paypal.me"], tokens: ["paypal"] },
  { name: "Revolut", domains: ["revolut.com"], tokens: ["revolut"] },
  { name: "InPost", domains: ["inpost.pl", "inpost.eu"], tokens: ["inpost", "paczkomat", "paczkomaty"] },
  { name: "Poczta Polska", domains: ["poczta-polska.pl", "pocztex.pl", "envelo.pl"], tokens: ["pocztapolska", "poczta-polska", "pocztex"] },
  { name: "DPD", domains: ["dpd.com", "dpd.com.pl", "dpd.pl"], tokens: ["dpd"] },
  { name: "DHL", domains: ["dhl.com", "dhl.pl", "dhlparcel.pl"], tokens: ["dhl"] },
  { name: "Allegro", domains: ["allegro.pl", "allegro.com", "allegrolokalnie.pl"], tokens: ["allegro"] },
  { name: "OLX", domains: ["olx.pl", "olx.com"], tokens: ["olx"] },
  { name: "Vinted", domains: ["vinted.pl", "vinted.com"], tokens: ["vinted"] },
  { name: "gov.pl", domains: ["gov.pl"], tokens: ["mobywatel", "epuap", "gov-pl", "govpl", "podatki-gov", "e-urzad", "profil-zaufany", "profilzaufany"] },
  { name: "ZUS", domains: ["zus.pl"], tokens: ["zus"] },
  { name: "Netflix", domains: ["netflix.com"], tokens: ["netflix"] },
  { name: "Facebook", domains: ["facebook.com", "fb.com", "meta.com"], tokens: ["facebook", "meta-support", "metabusiness"] },
  { name: "Binance", domains: ["binance.com"], tokens: ["binance"] },
  { name: "Coinbase", domains: ["coinbase.com"], tokens: ["coinbase"] },
  { name: "Zonda", domains: ["zondacrypto.com", "zondaglobal.com"], tokens: ["zondacrypto"] },
  // media – w fałszywych artykułach o „inwestycji” ze znanymi twarzami
  { name: "Onet", media: true, domains: ["onet.pl"], tokens: ["onet"] },
  { name: "Wirtualna Polska", media: true, domains: ["wp.pl"], tokens: ["wirtualnapolska", "wiadomosci-wp", "wp-wiadomosci"] },
  { name: "Interia", media: true, domains: ["interia.pl"], tokens: ["interia"] },
  { name: "TVN24", media: true, domains: ["tvn24.pl", "tvn.pl"], tokens: ["tvn24", "tvn-24"] },
  { name: "Polsat News", media: true, domains: ["polsatnews.pl", "polsat.pl"], tokens: ["polsatnews", "polsat"] },
  { name: "Gazeta.pl", media: true, domains: ["gazeta.pl", "wyborcza.pl"], tokens: ["gazetapl"] },
  { name: "TVP Info", media: true, domains: ["tvp.info", "tvp.pl"], tokens: ["tvpinfo", "tvp-info"] },
  { name: "RMF24", media: true, domains: ["rmf24.pl", "rmf.fm"], tokens: ["rmf24"] },
  { name: "Business Insider", media: true, domains: ["businessinsider.com.pl", "businessinsider.com"], tokens: ["businessinsider"] },
  { name: "Forbes", media: true, domains: ["forbes.pl", "forbes.com"], tokens: ["forbes"] },
  { name: "Money.pl", media: true, domains: ["money.pl"], tokens: ["moneypl", "money-pl"] },
  { name: "Bankier", media: true, domains: ["bankier.pl"], tokens: ["bankier"] },
];
// Końcówki często używane w kampaniach (same w sobie nic nie znaczą – tylko wzmacniają inne sygnały).
const CHEAP_TLDS = new Set(["click", "top", "xyz", "icu", "online", "site", "live", "buzz", "monster", "rest", "cfd", "sbs", "shop", "fun", "pro", "life", "cyou", "quest", "bond", "lol", "today", "website", "space", "store"]);
const TWO_LEVEL = new Set(["com.pl", "net.pl", "org.pl", "gov.pl", "edu.pl", "info.pl", "biz.pl", "co.uk", "org.uk", "com.au", "co.jp"]);

const hostOf = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, "") : ""; } catch { return ""; } };
const isUnder = (host, d) => host === d || host.endsWith(`.${d}`);
// Domena „rejestrowana” (np. onet-wiadomosci.click, a z subdomeny: news.onet.pl → onet.pl).
export function baseDomain(host) {
  const p = host.split(".");
  if (p.length <= 2) return host;
  return TWO_LEVEL.has(p.slice(-2).join(".")) ? p.slice(-3).join(".") : p.slice(-2).join(".");
}
const labelOf = (host) => baseDomain(host).split(".")[0];
// Podmienione znaki: a11egro → allegro, rnbank → mbank, paypa1 → paypal.
const deglyph = (s) => s.replace(/rn/g, "m").replace(/vv/g, "w").replace(/0/g, "o").replace(/[1|]/g, "l").replace(/3/g, "e").replace(/5/g, "s").replace(/4/g, "a");
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

// Sygnały w jednym adresie. cert – funkcja (host) → wpis z Listy Ostrzeżeń albo "".
export function domainSignals(url, { cert = null, siteName = "" } = {}) {
  const host = hostOf(url);
  if (!host) return [];
  const out = [];
  const listed = cert ? cert(host) : "";
  if (listed) out.push({ kind: "cert", strong: true, host, entry: listed });
  const official = BRANDS.find((b) => b.domains.some((d) => isUnder(host, d)));
  if (!official) {
    const parts = host.split(/[.-]/);
    for (const b of BRANDS) {
      // marka w subdomenie innej domeny: allegro.pl.oferta-24.com
      const sub = b.domains.find((d) => host.includes(`${d}.`));
      if (sub) { out.push({ kind: "brandSub", strong: true, host, brand: b.name, official: b.domains[0] }); break; }
      // nazwa marki jako część adresu: tvn24-news.online, ipko-logowanie.com
      if (b.tokens.some((tk) => (tk.includes("-") ? host.includes(tk) : parts.includes(tk)))) { out.push({ kind: "brand", strong: true, host, brand: b.name, official: b.domains[0] }); break; }
      // podmienione znaki (a11egro.pl, rnbank.pl) – dla wszystkich marek; literówka (allegr.pl, paypai.com) – tylko
      // dla banków, płatności, kurierów i sklepów (media mają wiele podobnych, prawdziwych nazw: gazeta/gazety)
      const label = labelOf(host), ref = b.domains[0].split(".")[0];
      const typo = !b.media && ((ref.length >= 7 && lev(label, ref) <= 1) || (ref.length >= 10 && lev(label, ref) <= 2));
      if (ref.length >= 5 && label !== ref && (deglyph(label) === ref || typo)) {
        out.push({ kind: "lookalike", strong: true, host, brand: b.name, official: b.domains[0] });
        break;
      }
    }
  }
  // strona przedstawia się jako znana marka, a adres jest inny
  const site = String(siteName || "").trim().toLowerCase();
  if (site && !official) {
    const b = BRANDS.find((x) => x.name.toLowerCase() === site || x.domains.includes(site));
    if (b && !out.some((s) => s.brand === b.name)) out.push({ kind: "siteName", strong: true, host, brand: b.name, official: b.domains[0] });
  }
  if (host.split(".").some((l) => l.startsWith("xn--"))) out.push({ kind: "punycode", strong: false, host });
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) out.push({ kind: "ip", strong: false, host });
  else if (CHEAP_TLDS.has(host.split(".").pop()) && !official) out.push({ kind: "tld", strong: false, host });
  return out;
}

// Wzorce w treści (PL i EN). Każda kategoria liczy się raz; zwracamy dopasowany fragment jako dowód.
const PATTERNS = {
  profit: [
    /(zarabia\p{L}*|zarobi\p{L}*|zarobek|zysk\p{L}*|doch[oó]d\p{L}*|wypłac\p{L}*)[^.\n]{0,60}?\d[\d\s.,]*\s?(zł|pln|złotych|euro|eur|€|\$|usd|tys)\p{L}*\.?( (dziennie|miesięcznie|tygodniowo|na (dzień|miesiąc|tydzień)))?/iu,
    /(gwarantowan\p{L}* (zysk|zwrot|doch[oó]d)|bez (żadnego )?ryzyka|pasywn\p{L}* doch[oó]d|podwoi\p{L}* (pieniądze|kapitał|oszczędności)|zarabiaj (z|w) dom)/iu,
    /((earn|make|profit)\w*[^.\n]{0,60}?(\$|€|£|usd|eur)\s?\d|guaranteed (profits?|returns?)|risk[- ]free (investment|profit)|passive income)/i,
  ],
  invest: [
    /(platform\p{L}* (inwestycyjn|handlow|tradingow)|robot\p{L}* (inwestycyjn|handlow)|minimaln\p{L}* (wpłat|depozyt)|wpłat\p{L}* (minimaln|początkow)|inwestuj\p{L}* (już )?(od|tylko) \d)/iu,
    /(sztuczn\p{L}* inteligencj\p{L}*[^.\n]{0,40}(zarabia|handluj|inwestuj)|kryptowalut\p{L}*[^.\n]{0,40}(zarabia|zysk|inwestuj)|(quantum|immediate) (ai|edge|connect|matrix)|trading platform|investment platform|minimum deposit)/iu,
  ],
  secret: [
    /((ujawni|zdradzi|wyjawi)\p{L}* (swój |swoj |)?(sekret|spos[oó]b|metod)|(banki|rząd|politycy|elity) (są )?(wściekł|w szoku|chc\p{L}* to ukryć)|nie chc\p{L}*,? (żeby|abyś)\p{L}* (o tym )?wiedzia|(wywiad|program)\p{L}* (został\p{L}* )?(przerwan|usunięt|zdjęt)|skandal (na wizji|na antenie|w studiu))/iu,
    /(banks (hate|don't want)|they don't want you to know|this (one )?(simple )?trick|interview (was )?(cut|removed|banned))/i,
  ],
  urgency: [
    /(tylko (dziś|dzisiaj|do północy)|ostatni\p{L}* (szans|dzień|miejsc)|zostało (tylko |już tylko )?\d+ (miejsc|sztuk|wolnych)|oferta (wygasa|kończy się)|liczba miejsc (jest )?ograniczon|nie (czekaj|zwlekaj)|pośpiesz się|limited (time|spots)|act now|only \d+ spots? left)/iu,
  ],
  payment: [
    /(podaj\p{L}* (swoje )?(dane|numer (karty|konta))|zweryfikuj (swoje |)?(konto|tożsamość|dane)|dopłat\p{L}*[^.\n]{0,25}(przesyłk|paczk|cła|doręcz)|(konto|karta) (zostanie|zostało|została|zostaną) (zablokowan|zawieszon)|wpisz (kod|pin)|kod(em)? blik|verify your (account|identity)|your account (will be|has been) (suspended|locked)|confirm your (card|payment) details)/iu,
  ],
  contact: [
    /((whats ?app|telegram)[^.\n]{0,40}(napisz|skontaktuj|dołącz|grup|kontakt|join|message|contact)|(konsultant|doradca|opiekun|menedżer|manager)\p{L}* (finansow\p{L}* |inwestycyjn\p{L}* )?(zadzwoni|skontaktuje|oddzwoni)|zostaw (swój )?(numer|telefon)|(advisor|manager) will (call|contact) you)/iu,
  ],
  prize: [
    /(zostałeś (wybran|wylosowan)\p{L}*|wygrywasz|odbierz (swoją |)?(nagrodę|wygraną|prezent)|darmow\p{L}* (iphone|bon|voucher|kart\p{L}* podarunkow)|you('ve| have) (won|been selected)|claim your (prize|reward|gift))/iu,
  ],
};
export const SCAM_CATEGORIES = Object.keys(PATTERNS);
export function textSignals(text = "") {
  const t = String(text || "").replace(/\s+/g, " ");
  const out = [];
  for (const [kind, res] of Object.entries(PATTERNS)) {
    for (const re of res) {
      const m = t.match(re);
      if (m) {
        let end = m.index + m[0].length; // do końca słowa („platformie inwestycyjn” → „…inwestycyjnej”)
        while (end < t.length && /\p{L}/u.test(t[end]) && end - m.index < 90) end++;
        out.push({ kind, strong: false, quote: t.slice(m.index, end).trim().slice(0, 90) });
        break;
      }
    }
  }
  return out;
}

// Adresy wpisane w tekst („wejdź na zysk-dzis.online”) – też je sprawdzamy.
const URL_IN_TEXT = /\b(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:pl|com|net|org|eu|info|online|xyz|click|top|site|live|shop|store|pro|io|co|me|biz|icu|buzz|fun|life|cfd|sbs|bond|quest|cyou|rest|monster|lol|today|website|space))\b(\/[^\s"'<>)]*)?/gi;
export function urlsInText(text = "") {
  const out = new Set();
  for (const m of String(text).matchAll(URL_IN_TEXT)) {
    if (/@/.test(text.slice(Math.max(0, m.index - 1), m.index))) continue; // e-mail
    out.add(`https://${m[1].toLowerCase()}${m[2] || ""}`);
    if (out.size >= 10) break;
  }
  return [...out];
}

// Całość: strona, linki z posta, adresy w tekście i treść. trustedPage – znany serwis (np. media), wtedy sama treść
// nie wystarcza do ostrzeżenia (artykuł O oszustwach nie jest oszustwem).
export function scamSignals({ pageUrl = "", siteName = "", links = [], text = "", kind = "", trustedPage = false, cert = null } = {}) {
  const signals = [];
  const seen = new Set();
  const addDomain = (url, opts) => {
    for (const s of domainSignals(url, opts)) {
      const k = `${s.kind}|${s.host}`;
      if (seen.has(k)) continue;
      seen.add(k);
      signals.push({ ...s, where: opts.where });
    }
  };
  const social = /(^|\.)(facebook|instagram|x|twitter|tiktok|youtube|linkedin|reddit|threads)\.(com|net)$/.test(hostOf(pageUrl));
  if (pageUrl && !social) addDomain(pageUrl, { cert, siteName, where: "page" });
  // znany serwis: adresy wpisane w tekst to zwykle przykłady w artykule O oszustwach – pomijamy
  for (const u of [...links, ...(trustedPage ? [] : urlsInText(text))].slice(0, 20)) addDomain(u, { cert, where: "link" });
  const words = textSignals(text);
  signals.push(...words);
  // kolejność: najmocniejsze najpierw (Lista CERT, podróbka marki), potem treść, na końcu słabe sygnały adresu
  const rank = (s) => (s.kind === "cert" ? 0 : s.strong ? 1 : words.includes(s) ? 2 : 3);
  signals.sort((a, b) => rank(a) - rank(b));
  const strong = signals.filter((s) => s.strong).length;
  const weakDomain = signals.filter((s) => !s.strong && ["punycode", "ip", "tld"].includes(s.kind)).length;
  let level = "";
  if (strong) level = "high";
  else if (!trustedPage && (words.length >= 2 || (words.length >= 1 && weakDomain))) level = "medium";
  // jeden słaby sygnał (np. końcówka .online) sam nie ostrzega
  return level ? { level, signals } : { level: "", signals: [] };
}

// Krótki opis dla modelu (po angielsku, bez danych użytkownika – tylko adresy i wzorce).
export function scamHint(scam) {
  if (!scam?.level) return "";
  const parts = scam.signals.slice(0, 6).map((s) => {
    if (s.kind === "cert") return `${s.host} is on the CERT Polska warning list of malicious domains`;
    if (s.kind === "brandSub" || s.kind === "brand" || s.kind === "lookalike") return `${s.host} looks like an imitation of ${s.brand} (official: ${s.official})`;
    if (s.kind === "siteName") return `the page calls itself ${s.brand}, but its address is ${s.host}`;
    if (s.kind === "punycode") return `${s.host} uses characters from other alphabets`;
    if (s.kind === "ip") return `the address is a bare IP (${s.host})`;
    if (s.kind === "tld") return `${s.host} uses a domain ending often seen in scams`;
    return `${s.kind} wording: „${s.quote}”`;
  });
  return `Automatic scam signals (may be false positives): ${parts.join("; ")}.`;
}
