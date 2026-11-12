// „Kopiuj jako odpowiedź”: komentarz do wklejenia pod postem, pisany ludzkim językiem.
// Panel mówi formalnie (raport), a odpowiedź do dyskusji brzmi jak człowiek. Model pisze ją na żądanie, na podstawie
// GOTOWYCH werdyktów i treści posta – bez wyszukiwania i bez dokładania nowych faktów. Źródła i dopisek o AI
// dokleja wtyczka (zwykłe adresy – Facebook i X nie pokazują linków Markdown), więc adresy nie mogą być zmyślone.

import { VERDICTS } from "./factcheck.js";
import { getLang, t } from "./i18n.js";
import { LEVEL_EN } from "./summary.js";

export const TONES = ["plain", "casual", "x"];        // tony pisane przez model
export const REPLY_TABS = [...TONES, "orig"];           // + oryginał: tekst werdyktu bez przeróbek
export const X_LIMIT = 280;
export const X_URL_LEN = 23; // X liczy każdy link jako 23 znaki
const MAX_LINKS = { plain: 3, casual: 2, x: 1 };
const LANG_NAMES = { pl: "Polish", en: "English" };

const TONE_RULES = {
  plain: "Tone: matter-of-fact and calm, like a well-informed person replying in a discussion. 3–6 short sentences in plain everyday language (no officialese). Start with the claim in quotation marks and what you think of it, e.g. „Twierdzenie, że „…”, jest moim zdaniem mylące.” Then explain briefly what is right and what is not. If there is a fair point behind the concern, acknowledge it in one sentence.",
  casual: "Tone: relaxed and friendly, like a comment to a friend – simple words, short sentences, no lecturing. 2–3 sentences. Still precise about the facts.",
  x: "Tone: very short reply for X (Twitter). At most 200 characters in total, one or two sentences, no hashtags. State the verdict and the single most important fact.",
};

// Werdykt → ludzkie sformułowanie (dla modelu i dla szablonu bez AI).
export const PHRASES = {
  pl: {
    prawda: "się zgadza", raczej_prawda: "w dużej mierze się zgadza", polprawda: "zgadza się tylko częściowo",
    wprowadza_w_blad: "jest moim zdaniem mylące", falsz: "jest nieprawdziwe", brak_danych: "nie ma oparcia w rzetelnych danych",
    nieweryfikowalne: "nie da się rzetelnie sprawdzić", satyra: "to raczej żart niż informacja",
  },
  en: {
    prawda: "is accurate", raczej_prawda: "is mostly accurate", polprawda: "is only partly true",
    wprowadza_w_blad: "is misleading in my view", falsz: "is not true", brak_danych: "is not backed by reliable data",
    nieweryfikowalne: "cannot be reliably checked", satyra: "is a joke rather than information",
  },
};
const VERDICT_EN = {
  prawda: "true", raczej_prawda: "mostly true", polprawda: "half-true", wprowadza_w_blad: "misleading",
  falsz: "false", brak_danych: "no reliable data", nieweryfikowalne: "unverifiable", satyra: "satire / joke",
};
const CONF_EN = { wysoka: "high", srednia: "medium", niska: "low" };

// Źródła do odpowiedzi: najpierw artykuły redakcji fact-checkingowych, potem źródła werdyktu (bez powtórzeń).
export function replySources(claims, max = 8) {
  const out = [];
  const add = (url, title) => { if (/^https?:\/\//.test(url || "") && !out.some((x) => x.url === url)) out.push({ url, title: title || "" }); };
  for (const c of claims) for (const f of c.factchecks || []) add(f.url, `${f.publisher}: ${f.title || f.claim || ""}`);
  for (const c of claims) for (const s of c.sources || []) add(s.url, s.title);
  return out.slice(0, max);
}

export const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "sources"],
  properties: {
    reply: { type: "string", description: "The comment text, without links or source list" },
    sources: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["n", "label"],
        properties: {
          n: { type: "integer", description: "Number of the source from the list" },
          label: { type: "string", description: "Short human description of the source, e.g. „Przebieg prac w Sejmie (druk 3003)”" },
        },
      },
    },
  },
};

