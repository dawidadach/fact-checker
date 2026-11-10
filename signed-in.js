const q = new URLSearchParams(location.search);
const ok = q.get("ok") === "1";
document.getElementById("h").textContent = ok ? "Zalogowano przez ChatGPT" : "Logowanie nieudane";
document.getElementById("p").textContent = ok
  ? `Konto: ${q.get("msg") || "?"}. Możesz zamknąć tę kartę i wrócić do panelu Fact Checker.`
  : q.get("msg") || "Spróbuj ponownie z panelu Fact Checker.";
if (ok) setTimeout(() => window.close(), 2500);
