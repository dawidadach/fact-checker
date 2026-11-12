// Run: node --test tests/*.test.mjs
// „Ocena całości”: kiedy jest, zapytanie, odczyt odpowiedzi, poziom pilnowany przez werdykty głównej tezy.
import test from "node:test";
import assert from "node:assert/strict";
import { buildSummaryRequest, guardLevel, LEVELS, needsSummary, parseSummary, severityRank, summaryKey, validSummary } from "../lib/summary.js";
import { buildReplyRequest } from "../lib/reply.js";
import { setLang } from "../lib/i18n.js";
import { summaryLines, toMarkdown } from "../lib/history.js";
import { toReportHtml } from "../lib/report.js";

const c = (verdict, claim, extra = {}) => ({ claim, verdict, confidence: "wysoka", explanation: `${claim} – wyjaśnienie.`, sources: [], ...extra });
// Artykuł z AP: teza prawdziwa, fałszywy szczegół (pakiet Disney+).
const AP = [
  c("prawda", "CPI w USA wzrósł w październiku o 0,4% m/m"),
  c("raczej_prawda", "Pakiet Apple TV i Peacock podrożał z 14,99 do 17,99 dolara"),
  c("falsz", "Disney podniósł cenę pakietu Disney+ i Hulu z 11,99 do 12,49 dolara"),
  c("prawda", "PKB rósł w III kwartale w tempie 3,4% rocznie"),
];
// Post z X: prawdziwa liczba, fałszywy wniosek.
const POST = [c("wprowadza_w_blad", "Wisconsin ma 7 mln zarejestrowanych wyborców przy 4 mln obywateli w wieku wyborczym, co dowodzi oszustw")];

test("kiedy podsumowanie: od 2 twierdzeń albo twierdzenie + uwagi do obrazka; nigdy dla dźwięku", () => {
  assert.equal(needsSummary({ kind: "article" }, AP), true);
  assert.equal(needsSummary({ kind: "post" }, POST), false); // jedna karta = już jest podsumowaniem
  assert.equal(needsSummary({ kind: "post", imageNotes: [{ index: 1, notes: "Nagranie z 2022 r." }] }, POST), true);
  assert.equal(needsSummary({ kind: "post", imageNotes: [{ index: 1, notes: "" }] }, POST), false);
  assert.equal(needsSummary({ kind: "tab" }, AP), false);
  assert.equal(needsSummary({ kind: "mic" }, AP), false);
  assert.equal(needsSummary({ kind: "article" }, []), false);
});

test("odcisk werdyktów: niezależny od kolejności i id, zmienia się z werdyktem", () => {
  const a = summaryKey(AP);
  assert.equal(summaryKey([...AP].reverse().map((x, i) => ({ ...x, id: `z${i}` }))), a);
  assert.notEqual(summaryKey(AP.map((x, i) => (i === 2 ? { ...x, verdict: "prawda" } : x))), a);
  assert.notEqual(summaryKey(AP.slice(1)), a);
  const src = { summary: { key: a, headline: "Teza się zgadza." } };
  assert.ok(validSummary(src, AP));
  assert.equal(validSummary(src, AP.slice(1)), null); // stare podsumowanie po zmianie werdyktów
});

test("zapytanie: bez wyszukiwania, tylko werdykty, poziomy po wadze, tekst tylko do tezy", () => {
  const body = buildSummaryRequest({
    model: "m", lang: "pl", claims: AP,
    src: { kind: "article", title: "Inflacja wyższa od oczekiwań", text: "WASHINGTON (AP) — U.S. inflation was higher than expected", meta: { site: "AP News" }, date: "2026-11-10" },
  });
  assert.equal(body.tools, undefined);
  assert.equal(body.text.format.name, "summary");
  assert.deepEqual(body.text.format.schema.required, ["main", "genre", "level", "headline", "ok", "wrong", "context", "missing_side"]); // teza i gatunek przed poziomem
  assert.match(body.instructions, /Use ONLY the verdicts/);
  assert.match(body.instructions, /weigh the claims by importance, not by count/);
  assert.match(body.instructions, /Write in Polish/);
  assert.match(body.instructions, /A false detail in an otherwise accurate piece is drobne_bledy/);
  const input = body.input[0].content;
  assert.match(input, /WHAT: a news article/);
  assert.match(input, /SITE: AP News/);
  assert.match(input, /TEXT \(only to identify the main message\)/);
  assert.match(input, /3\. Disney podniósł/);
  assert.match(input, /Verdict: false \(confidence: high\)/);
  const plain = buildSummaryRequest({ model: "m", lang: "en", claims: POST, structured: false, src: { kind: "post", imageNotes: [{ index: 1, type: "zrzut_ekranu", topic: "Przesłuchanie w Wisconsin", notes: "Nagranie z 9 lutego 2022" }] } });
  assert.equal(plain.text, undefined);
  assert.match(plain.instructions, /Return ONLY a JSON object/);
  assert.match(plain.instructions, /Write in English/);
  assert.match(plain.input[0].content, /Image 1 \(zrzut_ekranu\): Przesłuchanie w Wisconsin\n {2}Notes: Nagranie z 9 lutego 2022/);
});

