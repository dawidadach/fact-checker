// Dostawcy modeli do fact-checkingu.
// Prompt, reguły i schemat powstają w lib/factcheck.js w formacie OpenAI Responses (instructions + input + tools).
// Adapter tłumaczy go na API dostawcy i zwraca { text, citations } – tak jak OpenAI – więc reszta wtyczki
// (karty, obrazki, kolejka, historia) działa z każdym dostawcą bez zmian.
// Zdarzenia strumienia tłumaczymy na zdarzenia w stylu OpenAI (response.created, web_search_call,
// output_text.delta), żeby pasek „Szukam w sieci… / Werdykty: 2…” działał wszędzie.

import { ApiError, guarded, listModels as openaiListModels, readSSE, streamResponse } from "./llm.js";

export const PROVIDERS = {
  chatgpt: { name: "ChatGPT", structured: true, search: true, images: true },
  apikey: { name: "OpenAI", structured: true, search: true, images: true, keyUrl: "https://platform.openai.com/api-keys" },
  gemini: { name: "Gemini", structured: false, search: true, images: true, keyUrl: "https://aistudio.google.com/apikey" },
  anthropic: { name: "Claude", structured: false, search: true, images: true, keyUrl: "https://console.anthropic.com/settings/keys" },
  openrouter: { name: "OpenRouter", structured: false, search: true, images: null, keyUrl: "https://openrouter.ai/settings/keys" },
};
export const KEY_PROVIDERS = ["gemini", "anthropic", "openrouter"];
export const providerName = (p) => PROVIDERS[p]?.name || p;

const ANTHROPIC = "https://api.anthropic.com/v1";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER = "https://openrouter.ai/api/v1";

// ---------- wspólne: rozbiór zapytania z factcheck.js ----------
export function splitInput(body) {
  const content = body.input?.[0]?.content;
  if (typeof content === "string") return { text: content, images: [] };
  const text = (content || []).filter((x) => x.type === "input_text").map((x) => x.text).join("\n\n");
  const images = (content || []).filter((x) => x.type === "input_image").map((x) => {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(x.image_url || "");
    return { dataUrl: x.image_url, mime: m?.[1] || "image/jpeg", data: m?.[2] || "" };
  });
  return { text, images };
}
const wantsSearch = (body) => !!body.tools?.some((x) => x.type === "web_search");

function citationsCollector() {
  const list = [];
  const add = (url, title) => {
    if (!/^https?:\/\//.test(url || "") || list.some((x) => x.url === url)) return;
    let host = url;
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* zostaw adres */ }
    list.push({ url, title: title || host });
  };
  return { list, add };
}

async function httpError(r, provider) {
  let j = {};
  try { j = await r.json(); } catch { /* brak JSON */ }
  const e = j.error || {};
  const message = e.message || (typeof j.error === "string" ? j.error : "") || `HTTP ${r.status}`;
  // Anthropic: {error:{type}}, Gemini: {error:{status:"RESOURCE_EXHAUSTED"}}, OpenRouter: {error:{code}}
  const code = e.type || e.status || (typeof e.code === "string" ? e.code : "") || "";
  return new ApiError(`${providerName(provider)}: ${message}`, { status: r.status, code, param: e.param });
}

