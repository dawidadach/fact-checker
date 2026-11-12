// Run: node --test tests/*.test.mjs
// 0.7.0: sygnały oszustwa (adres, treść) i Lista Ostrzeżeń CERT Polska – bez fałszywych alarmów na zwykłych stronach.
import test from "node:test";
import assert from "node:assert/strict";
import { baseDomain, domainSignals, scamHint, scamSignals, textSignals, urlsInText } from "../lib/scam.js";
import { lookup, prepare } from "../lib/certlist.js";
import { buildTextRequest } from "../lib/factcheck.js";
import { buildSummaryRequest, needsSummary } from "../lib/summary.js";
import { setLang } from "../lib/i18n.js";
import { scamLine, toMarkdown } from "../lib/history.js";
import { toReportHtml } from "../lib/report.js";

const kinds = (url, opts) => domainSignals(url, opts).map((s) => s.kind);

test("adres: podróbki marek", () => {
  assert.deepEqual(kinds("https://tvn24-news.online/wywiad"), ["brand", "tld"]);
  assert.deepEqual(kinds("https://ipko-logowanie.com/"), ["brand"]);
  assert.deepEqual(kinds("https://allegro.pl.oferta-24.com/x"), ["brandSub"]);
  assert.deepEqual(kinds("https://a11egro.pl/"), ["lookalike"]);
  assert.deepEqual(kinds("https://rnbank.pl/"), ["lookalike"]);
  assert.deepEqual(kinds("https://paypa1.com/"), ["lookalike"]);
  assert.deepEqual(kinds("https://revolutt.com/"), ["lookalike"]); // literówka – tylko banki, płatności, kurierzy, sklepy
  assert.deepEqual(kinds("https://inpost-doplata.click/"), ["brand", "tld"]);
  assert.deepEqual(kinds("https://mobywatel-weryfikacja.pl/"), ["brand"]);
  assert.deepEqual(kinds("https://xn--allgro-9ua.pl/"), ["punycode"]);
  assert.deepEqual(kinds("http://185.12.33.4/login"), ["ip"]);
  assert.equal(domainSignals("https://tvn24-news.online").find((s) => s.kind === "brand").official, "tvn24.pl");
});

test("adres: oficjalne i zwykłe domeny bez alarmu", () => {
  for (const u of ["https://www.onet.pl/x", "https://wiadomosci.onet.pl/x", "https://tvn24.pl/x", "https://allegro.pl/oferta/1", "https://www.mbank.pl", "https://podatki.gov.pl",
    "https://www.gov.pl/web/x", "https://polsatboxgo.pl", "https://monetize.com", "https://gazety.pl", "https://abank.pl", "https://www.forbes.pl/x",
    "https://pl.wikipedia.org/wiki/Onet", "https://inpost.pl/sledzenie", "https://stat.gov.pl", "https://example.com"]) {
    assert.deepEqual(kinds(u), [], u);
  }
  assert.deepEqual(kinds("notaurl"), []);
  assert.equal(baseDomain("news.onet.pl"), "onet.pl");
  assert.equal(baseDomain("a.b.pekao.com.pl"), "pekao.com.pl");
});

test("strona przedstawia się jako marka, a adres jest inny", () => {
  assert.deepEqual(kinds("https://wiadomosci-dnia.click/a", { siteName: "Onet" }), ["siteName", "tld"]);
  assert.deepEqual(kinds("https://www.onet.pl/a", { siteName: "Onet" }), []);
  assert.deepEqual(kinds("https://blog.example.com/a", { siteName: "blog.example.com" }), []);
});

test("treść: typowa reklama „inwestycji” vs zwykłe teksty", () => {
  const ad = "Znany prezenter ujawnił swój sekret! Zarabia 5000 zł dziennie dzięki platformie inwestycyjnej. Zostało tylko 7 miejsc – zostaw swój numer, konsultant zadzwoni.";
  assert.deepEqual(textSignals(ad).map((s) => s.kind), ["profit", "invest", "secret", "urgency", "contact"]);
  assert.match(textSignals(ad)[0].quote, /Zarabia 5000 zł/);
  assert.ok(textSignals("Twoja paczka czeka. Dopłata 1,99 zł do przesyłki – wpisz kod BLIK.").some((s) => s.kind === "payment"));
  assert.deepEqual(textSignals("Earn $500 a day with this investment platform – minimum deposit $250. Act now!").map((s) => s.kind), ["profit", "invest", "urgency"]);
  // zwykłe teksty: najwyżej jedna kategoria – bez ostrzeżenia
  for (const ok of [
    "Kurs bitcoina wzrósł wczoraj do 100 tys. dolarów, a analitycy spodziewają się dalszych wahań.",
    "Zarobiłem w tym roku 3000 zł na lokacie, ale inflacja zjadła większość.",
    "Przeciętne wynagrodzenie przekroczyło 9 tysięcy złotych brutto. Bezrobocie wynosi 2,9 procent.",
    "Policja ostrzega przed oszustami, którzy podszywają się pod znanych dziennikarzy.",
  ]) assert.ok(textSignals(ok).length <= 1, ok);
  assert.equal(scamSignals({ text: "Zarobiłem 3000 zł na lokacie.", kind: "post" }).level, "");
});

