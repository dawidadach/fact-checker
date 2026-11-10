import { buildRequest, isDuplicate, parseResult, unsupportedFeature, VERDICTS } from "./lib/factcheck.js";
import { listModels, streamResponse } from "./lib/llm.js";
import { LocalTranscriber, localEngine, MicTranscriber, TabTranscriber } from "./lib/transcribe.js";
import { deleteModel, detectDevice, getDownloaded, getModel, LANGS, MODELS, storageEstimate } from "./lib/models.js";
import { applyI18n, getLang, resolveLang, setLang, t } from "./lib/i18n.js";

const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  provider: "chatgpt", apiKey: "", model: "", webSearch: true,
  sttModel: "gpt-4o-mini-transcribe", intervalSec: 30, chunkSec: 12, language: "pl", src: "tab",
  engine: "local", localModel: "", uiLang: "auto",
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
  for (const k of ["sttModel", "intervalSec", "chunkSec", "language", "uiLang"]) $(k).value = S[k];
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
  S.uiLang = $("uiLang").value || "auto";
  S.engine = document.querySelector("input[name=engine]:checked")?.value || "local";
  S.localModel = document.querySelector("input[name=localModel]:checked")?.value || S.localModel;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function setModelOptions(models, selected) {
  const sel = $("model");
  sel.replaceChildren(...(models.length ? models : [{ id: "", name: t("set.modelEmpty") }])
    .map((m) => new Option(m.name, m.id, false, m.id === selected)));
}

// ---------- modele lokalne ----------
const mb = (n) => {
  if (n < 1000) return `${n} MB`;
  const gb = (n / 1000).toFixed(1);
  return `${getLang() === "pl" ? gb.replace(".", ",") : gb} GB`;
};

async function renderModels() {
  const have = await getDownloaded();
  const list = $("modelList");
  let selected = document.querySelector("input[name=localModel]:checked")?.value || S.localModel;
  if (!have[selected]) selected = ""; // usunięty model nie może zostać wybrany
  list.replaceChildren();
  for (const lang of Object.keys(LANGS)) {
    const h = document.createElement("h3");
    h.textContent = t(`lang.${lang}`);
    list.append(h);
    for (const m of MODELS.filter((x) => x.lang === lang)) {
      const row = document.createElement("div");
      row.className = `model${m.id === selected ? " active" : ""}`;
      const dl = downloads.get(m.id);
      const isHave = !!have[m.id];
      const tooSlow = m.needsGpu && DEVICE === "cpu";
      row.innerHTML = `
        <input type="radio" name="localModel" value="${m.id}" ${m.id === selected ? "checked" : ""} ${isHave ? "" : "disabled"} aria-label="${esc(t("models.use", { name: m.name }))}">
        <div><span class="mname">${esc(m.name)}</span><span class="tier ${m.tier}">${t(`models.tier.${m.tier}`)}</span></div>
        <div class="actions"></div>
        <div class="meta">${mb(m.size[DEVICE])} ${isHave ? `· <span class="ok">${t("models.downloaded")}</span>` : ""}${tooSlow ? ` · <span class="warn">${t("models.tooSlow")}</span>` : ""}</div>
        <div class="mnote">${esc(m.note[getLang()] || m.note.en)}</div>`;
      const act = row.querySelector(".actions");
      if (dl) {
        const pr = document.createElement("progress");
        if (dl.total) { pr.max = dl.total; pr.value = dl.loaded; }
        row.append(pr);
        act.textContent = dl.total ? `${Math.round((100 * dl.loaded) / dl.total)}%` : "…";
      } else if (isHave) {
        const del = document.createElement("button");
        del.type = "button"; del.textContent = t("models.delete");
        del.onclick = async () => {
          if (localEngine.ready?.repo === m.repo) localEngine.unload();
          await deleteModel(m.id);
          if (S.localModel === m.id) { S.localModel = ""; await saveSettings(); }
          renderModels();
        };
        act.append(del);
      } else {
        const get = document.createElement("button");
        get.type = "button"; get.textContent = t("models.download");
        get.onclick = () => downloadModel(m.id);
        act.append(get);
      }
      row.querySelector("input").onchange = () => {
        list.querySelectorAll(".model").forEach((r) => r.classList.toggle("active", r === row));
        if (!m.multilingual) $("language").value = m.lang; // model tylko angielski → rozmowa po angielsku
      };
      list.append(row);
    }
  }
  const est = await storageEstimate();
  $("storageInfo").textContent = est ? t("models.storage", { used: mb(est.usageMB), quota: mb(est.quotaMB) }) : "";
  $("deviceInfo").textContent = t(DEVICE === "gpu" ? "models.gpu" : "models.cpu");
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
    $("deviceInfo").textContent = t("models.failed", { msg: e.message });
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
    ? t("acc.signedIn", { who: acc.email || acc.name || t("acc.chatgptAccount") }) + (acc.planUsage ? "" : t("acc.noPlan"))
    : t("acc.signedOut");
  $("signIn").hidden = !!acc;
  $("signOut").hidden = !acc;
  return acc;
}

