import { buildRecheckRequest, buildRequest, buildTextRequest, chunkText, isDuplicate, parseImageNotes, parseResult, unsupportedFeature, VERDICTS } from "./lib/factcheck.js";
import { parseTricks, trickName, TRICKS } from "./lib/tricks.js";
import { sourceTier, TIER_TONE } from "./lib/sourcetier.js";
import { scamHint, scamSignals } from "./lib/scam.js";
import { certInfoStored, certList, lookup as certLookup } from "./lib/certlist.js";
import { PageAccessError, runInTab, sameUrl } from "./lib/capture.js";
import { callModel, KEY_PROVIDERS, listProviderModels, PROVIDERS, providerName } from "./lib/providers.js";
import { LocalTranscriber, localEngine, MicTranscriber, TabTranscriber } from "./lib/transcribe.js";
import { deleteModel, detectDevice, getDownloaded, getModel, LANGS, MODELS, storageEstimate } from "./lib/models.js";
import { applyI18n, getLang, resolveLang, setLang, t } from "./lib/i18n.js";
import {
  deleteSession, clearSessions, downloadMarkdown, fmtDate, getSession, hasContent, listSessions, matchesQuery,
  putSession, scamLine, sessionIcon, sessionTitle, verdictCounts, wordCount, lastActivity, isPageKind, sourceIcon, sourceTitle, cleanTitle,
  ratedClaims, downloadFile,
} from "./lib/history.js";
import { addTo, emptyUsage, fmtTokens, fmtUsd, localDay, modeOf, MODES, priceFor, usageCost } from "./lib/pricing.js";
import { conflicts, FactCheckApiError, pickFactChecks, queryFor, ratingTone, searchClaims } from "./lib/factcheckapi.js";
import { clearMemory, contentKey, findImages, findInMemory, memoryCount, saveToMemory } from "./lib/memory.js";
import { PROBLEM_VERDICTS } from "./lib/report.js";
import { buildReplyRequest, composeReply, originalReply, parseReply, REPLY_TABS, templateReply, X_LIMIT, xLength } from "./lib/reply.js";
import { buildSummaryRequest, GENRE_TONE, LEVEL_TONE, LEVELS, needsSummary, parseSummary, severityRank, summaryKey, validSummary } from "./lib/summary.js";

const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  provider: "chatgpt", apiKey: "", model: "", webSearch: true,
  keys: {},   // klucze: gemini / anthropic / openrouter (klucz OpenAI to apiKey – służy też do transkrypcji OpenAI)
  models: {}, // wybrany model osobno dla każdego dostawcy
  sttModel: "gpt-4o-mini-transcribe", intervalSec: 30, chunkSec: 12, language: "pl", src: "tab",
  engine: "local", localModel: "", uiLang: "auto", autoExport: false, sessionGapH: 3,
  mode: "normal",        // oszczędny / normalny / dokładny (lib/pricing.js → MODES)
  dailyLimit: 0,         // dzienny limit wydatków w USD (0 = bez limitu)
  priceIn: "", priceOut: "", // własne ceny modelu ($ za 1M tokenów) – puste = z cennika w lib/pricing.js
  memoryDays: 30,        // pamięć werdyktów (0 = wyłączona)
  rememberKeys: true,    // false → klucze tylko do zamknięcia przeglądarki (chrome.storage.session)
  maskPeople: false,     // zamazywanie zdjęć profilowych i nazw autorów na zrzutach + bez autora w tekście
  onlyProblems: false,   // filtr: tylko problematyczne werdykty
  autoSummary: true,     // ocena całości artykułu / posta (od 2 twierdzeń) pisana od razu po werdyktach
  tricks: true,          // chwyty erystyczne (fałszywy dylemat, atak na osobę…) – kilka procent tokenów więcej
  scamCheck: true,       // sygnały oszustwa w adresie i treści – lokalnie, 0 tokenów
  certList: true,        // Lista Ostrzeżeń CERT Polska – cały plik raz na 12 h, sprawdzanie u siebie
  replyTone: "plain",    // ostatnio używany ton odpowiedzi do wklejenia (rzeczowo / na luzie)
};
const SECRET_KEYS = ["apiKey", "keys"]; // to, co przy „nie zapamiętuj kluczy” trafia tylko do pamięci sesji przeglądarki
let DEVICE = "cpu";
const downloads = new Map(); // modelId -> {loaded,total}
const MIN_CHARS = 120;       // poniżej tego nie ma sensu sprawdzać
const CONTEXT_CHARS = 1500;  // ile wcześniejszej rozmowy dołączać jako kontekst
const PREVIEW_CHARS = 2000;  // tekst ze strony dłuższy niż to → podgląd przed wysłaniem
const MAX_TEXT = 48000;      // maks. długość tekstu ze strony (≈ 4 zapytania)
const CHUNK_CHARS = 12000;   // długość jednej części tekstu w zapytaniu

let S = { ...DEFAULTS };

// ---------- sesja (zapis automatyczny w historii) ----------
// Sesja = jedno „posiedzenie”. Wszystko, co sprawdzasz (wideo, posty, artykuły, zaznaczenia), trafia do
// bieżącej sesji jako kolejne ŹRÓDŁO. Nowa sesja zaczyna się tylko po kliknięciu „Nowa sesja” albo po przerwie
// dłuższej niż ustawiona w ⚙ (domyślnie 3 h). Po otwarciu panelu ostatnia sesja wraca, jeśli przerwa była krótsza.
const session = { id: null, startedAt: 0, sources: [], usage: emptyUsage() };
let saveTimer = null;
let saveDue = 0; // najpóźniej wtedy zapisujemy, nawet gdy zmiany wciąż napływają
let srcSeq = 0;

const stateContent = () => ({ claims: state.claims, segments: state.segments, sources: session.sources });
function snapshot() {
  return {
    id: session.id,
    startedAt: session.startedAt,
    sources: session.sources,
    updatedAt: Date.now(),
    model: S.model,
    usage: session.usage,
    claims: state.claims,
    segments: state.segments.map(({ t: ts, text, checked, srcId, speaker }) => ({ t: ts, text, checked, srcId, ...(speaker ? { speaker } : {}) })),
  };
}
// Wołane po każdej zmianie: zakłada sesję przy pierwszej treści i zapisuje ją z lekkim opóźnieniem.
function touchSession() {
  if (!hasContent(stateContent())) return;
  if (!session.id) {
    session.id = crypto.randomUUID();
    session.startedAt = Math.min(...[session.sources[0]?.at, state.segments[0]?.t, Date.now()].filter(Boolean));
  }
  // Zapis z lekkim opóźnieniem (seria zmian = jeden zapis), ale najpóźniej po 4 s – wcześniej każda kolejna zmiana
  // odsuwała zapis i po zamknięciu panelu zaraz po kilku sprawdzeniach ostatnie wyniki mogły nie trafić do historii.
  if (!saveTimer) saveDue = Date.now() + 4000;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSessionNow, Math.max(0, Math.min(1500, saveDue - Date.now())));
}
async function saveSessionNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  saveDue = 0;
  if (!session.id || !hasContent(stateContent())) return;
  try {
    await putSession(snapshot());
  } catch (e) {
    console.error(e);
    banner(esc(t("err.saveFailed", { msg: e.message })), "error");
  }
}
// Nowa sesja: poprzednia zostaje w historii, ekran się czyści.
async function newSession() {
  await saveSessionNow();
  state.segments = [];
  state.claims = [];
  state.audioSrcId = null;
  Object.assign(session, { id: null, startedAt: 0, sources: [], usage: emptyUsage() });
  renderFeed();
  renderCost();
  showLastSession();
}
const gapMs = () => (Number(S.sessionGapH) > 0 ? Number(S.sessionGapH) * 3_600_000 : Infinity);
// Przed dodaniem nowego źródła: po długiej przerwie zaczynamy nową sesję.
async function ensureSession() {
  if (session.id && Date.now() - lastActivity({ ...stateContent(), startedAt: session.startedAt }) > gapMs()) await newSession();
}
function addSource(src) {
  const full = { id: `s${Date.now().toString(36)}${++srcSeq}`, at: Date.now(), title: "", url: "", ...src };
  session.sources.push(full);
  touchSession();
  return full;
}
const findSource = (id) => session.sources.find((x) => x.id === id) || null;
// Przerwane / nieudane sprawdzenie bez żadnego werdyktu nie zostawia pustego źródła w sesji.
async function dropEmptySource(id) {
  if (!id || state.claims.some((c) => c.srcId === id)) return;
  session.sources = session.sources.filter((x) => x.id !== id);
  groupEl(id, { create: false })?.remove();
  $("empty").hidden = session.sources.length > 0;
  if (hasContent(stateContent())) { touchSession(); return; }
  clearTimeout(saveTimer);
  if (session.id) await deleteSession(session.id).catch(() => {});
  Object.assign(session, { id: null, startedAt: 0 });
  showLastSession();
}

async function showLastSession() {
  const el = $("lastSession");
  const last = (await listSessions().catch(() => [])).find((x) => x.id !== session.id);
  el.hidden = !last || session.sources.length > 0;
  if (!last) return;
  const a = $("lastSessionLink");
  a.textContent = `${sessionIcon(last)} ${sessionTitle(last)} (${fmtDate(lastActivity(last))})`;
  a.onclick = (e) => { e.preventDefault(); openSession(last.id); };
}

function loadSession(rec) {
  Object.assign(session, { id: rec.id, startedAt: rec.startedAt, sources: rec.sources || [], usage: { ...emptyUsage(), ...(rec.usage || {}) } });
  state.claims = (rec.claims || []).map((c) => (c.id ? c : { ...c, id: newClaimId() }));
  state.segments = (rec.segments || []).map((x) => ({ ...x, checked: true }));
  state.audioSrcId = null;
  state.txFrom = Date.now();
  state.showAllTx = false;
  renderFeed();
  renderCost();
  $("lastSession").hidden = true;
}
let claimSeq = 0;
const newClaimId = () => `k${Date.now().toString(36)}${++claimSeq}`;
async function openSession(id) {
  if (state.running) { banner(esc(t("hist.stopFirst")), "error"); return; }
  const rec = await getSession(id);
  if (!rec) return;
  await saveSessionNow();
  banner(null);
  loadSession(rec);
  if ($("history").open) $("history").close();
  setStatus(t("hist.opened", { title: sessionTitle(rec) }));
}
// Po otwarciu panelu: kontynuuj ostatnią sesję, jeśli przerwa była krótsza niż ustawiona.
async function resumeLastSession() {
  if (session.id || state.claims.length) return false;
  const last = (await listSessions().catch(() => []))[0];
  if (!last || Date.now() - lastActivity(last) > gapMs()) return false;
  loadSession(last);
  setStatus(t("hist.resumed", { title: sessionTitle(last) }));
  return true;
}

