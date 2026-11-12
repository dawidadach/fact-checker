// Run: node --test tests/*.test.mjs
// „Kopiuj jako odpowiedź”: zapytanie do modelu, złożenie tekstu, licznik X, szablon bez AI.
import test from "node:test";
import assert from "node:assert/strict";
import { buildReplyRequest, composeReply, parseReply, replySources, templateReply, xLength, X_LIMIT } from "../lib/reply.js";

const CLAIM = {
  id: "k1", claim: "Ustawa pozwala blokować konto i działalność firmy za samą krytykę rządzących.", quote: "za krytykę rządu zablokują ci konto",
  verdict: "wprowadza_w_blad", confidence: "srednia",
  explanation: "Przepisy przewidują zamrażanie środków osób objętych sankcjami, ale krytyka rządzących nie jest podstawą ich zastosowania.",
  evidence: "Projekt po pracach komisji zawęża przesłankę informacyjną.", counter_evidence: "KRRiT zgłaszała obawy o nadużycia.",
  sources: [
    { title: "Przebieg procesu legislacyjnego – druk 3003", url: "https://www.sejm.gov.pl/Sejm10.nsf/PrzebiegProc.xsp?nr=3003" },
    { title: "Projekt ustawy o środkach ograniczających - Kancelaria Prezesa Rady Ministrów - Portal Gov.pl", url: "https://www.gov.pl/web/premier/projekt" },
  ],
  factchecks: [{ publisher: "Demagog", title: "Blokada kont za krytykę?", url: "https://demagog.org.pl/x", rating: "Manipulacja" }],
};
const CLAIM2 = { id: "k2", claim: "Projekt przyjęto bez konsultacji.", verdict: "falsz", confidence: "niska", explanation: "Konsultacje się odbyły.", sources: [{ title: "RCL", url: "https://legislacja.gov.pl/x" }] };

test("źródła: najpierw fact-checkerzy, bez powtórzeń", () => {
  const s = replySources([CLAIM, { ...CLAIM2, sources: [...CLAIM2.sources, CLAIM.sources[0]] }]);
  assert.deepEqual(s.map((x) => x.url), ["https://demagog.org.pl/x", CLAIM.sources[0].url, CLAIM.sources[1].url, "https://legislacja.gov.pl/x"]);
});

test("zapytanie: tylko fakty z werdyktu, bez wyszukiwania, ton, kontekst posta", () => {
  const { body, sources } = buildReplyRequest({ model: "m", claims: [CLAIM], post: { kind: "post", site: "facebook.com", text: "Ludzie, za krytykę rządu zablokują wam konta!!!" }, tone: "plain" });
  assert.equal(body.tools, undefined); // bez wyszukiwania
  assert.match(body.instructions, /ONLY the facts given/);
  assert.match(body.instructions, /never write labels like „Ocena:”/);
  assert.match(body.instructions, /No markdown/);
  assert.match(body.instructions, /matter-of-fact/);
  assert.match(body.instructions, /at most 3/);
  const input = body.input[0].content;
  assert.match(input, /a reply under a social media post \(facebook\.com\)/);
  assert.match(input, /zablokują wam konta/);
  assert.match(input, /Verdict: misleading \(confidence: medium\)/);
  assert.match(input, /1\. Demagog: Blokada kont za krytykę\? – https:\/\/demagog/);
  assert.equal(sources.length, 3);
  assert.equal(body.text.format.type, "json_schema");
  const x = buildReplyRequest({ model: "m", claims: [CLAIM, CLAIM2], tone: "x", structured: false });
  assert.match(x.body.instructions, /At most 200 characters/);
  assert.match(x.body.instructions, /ONE coherent comment/);
  assert.match(x.body.instructions, /Return ONLY a JSON object/);
  assert.equal(x.body.text, undefined);
  assert.match(x.body.input[0].content, /CLAIM 2: Projekt przyjęto/);
});

test("odpowiedź modelu: JSON z etykietami źródeł, czyszczenie linków i Markdown, zwykły tekst jako zapas", () => {
  const { sources } = buildReplyRequest({ model: "m", claims: [CLAIM], tone: "plain" });
  const raw = JSON.stringify({ reply: "Twierdzenie, że „za samą krytykę…”, jest moim zdaniem **mylące**. Więcej: https://x.example/a", sources: [{ n: 2, label: "Przebieg prac w Sejmie (druk 3003)" }, { n: 9, label: "nie ma" }, { n: 2, label: "dubel" }] });
  const p = parseReply(raw, sources);
  assert.equal(p.text, "Twierdzenie, że „za samą krytykę…”, jest moim zdaniem mylące. Więcej:");
  assert.deepEqual(p.picks, [{ url: CLAIM.sources[0].url, label: "Przebieg prac w Sejmie (druk 3003)" }]);
  assert.deepEqual(parseReply("Po prostu tekst.", sources), { text: "Po prostu tekst.", picks: [] });
});

