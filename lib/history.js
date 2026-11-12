// Historia sesji: każda sesja (werdykty + transkrypcja) zapisuje się automatycznie w IndexedDB wtyczki.
// Sesja = jedno „posiedzenie”: wszystko, co sprawdzasz, aż do „Nowa sesja” albo dłuższej przerwy.
// { id, startedAt, updatedAt, model,
//   sources:  [{ id, kind, title, url, pageUrl, meta, tabId, frameId, captureId, text, at }],
//   claims:   [{ ...werdykt, srcId, t }],
//   segments: [{ t, text, checked, srcId }] }      // transkrypcja rozmów (wideo/mikrofon)
// kind: "tab" | "mic" | "manual" | "article" | "post" | "selection" | "fragment"

import { getLang, t } from "./i18n.js";
import { validSummary } from "./summary.js";
import { trickName, TRICKS } from "./tricks.js";

const DB = "fact-checker-history";
const STORE = "sessions";
export const MEMORY_STORE = "memory"; // pamięć werdyktów (lib/memory.js), od wersji 0.5.0
let dbp = null;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
      if (!d.objectStoreNames.contains(MEMORY_STORE)) d.createObjectStore(MEMORY_STORE, { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

export async function tx(mode, fn, store = STORE) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tr = d.transaction(store, mode);
    const req = fn(tr.objectStore(store));
    tr.oncomplete = () => resolve(req?.result);
    tr.onerror = () => reject(tr.error);
    tr.onabort = () => reject(tr.error);
  });
}

export const putSession = (s) => tx("readwrite", (st) => st.put(s));
export const getSession = async (id) => { const r = await tx("readonly", (st) => st.get(id)); return r && normalizeSession(r); };
export const deleteSession = (id) => tx("readwrite", (st) => st.delete(id));
export const clearSessions = () => tx("readwrite", (st) => st.clear());
export async function listSessions() {
  const all = ((await tx("readonly", (st) => st.getAll())) || []).map(normalizeSession);
  return all.filter(hasContent).sort((a, b) => lastActivity(b) - lastActivity(a));
}

export const hasContent = (s) => !!(s?.claims?.length || s?.segments?.length || s?.sources?.length);

export const PAGE_KINDS = ["article", "post", "selection", "fragment", "image", "area"];
export const isPageKind = (k) => PAGE_KINDS.includes(k);

// Sesje zapisane przed wersją 0.4.1-opera.5 miały jedno źródło (source/page/title/url) – zamieniamy je na listę.
export function normalizeSession(rec) {
  if (!rec || Array.isArray(rec.sources)) return rec;
  const kind = rec.source === "page" ? rec.page?.kind || "fragment" : rec.source || "tab";
  const pg = rec.page || {};
  const src = {
    id: "s0", kind, title: kind === "mic" ? "" : rec.title || "", url: kind === "mic" ? "" : rec.url || "", at: rec.startedAt || 0,
    ...(rec.source === "page" ? { meta: pg.meta || {}, tabId: pg.tabId ?? null, frameId: pg.frameId || 0, captureId: pg.captureId || null, pageUrl: pg.pageUrl || "" } : {}),
  };
  const page = rec.source === "page";
  if (page) src.text = (rec.segments || []).map((x) => x.text).join("\n\n");
  const { source: _s, page: _p, title: _t, url: _u, ...rest } = rec;
  return {
    ...rest,
    sources: hasContent(rec) ? [src] : [],
    claims: (rec.claims || []).map((c) => ({ ...c, srcId: c.srcId || "s0" })),
    segments: page ? [] : (rec.segments || []).map((x) => ({ ...x, srcId: x.srcId || "s0" })),
  };
}

// Ostatnia aktywność w sesji (nie updatedAt – ten zmienia się też przy samym otwarciu).
export function lastActivity(s) {
  let t = s?.startedAt || 0;
  for (const c of s?.claims || []) t = Math.max(t, c.t || 0);
  for (const x of s?.segments || []) t = Math.max(t, x.t || 0);
  for (const x of s?.sources || []) t = Math.max(t, x.at || 0);
  return t;
}
export const wordCount = (segments = []) => segments.reduce((n, s) => n + (s.text.trim() ? s.text.trim().split(/\s+/).length : 0), 0);

