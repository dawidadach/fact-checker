// Polityka prywatności (PRIVACY.md) jako strona – prosty konwerter Markdown (nagłówki, akapity, listy, tabele, linki).
import { initLang } from "./lib/i18n.js";

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>")
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

export function mdToHtml(md) {
  const out = [];
  const lines = md.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^---+$/.test(l.trim())) { out.push("<hr>"); i++; continue; }
    if (l.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<table><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join("")}</tr>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</table>`);
      continue;
    }
    if (/^- /.test(l)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|- |\||---)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

const lang = await initLang();
const md = await (await fetch(chrome.runtime.getURL("PRIVACY.md"))).text();
const [pl, en = ""] = md.split(/\n---\n/);
const doc = document.getElementById("doc");
const show = (which) => {
  doc.innerHTML = `<a href="#" class="lang" id="switch">${which === "pl" ? "English" : "Polski"}</a>${mdToHtml(which === "pl" ? pl : en)}`;
  document.documentElement.lang = which;
  document.getElementById("switch").onclick = (e) => { e.preventDefault(); show(which === "pl" ? "en" : "pl"); };
};
show(lang === "pl" || !en ? "pl" : "en");
