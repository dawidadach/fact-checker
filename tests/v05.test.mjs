// Run: node --test tests/*.test.mjs
// Nowości 0.5.0: koszty, Google Fact Check, pamięć werdyktów, raport, oceny, daty, mówcy, tryby.
import test from "node:test";
import assert from "node:assert/strict";
import { addTo, emptyUsage, fmtUsd, localDay, modeOf, priceFor, usageCost } from "../lib/pricing.js";
import { conflicts, flattenClaims, pickFactChecks, queryFor, ratingTone, relevance, searchClaims, stems } from "../lib/factcheckapi.js";
import { blockDiff, dhashFromGray, fingerprintFromGray, hamming, imageDistance, LIMITS, normText, sameContent, sameImage, textHash } from "../lib/memory.js";
import { reportParts, toReportHtml } from "../lib/report.js";
import { ratedClaims, speakerText, toMarkdown } from "../lib/history.js";
import { buildInstructions, buildRequest, buildTextRequest, dateRule, effortRules, parseResult, SCHEMA, SCHEMA_IMG } from "../lib/factcheck.js";
import { anthropicStream, geminiStream, openRouterStream, toAnthropicRequest, toOpenRouterRequest } from "../lib/providers.js";
import { openaiUsage } from "../lib/llm.js";
import { setLang } from "../lib/i18n.js";

// ---------- koszty ----------
test("cennik: znane modele, własne ceny, plan ChatGPT, OpenRouter dokładnie", () => {
  assert.deepEqual([priceFor("apikey", "gpt-5-mini").in, priceFor("apikey", "gpt-5-mini").out], [0.25, 2]);
  assert.equal(priceFor("anthropic", "claude-haiku-4-5").in, 1);
  assert.equal(priceFor("anthropic", "claude-sonnet-4-5-20250929").out, 15);
  assert.equal(priceFor("gemini", "gemini-2.5-flash").in, 0.3);
  assert.equal(priceFor("gemini", "gemini-2.5-flash-lite").in, 0.1);
  assert.equal(priceFor("gemini", "gemini-2.5-flash").search, 0.035);
  assert.equal(priceFor("gemini", "gemini-3-flash").search, 0.014);
  const own = priceFor("anthropic", "claude-x", { in: "2", out: "8" });
  assert.deepEqual([own.in, own.out, own.custom], [2, 8, true]);
  // 1M wejścia + 100k wyjścia + 2 wyszukiwania (gpt-5-mini): 0,25 + 0,2 + 0,02
  assert.ok(Math.abs(usageCost("apikey", "gpt-5-mini", { input: 1e6, output: 1e5, searches: 2 }) - 0.47) < 1e-9);
  assert.equal(usageCost("chatgpt", "gpt-5", { input: 1e6, output: 1e6 }), 0);
  assert.equal(usageCost("openrouter", "x/y", { input: 5, output: 5, cost: 0.0123 }), 0.0123);
  assert.equal(usageCost("openrouter", "x/y", { input: 5, output: 5 }), null); // bez ceny
});

test("liczniki zużycia i formatowanie", () => {
  let u = addTo(emptyUsage(), { input: 100, output: 50, searches: 1 }, 0.01);
  u = addTo(u, { input: 10, output: 5 }, null);
  assert.deepEqual(u, { calls: 2, input: 110, output: 55, searches: 1, cost: 0.01, unknown: 1 });
  assert.equal(fmtUsd(0.0042, "pl"), "$0,0042");
  assert.equal(fmtUsd(0.0123, "pl"), "$0,012");
  assert.equal(fmtUsd(1.5, "en"), "$1.50");
  assert.match(localDay(new Date(2026, 10, 11, 23, 30)), /^2026-11-11$/);
  assert.equal(modeOf("eco").interval, 60);
  assert.equal(modeOf("???").interval, 30);
});