// ---------- Anthropic (Claude) ----------
export function toAnthropicRequest(body, model) {
  const { text, images } = splitInput(body);
  const req = {
    model,
    max_tokens: 8192,
    system: body.instructions,
    stream: true,
    messages: [{
      role: "user",
      content: [{ type: "text", text }, ...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mime, data: im.data } }))],
    }],
  };
  if (wantsSearch(body)) req.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: body._fc?.maxSearches || 5 }];
  return req;
}
export function anthropicStream(onEvent) {
  const cites = citationsCollector();
  const usage = { input: 0, output: 0, cached: 0, searches: 0 };
  let text = "";
  const take = (u = {}) => {
    if (u.input_tokens != null) usage.input = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    if (u.cache_read_input_tokens != null) usage.cached = u.cache_read_input_tokens || 0;
    if (u.output_tokens != null) usage.output = u.output_tokens;
    if (u.server_tool_use?.web_search_requests != null) usage.searches = u.server_tool_use.web_search_requests;
  };
  const handle = (ev) => {
    if (ev.type === "message_start") { take(ev.message?.usage); onEvent?.({ type: "response.created" }); }
    else if (ev.type === "message_delta") take(ev.usage);
    else if (ev.type === "content_block_start") {
      const b = ev.content_block || {};
      if (b.type === "server_tool_use") onEvent?.({ type: "response.output_item.added", item: { type: "web_search_call", id: b.id } });
      else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) b.content.forEach((x) => cites.add(x.url, x.title));
      else if (b.type === "thinking") onEvent?.({ type: "response.in_progress" });
    } else if (ev.type === "content_block_delta") {
      const d = ev.delta || {};
      if (d.type === "text_delta") { text += d.text; onEvent?.({ type: "response.output_text.delta", delta: d.text }); }
      else if (d.type === "citations_delta") cites.add(d.citation?.url, d.citation?.title);
    } else if (ev.type === "error") {
      throw new ApiError(`Claude: ${ev.error?.message || "stream error"}`, { code: ev.error?.type, status: ev.error?.type === "overloaded_error" ? 529 : undefined });
    }
  };
  return { handle, result: () => ({ text, citations: cites.list, usage }) };
}
async function anthropicCall({ key, body, signal, kick, onEvent }) {
  const r = await fetch(`${ANTHROPIC}/messages`, {
    method: "POST",
    headers: anthropicHeaders(key),
    body: JSON.stringify(toAnthropicRequest(body, body.model)),
    signal,
  });
  kick();
  if (!r.ok) throw await httpError(r, "anthropic");
  const st = anthropicStream(onEvent);
  await readSSE(r, kick, st.handle);
  return st.result();
}
const anthropicHeaders = (key) => ({
  "x-api-key": key,
  "anthropic-version": "2023-06-01",
  "content-type": "application/json",
  "anthropic-dangerous-direct-browser-access": "true", // wywołanie prosto z przeglądarki (klucz zostaje u użytkownika)
});