// ---------- historia: okno ----------
async function renderHistory() {
  const all = await listSessions();
  const q = $("histFilter").value;
  const list = all.filter((x) => matchesQuery(x, q));
  $("histInfo").textContent = all.length ? t("hist.info", { n: all.length }) : t("hist.empty");
  $("histDeleteAll").hidden = !all.length;
  const box = $("histList");
  box.replaceChildren(...list.map((rec) => {
    const node = $("histTpl").content.firstElementChild.cloneNode(true);
    applyI18n(node);
    if (rec.id === session.id) node.classList.add("current");
    node.querySelector(".hist-title").textContent = `${sessionIcon(rec)} ${sessionTitle(rec)}` + (rec.id === session.id ? ` · ${t("hist.current")}` : "");
    const mins = Math.max(1, Math.round((lastActivity(rec) - rec.startedAt) / 60_000));
    node.querySelector(".hist-meta").textContent = t("hist.meta", {
      date: fmtDate(rec.startedAt), dur: t("hist.min", { n: mins }),
      claims: rec.claims?.length || 0, words: wordCount(rec.segments),
    });
    const counts = verdictCounts(rec.claims);
    const levels = (rec.sources || []).map((src) => validSummary(src, (rec.claims || []).filter((c) => c.srcId === src.id))).filter(Boolean).slice(0, 3);
    const nTricks = (rec.sources || []).reduce((a, src) => a + (src.tricks?.length || 0), 0);
    const scam = (rec.sources || []).some((src) => src.scam?.level === "high") ? "high" : (rec.sources || []).some((src) => src.scam?.level) ? "medium" : "";
    node.querySelector(".hist-pills").replaceChildren(...levels.map((x) => {
      const p = Object.assign(document.createElement("span"), { className: "pill level", textContent: `📝 ${t(`level.${x.level}`)}`, title: x.headline });
      p.dataset.tone = LEVEL_TONE[x.level] || "muted";
      return p;
    }), ...Object.entries(VERDICTS).filter(([k]) => counts[k]).map(([k, v]) => {
      const p = document.createElement("span");
      p.className = "pill";
      p.dataset.tone = v.tone;
      p.textContent = `${verdictLabel(k)}: ${counts[k]}`;
      return p;
    }), ...(nTricks ? [Object.assign(document.createElement("span"), { className: "pill trick", textContent: `🎭 ${nTricks}`, title: t("trick.title", { n: nTricks }) })] : []),
    ...(scam ? [Object.assign(document.createElement("span"), { className: `pill scam ${scam}`, textContent: `⚠ ${t("scam.pill")}`, title: t(scam === "high" ? "scam.titleHigh" : "scam.titleMedium") })] : []));
    node.querySelector("[data-act=open]").onclick = () => openSession(rec.id);
    node.querySelector("[data-act=export]").onclick = () => downloadMarkdown(rec).catch((e) => console.error(e));
    node.querySelector("[data-act=report]").onclick = () => openReport(rec.id);
    confirmButton(node.querySelector("[data-act=delete]"), async () => {
      await deleteSession(rec.id);
      if (rec.id === session.id) session.id = null; // bieżąca sesja zapisze się od nowa przy następnej zmianie
      renderHistory();
      showLastSession();
    });
    return node;
  }));
  if (all.length && !list.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = t("hist.noMatch");
    box.append(p);
  }
  const rated = ratedClaims(all);
  $("ratingsInfo").textContent = rated.length ? t("fb.count", { n: rated.length, bad: rated.filter((x) => x.rating === "bad").length }) : t("fb.none");
  $("exportRatings").disabled = !rated.length;
}
// Usuwanie wymaga drugiego kliknięcia w ciągu 4 s.
function confirmButton(btn, action) {
  let armed = null;
  let label = "";
  btn.onclick = async () => {
    if (!armed) {
      label = btn.textContent;
      btn.textContent = t("hist.confirm");
      btn.classList.add("confirm");
      armed = setTimeout(() => { armed = null; btn.textContent = label; btn.classList.remove("confirm"); }, 4000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    btn.textContent = label;
    btn.classList.remove("confirm");
    await action();
  };
}
async function openHistory() {
  await saveSessionNow();
  $("histFilter").value = "";
  await renderHistory();
  $("history").showModal();
}

// ---------- Opera ----------
// Opera nie ma chrome.sidePanel: panel działa na pasku bocznym Opery albo w osobnym okienku (otwieranym
// kliknięciem ikony na pasku narzędzi). W okienku "bieżąca karta" to samo okienko, więc pamiętamy kartę,
// na której kliknięto ikonę.
const IS_OPERA = /\bOPR\//.test(navigator.userAgent) || !!navigator.userAgentData?.brands?.some((b) => /opera/i.test(b.brand));
const params = new URLSearchParams(location.search);
let invoked = params.has("tabId") ? { id: +params.get("tabId"), title: params.get("title") || "" } : null;
let myWindow = null;
const isPopupWindow = async () => {
  myWindow ??= await chrome.windows.getCurrent().catch(() => null);
  return myWindow?.type === "popup";
};

// Karta do nagrania: w pasku bocznym (Chrome/Opera) aktywna karta tego okna; w okienku – karta,
// na której kliknięto ikonę, a gdy jej już nie ma – aktywna karta ostatniego zwykłego okna.
// Okienko (Opera): bieżąca karta = aktywna karta ostatnio używanego okna przeglądarki – czyli ta, którą masz
// przed sobą. (Wcześniej brana była karta, na której ostatnio kliknięto ikonę – po przejściu na inną kartę
// wtyczka słuchała/czytała złą kartę.) Karta z kliknięcia ikony jest tylko zapasem.
async function targetTab() {
  if (await isPopupWindow()) {
    const w = await chrome.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => null);
    if (w) {
      const [tab] = await chrome.tabs.query({ active: true, windowId: w.id });
      if (tab) return tab;
    }
    if (invoked) {
      const tab = await chrome.tabs.get(invoked.id).catch(() => null);
      if (tab) return tab;
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
const state = {
  running: false, busy: false, transcriber: null, timer: null, pausedUntil: 0,
  segments: [],              // {t, text, checked}
  claims: [],                // wyniki
  disabled: new Set(),       // funkcje odrzucone przez API w tej sesji: webSearch / structured
  speaker: "",               // „Teraz mówi: …” (ręcznie, w trakcie nagrywania)
  limitOkDay: "",            // dzień, w którym użytkownik kazał sprawdzać mimo przekroczonego limitu
  limitWarnDay: "",          // dzień, w którym pokazaliśmy ostrzeżenie o 80% limitu
  fcOff: false,              // Google Fact Check odrzucił klucz – nie próbujemy do końca sesji panelu
};
const recheck = new Map();   // srcId → zlecenie (do „Sprawdź ponownie” przy wyniku z pamięci)

// ---------- ustawienia ----------
async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  S = { ...DEFAULTS, ...(settings || {}) };
  if (!S.rememberKeys) { // klucze trzymane tylko do zamknięcia przeglądarki
    const { secrets } = await chrome.storage.session.get("secrets").catch(() => ({}));
    Object.assign(S, secrets || {});
  }
  S.keys = { ...(S.keys || {}) };
  S.models = { ...(S.models || {}) };
  if (!PROVIDERS[S.provider]) S.provider = "chatgpt";
  // ustawienia sprzed wersji z wieloma dostawcami: jeden model → model bieżącego dostawcy
  if (S.model && !S.models[S.provider]) S.models[S.provider] = S.model;
  S.model = S.models[S.provider] || "";
  if (IS_OPERA && S.engine === "chrome") S.engine = "local"; // w Operze Web Speech API nie działa
  document.querySelector(`input[name=src][value=${S.src}]`).checked = true;
}
// „Nie zapamiętuj kluczy”: klucze idą do chrome.storage.session (pamięć przeglądarki do jej zamknięcia),
// a w chrome.storage.local zostają same ustawienia.
async function saveSettings() {
  if (S.rememberKeys) {
    await chrome.storage.local.set({ settings: S });
    await chrome.storage.session.remove("secrets").catch(() => {});
    return;
  }
  const local = { ...S, apiKey: "", keys: {} };
  await chrome.storage.session.set({ secrets: Object.fromEntries(SECRET_KEYS.map((k) => [k, S[k]])) });
  await chrome.storage.local.set({ settings: local });
}

// Klucze i modele w formularzu (przed zapisem) – przełączanie dostawcy nie gubi wpisanego klucza.
let draft = { keys: {}, models: {} };
let modelCache = {}; // provider -> lista modeli (z informacją o obrazkach dla OpenRoutera)
let shownProvider = null; // dostawca, którego pola są teraz w formularzu
const formProvider = () => document.querySelector("input[name=provider]:checked")?.value || "chatgpt";
const draftKey = (p) => (p === "chatgpt" || p === "apikey" ? draft.keys.openai : draft.keys[p]) || "";
function rememberKeyInput(p) {
  const v = $("apiKey").value.trim();
  if (p === "chatgpt" || p === "apikey") draft.keys.openai = v; else draft.keys[p] = v;
}
function renderProviderForm() {
  const p = formProvider();
  shownProvider = p;
  const name = providerName(p);
  $("chatgptBox").hidden = p !== "chatgpt";
  $("apiKeyLegend").textContent = p === "chatgpt" || p === "apikey" ? t("set.apiKey") : t("set.apiKeyFor", { name });
  $("apiKey").value = draftKey(p);
  $("apiKey").placeholder = { chatgpt: "sk-…", apikey: "sk-…", gemini: "AIza…", anthropic: "sk-ant-…", openrouter: "sk-or-…" }[p];
  const keyLink = PROVIDERS[p].keyUrl ? ` <a href="${PROVIDERS[p].keyUrl}" target="_blank" rel="noopener">${esc(t("set.getKey", { name }))}</a>` : "";
  $("apiKeyHint").innerHTML = esc(t(p === "chatgpt" ? "set.apiKeyHint" : "set.keyStoredHint")) + keyLink;
  $("providerInfo").innerHTML = t(`prov.info.${p}`);
  $("keyStatus").hidden = true;
  renderModelCaps();
}
function renderModelCaps() {
  const p = formProvider();
  const m = (modelCache[p] || []).find((x) => x.id === $("model").value);
  const images = p === "openrouter" ? (m ? m.images : null) : PROVIDERS[p].images;
  $("modelCaps").textContent = [
    `🔎 ${t("caps.search")}: ${t(`caps.search.${p}`)}`,
    `🖼 ${t("caps.images")}: ${images == null ? t("caps.depends") : images ? t("caps.yes") : t("caps.no")}`,
  ].join(" · ");
}
function keyStatus(msg, ok = false) {
  const el = $("keyStatus");
  el.textContent = msg;
  el.classList.toggle("ok", ok);
  el.hidden = !msg;
}

function fillSettingsForm() {
  document.querySelector(`input[name=provider][value=${S.provider}]`).checked = true;
  draft = { keys: { ...S.keys, openai: S.apiKey }, models: { ...S.models } };
  renderProviderForm();
  $("webSearch").checked = S.webSearch;
  $("autoExport").checked = !!S.autoExport;
  $("sessionGap").value = S.sessionGapH;
  document.querySelector(`input[name=mode][value=${MODES[S.mode] ? S.mode : "normal"}]`).checked = true;
  $("dailyLimit").value = S.dailyLimit || "";
  $("priceIn").value = S.priceIn;
  $("priceOut").value = S.priceOut;
  $("fcKey").value = S.keys.factcheck || "";
  $("fcStatus").hidden = true;
  $("memoryDays").value = S.memoryDays;
  $("maskPeople").checked = !!S.maskPeople;
  $("autoSummary").checked = S.autoSummary !== false;
  $("tricks").checked = S.tricks !== false;
  $("scamCheck").checked = S.scamCheck !== false;
  $("certList").checked = S.certList !== false;
  renderCertInfo();
  $("rememberKeys").checked = S.rememberKeys !== false;
  renderMemInfo();
  for (const k of ["sttModel", "intervalSec", "chunkSec", "language", "uiLang"]) $(k).value = S[k];
  document.querySelector(`input[name=engine][value=${S.engine}]`).checked = true;
  if (IS_OPERA) {
    const r = document.querySelector("input[name=engine][value=chrome]");
    r.disabled = true;
    r.closest("label").title = t("set.engineChromeOpera");
    r.closest("label").classList.add("disabled");
  }
  renderModels();
  renderEngineBox();
  const cur = draft.models[S.provider] || "";
  setModelOptions(modelCache[S.provider] || (cur ? [{ id: cur, name: cur }] : []), cur);
  renderCostSettings();
}

function readSettingsForm() {
  S.provider = formProvider();
  rememberKeyInput(S.provider);
  const { openai, ...others } = draft.keys;
  S.apiKey = openai || "";
  S.keys = { ...S.keys, ...others };
  draft.models[S.provider] = $("model").value;
  S.models = { ...S.models, ...draft.models };
  S.model = S.models[S.provider] || "";
  S.keys.factcheck = $("fcKey").value.trim();
  S.webSearch = $("webSearch").checked;
  S.autoExport = $("autoExport").checked;
  S.mode = document.querySelector("input[name=mode]:checked")?.value || "normal";
  S.dailyLimit = clamp(Number(String($("dailyLimit").value).replace(",", ".")) || 0, 0, 10000);
  S.priceIn = $("priceIn").value.trim();
  S.priceOut = $("priceOut").value.trim();
  S.memoryDays = clamp(Math.round(Number($("memoryDays").value) || 0), 0, 365);
  S.maskPeople = $("maskPeople").checked;
  S.autoSummary = $("autoSummary").checked;
  S.tricks = $("tricks").checked;
  S.scamCheck = $("scamCheck").checked;
  S.certList = $("certList").checked;
  S.rememberKeys = $("rememberKeys").checked;
  S.sessionGapH = clamp(Number($("sessionGap").value) || 0, 0, 72);
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
  const label = (m) => [m.name, m.recommended ? t("set.recommended") : "", m.free ? t("set.free") : ""].filter(Boolean).join(" · ");
  sel.replaceChildren(...(models.length ? models : [{ id: "", name: t("set.modelEmpty") }])
    .map((m) => new Option(label(m), m.id, false, m.id === selected)));
  renderModelCaps();
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

// Zwraca null, gdy model jest pobrany, albo treść błędu. onProgress – np. pasek w okienku „Zamiana mowy na tekst”.
async function downloadModel(id, onProgress) {
  if (downloads.size) return t("ss.busy"); // jeden na raz
  downloads.set(id, { loaded: 0, total: 0 });
  renderModels();
  let last = 0;
  try {
    await localEngine.load(id, DEVICE, (loaded, total) => {
      downloads.set(id, { loaded, total });
      onProgress?.(loaded, total);
      if (Date.now() - last > 300) { last = Date.now(); renderModels(); }
    });
    if (!S.localModel || !(await getDownloaded())[S.localModel]) { S.localModel = id; await saveSettings(); }
  } catch (e) {
    $("deviceInfo").textContent = t("models.failed", { msg: e.message });
    downloads.delete(id);
    renderModels();
    return e.message || String(e);
  }
  downloads.delete(id);
  renderModels();
  return null;
}

function renderEngineBox() {
  const eng = document.querySelector("input[name=engine]:checked")?.value || "local";
  $("modelsBox").hidden = eng !== "local";
  $("sttModelRow").hidden = eng !== "openai";
  $("engineHint").textContent = t(`set.engineHint.${eng}`);
}

// ---------- „Zamiana mowy na tekst”: okienko przy Start, gdy słuchanie nie jest gotowe ----------
// Sprawdzanie tekstu i obrazków działa bez tego – model mowy jest potrzebny dopiero do słuchania.
// Zwraca powód, dla którego nie da się zacząć, albo null. Pobrany model pasujący do języka rozmowy wybiera sam.
async function sttProblem() {
  if (S.engine === "openai") return S.src !== "tab" ? "openaiMic" : !S.apiKey ? "noKey" : null;
  if (S.engine === "chrome" && !IS_OPERA) return S.src === "tab" ? "chromeTab" : null;
  const have = await getDownloaded();
  const cur = getModel(S.localModel);
  if (S.engine === "local" && cur && have[cur.id]) return null;
  const fit = MODELS.find((m) => have[m.id] && (m.multilingual || m.lang === S.language));
  if (fit) {
    Object.assign(S, { engine: "local", localModel: fit.id });
    await saveSettings();
    return null;
  }
  return "noModel";
}
// Zalecany model: do języka rozmowy; z kartą graficzną najlepszy, bez niej – średni (szybki na zwykłym laptopie).
function recommendedModels() {
  const lang = S.language === "en" ? "en" : "pl";
  const pick = (tier) => MODELS.find((m) => m.lang === lang && m.tier === tier);
  const main = DEVICE === "gpu" ? pick("best") : pick("mid");
  const lighter = DEVICE === "gpu" ? pick("mid") : pick("light");
  return { main, lighter };
}
const ss = { model: null, ready: false };
async function openSttSetup(why) {
  const d = $("sttSetup");
  applyI18n(d);
  $("ssWhy").textContent = t(`ss.why.${why}`);
  const { main, lighter } = recommendedModels();
  const have = await getDownloaded();
  const fit = MODELS.find((m) => have[m.id] && (m.multilingual || m.lang === S.language)); // już pobrany (np. wybrany był OpenAI)
  const busy = [...downloads.keys()][0];
  ss.model = fit || getModel(busy) || (ss.model?.lang === main.lang ? ss.model : main);
  ss.ready = !!fit;
  document.querySelector("#ssLocal .ss-badge").hidden = !fit && ss.model.id !== main.id; // „zalecany” – tylko przy zalecanym
  const sizeOf = (m) => mb(m.size[DEVICE]);
  $("ssLocalInfo").textContent = fit ? t("ss.localHave", { name: fit.name })
    : t("ss.localInfo", { name: ss.model.name, size: sizeOf(ss.model), note: ss.model.note[getLang()] || ss.model.note.en });
  $("ssLighter").hidden = !!fit || !lighter || ss.model.id === lighter.id || !!busy;
  if (lighter) $("ssLighter").textContent = t("ss.lighter", { name: lighter.name, size: sizeOf(lighter) });
  $("ssLighter").onclick = () => { ss.model = lighter; openSttSetup(why); };
  $("ssProg").hidden = !busy;
  $("ssLocalStatus").hidden = !busy;
  $("ssDownload").disabled = !!busy;
  $("ssDownload").textContent = fit ? `▶ ${t("ss.useStart")}` : busy ? t("ss.downloading") : t("ss.download", { size: sizeOf(ss.model) });
  // OpenAI – tylko dźwięk karty; wbudowane – tylko mikrofon (nie w Operze)
  $("ssOpenai").hidden = S.src !== "tab";
  $("ssOpenaiInfo").textContent = t(S.apiKey ? "ss.openaiInfo" : "ss.openaiNoKey");
  $("ssUseOpenai").textContent = t(S.apiKey ? "ss.useStart" : "ss.addKey");
  $("ssChrome").hidden = IS_OPERA || S.src !== "mic";
  if (!d.open) d.showModal();
}
async function ssDownload() {
  if (ss.ready) { // kliknięcie = gest użytkownika (zgoda na kartę / mikrofon)
    Object.assign(S, { engine: "local", localModel: ss.model.id });
    await saveSettings();
    $("sttSetup").close();
    start();
    return;
  }
  const m = ss.model;
  $("ssDownload").disabled = true;
  $("ssDownload").textContent = t("ss.downloading");
  $("ssLighter").hidden = true;
  const prog = $("ssProg"), st = $("ssLocalStatus");
  prog.hidden = false; prog.removeAttribute("value");
  st.hidden = false; st.classList.remove("warn"); st.textContent = t("ss.keepOpen");
  const err = await downloadModel(m.id, (loaded, total) => {
    if (!total) return;
    prog.max = total; prog.value = loaded;
    st.textContent = t("ss.progress", { pct: Math.round((100 * loaded) / total), size: mb(m.size[DEVICE]) });
  });
  if (err) {
    prog.hidden = true;
    st.textContent = t("models.failed", { msg: err });
    st.classList.add("warn");
    $("ssDownload").disabled = false;
    $("ssDownload").textContent = t("ss.retry");
    return;
  }
  Object.assign(S, { engine: "local", localModel: m.id });
  await saveSettings();
  if (!$("sttSetup").open) { setStatus(t("ss.doneClosed", { name: m.name })); return; }
  ss.ready = true;
  prog.hidden = true;
  st.textContent = t("ss.done", { name: m.name });
  $("ssDownload").disabled = false;
  $("ssDownload").textContent = `▶ ${t("ss.startNow")}`;
  $("ssDownload").focus();
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
  if (KEY_PROVIDERS.includes(provider)) {
    const key = S.keys?.[provider];
    if (!key) throw Object.assign(new Error(t("err.needKeyProv", { name: providerName(provider) })), { code: "NEED_KEY" });
    return key;
  }
  const r = await Promise.race([
    bg({ type: "getToken" }),
    new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(t("err.tokenTimeout")), { code: "timeout" })), 45_000)),
  ]);
  if (!r?.ok) throw Object.assign(new Error(r?.error || t("err.noToken")), { code: r?.code });
  return r.token;
}