// ---------- Google Fact Check ----------
const API_JSON = {
  claims: [
    { text: "Polska ma najniższe bezrobocie w UE", claimant: "Polityk", claimReview: [
      { publisher: { name: "Demagog", site: "demagog.org.pl" }, url: "https://demagog.org.pl/wypowiedzi/bezrobocie", title: "Czy bezrobocie w Polsce jest najniższe w UE?", reviewDate: "2025-03-01T00:00:00Z", textualRating: "Prawda", languageCode: "pl" },
    ] },
    { text: "Szczepionki zawierają mikroczipy", claimReview: [
      { publisher: { name: "AFP Sprawdzam" }, url: "https://sprawdzam.afp.com/x", title: "Mikroczipy w szczepionkach? Nie", textualRating: "Fałsz", languageCode: "pl" },
    ] },
    { text: "brak recenzji", claimReview: [{ url: "javascript:alert(1)", textualRating: "False" }] },
  ],
};

test("Fact Check: spłaszczanie, dopasowanie, ton ocen, konflikt", async () => {
  const items = flattenClaims(API_JSON);
  assert.equal(items.length, 2); // niebezpieczny adres odrzucony
  assert.equal(items[0].publisher, "Demagog");
  assert.equal(items[1].site, "sprawdzam.afp.com");
  const claim = { claim: "Bezrobocie w Polsce jest najniższe w Unii Europejskiej", keywords: "bezrobocie Polska najniższe UE" };
  assert.ok(stems("bezrobociu Polsce").has("bezro"));
  assert.ok(relevance(claim, items[0]) > 0.5);
  assert.equal(relevance(claim, items[1]), 0);
  const picked = pickFactChecks(claim, items, { lang: "pl" });
  assert.equal(picked.length, 1);
  assert.equal(picked[0].url, "https://demagog.org.pl/wypowiedzi/bezrobocie");
  assert.equal(queryFor(claim), "bezrobocie Polska najniższe UE");
  assert.equal(queryFor({ claim: "W 2023 roku inflacja w Polsce wyniosła 18 procent" }), "2023 roku inflacja Polsce wyniosła 18 procent");
  for (const [txt, tone] of [["Fałsz", "bad"], ["Nieprawda", "bad"], ["False", "bad"], ["Manipulacja", "bad"], ["Prawda", "good"], ["Mostly True", "good"],
    ["Częściowa prawda", "warn"], ["Half True", "warn"], ["Mostly false", "bad"], ["Brak dowodów?", "muted"], ["", "muted"]]) {
    assert.equal(ratingTone(txt), tone, txt);
  }
  assert.equal(conflicts("good", [{ rating: "Fałsz" }]), true);
  assert.equal(conflicts("bad", [{ rating: "Fałsz" }]), false);
  assert.equal(conflicts("warn", [{ rating: "Prawda" }]), false);
  // zapytanie: hasło + klucz w adresie, błąd z komunikatem API
  let url = "";
  const ok = await searchClaims({ key: "K", query: "bezrobocie UE", fetchFn: async (u) => { url = u; return new Response(JSON.stringify(API_JSON)); } });
  assert.equal(ok.length, 2);
  assert.match(url, /claims:search\?query=bezrobocie\+UE&pageSize=10&key=K$/);
  await assert.rejects(searchClaims({ key: "bad", query: "x", fetchFn: async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }) }),
    (e) => e.status === 400 && /API key not valid/.test(e.message));
});

