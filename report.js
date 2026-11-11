// Strona raportu: sesja z historii jako czytelny dokument – do druku / zapisu jako PDF albo pobrania jako HTML.
import { initLang, t } from "./lib/i18n.js";
import { downloadFile, getSession } from "./lib/history.js";
import { reportFileName, reportParts, toReportHtml } from "./lib/report.js";

await initLang();
const $ = (id) => document.getElementById(id);
$("print").textContent = `🖨 ${t("report.print")}`;
$("download").textContent = `⬇ ${t("report.download")}`;
const id = decodeURIComponent(location.hash.slice(1));
const rec = id ? await getSession(id).catch(() => null) : null;
const m = chrome.runtime.getManifest();
const version = m.version_name || m.version;
if (!rec) {
  $("report").textContent = t("report.missing");
  $("print").disabled = $("download").disabled = true;
} else {
  const parts = reportParts(rec, { version });
  document.title = `${parts.title} – Fact Checker`;
  document.documentElement.lang = parts.lang;
  const style = document.createElement("style");
  style.textContent = parts.css;
  document.head.append(style);
  $("report").innerHTML = parts.body; // wszystko w raporcie jest escapowane w lib/report.js
  $("print").onclick = () => window.print();
  $("download").onclick = async () => {
    await downloadFile(toReportHtml(rec, { version }), reportFileName(rec), "text/html");
    $("msg").textContent = t("report.saved");
  };
}