test("poziomy: adres = wysoki, sama treść = średni, znany serwis bez alarmu z samej treści", () => {
  const ad = "Ujawnił swój sekret: zarabia 5000 zł dziennie dzięki platformie inwestycyjnej. Zostało tylko 7 miejsc.";
  assert.equal(scamSignals({ text: ad, kind: "post", pageUrl: "https://www.facebook.com/x" }).level, "medium"); // strona serwisu społecznościowego się nie liczy
  const withLink = scamSignals({ text: ad, kind: "post", pageUrl: "https://www.facebook.com/x", links: ["https://tvn24-news.online/wywiad"] });
  assert.equal(withLink.level, "high");
  assert.equal(withLink.signals[0].where, "link");
  assert.equal(scamSignals({ text: ad, kind: "article", pageUrl: "https://tvn24.pl/biznes/oszusci", trustedPage: true }).level, ""); // artykuł O oszustwach
  assert.equal(scamSignals({ text: "Uważaj na adres pkobp-logowanie.click", kind: "article", pageUrl: "https://tvn24.pl/x", trustedPage: true }).level, ""); // przykład w artykule
  assert.equal(scamSignals({ text: "Wejdź na pkobp-logowanie.click i zaloguj się", kind: "post" }).level, "high"); // adres wpisany w post
  assert.equal(scamSignals({ text: "zwykły tekst", kind: "post", links: ["https://sklep.online/x"] }).level, ""); // sama końcówka nie ostrzega
  assert.deepEqual(urlsInText("Pisz: jan@firma.pl albo wejdź na zysk-dzis.online/start teraz"), ["https://zysk-dzis.online/start"]);
});

test("Lista Ostrzeżeń CERT: domena i subdomeny, nie domeny nadrzędne", () => {
  const list = prepare("zly-sklep.pl\nphish.example.com\n# komentarz\n\n");
  assert.equal(list.n, 2);
  assert.equal(lookup(list, "zly-sklep.pl"), "zly-sklep.pl");
  assert.equal(lookup(list, "www.zly-sklep.pl"), "zly-sklep.pl");
  assert.equal(lookup(list, "a.b.phish.example.com"), "phish.example.com");
  assert.equal(lookup(list, "example.com"), "");
  assert.equal(lookup(list, "dobry-zly-sklep.pl"), "");
  const cert = (h) => lookup(list, h);
  const r = scamSignals({ kind: "post", links: ["https://www.zly-sklep.pl/promo"], cert });
  assert.equal(r.level, "high");
  assert.equal(r.signals[0].kind, "cert");
});

test("model: krótka uwaga tylko przy sygnałach; ocena całości także przy jednym twierdzeniu", () => {
  const scam = scamSignals({ kind: "post", text: "Zarabia 5000 zł dziennie dzięki platformie inwestycyjnej", links: ["https://tvn24-news.online/x"] });
  const hint = scamHint(scam);
  assert.match(hint, /tvn24-news\.online looks like an imitation of TVN24 \(official: tvn24\.pl\)/);
  const on = buildTextRequest({ model: "m", today: "2026-11-12", webSearch: true, kind: "post", text: "x", meta: { scam: hint } });
  assert.match(on.input[0].content, /Automatic scam signals.*check whether they really said or endorsed it/s);
  const off = buildTextRequest({ model: "m", today: "2026-11-12", webSearch: true, kind: "post", text: "x", meta: {} });
  assert.doesNotMatch(off.input[0].content, /scam/i);
  assert.equal(scamHint(null), "");
  const one = [{ claim: "Prezenter poleca platformę", verdict: "falsz", confidence: "wysoka" }];
  assert.equal(needsSummary({ kind: "post" }, one), false);
  assert.equal(needsSummary({ kind: "post", scam }, one), true);
  const sb = buildSummaryRequest({ model: "m", claims: one, src: { kind: "post", scam } });
  assert.match(sb.input[0].content, /Automatic scam signals/);
  assert.match(sb.instructions, /choose genre mozliwe_oszustwo/);
});

test("raport i Markdown: ostrzeżenie z powodami", () => {
  setLang("pl");
  const scam = scamSignals({ kind: "post", text: "Zarabia 5000 zł dziennie dzięki platformie inwestycyjnej", links: ["https://tvn24-news.online/x"] });
  assert.equal(scamLine(scam.signals[0]), "Adres tvn24-news.online udaje TVN24 (oficjalnie: tvn24.pl). (link w poście)");
  const rec = { id: "x", startedAt: Date.parse("2026-11-12T10:00:00Z"), segments: [], claims: [], sources: [{ id: "s1", kind: "post", title: "Reklama", scam }] };
  assert.match(toMarkdown(rec), /> ⚠ \*\*Możliwe oszustwo\*\*\n> - Adres tvn24-news\.online udaje TVN24/);
  assert.match(toReportHtml(rec), /class="scam".*Możliwe oszustwo/s);
});