// ---------- pamięć werdyktów ----------
test("pamięć: ten sam tekst niezależnie od formatowania, odciski obrazków", async () => {
  assert.equal(normText("Wisła – jest NAJdłuższa!"), "wisłajestnajdłuższa");
  assert.equal(await textHash("Wisła jest najdłuższa"), await textHash("  wisła, jest   najdłuższa!! "));
  assert.notEqual(await textHash("Wisła jest najdłuższa"), await textHash("Odra jest najdłuższa"));
  assert.equal(await textHash(""), "");
  const gray = Array.from({ length: 72 }, (_, i) => (i * 37) % 255);
  const h = dhashFromGray(gray);
  assert.equal(h.length, 16);
  assert.equal(hamming(h, dhashFromGray(gray.map((v) => v + 3))), 0); // jaśniej o kilka punktów – ten sam obrazek
  assert.equal(hamming("ff00ff00ff00ff00", "ff00ff00ff00ff01"), 1);
  assert.equal(hamming("00", "0000"), 9999);
  // stare zapisy (sam dHash 64-bitowy): dopasowanie tylko przy bardzo małej różnicy
  const k = { text: "abc", images: ["ff00ff00ff00ff00"] };
  assert.equal(sameContent(k, { text: "abc", images: ["ff00ff00ff00ff03"] }), true); // 2 bity różnicy
  assert.equal(sameContent(k, { text: "abc", images: ["ff00ff00ff00ff0f"] }), false); // 4 bity
  assert.equal(sameContent(k, { text: "abd", images: ["ff00ff00ff00ff00"] }), false);
  assert.equal(sameContent(k, { text: "abc", images: [] }), false);
});

test("odcisk 128×128: ten sam obrazek z szumem pasuje, inny napis w jednym miejscu – nie", () => {
  // „zdjęcie”: gładki gradient + kilka plam
  const base = Array.from({ length: 128 * 128 }, (_, i) => { const x = i % 128, y = Math.floor(i / 128); return 60 + x * 0.8 + y * 0.5 + (((x >> 4) + (y >> 4)) % 2) * 40; });
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) - 0.5;
  const noisy = base.map((v) => v + rnd() * 10 + 4);          // inna kompresja / jasność
  const caption = base.map((v, i) => { const x = i % 128, y = Math.floor(i / 128); return y >= 100 && y < 116 && x >= 10 && x < 90 ? (x % 6 < 3 ? 250 : 20) : v; }); // napis
  const A = fingerprintFromGray(base), B = fingerprintFromGray(noisy), C = fingerprintFromGray(caption);
  assert.equal(A.w.length, 60); // 240 bitów
  assert.equal(imageDistance(A, B).same, true, JSON.stringify(imageDistance(A, B)));
  const dc = imageDistance(A, C);
  assert.equal(dc.same, false);
  assert.ok(dc.max > LIMITS.blockMax, JSON.stringify(dc));
  assert.ok(blockDiff(A.h, B.h).max < LIMITS.blockMax);
  // nowe odciski bez starego dHash nie pasują do starych zapisów
  assert.equal(sameImage(A, "ff00ff00ff00ff00"), false);
});

// ---------- prompt: słowa kluczowe, data, mówcy, tryby ----------
test("prompt: słowa kluczowe w schemacie, data nagrania, mówcy, tryb, limit wyszukiwań", () => {
  assert.ok(SCHEMA.properties.claims.items.required.includes("keywords"));
  assert.ok(SCHEMA_IMG.properties.claims.items.required.includes("keywords"));
  assert.match(dateRule({ today: "2026-11-11", recorded: "2023-02-10" }), /published on 2023-02-10.*as of 2023-02-10/);
  assert.match(dateRule({ today: "2026-11-11", live: true }), /live broadcast/);
  assert.match(dateRule({ today: "2026-11-11" }), /cannot tell when/);
  const ins = buildInstructions({ today: "2026-11-11", webSearch: true, mode: "eco", maxClaims: 3 });
  assert.match(ins, /\[Speaker: NAME\]/);
  assert.match(ins, /Economy mode.*At most 3 claims/);
  assert.match(ins, /api\.sejm\.gov\.pl/);
  assert.match(ins, /isap\.sejm\.gov\.pl/);
  assert.doesNotMatch(buildInstructions({ today: "2026-11-11", webSearch: false }), /api\.sejm\.gov\.pl/); // bez wyszukiwania nie ma sensu
  assert.equal(effortRules("normal", {}).length, 0);
  assert.match(effortRules("thorough", { webSearch: true }).join(" "), /two independent sources/);
  const body = buildRequest({ model: "m", today: "2026-11-11", webSearch: true, fresh: "x", maxSearches: 2 });
  assert.deepEqual(body._fc, { maxSearches: 2 });
  assert.equal(toAnthropicRequest(body, "claude").tools[0].max_uses, 2);
  const tbody = buildTextRequest({ model: "m", today: "2026-11-11", webSearch: false, kind: "post", text: "abc", meta: { masked: true, date: "2024-05-01" }, maxClaims: 4 });
  assert.match(tbody.input[0].content, /hidden by the user/);
  assert.match(tbody.input[0].content, /Published: 2024-05-01/);
  assert.match(tbody.instructions, /At most 4 claims/);
  const parsed = parseResult(JSON.stringify({ claims: [{ claim: "A", keywords: " Wisła długość ", verdict: "falsz", sources: [] }] }));
  assert.equal(parsed[0].keywords, "Wisła długość");
});

