// Run: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, fileName, lastActivity, sourceTitle, matchesQuery, normalizeSession, sessionIcon, sessionTitle, toMarkdown, verdictCounts, wordCount } from "../lib/history.js";
import { setLang } from "../lib/i18n.js";

const T0 = new Date(2026, 10, 10, 18, 5).getTime();
const session = {
  id: "x", startedAt: T0,
  sources: [
    { id: "a", kind: "post", title: "Zbigniew: Wisła jest najdłuższa…", url: "https://facebook.com/p/1", meta: { author: "Zbigniew" }, text: "Wisła jest najdłuższą rzeką w Europie.", at: T0 },
    { id: "b", kind: "article", title: "Rynek pracy | Gazeta", url: "https://gazeta.pl/a", meta: { site: "Gazeta", date: "2026-11-05" }, text: "Bezrobocie wynosi 2,9 procent.", at: T0 + 60_000 },
    { id: "c", kind: "tab", title: "Debata TVP", url: "https://youtube.com/watch?v=x", at: T0 + 120_000 },
  ],
  claims: [
    { srcId: "a", verdict: "falsz", claim: "Wisła jest najdłuższą rzeką Europy", quote: "Wisła jest najdłuższą rzeką w Europie", t: T0 + 10_000, sources: [] },
    { srcId: "b", verdict: "prawda", claim: "Bezrobocie 2,9%", quote: "Bezrobocie wynosi 2,9 procent", speaker: "", t: T0 + 70_000, sources: [{ url: "https://stat.gov.pl", title: "GUS" }] },
  ],
  segments: [{ t: T0 + 130_000, text: "Szanowni Państwo, kara od 3 do 20 lat", checked: true, srcId: "c" }],
};

test("sesja z wieloma źródłami: tytuł, ikona, wyszukiwanie, ostatnia aktywność", () => {
  setLang("pl");
  assert.equal(sessionTitle(session), "Zbigniew: Wisła jest najdłuższa… (+2)");
  assert.equal(sessionIcon(session), "🗂️");
  assert.equal(sessionIcon({ sources: [session.sources[1]] }), "📄");
  assert.ok(matchesQuery(session, "gazeta bezrobocie"));
  assert.ok(matchesQuery(session, "zbigniew"));
  assert.ok(!matchesQuery(session, "szczepionki"));
  assert.equal(lastActivity(session), T0 + 130_000);
  assert.deepEqual(verdictCounts(session.claims), { falsz: 1, prawda: 1 });
  assert.equal(wordCount(session.segments), 8);
});

test("toMarkdown: sekcja na każde źródło z werdyktami i tekstem", () => {
  setLang("pl");
  const md = toMarkdown(session);
  const iPost = md.indexOf("## 💬 [Zbigniew"), iArt = md.indexOf("## 📄 [Rynek pracy"), iTab = md.indexOf("## 🔊 [Debata TVP]");
  assert.ok(iPost > 0 && iArt > iPost && iTab > iArt);
  assert.match(md, /### Fałsz: „Wisła jest najdłuższą rzeką Europy”/);
  assert.match(md, /- \[GUS\]\(https:\/\/stat\.gov\.pl\)/);
  assert.match(md, /#### Sprawdzany tekst\n\nBezrobocie wynosi 2,9 procent\./);
  assert.match(md, /#### Transkrypcja\n\nSzanowni Państwo, kara od 3 do 20 lat/);
  assert.match(md, /Gazeta · Opublikowano: 2026-11-05/);
});

test("stare sesje (jedno źródło) są czytane po nowemu", () => {
  const old = { id: "o", title: "Rynek pracy", url: "https://g.pl/a", source: "page", startedAt: T0,
    page: { kind: "article", meta: { site: "G" }, tabId: 5, captureId: "c1", pageUrl: "https://g.pl/a" },
    claims: [{ verdict: "prawda", claim: "x", t: T0 }], segments: [{ t: T0, text: "Akapit 1", checked: true }, { t: T0, text: "Akapit 2", checked: true }] };
  const n = normalizeSession(old);
  assert.equal(n.sources.length, 1);
  assert.equal(n.sources[0].kind, "article");
  assert.equal(n.sources[0].text, "Akapit 1\n\nAkapit 2");
  assert.equal(n.claims[0].srcId, "s0");
  assert.deepEqual(n.segments, []);
  assert.equal(sessionTitle(n), "Rynek pracy");
  const oldTab = normalizeSession({ id: "t", title: "Wideo", source: "tab", startedAt: T0, claims: [], segments: [{ t: T0, text: "a b", checked: true }] });
  assert.equal(oldTab.segments[0].srcId, "s0");
  assert.equal(sessionIcon(oldTab), "🔊");
  assert.equal(normalizeSession(n), n); // nowy format bez zmian
});

test("fileName: data i bezpieczny tytuł (także dla starych sesji)", () => {
  assert.equal(fileName({ startedAt: T0, sources: [{ kind: "article", title: "Rynek pracy | Gazeta Łódzka" }] }), "fact-check-2026-11-10-1805-Rynek-pracy-Gazeta-Lodzka.md");
  setLang("pl");
  assert.match(fileName({ source: "mic", startedAt: T0, segments: [{ t: T0, text: "a" }] }), /^fact-check-2026-11-10-1805-Mikrofon\.md$/);
});

test("mikrofon zawsze jako „Mikrofon”, tytuły bez licznika powiadomień", () => {
  setLang("pl");
  assert.equal(sourceTitle({ kind: "mic", title: "(1) krzysztof brejza - wyniki wyszukiwania | Facebook" }), "Mikrofon");
  const legacy = normalizeSession({ id: "m", source: "mic", title: "(1) krzysztof brejza | Facebook", url: "https://facebook.com/x", startedAt: T0, claims: [{ verdict: "prawda", claim: "x", t: T0 }], segments: [] });
  assert.equal(legacy.sources[0].title, "");
  assert.equal(sessionTitle(legacy), "Mikrofon");
  assert.equal(cleanTitle("(12+) Z NERCHIEM MAMY INNE PODEJŚCIE - YouTube"), "Z NERCHIEM MAMY INNE PODEJŚCIE - YouTube");
  assert.equal(sourceTitle({ kind: "tab", title: "(3) Debata - YouTube" }), "Debata - YouTube");
});
