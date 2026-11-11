// Szacowanie kosztów zapytań (USD).
// Ceny orientacyjne z cenników dostawców (stan: listopad 2026). Dokładne rozliczenie jest zawsze w panelu
// dostawcy – tu chodzi o to, żeby nie dać się zaskoczyć rachunkiem. OpenRouter podaje koszt dokładnie
// (usage.cost), plan ChatGPT nic nie kosztuje (limity planu), darmowe pule wyszukiwań nie są odliczane.

export const PRICES_DATE = "2026-11";

// [dostawca, wzorzec id modelu, $ za 1M tokenów wejścia, $ za 1M tokenów wyjścia]
const TABLE = [
  // OpenAI (klucz API)
  ["openai", /^gpt-5-nano/, 0.05, 0.4],
  ["openai", /^gpt-5-mini/, 0.25, 2],
  ["openai", /^gpt-5(-\d{4}-\d\d-\d\d)?$/, 1.25, 10],
  ["openai", /nano/, 0.2, 1.25],
  ["openai", /mini/, 0.75, 4.5],
  ["openai", /^gpt-5\.5/, 5, 30],
  ["openai", /^gpt-5\.[1-4]/, 2.5, 15],
  ["openai", /^gpt-4o/, 2.5, 10],
  ["openai", /^o\d/, 2, 8],
  ["openai", /./, 2.5, 15],
  // Anthropic
  ["anthropic", /haiku-5|haiku-[6-9]/, 0.1, 0.5],
  ["anthropic", /haiku/, 1, 5],
  ["anthropic", /sonnet-5|sonnet-[6-9]/, 2, 10],
  ["anthropic", /sonnet/, 3, 15],
  ["anthropic", /opus-5-5|opus-5\.5|opus-[6-9]/, 4, 20],
  ["anthropic", /opus-4-[01]|opus-4$|opus-4-2025/, 15, 75],
  ["anthropic", /opus/, 5, 25],
  ["anthropic", /fable/, 10, 50],
  ["anthropic", /./, 3, 15],
  // Google Gemini
  ["gemini", /flash-lite/, 0.1, 0.4],
  ["gemini", /^gemini-2\.5-flash/, 0.3, 2.5],
  ["gemini", /^gemini-2\.5-pro/, 1.25, 10],
  ["gemini", /^gemini-3-flash/, 0.5, 3],
  ["gemini", /^gemini-3\.\d+-flash/, 0.75, 3.75],
  ["gemini", /pro/, 2, 12],
  ["gemini", /^gemini-[4-9]/, 2, 10],
  ["gemini", /./, 0.75, 3.75],
];

// $ za jedno wyszukiwanie (OpenAI, Claude: 10 $/1000; Gemini 3+: 14 $/1000 zapytań; Gemini 2.x: 35 $/1000 zapytań do modelu).
function searchPrice(provider, model = "") {
  if (provider === "gemini") return /^gemini-(1|2)\./.test(model) ? 0.035 : 0.014;
  if (provider === "openai" || provider === "anthropic") return 0.01;
  return 0;
}

const family = (provider) => (provider === "apikey" || provider === "chatgpt" ? "openai" : provider);

// override: { in, out } – ceny wpisane ręcznie w ustawieniach (puste = z tabeli).
export function priceFor(provider, model = "", override = {}) {
  const fam = family(provider);
  const row = TABLE.find(([p, re]) => p === fam && re.test(String(model).replace(/^models\//, "")));
  const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    in: num(override.in) ?? row?.[2] ?? null,
    out: num(override.out) ?? row?.[3] ?? null,
    search: searchPrice(fam, model),
    custom: num(override.in) != null || num(override.out) != null,
  };
}

// usage: { input, output, cached, searches, cost } → koszt w USD (0 dla planu ChatGPT, null gdy nieznany).
export function usageCost(provider, model, usage = {}, override = {}) {
  if (provider === "chatgpt") return 0;
  if (typeof usage.cost === "number" && !Number.isNaN(usage.cost)) return usage.cost; // OpenRouter: dokładnie
  const p = priceFor(provider, model, override);
  if (p.in == null || p.out == null) return null;
  const input = Math.max(0, usage.input || 0), cached = Math.min(input, Math.max(0, usage.cached || 0));
  const tokens = ((input - cached) * p.in + cached * p.in * 0.1 + Math.max(0, usage.output || 0) * p.out) / 1e6;
  return tokens + Math.max(0, usage.searches || 0) * p.search;
}

// Sumowanie zużycia (sesja, dzień).
export const emptyUsage = () => ({ calls: 0, input: 0, output: 0, searches: 0, cost: 0, unknown: 0 });
export function addTo(total, usage = {}, cost = null) {
  const t = { ...emptyUsage(), ...(total || {}) };
  t.calls += 1;
  t.input += usage.input || 0;
  t.output += usage.output || 0;
  t.searches += usage.searches || 0;
  if (cost == null) t.unknown += 1; else t.cost += cost;
  return t;
}

// Lokalna data (RRRR-MM-DD) – licznik dzienny zeruje się o północy czasu użytkownika.
export const localDay = (d = new Date()) => d.toLocaleDateString("sv-SE");

export function fmtUsd(v, lang = "pl") {
  if (v == null) return "?";
  const digits = v < 0.01 ? 4 : v < 1 ? 3 : 2;
  const s = v.toFixed(digits);
  return `$${lang === "pl" ? s.replace(".", ",") : s}`;
}
export function fmtTokens(n, lang = "pl") {
  if (n < 1000) return String(n);
  const k = n / 1000;
  const s = k < 100 ? k.toFixed(1) : String(Math.round(k));
  return `${lang === "pl" ? s.replace(".", ",") : s} ${lang === "pl" ? "tys." : "k"}`;
}

// Tryby pracy: jak często i jak dokładnie sprawdzamy (koszt ↔ dokładność).
export const MODES = {
  eco: { interval: 60, audioClaims: 3, textClaims: 5, searches: 2 },
  normal: { interval: 30, audioClaims: 5, textClaims: 10, searches: 5 },
  thorough: { interval: 20, audioClaims: 8, textClaims: 15, searches: 8 },
};
export const modeOf = (m) => MODES[m] || MODES.normal;