// ---------- zużycie z odpowiedzi dostawców ----------
test("zużycie tokenów: OpenAI, Claude, Gemini, OpenRouter", () => {
  assert.deepEqual(openaiUsage({ usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 40 } }, output: [{ type: "web_search_call" }, { type: "web_search_call" }, { type: "message" }] }),
    { input: 100, output: 20, cached: 40, searches: 2 });
  const a = anthropicStream();
  a.handle({ type: "message_start", message: { usage: { input_tokens: 50, cache_read_input_tokens: 10, output_tokens: 1 } } });
  a.handle({ type: "message_delta", usage: { output_tokens: 300, server_tool_use: { web_search_requests: 3 } } });
  assert.deepEqual(a.result().usage, { input: 60, output: 300, cached: 10, searches: 3 });
  const g = geminiStream();
  g.handle({ candidates: [{ content: { parts: [{ text: "x" }] }, groundingMetadata: { webSearchQueries: ["a", "b"] } }], usageMetadata: { promptTokenCount: 10 } });
  g.handle({ candidates: [{ content: { parts: [{ text: "y" }] } }], usageMetadata: { promptTokenCount: 70, candidatesTokenCount: 30, thoughtsTokenCount: 12 } });
  assert.deepEqual(g.result().usage, { input: 70, output: 42, cached: 0, searches: 2 });
  const o = openRouterStream(undefined, { search: true });
  o.handle({ choices: [{ delta: { content: "z" } }] });
  o.handle({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 4, cost: 0.0021 } });
  assert.deepEqual(o.result().usage, { input: 9, output: 4, cached: 0, searches: 1, cost: 0.0021 });
  assert.deepEqual(toOpenRouterRequest({ model: "m", instructions: "i", input: [{ content: "t" }] }).usage, { include: true });
});