async function loadModels(provider = S.provider) {
  const models = await listProviderModels(provider, await getToken(provider));
  if (!models.length) throw new Error(t("err.noModels"));
  modelCache[provider] = models;
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

// Okno transkrypcji pokazuje bieżące nagranie: każdy Start zaczyna od czystego okna. Wcześniejszy tekst zostaje
// w sesji (eksport, historia, kontekst) – link „Wcześniejsza transkrypcja – pokaż” i nagłówki źródeł.
function renderTranscript() {
  $("txTitle").textContent = t("tx.title");
  const box = $("transcript");
  const from = state.txFrom || 0;
  const earlier = state.segments.filter((x) => x.t < from);
  const shown = state.showAllTx ? state.segments : state.segments.filter((x) => x.t >= from);
  const nodes = [];
  if (earlier.length) {
    const a = document.createElement("a");
    a.href = "#";
    a.className = "tx-earlier";
    a.textContent = state.showAllTx ? t("tx.hideEarlier") : t("tx.showEarlier", { n: wordCount(earlier) });
    a.onclick = (e) => { e.preventDefault(); state.showAllTx = !state.showAllTx; renderTranscript(); };
    nodes.push(a);
  }
  let prev = null, prevSpk = "";
  for (const seg of shown.slice(-200)) {
    if (seg.srcId !== prev && session.sources.length > 1) { // granica między nagraniami
      const src = findSource(seg.srcId);
      const sep = document.createElement("div");
      sep.className = "tx-sep";
      sep.textContent = src ? `${sourceIcon(src)} ${sourceTitle(src)}` : "—";
      nodes.push(sep);
    }
    if (seg.srcId !== prev) prevSpk = "";
    prev = seg.srcId;
    if ((seg.speaker || "") !== prevSpk && seg.speaker) nodes.push(Object.assign(document.createElement("b"), { className: "tx-spk", textContent: `🗣 ${seg.speaker}: ` }));
    prevSpk = seg.speaker || "";
    const span = document.createElement("span");
    span.className = seg.checked ? "checked" : "";
    span.textContent = seg.text + " ";
    nodes.push(span);
  }
  if (state.running && !shown.some((x) => x.t >= from)) {
    nodes.push(Object.assign(document.createElement("p"), { className: "tx-wait muted", textContent: t("tx.waiting") }));
  }
  box.replaceChildren(...nodes);
  box.scrollTop = box.scrollHeight;
  const words = wordCount(shown);
  $("wordCount").textContent = words ? t("tx.words", { n: words }) : "";
}

function renderSummary() {
  $("sumPills").replaceChildren(pillsEl(state.claims, "sum-pills"));
  const problems = state.claims.filter((c) => PROBLEM_VERDICTS.includes(c.verdict)).length;
  const btn = $("onlyProblems");
  btn.textContent = S.onlyProblems ? t("filter.showAll", { n: state.claims.length }) : t("filter.only", { n: problems });
  btn.setAttribute("aria-pressed", String(!!S.onlyProblems));
  btn.classList.toggle("on", !!S.onlyProblems);
  $("feed").classList.toggle("only-problems", !!S.onlyProblems);
  $("summary").hidden = !state.claims.length;
}

// ---------- feed: karty pogrupowane według źródeł (najświeższe źródło na górze) ----------
function groupEl(srcId, { create = true } = {}) {
  let g = [...$("feed").querySelectorAll(".src-group")].find((x) => x.dataset.src === srcId);
  if (!g && create) {
    g = document.createElement("section");
    g.className = "src-group";
    g.dataset.src = srcId;
    g.append(document.createElement("header"), Object.assign(document.createElement("div"), { className: "cards" }),
      Object.assign(document.createElement("div"), { className: "tricks", hidden: true }),
      Object.assign(document.createElement("p"), { className: "src-note muted" }));
    renderGroupHead(g);
    $("empty").after(g);
    $("empty").hidden = true;
  }
  return g;
}
const toTop = (g) => { if (g && $("empty").nextElementSibling !== g) $("empty").after(g); };

function renderGroupHead(g) {
  const src = findSource(g.dataset.src) || {};
  const head = g.querySelector("header");
  head.className = "src-head";
  head.replaceChildren();
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "src-toggle icon";
  toggle.textContent = g.classList.contains("collapsed") ? "▸" : "▾";
  toggle.setAttribute("aria-label", t(g.classList.contains("collapsed") ? "src.expand" : "src.collapse"));
  toggle.onclick = () => { g.classList.toggle("collapsed"); renderGroupHead(g); };
  const title = document.createElement(src.url ? "a" : "span");
  title.className = "src-title";
  title.textContent = `${sourceIcon(src)} ${sourceTitle(src)}`;
  if (src.url) { title.href = src.url; title.target = "_blank"; title.rel = "noopener noreferrer"; }
  const meta = document.createElement("span");
  meta.className = "src-meta muted";
  const n = state.claims.filter((c) => c.srcId === src.id).length;
  meta.textContent = [t(`kind.${src.kind || "tab"}`), src.meta?.site, src.at && hhmm(src.at).slice(0, 5), n ? t("src.count", { n }) : ""].filter(Boolean).join(" · ");
  head.append(toggle, title, meta);
  const mine = state.claims.filter((c) => c.srcId === src.id);
  if (mine.length > 1) {
    const pills = pillsEl(mine, "src-pills");
    const all = Object.assign(document.createElement("button"), {
      type: "button", className: "small reply-all",
      textContent: `💬 ${t(src.kind === "post" ? "rp.allPost" : src.kind === "article" ? "rp.allArticle" : "rp.allClaims")}`,
      title: t("rp.allHint"),
    });
    all.onclick = () => openReply([...mine].sort((a, b) => (a.t || 0) - (b.t || 0)), src);
    pills.append(all);
    head.append(pills);
  }
  if (src.kind !== "manual") head.append(dateEl(src));
  const memInfo = src.fromMemory || src.imagesFromMemory;
  if (memInfo) {
    const mem = document.createElement("div");
    mem.className = "src-mem";
    const key = src.imagesFromMemory ? "mem.groupImagesText" : src.fromMemory.images ? "mem.groupImage" : "mem.groupNote";
    mem.append(`🧠 ${t(key, { date: fmtDate(memInfo.at), model: memInfo.model || "?" })} `);
    if (recheck.has(src.id)) {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "small", textContent: `↻ ${t("mem.recheck")}` });
      b.onclick = () => recheckSource(src);
      mem.append(b);
    }
    head.append(mem);
  }
  renderTricks(g, src);
  if (src.scam?.level && S.scamCheck !== false) head.append(scamEl(src.scam));
  const sum = summaryState(src, mine);
  g.classList.toggle("summarised", sum?.status === "ready");
  if (sum) head.append(summaryEl(g, src, sum, mine));
  arrangeCards(g, mine);
  const hidden = S.onlyProblems ? mine.filter((c) => !PROBLEM_VERDICTS.includes(c.verdict)).length : 0;
  if (hidden) head.append(Object.assign(document.createElement("div"), { className: "src-hidden muted", textContent: t("filter.hiddenN", { n: hidden }) }));
  if (src.images?.length) head.append(imagesEl(src));
  const wasOpen = !!g.querySelector(".src-text")?.open;
  const audio = src.kind === "tab" || src.kind === "mic";
  const segs = audio ? state.segments.filter((x) => x.srcId === src.id) : [];
  const text = audio ? segs.map((x) => x.text).join(" ") : src.text;
  if (text && (audio || isPageKind(src.kind) || src.kind === "manual")) {
    const det = document.createElement("details");
    det.className = "src-text";
    det.open = wasOpen;
    const sum = document.createElement("summary");
    sum.textContent = t(audio ? "src.transcript" : "src.text", { n: wordCount(audio ? segs : [{ text }]) });
    const body = document.createElement("div");
    body.textContent = text;
    det.append(sum, body);
    head.append(det);
  }
}
// ---------- ocena całości (lib/summary.js) ----------
// Artykuł, post, mem, infografika: poziom (5 nazwanych stopni), jedno-dwa zdania i punkty ✓ ✗ ⚠ nad kartami.
// Model pisze ją po werdyktach, osobnym zapytaniem bez wyszukiwania. Gdy jest gotowa, karty zwijają się do jednej
// linii (problemy na górze) – szczegóły po kliknięciu. Dla dźwięku nie ma (tam jest raport).
const summaryJobs = new Map(); // srcId → odcisk werdyktów, dla którego trwa pisanie
const memKeys = new Map();     // srcId → klucz w pamięci werdyktów (żeby dopisać do niej podsumowanie)
const openCards = new Set();   // id kart rozwiniętych w źródle z podsumowaniem
const rechecking = new Set();       // „Sprawdź dokładniej”: id twierdzeń sprawdzanych właśnie od nowa
const recheckErrors = new Map();    // id → błąd ostatniej próby (nie trafia do historii)
function summaryState(src, claims = state.claims.filter((c) => c.srcId === src.id)) {
  if (!needsSummary(src, claims)) return null;
  const key = summaryKey(claims);
  if (summaryJobs.get(src.id) === key) return { status: "pending" };
  if (activity.on && activity.srcId === src.id) return null; // jeszcze sprawdzamy – ocena przyjdzie po werdyktach
  const s = src.summary;
  if (s?.key === key && s.headline) return { status: "ready", s };
  if (s?.key === key && s.error) return { status: "error", s };
  return { status: "missing" };
}
function summaryEl(g, src, st, claims) {
  const box = document.createElement("div");
  box.className = `src-sum ${st.status}`;
  if (st.status === "pending") {
    box.append(Object.assign(document.createElement("span"), { className: "sum-wait", textContent: t("sum.pending") }));
    return box;
  }
  if (st.status !== "ready") {
    if (st.status === "error") box.append(Object.assign(document.createElement("p"), { className: "sum-err", textContent: t("sum.error", { msg: st.s.error }) }));
    const b = Object.assign(document.createElement("button"), { type: "button", className: "small", textContent: st.status === "error" ? `↻ ${t("sum.retry")}` : `📝 ${t("sum.make")}` });
    b.onclick = () => maybeSummarize(src, { force: true });
    box.append(b);
    return box;
  }
  const s = st.s;
  box.dataset.tone = LEVEL_TONE[s.level] || "muted";
  const top = Object.assign(document.createElement("div"), { className: "sum-top" });
  const again = Object.assign(document.createElement("button"), { type: "button", className: "icon small sum-again", textContent: "↻", title: t("sum.regen") });
  again.setAttribute("aria-label", t("sum.regen"));
  again.onclick = () => maybeSummarize(src, { force: true });
  top.append(Object.assign(document.createElement("span"), { className: "sum-cap", textContent: t("sum.title") }), again,
    Object.assign(document.createElement("span"), { className: "sum-break" }));
  const level = Object.assign(document.createElement("span"), { className: "sum-level", textContent: t(`level.${s.level}`) });
  top.append(level);
  const pos = LEVELS.indexOf(s.level);
  if (pos >= 0) {
    const scale = Object.assign(document.createElement("span"), { className: "sum-scale", title: LEVELS.map((l) => t(`level.${l}`)).join(" → ") });
    scale.setAttribute("aria-hidden", "true");
    scale.append(...LEVELS.map((_, i) => Object.assign(document.createElement("i"), { className: i === pos ? "on" : "" })));
    top.append(scale);
  }
  if (s.genre && s.genre !== "inne") {
    const genre = Object.assign(document.createElement("span"), { className: "sum-genre", textContent: t(`genre.${s.genre}`), title: t("genre.title") });
    if (GENRE_TONE[s.genre]) genre.dataset.tone = GENRE_TONE[s.genre];
    top.append(genre);
  }
  box.append(top, Object.assign(document.createElement("p"), { className: "sum-head", textContent: s.headline }));
  const ul = document.createElement("ul");
  ul.className = "sum-pts";
  for (const [cls, mark, list] of [["ok", "✓", s.ok], ["wrong", "✗", s.wrong], ["ctx", "⚠", s.context], ["side", "⚖", s.side ? [s.side] : []]]) {
    for (const x of list || []) {
      const li = document.createElement("li");
      li.className = cls;
      li.append(Object.assign(document.createElement("b"), { textContent: mark }), ` ${x}`);
      ul.append(li);
    }
  }
  if (ul.children.length) box.append(ul);
  const foot = Object.assign(document.createElement("div"), { className: "sum-foot" });
  foot.append(Object.assign(document.createElement("span"), { className: "muted", textContent: t(claims.length === 1 ? "sum.scope1" : "sum.scope", { n: claims.length }) }));
  const all = g.classList.contains("open-all");
  const tog = Object.assign(document.createElement("button"), { type: "button", className: "small", textContent: t(all ? "sum.collapseAll" : "sum.expandAll") });
  tog.setAttribute("aria-expanded", String(all));
  tog.onclick = () => { g.classList.toggle("open-all"); renderGroupHead(g); };
  foot.append(tog);
  box.append(foot);
  return box;
}
// Kolejność kart: w źródle z podsumowaniem najpierw problemy (potem prawda), w pozostałych – najnowsze na górze.
function arrangeCards(g, claims) {
  if (!g.classList.contains("summarised")) return;
  const list = g.querySelector(".cards");
  const byId = new Map(claims.map((c) => [c.id, c]));
  const nodes = [...list.children].filter((n) => n.classList.contains("card") && !n.classList.contains("skeleton"));
  const sorted = [...nodes].sort((a, b) => {
    const A = byId.get(a.dataset.cid) || {}, B = byId.get(b.dataset.cid) || {};
    return severityRank(A.verdict) - severityRank(B.verdict) || (B.t || 0) - (A.t || 0);
  });
  if (sorted.some((n, i) => n !== nodes[i])) list.append(...sorted);
}
function rerenderHead(src) {
  const g = groupEl(src.id, { create: false });
  if (g) renderGroupHead(g);
}
// Po werdyktach (i przy każdej zmianie zestawu werdyktów) – automatycznie, chyba że wyłączone w ⚙.
function maybeSummarize(src, { force = false } = {}) {
  if (!src || !session.sources.includes(src)) return;
  const claims = state.claims.filter((c) => c.srcId === src.id);
  if (!needsSummary(src, claims)) return;
  const key = summaryKey(claims);
  if (summaryJobs.get(src.id) === key) return;
  if (!force && src.summary?.key === key && (src.summary.headline || src.summary.error)) return;
  if (!force && S.autoSummary === false) { rerenderHead(src); return; }
  summarize(src, claims, key);
}
async function summarize(src, claims, key) {
  summaryJobs.set(src.id, key);
  rerenderHead(src);
  let result;
  try {
    if (limitReached()) throw new Error(t("rp.limit"));
    await ensureModel();
    let structured = PROVIDERS[S.provider]?.structured !== false && !state.disabled.has("structured");
    const view = { ...src, text: S.maskPeople ? maskHandles(src.text || "") : src.text };
    let res;
    for (let attempt = 0; ; attempt++) {
      const body = buildSummaryRequest({ model: S.model, src: view, claims, lang: getLang(), structured });
      try {
        res = await callModel({ provider: S.provider, key: await getToken(), body, timeoutMs: 90_000, idleMs: 45_000 });
        break;
      } catch (e) {
        if (structured && unsupportedFeature(e) === "structured" && attempt < 1) { structured = false; continue; }
        throw e;
      }
    }
    recordUsage(res.usage).catch((e) => console.warn(e));
    const parsed = parseSummary(res.text, claims, src.imageNotes || []);
    if (!parsed) throw new Error(t("sum.empty"));
    result = { key, ...parsed, at: Date.now(), model: S.model };
  } catch (e) {
    console.warn(e);
    result = { key, error: e.message || String(e) };
  } finally {
    if (summaryJobs.get(src.id) === key) summaryJobs.delete(src.id);
  }
  if (!session.sources.includes(src)) return; // źródło usunięte („Sprawdź ponownie”, nowa sesja)
  if (summaryKey(state.claims.filter((c) => c.srcId === src.id)) !== key) { maybeSummarize(src); return; } // werdykty się zmieniły
  src.summary = result;
  touchSession();
  if (result.headline) saveMemory(src, { reused: !!src.fromMemory });
  rerenderHead(src);
}

// ---------- chwyty erystyczne (lib/tricks.js) ----------
// Nie werdykt: pokazują sposób argumentowania. Model zwraca numer chwytu, cytat i zdanie „dlaczego”;
// definicję i „jak odpowiedzieć” ma wtyczka (0 tokenów).
let trickSeq = 0;
const newTrickId = () => `t${Date.now().toString(36)}${++trickSeq}`;
const trickMax = (audio) => (S.tricks === false ? 0 : audio ? 2 : 3);
const closedTricks = new Set(); // źródła ze zwiniętą listą chwytów
function addTricks(src, list) {
  if (!src || !list.length) return;
  const now = Date.now();
  src.tricks = [...(src.tricks || []), ...list.map((x) => ({ ...x, id: newTrickId(), srcId: src.id, t: now }))];
  const g = groupEl(src.id, { create: false });
  if (g) renderGroupHead(g);
  touchSession();
}
function renderTricks(g, src) {
  const box = g.querySelector(".tricks");
  if (!box) return;
  const list = src.tricks || [];
  const lang = getLang();
  const sig = `${lang}|${list.map((x) => `${x.id}${x.inPage === false ? "-" : ""}`).join(",")}|${closedTricks.has(src.id)}|${!!src.tricksChecked}|${S.tricks !== false}`;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  if (!list.length) {
    // sprawdzane, ale nic wyraźnego – krótka linijka, żeby było widać, że funkcja działa
    box.hidden = !src.tricksChecked || S.tricks === false;
    box.replaceChildren(Object.assign(document.createElement("p"), { className: "tricks-none hint", textContent: `🎭 ${t("trick.none")}`, title: t("trick.noneHint") }));
    return;
  }
  box.hidden = false;
  const det = Object.assign(document.createElement("details"), { open: !closedTricks.has(src.id) });
  det.addEventListener("toggle", () => { if (det.open) closedTricks.delete(src.id); else closedTricks.add(src.id); box.dataset.sig = ""; });
  const sum = document.createElement("summary");
  sum.append(Object.assign(document.createElement("b"), { textContent: `🎭 ${t("trick.title", { n: list.length })}` }));
  det.append(sum, Object.assign(document.createElement("p"), { className: "hint trick-note", textContent: t("trick.note") }));
  for (const x of list) {
    const d = TRICKS[x.trick];
    if (!d) continue;
    const item = Object.assign(document.createElement("div"), { className: "trick" });
    const head = Object.assign(document.createElement("div"), { className: "trick-head" });
    head.append(Object.assign(document.createElement("span"), { className: "trick-name", textContent: trickName(x.trick, lang) }));
    if (x.speaker) head.append(Object.assign(document.createElement("span"), { className: "muted", textContent: x.speaker }));
    if (isPageKind(src.kind) && x.inPage !== false && x.quote) {
      const go = Object.assign(document.createElement("button"), { type: "button", className: "goto", textContent: t("page.show") });
      go.onclick = () => showInPage(x);
      head.append(go);
    }
    const more = document.createElement("details");
    more.className = "trick-more";
    more.append(Object.assign(document.createElement("summary"), { textContent: t("trick.more") }),
      Object.assign(document.createElement("p"), { textContent: d.def[lang] || d.def.en }));
    const ans = document.createElement("p");
    ans.append(Object.assign(document.createElement("b"), { textContent: `${t("trick.answer")} ` }), d.answer[lang] || d.answer.en);
    more.append(ans);
    item.append(head, Object.assign(document.createElement("blockquote"), { className: "quote", textContent: `„${x.quote}”` }),
      Object.assign(document.createElement("p"), { className: "trick-why", textContent: x.why }), more);
    det.append(item);
  }
  box.replaceChildren(det);
}

// ---------- sygnały oszustwa (lib/scam.js) i Lista Ostrzeżeń CERT (lib/certlist.js) ----------
// Lokalnie, bez modelu. Model dostaje krótką wskazówkę tylko wtedy, gdy coś się znalazło.
const TRUSTED_TIERS = ["media", "dokument", "dane", "urzad", "nauka", "factcheck", "encyklopedia"];
let certData = null; // przygotowana lista (tekst z \n…\n) albo null
function loadCert({ wait = false, force = false } = {}) {
  if (S.certList === false) return Promise.resolve(null);
  return certList({
    wait, force,
    onLoaded: (c) => { // lista dotarła później niż sprawdzenie – przelicz ostrzeżenia
      certData = c;
      for (const src of session.sources) if (isPageKind(src.kind)) { computeScam(src); rerenderHead(src); }
      if ($("settings").open) renderCertInfo();
    },
  }).then((c) => (certData = c)).catch(() => null);
}
function computeScam(src) {
  if (!isPageKind(src.kind) || S.scamCheck === false) { delete src.scam; return null; }
  const meta = src.meta || {};
  const pageUrl = src.pageUrl || meta.pageUrl || src.url || "";
  const text = [src.text, meta.alt, ...(src.imageNotes || []).map((n) => n.text)].filter(Boolean).join("\n");
  const res = scamSignals({
    pageUrl, siteName: meta.site, links: meta.links || [], text, kind: src.kind,
    trustedPage: TRUSTED_TIERS.includes(sourceTier(pageUrl)),
    cert: S.certList !== false && certData ? (h) => certLookup(certData, h) : null,
  });
  if (res.level) src.scam = { ...res, at: Date.now() };
  else delete src.scam;
  return src.scam || null;
}
function scamEl(scam) {
  const box = Object.assign(document.createElement("div"), { className: `scam-box ${scam.level}` });
  box.setAttribute("role", "note");
  box.append(Object.assign(document.createElement("b"), { className: "scam-title", textContent: `⚠ ${t(scam.level === "high" ? "scam.titleHigh" : "scam.titleMedium")}` }));
  const ul = document.createElement("ul");
  for (const s of scam.signals.slice(0, 6)) ul.append(Object.assign(document.createElement("li"), { textContent: scamLine(s) }));
  box.append(ul, Object.assign(document.createElement("p"), { className: "scam-advice", textContent: t("scam.advice") }));
  const rep = Object.assign(document.createElement("p"), { className: "scam-report" });
  rep.append(`${t("scam.report")} `, Object.assign(document.createElement("a"), { href: "https://incydent.cert.pl/", target: "_blank", rel: "noopener noreferrer", textContent: "incydent.cert.pl" }), ` · ${t("scam.reportSms")}`);
  box.append(rep, Object.assign(document.createElement("p"), { className: "hint", textContent: t("scam.note") }));
  return box;
}
async function renderCertInfo() {
  const el = $("certInfo");
  if (!el) return;
  const info = await certInfoStored().catch(() => null);
  el.textContent = info ? t("set.certInfo", { n: info.n.toLocaleString(getLang() === "pl" ? "pl-PL" : "en-US"), date: fmtDate(info.at) }) : t("set.certNone");
}

// Liczniki werdyktów („Prawda: 3 · Fałsz: 2”).
function pillsEl(claims, className) {
  const counts = verdictCounts(claims);
  const box = document.createElement("div");
  box.className = className;
  box.append(...Object.entries(VERDICTS).filter(([k]) => counts[k]).map(([k, v]) => {
    const p = document.createElement("span");
    p.className = "pill";
    p.dataset.tone = v.tone;
    p.textContent = `${verdictLabel(k)}: ${counts[k]}`;
    return p;
  }));
  return box;
}
// Data wypowiedzi przy źródle: z metadanych strony / filmu, „na żywo” albo wpisana ręcznie (✎).
function dateEl(src) {
  const row = document.createElement("div");
  row.className = "src-date muted";
  const d = srcDate(src);
  const live = src.kind === "mic" || src.live;
  const label = Object.assign(document.createElement("span"), {
    textContent: `📅 ${d ? t(src.dateSource === "user" ? "date.user" : "date.page", { date: fmtDay(d) }) : live ? t("date.live") : t("date.unknown")}`,
    title: t("date.hint"),
  });
  const edit = Object.assign(document.createElement("button"), { type: "button", className: "icon small", textContent: "✎", title: t("date.edit") });
  edit.setAttribute("aria-label", t("date.edit"));
  edit.onclick = () => {
    const input = Object.assign(document.createElement("input"), { type: "date", value: d, max: new Date().toISOString().slice(0, 10) });
    input.setAttribute("aria-label", t("date.edit"));
    const done = () => {
      src.date = input.value;
      src.dateSource = input.value ? "user" : "";
      if (input.value) src.live = false;
      touchSession();
      const g = groupEl(src.id, { create: false });
      if (g) renderGroupHead(g);
    };
    input.onchange = done;
    input.onkeydown = (e) => { if (e.key === "Escape") { const g = groupEl(src.id, { create: false }); if (g) renderGroupHead(g); } };
    row.replaceChildren(input);
    input.focus();
  };
  row.append(label, edit);
  return row;
}

function imageTitle(note) {
  if (note.topic) return note.topic;
  const chars = [...note.text.replace(/\s+/g, " ").trim()];
  return `${t(`imgtype.${note.type}`)}: „${chars.slice(0, 60).join("")}${chars.length > 60 ? "…" : ""}”`;
}

