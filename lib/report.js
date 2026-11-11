// Raport z sesji (np. z debaty): samodzielny plik HTML z podsumowaniem – do druku / zapisu jako PDF.
import { getLang, t } from "./i18n.js";
import { VERDICTS } from "./factcheck.js";
import { fmtDate, normalizeSession, sourceIcon, sourceTitle, verdictCounts } from "./history.js";
import { ratingTone } from "./factcheckapi.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
const link = (u, text) => (safeUrl(u) ? `<a href="${esc(u)}">${esc(text || u)}</a>` : esc(text || ""));
export const PROBLEM_VERDICTS = ["polprawda", "wprowadza_w_blad", "falsz"];
const COLORS = { good: "#137a4b", warn: "#b07a00", bad: "#b3261e", muted: "#6b7280" };

const CSS = `
*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#17191c;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 24px 40px;background:#fff}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 6px;padding-top:14px;border-top:2px solid #e5e7eb}h3{font-size:15px;margin:18px 0 8px}
.sub{color:#646c76;margin:0 0 14px}.muted{color:#646c76}a{color:#1f4fd1;word-break:break-word}
.bar{display:flex;height:16px;border-radius:8px;overflow:hidden;margin:10px 0;background:#eceef1}.bar span{display:block;height:100%}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb}th{color:#646c76;font-weight:600}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.stat{flex:1 1 140px;border:1px solid #e5e7eb;border-radius:10px;padding:8px 12px}.stat b{display:block;font-size:20px}
.claim{border:1px solid #e5e7eb;border-left:5px solid var(--c);border-radius:10px;padding:10px 14px;margin:10px 0;break-inside:avoid}
.badge{display:inline-block;padding:1px 9px;border-radius:999px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#fff;background:var(--c)}
.lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:#646c76;margin-top:8px}
.ctext{font-weight:600;margin:2px 0}.quote{color:#4b5563;font-style:italic;border-left:2px solid #e5e7eb;padding-left:8px;margin:8px 0 2px}
.small{font-size:12.5px}ul{margin:4px 0;padding-left:18px}.imgs{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0}
.imgs figure{margin:0;width:200px;font-size:12px;color:#4b5563}.imgs img{width:200px;max-height:220px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px;background:#f3f4f6}
.warn{color:#8a5a00}footer{margin-top:30px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:12px;color:#646c76}
@media print{body{background:#fff}main{padding:0;max-width:none}h2{break-after:avoid}a{color:inherit}}
`;

function claimHtml(c) {
  const tone = VERDICTS[c.verdict]?.tone || "muted";
  const rows = [];
  rows.push(`<div><span class="badge">${esc(t(`verdict.${c.verdict}`))}</span> <span class="muted small">${esc(t("card.confidence", { c: t(`conf.${c.confidence}`) }))}${c.image > 0 ? ` · 🖼 ${esc(t("img.fromImage", { n: c.image }))}` : ""}</span></div>`);
  if (c.quote) rows.push(`<div class="quote">${c.speaker ? `<b>${esc(c.speaker)}:</b> ` : ""}„${esc(c.quote)}”</div>`);
  else if (c.speaker) rows.push(`<div class="quote"><b>${esc(c.speaker)}</b></div>`);
  rows.push(`<div class="lbl">${esc(t("card.claimLabel"))}</div><p class="ctext">${esc(c.claim)}</p>`);
  rows.push(`<div class="lbl">${esc(t("card.explLabel"))}</div><p>${esc(c.explanation)}</p>`);
  for (const [k, v] of [["card.visual", c.visual_issues], ["card.evidence", c.evidence], ["card.counter", c.counter_evidence], ["card.missing", c.missing_data]]) {
    if (v) rows.push(`<p class="small"><b>${esc(t(k))}:</b> ${esc(v)}</p>`);
  }
  if (c.sources?.length) rows.push(`<div class="lbl">${esc(t("report.sources"))}</div><ul class="small">${c.sources.map((s) => `<li>${link(s.url, s.title)}</li>`).join("")}</ul>`);
  if (c.factchecks?.length) {
    rows.push(`<div class="lbl">${esc(t("fc.title"))}</div><ul class="small">${c.factchecks.map((f) => `<li><b style="color:${COLORS[ratingTone(f.rating)]}">${esc(f.rating || "?")}</b> – ${esc(f.publisher)}${f.date ? ` (${esc(f.date.slice(0, 10))})` : ""}: ${link(f.url, f.title || f.claim)}</li>`).join("")}</ul>`);
    if (c.fcConflict) rows.push(`<p class="small warn">⚠ ${esc(t("fc.conflict"))}</p>`);
  }
  if (c.fromMemory) rows.push(`<p class="small muted">🧠 ${esc(t("mem.cardNote", { date: fmtDate(c.fromMemory) }))}</p>`);
  return `<article class="claim" style="--c:${COLORS[tone]}">${rows.join("")}</article>`;
}

function verdictBar(claims) {
  const counts = verdictCounts(claims);
  const total = claims.length || 1;
  const parts = Object.entries(VERDICTS).filter(([k]) => counts[k]);
  const shades = { prawda: "#137a4b", raczej_prawda: "#4fa37a", polprawda: "#d19a1c", wprowadza_w_blad: "#d9622b", falsz: "#b3261e", brak_danych: "#9aa2ad", nieweryfikowalne: "#c3c8cf", satyra: "#7c6fb0" };
  const bar = parts.map(([k]) => `<span style="width:${(100 * counts[k]) / total}%;background:${shades[k]}" title="${esc(t(`verdict.${k}`))}: ${counts[k]}"></span>`).join("");
  const legend = parts.map(([k]) => `<span><i style="background:${shades[k]}"></i>${esc(t(`verdict.${k}`))}: <b>${counts[k]}</b></span>`).join("");
  return `<div class="bar">${bar}</div><div class="legend">${legend}</div>`;
}

