// Run: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  anthropicStream, geminiStream, openRouterStream, pickAnthropicModels, pickGeminiModels, pickOpenRouterModels,
  splitInput, toAnthropicRequest, toGeminiRequest, toOpenRouterRequest,
} from "../lib/providers.js";
import { buildTextRequest, parseResult, unsupportedFeature } from "../lib/factcheck.js";

const IMG = "data:image/jpeg;base64,QUJD";
const body = buildTextRequest({ model: "m-1", today: "2026-11-11", webSearch: true, structured: false, kind: "post", meta: { author: "Jan" }, text: "Wisła jest najdłuższa.", images: [{ dataUrl: IMG }] });
const plain = buildTextRequest({ model: "m-1", today: "2026-11-11", webSearch: false, structured: false, kind: "post", meta: {}, text: "Ala ma kota." });
const JSON_OUT = JSON.stringify({ claims: [{ claim: "Wisła jest najdłuższą rzeką Europy", verdict: "falsz", quote: "Wisła jest najdłuższa" }] });

test("splitInput: tekst i obrazki z zapytania", () => {
  const { text, images } = splitInput(body);
  assert.match(text, /Wisła jest najdłuższa/);
  assert.deepEqual(images, [{ dataUrl: IMG, mime: "image/jpeg", data: "QUJD" }]);
  assert.deepEqual(splitInput(plain).images, []);
  assert.match(body.instructions, /Return ONLY a JSON object/); // bez parametru JSON – schemat w poleceniu
});

test("Claude: zapytanie (system, obrazek base64, wyszukiwanie) i strumień", () => {
  const r = toAnthropicRequest(body, "claude-sonnet-x");
  assert.equal(r.model, "claude-sonnet-x");
  assert.equal(r.system, body.instructions);
  assert.equal(r.messages[0].content[0].type, "text");
  assert.deepEqual(r.messages[0].content[1], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
  assert.equal(r.tools[0].type, "web_search_20250305");
  assert.equal(toAnthropicRequest(plain, "x").tools, undefined);

  const seen = [];
  const st = anthropicStream((e) => seen.push(e.type + (e.item ? `:${e.item.type}` : "")));
  for (const ev of [
    { type: "message_start" },
    { type: "content_block_start", content_block: { type: "server_tool_use", id: "s1", name: "web_search" } },
    { type: "content_block_start", content_block: { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://pl.wikipedia.org/wiki/Wołga", title: "Wołga" }] } },
    { type: "content_block_start", content_block: { type: "text" } },
    { type: "content_block_delta", delta: { type: "text_delta", text: JSON_OUT.slice(0, 20) } },
    { type: "content_block_delta", delta: { type: "citations_delta", citation: { url: "https://www.britannica.com/place/Volga-River", title: "Volga" } } },
    { type: "content_block_delta", delta: { type: "text_delta", text: JSON_OUT.slice(20) } },
    { type: "message_stop" },
  ]) st.handle(ev);
  const out = st.result();
  assert.equal(parseResult(out.text)[0].verdict, "falsz");
  assert.deepEqual(out.citations.map((c) => c.title), ["Wołga", "Volga"]);
  assert.ok(seen.includes("response.output_item.added:web_search_call"));
  assert.throws(() => st.handle({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }), /Overloaded/);
});

test("Gemini: zapytanie (systemInstruction, inlineData, googleSearch) i strumień", () => {
  const r = toGeminiRequest(body);
  assert.equal(r.systemInstruction.parts[0].text, body.instructions);
  assert.deepEqual(r.contents[0].parts[1], { inlineData: { mimeType: "image/jpeg", data: "QUJD" } });
  assert.deepEqual(r.tools, [{ googleSearch: {} }]);
  assert.equal(toGeminiRequest(plain).tools, undefined);

  const searches = [];
  const st = geminiStream((e) => e.item?.type === "web_search_call" && searches.push(e.item.id));
  st.handle({ candidates: [{ content: { parts: [{ text: "myślę…", thought: true }] } }] });
  st.handle({ candidates: [{ content: { parts: [{ text: JSON_OUT.slice(0, 30) }] }, groundingMetadata: { webSearchQueries: ["najdłuższa rzeka Europy"] } }] });
  st.handle({ candidates: [{ content: { parts: [{ text: JSON_OUT.slice(30) }] }, groundingMetadata: { webSearchQueries: ["najdłuższa rzeka Europy"], groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "wikipedia.org" } }] } }] });
  const out = st.result();
  assert.equal(out.text, JSON_OUT); // bez „myśli” modelu
  assert.deepEqual(searches, ["najdłuższa rzeka Europy"]);
  assert.equal(out.citations[0].title, "wikipedia.org");
  assert.throws(() => st.handle({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }), /Quota exceeded/);
});