export function verdictCounts(claims = []) {
  const c = {};
  for (const x of claims) c[x.verdict] = (c[x.verdict] || 0) + 1;
  return c;
}

export function matchesQuery(s, q) {
  q = (q || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [...(s.sources || []).flatMap((x) => [x.title, x.url, x.meta?.author]), ...(s.claims || []).flatMap((c) => [c.claim, c.quote, c.speaker])].join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

const locale = () => (getLang() === "pl" ? "pl-PL" : "en-GB");
export const fmtDate = (ts) => new Date(ts).toLocaleString(locale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const KIND_FALLBACK = { mic: "hist.mic", manual: "hist.manual" };
// Tytuł karty bez licznika powiadomień („(1) …”, „(12+) …”).
export const cleanTitle = (s = "") => String(s).replace(/^\(\d+\+?\)\s*/, "").trim();
// Mikrofon słucha otoczenia, nie karty – zawsze nazywa się „Mikrofon”, nawet jeśli w starej sesji zapisał się tytuł strony.
export function sourceTitle(src = {}) {
  if (src.kind === "mic") return t("hist.mic");
  return cleanTitle(src.title) || t(KIND_FALLBACK[src.kind] || "hist.untitled");
}
export function sourceIcon(src = {}) {
  return { article: "📄", post: "💬", selection: "✂️", fragment: "🔎", image: "🖼️", area: "🔲", tab: "🔊", mic: "🎙️", manual: "⌨️" }[src.kind] || "🔊";
}
// Tytuł sesji: pierwsze źródło (+ ile jeszcze).
export function sessionTitle(s) {
  const srcs = s?.sources || [];
  if (!srcs.length) return t("hist.untitled");
  return sourceTitle(srcs[0]) + (srcs.length > 1 ? ` (+${srcs.length - 1})` : "");
}
export function sessionIcon(s) {
  const icons = [...new Set((s?.sources || []).map(sourceIcon))];
  return icons.length === 1 ? icons[0] : icons.length ? "🗂️" : "🔊";
}

function claimLines(c) {
  const lines = [`### ${t(`verdict.${c.verdict}`)}: „${c.claim}”`, ""];
  if (c.quote) lines.push(`> ${c.speaker ? c.speaker + ": " : ""}${c.quote}`, "");
  if (c.explanation) lines.push(c.explanation, "");
  if (c.evidence) lines.push(`**${t("card.evidence")}:** ${c.evidence}`, "");
  if (c.counter_evidence) lines.push(`**${t("card.counter")}:** ${c.counter_evidence}`, "");
  if (c.missing_data) lines.push(`**${t("card.missing")}:** ${c.missing_data}`, "");
  if (c.visual_issues) lines.push(`**${t("card.visual")}:** ${c.visual_issues}`, "");
  for (const src of c.sources || []) lines.push(`- [${src.title || src.url}](${src.url})`);
  if (c.factchecks?.length) {
    lines.push("", `**${t("fc.title")}**`);
    for (const f of c.factchecks) lines.push(`- ${f.rating || "?"} – ${f.publisher}: [${f.title || f.claim || f.url}](${f.url})`);
    if (c.fcConflict) lines.push("", `⚠ ${t("fc.conflict")}`);
  }
  lines.push("");
  return lines;
}

// Transkrypcja z oznaczeniem mówców („Jan Kowalski: …”) – tam, gdzie użytkownik ich wskazał.
export function speakerText(segs = []) {
  let out = "", cur = "";
  for (const x of segs) {
    const sp = x.speaker || "";
    if (sp && sp !== cur) out = `${out.trimEnd()}${out ? "\n\n" : ""}${sp}: `;
    else if (!sp && cur) out = `${out.trimEnd()}\n\n`;
    cur = sp;
    out += `${x.text} `;
  }
  return out.trim();
}

// Ocena całości źródła (lib/summary.js) – przed werdyktami.
export function summaryLines(sum) {
  if (!sum) return [];
  const genre = sum.genre && sum.genre !== "inne" ? ` (${t(`genre.${sum.genre}`)})` : "";
  const out = [`**${t("sum.title")}: ${t(`level.${sum.level}`)}**${genre} – ${sum.headline}`, ""];
  const pts = [["✓", sum.ok], ["✗", sum.wrong], ["⚠", sum.context], ["⚖", sum.side ? [sum.side] : []]];
  for (const [mark, list] of pts) for (const x of list || []) out.push(`- ${mark} ${x}`);
  if (pts.some(([, list]) => (list || []).length)) out.push("");
  return out;
}

// Sygnał oszustwa (lib/scam.js) jako zdanie w języku interfejsu.
const SCAM_WORDING = ["profit", "invest", "secret", "urgency", "payment", "contact", "prize"];
export function scamLine(s) {
  if (SCAM_WORDING.includes(s.kind)) return t(`scam.${s.kind}`, { quote: s.quote });
  return t(`scam.${s.kind}`, { host: s.host, brand: s.brand || "", official: s.official || "" }) + (s.where === "link" ? ` ${t("scam.inLink")}` : "");
}
export function scamLines(scam) {
  if (!scam?.level) return [];
  return [`> ⚠ **${t(scam.level === "high" ? "scam.titleHigh" : "scam.titleMedium")}**`, ...scam.signals.slice(0, 6).map((s) => `> - ${scamLine(s)}`), `> ${t("scam.advice")}`, ""];
}

// Chwyty erystyczne źródła – po werdyktach.
export function trickLines(tricks = []) {
  const list = (tricks || []).filter((x) => TRICKS[x.trick]);
  if (!list.length) return [];
  const lang = getLang();
  return [`**🎭 ${t("trick.title", { n: list.length })}**`, "",
    ...list.map((x) => `- **${trickName(x.trick, lang)}**${x.speaker ? ` (${x.speaker})` : ""}: „${x.quote}” – ${x.why}`), ""];
}

export function toMarkdown(s) {
  s = normalizeSession(s);
  const lines = [`# ${t("export.title", { date: fmtDate(s.startedAt || Date.now()) })}`, ""];
  for (const src of s.sources || []) {
    const title = sourceTitle(src);
    lines.push(`## ${sourceIcon(src)} ${src.url ? `[${title}](${src.url})` : title}`, "");
    const meta = src.meta || {};
    const date = src.date || meta.date;
    const info = [t(`kind.${src.kind}`), meta.site, meta.author && `${t("export.author")}: ${meta.author}`, date && `${t("export.published")}: ${date}`, src.at && fmtDate(src.at)].filter(Boolean);
    lines.push(`*${info.join(" · ")}*`, "");
    for (const [i, im] of (src.images || []).entries()) {
      const note = (src.imageNotes || []).find((x) => x.index === i + 1) || {};
      lines.push(`**🖼 ${t("img.n", { n: i + 1 })}${note.type ? ` – ${t(`imgtype.${note.type}`)}` : ""}**${note.topic ? `: ${note.topic}` : ""}${im.src ? ` ([${t("img.original")}](${im.src}))` : ""}`, "");
      if (note.text) lines.push(`> ${note.text.replace(/\n+/g, " ")}`, "");
      if (note.notes) lines.push(`*${t("img.notes")}:* ${note.notes}`, "");
    }
    const claims = (s.claims || []).filter((c) => c.srcId === src.id);
    lines.push(...scamLines(src.scam));
    lines.push(...summaryLines(validSummary(src, claims)));
    for (const c of claims) lines.push(...claimLines(c));
    lines.push(...trickLines(src.tricks));
    if (!claims.length) lines.push(`_${t("src.noClaims")}_`, "");
    const text = isPageKind(src.kind) || src.kind === "manual" ? src.text || "" : speakerText((s.segments || []).filter((x) => x.srcId === src.id));
    if (text) lines.push(`#### ${t(isPageKind(src.kind) || src.kind === "manual" ? "export.text" : "export.transcript")}`, "", text, "");
  }
  return lines.join("\n");
}

export function fileName(s) {
  s = normalizeSession(s);
  const d = new Date(s.startedAt || Date.now());
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const slug = sessionTitle(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L")
    .replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60).replace(/-+$/, "");
  return `fact-check-${stamp}${slug ? "-" + slug : ""}.md`;
}

// Zapis pliku: przez chrome.downloads do Pobrane/Fact Checker/, a gdy się nie da – zwykłe pobranie.
export async function downloadMarkdown(s, { folder = "Fact Checker" } = {}) {
  const blob = new Blob([toMarkdown(s)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  try {
    if (globalThis.chrome?.downloads?.download) {
      await chrome.downloads.download({ url, filename: `${folder}/${fileName(s)}`, conflictAction: "uniquify", saveAs: false });
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName(s);
      a.click();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

// ---------- werdykty sprawdzone dokładniej (i oceny 👍/👎 ze starszych wersji) ----------
// Zbiorczy eksport: każdy taki werdykt z kontekstem (co sprawdzano, Twoja uwaga, jakim modelem, co odpowiedział
// przed i po), żeby dało się z tego poprawiać prompty. Tekst źródła skracamy do kilku tysięcy znaków.
const EXCERPT = 4000;
export function ratedClaims(sessions = []) {
  const out = [];
  const seen = new Set(); // werdykt z pamięci niesie to samo sprawdzenie do kolejnych sesji – liczymy je raz
  for (const raw of sessions) {
    const s = normalizeSession(raw);
    for (const c of s.claims || []) {
      const fb = c.feedback?.rating ? c.feedback : null; // oceny 👍/👎 ze starszych wersji
      if (!fb && !c.recheck) continue;
      if (!fb) {
        const id = `${c.recheck.at}|${c.quote || c.claim}`;
        if (seen.has(id)) continue;
        seen.add(id);
      }
      const src = (s.sources || []).find((x) => x.id === c.srcId) || {};
      const audio = src.kind === "tab" || src.kind === "mic";
      const input = audio
        ? (s.segments || []).filter((x) => x.srcId === src.id && (!c.t || x.t <= c.t)).map((x) => (x.speaker ? `[${x.speaker}] ` : "") + x.text).join(" ").slice(-EXCERPT)
        : String(src.text || "").slice(0, EXCERPT);
      // ocena sprzed „Sprawdź dokładniej” dotyczy poprzedniego werdyktu
      const aboutPrev = c.recheck?.prev && (!fb || (fb.at || 0) <= c.recheck.at);
      const r = aboutPrev ? { ...c, ...c.recheck.prev } : c;
      out.push({
        rating: fb ? (fb.rating > 0 ? "good" : "bad") : "recheck",
        comment: fb?.comment || c.recheck?.note || "",
        rated_at: fb?.at ? new Date(fb.at).toISOString() : c.recheck?.at ? new Date(c.recheck.at).toISOString() : "",
        checked_at: c.t ? new Date(c.t).toISOString() : "",
        provider: r.provider || "", model: r.model || s.model || "", mode: r.mode || "",
        from_memory: !!c.fromMemory,
        verdict: r.verdict, confidence: r.confidence, claim: r.claim, quote: c.quote, speaker: c.speaker,
        explanation: r.explanation, evidence: r.evidence, counter_evidence: r.counter_evidence, missing_data: r.missing_data,
        visual_issues: r.visual_issues || "", sources: r.sources || [], other_factchecks: c.factchecks || [],
        recheck: c.recheck ? {
          at: new Date(c.recheck.at).toISOString(), provider: c.recheck.provider, model: c.recheck.model,
          verdict_before: c.recheck.prev?.verdict || "", verdict_after: c.verdict, explanation_after: c.explanation,
        } : null,
        source: { kind: src.kind || "", title: sourceTitle(src), url: src.url || "", date: src.date || src.meta?.date || "", site: src.meta?.site || "" },
        image_notes: (src.imageNotes || []).filter((n) => !c.image || n.index === c.image),
        input_excerpt: input,
        session: s.id,
      });
    }
  }
  return out.sort((a, b) => b.rated_at.localeCompare(a.rated_at));
}

export async function downloadFile(content, filename, type = "application/json", { folder = "Fact Checker" } = {}) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  try {
    if (globalThis.chrome?.downloads?.download) {
      await chrome.downloads.download({ url, filename: `${folder}/${filename}`, conflictAction: "uniquify", saveAs: false });
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