function speakersTable(claims) {
  const by = new Map();
  for (const c of claims) {
    const who = String(c.speaker || "").replace(/\s*\((cytowany|quoted)\)\s*$/i, "").trim();
    if (!who) continue;
    const r = by.get(who) || { n: 0, bad: 0, ok: 0 };
    r.n++;
    if (PROBLEM_VERDICTS.includes(c.verdict)) r.bad++;
    if (VERDICTS[c.verdict]?.tone === "good") r.ok++;
    by.set(who, r);
  }
  if (!by.size) return "";
  const rows = [...by.entries()].sort((a, b) => b[1].n - a[1].n)
    .map(([who, r]) => `<tr><td>${esc(who)}</td><td>${r.n}</td><td>${r.ok}</td><td>${r.bad}</td></tr>`).join("");
  return `<h3>${esc(t("report.speakers"))}</h3><table><tr><th>${esc(t("report.speaker"))}</th><th>${esc(t("report.claims"))}</th><th>${esc(t("report.true"))}</th><th>${esc(t("report.problems"))}</th></tr>${rows}</table>`;
}

function sourceHtml(s, src) {
  const claims = (s.claims || []).filter((c) => c.srcId === src.id);
  const meta = src.meta || {};
  const date = src.date || meta.date;
  const info = [t(`kind.${src.kind || "tab"}`), meta.site, meta.author && `${t("export.author")}: ${meta.author}`,
    date && `${t("report.published")}: ${esc(String(date).slice(0, 10))}`, src.at && `${t("report.checkedAt")}: ${fmtDate(src.at)}`].filter(Boolean);
  const imgs = (src.images || []).map((im, i) => {
    const note = (src.imageNotes || []).find((x) => x.index === i + 1) || {};
    return `<figure><img src="${esc(im.thumb)}" alt="${esc(t("img.n", { n: i + 1 }))}"><figcaption>🖼 ${i + 1}${note.topic ? ` · ${esc(note.topic)}` : ""}${note.notes ? `<br><span class="warn">${esc(note.notes)}</span>` : ""}</figcaption></figure>`;
  }).join("");
  const title = `${sourceIcon(src)} ${sourceTitle(src)}`;
  return `<section><h2>${safeUrl(src.url) ? link(src.url, title) : esc(title)}</h2><p class="sub small">${info.map(esc).join(" · ")}</p>
${src.fromMemory ? `<p class="small muted">🧠 ${esc(t("mem.groupNote", { date: fmtDate(src.fromMemory.at), model: src.fromMemory.model || "?" }))}</p>` : ""}
${imgs ? `<div class="imgs">${imgs}</div>` : ""}
${claims.length ? `${claims.length > 2 ? verdictBar(claims) : ""}${claims.map(claimHtml).join("")}` : `<p class="muted">${esc(t("src.noClaims"))}</p>`}</section>`;
}

export function reportParts(rec, { version = "", generatedAt = Date.now() } = {}) {
  const s = normalizeSession(rec);
  const claims = s.claims || [];
  const problems = claims.filter((c) => PROBLEM_VERDICTS.includes(c.verdict)).length;
  const models = [...new Set(claims.map((c) => c.model || s.model).filter(Boolean))];
  const end = Math.max(s.startedAt || 0, ...claims.map((c) => c.t || 0), ...(s.sources || []).map((x) => x.at || 0));
  const title = t("report.title");
  const stats = [
    [t("report.sourcesN"), (s.sources || []).length],
    [t("report.claims"), claims.length],
    [t("report.problems"), problems],
    [t("report.withSources"), claims.filter((c) => c.sources?.length).length],
  ].map(([k, v]) => `<div class="stat"><b>${v}</b>${esc(k)}</div>`).join("");
  const body = `<main>
<h1>${esc(title)}</h1>
<p class="sub">${esc(fmtDate(s.startedAt || generatedAt))}${end > (s.startedAt || 0) + 60_000 ? ` – ${esc(fmtDate(end))}` : ""}${models.length ? ` · ${esc(t("report.model"))}: ${esc(models.join(", "))}` : ""}</p>
<div class="stats">${stats}</div>
${claims.length ? `<h3>${esc(t("report.verdicts"))}</h3>${verdictBar(claims)}` : ""}
${speakersTable(claims)}
${(s.sources || []).map((src) => sourceHtml(s, src)).join("\n")}
<footer>${esc(t("report.footer", { date: fmtDate(generatedAt), v: version }))}</footer>
</main>`;
  return { title, css: CSS, body, lang: getLang() };
}

export function toReportHtml(rec, opts = {}) {
  const p = reportParts(rec, opts);
  return `<!doctype html><html lang="${p.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title><style>${p.css}</style></head><body>${p.body}</body></html>`;
}

export function reportFileName(rec) {
  const d = new Date(rec?.startedAt || Date.now());
  const p = (n) => String(n).padStart(2, "0");
  return `fact-check-raport-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.html`;
}