// claims – werdykty (jeden albo wszystkie z posta); post – { kind, site, text, speaker }.
export function buildReplyRequest({ model, claims, post = {}, tone = "plain", lang = "pl", structured = true, summary = null }) {
  const t = TONES.includes(tone) ? tone : "plain";
  const sources = replySources(claims);
  const instructions = [
    "You write a short comment that a user will paste as a reply under a social media post or in a discussion. The facts were already checked – your job is only to put the result into natural, human words.",
    `Write in the language of the post (if unsure: ${LANG_NAMES[lang] || "English"}). Match the register of the post (formal or informal), but always stay polite and calm – no sarcasm, no insults, never attack the author, address the claim not the person.`,
    TONE_RULES[t],
    "Use ONLY the facts given in the verdicts below. Do not add any new facts, numbers, names, dates, quotes or sources. Do not change the meaning of the verdict and do not make it sound more certain than it is: with confidence \"low\" say you are not sure.",
    "Express the verdict in everyday words (e.g. false → „to nieprawda”, misleading → „to mylące”, half-true → „zgadza się tylko częściowo”) – never write labels like „Ocena:”, „pewność:” or „Wprowadza w błąd (pewność: średnia)”.",
    claims.length > 1
      ? "There are several claims from the same post: write ONE coherent comment. Focus on the false, misleading or half-true ones; mention briefly what is right. Do not number the claims."
      : "",
    summary ? "An overall assessment of the whole post is given: follow its emphasis – start from the main message and whether it holds, then the most important problem." : "",
    "The comment is written in the first person by the user (\"moim zdaniem\", \"in my view\") – but never claim that the user personally researched or verified anything.",
    "No markdown, no bullet points, no emoji, no hashtags, no links or URLs in the text – sources are added separately.",
    `sources: choose at most ${MAX_LINKS[t]} of the numbered sources that best support the comment and give each a short human label in the comment's language (what it is, e.g. „Przebieg prac w Sejmie (druk 3003)”, „Zastrzeżenia KRRiT”). Empty list if none fit.`,
    structured ? "" : `Return ONLY a JSON object matching this schema (no comments, no \`\`\`):\n${JSON.stringify(REPLY_SCHEMA)}`,
  ].filter(Boolean).join("\n");

  const ctx = [`WHERE: ${postKind(post)}${post.site ? ` (${post.site})` : ""}`];
  if (post.speaker) ctx.push(`SPEAKER: ${post.speaker}`);
  if (summary?.headline) ctx.push(`OVERALL ASSESSMENT (from the verdicts): ${LEVEL_EN[summary.level] || summary.level} – ${summary.headline}`);
  if (post.text) ctx.push(`POST / CONTEXT (for language and tone only – not a source of facts):\n"""\n${String(post.text).slice(0, 1500)}\n"""`);
  const verdicts = claims.map((c, i) => [
    `${claims.length > 1 ? `CLAIM ${i + 1}` : "CLAIM"}: ${c.claim}`,
    c.quote ? `Original wording: „${c.quote}”${c.speaker ? ` (${c.speaker})` : ""}` : "",
    `Verdict: ${VERDICT_EN[c.verdict] || c.verdict} (confidence: ${CONF_EN[c.confidence] || c.confidence})`,
    `Explanation: ${c.explanation || ""}`,
    c.evidence ? `Supports: ${c.evidence}` : "",
    c.counter_evidence ? `Against / context: ${c.counter_evidence}` : "",
    c.visual_issues ? `Problems with the image/chart: ${c.visual_issues}` : "",
    (c.factchecks || []).length ? `Fact-checking outlets: ${c.factchecks.map((f) => `${f.publisher} – ${f.rating}`).join("; ")}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
  const srcList = sources.length ? `SOURCES:\n${sources.map((s, i) => `${i + 1}. ${s.title || "(no title)"} – ${s.url}`).join("\n")}` : "SOURCES: (none)";
  const body = {
    model,
    instructions,
    input: [{ role: "user", content: [ctx.join("\n\n"), `VERDICTS:\n${verdicts}`, srcList].join("\n\n") }],
  };
  if (structured) body.text = { format: { type: "json_schema", name: "reply", schema: REPLY_SCHEMA, strict: true } };
  return { body, sources };
}

function postKind(post) {
  return {
    post: "a reply under a social media post",
    article: "a comment under an article (or under a post sharing it)",
    tab: "a comment in a discussion about a video / broadcast",
    mic: "a comment in a discussion about something that was said",
    manual: "a reply in an online discussion",
    image: "a reply under an image (meme, infographic, chart)",
    area: "a reply under an image or a screenshot",
  }[post.kind] || "a reply in an online discussion";
}

// Odpowiedź modelu → { text, picks:[{url,label}] }; gdy to nie JSON – cały tekst jako komentarz (bez źródeł).
export function parseReply(raw, sources) {
  let t = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const obj = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    const picks = [];
    for (const s of Array.isArray(obj.sources) ? obj.sources : []) {
      const src = sources[(Number(s?.n) || 0) - 1];
      if (src && !picks.some((p) => p.url === src.url)) picks.push({ url: src.url, label: cleanText(s.label) || src.title });
    }
    return { text: cleanText(obj.reply), picks };
  } catch {
    return { text: cleanText(t), picks: [] };
  }
}
// Bez Markdown i bez adresów w treści (Facebook i X ich nie formatują).
function cleanText(s) {
  return String(s || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1")
    .replace(/\(?\s*https?:\/\/\S+\s*\)?/g, "").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

const AI_NOTE = {
  pl: { plain: "Opracowane z pomocą AI (Fact Checker), więc warto samemu zajrzeć do źródeł.", casual: "(sprawdzone z pomocą AI – warto zajrzeć do źródeł)", x: "(z pomocą AI)" },
  en: { plain: "Prepared with the help of AI (Fact Checker), so it is worth checking the sources yourself.", casual: "(checked with the help of AI – worth looking at the sources)", x: "(with AI help)" },
};
const SOURCES_WORD = { pl: { many: "Źródła:", one: "Źródło:" }, en: { many: "Sources:", one: "Source:" } };

// Gotowy tekst do wklejenia: komentarz + źródła (zwykłe adresy) + dopisek o AI.
export function composeReply({ text, picks = [], tone = "plain", lang = "pl" }) {
  const L = lang === "en" ? "en" : "pl";
  const links = picks.slice(0, MAX_LINKS[tone] || 3);
  const parts = [text.trim()];
  if (tone === "x") {
    const tail = [links[0]?.url, AI_NOTE[L].x].filter(Boolean).join(" ");
    return `${parts[0]}${tail ? ` ${tail}` : ""}`.trim();
  }
  if (links.length) {
    const w = SOURCES_WORD[L][links.length > 1 ? "many" : "one"];
    parts.push(links.length > 1 || tone === "plain"
      ? `${w}\n${links.map((s) => `- ${s.label ? `${s.label}: ` : ""}${s.url}`).join("\n")}`
      : `${w} ${links[0].label ? `${links[0].label}: ` : ""}${links[0].url}`);
  }
  parts.push(AI_NOTE[L][tone] || AI_NOTE[L].plain);
  return parts.join("\n\n");
}

// Długość wg zasad X: każdy link = 23 znaki.
export const xLength = (s) => [...String(s).replace(/https?:\/\/\S+/g, "x".repeat(X_URL_LEN))].length;

// Zapas bez AI (brak sieci, limit, błąd): przestawione elementy werdyktu, prostszy układ.
export function templateReply(claims, { tone = "plain", lang = "pl" } = {}) {
  const L = lang === "en" ? "en" : "pl";
  const ph = PHRASES[L];
  const first = (s) => (String(s || "").match(/^.*?[.!?](\s|$)/)?.[0] || String(s || "")).trim();
  const unsure = (c) => (c.confidence === "niska" ? (L === "pl" ? " (choć nie ma tu pełnej pewności)" : " (though this is not certain)") : "");
  const one = (c) => (L === "pl" ? `Twierdzenie, że „${c.claim}”, ${ph[c.verdict] || "budzi wątpliwości"}${unsure(c)}.` : `The claim that “${c.claim}” ${ph[c.verdict] || "is doubtful"}${unsure(c)}.`);
  let text;
  if (tone === "x") {
    const c = claims.find((x) => VERDICTS[x.verdict]?.tone === "bad") || claims[0];
    text = `${one(c)} ${first(c.explanation)}`;
    if ([...text].length > 200) text = one(c);
  } else if (claims.length === 1) {
    text = tone === "casual" ? `${one(claims[0])} ${first(claims[0].explanation)}` : `${one(claims[0])} ${claims[0].explanation || ""}`.trim();
  } else {
    text = claims.map((c) => `${one(c)} ${first(c.explanation)}`).join("\n\n");
  }
  const picks = replySources(claims).map((s) => ({ url: s.url, label: shortLabel(s.title) }));
  return composeReply({ text, picks, tone, lang: L });
}
const shortLabel = (title = "") => {
  const t = String(title).split(/\s[|–—-]\s/)[0].trim();
  return t.length > 70 ? `${t.slice(0, 67)}…` : t;
};

// Oryginał: tekst werdyktu tak jak w panelu (twierdzenie, ocena, wyjaśnienie, źródła) – bez przeróbek przez AI.
// Język = język interfejsu (w nim są werdykty).
export function originalReply(claims) {
  const L = getLang() === "pl" ? "pl" : "en";
  const blocks = claims.map((c) => [
    `„${c.claim}”`,
    `${t("card.explLabel")}: ${t(`verdict.${c.verdict}`)} (${t("card.confidence", { c: t(`conf.${c.confidence}`) })}).`,
    c.explanation,
    c.visual_issues ? `${t("card.visual")}: ${c.visual_issues}` : "",
  ].filter(Boolean).join("\n"));
  const links = replySources(claims, claims.length > 1 ? 5 : 3);
  const parts = [blocks.join("\n\n")];
  if (links.length) parts.push(`${SOURCES_WORD[L][links.length > 1 ? "many" : "one"]}\n${links.map((s) => `- ${shortLabel(s.title) ? `${shortLabel(s.title)}: ` : ""}${s.url}`).join("\n")}`);
  parts.push(AI_NOTE[L].plain);
  return parts.join("\n\n");
}