// ---------- Google Gemini ----------
export function toGeminiRequest(body) {
  const { text, images } = splitInput(body);
  const req = {
    systemInstruction: { parts: [{ text: body.instructions }] },
    contents: [{ role: "user", parts: [{ text }, ...images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } }))] }],
  };
  if (wantsSearch(body)) req.tools = [{ googleSearch: {} }];
  return req;
}
export function geminiStream(onEvent) {
  const cites = citationsCollector();
  const queries = new Set();
  const usage = { input: 0, output: 0, cached: 0, searches: 0 };
  let text = "", started = false;
  const handle = (ev) => {
    if (ev.error) throw new ApiError(`Gemini: ${ev.error.message || "stream error"}`, { status: ev.error.code, code: ev.error.status });
    if (!started) { started = true; onEvent?.({ type: "response.created" }); }
    const um = ev.usageMetadata;
    if (um) {
      usage.input = um.promptTokenCount || 0;
      usage.cached = um.cachedContentTokenCount || 0;
      usage.output = (um.candidatesTokenCount || 0) + (um.thoughtsTokenCount || 0); // „myślenie” płatne jak wyjście
    }
    if (ev.promptFeedback?.blockReason) throw new ApiError(`Gemini: blocked (${ev.promptFeedback.blockReason})`, { code: "blocked" });
    const c = ev.candidates?.[0];
    if (!c) return;
    const gm = c.groundingMetadata;
    for (const q of gm?.webSearchQueries || []) {
      if (queries.has(q)) continue;
      queries.add(q);
      onEvent?.({ type: "response.output_item.added", item: { type: "web_search_call", id: q } });
    }
    for (const ch of gm?.groundingChunks || []) cites.add(ch.web?.uri, ch.web?.title);
    for (const part of c.content?.parts || []) {
      if (part.thought) { onEvent?.({ type: "response.in_progress" }); continue; }
      if (part.text) { text += part.text; onEvent?.({ type: "response.output_text.delta", delta: part.text }); }
    }
  };
  return { handle, result: () => ({ text, citations: cites.list, usage: { ...usage, searches: queries.size } }) };
}
async function geminiCall({ key, body, signal, kick, onEvent }) {
  const search = wantsSearch(body);
  const r = await fetch(`${GEMINI}/models/${encodeURIComponent(body.model)}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify(toGeminiRequest(body)),
    signal,
  });
  kick();
  if (!r.ok) {
    const e = await httpError(r, "gemini");
    // wyczerpana darmowa pula wyszukiwań Google → wtyczka ponowi bez wyszukiwania
    if (r.status === 429 && search && /search|grounding/i.test(e.message)) e.code = "search_quota";
    throw e;
  }
  const st = geminiStream(onEvent);
  await readSSE(r, kick, st.handle);
  return st.result();
}

// ---------- OpenRouter (zgodne z OpenAI Chat Completions) ----------
export function toOpenRouterRequest(body, { searchStyle = "tool" } = {}) {
  const { text, images } = splitInput(body);
  const content = images.length ? [{ type: "text", text }, ...images.map((im) => ({ type: "image_url", image_url: { url: im.dataUrl } }))] : text;
  // usage.include: w ostatnim fragmencie strumienia OpenRouter podaje dokładny koszt zapytania
  const req = { model: body.model, stream: true, usage: { include: true }, messages: [{ role: "system", content: body.instructions }, { role: "user", content }] };
  if (wantsSearch(body)) {
    if (searchStyle === "tool") req.tools = [{ type: "openrouter:web_search" }];
    else req.plugins = [{ id: "web" }]; // starszy sposób – zapas, gdyby narzędzie nie przeszło
  }
  return req;
}
export function openRouterStream(onEvent, { search = false } = {}) {
  const cites = citationsCollector();
  let text = "", started = false;
  const usage = { input: 0, output: 0, cached: 0, searches: search ? 1 : 0 };
  const handle = (ev) => {
    if (ev.usage) {
      usage.input = ev.usage.prompt_tokens || 0;
      usage.output = ev.usage.completion_tokens || 0;
      usage.cached = ev.usage.prompt_tokens_details?.cached_tokens || 0;
      if (typeof ev.usage.cost === "number") usage.cost = ev.usage.cost; // dokładny koszt (USD), z wyszukiwaniem
    }
    if (ev.error) throw new ApiError(`OpenRouter: ${ev.error.message || "stream error"}`, { code: ev.error.code, status: typeof ev.error.code === "number" ? ev.error.code : undefined });
    if (!started) {
      started = true;
      onEvent?.({ type: "response.created" });
      if (search) onEvent?.({ type: "response.output_item.added", item: { type: "web_search_call", id: "openrouter" } });
    }
    const d = ev.choices?.[0]?.delta || ev.choices?.[0]?.message || {};
    for (const a of d.annotations || []) if (a.type === "url_citation") cites.add(a.url_citation?.url || a.url, a.url_citation?.title || a.title);
    if (d.content) { text += d.content; onEvent?.({ type: "response.output_text.delta", delta: d.content }); }
  };
  return { handle, result: () => ({ text, citations: cites.list, usage }) };
}
async function openRouterCall({ key, body, signal, kick, onEvent }) {
  const search = wantsSearch(body);
  const send = (style) => fetch(`${OPENROUTER}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(key),
    body: JSON.stringify(toOpenRouterRequest(body, { searchStyle: style })),
    signal,
  });
  let r = await send("tool");
  kick();
  if (!r.ok && search && r.status === 400) { r = await send("plugin"); kick(); }
  if (!r.ok) throw await httpError(r, "openrouter");
  const st = openRouterStream(onEvent, { search });
  await readSSE(r, kick, st.handle);
  return st.result();
}
const openRouterHeaders = (key) => ({
  Authorization: `Bearer ${key}`,
  "content-type": "application/json",
  "HTTP-Referer": "https://github.com/dawidadach/fact-checker",
  "X-Title": "Fact Checker",
});

