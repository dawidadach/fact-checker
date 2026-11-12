// Run: node --test tests/*.test.mjs
// 0.6.0: chwyty erystyczne, gatunek tekstu i brakująca strona, poziomy źródeł, „Sprawdź dokładniej”.
import test from "node:test";
import assert from "node:assert/strict";
import { buildRecheckRequest, buildRequest, buildTextRequest, contextAround, SCHEMA } from "../lib/factcheck.js";
import { parseTricks, TRICK_IDS, TRICKS, trickRules, tricksBySpeaker, withTricks } from "../lib/tricks.js";
import { sourceTier, tierCounts } from "../lib/sourcetier.js";
import { buildSummaryRequest, parseSummary, summaryKey } from "../lib/summary.js";
import { ratedClaims, toMarkdown } from "../lib/history.js";
import { toReportHtml } from "../lib/report.js";
import { setLang } from "../lib/i18n.js";

test("słownik chwytów: każdy ma nazwę, definicję i odpowiedź po polsku i angielsku", () => {
  assert.equal(TRICK_IDS.length, 15);
  for (const id of TRICK_IDS) {
    for (const k of ["name", "def", "answer"]) for (const l of ["pl", "en"]) assert.ok(TRICKS[id][k][l]?.length > 3, `${id}.${k}.${l}`);
    assert.ok(TRICKS[id].en);
  }
});

test("chwyty w zapytaniu: pole w schemacie i krótka instrukcja tylko gdy włączone", () => {
  const off = buildTextRequest({ model: "m", today: "2026-11-12", webSearch: true, kind: "article", text: "x" });
  const on = buildTextRequest({ model: "m", today: "2026-11-12", webSearch: true, kind: "article", text: "x", tricks: 3 });
  assert.deepEqual(off.text.format.schema.required, ["claims"]);
  assert.deepEqual(on.text.format.schema.required, ["claims", "techniques"]);
  assert.deepEqual(on.text.format.schema.properties.techniques.items.properties.id.enum, TRICK_IDS);
  assert.doesNotMatch(off.instructions, /techniques/);
  assert.match(on.instructions, /At most 3; empty array if none/);
  assert.match(on.instructions, /falszywy_dylemat = false dilemma/);
  const extra = on.instructions.length - off.instructions.length;
  assert.ok(extra < 1400, `instrukcja chwytów: ${extra} znaków`); // ok. 300 tokenów – definicji nie wysyłamy
  const img = buildTextRequest({ model: "m", today: "2026-11-12", webSearch: false, kind: "image", text: "", images: [{ dataUrl: "data:," }], tricks: 3 });
  assert.ok(img.text.format.schema.properties.images && img.text.format.schema.properties.techniques);
  const audio = buildRequest({ model: "m", today: "2026-11-12", webSearch: true, fresh: "abc", tricks: 2 });
  assert.match(audio.instructions, /the speaker actually USES in the NEW excerpt/);
  assert.match(audio.instructions, /At most 2/);
  assert.deepEqual(withTricks(SCHEMA).required, ["claims", "techniques"]);
  assert.deepEqual(SCHEMA.required, ["claims"]); // oryginał nietknięty
  assert.equal(trickRules({ outLang: "en" }).length, 4);
});

test("odczyt chwytów: znane id, cytat bez cudzysłowów, bez powtórek, limit", () => {
  const raw = JSON.stringify({ claims: [], techniques: [
    { id: "falszywy_dylemat", quote: "„Albo my, albo chaos”", speaker: "Jan", why: "Tylko dwie opcje ([link](https://x.pl))." },
    { id: "zmyslony", quote: "abc", speaker: "", why: "x" },
    { id: "ad_hominem", quote: "", speaker: "", why: "brak cytatu" },
    { id: "falszywy_dylemat", quote: "Albo my, albo chaos", speaker: "Jan", why: "powtórka" },
    { id: "straszenie", quote: "Nadchodzi katastrofa", speaker: "", why: "Strach zamiast argumentu." },
    { id: "my_oni", quote: "Oni chcą nam zabrać", speaker: "", why: "Podział." },
  ] });
  const out = parseTricks(raw, { max: 2 });
  assert.deepEqual(out.map((x) => x.trick), ["falszywy_dylemat", "straszenie"]);
  assert.equal(out[0].quote, "Albo my, albo chaos");
  assert.equal(out[0].why, "Tylko dwie opcje (link).");
  assert.deepEqual(parseTricks(raw, { seen: [{ trick: "falszywy_dylemat", quote: "albo my albo chaos" }] }).map((x) => x.trick), ["straszenie", "my_oni"]);
  assert.deepEqual(parseTricks("nie json"), []);
  assert.deepEqual(parseTricks(JSON.stringify({ claims: [] })), []);
  assert.deepEqual([...tricksBySpeaker([{ speaker: "A" }, { speaker: "A" }, { speaker: "" }])], [["A", 2], ["", 1]]);
});

