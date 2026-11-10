// Budowa zapytania do fact-checkingu i parsowanie wyniku.

// Etykiety werdyktów są w lib/i18n.js (verdict.*). Klucze zostają polskie – to identyfikatory w schemacie.
export const VERDICTS = {
  prawda: { tone: "good" },
  raczej_prawda: { tone: "good" },
  polprawda: { tone: "warn" },
  wprowadza_w_blad: { tone: "bad" },
  falsz: { tone: "bad" },
  brak_danych: { tone: "muted" },
  nieweryfikowalne: { tone: "muted" },
};

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "speaker", "claim", "category", "verdict", "confidence", "explanation",
          "evidence", "counter_evidence", "missing_data", "sources"],
        properties: {
          quote: { type: "string", description: "Verbatim excerpt of the transcript containing the claim" },
          speaker: { type: "string", description: "Who said it, if known; otherwise an empty string" },
          claim: { type: "string", description: "The claim stated unambiguously in one sentence" },
          category: { type: "string", enum: ["liczby_statystyki", "badania_naukowe", "wydarzenie", "cytat", "prawo_przepisy", "historia", "inne"] },
          verdict: { type: "string", enum: Object.keys(VERDICTS) },
          confidence: { type: "string", enum: ["wysoka", "srednia", "niska"] },
          explanation: { type: "string", description: "2–3 sentences: what is right and what is not, with concrete numbers/dates" },
          evidence: { type: "string", description: "What supports it (data, studies, sources); empty string if nothing" },
          counter_evidence: { type: "string", description: "Contrary studies/data or important context; empty string if none" },
          missing_data: { type: "string", description: "What is missing to settle it; empty string if nothing" },
          sources: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["title", "url"],
              properties: { title: { type: "string" }, url: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

const LANG_NAMES = { pl: "Polish", en: "English" };

// outLang – język, w którym model ma pisać wyjaśnienia (= język interfejsu).
export function buildInstructions({ today, webSearch, outLang = "pl" }) {
  return [
    "You are a rigorous, impartial fact-checker working live during a conversation (interview, debate, podcast).",
    `Today's date: ${today}. Write every text field (claim, explanation, evidence, counter_evidence, missing_data, source titles) in ${LANG_NAMES[outLang] || "English"}. Keep "quote" verbatim in the original language of the transcript.`,
    "You receive an excerpt of automatic speech recognition – it may contain recognition errors, missing punctuation and misspelled names. Interpret it charitably.",
    "Task: from the NEW excerpt extract only factual claims that can be checked: numbers and statistics, references to studies, events (whether and when they happened), quotes, laws and regulations, historical facts.",
    "Skip opinions, judgements, promises, forecasts and rhetoric. If nothing can be checked, return an empty claims list.",
    "Do not repeat claims from the list of already checked claims.",
    "For each claim:",
    "- verdict: prawda (true) / raczej_prawda (mostly true) / polprawda (half-true) / wprowadza_w_blad (misleading: facts are right but the conclusion is misleading or out of context) / falsz (false) / brak_danych (no reliable data exists) / nieweryfikowalne (unverifiable);",
    "- confidence: wysoka (high) / srednia (medium) / niska (low);",
    "- when studies are cited: do such studies exist, what do they actually say, how good are they, and are there studies with the opposite conclusion;",
    "- for events: did they happen and do the details (dates, numbers, people) match;",
    "- say what is missing to settle the claim.",
    webSearch
      ? "Use web search, especially for recent events and data. Cite specific sources (official statistics, scientific publications, reputable media). Never invent URLs."
      : "You have no internet access: judge from your own knowledge; for recent events (after your knowledge cutoff) choose brak_danych and lower the confidence. Never invent URLs – leave sources empty if you do not know the exact address.",
    "Be concise: explanation max. 3 sentences. Be careful with falsz – use it only with strong evidence.",
  ].join("\n");
}

export function buildInput({ context, fresh, checked }) {
  const parts = [];
  if (context) parts.push(`CONTEXT (earlier part of the conversation, do not check again):\n${context}`);
  if (checked?.length) parts.push(`ALREADY CHECKED CLAIMS:\n${checked.map((c) => `- ${c}`).join("\n")}`);
  parts.push(`NEW EXCERPT TO CHECK:\n${fresh}`);
  return parts.join("\n\n");
}

export function buildRequest({ model, today, webSearch, structured = true, context, fresh, checked, outLang = "pl" }) {
  const body = {
    model,
    instructions: buildInstructions({ today, webSearch, outLang }),
    input: [{ role: "user", content: buildInput({ context, fresh, checked }) }],
  };
  if (webSearch) body.tools = [{ type: "web_search" }];
  if (structured) body.text = { format: { type: "json_schema", name: "factcheck", schema: SCHEMA, strict: true } };
  else body.instructions += `\nReturn ONLY a JSON object matching this schema (no comments, no \`\`\`):\n${JSON.stringify(SCHEMA)}`;
  return body;
}

// Wyciąga obiekt JSON z tekstu (także gdy model owinął go w ```json).
export function parseResult(text) {
  let t = (text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("The model did not return JSON");
  const obj = JSON.parse(t.slice(a, b + 1));
  const claims = Array.isArray(obj.claims) ? obj.claims : [];
  return claims
    .filter((c) => c && c.claim)
    .map((c) => ({
      quote: String(c.quote || ""),
      speaker: String(c.speaker || ""),
      claim: String(c.claim),
      category: c.category || "inne",
      verdict: VERDICTS[c.verdict] ? c.verdict : "nieweryfikowalne",
      confidence: c.confidence || "niska",
      explanation: String(c.explanation || ""),
      evidence: String(c.evidence || ""),
      counter_evidence: String(c.counter_evidence || ""),
      missing_data: String(c.missing_data || ""),
      sources: (Array.isArray(c.sources) ? c.sources : []).filter((s) => /^https?:\/\//.test(s?.url || "")),
    }));
}

// Czy błąd oznacza, że trzeba zrezygnować z danej funkcji (wyszukiwanie / format JSON)?
export function unsupportedFeature(err) {
  const msg = `${err?.code || ""} ${err?.param || ""} ${err?.message || ""}`.toLowerCase();
  const unsupported = err?.code === "subscription_sharing_unsupported_capability" || err?.status === 400;
  if (!unsupported) return null;
  if (/tool|web_search/.test(msg)) return "webSearch";
  if (/text|format|json_schema/.test(msg)) return "structured";
  return null;
}

// Proste porównanie, by nie pokazywać dwa razy tego samego twierdzenia.
export function normalizeClaim(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
export function isDuplicate(claim, seen) {
  const words = new Set(normalizeClaim(claim).split(" ").filter((w) => w.length > 2));
  if (!words.size) return false;
  return seen.some((s) => {
    const other = new Set(normalizeClaim(s).split(" ").filter((w) => w.length > 2));
    let common = 0;
    for (const w of words) if (other.has(w)) common++;
    return common / Math.max(words.size, other.size) >= 0.75;
  });
}