// ---------- raport, oceny, mówcy ----------
const SESSION = {
  id: "s1", startedAt: Date.UTC(2026, 10, 11, 18, 0), model: "gpt-test",
  sources: [
    { id: "a", kind: "tab", title: "Debata <script>", url: "https://example.com/debata", at: Date.UTC(2026, 10, 11, 18, 0), date: "2023-02-10" },
    { id: "b", kind: "post", title: "Post", url: "javascript:alert(1)", text: "Wisła jest najdłuższą rzeką w Europie.", at: Date.UTC(2026, 10, 11, 18, 30), meta: { site: "x.com" } },
  ],
  claims: [
    { id: "1", srcId: "a", t: Date.UTC(2026, 10, 11, 18, 5), speaker: "Anna Nowak", quote: "inflacja to 18%", claim: "Inflacja wynosi 18%", verdict: "prawda", confidence: "wysoka", explanation: "W lutym 2023 tak.", sources: [{ title: "GUS", url: "https://stat.gov.pl" }], model: "gpt-test", provider: "apikey", mode: "normal",
      feedback: { rating: -1, comment: "dane nieaktualne", at: Date.UTC(2026, 10, 11, 19, 0) } },
    { id: "2", srcId: "a", t: Date.UTC(2026, 10, 11, 18, 6), speaker: "Jan Kowalski", claim: "Bezrobocie 2%", verdict: "falsz", confidence: "srednia", explanation: "<b>nie</b>", sources: [],
      factchecks: [{ publisher: "Demagog", url: "https://demagog.org.pl/x", title: "Bezrobocie", rating: "Prawda", date: "2025-01-01" }], fcConflict: true },
    { id: "3", srcId: "b", t: Date.UTC(2026, 10, 11, 18, 31), claim: "Wisła jest najdłuższa", verdict: "falsz", confidence: "wysoka", explanation: "Wołga.", sources: [], fromMemory: Date.UTC(2026, 10, 1),
      feedback: { rating: 1, comment: "", at: Date.UTC(2026, 10, 11, 19, 5) } },
  ],
  segments: [
    { t: Date.UTC(2026, 10, 11, 18, 1), text: "Dzień dobry.", srcId: "a" },
    { t: Date.UTC(2026, 10, 11, 18, 2), text: "Inflacja to 18%.", srcId: "a", speaker: "Anna Nowak" },
    { t: Date.UTC(2026, 10, 11, 18, 3), text: "Bezrobocie 2%.", srcId: "a", speaker: "Jan Kowalski" },
  ],
};

test("raport: podsumowanie, mówcy, escapowanie, bezpieczne linki", () => {
  setLang("pl");
  const html = toReportHtml(SESSION, { version: "0.5.0", generatedAt: Date.UTC(2026, 10, 11, 20, 0) });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Raport z fact-checkingu/);
  assert.match(html, /Anna Nowak/);
  assert.match(html, /Jan Kowalski/);
  assert.match(html, /Sprawdzali to też fact-checkerzy/);
  assert.match(html, /Redakcja fact-checkingowa oceniła to inaczej/);
  assert.match(html, /opublikowano: 2023-02-10/);
  assert.match(html, /Werdykt z pamięci/);
  assert.doesNotMatch(html, /<script>/); // tytuł z <script> jest escapowany
  assert.doesNotMatch(html, /<b>nie<\/b>/);
  assert.doesNotMatch(html, /href="javascript:/);
  const parts = reportParts(SESSION, { version: "0.5.0" });
  assert.match(parts.body, /<b>3<\/b>Twierdzenia/);
  assert.match(parts.body, /<b>2<\/b>Problematyczne/);
});

test("eksport ocen: tylko ocenione, z kontekstem; transkrypcja z mówcami", () => {
  const items = ratedClaims([SESSION]);
  assert.equal(items.length, 2);
  assert.equal(items[0].rating, "good"); // najnowsza ocena pierwsza
  const bad = items.find((x) => x.rating === "bad");
  assert.equal(bad.comment, "dane nieaktualne");
  assert.equal(bad.model, "gpt-test");
  assert.equal(bad.source.date, "2023-02-10");
  assert.match(bad.input_excerpt, /\[Anna Nowak\] Inflacja to 18%/);
  assert.match(bad.input_excerpt, /\[Jan Kowalski\] Bezrobocie/);
  assert.equal(items[0].input_excerpt, "Wisła jest najdłuższą rzeką w Europie.");
  assert.equal(items[0].from_memory, true);
  assert.equal(speakerText(SESSION.segments), "Dzień dobry.\n\nAnna Nowak: Inflacja to 18%.\n\nJan Kowalski: Bezrobocie 2%.");
  const md = toMarkdown(SESSION);
  assert.match(md, /Anna Nowak: Inflacja to 18%/);
  assert.match(md, /Sprawdzali to też fact-checkerzy/);
  assert.match(md, /Opublikowano: 2023-02-10|opublikowano: 2023-02-10|: 2023-02-10/);
});
