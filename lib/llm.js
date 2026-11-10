// Wywołania OpenAI Responses API (strumieniowo). Ten sam kod obsługuje oba tryby:
//  - token OAuth z planu ChatGPT (wymagane store:false, stream:true, bez temperature itp.),
//  - zwykły klucz API.

export const API = "https://api.openai.com/v1";

export class ApiError extends Error {
  constructor(message, { status, code, param } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.param = param;
  }
}

// Dzieli strumień SSE na zdarzenia JSON. Zwraca [zdarzenia, reszta bufora].
export function parseSSE(buffer) {
  const events = [];
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = parts.pop();
  for (const part of parts) {
    const data = part.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") continue;
    try { events.push(JSON.parse(data)); } catch { /* fragment niebędący JSON-em */ }
  }
  return [events, rest];
}

// Wyciąga linki ze źródłami (adnotacje url_citation) z końcowej odpowiedzi.
export function extractCitations(response) {
  const out = [];
  for (const item of response?.output || []) {
    for (const c of item.content || []) {
      for (const a of c.annotations || []) {
        if (a.type === "url_citation" && a.url && !out.some((x) => x.url === a.url)) out.push({ url: a.url, title: a.title || a.url });
      }
    }
  }
  return out;
}

export async function streamResponse({ token, body, signal, onDelta }) {
  const r = await fetch(`${API}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ ...body, store: false, stream: true }),
    signal,
  });
  if (!r.ok) {
    let e = {};
    try { e = (await r.json()).error || {}; } catch { /* brak JSON */ }
    throw new ApiError(e.message || `HTTP ${r.status}`, { status: r.status, code: e.code || e.type, param: e.param });
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", final = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    let events;
    [events, buf] = parseSSE(buf + dec.decode(value, { stream: true }));
    for (const ev of events) {
      if (ev.type === "response.output_text.delta") { text += ev.delta; onDelta?.(ev.delta); }
      else if (ev.type === "response.completed") final = ev.response;
      else if (ev.type === "response.incomplete") final = ev.response;
      else if (ev.type === "response.failed") {
        const er = ev.response?.error || {};
        throw new ApiError(er.message || "The model response failed", { code: er.code, param: er.param });
      } else if (ev.type === "error") {
        throw new ApiError(ev.message || ev.error?.message || "Stream error", { code: ev.code || ev.error?.code, param: ev.param });
      }
    }
  }
  if (!final) throw new ApiError("The stream ended without response.completed", { code: "stream_interrupted" });
  return { text, response: final, citations: extractCitations(final) };
}

// Lista modeli: dla planu ChatGPT {models:[{slug, display_name, visibility}]}, dla klucza API {data:[{id}]}.
export async function listModels(token) {
  const r = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new ApiError(`Could not load the model list (HTTP ${r.status})`, { status: r.status });
  const j = await r.json();
  if (Array.isArray(j.models)) {
    return j.models.filter((m) => m.visibility === "list" || !m.visibility).map((m) => ({ id: m.slug, name: m.display_name || m.slug }));
  }
  return (j.data || [])
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o\d)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding|instruct)/.test(id))
    .sort().reverse()
    .map((id) => ({ id, name: id }));
}

export async function transcribe({ apiKey, blob, model, language, prompt, signal }) {
  const fd = new FormData();
  fd.append("file", blob, "chunk.webm");
  fd.append("model", model);
  if (language) fd.append("language", language);
  if (prompt) fd.append("prompt", prompt);
  const r = await fetch(`${API}/audio/transcriptions`, {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd, signal,
  });
  if (!r.ok) {
    let e = {};
    try { e = (await r.json()).error || {}; } catch { /* brak JSON */ }
    throw new ApiError(e.message || `Transcription: HTTP ${r.status}`, { status: r.status, code: e.code });
  }
  return ((await r.json()).text || "").trim();
}