// Obrazki źródła: miniatura, typ, tekst odczytany z obrazka, uwagi, wyszukiwanie obrazem.
function imagesEl(src) {
  const wrap = document.createElement("div");
  wrap.className = "src-images";
  for (const [i, im] of src.images.entries()) {
    const note = (src.imageNotes || []).find((x) => x.index === i + 1) || {};
    const card = document.createElement("div");
    card.className = "img-card";
    const img = Object.assign(document.createElement("img"), { src: im.thumb, alt: t("img.n", { n: i + 1 }), title: t("img.zoom") });
    img.onclick = () => card.classList.toggle("big");
    const body = document.createElement("div");
    body.className = "img-body";
    const title = document.createElement("div");
    title.className = "img-title";
    title.textContent = `🖼 ${t("img.n", { n: i + 1 })}${note.type ? ` · ${t(`imgtype.${note.type}`)}` : ""}`;
    body.append(title);
    if (note.topic && src.images.length > 1) body.append(Object.assign(document.createElement("div"), { className: "img-topic", textContent: note.topic }));
    if (note.text) {
      const det = document.createElement("details");
      det.append(Object.assign(document.createElement("summary"), { textContent: t("img.readText") }), Object.assign(document.createElement("div"), { className: "img-text", textContent: note.text }));
      body.append(det);
    }
    if (note.notes) body.append(Object.assign(document.createElement("p"), { className: "img-notes", textContent: `${t("img.notes")}: ${note.notes}` }));
    body.append(reverseSearchEl(im));
    card.append(img, body);
    wrap.append(card);
  }
  return wrap;
}
// Wyszukiwanie obrazem: gdzie i kiedy ten obraz pojawił się wcześniej (zdjęcia wyrwane z kontekstu).
function reverseSearchEl(im) {
  const row = document.createElement("div");
  row.className = "img-search";
  row.append(Object.assign(document.createElement("span"), { className: "muted", textContent: `${t("img.search")}:` }));
  const link = (label, href) => Object.assign(document.createElement("a"), { textContent: label, href, target: "_blank", rel: "noopener noreferrer" });
  if (/^https?:/.test(im.src || "")) {
    const u = encodeURIComponent(im.src);
    row.append(link("Google Lens", `https://lens.google.com/uploadbyurl?url=${u}`), link("TinEye", `https://tineye.com/search?url=${u}`),
      link("Yandex", `https://yandex.com/images/search?rpt=imageview&url=${u}`));
  } else {
    // wycinek nie ma adresu: kopiujemy obraz do schowka i otwieramy Google Lens (tam Ctrl+V)
    const copy = Object.assign(document.createElement("button"), { type: "button", className: "img-copy", textContent: `📋 ${t("img.copy")}` });
    copy.onclick = async () => {
      try {
        const bmp = await createImageBitmap(await (await fetch(im.thumb)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        c.getContext("2d").drawImage(bmp, 0, 0);
        const png = await c.convertToBlob({ type: "image/png" });
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        copy.textContent = `✓ ${t("img.copied")}`;
      } catch (e) { copy.textContent = t("img.copyFailed"); console.warn(e); }
    };
    row.append(copy, link("Google Lens", "https://lens.google.com/"), link("TinEye", "https://tineye.com/"));
  }
  return row;
}
function showImageError(p) {
  if (p.imageError === "noAccess") {
    banner(`${esc(t("img.noAccess"))} <a href="#" data-grant-all>${esc(t("img.grantAll"))}</a>`, "error");
    $("banner").querySelector("[data-grant-all]")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const ok = await chrome.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
      if (ok) banner(esc(t("img.granted")));
    });
  } else {
    banner(esc(t(p.imageError === "frame" ? "img.frame" : p.imageError === "notVisible" ? "img.notVisible" : "img.failed", { msg: p.imageErrorMsg || "" })));
  }
}

// Notka w grupie bez kart: „słucham…” albo „nic do sprawdzenia”.
function renderGroupNote(g) {
  const note = g.querySelector(".src-note");
  const hasCards = !!g.querySelector(".cards .card:not(.skeleton)");
  const checking = !!g.querySelector(".card.skeleton");
  const listening = state.running && g.dataset.src === state.audioSrcId;
  note.hidden = hasCards || checking;
  note.textContent = listening ? t("src.listening", { s: S.intervalSec }) : t("src.noClaims");
}

function cardEl(c) {
  const v = VERDICTS[c.verdict];
  const node = $("cardTpl").content.firstElementChild.cloneNode(true);
  node.dataset.tone = v.tone;
  node.dataset.cid = c.id || "";
  const pill = node.querySelector(".pill");
  pill.textContent = verdictLabel(c.verdict);
  pill.dataset.tone = v.tone;
  node.querySelector(".conf").textContent = t("card.confidence", { c: t(`conf.${c.confidence}`) });
  node.querySelector("time").textContent = hhmm(c.t);
  const q = node.querySelector(".quote");
  q.textContent = c.quote ? `${c.speaker ? c.speaker + ": " : ""}„${c.quote}”` : "";
  q.hidden = !c.quote;
  node.querySelector(".claim-label").textContent = t("card.claimLabel");
  node.querySelector(".claim").textContent = c.claim;
  node.querySelector(".expl-label").textContent = t("card.explLabel");
  node.querySelector(".expl").textContent = c.explanation;
  const dl = node.querySelector(".more");
  if (c.image > 0) node.querySelector(".conf").textContent += ` · 🖼 ${t("img.fromImage", { n: c.image })}`;
  if (c.fromMemory) {
    const mem = Object.assign(document.createElement("span"), { className: "mem-tag", textContent: `🧠 ${t("mem.tag")}`, title: t("mem.cardNote", { date: fmtDate(c.fromMemory) }) });
    node.querySelector(".card-head time").before(mem);
  }
  for (const [label, val] of [[t("card.visual"), c.visual_issues], [t("card.evidence"), c.evidence], [t("card.counter"), c.counter_evidence], [t("card.missing"), c.missing_data]]) {
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
    const tier = sourceTier(s.url); // poziom źródła po domenie – bez modelu
    if (tier) {
      const b = Object.assign(document.createElement("span"), { className: "tier", textContent: t(`tier.${tier}`), title: t(`tierHint.${tier}`) });
      b.dataset.tone = TIER_TONE[tier];
      li.append(" ", b);
    }
    ul.append(li);
  }
  const rn = node.querySelector(".recheck-note");
  const err = recheckErrors.get(c.id);
  if (rechecking.has(c.id)) { rn.hidden = false; rn.classList.add("busy"); rn.textContent = t("rc.running"); }
  else if (err) { rn.hidden = false; rn.classList.add("warn"); rn.textContent = `⚠ ${t("rc.failed", { msg: err })}`; }
  else if (c.recheck) {
    const by = `${providerName(c.recheck.provider)} · ${c.recheck.model || "?"}`;
    rn.hidden = false;
    rn.textContent = `🔍 ${c.recheck.prev?.verdict && c.recheck.prev.verdict !== c.verdict
      ? t("rc.noteChanged", { by, from: verdictLabel(c.recheck.prev.verdict) }) : t("rc.noteSame", { by })}`;
  }
  const go = node.querySelector(".goto");
  const cSrc = findSource(c.srcId);
  if (isPageKind(cSrc?.kind) && (c.quote || c.image > 0 || cSrc.kind === "area") && c.inPage !== false) {
    go.hidden = false;
    go.textContent = t("page.show");
    go.addEventListener("click", () => showInPage(c));
  }
  if (c.factchecks?.length) node.querySelector(".fc-box").replaceWith(factChecksEl(c));
  wireCardFoot(node, c);
  wireFold(node, c);
  return node;
}
// W źródle z oceną całości karta jest zwinięta do werdyktu i twierdzenia; klik rozwija szczegóły.
function wireFold(node, c) {
  const fold = node.querySelector(".fold");
  const paint = () => {
    const open = openCards.has(c.id);
    node.classList.toggle("open", open);
    fold.setAttribute("aria-expanded", String(open));
    fold.title = t(open ? "card.fold" : "card.unfold");
    fold.setAttribute("aria-label", fold.title);
  };
  const toggle = () => { if (openCards.has(c.id)) openCards.delete(c.id); else openCards.add(c.id); paint(); };
  fold.onclick = (e) => { e.stopPropagation(); toggle(); };
  node.addEventListener("click", (e) => {
    const g = node.closest(".src-group");
    if (!g?.classList.contains("summarised") || g.classList.contains("open-all") || node.classList.contains("open")) return;
    if (e.target.closest("a, button, textarea, input")) return;
    toggle();
  });
  paint();
}

// Co o tym twierdzeniu napisały redakcje fact-checkingowe (Google Fact Check Tools).
function factChecksEl(c) {
  const box = document.createElement("div");
  box.className = "fc-box";
  box.append(Object.assign(document.createElement("div"), { className: "fc-title", textContent: `📚 ${t("fc.title")}` }));
  const ul = document.createElement("ul");
  for (const f of c.factchecks) {
    const li = document.createElement("li");
    const rating = Object.assign(document.createElement("span"), { className: "pill", textContent: f.rating || "?" });
    rating.dataset.tone = ratingTone(f.rating);
    const a = Object.assign(document.createElement("a"), { href: f.url, target: "_blank", rel: "noopener noreferrer", textContent: f.title || f.claim || f.url });
    li.append(rating, ` ${f.publisher}${f.date ? ` · ${f.date.slice(0, 10)}` : ""}: `, a);
    ul.append(li);
  }
  box.append(ul);
  if (c.fcConflict) box.append(Object.assign(document.createElement("p"), { className: "fc-conflict", textContent: `⚠ ${t("fc.conflict")}` }));
  return box;
}

// Stopka karty: ocena werdyktu (👍/👎 + komentarz) i „Kopiuj jako odpowiedź”.
function wireCardFoot(node, c) {
  const up = node.querySelector(".fb-up"), down = node.querySelector(".fb-down"), copy = node.querySelector(".copy-reply");
  const box = node.querySelector(".fb-box"), ta = box.querySelector("textarea"), note = node.querySelector(".fb-note");
  up.title = t("fb.up"); up.setAttribute("aria-label", t("fb.up"));
  down.title = t("fb.down"); down.setAttribute("aria-label", t("fb.down"));
  copy.textContent = `📋 ${t("reply.copy")}`;
  copy.title = t("reply.copyHint");
  box.querySelector(".fb-done").textContent = t("fb.done");
  const paint = () => {
    const r = c.feedback?.rating || 0;
    up.classList.toggle("on", r > 0); up.setAttribute("aria-pressed", String(r > 0));
    down.classList.toggle("on", r < 0); down.setAttribute("aria-pressed", String(r < 0));
    note.hidden = !box.hidden || !c.feedback?.comment;
    note.textContent = c.feedback?.comment ? `💬 ${c.feedback.comment}` : "";
  };
  const rate = (r) => {
    if (c.feedback?.rating === r) { delete c.feedback; box.hidden = true; } // drugie kliknięcie cofa ocenę
    else {
      c.feedback = { rating: r, comment: c.feedback?.comment || "", at: Date.now() };
      ta.value = c.feedback.comment;
      ta.placeholder = t(r > 0 ? "fb.placeholderUp" : "fb.placeholderDown");
      box.hidden = false;
      if (r < 0) ta.focus();
    }
    paint();
    touchSession();
  };
  up.onclick = () => rate(1);
  down.onclick = () => rate(-1);
  ta.oninput = () => { if (c.feedback) { c.feedback.comment = ta.value.slice(0, 1000); touchSession(); } };
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); box.querySelector(".fb-done").click(); } };
  box.querySelector(".fb-done").onclick = () => { box.hidden = true; paint(); setStatus(t("fb.saved")); };
  note.onclick = () => { box.hidden = false; ta.value = c.feedback?.comment || ""; paint(); ta.focus(); };
  copy.onclick = () => openReply([c], findSource(c.srcId));
  // 👎 → „Sprawdź dokładniej” (ten sam albo inny skonfigurowany dostawca)
  const more = box.querySelector(".fb-more"), rb = more.querySelector(".recheck"), by = more.querySelector(".recheck-by"), sel = by.querySelector("select");
  rb.textContent = `🔍 ${t("rc.button")}`;
  rb.title = t("rc.hint");
  by.querySelector("span").textContent = t("rc.by");
  const alts = recheckProviders();
  by.hidden = alts.length < 2;
  sel.replaceChildren(...alts.map((a) => new Option(a.label, a.provider)));
  rb.onclick = () => {
    if (c.feedback) c.feedback.comment = ta.value.slice(0, 1000);
    box.hidden = true;
    paint();
    recheckClaim(c, sel.value || S.provider);
  };
  const paintMore = () => { more.hidden = !(c.feedback?.rating < 0); rb.disabled = rechecking.has(c.id); };
  up.addEventListener("click", paintMore);
  down.addEventListener("click", paintMore);
  paint();
  paintMore();
}

// ---------- „Sprawdź dokładniej” ----------
// Dostawcy do „drugiej opinii”: bieżący + inni z kluczem i wybranym kiedyś modelem.
function recheckProviders() {
  const out = [{ provider: S.provider, label: `${providerName(S.provider)} · ${S.model || "?"}` }];
  for (const p of Object.keys(PROVIDERS)) {
    if (p === S.provider || p === "chatgpt") continue;
    const hasKey = p === "apikey" ? !!S.apiKey : !!S.keys?.[p];
    if (hasKey && S.models?.[p]) out.push({ provider: p, label: `${providerName(p)} · ${S.models[p]}` });
  }
  return out;
}
function repaintCard(c) {
  const old = $("feed").querySelector(`.card[data-cid="${CSS.escape(c.id)}"]`);
  if (old) old.replaceWith(cardEl(c));
}
const CLAIM_FIELDS = ["claim", "verdict", "confidence", "explanation", "evidence", "counter_evidence", "missing_data", "sources",
  "visual_issues", "keywords", "category", "provider", "model", "mode"];
async function recheckClaim(c, provider = S.provider) {
  if (rechecking.has(c.id)) return;
  if (limitReached()) { showLimitBanner(); return; }
  const src = findSource(c.srcId);
  rechecking.add(c.id);
  recheckErrors.delete(c.id);
  repaintCard(c);
  setStatus(t("rc.running"), "busy");
  const prevVerdict = c.verdict;
  try {
    if (provider === S.provider) await ensureModel();
    const who = { provider, model: provider === S.provider ? S.model : S.models[provider] };
    let webSearch = S.webSearch && !(provider === S.provider && state.disabled.has("webSearch"));
    let structured = PROVIDERS[provider]?.structured !== false && !(provider === S.provider && state.disabled.has("structured"));
    const view = src ? { ...src, text: S.maskPeople ? maskHandles(src.text || "") : src.text } : {};
    let res;
    for (let attempt = 0; ; attempt++) {
      const body = buildRecheckRequest({
        model: who.model, today: new Date().toISOString().slice(0, 10), webSearch, structured, outLang: getLang(),
        claim: c, src: view, note: c.feedback?.comment || "", maxSearches: modeOf("thorough").searches,
      });
      try {
        res = await callModel({ provider, key: await getToken(provider), body, timeoutMs: 240_000, idleMs: 120_000 });
        break;
      } catch (e) {
        const f = unsupportedFeature(e);
        if (attempt < 2 && f === "webSearch" && webSearch) { webSearch = false; continue; }
        if (attempt < 2 && f === "structured" && structured) { structured = false; continue; }
        throw e;
      }
    }
    recordUsage(res.usage, who).catch((e) => console.warn(e));
    const [r] = parseResult(res.text);
    if (!r) throw new Error(t("rc.empty"));
    if (!r.sources.length) r.sources = (res.citations || []).slice(0, 5);
    const prev = Object.fromEntries(CLAIM_FIELDS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));
    Object.assign(c, {
      claim: r.claim || c.claim, verdict: r.verdict, confidence: r.confidence, explanation: r.explanation, evidence: r.evidence,
      counter_evidence: r.counter_evidence, missing_data: r.missing_data, sources: r.sources, keywords: r.keywords || c.keywords,
      category: r.category || c.category, provider: who.provider, model: who.model, mode: "thorough",
      recheck: { at: Date.now(), prev, provider: who.provider, model: who.model, note: c.feedback?.comment || "" },
    });
    if (r.visual_issues) c.visual_issues = r.visual_issues;
    if (c.factchecks?.length) c.fcConflict = conflicts(VERDICTS[c.verdict]?.tone, c.factchecks);
    setStatus(c.verdict === prevVerdict ? t("rc.same", { v: verdictLabel(c.verdict) }) : t("rc.changed", { from: verdictLabel(prevVerdict), to: verdictLabel(c.verdict) }));
  } catch (e) {
    console.warn(e);
    recheckErrors.set(c.id, e.message || String(e));
    setStatus(t("rc.failed", { msg: e.message || String(e) }));
  } finally {
    rechecking.delete(c.id);
  }
  repaintCard(c);
  const g = groupEl(c.srcId, { create: false });
  if (g) renderGroupHead(g);
  renderSummary();
  touchSession();
  saveSessionNow();
  if (src && c.recheck && !recheckErrors.has(c.id)) {
    saveMemory(src);
    maybeSummarize(src);
    if (isPageKind(src.kind)) highlightSource(src);
  }
}

function addCard(c) {
  const g = groupEl(c.srcId);
  const node = cardEl(c);
  node.classList.add("fresh");
  g.querySelector(".cards").prepend(node);
  toTop(g);
  renderGroupHead(g);
  renderGroupNote(g);
  return node;
}

// Pełne przerysowanie (zmiana języka, otwarcie sesji z historii, po podświetleniu na stronie).
function renderFeed() {
  const collapsed = new Set([...$("feed").querySelectorAll(".src-group.collapsed")].map((g) => g.dataset.src));
  $("feed").querySelectorAll(".src-group").forEach((n) => n.remove());
  const lastOf = (src) => Math.max(src.at || 0, ...state.claims.filter((c) => c.srcId === src.id).map((c) => c.t || 0));
  for (const src of [...session.sources].sort((a, b) => lastOf(a) - lastOf(b))) {
    const g = groupEl(src.id);
    if (collapsed.has(src.id)) g.classList.add("collapsed");
    for (const c of state.claims.filter((x) => x.srcId === src.id)) g.querySelector(".cards").prepend(cardEl(c));
    renderGroupHead(g);
    renderGroupNote(g);
  }
  $("empty").hidden = session.sources.length > 0;
  renderSummary();
  renderTranscript();
}
const rerenderCards = renderFeed;

// Przełącznik źródła dźwięku: zablokowany w trakcie nagrywania (zmiana działa dopiero po ponownym Start).
function lockSource(on) {
  $("srcSeg").classList.toggle("locked", on);
  $("srcSeg").title = on ? t("src.locked") : "";
  document.querySelectorAll("input[name=src]").forEach((r) => (r.disabled = on));
}