test("OpenRouter: zapytanie (image_url, narzędzie wyszukiwania / zapasowy plugin) i strumień", () => {
  const r = toOpenRouterRequest(body);
  assert.equal(r.model, "m-1");
  assert.equal(r.messages[0].role, "system");
  assert.deepEqual(r.messages[1].content[1], { type: "image_url", image_url: { url: IMG } });
  assert.deepEqual(r.tools, [{ type: "openrouter:web_search" }]);
  assert.deepEqual(toOpenRouterRequest(body, { searchStyle: "plugin" }).plugins, [{ id: "web" }]);
  assert.equal(typeof toOpenRouterRequest(plain).messages[1].content, "string");

  const st = openRouterStream(null, { search: true });
  st.handle({ choices: [{ delta: { content: JSON_OUT.slice(0, 15) } }] });
  st.handle({ choices: [{ delta: { content: JSON_OUT.slice(15), annotations: [{ type: "url_citation", url_citation: { url: "https://stat.gov.pl/x", title: "GUS" } }] } }] });
  const out = st.result();
  assert.equal(out.text, JSON_OUT);
  assert.deepEqual(out.citations, [{ url: "https://stat.gov.pl/x", title: "GUS" }]);
});

test("listy modeli: polecany model pierwszy, filtry", () => {
  const g = pickGeminiModels({ models: [
    { name: "models/gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash-Lite", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview", supportedGenerationMethods: ["generateContent"] },
    { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-2.5-flash-preview-tts", supportedGenerationMethods: ["generateContent"] },
  ] });
  assert.equal(g[0].id, "gemini-2.5-flash");
  assert.ok(g[0].recommended);
  assert.ok(!g.some((m) => /embedding|tts/.test(m.id)));
  const a = pickAnthropicModels({ data: [{ id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" }, { id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" }, { id: "claude-opus-4-1", display_name: "Claude Opus 4.1" }] });
  assert.equal(a[0].id, "claude-sonnet-4-5");
  const o = pickOpenRouterModels({ data: [
    { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (free)", architecture: { input_modalities: ["text"], output_modalities: ["text"] }, pricing: { prompt: "0", completion: "0" } },
    { id: "google/gemini-2.5-flash", name: "Google: Gemini 2.5 Flash", architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, pricing: { prompt: "0.0000003", completion: "0.0000025" } },
    { id: "black-forest-labs/flux", name: "FLUX", architecture: { input_modalities: ["text"], output_modalities: ["image"] } },
  ] });
  assert.equal(o[0].id, "google/gemini-2.5-flash");
  assert.equal(o[0].images, true);
  assert.equal(o.find((m) => m.id.endsWith(":free")).free, true);
  assert.ok(!o.some((m) => m.id.includes("flux")));
});

test("rozpoznawanie: wyczerpane wyszukiwania Gemini / wyszukiwanie wyłączone w Claude → bez wyszukiwania", () => {
  assert.equal(unsupportedFeature({ code: "search_quota", status: 429 }), "webSearch");
  assert.equal(unsupportedFeature({ status: 400, message: "Claude: web search is not enabled for this organization" }), "webSearch");
  assert.equal(unsupportedFeature({ status: 429, message: "Gemini: quota" }), null);
});