test("poziom źródła po domenie (bez modelu)", () => {
  const cases = {
    "https://bdl.stat.gov.pl/bdl/dane": "dane", "https://www.nbp.pl/x": "dane", "https://ec.europa.eu/eurostat/web/x": "dane", "https://www.bls.gov/cpi/": "dane",
    "https://www.sejm.gov.pl/sejm10.nsf/x": "dokument", "https://isap.sejm.gov.pl/isap.nsf/x": "dokument", "https://eur-lex.europa.eu/x": "dokument",
    "https://pubmed.ncbi.nlm.nih.gov/123/": "nauka", "https://www.uj.edu.pl/x": "nauka",
    "https://www.gov.pl/web/zdrowie": "urzad", "https://ec.europa.eu/commission/x": "urzad", "https://www.whitehouse.gov/x": "urzad",
    "https://www.cbos.pl/x": "sondaz", "https://demagog.org.pl/x": "factcheck", "https://www.reuters.com/fact-check/x": "factcheck",
    "https://konkret24.tvn24.pl/x": "factcheck", "https://tvn24.pl/x": "media", "https://www.reuters.com/world/x": "media",
    "https://pl.wikipedia.org/wiki/X": "encyklopedia", "https://x.com/user/status/1": "social", "https://m.facebook.com/x": "social",
    "https://www.peacocktv.com/help": "", "notaurl": "", "javascript:alert(1)": "",
  };
  for (const [u, tier] of Object.entries(cases)) assert.equal(sourceTier(u), tier, u);
  assert.deepEqual(tierCounts([{ url: "https://stat.gov.pl/a" }, { url: "https://tvn24.pl/b" }, { url: "https://nbp.pl/c" }, { url: "https://abc.com" }]), { dane: 2, media: 1 });
});

test("ocena całości: gatunek, brakująca strona i chwyty na wejściu", () => {
  const claims = [{ claim: "A", verdict: "falsz", confidence: "wysoka" }, { claim: "B", verdict: "prawda", confidence: "wysoka" }];
  const body = buildSummaryRequest({ model: "m", claims, src: { kind: "article", tricks: [{ trick: "falszywy_dylemat", quote: "albo my, albo oni", speaker: "Jan" }] } });
  assert.match(body.instructions, /genre – what kind of content this is: wiadomosc = news report/);
  assert.match(body.instructions, /missing_side: one short point/);
  assert.match(body.input[0].content, /RHETORICAL TRICKS FOUND:\n- false dilemma: „albo my, albo oni” \(Jan\)/);
  const s = parseSummary(JSON.stringify({ main: [2], genre: "opinia_jako_wiadomosc", level: "rzetelny", headline: "Teza się zgadza.", ok: [], wrong: ["A"], context: [], missing_side: "Brak stanowiska drugiej strony." }), claims);
  assert.equal(s.genre, "opinia_jako_wiadomosc");
  assert.equal(s.side, "Brak stanowiska drugiej strony.");
  assert.equal(s.level, "drobne_bledy");
  assert.equal(parseSummary(JSON.stringify({ main: [], genre: "propaganda", level: "mieszany", headline: "X", ok: [], wrong: [], context: [], missing_side: "" }), claims).genre, "");
});

