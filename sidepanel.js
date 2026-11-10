import { buildRequest, isDuplicate, parseResult, unsupportedFeature, VERDICTS } from "./lib/factcheck.js";
import { listModels, streamResponse } from "./lib/llm.js";
import { LocalTranscriber, localEngine, MicTranscriber, TabTranscriber } from "./lib/transcribe.js";
import { deleteModel, detectDevice, getDownloaded, getModel, LANGS, MODELS, storageEstimate, TIERS } from "./lib/models.js";

const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  provider: "chatgpt", apiKey: "", model: "", webSearch: true,
  sttModel: "gpt-4o-mini-transcribe", intervalSec: 30, chunkSec: 12, language: "pl", src: "tab",
  engine: "local", localModel: "",
};
let DEVICE = "cpu";
const downloads = new Map(); // modelId -> {loaded,total}
const MIN_CHARS = 120;       // poniżej tego nie ma sensu sprawdzać
const CONTEXT_CHARS = 1500;  // ile wcześniejszej rozmowy dołączać jako kontekst

let S = { ...DEFAULTS };
const state = {
  running: false, busy: false, transcriber: null, timer: null, pausedUntil: 0,
  segments: [],              // {t, text, checked}
  claims: [],                // wyniki
  disabled: new Set(),       // funkcje odrzucone przez API w tej sesji: webSearch / structured
};

// ---------- ustawienia ----------
async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  S = { ...DEFAULTS, ...(settings || {}) };
  document.querySelector(`input[name=src][value=${S.src}]`).checked = true;
}
const saveSettings = () => chrome.storage.local.set({ settings: S });

function fillSettingsForm() {
  document.querySelector(`input[name=provider][value=${S.provider}]`).checked = true;
  $("apiKey").value = S.apiKey;
  $("webSearch").checked = S.webSearch;
  for (const k of ["sttModel", "intervalSec", "chunkSec", "language"]) $(k).value = S[k];
  document.querySelector(`input[name=engine][value=${S.engine}]`).checked = true;
  renderModels();
  setModelOptions(S.model ? [{ id: S.model, name: S.model }] : [], S.model);
}