test("złożony tekst: źródła jako zwykłe adresy, dopisek o AI, wersja pod X mieści się w 280", () => {
  const picks = [{ url: "https://a.pl/1", label: "Sejm" }, { url: "https://b.pl/2", label: "KRRiT" }, { url: "https://c.pl/3", label: "Rząd" }, { url: "https://d.pl/4", label: "Nadmiar" }];
  const plain = composeReply({ text: "Tekst.", picks, tone: "plain", lang: "pl" });
  assert.equal(plain, "Tekst.\n\nŹródła:\n- Sejm: https://a.pl/1\n- KRRiT: https://b.pl/2\n- Rząd: https://c.pl/3\n\nOpracowane z pomocą AI (Fact Checker), więc warto samemu zajrzeć do źródeł.");
  assert.doesNotMatch(plain, /\]\(/); // bez Markdown
  const casual = composeReply({ text: "Tekst.", picks: picks.slice(0, 1), tone: "casual", lang: "pl" });
  assert.equal(casual, "Tekst.\n\nŹródło: Sejm: https://a.pl/1\n\n(sprawdzone z pomocą AI – warto zajrzeć do źródeł)");
  const x = composeReply({ text: "To mylące: krytyka nie jest podstawą do blokady kont.", picks, tone: "x", lang: "pl" });
  assert.equal(x, "To mylące: krytyka nie jest podstawą do blokady kont. https://a.pl/1 (z pomocą AI)");
  assert.equal(xLength("abc https://bardzo-dlugi-adres.example/sciezka/do/strony?x=1"), 4 + 23);
  assert.ok(xLength(x) <= X_LIMIT);
  assert.match(composeReply({ text: "Text.", picks: [], tone: "plain", lang: "en" }), /Prepared with the help of AI/);
});

test("szablon bez AI: ludzkie sformułowania, niska pewność, cały post, X", () => {
  const one = templateReply([CLAIM], { tone: "plain", lang: "pl" });
  assert.match(one, /^Twierdzenie, że „Ustawa pozwala.*”, jest moim zdaniem mylące\. Przepisy przewidują/);
  assert.doesNotMatch(one, /Ocena:|pewność:/);
  assert.match(one, /Źródła:\n- Demagog: Blokada kont za krytykę\?: https:\/\/demagog/);
  assert.match(one, /- Projekt ustawy o środkach ograniczających: https:\/\/www\.gov\.pl/); // tytuł skrócony do pierwszego członu
  const all = templateReply([CLAIM, CLAIM2], { tone: "casual", lang: "pl" });
  assert.match(all, /jest nieprawdziwe \(choć nie ma tu pełnej pewności\)\. Konsultacje się odbyły\./);
  const x = templateReply([CLAIM, CLAIM2], { tone: "x", lang: "pl" });
  assert.ok(xLength(x) <= X_LIMIT, `${xLength(x)}: ${x}`);
  assert.match(x, /\(z pomocą AI\)$/);
  assert.match(templateReply([CLAIM2], { lang: "en" }), /^The claim that “Projekt przyjęto bez konsultacji\.” is not true \(though this is not certain\)\./);
});

test("oryginał: tekst werdyktu jak w panelu, bez przeróbek", async () => {
  const { originalReply } = await import("../lib/reply.js");
  const { setLang } = await import("../lib/i18n.js");
  setLang("pl");
  const one = originalReply([CLAIM]);
  assert.match(one, /^„Ustawa pozwala blokować konto i działalność firmy za samą krytykę rządzących\.”\nOcena: Wprowadza w błąd \(pewność: średnia\)\.\nPrzepisy przewidują/);
  assert.match(one, /Źródła:\n- Demagog: Blokada kont za krytykę\?: https:\/\/demagog\.org\.pl\/x\n- Przebieg procesu legislacyjnego: https:\/\/www\.sejm\.gov\.pl/);
  assert.match(one, /Opracowane z pomocą AI/);
  const all = originalReply([CLAIM, CLAIM2]);
  assert.match(all, /\n\n„Projekt przyjęto bez konsultacji\.”\nOcena: Fałsz \(pewność: niska\)\./);
  const withSum = originalReply([CLAIM, CLAIM2], { summary: { level: "wprowadza_w_blad", headline: "Post miesza fakty z nadinterpretacją." } });
  assert.match(withSum, /^Ocena całości: Wprowadza w błąd\. Post miesza fakty z nadinterpretacją\.\n\n„Ustawa pozwala/);
  assert.ok(withSum.endsWith(all.slice(all.indexOf("„Ustawa"))));
  assert.equal(originalReply([CLAIM], { summary: { level: "mieszany", headline: "" } }), one);
  setLang("en");
  assert.match(originalReply([CLAIM2]), /Assessment: False \(confidence: low\)\.[\s\S]*Source:\n- RCL: https:\/\/legislacja\.gov\.pl\/x[\s\S]*Prepared with the help of AI/);
  setLang("pl");
});