test("„Sprawdź dokładniej”: jedno twierdzenie, tryb dokładny, zarzut jako wskazówka, kontekst wokół cytatu", () => {
  const text = `${"a".repeat(800)} Bezrobocie wynosi 2,9 procent według GUS. ${"b".repeat(800)}`;
  const claim = { claim: "Bezrobocie wynosi 2,9%", quote: "Bezrobocie wynosi 2,9 procent", speaker: "Jan", verdict: "falsz", confidence: "wysoka", explanation: "Wg Eurostatu 3,1%." };
  const body = buildRecheckRequest({ model: "m", today: "2026-11-12", webSearch: true, outLang: "pl", claim, src: { kind: "article", title: "Rynek pracy", text, meta: { site: "pap.pl" }, date: "2026-11-10" }, note: "GUS podaje 2,9% – to inna metoda" });
  assert.deepEqual(body.tools, [{ type: "web_search" }]);
  assert.equal(body._fc.maxSearches, 8);
  assert.match(body.instructions, /Re-check ONE claim from scratch/);
  assert.match(body.instructions, /do not change it only because the reader objects/);
  assert.match(body.instructions, /Thorough mode/);
  assert.match(body.instructions, /as of 2026-11-10/);
  const input = body.input[0].content;
  assert.match(input, /CLAIM TO RE-CHECK: Bezrobocie wynosi 2,9%/);
  assert.match(input, /EARLIER VERDICT: false/);
  assert.match(input, /READER'S OBJECTION: GUS podaje 2,9% – to inna metoda/);
  assert.match(input, /CONTEXT AROUND THE QUOTE:\n"""\n…a+ Bezrobocie wynosi 2,9 procent według GUS\. b+…/);
  assert.ok(input.length < 2400);
  assert.match(buildRecheckRequest({ model: "m", today: "2026-11-12", webSearch: false, claim, src: { kind: "tab" } }).input[0].content, /READER'S OBJECTION: \(none given/);
  assert.equal(contextAround("abc", "zzz"), "");
  assert.equal(contextAround("", "a"), "");
});

test("eksport ocen: ocena sprzed „Sprawdź dokładniej” dotyczy poprzedniego werdyktu", () => {
  const base = { id: "k1", srcId: "s1", t: 1000, claim: "Nowe", quote: "q", verdict: "polprawda", confidence: "wysoka", explanation: "Nowe wyjaśnienie", provider: "gemini", model: "g", mode: "thorough",
    recheck: { at: 5000, provider: "gemini", model: "g", prev: { verdict: "falsz", confidence: "srednia", claim: "Stare", explanation: "Stare wyjaśnienie", provider: "apikey", model: "gpt", mode: "normal" } } };
  const rec = (fb) => ({ id: "x", startedAt: 1, sources: [{ id: "s1", kind: "article", text: "t" }], claims: [{ ...base, feedback: fb }] });
  const [before] = ratedClaims([rec({ rating: -1, comment: "źle", at: 4000 })]);
  assert.equal(before.verdict, "falsz");
  assert.equal(before.model, "gpt");
  assert.deepEqual([before.recheck.verdict_before, before.recheck.verdict_after], ["falsz", "polprawda"]);
  const [after] = ratedClaims([rec({ rating: 1, comment: "", at: 6000 })]);
  assert.equal(after.verdict, "polprawda");
  assert.equal(after.model, "g");
});

test("raport i Markdown: chwyty, licznik przy mówcy, poziom źródła, gatunek", () => {
  setLang("pl");
  const claims = [
    { id: "c1", srcId: "s1", t: 1, claim: "A", verdict: "falsz", confidence: "wysoka", explanation: "e", speaker: "Jan", sources: [{ title: "GUS", url: "https://stat.gov.pl/x" }] },
    { id: "c2", srcId: "s1", t: 2, claim: "B", verdict: "prawda", confidence: "wysoka", explanation: "e", speaker: "Ewa", sources: [] },
  ];
  const summary = { key: summaryKey(claims), level: "mieszany", genre: "opinia_jako_wiadomosc", side: "Brak głosu ekonomistów.", headline: "H", ok: [], wrong: [], context: [] };
  const rec = { id: "x", startedAt: Date.parse("2026-11-12T09:00:00Z"), segments: [], claims,
    sources: [{ id: "s1", kind: "tab", title: "Debata", summary, tricks: [{ trick: "ad_hominem", quote: "On kłamie zawsze", speaker: "Jan", why: "Atak na osobę." }, { trick: "straszenie", quote: "Będzie katastrofa", speaker: "Jan", why: "Strach." }] }] };
  const html = toReportHtml(rec);
  assert.match(html, /Chwyty erystyczne \(2\)/);
  assert.match(html, /Atak na osobę/);
  assert.match(html, /<th>Chwyty<\/th>/);
  assert.match(html, /<td>Jan<\/td><td>1<\/td><td>0<\/td><td>1<\/td><td>2<\/td>/);
  assert.match(html, /<span class="tier">dane<\/span>/);
  assert.match(html, /Opinia podana jako wiadomość/);
  assert.match(html, /⚖<\/b> Brak głosu ekonomistów\./);
  const md = toMarkdown(rec);
  assert.match(md, /\*\*Ocena całości: Mieszany\*\* \(Opinia podana jako wiadomość\) – H/);
  assert.match(md, /- ⚖ Brak głosu ekonomistów\./);
  assert.match(md, /\*\*🎭 Chwyty erystyczne \(2\)\*\*\n\n- \*\*Atak na osobę\*\* \(Jan\): „On kłamie zawsze” – Atak na osobę\./);
  const noTricks = toReportHtml({ ...rec, sources: [{ ...rec.sources[0], tricks: [] }] });
  assert.doesNotMatch(noTricks, /<th>Chwyty<\/th>/);
});