// ---------- nagrywana karta: zmiana filmu / tytułu ----------
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!state.running || !(info.url || info.title)) return;
  const src = findSource(state.audioSrcId);
  if (src?.kind !== "tab" || src.tabId !== tabId) return;
  if (info.url && !sameUrl(info.url, src.url)) {
    // inny film w tej samej karcie: dotychczasowy tekst zostaje przy starym źródle, nowy idzie do nowego
    const next = addSource({ kind: "tab", title: cleanTitle(tab.title), url: info.url, tabId, speakers: src.speakers || [] });
    state.audioSrcId = next.id;
    setTimeout(() => detectMediaDate(next), 2500); // YouTube podmienia metadane chwilę po zmianie adresu
    const g = groupEl(next.id);
    toTop(g);
    renderGroupNote(g);
    const old = groupEl(src.id, { create: false });
    if (old) renderGroupNote(old);
  } else if (info.title && sameUrl(tab.url, src.url) && cleanTitle(info.title) !== src.title) {
    src.title = cleanTitle(info.title); // YouTube podmienia tytuł chwilę po zmianie adresu
    const g = groupEl(src.id, { create: false });
    if (g) renderGroupHead(g);
    touchSession();
  }
  renderActivity();
});

// ---------- tekst z transkrypcji ----------
function addText(text) {
  if (!text) return;
  state.segments.push({ t: Date.now(), text, checked: false, srcId: state.audioSrcId, ...(state.speaker ? { speaker: state.speaker } : {}) });
  renderTranscript();
  touchSession();
  clearTimeout(addText.headTimer);
  addText.headTimer = setTimeout(() => { const g = groupEl(state.audioSrcId, { create: false }); if (g) renderGroupHead(g); }, 3000);
}

// ---------- sygnały pracy: pasek aktywności, karta-zaślepka, znaczek na ikonie, komunikat na stronie ----------
const activity = { on: false, since: 0, srcId: null, stage: "connecting", searches: new Set(), verdicts: 0, text: "", part: null };
let activityTick = null;

function actStart(srcId) {
  Object.assign(activity, { on: true, since: Date.now(), srcId, stage: "connecting", searches: new Set(), verdicts: 0, text: "", part: null });
  const g = groupEl(srcId);
  toTop(g);
  if (!g.querySelector(".card.skeleton")) g.querySelector(".cards").prepend(skeletonEl());
  renderGroupNote(g);
  setBadge("checking");
  renderActivity();
}
function actPart(i, n) {
  Object.assign(activity, { part: n > 1 ? { i, n } : null, stage: "connecting", searches: new Set(), verdicts: 0, text: "" });
  renderActivity();
}
// Zdarzenia strumienia → etap pracy modelu.
function actEvent(ev) {
  const before = activity.stage;
  if (ev.type === "response.created" || ev.type === "response.in_progress") activity.stage = "thinking";
  else if (/^response\.web_search_call\./.test(ev.type)) { activity.stage = "searching"; if (ev.item_id) activity.searches.add(ev.item_id); }
  else if (ev.type === "response.output_item.added" && ev.item?.type === "web_search_call") { activity.stage = "searching"; activity.searches.add(ev.item.id); }
  else if (ev.type === "response.output_item.added" && ev.item?.type === "reasoning") activity.stage = "thinking";
  else if (ev.type === "response.output_text.delta") {
    activity.stage = "writing";
    activity.text += ev.delta || "";
    activity.verdicts = (activity.text.match(/"verdict"\s*:/g) || []).length;
  }
  if (activity.stage !== before) { renderActivity(); pageBusyUpdate(); }
}
function actStop(newClaims = 0) {
  const srcId = activity.srcId;
  activity.on = false;
  const g = srcId && groupEl(srcId, { create: false });
  g?.querySelector(".card.skeleton")?.remove();
  if (g) { renderGroupHead(g); renderGroupNote(g); }
  if (state.running) setBadge("listening");
  else if (newClaims > 0) setBadge("done", newClaims);
  else setBadge("");
  renderActivity();
}
function stageLabel() {
  const n = activity.searches.size;
  const label = {
    connecting: t("act.connecting", { name: providerName(S.provider) }),
    thinking: t("act.thinking"),
    searching: n > 1 ? t("act.searchingN", { n }) : t("act.searching"),
    writing: activity.verdicts ? t("act.writingN", { n: activity.verdicts }) : t("act.writing"),
  }[activity.stage];
  return activity.part ? t("act.part", { i: activity.part.i, n: activity.part.n, stage: label }) : label;
}
function renderActivity() {
  const el = $("activity");
  const listening = state.running && !activity.on;
  el.hidden = !activity.on && !state.running;
  el.classList.toggle("listening", listening);
  const queued = state.queue?.length ? ` · ${t("queue.short", { n: state.queue.length })}` : "";
  if (activity.on) {
    $("actText").textContent = stageLabel() + queued;
    $("actTime").textContent = `${Math.round((Date.now() - activity.since) / 1000)} s`;
    const sk = $("feed").querySelector(".card.skeleton .sk-label span:last-child");
    if (sk) sk.textContent = stageLabel();
  } else if (listening) {
    const src = findSource(state.audioSrcId);
    const left = S.intervalSec - (Math.floor((Date.now() - state.timerStart) / 1000) % S.intervalSec);
    $("actText").textContent = (src?.kind === "tab" ? t("act.listening", { title: sourceTitle(src) }) : t("act.listeningMic")) + queued;
    $("actTime").textContent = t("act.nextCheck", { s: left });
  }
  const need = activity.on || state.running;
  if (need && !activityTick) activityTick = setInterval(renderActivity, 1000);
  if (!need && activityTick) { clearInterval(activityTick); activityTick = null; }
}
function skeletonEl() {
  const node = document.createElement("article");
  node.className = "card skeleton";
  const label = document.createElement("div");
  label.className = "sk-label";
  label.append(Object.assign(document.createElement("span"), { className: "spinner" }), Object.assign(document.createElement("span"), { textContent: stageLabel() }));
  node.append(label, ...[1, 2, 3].map(() => Object.assign(document.createElement("div"), { className: "sk-line" })));
  return node;
}
// Znaczek na ikonie wtyczki – widać pracę także, gdy panel jest schowany.
let badgeTimer = null;
function setBadge(mode, n = 0) {
  const a = chrome.action;
  if (!a?.setBadgeText) return;
  clearTimeout(badgeTimer);
  const cfg = {
    checking: ["…", "#1f4fd1", t("badge.checking")],
    listening: ["●", "#b3261e", t("badge.listening")],
    done: [String(n), "#137a4b", t("badge.done", { n })],
  }[mode] || ["", "#1f4fd1", ""];
  a.setBadgeText({ text: cfg[0] }).catch(() => {});
  a.setBadgeBackgroundColor({ color: cfg[1] }).catch(() => {});
  a.setBadgeTextColor?.({ color: "#ffffff" })?.catch?.(() => {});
  a.setTitle({ title: cfg[2] ? `Fact Checker – ${cfg[2]}` : chrome.i18n.getMessage("actionTitle") || "Fact Checker" }).catch(() => {});
  if (mode === "done") badgeTimer = setTimeout(() => setBadge(state.running ? "listening" : ""), 15_000);
}
// Ramka wokół sprawdzanego tekstu + komunikat w rogu strony (tylko dla tekstu ze strony).
function pageBusy(src, args) {
  if (!src || src.tabId == null || !isPageKind(src.kind)) return;
  runInTab(src.tabId, "busy", args, { frameId: src.frameId || 0 }).catch(() => {});
}
function pageBusyUpdate() {
  const src = activity.on && findSource(activity.srcId);
  if (src && isPageKind(src.kind)) pageBusy(src, { on: true, label: `${t("page.toastChecking")} ${stageLabel()}` });
}
// ---------- kolejka: wskazane teksty czekają, aż skończy się bieżące sprawdzanie ----------
state.queue = [];
let qSeq = 0;
// Uruchamia następną pozycję z kolejki, jeśli nic się teraz nie sprawdza.
function pump() {
  if (state.busy || !state.queue.length) return;
  if (limitReached()) { showLimitBanner(); return; }
  const next = state.queue.shift();
  renderQueue();
  if (next.kind === "manual") runCheck({ force: true, manualText: next.text });
  else checkPage(next);
}
const runQueued = () => setTimeout(pump, 0);