async function getToken(provider = S.provider) {
  if (provider === "apikey") {
    if (!S.apiKey) throw Object.assign(new Error(t("err.needKey")), { code: "NEED_KEY" });
    return S.apiKey;
  }
  const r = await bg({ type: "getToken" });
  if (!r?.ok) throw Object.assign(new Error(r?.error || t("err.noToken")), { code: r?.code });
  return r.token;
}

async function loadModels(provider = S.provider) {
  const models = await listModels(await getToken(provider));
  if (!models.length) throw new Error(t("err.noModels"));
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
const locale = () => (getLang() === "pl" ? "pl-PL" : "en-GB");
const hhmm = (ts) => new Date(ts).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const verdictLabel = (v) => t(`verdict.${v}`);
const openSettingsLink = (key = "err.openSettings") => ` <a href="#" data-open-settings>${t(key)}</a>`;

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
  $("wordCount").textContent = words ? t("tx.words", { n: words }) : "";
}

function renderSummary() {
  const counts = {};
  for (const c of state.claims) counts[c.verdict] = (counts[c.verdict] || 0) + 1;
  const el = $("summary");
  el.replaceChildren(...Object.entries(VERDICTS).filter(([k]) => counts[k]).map(([k, v]) => {
    const p = document.createElement("span");
    p.className = "pill";
    p.dataset.tone = v.tone;
    p.textContent = `${verdictLabel(k)}: ${counts[k]}`;
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
  pill.textContent = verdictLabel(c.verdict);
  pill.dataset.tone = v.tone;
  node.querySelector(".conf").textContent = t("card.confidence", { c: t(`conf.${c.confidence}`) });
  node.querySelector("time").textContent = hhmm(c.t);
  const q = node.querySelector(".quote");
  q.textContent = c.quote ? `${c.speaker ? c.speaker + ": " : ""}„${c.quote}”` : "";
  q.hidden = !c.quote;
  node.querySelector(".claim").textContent = c.claim;
  node.querySelector(".expl").textContent = c.explanation;
  const dl = node.querySelector(".more");
  for (const [label, val] of [[t("card.evidence"), c.evidence], [t("card.counter"), c.counter_evidence], [t("card.missing"), c.missing_data]]) {
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
  return node;
}

// Po zmianie języka: przerysuj karty (etykiety werdyktów itp.).
function rerenderCards() {
  $("feed").querySelectorAll(".card").forEach((n) => n.remove());
  for (const c of state.claims) addCard(c).classList.remove("fresh");
  $("empty").hidden = state.claims.length > 0;
  renderSummary();
  renderTranscript();
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
  setStatus(t("status.checking"), "busy");

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
        outLang: getLang(),
      });
      try {
        result = await streamResponse({ token: await getToken(), body });
        break;
      } catch (e) {
        const feat = unsupportedFeature(e);
        if (feat && !state.disabled.has(feat) && attempt++ < 2) {
          state.disabled.add(feat);
          if (feat === "webSearch") banner(esc(t("err.noSearch")));
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
    setStatus(claims.length ? t("status.new", { n: claims.length, total: state.claims.length }) : t("status.none"));
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
  if (code === "NEED_LOGIN" || code === "NEED_KEY") {
    banner(esc(e.message) + openSettingsLink(), "error");
  } else if (code === "subscription_sharing_usage_limit_exceeded") {
    state.pausedUntil = Date.now() + 10 * 60_000;
    banner(`${esc(t("err.limit"))} <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener">${t("err.limitLink")}</a>`, "error");
  } else if (["subscription_sharing_usage_unavailable", "subscription_sharing_user_unavailable"].includes(code) || e.status >= 500) {
    state.pausedUntil = Date.now() + 60_000;
    banner(esc(t("err.unavailable")));
  } else if (e.status === 401 || code === "subscription_sharing_invalid_user") {
    banner(esc(t("err.auth", { code: code || e.status })) + openSettingsLink("err.settings"), "error");
  } else {
    banner(`${esc(t("err.generic", { msg: e.message }))}${code ? ` <span class="muted">(${esc(code)})</span>` : ""}`, "error");
  }
  setStatus(t("status.error"), "");
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
        banner(esc(t("err.micPermission")), "error");
        chrome.tabs.create({ url: chrome.runtime.getURL("mic-permission.html") });
      } else handleError(e);
    },
  };
  try {
    if (S.engine === "local") {
      const have = await getDownloaded();
      const m = getModel(S.localModel);
      if (!m || !have[m.id]) {
        banner(esc(t("err.needModel")) + openSettingsLink(), "error");
        return;
      }
      state.transcriber = new LocalTranscriber({
        ...common, modelId: m.id, device: have[m.id].device || DEVICE, chunkSec: S.chunkSec,
        language: m.multilingual ? S.language : m.lang, // model tylko angielski = rozmowa po angielsku
        onLatency: ({ audioSec, ms, backlog }) => {
          if (backlog >= 3) banner(esc(t("err.slow", { ms: (ms / 1000).toFixed(1), sec: audioSec.toFixed(0) })));
        },
      });
      if (S.src === "tab") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error(t("err.noActiveTab"));
        await state.transcriber.start({ tabId: tab.id });
      } else {
        await state.transcriber.start();
      }
    } else if (S.src === "tab" && S.engine === "openai") {
      if (!S.apiKey) {
        banner(`${esc(t("err.needKeyTab"))}${openSettingsLink("err.addKey")} ${esc(t("err.orMic"))}`, "error");
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error(t("err.noActiveTab"));
      state.transcriber = new TabTranscriber({ ...common, apiKey: S.apiKey, model: S.sttModel, chunkSec: S.chunkSec });
      await state.transcriber.start(tab.id);
    } else if (S.src === "tab") {
      banner(esc(t("err.chromeMicOnly")), "error");
      return;
    } else if (S.engine === "openai") {
      banner(esc(t("err.openaiTabOnly")), "error");
      return;
    } else {
      state.transcriber = new MicTranscriber({ ...common, onInterim: (t) => ($("interim").textContent = t) });
      await state.transcriber.start();
    }
  } catch (e) {
    state.transcriber = null;
    if (e.name === "NotAllowedError" && S.src === "mic") {
      banner(esc(t("err.micPermission")), "error");
      chrome.tabs.create({ url: chrome.runtime.getURL("mic-permission.html") });
      return;
    }
    let msg = e.message;
    if (e.name === "NotAllowedError" && S.src === "tab") {
      msg = t("err.noTabPicked");
    }
    banner(esc(msg), "error");
    return;
  }
  state.running = true;
  $("toggle").textContent = t("btn.stop");
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
  $("toggle").textContent = t("btn.start");
  $("toggle").classList.remove("stop");
  $("liveDot").className = "dot";
  runCheck({ force: true }); // dokończ to, co zostało
}

// ---------- eksport ----------
function exportMarkdown() {
  const lines = [`# ${t("export.title", { date: new Date().toLocaleString(locale()) })}`, ""];
  for (const c of state.claims) {
    lines.push(`## ${verdictLabel(c.verdict)}: ${c.claim}`, "");
    if (c.quote) lines.push(`> ${c.speaker ? c.speaker + ": " : ""}${c.quote}`, "");
    lines.push(c.explanation, "");
    if (c.evidence) lines.push(`**${t("card.evidence")}:** ${c.evidence}`, "");
    if (c.counter_evidence) lines.push(`**${t("card.counter")}:** ${c.counter_evidence}`, "");
    if (c.missing_data) lines.push(`**${t("card.missing")}:** ${c.missing_data}`, "");
    for (const s of c.sources) lines.push(`- [${s.title || s.url}](${s.url})`);
    lines.push("");
  }
  lines.push("---", "", `## ${t("export.transcript")}`, "", state.segments.map((s) => s.text).join(" "));
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
  $("account").textContent = t("acc.opening");
  const r = await bg({ type: "signIn" });
  if (!r?.ok) $("account").textContent = r?.error || t("acc.startFailed");
});
$("signOut").addEventListener("click", async () => { await bg({ type: "signOut" }); refreshAccount(); });
$("loadModels").addEventListener("click", () => tryLoadModels(false));
document.querySelectorAll("input[name=provider]").forEach((r) => r.addEventListener("change", () => tryLoadModels(true)));
$("settingsForm").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return;
  const prevLang = getLang();
  readSettingsForm();
  await saveSettings();
  banner(null);
  if (setLang(resolveLang(S.uiLang)) !== prevLang) localize(true);
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "tab-invoked") {
    if (!state.running) {
      banner(null);
      setStatus(t("status.readyTab", { title: msg.title || t("status.currentTab") }));
    }
    return;
  }
  if (msg?.type !== "auth-changed") return;
  refreshAccount();
  if (msg.ok) { tryLoadModels(true); banner(null); } else banner(esc(t("err.signIn", { msg: msg.msg })), "error");
});

// Język interfejsu: z ustawień albo z przeglądarki.
function localize(rerender = false) {
  applyI18n();
  $("settingsTitle").textContent = t("app.settingsVersion", { v: chrome.runtime.getManifest().version });
  $("toggle").textContent = t(state.running ? "btn.stop" : "btn.start");
  if (!state.running && !state.busy) setStatus(t("app.ready"));
  if (rerender) {
    rerenderCards();
    if ($("settings").open) { renderModels(); refreshAccount(); }
  }
}

await loadSettings();
setLang(resolveLang(S.uiLang));
localize();
DEVICE = await detectDevice();
if (S.provider === "chatgpt") {
  const acc = await refreshAccount().catch(() => null);
  if (!acc && !S.apiKey) banner(esc(t("err.welcome")) + openSettingsLink("err.settings"));
}