function readSettingsForm() {
  S.provider = document.querySelector("input[name=provider]:checked")?.value || "chatgpt";
  S.apiKey = $("apiKey").value.trim();
  S.model = $("model").value;
  S.webSearch = $("webSearch").checked;
  S.sttModel = $("sttModel").value.trim() || DEFAULTS.sttModel;
  S.intervalSec = clamp(+$("intervalSec").value || 30, 10, 300);
  S.chunkSec = clamp(+$("chunkSec").value || 12, 5, 25);
  S.language = $("language").value || "pl";
  S.engine = document.querySelector("input[name=engine]:checked")?.value || "local";
  S.localModel = document.querySelector("input[name=localModel]:checked")?.value || S.localModel;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function setModelOptions(models, selected) {
  const sel = $("model");
  sel.replaceChildren(...(models.length ? models : [{ id: "", name: "— najpierw zaloguj się lub podaj klucz —" }])
    .map((m) => new Option(m.name, m.id, false, m.id === selected)));
}

// ---------- modele lokalne ----------
const mb = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")} GB` : `${n} MB`);

async function renderModels() {
  const have = await getDownloaded();
  const list = $("modelList");
  let selected = document.querySelector("input[name=localModel]:checked")?.value || S.localModel;
  if (!have[selected]) selected = ""; // usunięty model nie może zostać wybrany
  list.replaceChildren();
  for (const lang of Object.keys(LANGS)) {
    const h = document.createElement("h3");
    h.textContent = LANGS[lang];
    list.append(h);
    for (const m of MODELS.filter((x) => x.lang === lang)) {
      const row = document.createElement("div");
      row.className = `model${m.id === selected ? " active" : ""}`;
      const dl = downloads.get(m.id);
      const isHave = !!have[m.id];
      const tooSlow = m.needsGpu && DEVICE === "cpu";
      row.innerHTML = `
        <input type="radio" name="localModel" value="${m.id}" ${m.id === selected ? "checked" : ""} ${isHave ? "" : "disabled"} aria-label="Używaj ${esc(m.name)}">
        <div><span class="mname">${esc(m.name)}</span><span class="tier ${m.tier}">${TIERS[m.tier]}</span></div>
        <div class="actions"></div>
        <div class="meta">${mb(m.size[DEVICE])} ${isHave ? '· <span class="ok">pobrany</span>' : ""}${tooSlow ? ' · <span class="warn">bez GPU będzie za wolny na żywo</span>' : ""}</div>
        <div class="mnote">${esc(m.note)}</div>`;
      const act = row.querySelector(".actions");
      if (dl) {
        const pr = document.createElement("progress");
        if (dl.total) { pr.max = dl.total; pr.value = dl.loaded; }
        row.append(pr);
        act.textContent = dl.total ? `${Math.round((100 * dl.loaded) / dl.total)}%` : "…";
      } else if (isHave) {
        const del = document.createElement("button");
        del.type = "button"; del.textContent = "Usuń";
        del.onclick = async () => {
          if (localEngine.ready?.repo === m.repo) localEngine.unload();
          await deleteModel(m.id);
          if (S.localModel === m.id) { S.localModel = ""; await saveSettings(); }
          renderModels();
        };
        act.append(del);
      } else {
        const get = document.createElement("button");
        get.type = "button"; get.textContent = "Pobierz";
        get.onclick = () => downloadModel(m.id);
        act.append(get);
      }
      row.querySelector("input").onchange = () => { list.querySelectorAll(".model").forEach((r) => r.classList.toggle("active", r === row)); };
      list.append(row);
    }
  }
  const est = await storageEstimate();
  $("storageInfo").textContent = est ? `Zajęte przez wtyczkę: ${mb(est.usageMB)} (dostępne ok. ${mb(est.quotaMB)}).` : "";
  $("deviceInfo").textContent = DEVICE === "gpu"
    ? "Wykryto kartę graficzną (WebGPU) – modele będą działać szybko. Model pobierasz raz, potem działa bez internetu."
    : "Brak WebGPU – modele działają na procesorze. Wybierz Lekki lub Średni. (Włącz akcelerację sprzętową w ustawieniach Chrome, jeśli masz kartę graficzną.)";
}

async function downloadModel(id) {
  if (downloads.size) return; // jeden na raz
  downloads.set(id, { loaded: 0, total: 0 });
  renderModels();
  let last = 0;
  try {
    await localEngine.load(id, DEVICE, (loaded, total) => {
      downloads.set(id, { loaded, total });
      if (Date.now() - last > 300) { last = Date.now(); renderModels(); }
    });
    if (!S.localModel || !(await getDownloaded())[S.localModel]) { S.localModel = id; await saveSettings(); }
  } catch (e) {
    $("deviceInfo").textContent = `Nie udało się pobrać modelu: ${e.message}`;
    downloads.delete(id);
    return;
  }
  downloads.delete(id);
  renderModels();
}

// ---------- konto ChatGPT ----------
const bg = (msg) => chrome.runtime.sendMessage(msg);

async function refreshAccount() {
  const r = await bg({ type: "account" });
  const acc = r?.account;
  $("account").textContent = acc
    ? `Zalogowano: ${acc.email || acc.name || "konto ChatGPT"}${acc.planUsage ? "" : " (bez zgody na użycie planu)"}`
    : "Niezalogowano";
  $("signIn").hidden = !!acc;
  $("signOut").hidden = !acc;
  return acc;
}

async function getToken(provider = S.provider) {
  if (provider === "apikey") {
    if (!S.apiKey) throw Object.assign(new Error("Podaj klucz API OpenAI w ustawieniach."), { code: "NEED_KEY" });
    return S.apiKey;
  }
  const r = await bg({ type: "getToken" });
  if (!r?.ok) throw Object.assign(new Error(r?.error || "Brak tokenu"), { code: r?.code });
  return r.token;
}

async function loadModels(provider = S.provider) {
  const models = await listModels(await getToken(provider));
  if (!models.length) throw new Error("Lista modeli jest pusta.");
  return models;
}

// ---------- UI pomocnicze ----------
function setStatus(text, mode) {
  $("status").textContent = text;
  $("liveDot").className = `dot ${mode || (state.running ? "live" : "")}`;
}
function banner(html, kind = "warn") {
  const b = $("banner");
  if (!html) { b.hidden = true; return; }
  b.className = `banner ${kind === "error" ? "error" : ""}`;
  b.innerHTML = html;
  b.hidden = false;
  b.querySelector("[data-open-settings]")?.addEventListener("click", openSettings);
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hhmm = (t) => new Date(t).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function renderTranscript() {
  const box = $("transcript");
  box.replaceChildren(...state.segments.slice(-200).map((s) => {
    const span = document.createElement("span");
    span.className = s.checked ? "checked" : "";
    span.textContent = s.text + " ";
    return span;
  }));
  box.scrollTop = box.scrollHeight;
  const words = state.segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  $("wordCount").textContent = words ? `· ${words} słów` : "";
}

function renderSummary() {
  const counts = {};
  for (const c of state.claims) counts[c.verdict] = (counts[c.verdict] || 0) + 1;
  const el = $("summary");
  el.replaceChildren(...Object.entries(VERDICTS).filter(([k]) => counts[k]).map(([k, v]) => {
    const p = document.createElement("span");
    p.className = "pill";
    p.dataset.tone = v.tone;
    p.textContent = `${v.label}: ${counts[k]}`;
    return p;
  }));
  el.hidden = !state.claims.length;
}

function addCard(c) {
  const v = VERDICTS[c.verdict];
  const node = $("cardTpl").content.firstElementChild.cloneNode(true);
  node.dataset.tone = v.tone;
  node.classList.add("fresh");
  const pill = node.querySelector(".pill");
  pill.textContent = v.label;
  pill.dataset.tone = v.tone;
  node.querySelector(".conf").textContent = `pewność: ${c.confidence}`;
  node.querySelector("time").textContent = hhmm(c.t);
  const q = node.querySelector(".quote");
  q.textContent = c.quote ? `${c.speaker ? c.speaker + ": " : ""}„${c.quote}”` : "";
  q.hidden = !c.quote;
  node.querySelector(".claim").textContent = c.claim;
  node.querySelector(".expl").textContent = c.explanation;
  const dl = node.querySelector(".more");
  for (const [label, val] of [["Co potwierdza", c.evidence], ["Przeciwne dane / kontekst", c.counter_evidence], ["Czego brakuje", c.missing_data]]) {
    if (!val) continue;
    const dt = document.createElement("dt"); dt.textContent = label;
    const dd = document.createElement("dd"); dd.textContent = val;
    dl.append(dt, dd);
  }
  const ul = node.querySelector(".sources");
  for (const s of c.sources) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = s.title || new URL(s.url).hostname;
    li.append(a);
    ul.append(li);
  }
  $("empty").hidden = true;
  $("feed").prepend(node);
}

// ---------- tekst z transkrypcji ----------
function addText(text) {
  if (!text) return;
  state.segments.push({ t: Date.now(), text, checked: false });
  renderTranscript();
}

// ---------- sprawdzanie ----------
async function runCheck({ force = false, manualText = null } = {}) {
  if (state.busy) return;
  if (Date.now() < state.pausedUntil && !manualText) return;
  const fresh = manualText ? null : state.segments.filter((s) => !s.checked);
  const freshText = manualText ?? fresh.map((s) => s.text).join(" ");
  if (!freshText.trim() || (!force && freshText.length < MIN_CHARS)) return;
  if (!S.model) {
    try {
      const models = await loadModels();
      S.model = models[0].id;
      await saveSettings();
    } catch (e) { return handleError(e); }
  }

  const context = manualText ? "" : state.segments.filter((s) => s.checked).map((s) => s.text).join(" ").slice(-CONTEXT_CHARS);
  fresh?.forEach((s) => (s.checked = true));
  state.busy = true;
  setStatus("Sprawdzam fakty…", "busy");

  try {
    let attempt = 0, result;
    for (;;) {
      const webSearch = S.webSearch && !state.disabled.has("webSearch");
      const body = buildRequest({
        model: S.model,
        today: new Date().toISOString().slice(0, 10),
        webSearch,
        structured: !state.disabled.has("structured"),
        context,
        fresh: freshText,
        checked: state.claims.slice(-25).map((c) => c.claim),
      });
      try {
        result = await streamResponse({ token: await getToken(), body });
        break;
      } catch (e) {
        const feat = unsupportedFeature(e);
        if (feat && !state.disabled.has(feat) && attempt++ < 2) {
          state.disabled.add(feat);
          if (feat === "webSearch") banner("Wyszukiwanie w sieci nie jest dostępne dla tego konta/modelu – oceny opierają się na wiedzy modelu, sprawdzaj świeże wydarzenia ostrożniej.");
          continue;
        }
        throw e;
      }
    }
    let claims = parseResult(result.text);
    if (claims.length === 1 && !claims[0].sources.length) claims[0].sources = result.citations.slice(0, 5);
    const seen = state.claims.map((c) => c.claim);
    claims = claims.filter((c) => !isDuplicate(c.claim, seen));
    for (const c of claims) {
      c.t = Date.now();
      state.claims.push(c);
      addCard(c);
    }
    renderSummary();
    if (!state.disabled.has("webSearch") && $("banner").classList.contains("error")) banner(null);
    setStatus(claims.length ? `Nowe: ${claims.length} · łącznie ${state.claims.length}` : "Brak nowych twierdzeń do sprawdzenia");
  } catch (e) {
    fresh?.forEach((s) => (s.checked = false)); // spróbujemy przy następnej okazji
    handleError(e);
  } finally {
    state.busy = false;
    renderTranscript();
    if (!state.running) $("liveDot").className = "dot";
  }
}

function handleError(e) {
  console.error(e);
  const code = e.code || "";
  if (code === "NEED_LOGIN") {
    banner(`${esc(e.message)} <a href="#" data-open-settings>Otwórz ustawienia</a>`, "error");
  } else if (code === "NEED_KEY") {
    banner(`${esc(e.message)} <a href="#" data-open-settings>Otwórz ustawienia</a>`, "error");
  } else if (code === "subscription_sharing_usage_limit_exceeded") {
    state.pausedUntil = Date.now() + 10 * 60_000;
    banner('Osiągnięto limit użycia planu ChatGPT dla tej aplikacji. Sprawdzanie wstrzymane na 10 min. <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener">Limity w ChatGPT</a>', "error");
  } else if (["subscription_sharing_usage_unavailable", "subscription_sharing_user_unavailable"].includes(code) || e.status >= 500) {
    state.pausedUntil = Date.now() + 60_000;
    banner("Serwis chwilowo niedostępny – ponowię za minutę.");
  } else if (e.status === 401 || code === "subscription_sharing_invalid_user") {
    banner(`Autoryzacja odrzucona (${esc(code || e.status)}). Zaloguj się ponownie lub sprawdź klucz. <a href="#" data-open-settings>Ustawienia</a>`, "error");
  } else {
    banner(`Błąd: ${esc(e.message)}${code ? ` <span class="muted">(${esc(code)})</span>` : ""}`, "error");
  }
  setStatus("Błąd – szczegóły powyżej", "");
}

// ---------- start / stop ----------
async function start() {
  banner(null);
  S.src = document.querySelector("input[name=src]:checked").value;
  await saveSettings();
  const common = {
    language: S.language,
    onText: addText,
    onStatus: (t) => setStatus(t),
    onError: (e) => {
      if (e.code === "MIC_PERMISSION") {
        stop();
        banner('Chrome potrzebuje zgody na mikrofon dla wtyczki. Otworzyłem kartę z prośbą o dostęp – zezwól i kliknij Start ponownie.', "error");
        chrome.tabs.create({ url: chrome.runtime.getURL("mic-permission.html") });
      } else handleError(e);
    },
  };
  try {
    if (S.engine === "local") {
      const have = await getDownloaded();
      const m = getModel(S.localModel);
      if (!m || !have[m.id]) {
        banner('Pobierz model mowy w ustawieniach (Modele lokalne) – wystarczy raz. <a href="#" data-open-settings>Otwórz ustawienia</a>', "error");
        return;
      }
      if (m.lang === "en" && S.language === "pl") banner(`Model ${esc(m.name)} rozumie tylko angielski, a język rozmowy to polski – zmień model w ustawieniach.`);
      state.transcriber = new LocalTranscriber({
        ...common, modelId: m.id, device: have[m.id].device || DEVICE, chunkSec: S.chunkSec,
        onLatency: ({ audioSec, ms, backlog }) => {
          if (backlog >= 3) banner(`Komputer nie nadąża z transkrypcją (${(ms / 1000).toFixed(1)} s na ${audioSec.toFixed(0)} s nagrania). Wybierz lżejszy model.`);
        },
      });
      if (S.src === "tab") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error("Nie znaleziono aktywnej karty.");
        await state.transcriber.start({ tabId: tab.id });
      } else {
        await state.transcriber.start();
      }
    } else if (S.src === "tab" && S.engine === "openai") {
      if (!S.apiKey) {
        banner('Transkrypcja dźwięku z karty wymaga klucza API OpenAI. <a href="#" data-open-settings>Dodaj klucz</a> albo przełącz na „Mikrofon” (darmowe).', "error");
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("Nie znaleziono aktywnej karty.");
      state.transcriber = new TabTranscriber({ ...common, apiKey: S.apiKey, model: S.sttModel, chunkSec: S.chunkSec });
      await state.transcriber.start(tab.id);
    } else if (S.src === "tab") {
      banner("Rozpoznawanie mowy wbudowane w Chrome działa tylko z mikrofonem. Wybierz lokalny model albo OpenAI w ustawieniach.", "error");
      return;
    } else if (S.engine === "openai") {
      banner("Tryb OpenAI obsługuje na razie tylko dźwięk karty. Dla mikrofonu wybierz lokalny model.", "error");
      return;
    } else {
      state.transcriber = new MicTranscriber({ ...common, onInterim: (t) => ($("interim").textContent = t) });
      await state.transcriber.start();
    }
  } catch (e) {
    state.transcriber = null;
    if (e.name === "NotAllowedError" && S.src === "mic") {
      banner("Chrome potrzebuje zgody na mikrofon dla wtyczki. Otworzyłem kartę z prośbą o dostęp – zezwól i kliknij Start ponownie.", "error");
      chrome.tabs.create({ url: chrome.runtime.getURL("mic-permission.html") });
      return;
    }
    let msg = e.message;
    if (e.name === "NotAllowedError" && S.src === "tab") {
      msg = "Nie wybrano karty do nagrania. Kliknij Start i wskaż kartę z rozmową – albo najpierw kliknij ikonę Fact Checkera na pasku, będąc na tej karcie (wtedy okno wyboru się nie pojawi).";
    }
    banner(esc(msg), "error");
    return;
  }
  state.running = true;
  $("toggle").textContent = "Stop";
  $("toggle").classList.add("stop");
  $("liveDot").className = "dot live";
  state.timer = setInterval(() => runCheck(), S.intervalSec * 1000);
}

function stop() {
  state.running = false;
  clearInterval(state.timer);
  state.transcriber?.stop();
  state.transcriber = null;
  $("interim").textContent = "";
  $("toggle").textContent = "Start";
  $("toggle").classList.remove("stop");
  $("liveDot").className = "dot";
  runCheck({ force: true }); // dokończ to, co zostało
}

// ---------- eksport ----------
function exportMarkdown() {
  const lines = [`# Fact-checking – ${new Date().toLocaleString("pl-PL")}`, ""];
  for (const c of state.claims) {
    lines.push(`## ${VERDICTS[c.verdict].label}: ${c.claim}`, "");
    if (c.quote) lines.push(`> ${c.speaker ? c.speaker + ": " : ""}${c.quote}`, "");
    lines.push(c.explanation, "");
    if (c.evidence) lines.push(`**Co potwierdza:** ${c.evidence}`, "");
    if (c.counter_evidence) lines.push(`**Przeciwne dane / kontekst:** ${c.counter_evidence}`, "");
    if (c.missing_data) lines.push(`**Czego brakuje:** ${c.missing_data}`, "");
    for (const s of c.sources) lines.push(`- [${s.title || s.url}](${s.url})`);
    lines.push("");
  }
  lines.push("---", "", "## Transkrypcja", "", state.segments.map((s) => s.text).join(" "));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" }));
  a.download = `fact-check-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- ustawienia: dialog ----------
async function openSettings(ev) {
  ev?.preventDefault?.();
  fillSettingsForm();
  $("settings").showModal();
  await refreshAccount();
  tryLoadModels(true);
}

async function tryLoadModels(quiet = false) {
  const provider = document.querySelector("input[name=provider]:checked")?.value;
  const prevKey = S.apiKey;
  S.apiKey = $("apiKey").value.trim(); // pozwól sprawdzić klucz przed zapisem
  try {
    const models = await loadModels(provider);
    const keep = models.some((m) => m.id === S.model) ? S.model : models[0].id;
    setModelOptions(models, keep);
  } catch (e) {
    if (!quiet) alertInDialog(e.message);
  } finally {
    S.apiKey = prevKey;
  }
}
function alertInDialog(msg) {
  $("account").textContent = msg;
}

// ---------- zdarzenia ----------
$("toggle").addEventListener("click", () => (state.running ? stop() : start()));
$("openSettings").addEventListener("click", openSettings);
$("checkNow").addEventListener("click", () => runCheck({ force: true }));
$("manualCheck").addEventListener("click", () => {
  const t = $("manualText").value.trim();
  if (t) runCheck({ force: true, manualText: t }).then(() => ($("manualText").value = ""));
});
$("exportMd").addEventListener("click", exportMarkdown);
$("clear").addEventListener("click", () => {
  state.segments = []; state.claims = [];
  $("feed").querySelectorAll(".card").forEach((n) => n.remove());
  $("empty").hidden = false;
  renderTranscript(); renderSummary(); banner(null);
});
$("signIn").addEventListener("click", async () => {
  $("account").textContent = "Otwieram logowanie ChatGPT w nowej karcie…";
  const r = await bg({ type: "signIn" });
  if (!r?.ok) $("account").textContent = r?.error || "Nie udało się rozpocząć logowania.";
});
$("signOut").addEventListener("click", async () => { await bg({ type: "signOut" }); refreshAccount(); });
$("loadModels").addEventListener("click", () => tryLoadModels(false));
document.querySelectorAll("input[name=provider]").forEach((r) => r.addEventListener("change", () => tryLoadModels(true)));
$("settingsForm").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return;
  readSettingsForm();
  await saveSettings();
  banner(null);
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "tab-invoked") {
    if (!state.running) {
      banner(null);
      setStatus(`Gotowy do nagrania: ${msg.title || "bieżąca karta"}`);
    }
    return;
  }
  if (msg?.type !== "auth-changed") return;
  refreshAccount();
  if (msg.ok) { tryLoadModels(true); banner(null); } else banner(`Logowanie: ${esc(msg.msg)}`, "error");
});

await loadSettings();
document.querySelector("#settings h2").textContent = `Ustawienia · wersja ${chrome.runtime.getManifest().version}`;
DEVICE = await detectDevice();
if (S.provider === "chatgpt") {
  const acc = await refreshAccount().catch(() => null);
  if (!acc && !S.apiKey) banner('Zaloguj się przez ChatGPT albo podaj klucz API, żeby zacząć. <a href="#" data-open-settings>Ustawienia</a>');
}