function captureTitle(p, text = p.text || "") {
  const chars = [...text.replace(/\s+/g, " ").trim()]; // po znakach, nie bajtach – żeby nie przeciąć emoji
  const snippet = chars.slice(0, 70).join("") + (chars.length > 70 ? "…" : "");
  if (!snippet) return [t(`kind.${p.kind || "fragment"}`), p.meta?.title].filter(Boolean).join(" – ");
  if (p.kind === "post") return `${p.meta?.author ? `${p.meta.author}: ` : ""}${snippet}`;
  if (p.kind === "article") return p.meta?.title || snippet;
  if (p.kind === "manual") return snippet;
  return `„${snippet}”`;
}
function renderQueue() {
  const box = $("queue");
  box.hidden = !state.queue.length;
  $("qTitle").textContent = t("queue.title", { n: state.queue.length });
  $("qList").replaceChildren(...state.queue.map((q) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${sourceIcon({ kind: q.kind })} ${captureTitle(q)}`;
    label.title = q.meta?.url || "";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon q-del";
    del.textContent = "✕";
    del.title = t("queue.remove");
    del.setAttribute("aria-label", t("queue.remove"));
    del.onclick = () => { state.queue = state.queue.filter((x) => x !== q); renderQueue(); renderActivity(); };
    li.append(label, del);
    return li;
  }));
}

// ---------- data wypowiedzi ----------
// RRRR-MM-DD z dowolnej daty (ISO, „2023-02-10T12:00:00Z”…); pusty tekst, gdy się nie da.
function normDate(v) {
  if (!v) return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v).trim());
  if (m) return m[1];
  const ts = Date.parse(v);
  return Number.isNaN(ts) ? "" : new Date(ts).toISOString().slice(0, 10);
}
const srcDate = (src) => (src ? src.date || normDate(src.meta?.date) : "");
const fmtDay = (d) => { const ts = Date.parse(`${d}T12:00:00`); return Number.isNaN(ts) ? d : new Date(ts).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }); };
// Metadane do zapytania: data poprawiona ręcznie ma pierwszeństwo, autor ukryty przy opcji prywatności.
function requestMeta(src) {
  const meta = { ...(src.meta || {}), date: srcDate(src) || "" };
  if (S.maskPeople) { delete meta.author; meta.masked = true; }
  return meta;
}
const maskHandles = (text) => String(text).replace(/@[A-Za-z0-9_]{2,15}\b/g, "@…");

// Data publikacji nagrywanego filmu (YouTube itp.) – wypowiedzi oceniamy według stanu na ten dzień.
async function detectMediaDate(src) {
  if (!src || src.kind !== "tab" || src.tabId == null || src.dateSource === "user") return;
  try {
    const info = await runInTab(src.tabId, "mediaInfo");
    if (!info || !sameUrl(info.url, src.url)) return;
    if (info.live) Object.assign(src, { live: true, date: "", dateSource: "page" });
    else if (normDate(info.date)) Object.assign(src, { live: false, date: normDate(info.date), dateSource: "page" });
    else return;
    const g = groupEl(src.id, { create: false });
    if (g) renderGroupHead(g);
    touchSession();
  } catch { /* brak dostępu do strony – data zostaje nieznana (można ją wpisać ręcznie) */ }
}

// ---------- mówcy ----------
// Transkrypcja dla modelu: „[Speaker: Jan Kowalski] …” tam, gdzie użytkownik wskazał, kto mówi.
function joinSegs(segs = []) {
  let out = "", cur;
  for (const x of segs) {
    const sp = x.speaker || "";
    if (sp !== (cur ?? "") && (sp || cur)) out += `${out ? "\n" : ""}[Speaker: ${sp || "unknown"}] `;
    cur = sp;
    out += `${x.text} `;
  }
  return out.trim();
}
function knownSpeakers() {
  const src = findSource(state.audioSrcId);
  const names = [...(src?.speakers || []), ...state.claims.filter((c) => c.srcId === state.audioSrcId && c.speaker).map((c) => c.speaker)];
  return [...new Set(names.map((x) => x.trim()).filter(Boolean))].slice(0, 8);
}
function setSpeaker(name) {
  state.speaker = String(name || "").trim().slice(0, 60);
  const src = findSource(state.audioSrcId);
  if (src && state.speaker) src.speakers = [state.speaker, ...(src.speakers || []).filter((x) => x !== state.speaker)].slice(0, 8);
  $("spkInput").value = "";
  renderSpeakerBar();
  touchSession();
}
function renderSpeakerBar() {
  const bar = $("speakerBar");
  bar.hidden = !state.running;
  if (bar.hidden) return;
  const chip = (label, value) => {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "chip", textContent: label });
    b.classList.toggle("on", state.speaker === value);
    b.setAttribute("aria-pressed", String(state.speaker === value));
    b.onclick = () => setSpeaker(value);
    return b;
  };
  const names = knownSpeakers();
  if (state.speaker && !names.includes(state.speaker)) names.unshift(state.speaker);
  $("spkChips").replaceChildren(chip(t("spk.auto"), ""), ...names.map((n) => chip(n, n)));
  $("spkList").replaceChildren(...names.map((n) => new Option(n)));
}

// ---------- koszty: licznik sesji i dnia, dzienny limit ----------
let dayUsage = { day: localDay(), ...emptyUsage() };
async function loadDayUsage() {
  const { usage } = await chrome.storage.local.get("usage").catch(() => ({}));
  dayUsage = usage?.day === localDay() ? { ...emptyUsage(), ...usage } : { day: localDay(), ...emptyUsage() };
}
const priceOverride = () => ({ in: S.priceIn, out: S.priceOut });
// Po kolei: dwa zapytania kończące się naraz (np. sprawdzenie i ocena całości) nie mogą nadpisać sobie dziennej sumy.
let usageChain = Promise.resolve();
function recordUsage(usage, who) {
  if (!usage) return Promise.resolve();
  const run = usageChain.then(() => recordUsageNow(usage, who));
  usageChain = run.catch(() => {});
  return run;
}
async function recordUsageNow(usage, who = {}) {
  const p = who.provider || S.provider, m = who.model || S.model;
  const cost = usageCost(p, m, usage, p === S.provider && m === S.model ? priceOverride() : {});
  session.usage = addTo(session.usage, usage, cost);
  await loadDayUsage(); // świeży odczyt – kilka okien panelu liczy wspólnie
  dayUsage = { ...addTo(dayUsage, usage, cost), day: localDay() };
  await chrome.storage.local.set({ usage: dayUsage });
  touchSession();
  renderCost();
  checkLimitWarning();
}
function renderCost() {
  const el = $("costLine");
  const u = { ...emptyUsage(), ...(session.usage || {}) };
  if (!u.calls) { el.hidden = true; return; }
  const lang = getLang();
  const plan = S.provider === "chatgpt" && !u.cost;
  el.textContent = plan
    ? t("cost.plan", { tokens: fmtTokens(u.input + u.output, lang) })
    : t("cost.line", { session: fmtUsd(u.cost, lang), today: fmtUsd(dayUsage.cost, lang) }) + (S.dailyLimit > 0 ? ` ${t("cost.limit", { limit: fmtUsd(S.dailyLimit, lang) })}` : "");
  el.title = t("cost.title", { calls: u.calls, input: fmtTokens(u.input, lang), output: fmtTokens(u.output, lang), searches: u.searches }) + (u.unknown ? ` ${t("cost.unknown")}` : "");
  el.classList.toggle("over", !plan && S.dailyLimit > 0 && dayUsage.cost >= S.dailyLimit);
  el.hidden = false;
}
const limitReached = () => S.dailyLimit > 0 && S.provider !== "chatgpt" && dayUsage.day === localDay() && dayUsage.cost >= S.dailyLimit && state.limitOkDay !== localDay();
function showLimitBanner() {
  banner(`${esc(t("cost.limitHit", { limit: fmtUsd(S.dailyLimit, getLang()), today: fmtUsd(dayUsage.cost, getLang()) }))} <a href="#" data-limit-ok>${esc(t("cost.continue"))}</a> · <a href="#" data-open-settings>${esc(t("cost.change"))}</a>`, "error");
  $("banner").querySelector("[data-limit-ok]")?.addEventListener("click", (e) => {
    e.preventDefault();
    state.limitOkDay = localDay();
    banner(null);
    pump();
  });
}
function checkLimitWarning() {
  if (!(S.dailyLimit > 0) || S.provider === "chatgpt" || state.limitWarnDay === localDay()) return;
  if (dayUsage.cost >= 0.8 * S.dailyLimit && dayUsage.cost < S.dailyLimit) {
    state.limitWarnDay = localDay();
    banner(esc(t("cost.limitWarn", { today: fmtUsd(dayUsage.cost, getLang()), limit: fmtUsd(S.dailyLimit, getLang()) })));
  }
}
// W ustawieniach: dzisiejsze zużycie i cennik wybranego modelu.
async function renderCostSettings() {
  await loadDayUsage();
  const lang = getLang();
  $("costToday").textContent = t("cost.today", { cost: fmtUsd(dayUsage.cost, lang), calls: dayUsage.calls, tokens: fmtTokens(dayUsage.input + dayUsage.output, lang) });
  const prov = formProvider();
  const pr = priceFor(prov, $("model").value, { in: $("priceIn").value, out: $("priceOut").value });
  $("priceHint").textContent = prov === "chatgpt" ? t("cost.planHint")
    : prov === "openrouter" ? t("cost.orHint")
      : pr.in == null ? t("cost.noPrice") : t("cost.price", { in: fmtUsd(pr.in, lang), out: fmtUsd(pr.out, lang), search: fmtUsd(pr.search, lang) });
}

// ---------- pamięć werdyktów ----------
const stripClaim = ({ id, srcId, t: _t, inPage, feedback, factchecks, fcConflict, fromMemory, replies, ...c }) => c;
// Jednorazowo: to, co sprawdziłeś przed włączeniem pamięci (i obrazki z historii), trafia do pamięci –
// dzięki temu obrazek sprawdzony dawniej też zostanie rozpoznany. Tylko w oknie pamięci (⚙, domyślnie 30 dni).
const BACKFILL_VERSION = 2;
async function backfillMemory() {
  if (!(S.memoryDays > 0)) return;
  const { memBackfill = 0 } = await chrome.storage.local.get("memBackfill");
  if (memBackfill >= BACKFILL_VERSION) return;
  const fresh = Date.now() - S.memoryDays * 86_400_000;
  let added = 0;
  for (const s of await listSessions()) {
    for (const src of s.sources || []) {
      if (!isPageKind(src.kind) || src.fromMemory || (src.at || 0) < fresh) continue;
      const claims = (s.claims || []).filter((c) => c.srcId === src.id); // także te z pamięci (np. obrazek przy nowym tekście)
      if (!claims.length && !src.imageNotes?.length) continue; // nic do zapamiętania (np. przerwane)
      try {
        const key = await contentKey({ text: src.text || "", images: src.images || [] });
        await saveToMemory({
          key, at: src.at, lang: getLang(), provider: claims.find((c) => c.provider)?.provider || "", model: claims.find((c) => c.model)?.model || s.model || "",
          kind: src.kind, title: src.title, claims: claims.map(stripClaim), imageNotes: src.imageNotes || [], backfill: true,
          ...(validSummary(src, claims) ? { summary: validSummary(src, claims) } : {}),
          ...(src.tricks?.length ? { tricks: src.tricks.map(({ trick, quote, speaker, why }) => ({ trick, quote, speaker, why })) } : {}),
        });
        added++;
      } catch (e) { console.warn(e); }
    }
  }
  await chrome.storage.local.set({ memBackfill: BACKFILL_VERSION });
  if (added && $("settings").open) renderMemInfo();
}
function remember(p, src) {
  if (!(S.memoryDays > 0) || !p.memKey) return;
  memKeys.set(src.id, p.memKey);
  saveMemory(src);
}
// Wpis w pamięci werdyktów: werdykty, opis obrazków i – gdy już jest – ocena całości.
function saveMemory(src, { reused = false } = {}) {
  const key = memKeys.get(src.id);
  if (!(S.memoryDays > 0) || !key) return;
  const claims = state.claims.filter((c) => c.srcId === src.id);
  const summary = validSummary(src, claims);
  const from = reused ? src.fromMemory : null; // wynik z pamięci: zostaje jego data i model
  saveToMemory({
    key, lang: getLang(), provider: from ? from.provider || "" : S.provider, model: from ? from.model || "" : S.model,
    ...(from ? { at: from.at } : {}), kind: src.kind, title: src.title,
    claims: claims.map(stripClaim), imageNotes: src.imageNotes || [], ...(summary ? { summary } : {}),
    ...(src.tricks?.length ? { tricks: src.tricks.map(({ trick, quote, speaker, why }) => ({ trick, quote, speaker, why })) } : {}),
    ...(src.tricksChecked ? { tricksChecked: true } : {}),
  }).catch((e) => console.warn(e));
}
// Wynik złożony z rozpoznanych obrazków (każdy mógł być sprawdzony w innym poście): numery obrazków od nowa.
function imagesHit(found) {
  return {
    at: Math.max(...found.map((m) => m.at)),
    model: found.find((m) => m.model)?.model || "",
    provider: found.find((m) => m.provider)?.provider || "",
    images: true,
    claims: found.flatMap((m, i) => m.claims.map((c) => ({ ...c, image: i + 1 }))),
    imageNotes: found.map((m, i) => (m.note ? { ...m.note, index: i + 1 } : null)).filter(Boolean),
    // ocena całości pasuje tylko, gdy dotyczyła dokładnie tych werdyktów (sprawdza to applyMemory)
    ...(found.length === 1 && found[0].summary ? { summary: found[0].summary } : {}),
  };
}
async function applyMemory(p, hit) {
  await ensureSession();
  const src = addSource({ ...sourceFields(p, (p.text || "").slice(0, MAX_TEXT)), imageNotes: hit.imageNotes || [], fromMemory: { at: hit.at, model: hit.model || "", provider: hit.provider || "", ...(hit.images ? { images: true } : {}) } });
  if (!src.text && (src.imageNotes[0]?.topic || src.imageNotes[0]?.text)) src.title = imageTitle(src.imageNotes[0]);
  recheck.set(src.id, p);
  $("lastSession").hidden = true;
  const now = Date.now();
  const claims = (hit.claims || []).map((c) => ({ ...c, id: newClaimId(), srcId: src.id, t: now, fromMemory: hit.at }));
  if (hit.summary?.headline && hit.summary.key === summaryKey(claims)) src.summary = hit.summary;
  if (hit.tricks?.length) src.tricks = hit.tricks.filter((x) => TRICKS[x.trick]).map((x) => ({ ...x, id: newTrickId(), srcId: src.id, t: now }));
  if (hit.tricksChecked || hit.tricks?.length) src.tricksChecked = true;
  computeScam(src);
  if (p.memKey) memKeys.set(src.id, p.memKey);
  for (const c of claims) { state.claims.push(c); addCard(c); }
  const g = groupEl(src.id);
  toTop(g);
  renderGroupHead(g);
  renderGroupNote(g);
  renderSummary();
  touchSession();
  if (claims.length) await highlightSource(src);
  setStatus(t("mem.status", { n: claims.length, date: fmtDate(hit.at) }));
  pageToast(p, `Fact Checker: ${t("mem.toast", { n: claims.length })}`);
  setBadge(state.running ? "listening" : "done", claims.length);
  enrichFactChecks(claims);
  if (!src.summary) maybeSummarize(src);
  saveSessionNow();
  runQueued();
}
// „Sprawdź ponownie”: wynik z pamięci znika, tekst/obrazek idzie do sprawdzenia od nowa.
function recheckSource(src) {
  const p = recheck.get(src.id);
  if (!p) return;
  recheck.delete(src.id);
  state.claims = state.claims.filter((c) => c.srcId !== src.id);
  session.sources = session.sources.filter((x) => x.id !== src.id);
  groupEl(src.id, { create: false })?.remove();
  renderSummary();
  touchSession();
  handleCapture({ ...p, noMemory: true, knownImages: null, memKey: null });
}
async function renderMemInfo() {
  const n = await memoryCount().catch(() => 0);
  $("memInfo").textContent = t("mem.count", { n });
  $("memClear").hidden = !n;
}

// ---------- gotowe fact-checki (Google Fact Check Tools) ----------
const fcQueue = [];
const fcCache = new Map(); // hasło → wyniki
let fcRunning = false;
function enrichFactChecks(claims = []) {
  if (!S.keys?.factcheck || state.fcOff) return;
  for (const c of claims) if (!c.factchecks && c.verdict !== "satyra") fcQueue.push(c);
  if (!fcRunning) runFcQueue();
}
async function runFcQueue() {
  fcRunning = true;
  try {
    while (fcQueue.length && !state.fcOff) {
      const c = fcQueue.shift();
      if (!state.claims.includes(c)) continue; // usunięte w międzyczasie
      const q = queryFor(c);
      if (!q) { c.factchecks = []; continue; }
      try {
        let items = fcCache.get(q);
        if (!items) { items = await searchClaims({ key: S.keys.factcheck, query: q }); fcCache.set(q, items); }
        c.factchecks = pickFactChecks(c, items, { lang: S.language });
        c.fcConflict = conflicts(VERDICTS[c.verdict]?.tone, c.factchecks);
      } catch (e) {
        if (e instanceof FactCheckApiError && [400, 401, 403].includes(e.status)) {
          state.fcOff = true;
          banner(esc(t("fc.keyError", { msg: e.message })) + openSettingsLink("err.settings"), "error");
          break;
        }
        console.warn(e);
        continue; // problem z siecią – kolejne twierdzenia próbujemy dalej
      }
      if (c.factchecks.length) updateCard(c);
      touchSession();
    }
  } finally {
    fcRunning = false;
  }
}
function updateCard(c) {
  const old = c.id && $("feed").querySelector(`.card[data-cid="${c.id}"]`);
  if (old) old.replaceWith(cardEl(c));
}

// ---------- „Kopiuj jako odpowiedź”: komentarz do wklejenia pod postem ----------
// Model pisze go na żądanie (lib/reply.js) z gotowego werdyktu i treści posta, w wybranym tonie. Tekst można
// poprawić przed skopiowaniem; wynik zostaje przy werdykcie (drugie otwarcie – od razu). Bez sieci / po limicie –
// szablon bez AI.
const reply = { claims: [], src: null, key: "", tone: "plain" };
// Trwające pisanie odpowiedzi: `${werdykty}|${ton}` → zadanie. Zmiana zakładki ani zamknięcie okienka go NIE przerywa –
// gotowy tekst trafia do pamięci werdyktu i czeka (każdy ton pisze się najwyżej raz).
const replyJobs = new Map();
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const isXSite = (src) => /(^|\.)(x|twitter)\.com$/.test(hostOf(src?.url || src?.meta?.url || ""));
function replyCache() {
  if (reply.claims.length === 1) return (reply.claims[0].replies ??= {});
  if (!reply.src) return {};
  reply.src.replies ??= {};
  return (reply.src.replies[reply.key] ??= {});
}
function replyPost(src, claims) {
  const audio = src?.kind === "tab" || src?.kind === "mic";
  let text = audio ? claims.map((c) => c.quote).filter(Boolean).join(" … ") : src?.text || "";
  if (!text && src?.imageNotes?.length) text = src.imageNotes.map((n) => n.text || n.topic).filter(Boolean).join("\n");
  if (S.maskPeople) text = maskHandles(text);
  const speaker = S.maskPeople ? "" : [...new Set(claims.map((c) => c.speaker).filter(Boolean))].join(", ");
  return { kind: src?.kind || "manual", site: src?.meta?.site || hostOf(src?.url), text, speaker };
}
// Język dopisków („Źródła:”, notka o AI) = język posta; bez tekstu – język interfejsu.
function replyLang(post) {
  const s = `${post.text || ""}`;
  if (/[ąćęłńóśźż]/i.test(s)) return "pl";
  return s.trim().length > 40 ? "en" : getLang();
}
function openReply(claims, src) {
  if (!claims.length) return;
  Object.assign(reply, { claims, src, key: claims.map((c) => c.id).join(",") });
  const pref = REPLY_TABS.includes(S.replyTone) ? S.replyTone : "plain";
  $("rpFor").textContent = claims.length > 1
    ? t("rp.forAll", { n: claims.length, title: sourceTitle(src || {}) })
    : t("rp.forOne", { claim: claims[0].claim });
  $("rpCopy").textContent = t("rp.copy");
  $("replyDlg").showModal();
  showTone(isXSite(src) && pref !== "orig" ? "x" : pref);
}
// Zakładki: rzeczowo / na luzie / krótko pod X (pisze model) i oryginał (tekst werdyktu bez przeróbek).
function showTone(tone, { regen = false } = {}) {
  reply.tone = tone;
  document.querySelector(`input[name=tone][value=${tone}]`).checked = true;
  $("rpRegen").textContent = t(tone === "orig" ? "rp.restore" : "rp.regen");
  renderToneTabs();
  if (tone === "orig") {
    if (regen) delete replyCache().orig; // „Przywróć oryginał”
    replyBusy(false);
    setReplyText(replyCache().orig?.text ?? originalReply(reply.claims), "", t("rp.origNote"));
    return;
  }
  const running = replyJobs.has(`${reply.key}|${tone}`);
  if (running) { replyBusy(true); return; } // już się pisze – tekst pojawi się sam
  const cached = !regen && replyCache()[tone];
  if (cached) { replyBusy(false); setReplyText(cached.text, cached.note); return; }
  generateReply(tone);
}
function renderToneTabs() {
  const store = replyCache();
  document.querySelectorAll("input[name=tone]").forEach((r) => {
    const label = r.closest("label");
    label.classList.toggle("pending", replyJobs.has(`${reply.key}|${r.value}`));
    label.classList.toggle("ready", r.value !== "orig" && !!store[r.value]);
  });
}
async function generateReply(tone) {
  const { key, claims, src } = reply;
  const store = replyCache(); // wynik trafi tutaj, nawet jeśli w międzyczasie otworzysz inny werdykt
  const id = `${key}|${tone}`;
  replyJobs.set(id, true);
  if (reply.tone === tone) replyBusy(true);
  renderToneTabs();
  const post = replyPost(src, claims);
  let text = "", note = "";
  try {
    if (limitReached()) throw Object.assign(new Error(t("rp.limit")), { code: "limit" });
    await ensureModel();
    let structured = PROVIDERS[S.provider]?.structured !== false && !state.disabled.has("structured");
    let res, sources;
    for (let attempt = 0; ; attempt++) {
      const built = buildReplyRequest({ model: S.model, claims, post, tone, lang: getLang(), structured, summary: claims.length > 1 ? validSummary(src, claims) : null });
      sources = built.sources;
      try {
        res = await callModel({ provider: S.provider, key: await getToken(), body: built.body, timeoutMs: 90_000, idleMs: 45_000 });
        break;
      } catch (e) {
        if (structured && unsupportedFeature(e) === "structured" && attempt < 1) { structured = false; continue; }
        throw e;
      }
    }
    recordUsage(res.usage).catch((e) => console.warn(e));
    const parsed = parseReply(res.text, sources);
    if (!parsed.text) throw new Error(t("rp.empty"));
    text = composeReply({ ...parsed, tone, lang: replyLang(post) });
  } catch (e) {
    console.warn(e);
    text = templateReply(claims, { tone, lang: getLang() });
    note = t("rp.fallback", { msg: e.message });
  } finally {
    replyJobs.delete(id);
  }
  store[tone] = { text, note };
  touchSession();
  if (!$("replyDlg").open || reply.key !== key) return;
  renderToneTabs();
  if (reply.tone === tone) { replyBusy(false); setReplyText(text, note); }
}
function replyCacheFor(tone, val) {
  replyCache()[tone] = val;
  touchSession();
}
function replyBusy(on) {
  $("rpBusy").hidden = !on;
  $("rpText").disabled = on;
  $("rpCopy").disabled = on;
  $("rpRegen").disabled = on;
  if (on) { $("rpText").value = ""; $("rpCount").textContent = ""; }
}
function setReplyText(text, note = "", info = "") {
  $("rpText").value = text;
  $("rpNote").textContent = note || info || t("rp.note");
  $("rpNote").classList.toggle("warn", !!note);
  replyCount();
}
function replyCount() {
  const v = $("rpText").value;
  const el = $("rpCount");
  if (reply.tone === "x") {
    const n = xLength(v);
    el.textContent = t("rp.countX", { n, max: X_LIMIT });
    el.classList.toggle("over", n > X_LIMIT);
  } else {
    el.textContent = t("rp.count", { n: [...v].length });
    el.classList.remove("over");
  }
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

// ---------- raport i eksport ocen ----------
async function openReport(id) {
  if (!id) {
    if (!hasContent(stateContent())) return;
    touchSession();
    id = session.id;
  }
  await saveSessionNow();
  chrome.tabs.create({ url: chrome.runtime.getURL(`report.html#${encodeURIComponent(id)}`) });
}
const extVersion = () => chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version;
async function exportRatings() {
  await saveSessionNow();
  const items = ratedClaims(await listSessions());
  if (!items.length) { $("ratingsInfo").textContent = t("fb.none"); return; }
  const payload = { exported_at: new Date().toISOString(), extension_version: extVersion(), ui_lang: getLang(), count: items.length, items };
  await downloadFile(JSON.stringify(payload, null, 2), `fact-checker-oceny-${localDay()}.json`);
  $("ratingsInfo").textContent = t("fb.exported", { n: items.length });
}

// ---------- sprawdzanie ----------
// ---------- wywołanie modelu (wspólne dla rozmowy i tekstu ze strony) ----------
async function ensureModel() {
  if (S.model) return;
  const models = await loadModels();
  S.model = models[0].id; // polecany model dostawcy jest pierwszy na liście
  S.models[S.provider] = S.model;
  await saveSettings();
}
// Czy bieżący model przyjmuje obrazki (OpenRouter: zależy od modelu – z listy modeli).
function modelTakesImages() {
  if (S.provider !== "openrouter") return PROVIDERS[S.provider]?.images !== false;
  const m = (modelCache.openrouter || []).find((x) => x.id === S.model);
  return m ? m.images : true; // nieznany – spróbujemy, w razie odmowy wtyczka ponowi bez obrazków
}
// Zapytanie z automatycznym wyłączeniem funkcji, których konto/model nie obsługuje (wyszukiwanie, format JSON).
async function askModel(makeBody, { onEvent } = {}) {
  let attempt = 0;
  for (;;) {
    const webSearch = S.webSearch && !state.disabled.has("webSearch");
    // dostawcy inni niż OpenAI: format JSON wymuszamy instrukcją (schemat w poleceniu), nie parametrem API
    const structured = !state.disabled.has("structured") && PROVIDERS[S.provider]?.structured !== false;
    const body = makeBody({ webSearch, structured, images: !state.disabled.has("images") && modelTakesImages() });
    try {
      const res = await callModel({ provider: S.provider, key: await getToken(), body, signal: state.abort.signal, onEvent });
      recordUsage(res.usage).catch((e) => console.warn(e));
      return res;
    } catch (e) {
      const feat = unsupportedFeature(e);
      if (feat && !state.disabled.has(feat) && attempt++ < 2) {
        state.disabled.add(feat);
        if (feat === "webSearch") banner(esc(t(e.code === "search_quota" ? "err.searchQuota" : "err.noSearch")));
        if (feat === "images") banner(esc(t("img.unsupported")), "error");
        continue;
      }
      throw e;
    }
  }
}
// Duplikaty odrzucamy w obrębie jednego źródła (ten sam fakt w dwóch artykułach dostaje dwa werdykty).
function claimsFrom(result, srcId) {
  const claims = parseResult(result.text);
  if (claims.length === 1 && !claims[0].sources.length) claims[0].sources = result.citations.slice(0, 5);
  const seen = state.claims.filter((c) => c.srcId === srcId).map((c) => c.claim);
  return claims.filter((c) => !isDuplicate(c.claim, seen))
    .map((c) => ({ ...c, id: newClaimId(), srcId, provider: S.provider, model: S.model, mode: S.mode }));
}

async function runCheck({ force = false, manualText = null, manual = false } = {}) {
  if (state.busy) return;
  // Ręczne „Sprawdź teraz” omija przerwę po chwilowym błędzie serwera; automat czeka.
  if (Date.now() < state.pausedUntil && !manual && !manualText) return;
  const fresh = manualText ? null : state.segments.filter((s) => !s.checked);
  const freshText = manualText ?? joinSegs(fresh);
  if (!freshText.trim() || (!force && freshText.length < MIN_CHARS)) {
    if (manual) setStatus(t("status.nothingNew"));
    return;
  }
  if (limitReached()) { showLimitBanner(); return; } // tekst czeka – sprawdzi się po „Kontynuuj”
  if (manual) state.pausedUntil = 0;
  state.busy = true; // od razu – żeby kolejka nie uruchomiła w tym czasie drugiego sprawdzania
  try { await ensureModel(); } catch (e) { state.busy = false; runQueued(); return handleError(e); }

  let srcId = fresh?.[0]?.srcId ?? state.audioSrcId;
  if (manualText) {
    await ensureSession();
    srcId = addSource({ kind: "manual", title: captureTitle({ kind: "manual" }, manualText), text: manualText }).id;
  }
  const context = manualText ? "" : joinSegs(state.segments.filter((s) => s.checked && s.srcId === srcId)).slice(-CONTEXT_CHARS);
  const audioSrc = findSource(srcId);
  fresh?.forEach((s) => (s.checked = true));
  state.busy = true;
  state.busySince = Date.now();
  state.abort = new AbortController();
  setStatus(t("status.checking"), "busy");
  actStart(srcId);
  let added = 0;

  try {
    const result = await askModel(({ webSearch, structured }) => buildRequest({
      model: S.model,
      today: new Date().toISOString().slice(0, 10),
      webSearch,
      structured,
      context,
      fresh: freshText,
      checked: state.claims.filter((c) => c.srcId === srcId).slice(-25).map((c) => c.claim),
      outLang: getLang(),
      recorded: srcDate(audioSrc),
      live: !!audioSrc?.live,
      mode: S.mode,
      maxClaims: modeOf(S.mode).audioClaims,
      maxSearches: modeOf(S.mode).searches,
      tricks: trickMax(true),
    }), { onEvent: actEvent });
    const claims = claimsFrom(result, srcId);
    if (trickMax(true) && audioSrc) {
      audioSrc.tricksChecked = true;
      addTricks(audioSrc, parseTricks(result.text, { max: trickMax(true), seen: audioSrc.tricks || [] }));
    }
    added = claims.length;
    for (const c of claims) {
      c.t = Date.now();
      state.claims.push(c);
      addCard(c);
    }
    enrichFactChecks(claims);
    renderSummary();
    if (!state.disabled.has("webSearch") && $("banner").classList.contains("error")) banner(null);
    setStatus(claims.length ? t("status.new", { n: claims.length, total: state.claims.length }) : t("status.none"));
  } catch (e) {
    fresh?.forEach((s) => (s.checked = false)); // spróbujemy przy następnej okazji
    handleError(e);
    if (manualText) dropEmptySource(srcId);
  } finally {
    state.busy = false;
    state.abort = null;
    actStop(added);
    renderTranscript();
    saveSessionNow();
    if (state.rerun) { state.rerun = false; setTimeout(() => runCheck({ force: true, manual: true }), 0); }
    else runQueued();
    if (!state.running) $("liveDot").className = "dot";
  }
}

function handleError(e) {
  const code = e.code || "";
  if (code !== "cancelled") console.error(e);
  if (code === "cancelled") {
    if (!state.rerun) setStatus(t("act.cancelled"));
    return; // przerwane przyciskiem (Przerwij / „Sprawdź teraz”)
  } else if (code === "timeout" || code === "stalled") {
    banner(esc(t("err.timeout")));
    setStatus(t("status.timeout"), "");
    return;
  } else if (code === "NEED_LOGIN" || code === "NEED_KEY") {
    banner(esc(e.message) + openSettingsLink(), "error");
  } else if (code === "subscription_sharing_usage_limit_exceeded") {
    state.pausedUntil = Date.now() + 10 * 60_000;
    banner(`${esc(t("err.limit"))} <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener">${t("err.limitLink")}</a>`, "error");
  } else if (["subscription_sharing_usage_unavailable", "subscription_sharing_user_unavailable"].includes(code) || e.status >= 500) {
    state.pausedUntil = Date.now() + 60_000;
    banner(esc(t("err.unavailable")));
  } else if (KEY_PROVIDERS.includes(S.provider) && (e.status === 401 || e.status === 403)) {
    banner(esc(t("err.badKey", { name: providerName(S.provider) })) + openSettingsLink("err.settings"), "error");
  } else if (e.status === 402) {
    banner(esc(t("err.noCredits", { name: providerName(S.provider) })) + openSettingsLink("err.settings"), "error");
  } else if (e.status === 429) {
    state.pausedUntil = Date.now() + 60_000;
    banner(esc(t("err.rateLimit", { name: providerName(S.provider) })));
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
  const why = await sttProblem();
  if (why) { await openSttSetup(why); return; }
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
  let tabInfo = null;
  state.txFrom = Date.now(); // nowe nagranie = czyste okno transkrypcji (stary tekst zostaje w sesji)
  state.showAllTx = false;
  try {
    if (S.engine === "local" || IS_OPERA && S.engine === "chrome") {
      const have = await getDownloaded();
      const m = getModel(S.localModel);
      state.transcriber = new LocalTranscriber({
        ...common, modelId: m.id, device: have[m.id].device || DEVICE, chunkSec: S.chunkSec,
        language: m.multilingual ? S.language : m.lang, // model tylko angielski = rozmowa po angielsku
        onLatency: ({ audioSec, ms, backlog }) => {
          if (backlog >= 3) banner(esc(t("err.slow", { ms: (ms / 1000).toFixed(1), sec: audioSec.toFixed(0) })));
        },
      });
      if (S.src === "tab") {
        const tab = await targetTab();
        if (!tab) throw new Error(t("err.noActiveTab"));
        tabInfo = tab;
        await state.transcriber.start({ tabId: tab.id });
      } else {
        await state.transcriber.start();
      }
    } else if (S.src === "tab" && S.engine === "openai") {
      if (!S.apiKey) {
        banner(`${esc(t("err.needKeyTab"))}${openSettingsLink("err.addKey")} ${esc(t("err.orMic"))}`, "error");
        return;
      }
      const tab = await targetTab();
      if (!tab) throw new Error(t("err.noActiveTab"));
      tabInfo = tab;
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
  // Źródło w bieżącej sesji: to samo nagranie (ta sama strona) = to samo źródło, inaczej nowe.
  await ensureSession();
  const kind = tabInfo ? "tab" : "mic";
  const last = session.sources.at(-1);
  const same = last && last.kind === kind && (kind === "mic" || sameUrl(last.url, tabInfo.url));
  const src = same ? last : addSource({ kind, title: kind === "tab" ? cleanTitle(tabInfo.title) : "", url: tabInfo?.url || "", tabId: tabInfo?.id ?? null, ...(kind === "mic" ? { live: true } : {}) });
  state.audioSrcId = src.id;
  state.speaker = "";
  if (kind === "tab" && !src.date && !src.live) detectMediaDate(src);
  state.segments.forEach((x) => (x.srcId ??= src.id));
  state.running = true;
  state.timerStart = Date.now();
  lockSource(true);
  renderTranscript();
  const g = groupEl(src.id);
  toTop(g);
  renderGroupNote(g);
  setBadge("listening");
  renderActivity();
  renderSpeakerBar();
  $("lastSession").hidden = true;
  $("toggle").textContent = t("btn.stop");
  $("toggle").classList.add("stop");
  $("liveDot").className = "dot live";
  state.timer = setInterval(() => runCheck(), S.intervalSec * 1000);
}

async function stop() {
  state.running = false;
  lockSource(false);
  renderSpeakerBar();
  clearInterval(state.timer);
  state.transcriber?.stop();
  state.transcriber = null;
  $("interim").textContent = "";
  $("toggle").textContent = t("btn.start");
  $("toggle").classList.remove("stop");
  $("liveDot").className = "dot";
  if (!activity.on) setBadge("");
  renderActivity();
  const g = state.audioSrcId && groupEl(state.audioSrcId, { create: false });
  if (g) renderGroupNote(g);
  // Dokończ to, co zostało (po zakończeniu trwającego sprawdzania), potem zapisz sesję.
  for (let i = 0; state.busy && i < 600; i++) await new Promise((r) => setTimeout(r, 500));
  if (state.running) return; // ktoś w międzyczasie kliknął Start
  await runCheck({ force: true });
  await saveSessionNow();
  if (S.autoExport && session.id && hasContent(stateContent())) downloadMarkdown(snapshot()).catch((e) => console.error(e));
}

// ---------- tekst ze strony (artykuł, post, zaznaczenie) ----------
// Tekst trafia tu tylko po wskazaniu przez użytkownika: przyciski w panelu, menu pod prawym przyciskiem
// albo skrót klawiszowy (te dwa ostatnie idą przez tło i chrome.storage.session).

async function pageAction(kind) {
  banner(null);
  const tab = await targetTab();
  if (!tab) { banner(esc(t("err.noActiveTab")), "error"); return; }
  try {
    if (kind === "area") {
      await runInTab(tab.id, "area", { hint: t("page.areaBar"), cancel: t("page.pickCancel") });
      setStatus(t("page.areaPicking"), "busy");
      return;
    }
    if (kind === "pick") {
      await runInTab(tab.id, "pick", { hint: t("page.pickBar"), cancel: t("page.pickCancel"), empty: t("page.pickEmpty"), added: t("page.pickAdded", { n: "{n}" }) });
      setStatus(t("page.picking"), "busy"); // wynik przyjdzie przez tło (pending-capture)
      return;
    }
    setStatus(t("page.reading"), "busy");
    const res = await runInTab(tab.id, kind, {}, { readability: kind === "article" });
    setStatus(t("app.ready"));
    if (!res) { banner(esc(t(kind === "selection" ? "page.noSelection" : "page.noText"))); return; }
    handleCapture({ ...res, tabId: tab.id, frameId: 0 });
  } catch (e) {
    setStatus(t("app.ready"));
    showAccessError(e, () => pageAction(kind));
  }
}

function showAccessError(e, retry) {
  if (!(e instanceof PageAccessError)) { handleError(e); return; }
  if (e.code === "restricted") { banner(esc(t("page.restricted")), "error"); return; }
  if (e.code === "noArticle") { banner(esc(t("page.noArticle"))); return; }
  if (e.code === "noAccess") {
    const pattern = /^https?:/.test(e.url) ? `${e.origin}/*` : null;
    banner(esc(t("page.noAccess", { host: e.host || e.url })) + (pattern ? ` <a href="#" data-grant>${esc(t("page.grant", { host: e.host }))}</a>` : ""), "error");
    $("banner").querySelector("[data-grant]")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const ok = await chrome.permissions.request({ origins: [pattern] }).catch(() => false);
      if (ok) { banner(null); retry?.(); }
    });
    return;
  }
  banner(esc(t("page.failed", { msg: e.cause?.message || e.message })), "error");
}

// Zlecenia z tła (menu, skrót, „wskaż post”) czekają w chrome.storage.session, aż panel je odbierze.
// Zlecenia z tła (menu, skrót, „wskaż post”) – tło trzyma listę i oddaje ją w całości (bez gubienia pozycji).
async function consumePending() {
  let list = [];
  try {
    list = (await chrome.runtime.sendMessage({ type: "take-captures" }))?.list || [];
  } catch (e) {
    console.error(e);
  }
  for (const p of list) {
    if (Date.now() - (p.at || 0) > 10 * 60_000) continue;
    if (p.tabId != null) invoked = { id: p.tabId, title: p.meta?.title || "" };
    handleCapture(p);
  }
}

// Każdy wskazany tekst przechodzi przez „przyjęcie” (po kolei – także okno podglądu), potem do kolejki.
let intake = Promise.resolve();
function handleCapture(p) {
  intake = intake.then(() => intakeOne(p)).catch((e) => console.error(e));
  return intake;
}
const captureKey = (p, text) => `${p.meta?.url || ""}|${text.replace(/\s+/g, " ").trim().slice(0, 400)}|${(p.images || []).map((im) => im.dataUrl.length + im.dataUrl.slice(-24)).join(",")}`;
async function intakeOne(p) {
  if (p.cancelled) { if (!state.busy) setStatus(t("page.cancelled")); return; }
  if (p.error) { if (!state.busy) setStatus(t("app.ready")); showAccessError(new PageAccessError(p.error, { url: p.url })); return; }
  if (p.imageError) showImageError(p);
  if (!p.text?.trim() && !p.images?.length) {
    if (!state.busy) setStatus(t("app.ready"));
    if (!p.imageError) banner(esc(t(p.imageCount ? "img.offscreen" : "page.noText")));
    return;
  }
  let text = (p.text || "").trim();
  let images = p.images || [];
  if (state.queue.some((q) => q.key === captureKey(p, text)) || state.currentKey === captureKey(p, text)) {
    setStatus(t("queue.dup"));
    pageToast(p, `Fact Checker: ${t("queue.dup")}`);
    return;
  }
  // Pamięć werdyktów – PRZED podglądem: to, co już sprawdzone, nigdzie nie idzie, więc nie ma czego potwierdzać.
  //  1) ten sam tekst i te same obrazki → cały wynik z pamięci;
  //  2) same obrazki (bez tekstu), każdy rozpoznany osobno – np. obrazek kliknięty po wcześniejszym sprawdzeniu posta;
  //  3) obrazki znane, tekst nowy → wynik obrazków z pamięci, do modelu idzie tylko tekst.
  let memKey = null, knownImages = null;
  if (S.memoryDays > 0 && p.kind !== "manual") {
    memKey = await contentKey({ text: text.slice(0, MAX_TEXT), images }).catch(() => null);
    if (memKey && !p.noMemory) {
      const opts = { lang: getLang(), maxAgeDays: S.memoryDays };
      const hit = await findInMemory(memKey, opts).catch(() => null);
      if (hit) { await applyMemory({ ...p, text, images, memKey }, hit); return; }
      if (images.length) {
        const found = await findImages(memKey.images, opts).catch(() => []);
        if (found.length === images.length && found.every(Boolean)) {
          if (!text) { await applyMemory({ ...p, text, images, memKey }, imagesHit(found)); return; }
          knownImages = found;
        }
      }
    }
  }
  // Podgląd: przy obrazkach zawsze (miniatury), przy tekście – gdy jest długi albo skrócony.
  if (p.kind !== "manual" && !p.skipPreview && (images.length || text.length > PREVIEW_CHARS || p.truncated)) {
    const ok = await showPreview(p, { knownImages });
    if (!ok) return;
    const changed = ok.text !== text || ok.kept.length !== images.length;
    ({ text, images } = ok);
    if (!text && !images.length) return;
    if (knownImages) knownImages = ok.kept.map((i) => knownImages[i]);
    if (changed && memKey) memKey = await contentKey({ text: text.slice(0, MAX_TEXT), images }).catch(() => null);
  }
  const item = { ...p, text, images, key: captureKey(p, text), qid: ++qSeq, memKey, knownImages: images.length && knownImages?.length === images.length ? knownImages : null };
  state.queue.push(item);
  renderQueue();
  if (state.busy || state.queue.length > 1) {
    const pos = state.queue.length;
    setStatus(t("queue.added", { n: pos }));
    pageToast(item, t("page.toastQueued", { n: pos }));
    renderActivity();
  }
  pump();
}
function pageToast(p, text) {
  if (p.tabId == null || p.kind === "manual") return;
  runInTab(p.tabId, "toast", { text }, { frameId: p.frameId || 0 }).catch(() => {});
}

function showPreview(p, { knownImages = null } = {}) {
  return new Promise((resolve) => {
    const d = $("preview");
    const meta = p.meta || {};
    const when = meta.date ? (Number.isNaN(Date.parse(meta.date)) ? meta.date : fmtDate(Date.parse(meta.date))) : "";
    $("pvSource").innerHTML = `<strong>${esc(meta.title || meta.url || "")}</strong>${esc([t(`kind.${p.kind || "fragment"}`), meta.site, meta.author, when].filter(Boolean).join(" · "))}`;
    $("pvText").value = (p.text || "").trim();
    $("pvText").placeholder = p.images?.length ? t("pv.noText") : "";
    // miniatury: ✕ wyklucza obrazek z wysyłki
    const keep = new Set((p.images || []).map((_, i) => i));
    const box = $("pvImages");
    box.hidden = !p.images?.length;
    box.replaceChildren(...(p.images || []).map((im, i) => {
      const fig = document.createElement("figure");
      const img = Object.assign(document.createElement("img"), { src: im.thumb, alt: t("img.n", { n: i + 1 }) });
      const x = Object.assign(document.createElement("button"), { type: "button", className: "pv-x", textContent: "✕", title: t("pv.dropImage") });
      x.onclick = () => { if (keep.has(i)) keep.delete(i); else keep.add(i); fig.classList.toggle("dropped", !keep.has(i)); update(); };
      fig.append(img, Object.assign(document.createElement("figcaption"), { textContent: `🖼 ${i + 1} · ${im.w}×${im.h}` }), x);
      return fig;
    }));
    const update = () => {
      const v = $("pvText").value;
      const warn = [];
      if (p.truncated) warn.push(t("pv.truncated"));
      if (p.imagesOffscreen) warn.push(t("pv.offscreen", { n: p.imagesOffscreen }));
      if (knownImages) warn.push(t("mem.pvImages", { date: fmtDate(Math.max(...knownImages.map((m) => m.at))) }));
      if (v.length > MAX_TEXT) warn.push(t("pv.tooLong", { max: MAX_TEXT.toLocaleString(locale()) }));
      $("pvWarn").textContent = warn.join(" ");
      $("pvWarn").hidden = !warn.length;
      $("pvCount").textContent = t("pv.count", {
        chars: v.length.toLocaleString(locale()),
        words: wordCount([{ text: v }]).toLocaleString(locale()),
        parts: Math.max(1, chunkText(v.slice(0, MAX_TEXT), CHUNK_CHARS).length),
      }) + (p.images?.length ? ` · ${t("pv.images", { n: keep.size })}` : "");
    };
    $("pvText").oninput = update;
    update();
    d.returnValue = "";
    d.onclose = () => {
      d.onclose = null;
      const kept = (p.images || []).map((_, i) => i).filter((i) => keep.has(i));
      resolve(d.returnValue === "ok" ? { text: $("pvText").value.trim(), images: kept.map((i) => p.images[i]), kept } : null);
    };
    d.showModal();
  });
}

// Pola źródła dla tekstu/obrazka ze strony (wspólne dla sprawdzania i wyniku z pamięci).
function sourceFields(p, text) {
  return {
    kind: p.kind || "fragment",
    title: captureTitle(p, text),
    url: p.meta?.url || p.meta?.pageUrl || "",
    pageUrl: p.meta?.pageUrl || "",
    meta: p.meta || {},
    tabId: p.tabId ?? null,
    frameId: p.frameId || 0,
    captureId: p.captureId || null,
    text,
    // miniatury (bez pełnych zrzutów – te idą tylko do modelu); el = nr obrazka na stronie (ramki)
    images: (p.images || []).map(({ thumb, w, h, src, el }) => ({ thumb, w, h, src, el })),
    imageNotes: [],
    date: normDate(p.meta?.date),
    ...(p.masked ? { masked: p.masked } : {}),
  };
}

async function checkPage(p) {
  if (limitReached()) { state.queue.unshift(p); renderQueue(); showLimitBanner(); return; }
  state.busy = true; // od razu – kolejka czeka
  state.currentKey = p.key || null;
  await ensureSession();
  const text = p.text.slice(0, MAX_TEXT);
  const src = addSource(sourceFields(p, text));
  // Obrazki rozpoznane w pamięci (tekst nowy): ich wynik od razu, do modelu idzie tylko tekst.
  const known = p.knownImages;
  if (known) {
    src.imageNotes = known.map((m, i) => (m.note ? { ...m.note, index: i + 1 } : null)).filter(Boolean);
    src.imagesFromMemory = { at: Math.max(...known.map((m) => m.at)), model: known.find((m) => m.model)?.model || "" };
    recheck.set(src.id, p);
    const now = Date.now();
    for (const [i, m] of known.entries()) {
      for (const c of m.claims) {
        const cc = { ...c, image: i + 1, id: newClaimId(), srcId: src.id, t: now, fromMemory: m.at };
        state.claims.push(cc);
        addCard(cc);
      }
    }
  }
  $("lastSession").hidden = true;
  if (!p.imageError) banner(null); // ostrzeżenie o nieudanym zrzucie obrazków zostaje widoczne

  await loadCert(); // kopia listy od razu (nawet starsza); pobieranie / odświeżanie w tle
  computeScam(src);
  { const g = groupEl(src.id, { create: false }); if (g) renderGroupHead(g); }
  const chunks = chunkText(text, CHUNK_CHARS);
  if (!chunks.length) chunks.push(""); // sam obrazek
  state.busy = true;
  state.busySince = Date.now();
  state.abort = new AbortController();
  actStart(src.id);
  pageBusy(src, { on: true, captureId: src.captureId, label: `${t("page.toastChecking")} ${stageLabel()}` });
  let n = 0, done = "";
  try {
    await ensureModel();
    for (let i = 0; i < chunks.length; i++) {
      actPart(i + 1, chunks.length);
      setStatus(chunks.length > 1 ? t("status.checkingPart", { i: i + 1, n: chunks.length }) : t("status.checking"), "busy");
      state.busySince = Date.now();
      const imgs = i === 0 && !known ? p.images || [] : []; // obrazki tylko w pierwszej części (i tylko nieznane)
      const result = await askModel(({ webSearch, structured, images: withImages }) => buildTextRequest({
        model: S.model,
        today: new Date().toISOString().slice(0, 10),
        webSearch,
        structured,
        outLang: getLang(),
        kind: src.kind,
        meta: { ...requestMeta(src), ...(known ? { knownImages: src.imageNotes.map((x) => x.topic || x.text).filter(Boolean) } : {}), ...(src.scam ? { scam: scamHint(src.scam) } : {}) },
        text: S.maskPeople ? maskHandles(chunks[i]) : chunks[i],
        part: i + 1,
        parts: chunks.length,
        checked: state.claims.filter((c) => c.srcId === src.id).map((c) => c.claim),
        images: withImages ? imgs : [],
        mode: S.mode,
        maxClaims: modeOf(S.mode).textClaims,
        maxSearches: modeOf(S.mode).searches,
        tricks: trickMax(false),
      }), { onEvent: actEvent });
      if (trickMax(false)) {
        src.tricksChecked = true; // „brak chwytów” to też wynik – panel to pokazuje
        addTricks(src, parseTricks(result.text, { max: trickMax(false), seen: src.tricks || [] }));
      }
      if (imgs.length) {
        src.imageNotes = parseImageNotes(result.text);
        // obrazek bez tekstu: tytuł źródła = o czym jest obrazek (zamiast „Obrazek – Facebook”)
        if (!src.text && (src.imageNotes[0]?.topic || src.imageNotes[0]?.text)) src.title = imageTitle(src.imageNotes[0]);
        computeScam(src); // tekst odczytany z obrazka (np. reklama „inwestycji” na grafice)
        const g = groupEl(src.id, { create: false });
        if (g) renderGroupHead(g);
        touchSession();
      }
      const fresh = claimsFrom(result, src.id);
      for (const c of fresh) {
        c.t = Date.now();
        if (known) c.image = 0; // obrazków nie wysyłaliśmy – twierdzenie pochodzi z tekstu
        state.claims.push(c);
        addCard(c);
        n++;
      }
      enrichFactChecks(fresh);
      renderSummary();
      touchSession();
    }
    remember(p, src);
    maybeSummarize(src);
    if (!n) {
      setStatus(t("status.none"));
      done = t("page.toastNone");
      if (src.images?.length) touchSession(); // analiza obrazka zostaje, nawet bez twierdzeń
      return;
    }
    const m = await highlightSource(src);
    setStatus(m == null ? t("page.doneNoHl", { n }) : t("page.done", { n, m }));
    done = t("page.toastDone", { n });
  } catch (e) {
    handleError(e);
    if (!n && !src.imageNotes?.length) dropEmptySource(src.id);
  } finally {
    state.busy = false;
    state.currentKey = null;
    state.abort = null;
    state.rerun = false;
    actStop(n);
    pageBusy(src, { on: false, done });
    saveSessionNow(); // od razu – panel może zaraz zostać zamknięty
    if (!state.running) $("liveDot").className = "dot";
    runQueued();
  }
}

// Karta ze sprawdzaną stroną: ta, z której pochodzi tekst (także po zmianie adresu w obrębie serwisu, np. X),
// a gdy jej nie ma – inna karta z tym samym adresem.
async function pageTab(src) {
  if (!src) return null;
  const want = src.pageUrl || src.url;
  const origin = (u) => { try { return new URL(u).origin; } catch { return ""; } };
  if (src.tabId != null) {
    const tab = await chrome.tabs.get(src.tabId).catch(() => null);
    if (tab && (!want || sameUrl(tab.url, want) || origin(tab.url) === origin(want))) return tab;
  }
  if (!want) return null;
  return (await chrome.tabs.query({})).find((x) => sameUrl(x.url, want)) || null;
}
// Wszystkie werdykty z tekstów sprawdzonych w tej karcie (np. artykuł i zaznaczenie z tej samej strony).
function itemsForTab(tab, frameId = 0) {
  const list = [];
  for (const c of state.claims) {
    const src = findSource(c.srcId);
    const visual = c.image > 0 || src?.kind === "area";
    if (!src || !isPageKind(src.kind) || (!c.quote && !visual) || (src.frameId || 0) !== frameId) continue;
    if (src.tabId !== tab.id && !sameUrl(src.pageUrl || src.url, tab.url)) continue;
    list.push({ c, item: {
      quote: c.quote, tone: VERDICTS[c.verdict]?.tone || "muted", label: verdictLabel(c.verdict), claim: c.claim, expl: c.explanation, claimLabel: t("card.claimLabel"),
      captureId: src.tabId === tab.id ? src.captureId : null,
      image: c.image > 0 ? src.images?.[c.image - 1]?.el || 0 : 0,
      area: src.kind === "area",
    } });
  }
  // chwyty erystyczne: osobny kolor, w dymku nazwa, „dlaczego” i definicja
  const lang = getLang();
  for (const src of session.sources) {
    if (!isPageKind(src.kind) || (src.frameId || 0) !== frameId) continue;
    if (src.tabId !== tab.id && !sameUrl(src.pageUrl || src.url, tab.url)) continue;
    for (const x of src.tricks || []) {
      if (!x.quote || !TRICKS[x.trick]) continue;
      list.push({ c: x, item: {
        quote: x.quote, tone: "trick", label: `${t("trick.label")}: ${trickName(x.trick, lang)}`, claim: x.why, expl: TRICKS[x.trick].def[lang] || TRICKS[x.trick].def.en,
        claimLabel: t("trick.whyLabel"), captureId: src.tabId === tab.id ? src.captureId : null, image: 0, area: false,
      } });
    }
  }
  return list;
}
async function highlightTab(tab, frameId = 0) {
  const list = itemsForTab(tab, frameId);
  if (!list.length) return { list, found: [] };
  const found = (await runInTab(tab.id, "highlight", { items: list.map((x) => x.item) }, { frameId, css: true })) || [];
  list.forEach((x, i) => (x.c.inPage = !!found[i]));
  return { list, found };
}
// Podświetla werdykty na stronie; zwraca liczbę znalezionych zdań tego źródła albo null (brak strony / dostępu).
async function highlightSource(src) {
  const tab = await pageTab(src);
  if (!tab) return null;
  try {
    const { list, found } = await highlightTab(tab, src.frameId || 0);
    renderFeed();
    touchSession();
    return list.filter((x, i) => x.c.srcId === src.id && found[i] && !x.c.trick).length;
  } catch (e) {
    console.warn(e);
    return null;
  }
}
async function showInPage(c) {
  const src = findSource(c.srcId);
  const tab = await pageTab(src);
  if (!tab) { setStatus(t("page.tabGone")); return; }
  try {
    const { list, found } = await highlightTab(tab, src.frameId || 0);
    await chrome.tabs.update(tab.id, { active: true });
    const i = list.findIndex((x) => x.c === c);
    const ok = i >= 0 && found[i] && (await runInTab(tab.id, "scrollTo", { index: i }, { frameId: src.frameId || 0 }));
    setStatus(ok ? sourceTitle(src) : t("page.notFound"));
  } catch (e) {
    showAccessError(e, () => showInPage(c));
  }
}

// ---------- eksport ----------
function exportMarkdown() {
  if (!hasContent(stateContent())) return;
  if (!session.id) touchSession();
  downloadMarkdown(snapshot()).catch((e) => banner(esc(t("err.generic", { msg: e.message })), "error"));
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
  const provider = formProvider();
  rememberKeyInput(provider);
  const prev = { apiKey: S.apiKey, keys: S.keys };
  // pozwól sprawdzić klucz przed zapisem
  S.apiKey = draft.keys.openai || "";
  S.keys = { ...S.keys, ...Object.fromEntries(KEY_PROVIDERS.map((k) => [k, draft.keys[k] || ""])) };
  if (!quiet) keyStatus(t("set.checking"), true);
  try {
    const models = await loadModels(provider);
    if (formProvider() !== provider) return; // w międzyczasie wybrano innego dostawcę
    const want = draft.models[provider];
    setModelOptions(models, models.some((m) => m.id === want) ? want : models[0].id);
    if (provider !== "chatgpt") keyStatus(t("set.keyOk", { n: models.length }), true);
  } catch (e) {
    if (formProvider() !== provider) return;
    if (!quiet || (provider !== "chatgpt" && draftKey(provider))) keyStatus(e.code === "NEED_KEY" ? e.message : t("set.keyBad", { msg: e.message }));
  } finally {
    Object.assign(S, prev);
  }
}
function alertInDialog(msg) {
  keyStatus(msg);
}

// ---------- zdarzenia ----------
$("toggle").addEventListener("click", () => (state.running ? stop() : start()));
$("certRefresh").addEventListener("click", async () => {
  $("certInfo").textContent = t("set.certLoading");
  const prev = S.certList;
  S.certList = true; // odśwież także wtedy, gdy pole jest właśnie zaznaczane
  await loadCert({ wait: true, force: true });
  S.certList = prev;
  renderCertInfo();
});
$("ssDownload").addEventListener("click", () => ssDownload().catch((e) => console.error(e)));
$("ssUseOpenai").addEventListener("click", async () => {
  if (!S.apiKey) { $("sttSetup").close(); await openSettings(); $("listenGroup").scrollIntoView({ block: "start" }); return; }
  S.engine = "openai";
  await saveSettings();
  $("sttSetup").close();
  start();
});
$("ssUseChrome").addEventListener("click", async () => {
  S.engine = "chrome";
  await saveSettings();
  $("sttSetup").close();
  start();
});
$("ssMore").addEventListener("click", async () => {
  $("sttSetup").close();
  await openSettings();
  $("listenGroup").scrollIntoView({ block: "start" });
});
$("openSettings").addEventListener("click", openSettings);
$("checkNow").addEventListener("click", () => {
  if (state.busy) {
    // Trwa sprawdzanie: po 20 s kliknięcie przerywa je i zaczyna od nowa (z całym niesprawdzonym tekstem).
    if (Date.now() - state.busySince > 20_000) { state.rerun = true; state.abort?.abort(); }
    else setStatus(t("status.stillChecking", { s: Math.round((Date.now() - state.busySince) / 1000) }), "busy");
    return;
  }
  runCheck({ force: true, manual: true });
});
$("manualCheck").addEventListener("click", () => {
  const text = $("manualText").value.trim();
  if (!text) return;
  $("manualText").value = "";
  handleCapture({ kind: "manual", text, meta: {} });
});
$("qClear").addEventListener("click", (e) => { e.preventDefault(); state.queue = []; renderQueue(); renderActivity(); });
$("exportMd").addEventListener("click", exportMarkdown);
$("clear").addEventListener("click", async () => {
  banner(null);
  const audio = state.running ? findSource(state.audioSrcId) : null;
  await newSession();
  if (audio) { // nagrywanie trwa dalej – już w nowej sesji
    const { id: _id, at: _at, ...rest } = audio;
    state.audioSrcId = addSource(rest).id;
    renderGroupNote(groupEl(state.audioSrcId));
  }
  setStatus(t("app.ready"));
});
$("actCancel").addEventListener("click", () => state.abort?.abort());
$("openReport").addEventListener("click", () => openReport());
document.querySelectorAll("input[name=tone]").forEach((r) => r.addEventListener("change", () => showTone(r.value)));
$("rpRegen").addEventListener("click", () => showTone(reply.tone, { regen: true }));
$("rpText").addEventListener("input", () => {
  replyCount();
  const cur = replyCache()[reply.tone];
  replyCacheFor(reply.tone, { text: $("rpText").value, note: cur?.note || "" }); // poprawki zostają
});
$("rpCopy").addEventListener("click", async () => {
  const ok = await copyText($("rpText").value);
  $("rpCopy").textContent = ok ? `✓ ${t("reply.copied")}` : t("reply.failed");
  if (!ok) return;
  if (reply.tone !== "x" && S.replyTone !== reply.tone) { S.replyTone = reply.tone; saveSettings(); }
  setStatus(t("rp.copied"));
  setTimeout(() => $("replyDlg").close(), 700);
});
$("replyDlg").addEventListener("close", () => replyBusy(false)); // trwające pisanie dokończy się w tle
$("exportRatings").addEventListener("click", () => exportRatings().catch((e) => banner(esc(t("err.generic", { msg: e.message })), "error")));
$("onlyProblems").addEventListener("click", async () => {
  S.onlyProblems = !S.onlyProblems;
  await saveSettings();
  renderFeed();
});
$("spkInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); setSpeaker($("spkInput").value); } });
$("spkInput").addEventListener("change", () => { if ($("spkInput").value.trim()) setSpeaker($("spkInput").value); });
// zamiana mowy: lista modeli tylko dla modelu lokalnego, model transkrypcji tylko dla OpenAI
document.querySelectorAll("input[name=engine]").forEach((r) => r.addEventListener("change", renderEngineBox));
// tryb pracy: od razu podpowiada odstęp między sprawdzeniami (można go zmienić niżej)
document.querySelectorAll("input[name=mode]").forEach((r) => r.addEventListener("change", () => { $("intervalSec").value = modeOf(r.value).interval; }));
for (const id of ["priceIn", "priceOut"]) $(id).addEventListener("input", () => renderCostSettings());
$("fcTest").addEventListener("click", async () => {
  const key = $("fcKey").value.trim();
  const el = $("fcStatus");
  el.hidden = false;
  el.classList.remove("ok");
  if (!key) { el.textContent = t("fc.needKey"); return; }
  el.textContent = t("set.checking");
  try {
    const items = await searchClaims({ key, query: getLang() === "pl" ? "szczepionki" : "vaccines" });
    el.textContent = t("fc.keyOk", { n: items.length });
    el.classList.add("ok");
  } catch (e) {
    el.textContent = t("set.keyBad", { msg: e.message });
  }
});
confirmButton($("memClear"), async () => { await clearMemory(); renderMemInfo(); });
confirmButton($("forgetKeys"), async () => {
  S.apiKey = "";
  S.keys = {};
  draft.keys = {};
  $("apiKey").value = "";
  $("fcKey").value = "";
  await chrome.storage.session.remove("secrets").catch(() => {});
  await saveSettings();
  keyStatus(t("set.keysForgotten"), true);
});
$("openHistory").addEventListener("click", openHistory);
$("pageArticle").addEventListener("click", () => pageAction("article"));
$("pagePick").addEventListener("click", () => pageAction("pick"));
$("pageSelection").addEventListener("click", () => pageAction("selection"));
$("pageArea").addEventListener("click", () => pageAction("area"));
$("closeHistory").addEventListener("click", () => $("history").close());
$("histFilter").addEventListener("input", () => renderHistory());
confirmButton($("histDeleteAll"), async () => {
  await clearSessions();
  session.id = null;
  renderHistory();
  showLastSession();
});
// Zamknięcie panelu: zapisz od razu to, co jeszcze czeka.
addEventListener("pagehide", () => { if (saveTimer) saveSessionNow(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && saveTimer) saveSessionNow(); });
$("signIn").addEventListener("click", async () => {
  $("account").textContent = t("acc.opening");
  const r = await bg({ type: "signIn" });
  if (!r?.ok) $("account").textContent = r?.error || t("acc.startFailed");
});
$("signOut").addEventListener("click", async () => { await bg({ type: "signOut" }); refreshAccount(); });
$("loadModels").addEventListener("click", () => tryLoadModels(false));
// zmiana dostawcy w formularzu: zapamiętaj wpisany klucz i model poprzedniego, pokaż pola nowego
document.querySelectorAll("input[name=provider]").forEach((r) => r.addEventListener("change", () => {
  const prev = shownProvider || S.provider; // dostawca, którego pola były widoczne
  rememberKeyInput(prev);
  draft.models[prev] = $("model").value || draft.models[prev];
  renderProviderForm();
  const p = formProvider();
  const cur = draft.models[p] || "";
  setModelOptions(modelCache[p] || (cur ? [{ id: cur, name: cur }] : []), cur);
  tryLoadModels(true);
}));
$("model").addEventListener("change", () => { renderModelCaps(); renderCostSettings(); });
$("apiKey").addEventListener("change", () => tryLoadModels(false));
$("settingsForm").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return;
  const prevLang = getLang();
  const prevModel = `${S.provider}/${S.model}`;
  readSettingsForm();
  // inny dostawca/model: od nowa próbujemy wyszukiwania, obrazków i formatu JSON (wyłączonych po odmowie poprzedniego)
  if (`${S.provider}/${S.model}` !== prevModel) state.disabled.clear();
  state.fcOff = false; // nowy klucz Google Fact Check – próbujemy od nowa
  await saveSettings();
  banner(null);
  renderCost();
  renderSummary();
  if (setLang(resolveLang(S.uiLang)) !== prevLang) localize(true);
});
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "tab-invoked") {
    if (!state.running) {
      invoked = { id: msg.tabId, title: msg.title || "" };
      banner(null);
      setStatus(t("status.readyTab", { title: msg.title || t("status.currentTab") }));
    }
    reply({ panel: true }); // tło wie, że panel jest otwarty i nie otwiera nowego okienka
    isPopupWindow().then((popup) => { if (popup) chrome.windows.update(myWindow.id, { focused: true }).catch(() => {}); });
    return;
  }
  if (msg?.type === "pending-capture") {
    reply({ panel: true });
    consumePending();
    isPopupWindow().then((popup) => { if (popup) chrome.windows.update(myWindow.id, { focused: true }).catch(() => {}); });
    return;
  }
  if (msg?.type !== "auth-changed") return;
  refreshAccount();
  if (msg.ok) { tryLoadModels(true); banner(null); } else banner(esc(t("err.signIn", { msg: msg.msg })), "error");
});

// Język interfejsu: z ustawień albo z przeglądarki.
function localize(rerender = false) {
  applyI18n();
  $("settingsTitle").textContent = t("app.settingsVersion", { v: chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version });
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
if (invoked) setStatus(t("status.readyTab", { title: invoked.title || t("status.currentTab") }));
navigator.storage?.persist?.().catch(() => {});
await loadDayUsage();
setTimeout(() => backfillMemory().catch((e) => console.warn(e)), 2500);
if (!(await resumeLastSession())) { renderFeed(); showLastSession(); }
consumePending();
DEVICE = await detectDevice();
if (S.provider === "chatgpt") {
  const acc = await refreshAccount().catch(() => null);
  if (!acc && !S.apiKey) banner(esc(t("err.welcome")) + openSettingsLink("err.settings"));
} else if (KEY_PROVIDERS.includes(S.provider) && !S.keys[S.provider]) {
  banner(esc(t("err.needKeyProv", { name: providerName(S.provider) })) + openSettingsLink("err.settings"));
}
