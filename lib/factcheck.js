// Budowa zapytania do fact-checkingu i parsowanie wyniku.

export const VERDICTS = {
  prawda: { label: "Prawda", tone: "good" },
  raczej_prawda: { label: "Raczej prawda", tone: "good" },
  polprawda: { label: "Półprawda", tone: "warn" },
  wprowadza_w_blad: { label: "Wprowadza w błąd", tone: "bad" },
  falsz: { label: "Fałsz", tone: "bad" },
  brak_danych: { label: "Brak danych", tone: "muted" },
  nieweryfikowalne: { label: "Nieweryfikowalne", tone: "muted" },
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
          quote: { type: "string", description: "Dosłowny fragment transkrypcji z twierdzeniem" },
          speaker: { type: "string", description: "Kto to powiedział, jeśli wiadomo; inaczej pusty tekst" },
          claim: { type: "string", description: "Twierdzenie sformułowane jednoznacznie, jednym zdaniem" },
          category: { type: "string", enum: ["liczby_statystyki", "badania_naukowe", "wydarzenie", "cytat", "prawo_przepisy", "historia", "inne"] },
          verdict: { type: "string", enum: Object.keys(VERDICTS) },
          confidence: { type: "string", enum: ["wysoka", "srednia", "niska"] },
          explanation: { type: "string", description: "2–3 zdania: co się zgadza, a co nie, z konkretnymi liczbami/datami" },
          evidence: { type: "string", description: "Co potwierdza (dane, badania, źródła); pusty tekst jeśli nic" },
          counter_evidence: { type: "string", description: "Przeciwstawne badania/dane lub ważny kontekst; pusty tekst jeśli brak" },
          missing_data: { type: "string", description: "Czego brakuje, by rozstrzygnąć; pusty tekst jeśli nic" },
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

export function buildInstructions({ today, webSearch, language = "pl" }) {
  return [
    "Jesteś rzetelnym, bezstronnym fact-checkerem pracującym na żywo podczas rozmowy (wywiad, debata, podcast).",
    `Dzisiejsza data: ${today}. Odpowiadaj po ${language === "pl" ? "polsku" : language}.`,
    "Dostajesz fragment automatycznej transkrypcji mowy – może zawierać błędy rozpoznawania, brak interpunkcji i nazwisk. Interpretuj życzliwie.",
    "Zadanie: wyłap z NOWEGO fragmentu tylko twierdzenia faktograficzne, które da się sprawdzić: liczby i statystyki, powoływanie się na badania, wydarzenia (czy i kiedy się wydarzyły), cytaty, przepisy, fakty historyczne.",
    "Pomijaj opinie, oceny, obietnice, prognozy i retorykę. Jeśli nic nie nadaje się do sprawdzenia, zwróć pustą listę claims.",
    "Nie powtarzaj twierdzeń z listy już sprawdzonych.",
    "Dla każdego twierdzenia:",
    "- werdykt: prawda / raczej_prawda / polprawda / wprowadza_w_blad (fakty prawdziwe, ale wniosek mylący lub wyrwany z kontekstu) / falsz / brak_danych (nie ma wiarygodnych danych) / nieweryfikowalne;",
    "- przy powoływaniu się na badania: czy takie badania istnieją, co faktycznie mówią, jaka jest ich jakość, i czy są badania o przeciwnych wnioskach;",
    "- przy wydarzeniach: czy się wydarzyły i czy szczegóły (daty, liczby, osoby) się zgadzają;",
    "- wskaż, czego brakuje do rozstrzygnięcia.",
    webSearch
      ? "Używaj wyszukiwania w sieci, szczególnie dla świeżych wydarzeń i danych. Podawaj konkretne źródła (oficjalne statystyki, publikacje naukowe, rzetelne media). Nie wymyślaj adresów URL."
      : "Nie masz dostępu do internetu: oceniaj na podstawie swojej wiedzy, przy świeżych wydarzeniach (po dacie Twojej wiedzy) wybierz brak_danych i obniż pewność. Nie wymyślaj adresów URL – zostaw sources puste, jeśli nie znasz dokładnego adresu.",
    "Bądź zwięzły: explanation maks. 3 zdania. Ostrożnie z werdyktem falsz – tylko przy mocnych dowodach.",
  ].join("\n");
}

export function buildInput({ context, fresh, checked }) {
  const parts = [];
  if (context) parts.push(`KONTEKST (wcześniejsza część rozmowy, nie sprawdzaj ponownie):\n${context}`);
  if (checked?.length) parts.push(`JUŻ SPRAWDZONE TWIERDZENIA:\n${checked.map((c) => `- ${c}`).join("\n")}`);
  parts.push(`NOWY FRAGMENT DO SPRAWDZENIA:\n${fresh}`);
  return parts.join("\n\n");
}

export function buildRequest({ model, today, webSearch, structured = true, context, fresh, checked }) {
  const body = {
    model,
    instructions: buildInstructions({ today, webSearch }),
    input: [{ role: "user", content: buildInput({ context, fresh, checked }) }],
  };
  if (webSearch) body.tools = [{ type: "web_search" }];
  if (structured) body.text = { format: { type: "json_schema", name: "factcheck", schema: SCHEMA, strict: true } };
  else body.instructions += `\nZwróć WYŁĄCZNIE obiekt JSON zgodny z tym schematem (bez komentarzy i bez \`\`\`):\n${JSON.stringify(SCHEMA)}`;
  return body;
}

// Wyciąga obiekt JSON z tekstu (także gdy model owinął go w ```json).
export function parseResult(text) {
  let t = (text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("Model nie zwrócił JSON-a");
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