test("poziom: fałsz w szczególe → drobne błędy, fałsz w tezie → co najmniej wprowadza w błąd", () => {
  assert.equal(guardLevel("rzetelny", AP, [1]), "drobne_bledy");           // model za łagodny – szczegół podnosi do drobnych błędów
  assert.equal(guardLevel("drobne_bledy", AP, [1]), "drobne_bledy");
  assert.equal(guardLevel("drobne_bledy", AP, [3]), "wprowadza_w_blad");   // fałszywa teza nie może być „drobnym błędem”
  assert.equal(guardLevel("nierzetelny", AP, [3]), "nierzetelny");          // surowiej – wolno
  assert.equal(guardLevel("rzetelny", AP, []), "wprowadza_w_blad");        // bez wskazanej tezy – ostrożnie
  const half = [c("polprawda", "A"), c("prawda", "B")];
  assert.equal(guardLevel("rzetelny", half, [1]), "mieszany");
  assert.equal(guardLevel("rzetelny", half, [2]), "drobne_bledy");
});

test("poziom: same prawdy → najwyżej mieszany; nic sprawdzalnego → nie do oceny", () => {
  const ok = [c("prawda", "A"), c("raczej_prawda", "B")];
  assert.equal(guardLevel("rzetelny", ok, [1]), "rzetelny");
  assert.equal(guardLevel("nierzetelny", ok, [1]), "mieszany");
  assert.equal(guardLevel("wprowadza_w_blad", ok, [1], [{ index: 1, notes: "Zdjęcie z 2019 r." }]), "wprowadza_w_blad"); // stare zdjęcie jako nowe
  const muted = [c("nieweryfikowalne", "A"), c("satyra", "B")];
  assert.equal(guardLevel("rzetelny", muted, [1]), "nie_do_oceny");
  assert.equal(guardLevel("nie_do_oceny", ok, []), "nie_do_oceny");
  assert.equal(guardLevel("nie_do_oceny", AP, [1]), "drobne_bledy"); // błąd jest – „nie do oceny” nie może go ukryć
  assert.equal(guardLevel("cos_innego", AP, [1]), "drobne_bledy");
});

test("odczyt odpowiedzi: JSON w ```, czyszczenie, limity punktów, zły JSON → null", () => {
  const raw = "```json\n" + JSON.stringify({
    main: [1, 9], level: "rzetelny",
    headline: "Główna teza się zgadza: **inflacja** była wyższa od oczekiwań ([BLS](https://www.bls.gov/cpi)).",
    ok: ["- Dane CPI", "PKB 3,4%", "Inflacja bazowa", "czwarty punkt"], wrong: ["Disney: ceny osobnych usług, nie pakietu"], context: [],
  }) + "\n```";
  const s = parseSummary(raw, AP);
  assert.equal(s.modelLevel, "rzetelny");
  assert.equal(s.level, "drobne_bledy");
  assert.deepEqual(s.main, [1]); // 9 – poza listą
  assert.equal(s.headline, "Główna teza się zgadza: inflacja była wyższa od oczekiwań."); // link w nawiasie znika w całości
  assert.deepEqual(s.ok, ["Dane CPI", "PKB 3,4%", "Inflacja bazowa"]);
  assert.deepEqual(s.context, []);
  assert.equal(parseSummary("nie wiem", AP), null);
  assert.equal(parseSummary(JSON.stringify({ level: "rzetelny", headline: "" }), AP), null);
});

test("kolejność kart: najpierw problemy, potem prawda", () => {
  const sorted = ["prawda", "falsz", "nieweryfikowalne", "polprawda", "raczej_prawda", "wprowadza_w_blad"].sort((a, b) => severityRank(a) - severityRank(b));
  assert.deepEqual(sorted, ["falsz", "wprowadza_w_blad", "polprawda", "nieweryfikowalne", "raczej_prawda", "prawda"]);
  assert.equal(LEVELS.length, 5);
});

test("odpowiedź na cały post dostaje ocenę całości", () => {
  const sum = { level: "drobne_bledy", headline: "Główna teza się zgadza." };
  const { body } = buildReplyRequest({ model: "m", claims: AP, post: { kind: "article" }, summary: sum });
  assert.match(body.input[0].content, /OVERALL ASSESSMENT \(from the verdicts\): reliable with minor errors – Główna teza się zgadza\./);
  assert.match(body.instructions, /follow its emphasis/);
  const single = buildReplyRequest({ model: "m", claims: POST, post: { kind: "post" } });
  assert.doesNotMatch(single.body.input[0].content, /OVERALL ASSESSMENT/);
});

test("eksport i raport: ocena całości przed werdyktami, tylko aktualna", () => {
  setLang("pl");
  const claims = AP.map((x, i) => ({ ...x, id: `c${i}`, srcId: "s1", t: 1 }));
  const summary = { key: summaryKey(claims), level: "drobne_bledy", headline: "Główna teza się zgadza.", ok: ["Dane CPI"], wrong: ["Pakiet Disney+"], context: [] };
  const rec = { id: "x", startedAt: Date.parse("2026-11-12T09:00:00Z"), sources: [{ id: "s1", kind: "article", title: "AP", summary }], claims, segments: [] };
  const md = toMarkdown(rec);
  assert.match(md, /\*\*Ocena całości: Rzetelny, z drobnymi błędami\*\* – Główna teza się zgadza\.\n\n- ✓ Dane CPI\n- ✗ Pakiet Disney\+/);
  assert.ok(md.indexOf("Ocena całości") < md.indexOf("CPI w USA wzrósł"));
  assert.deepEqual(summaryLines(null), []);
  const html = toReportHtml(rec);
  assert.match(html, /class="sum"/);
  assert.match(html, /Rzetelny, z drobnymi błędami/);
  const stale = { ...rec, sources: [{ ...rec.sources[0], summary: { ...summary, key: "inny" } }] };
  assert.doesNotMatch(toMarkdown(stale), /Ocena całości/);
  assert.doesNotMatch(toReportHtml(stale), /class="sum"/);
});