// ---------- wywołanie ----------
export async function callModel({ provider, key, body, signal, onEvent, timeoutMs, idleMs }) {
  if (provider === "chatgpt" || provider === "apikey") return streamResponse({ token: key, body, signal, onEvent, timeoutMs, idleMs });
  const fn = { gemini: geminiCall, anthropic: anthropicCall, openrouter: openRouterCall }[provider];
  if (!fn) throw new Error(`Unknown provider: ${provider}`);
  return guarded({ signal, timeoutMs, idleMs }, ({ signal: sig, kick }) => fn({ key, body, signal: sig, kick, onEvent }));
}

// ---------- listy modeli (polecany model jest pierwszy) ----------
const byPreference = (prefs) => (a, b) => {
  const rank = (m) => { const i = prefs.findIndex((p) => p.test(m.id)); return i < 0 ? prefs.length : i; };
  return rank(a) - rank(b);
};
const markFirst = (list) => list.map((m, i) => ({ ...m, recommended: i === 0 }));

export function pickGeminiModels(json) {
  const list = (json.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => ({ id: String(m.name || "").replace(/^models\//, ""), name: m.displayName || m.name }))
    .filter((m) => /^gemini/.test(m.id) && !/(embedding|aqa|imagen|tts|image|live|audio|robotics|computer-use|learnlm|gemma)/.test(m.id))
    .sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
  // polecany: najnowszy stabilny „flash” (szybki, z wyszukiwaniem Google), potem pro
  return markFirst(list.sort(byPreference([/^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash(?!-lite)/, /^gemini-[\d.]+-pro$/, /^gemini/])));
}
export function pickAnthropicModels(json) {
  const list = (json.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  return markFirst(list.sort(byPreference([/sonnet/, /opus/, /haiku/, /./])));
}
export function pickOpenRouterModels(json) {
  const list = (json.data || [])
    .filter((m) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes("text"))
    .map((m) => {
      const images = (m.architecture?.input_modalities || []).includes("image");
      const free = /:free$/.test(m.id) || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0);
      return { id: m.id, name: m.name || m.id, images, free };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return markFirst(list.sort(byPreference([/^google\/gemini-[\d.]+-flash$/, /^anthropic\/claude-sonnet/, /^openai\/gpt-[\d.]+-mini$/, /^google\/gemini/, /^anthropic\//, /^openai\//])));
}

export async function listProviderModels(provider, key) {
  if (provider === "chatgpt" || provider === "apikey") return markFirst(await openaiListModels(key));
  if (provider === "gemini") {
    const r = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
    if (!r.ok) throw await httpError(r, provider);
    return pickGeminiModels(await r.json());
  }
  if (provider === "anthropic") {
    const r = await fetch(`${ANTHROPIC}/models?limit=100`, { headers: anthropicHeaders(key) });
    if (!r.ok) throw await httpError(r, provider);
    return pickAnthropicModels(await r.json());
  }
  if (provider === "openrouter") {
    // lista modeli jest publiczna – klucz sprawdzamy osobno, żeby błędny klucz wyszedł od razu
    const k = await fetch(`${OPENROUTER}/key`, { headers: openRouterHeaders(key) });
    if (!k.ok) throw await httpError(k, provider);
    const r = await fetch(`${OPENROUTER}/models`);
    if (!r.ok) throw await httpError(r, provider);
    return pickOpenRouterModels(await r.json());
  }
  throw new Error(`Unknown provider: ${provider}`);
}
