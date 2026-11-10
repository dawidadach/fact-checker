import { initLang, t } from "./lib/i18n.js";

await initLang();
const q = new URLSearchParams(location.search);
const ok = q.get("ok") === "1";
document.title = t("auth.pageTitle");
document.getElementById("h").textContent = t(ok ? "auth.okTitle" : "auth.failTitle");
document.getElementById("p").textContent = ok
  ? t("auth.okText", { who: q.get("msg") || "?" })
  : q.get("msg") || t("auth.failText");
if (ok) setTimeout(() => window.close(), 2500);
