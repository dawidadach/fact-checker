// Panel boczny nie potrafi sam wyświetlić prośby o mikrofon – robi to ta karta, a zgoda obowiązuje potem w całej wtyczce.
import { initLang, t } from "./lib/i18n.js";

await initLang();
document.title = `Fact Checker – ${t("mic.title")}`;
document.getElementById("h").textContent = t("mic.title");
const p = document.getElementById("p");
p.textContent = t("mic.ask");
navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
  s.getTracks().forEach((tr) => tr.stop());
  p.textContent = t("mic.ok");
  setTimeout(() => window.close(), 2500);
}, (e) => {
  p.textContent = t("mic.denied", { e: e.name });
});
