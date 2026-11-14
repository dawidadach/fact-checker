import { buildRecheckRequest, buildRequest, buildTextRequest, chunkText, isDuplicate, parseImageNotes, parseResult, unsupportedFeature, VERDICTS } from "./lib/factcheck.js";
import { parseTricks, trickName, TRICKS } from "./lib/tricks.js";
import { sourceTier, TIER_TONE } from "./lib/sourcetier.js";
import { scamHint, scamSignals } from "./lib/scam.js";
import { certInfoStored, certList, lookup as certLookup } from "./lib/certlist.js";
import { PageAccessError, runInTab, sameUrl } from "./lib/capture.js";
import { POST_SITES, SITE_IDS, hasSiteAccess, postSitesOn } from "./lib/postbuttons.js";
import {
  ALL_ORIGINS, ARTICLE_GROUPS, ARTICLE_SITES, MARKS_KEY, addMark, articleConfig, articleKey, articleSite, cleanHost, covered,
  customOrigins, markView, siteOfHost, wantedOrigins,
} from "./lib/articlebuttons.js";
import { hydrateIcons, icon } from "./lib/icons.js";
import { callModel, KEY_PROVIDERS, listProviderModels, PROVIDERS, providerName } from "./lib/providers.js";
import { connectPageAudio, LocalTranscriber, localEngine, MicTranscriber, TabTranscriber } from "./lib/transcribe.js";
import { MEDIA_KEY, MEDIA_ORIGINS, hasMediaAccess, mediaOn } from "./lib/mediabuttons.js";
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
import { buildImageVerifyRequest, hasText, parseImageVerify } from "./lib/imageverify.js";
import { PROBLEM_VERDICTS } from "./lib/report.js";
import { buildReplyRequest, composeReply, originalReply, parseReply, templateReply, X_LIMIT, xLength } from "./lib/reply.js";
import { buildSummaryRequest, GENRE_TONE, LEVEL_TONE, LEVELS, needsSummary, parseSummary, severityRank, summaryKey, validSummary } from "./lib/summary.js";

const $ = (id) => document.getElementById(id);

// ---------- wygląd (projekt „fact-checker-design”): klasy fc-* i ikony Lucide ----------
const V_UI = { // werdykt → klasa koloru projektu i ikona
  prawda: ["true", "circle-check"], raczej_prawda: ["mostly", "check"], polprawda: ["half", "contrast"],
  wprowadza_w_blad: ["misleading", "triangle-alert"], falsz: ["false", "circle-x"], brak_danych: ["nodata", "circle-dashed"],
  nieweryfikowalne: ["unverifiable", "circle-question-mark"], satyra: ["satire", "drama"],
};
const vClass = (v) => `fc-v-${(V_UI[v] || V_UI.brak_danych)[0]}`;
const vIcon = (v) => (V_UI[v] || V_UI.brak_danych)[1];
const TONE_CLASS = { good: "fc-v-true", warn: "fc-v-half", bad: "fc-v-false", muted: "fc-v-nodata" };
const LEVEL_ICON = ["circle-check", "check", "contrast", "triangle-alert", "circle-x"]; // 5 poziomów oceny całości
const TIER_UI = { dane: "data", dokument: "doc", nauka: "science", urzad: "gov", sondaz: "poll", factcheck: "factcheck", encyklopedia: "encyclopedia", media: "media", social: "social" };
const KIND_ICON = { article: "file-text", post: "message-square", selection: "text-select", fragment: "file-search", image: "image", area: "scan", tab: "volume-2", mic: "mic", manual: "clipboard-paste" };
const kindIcon = (kind) => KIND_ICON[kind] || "file-text";
const CONF_LEVEL = { niska: 1, srednia: 2, wysoka: 3 };
// Element z klasą i tekstem. Tekst zawsze przez textContent – treść ze stron i od modelu nie trafia do innerHTML.
function h(tag, cls = "", text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
// Przycisk projektu: wariant (primary/secondary/ghost/soft/danger/icon), ikona, podpis (przy ikonie – dymek i aria-label).
function fcBtn({ variant = "secondary", size = "sm", iconName, label = "", title = "", cls = "", onClick } = {}) {
  const b = h("button", `fc-btn fc-btn--${variant}${size && variant !== "icon" ? ` fc-btn--${size}` : ""}${cls ? ` ${cls}` : ""}`);
  b.type = "button";
  if (iconName) b.append(icon(iconName));
  if (variant === "icon") { b.title = title || label; b.setAttribute("aria-label", label || title); }
  else { if (label) b.append(h("span", "", label)); if (title) b.title = title; }
  if (onClick) b.onclick = onClick;
  return b;
}
// Pigułka werdyktu: ikona + nazwa (albo ikona + liczba – nazwa wtedy w dymku i dla czytnika ekranu).
function verdictPill(v, { count, text, button = false } = {}) {
  const p = h(button ? "button" : "span", `fc-pill pill ${vClass(v)}`);
  if (button) p.type = "button";
  p.dataset.tone = VERDICTS[v]?.tone || "muted";
  p.append(icon(vIcon(v)), h("span", "", text ?? (count != null ? String(count) : verdictLabel(v))));
  if (count != null) { p.title = verdictLabel(v); p.setAttribute("aria-label", `${verdictLabel(v)}: ${count}`); }
  return p;
}
// Zwijana sekcja (details/summary) w stylu projektu.
function discEl(title, body, { tone = "", iconName = "", open = false, cls = "" } = {}) {
  const d = h("details", `fc-disc${tone ? ` ${tone}` : ""}${cls ? ` ${cls}` : ""}`);
  d.open = open;
  const s = h("summary");
  s.append(icon("chevron-right", { cls: "fc-disc__chev" }));
  if (iconName) s.append(icon(iconName, { cls: "fc-disc__icon" }));
  s.append(h("span", "", title));
  const b = h("div", "fc-disc__body");
  if (typeof body === "string") b.textContent = body; else b.append(body);
  d.append(s, b);
  return d;
}
const initials = (name) => String(name).split(/\s+/).filter(Boolean).map((p) => [...p][0]).join("").slice(0, 2).toUpperCase();
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
  saveHistory: true,     // zapis sesji w historii (wyłączone: wyniki znikają po zamknięciu panelu)
  // ikonka „sprawdź” przy postach: postButtonsFb / postButtonsX (osobna zgoda przeglądarki na każdy serwis);
  // brak wartości → stara wspólna opcja postButtons (lib/postbuttons.js: postSitesOn)
  articleButtons: "off", // ikonka przy tytułach artykułów: off | list (serwisy z listy) | all (wszędzie)
  articleSitesOff: [],   // serwisy z listy odznaczone przez Ciebie (lib/articlebuttons.js)
  articleCustom: [],     // serwisy dodane przez Ciebie („Pokazuj ikonkę na tej stronie”)
  mediaButtonsYt: false, // ikonka „słuchaj tego filmu” w odtwarzaczu YouTube (lib/mediabuttons.js)
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
  if (!session.id || !hasContent(stateContent()) || S.saveHistory === false) return;
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
  injectReset(findSource(id));
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
  const box = $("lastSession");
  const last = (await listSessions().catch(() => [])).find((x) => x.id !== session.id);
  box.hidden = !last || session.sources.length > 0;
  if (!last) return;
  const a = $("lastSessionLink");
  a.replaceChildren(icon("clock"), h("span", "", `${t("hist.last")} ${sessionTitle(last)} · ${fmtDate(lastActivity(last))}`), icon("chevron-right"));
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
    const kinds = [...new Set((rec.sources || []).map((x) => x.kind))];
    node.querySelector(".hist-title").replaceChildren(icon(kinds.length > 1 ? "layers" : kindIcon(kinds[0] || "tab")),
      h("span", "", sessionTitle(rec) + (rec.id === session.id ? ` · ${t("hist.current")}` : "")));
    const mins = Math.max(1, Math.round((lastActivity(rec) - rec.startedAt) / 60_000));
    node.querySelector(".hist-meta").textContent = t("hist.meta", {
      date: fmtDate(rec.startedAt), dur: t("hist.min", { n: mins }),
      claims: rec.claims?.length || 0, words: wordCount(rec.segments),
    });
    const counts = verdictCounts(rec.claims);
    const levels = (rec.sources || []).map((src) => validSummary(src, (rec.claims || []).filter((c) => c.srcId === src.id))).filter(Boolean).slice(0, 3);
    const nTricks = (rec.sources || []).reduce((a, src) => a + (src.tricks?.length || 0), 0);
    const scam = (rec.sources || []).some((src) => src.scam?.level === "high") ? "high" : (rec.sources || []).some((src) => src.scam?.level) ? "medium" : "";
    const tagPill = (cls, iconName, text, title) => { const p = h("span", `fc-pill pill ${cls}`); p.append(icon(iconName), h("span", "", text)); p.title = title; return p; };
    node.querySelector(".hist-pills").replaceChildren(...levels.map((x) => {
      const i = LEVELS.indexOf(x.level);
      const p = h("span", `fc-pill pill level${i >= 0 ? ` fc-o-${i + 1}` : ""}`);
      p.append(h("span", "lvl-dot"), h("span", "", t(`level.${x.level}`)));
      p.title = x.headline;
      p.dataset.tone = LEVEL_TONE[x.level] || "muted";
      return p;
    }), ...Object.keys(VERDICTS).filter((k) => counts[k]).sort((a, b) => severityRank(a) - severityRank(b)).map((k) => verdictPill(k, { text: `${verdictLabel(k)}: ${counts[k]}` })),
    ...(nTricks ? [tagPill("trick fc-v-ploy", "swords", String(nTricks), t("trick.title", { n: nTricks }))] : []),
    ...(scam ? [tagPill(`scam ${scam} ${scam === "high" ? "fc-v-danger" : "fc-v-warn"}`, "shield-alert", t("scam.pill"), t(scam === "high" ? "scam.titleHigh" : "scam.titleMedium"))] : []));
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
  $("ratingsInfo").textContent = rated.length ? t("fb.count", { n: rated.length }) : t("fb.none");
  $("exportRatings").disabled = !rated.length;
}
// Usuwanie wymaga drugiego kliknięcia w ciągu 4 s.
function confirmButton(btn, action) {
  let armed = null;
  let saved = "";
  const restore = () => { btn.innerHTML = saved; btn.classList.remove("confirm"); };
  btn.onclick = async () => {
    if (!armed) {
      saved = btn.innerHTML; // stała ikona SVG + podpis z t() – odtwarzamy po 4 s
      btn.replaceChildren(icon("triangle-alert"), h("span", "", t("hist.confirm")));
      btn.classList.add("confirm");
      armed = setTimeout(() => { armed = null; restore(); }, 4000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    restore();
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
  const sites = postSitesOn(S);
  for (const id of SITE_IDS) $(POST_SITES[id].key).checked = sites[id];
  renderPostButtonsInfo();
  renderArticleSettings();
  $("mediaButtonsYt").checked = mediaOn(S);
  renderMediaInfo();
  $("saveHistory").checked = S.saveHistory !== false;
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
  renderAccHints();
}
// Jednolinijkowe podsumowanie pod tytułem każdej sekcji ustawień (bez rozwijania widać, co jest ustawione).
function renderAccHints() {
  const checked = (name) => document.querySelector(`input[name=${name}]:checked`);
  const radioName = (name) => {
    const lab = checked(name)?.closest("label");
    const txt = (lab?.querySelector(".split-name") || lab?.querySelector("[data-i18n-split]"))?.textContent || "";
    return txt.trim();
  };
  const opt = (id) => $(id).selectedOptions[0]?.textContent || "";
  $("hintLang").textContent = t("hint.lang", { ui: opt("uiLang"), conv: opt("language") });
  $("hintProvider").textContent = radioName("provider");
  $("hintModel").textContent = $("model").value || "";
  $("hintMode").textContent = radioName("mode");
  const postsOn = SITE_IDS.filter((id) => $(POST_SITES[id].key).checked).map((id) => t(`set.postSite.${id}`));
  $("hintPosts").textContent = postsOn.length ? postsOn.join(" · ") : t("hint.off");
  const art = articleConfig(S);
  $("hintMedia").textContent = $("mediaButtonsYt").checked ? "YouTube" : t("hint.off");
  $("hintArticles").textContent = art.mode === "all" ? t("set.articleHint.all") : art.mode === "list" ? t("set.articleHint.list", { n: art.sites.length + art.custom.length }) : t("hint.off");
  const lang = getLang();
  const lim = Number(String($("dailyLimit").value).replace(",", ".")) || 0;
  $("hintCosts").textContent = [t("hint.today", { cost: fmtUsd(dayUsage.cost, lang) }), lim > 0 ? t("hint.limit", { limit: fmtUsd(lim, lang) }) : ""].filter(Boolean).join(" · ");
  $("hintFc").textContent = t($("fcKey").value.trim() ? "hint.keySet" : "hint.noKey");
  $("hintListen").textContent = radioName("engine");
  const gap = Number($("sessionGap").value) || 0;
  $("hintSaving").textContent = $("saveHistory").checked ? t(gap > 0 ? "hint.gap" : "hint.gapManual", { h: gap }) : t("hint.noHistory");
  const days = Math.round(Number($("memoryDays").value) || 0);
  $("hintMemory").textContent = days > 0 ? t("hint.days", { n: days }) : t("hint.off");
  $("hintScam").textContent = t($("scamCheck").checked ? "hint.on" : "hint.off") + ($("scamCheck").checked && $("certList").checked ? " · CERT Polska" : "");
  $("hintPrivacy").textContent = [$("maskPeople").checked ? t("hint.masked") : "", t($("rememberKeys").checked ? "hint.keysKept" : "hint.keysSession")].filter(Boolean).join(" · ");
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
  for (const id of SITE_IDS) S[POST_SITES[id].key] = $(POST_SITES[id].key).checked;
  S[MEDIA_KEY] = $("mediaButtonsYt").checked;
  S.saveHistory = $("saveHistory").checked;
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
    list.append(h("h3", "", t(`lang.${lang}`)));
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
        const pr = h("progress");
        if (dl.total) { pr.max = dl.total; pr.value = dl.loaded; }
        row.append(pr);
        act.textContent = dl.total ? `${Math.round((100 * dl.loaded) / dl.total)}%` : "…";
      } else if (isHave) {
        const del = fcBtn({ variant: "ghost", iconName: "trash-2", label: t("models.delete"), cls: "danger" });
        del.onclick = async () => {
          if (localEngine.ready?.repo === m.repo) localEngine.unload();
          await deleteModel(m.id);
          if (S.localModel === m.id) { S.localModel = ""; await saveSettings(); }
          renderModels();
        };
        act.append(del);
      } else {
        const get = fcBtn({ variant: "secondary", iconName: "download", label: t("models.download") });
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
  const m = mode || (state.running ? "live" : "");
  $("liveDot").className = `fc-dot${m === "live" ? " fc-dot--live" : m === "busy" ? " fc-dot--busy" : ""}`;
}
function banner(html, kind = "warn") {
  const b = $("banner");
  if (!html) { b.hidden = true; return; }
  const err = kind === "error";
  b.className = `fc-note banner ${err ? "fc-v-danger error" : "fc-v-warn"}`;
  const body = h("span");
  body.innerHTML = html; // komunikaty wtyczki (esc() na danych) z linkami „Otwórz ustawienia” itp.
  b.replaceChildren(icon(err ? "circle-alert" : "info"), body);
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
      sep.textContent = src ? `${t(`kind.${src.kind || "tab"}`)} · ${sourceTitle(src)}` : "—";
      nodes.push(sep);
    }
    if (seg.srcId !== prev) prevSpk = "";
    prev = seg.srcId;
    if ((seg.speaker || "") !== prevSpk && seg.speaker) nodes.push(h("b", "tx-spk", `${seg.speaker}: `));
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
  if (state.vFilter && !state.claims.some((c) => c.verdict === state.vFilter)) state.vFilter = null;
  $("sumPills").replaceChildren(...pillsEl(state.claims, "", { filter: true }).children);
  const problems = state.claims.filter((c) => PROBLEM_VERDICTS.includes(c.verdict)).length;
  const sw = $("onlyProblems");
  sw.setAttribute("aria-checked", String(!!S.onlyProblems));
  sw.classList.toggle("on", !!S.onlyProblems);
  $("onlyProblemsLabel").textContent = t("filter.only", { n: problems });
  $("onlyProblemsRow").hidden = !state.claims.length;
  $("feed").classList.toggle("only-problems", !!S.onlyProblems);
  $("summary").hidden = !state.claims.length && $("costLine").hidden;
}

// ---------- feed: karty pogrupowane według źródeł (najświeższe źródło na górze) ----------
function groupEl(srcId, { create = true } = {}) {
  let g = [...$("feed").querySelectorAll(".src-group")].find((x) => x.dataset.src === srcId);
  if (!g && create) {
    g = h("section", "src-group");
    g.dataset.src = srcId;
    const tricks = h("div", "tricks");
    tricks.hidden = true;
    g.append(h("header", "src-head fc-card"), h("div", "src-extra"), h("div", "cards"), tricks, h("p", "src-note"));
    renderGroupHead(g);
    $("empty").after(g);
    $("empty").hidden = true;
  }
  return g;
}
const toTop = (g) => { if (g && $("empty").nextElementSibling !== g) $("empty").after(g); };

function renderGroupHead(g) {
  const src = findSource(g.dataset.src) || {};
  const head = g.querySelector(".src-head");
  const extra = g.querySelector(".src-extra");
  const wasOpen = !!head.querySelector(".src-text")?.open;
  head.replaceChildren();
  extra.replaceChildren();
  const collapsed = g.classList.contains("collapsed");
  const mine = state.claims.filter((c) => c.srcId === src.id);
  // rodzaj źródła · serwis · godzina · liczba werdyktów · zwijanie
  const top = h("div", "src-top");
  const kind = h("span", "fc-tag");
  kind.append(icon(kindIcon(src.kind)), t(`kind.${src.kind || "tab"}`));
  const meta = h("span", "src-meta fc-t-12 fc-faint", [src.meta?.site, src.at && hhmm(src.at).slice(0, 5), mine.length ? t("src.count", { n: mine.length }) : ""].filter(Boolean).join(" · "));
  const toggle = fcBtn({ variant: "icon", iconName: "chevron-right", label: t(collapsed ? "src.expand" : "src.collapse"), cls: "src-toggle", onClick: () => { g.classList.toggle("collapsed"); renderGroupHead(g); } });
  toggle.setAttribute("aria-expanded", String(!collapsed));
  top.append(kind, meta, toggle);
  const title = h(src.url ? "a" : "span", "src-title", sourceTitle(src));
  if (src.url) { title.href = src.url; title.target = "_blank"; title.rel = "noopener noreferrer"; title.append(icon("external-link")); }
  head.append(top, title);
  if (src.kind !== "manual") head.append(dateEl(src));
  const sum = summaryState(src, mine);
  g.classList.toggle("summarised", sum?.status === "ready");
  if (mine.length > 1) {
    const pills = pillsEl(mine, "src-pills");
    if (sum?.status !== "ready") { // bez oceny całości – „Rozwiń karty” tutaj (z oceną – w jej stopce)
      const all = g.classList.contains("open-all");
      const tog = fcBtn({ variant: "ghost", iconName: all ? "chevron-down" : "list-checks", label: t(all ? "sum.collapseAll" : "sum.expandAll"), cls: "open-toggle", onClick: () => setOpenAll(g, !all) });
      tog.setAttribute("aria-expanded", String(all));
      pills.append(tog);
    }
    if (sum?.status !== "ready") { // z oceną całości – „Kopiuj jako odpowiedź” jest w jej stopce
      pills.append(fcBtn({ variant: "secondary", iconName: "message-square-reply", cls: "reply-all", title: t("rp.allHint"),
        label: t(src.kind === "post" ? "rp.allPost" : src.kind === "article" ? "rp.allArticle" : "rp.allClaims"),
        onClick: () => openReply([...mine].sort((a, b) => (a.t || 0) - (b.t || 0)), src) }));
    }
    head.append(pills);
  }
  const memInfo = src.fromMemory || src.imagesFromMemory;
  if (memInfo) {
    const mem = h("div", "src-mem fc-note");
    const key = src.imagesFromMemory ? "mem.groupImagesText" : src.fromMemory.images ? "mem.groupImage" : "mem.groupNote";
    mem.append(icon("brain"), h("span", "", t(key, { date: fmtDate(memInfo.at), model: memInfo.model || "?" })));
    if (recheck.has(src.id)) mem.append(fcBtn({ variant: "secondary", iconName: "rotate-ccw", label: t("mem.recheck"), onClick: () => recheckSource(src) }));
    head.append(mem);
  }
  const hidden = S.onlyProblems ? mine.filter((c) => !PROBLEM_VERDICTS.includes(c.verdict)).length : 0;
  if (hidden) head.append(h("div", "src-hidden", t("filter.hiddenN", { n: hidden })));
  if (src.images?.length) head.append(imagesEl(src));
  const audio = src.kind === "tab" || src.kind === "mic";
  const segs = audio ? state.segments.filter((x) => x.srcId === src.id) : [];
  const text = audio ? segs.map((x) => x.text).join(" ") : src.text;
  if (text && (audio || isPageKind(src.kind) || src.kind === "manual")) {
    const det = discEl(t(audio ? "src.transcript" : "src.text", { n: wordCount(audio ? segs : [{ text }]) }), h("div", "src-text-body", text), { cls: "src-text", open: wasOpen });
    head.append(det);
  }
  renderTricks(g, src);
  // ostrzeżenie o wysokim ryzyku oszustwa – nad oceną całości, o sygnałach – pod nią
  const scam = src.scam?.level && S.scamCheck !== false ? scamEl(src.scam) : null;
  if (scam && src.scam.level === "high") extra.append(scam);
  if (sum) extra.append(summaryEl(g, src, sum, mine));
  if (scam && src.scam.level !== "high") extra.append(scam);
  arrangeCards(g, mine);
  g.querySelectorAll(".cards .card").forEach((n) => n._paint?.());
  if (src.via === "button") injectUpdate(src);
  if (src.kind === "article") articleMarkUpdate(src);
}
// ---------- ocena całości (lib/summary.js) ----------
// Artykuł, post, mem, infografika: poziom (5 nazwanych stopni), jedno-dwa zdania i punkty ✓ ✗ ⚠ nad kartami.
// Model pisze ją po werdyktach, osobnym zapytaniem bez wyszukiwania. Gdy jest gotowa, karty zwijają się do jednej
// linii (problemy na górze) – szczegóły po kliknięciu. Dla dźwięku nie ma (tam jest raport).
const summaryJobs = new Map(); // srcId → odcisk werdyktów, dla którego trwa pisanie
const memKeys = new Map();     // srcId → klucz w pamięci werdyktów (żeby dopisać do niej podsumowanie)
const openCards = new Set();   // id kart rozwiniętych przez użytkownika
const closedCards = new Set(); // id kart zwiniętych przez użytkownika (domyślnie otwarte: jedyna karta źródła, najnowsza z nagrania)
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
  const box = h("section", `src-sum fc-card fc-stack ${st.status}`);
  box.setAttribute("aria-label", t("sum.title"));
  if (st.status === "pending") {
    const w = h("span", "sum-wait");
    w.append(icon("loader-circle", { cls: "fc-spin" }), h("span", "", t("sum.pending")));
    box.append(w);
    return box;
  }
  if (st.status !== "ready") {
    if (st.status === "error") box.append(h("p", "sum-err", t("sum.error", { msg: st.s.error })));
    box.append(fcBtn({ variant: "secondary", iconName: st.status === "error" ? "rotate-ccw" : "sparkles", label: t(st.status === "error" ? "sum.retry" : "sum.make"), onClick: () => maybeSummarize(src, { force: true }) }));
    return box;
  }
  const s = st.s;
  box.dataset.tone = LEVEL_TONE[s.level] || "muted";
  const pos = LEVELS.indexOf(s.level); // -1 = „Nie do oceny”
  const top = h("div", "fc-row sum-top");
  const right = h("span", "fc-row");
  if (s.genre && s.genre !== "inne") {
    const tone = GENRE_TONE[s.genre];
    const genre = h("span", `fc-tag sum-genre${tone === "bad" ? " fc-v-danger" : tone === "warn" ? " fc-v-warn" : ""}`);
    genre.append(icon(tone ? "triangle-alert" : "info"), t(`genre.${s.genre}`));
    genre.title = t("genre.title");
    if (tone) genre.dataset.tone = tone;
    right.append(genre);
  }
  right.append(fcBtn({ variant: "icon", iconName: "rotate-ccw", label: t("sum.regen"), cls: "sum-again", onClick: () => maybeSummarize(src, { force: true }) }));
  top.append(h("span", "fc-label sum-cap", t("sum.title")), right);
  const level = h("div", `fc-overall__level ${pos >= 0 ? `fc-o-${pos + 1}` : "na"}`);
  const badge = h("span", "fc-overall__badge");
  badge.append(icon(pos >= 0 ? LEVEL_ICON[pos] : "circle-dashed"));
  level.append(badge, h("span", "sum-level", t(`level.${s.level}`)));
  const scale = h("div", "fc-meter sum-scale");
  scale.setAttribute("role", "meter");
  scale.setAttribute("aria-valuemin", "1");
  scale.setAttribute("aria-valuemax", String(LEVELS.length));
  if (pos >= 0) scale.setAttribute("aria-valuenow", String(pos + 1));
  scale.setAttribute("aria-valuetext", t(`level.${s.level}`));
  scale.append(...LEVELS.map((l, i) => {
    const seg = h("i", `fc-meter__seg fc-o-${i + 1}${i === pos ? " is-on is-active on" : ""}`);
    seg.title = t(`level.${l}`);
    return seg;
  }));
  const labels = h("div", "fc-meter__labels");
  labels.append(h("span", "", t(`level.${LEVELS[0]}`)), h("span", "", t(`level.${LEVELS.at(-1)}`)));
  const meter = h("div");
  meter.append(scale, labels);
  box.append(top, level, meter, h("p", "fc-t-14 fc-muted sum-head", s.headline));
  const ul = h("ul", "fc-points sum-pts");
  for (const [cls, tone, ic, lab, list] of [["ok", "fc-v-true", "check", "sum.okLabel", s.ok], ["wrong", "fc-v-false", "x", "sum.wrongLabel", s.wrong],
    ["ctx", "fc-v-half", "circle-alert", "sum.ctxLabel", s.context], ["side", "fc-v-satire", "scale", "sum.sideLabel", s.side ? [s.side] : []]]) {
    for (const x of list || []) {
      const li = h("li", `${cls} ${tone}`);
      li.append(icon(ic, { label: t(lab) }), h("span", "", x));
      ul.append(li);
    }
  }
  if (ul.children.length) box.append(ul);
  const foot = h("div", "fc-row sum-foot");
  foot.append(h("span", "", t(claims.length === 1 ? "sum.scope1" : "sum.scope", { n: claims.length })));
  const all = g.classList.contains("open-all");
  const tog = fcBtn({ variant: "ghost", iconName: all ? "chevron-down" : "list-checks", label: t(all ? "sum.collapseAll" : "sum.expandAll"), onClick: () => setOpenAll(g, !all) });
  tog.setAttribute("aria-expanded", String(all));
  const acts = h("div", "fc-row sum-acts");
  acts.append(tog, fcBtn({ variant: "soft", iconName: "copy", label: t("reply.copy"), title: t("rp.allHint"), cls: "reply-all",
    onClick: () => openReply([...claims].sort((a, b) => (a.t || 0) - (b.t || 0)), src) }));
  foot.append(acts);
  box.append(foot);
  return box;
}
// „Rozwiń karty” / „Zwiń karty” – wszystkie karty źródła naraz (pojedynczą można potem zwinąć).
function setOpenAll(g, on) {
  g.classList.toggle("open-all", on);
  for (const c of state.claims.filter((x) => x.srcId === g.dataset.src)) {
    if (on) { openCards.add(c.id); closedCards.delete(c.id); } else { openCards.delete(c.id); closedCards.add(c.id); }
  }
  renderGroupHead(g);
}
// Kolejność kart: w źródle z podsumowaniem najpierw problemy (potem prawda), w pozostałych – najnowsze na górze.
function arrangeCards(g, claims) {
  const src = findSource(g.dataset.src);
  if (!src || src.kind === "tab" || src.kind === "mic") return; // nagranie: najnowsze na górze
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
    const p = h("p", "tricks-none fc-note");
    p.title = t("trick.noneHint");
    p.append(icon("drama"), h("span", "", t("trick.none")));
    box.replaceChildren(p);
    return;
  }
  box.hidden = false;
  const det = h("details", "fc-acc fc-v-ploy tricks-acc");
  det.open = !closedTricks.has(src.id);
  det.addEventListener("toggle", () => { if (det.open) closedTricks.delete(src.id); else closedTricks.add(src.id); box.dataset.sig = ""; });
  const sum = h("summary");
  const ic = h("span", "fc-acc__icon");
  ic.append(icon("swords"));
  sum.append(ic, h("span", "fc-grow fc-strong", t("trick.heading")), h("span", "fc-pill", String(list.length)), icon("chevron-right", { cls: "fc-acc__chev" }));
  sum.title = t("trick.title", { n: list.length });
  const body = h("div", "fc-acc__body");
  body.append(h("p", "fc-field__hint trick-note", t("trick.note")));
  for (const x of list) {
    const d = TRICKS[x.trick];
    if (!d) continue;
    const item = h("div", "fc-ploy trick");
    const head = h("div", "fc-row trick-head");
    const name = h("span", "fc-ploy__name trick-name");
    name.append(icon("swords"), h("span", "", trickName(x.trick, lang)));
    head.append(name);
    if (x.speaker) head.append(h("span", "fc-t-12 fc-faint", x.speaker));
    if (isPageKind(src.kind) && x.inPage !== false && x.quote) head.append(fcBtn({ variant: "ghost", iconName: "locate-fixed", label: t("page.show"), cls: "goto", onClick: () => showInPage(x) }));
    const why = h("div", "fc-t-13 fc-muted trick-why");
    why.append(h("strong", "", `${t("trick.why")} `), x.why);
    const ans = h("div", "fc-t-13 fc-muted trick-answer");
    ans.append(h("strong", "", `${t("trick.answer")} `), d.answer[lang] || d.answer.en);
    item.append(head, h("div", "fc-t-13 trick-quote", `„${x.quote}”`), why, ans,
      discEl(t("trick.def"), h("p", "", d.def[lang] || d.def.en), { cls: "trick-more" }));
    body.append(item);
  }
  det.append(sum, body);
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
  const high = scam.level === "high";
  const box = h("section", `scam-box fc-scam ${scam.level}${high ? " fc-scam--high" : ""}`);
  box.setAttribute("role", "note");
  const head = h("div", "fc-scam__head");
  const ic = h("span", "fc-scam__icon");
  ic.append(icon(high ? "shield-x" : "shield-alert"));
  const txt = h("div", "fc-grow");
  txt.append(h("div", "fc-scam__title scam-title", t(high ? "scam.titleHigh" : "scam.titleMedium")), h("div", "fc-t-13 fc-muted", t(high ? "scam.subHigh" : "scam.subMedium")));
  head.append(ic, txt);
  const ul = h("ul", "fc-scam__signals");
  for (const sig of scam.signals.slice(0, 6)) {
    const li = h("li");
    li.append(icon("circle-alert"), h("span", "", scamLine(sig)));
    ul.append(li);
  }
  const advice = h("div", "fc-note fc-v-true scam-advice");
  advice.append(icon("lightbulb"), h("span", "", t("scam.advice")));
  const row = h("div", "fc-row");
  const cert = h("a", `fc-btn fc-btn--sm ${high ? "fc-btn--danger" : "fc-btn--secondary"}`);
  cert.href = "https://incydent.cert.pl/";
  cert.target = "_blank";
  cert.rel = "noopener noreferrer";
  cert.append(icon("flag"), h("span", "", t("scam.reportBtn")));
  const why = h("p", "fc-field__hint scam-note", t("scam.why"));
  why.hidden = true;
  const whyBtn = fcBtn({ variant: "ghost", label: t("scam.whyBtn"), onClick: () => { why.hidden = !why.hidden; whyBtn.setAttribute("aria-expanded", String(!why.hidden)); } });
  whyBtn.setAttribute("aria-expanded", "false");
  row.append(cert, whyBtn);
  box.append(head, ul, advice, h("p", "scam-report", t("scam.reportOther")), row, why);
  return box;
}
async function renderCertInfo() {
  const el = $("certInfo");
  if (!el) return;
  const info = await certInfoStored().catch(() => null);
  el.textContent = info ? t("set.certInfo", { n: info.n.toLocaleString(getLang() === "pl" ? "pl-PL" : "en-US"), date: fmtDate(info.at) }) : t("set.certNone");
}

// Liczniki werdyktów („Prawda: 3 · Fałsz: 2”).
function pillsEl(claims, className, { filter = false } = {}) {
  const counts = verdictCounts(claims);
  const box = h("div", `fc-row ${className}`.trim());
  box.append(...Object.keys(VERDICTS).filter((k) => counts[k]).sort((a, b) => severityRank(a) - severityRank(b)).map((k) => {
    const p = verdictPill(k, { count: counts[k], button: filter });
    if (filter) { // pigułki nad listą filtrują karty po werdykcie
      p.setAttribute("aria-pressed", String(state.vFilter === k));
      p.onclick = () => { state.vFilter = state.vFilter === k ? null : k; renderFeed(); };
    }
    return p;
  }));
  return box;
}
// Data wypowiedzi przy źródle: z metadanych strony / filmu, „na żywo” albo wpisana ręcznie (✎).
function dateEl(src) {
  const row = h("div", "src-date");
  const d = srcDate(src);
  const live = src.kind === "mic" || src.live;
  const label = h("span", "", d ? t(src.dateSource === "user" ? "date.user" : "date.page", { date: fmtDay(d) }) : live ? t("date.live") : t("date.unknown"));
  label.title = t("date.hint");
  const edit = fcBtn({ variant: "icon", iconName: "pencil", label: t("date.edit") });
  edit.onclick = () => {
    const input = h("input", "fc-input fc-input--sm");
    input.type = "date";
    input.value = d;
    input.max = new Date().toISOString().slice(0, 10);
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
    row.replaceChildren(icon("calendar"), input);
    input.focus();
  };
  row.append(icon("calendar"), label, edit);
  return row;
}

function imageTitle(note) {
  if (note.topic) return note.topic;
  const chars = [...note.text.replace(/\s+/g, " ").trim()];
  return `${t(`imgtype.${note.type}`)}: „${chars.slice(0, 60).join("")}${chars.length > 60 ? "…" : ""}”`;
}

// Obrazki źródła: miniatura, typ, tekst odczytany z obrazka, uwagi, wyszukiwanie obrazem.
function imagesEl(src) {
  const wrap = h("div", "src-images");
  for (const [i, im] of src.images.entries()) {
    const note = (src.imageNotes || []).find((x) => x.index === i + 1) || {};
    const card = h("div", "img-card");
    const thumb = h("div", "fc-thumb");
    const img = h("img");
    img.src = im.thumb;
    img.alt = t("img.n", { n: i + 1 });
    img.title = t("img.zoom");
    thumb.append(img);
    thumb.onclick = () => card.classList.toggle("big");
    const body = h("div", "img-body");
    const title = h("div", "img-title fc-row");
    title.append(icon("image"), h("span", "", `${t("img.n", { n: i + 1 })}${note.type ? ` · ${t(`imgtype.${note.type}`)}` : ""}`));
    body.append(title);
    if (note.topic && src.images.length > 1) body.append(h("div", "img-topic", note.topic));
    if (note.text) body.append(discEl(t("img.readText"), h("div", "img-text", note.text)));
    if (note.notes) body.append(h("p", "img-notes", `${t("img.notes")}: ${note.notes}`));
    body.append(reverseSearchEl(im));
    card.append(thumb, body);
    wrap.append(card);
  }
  return wrap;
}
// Wyszukiwanie obrazem: gdzie i kiedy ten obraz pojawił się wcześniej (zdjęcia wyrwane z kontekstu).
function reverseSearchEl(im) {
  const row = h("div", "img-search");
  row.append(h("span", "fc-t-12 fc-faint", `${t("img.search")}:`));
  const link = (label, href) => {
    const a = h("a", "fc-btn fc-btn--secondary fc-btn--sm");
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.append(h("span", "", label), icon("external-link"));
    return a;
  };
  if (/^https?:/.test(im.src || "")) {
    const u = encodeURIComponent(im.src);
    row.append(link("Google Lens", `https://lens.google.com/uploadbyurl?url=${u}`), link("TinEye", `https://tineye.com/search?url=${u}`),
      link("Yandex", `https://yandex.com/images/search?rpt=imageview&url=${u}`));
  } else {
    // wycinek nie ma adresu: kopiujemy obraz do schowka i otwieramy Google Lens (tam Ctrl+V)
    const copy = fcBtn({ variant: "secondary", iconName: "copy", label: t("img.copy"), cls: "img-copy" });
    const setLabel = (txt) => { copy.querySelector("span").textContent = txt; };
    copy.onclick = async () => {
      try {
        const bmp = await createImageBitmap(await (await fetch(im.thumb)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        c.getContext("2d").drawImage(bmp, 0, 0);
        const png = await c.convertToBlob({ type: "image/png" });
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        setLabel(t("img.copied"));
      } catch (e) { setLabel(t("img.copyFailed")); console.warn(e); }
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
    const key = { frame: "img.frame", notVisible: "img.notVisible", tabChanged: "img.tabChanged" }[p.imageError] || "img.failed";
    banner(esc(t(key, { msg: p.imageErrorMsg || "" })));
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
  const v = VERDICTS[c.verdict] || VERDICTS.brak_danych;
  const node = $("cardTpl").content.firstElementChild.cloneNode(true);
  node.classList.add(vClass(c.verdict));
  node.dataset.tone = v.tone;
  node.dataset.verdict = c.verdict;
  node.dataset.cid = c.id || "";
  if (state.vFilter && c.verdict !== state.vFilter) node.classList.add("vhide");
  const pill = node.querySelector(".pill");
  pill.classList.add(vClass(c.verdict));
  pill.dataset.tone = v.tone;
  pill.append(icon(vIcon(c.verdict)), h("span", "", verdictLabel(c.verdict)));
  const conf = node.querySelector(".conf");
  conf.dataset.level = String(CONF_LEVEL[c.confidence] || 2);
  conf.setAttribute("aria-label", t("card.confidence", { c: t(`conf.${c.confidence}`) }));
  conf.title = conf.getAttribute("aria-label");
  const tags = node.querySelector(".head-tags");
  if (c.fromMemory) {
    const m = h("span", "fc-tag mem-tag");
    m.append(icon("brain"), t("mem.tag"));
    m.title = t("mem.cardNote", { date: fmtDate(c.fromMemory) });
    tags.append(m);
  }
  if (c.image > 0) {
    const m = h("span", "fc-tag img-tag");
    m.append(icon("image"), t("img.n", { n: c.image }));
    m.title = t("img.fromImage", { n: c.image });
    tags.append(m);
  }
  node.querySelector("time").textContent = hhmm(c.t);
  node.querySelector(".claim").textContent = c.claim;
  const q = node.querySelector(".quote");
  if (c.quote) {
    q.textContent = `„${c.quote}”`;
    if (c.speaker) q.append(h("cite", "", `— ${c.speaker}`));
  } else q.hidden = true;
  node.querySelector(".expl").textContent = c.explanation;
  const more = node.querySelector(".more");
  for (const [label, val, tone, ic, open] of [[t("card.visual"), c.visual_issues, "fc-v-misleading", "image", true], [t("card.evidence"), c.evidence, "fc-v-true", "check", true],
    [t("card.counter"), c.counter_evidence, "fc-v-false", "x", true], [t("card.missing"), c.missing_data, "fc-v-half", "circle-alert", true]]) {
    if (val) more.append(discEl(label, val, { tone, iconName: ic, open }));
  }
  const srcs = c.sources || [];
  if (srcs.length) {
    node.querySelector(".src-list").hidden = false;
    node.querySelector(".sources-label").textContent = t("card.sources", { n: srcs.length });
    node.querySelector(".sources").append(...srcs.map(sourceItem));
  }
  const rn = node.querySelector(".recheck-note");
  const err = recheckErrors.get(c.id);
  const note = (cls, ic, text) => { rn.hidden = false; if (cls) rn.classList.add(...cls.split(" ")); rn.replaceChildren(icon(ic), h("span", "", text)); };
  if (rechecking.has(c.id)) note("busy", "loader-circle", t("rc.running"));
  else if (err) note("warn fc-v-warn", "triangle-alert", t("rc.failed", { msg: err }));
  else if (c.recheck) {
    const by = `${providerName(c.recheck.provider)} · ${c.recheck.model || "?"}`;
    note("", "search-check", c.recheck.prev?.verdict && c.recheck.prev.verdict !== c.verdict
      ? t("rc.noteChanged", { by, from: verdictLabel(c.recheck.prev.verdict) }) : t("rc.noteSame", { by }));
  }
  if (rechecking.has(c.id)) rn.querySelector("svg")?.classList.add("fc-spin");
  const go = node.querySelector(".goto");
  const cSrc = findSource(c.srcId);
  if (isPageKind(cSrc?.kind) && (c.quote || c.image > 0 || cSrc.kind === "area") && c.inPage !== false) {
    go.hidden = false;
    go.querySelector(".goto-label").textContent = t("page.show");
    go.addEventListener("click", () => showInPage(c));
  }
  if (c.factchecks?.length) node.querySelector(".fc-box").replaceWith(factChecksEl(c));
  wireCardFoot(node, c);
  wireFold(node, c);
  return node;
}
// Źródło werdyktu: inicjał serwisu, tytuł, domena i poziom źródła (po adresie, bez modelu).
function sourceItem(s) {
  const li = h("li");
  let host = "";
  try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* zły adres – pokazujemy sam tytuł */ }
  const a = h("a", "fc-source");
  a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer";
  a.title = s.title || s.url;
  const fav = h("span", "fc-source__fav", ([...(host || s.title || "?")][0] || "?").toUpperCase());
  fav.setAttribute("aria-hidden", "true");
  const names = h("span", "fc-grow src-names");
  names.append(h("span", "fc-source__name", s.title || host || s.url), h("span", "fc-source__domain", host));
  a.append(fav, names);
  const tier = sourceTier(s.url);
  if (tier) {
    const b = h("span", `fc-tier fc-tier--${TIER_UI[tier] || "media"} tier`, t(`tier.${tier}`));
    b.title = t(`tierHint.${tier}`);
    b.dataset.tone = TIER_TONE[tier];
    a.append(b);
  }
  li.append(a);
  return li;
}
// W źródle z oceną całości karta jest zwinięta do werdyktu i twierdzenia; klik rozwija szczegóły.
// Karta: nagłówek (werdykt + twierdzenie) zawsze; szczegóły po kliknięciu. Domyślnie rozwinięta jest jedyna karta
// źródła i najnowsza karta nagrania; resztę rozwijasz sam (albo „Rozwiń karty”).
function cardOpen(c) {
  if (openCards.has(c.id)) return true;
  if (closedCards.has(c.id)) return false;
  const mine = state.claims.filter((x) => x.srcId === c.srcId);
  if (mine.length <= 1) return true;
  const src = findSource(c.srcId);
  return (src?.kind === "tab" || src?.kind === "mic") && mine.every((x) => (x.t || 0) <= (c.t || 0));
}
function wireFold(node, c) {
  const fold = node.querySelector(".fold");
  const paint = () => {
    const open = cardOpen(c);
    node.classList.toggle("open", open);
    node.dataset.open = String(open);
    fold.setAttribute("aria-expanded", String(open));
    fold.title = t(open ? "card.fold" : "card.unfold");
    fold.setAttribute("aria-label", fold.title);
  };
  const toggle = () => {
    if (node.classList.contains("open")) { openCards.delete(c.id); closedCards.add(c.id); }
    else { closedCards.delete(c.id); openCards.add(c.id); }
    paint();
  };
  fold.onclick = (e) => { e.stopPropagation(); toggle(); };
  node.querySelector(".card-head").addEventListener("click", (e) => {
    if (e.target.closest("a, button, textarea, input, select")) return;
    toggle();
  });
  node._paint = paint;
  paint();
}

// Co o tym twierdzeniu napisały redakcje fact-checkingowe (Google Fact Check Tools).
function factChecksEl(c) {
  const box = h("div", "fc-box");
  box.append(h("span", "fc-label fc-title", t("fc.title")));
  for (const f of c.factchecks) {
    const a = h("a", "fc-note fact");
    a.href = f.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    const tone = ratingTone(f.rating);
    const rating = h("span", `fc-pill pill ${TONE_CLASS[tone] || "fc-v-nodata"}`, f.rating || "?");
    rating.dataset.tone = tone;
    const txt = h("span");
    txt.append(h("strong", "", f.publisher || ""), `${f.date ? ` · ${f.date.slice(0, 10)}` : ""}: ${f.title || f.claim || f.url}`);
    a.append(icon("file-search"), rating, txt, icon("external-link"));
    box.append(a);
  }
  if (c.fcConflict) {
    const p = h("p", "fc-note fc-v-warn fc-conflict");
    p.append(icon("triangle-alert"), h("span", "", t("fc.conflict")));
    box.append(p);
  }
  return box;
}

// Stopka karty: ocena werdyktu (👍/👎 + komentarz) i „Kopiuj jako odpowiedź”.
// Stopka karty: „Sprawdź dokładniej” (z opcjonalną uwagą i wyborem innego dostawcy) i „Kopiuj jako odpowiedź”.
function wireCardFoot(node, c) {
  const open = node.querySelector(".recheck-open"), copy = node.querySelector(".copy-reply");
  const box = node.querySelector(".rc-box"), ta = box.querySelector("textarea");
  const rb = box.querySelector(".recheck"), by = box.querySelector(".recheck-by"), sel = by.querySelector("select");
  open.querySelector(".recheck-open-label").textContent = t("rc.button");
  open.title = t("rc.hint");
  open.disabled = rechecking.has(c.id);
  copy.querySelector(".copy-label").textContent = t("reply.copy");
  copy.title = t("reply.copyHint");
  box.querySelector(".rc-label").textContent = t("rc.noteLabel");
  ta.placeholder = t("rc.placeholder");
  box.querySelector(".rc-cancel").textContent = t("set.cancel");
  rb.querySelector(".recheck-label").textContent = t("rc.start");
  by.querySelector("span").textContent = t("rc.by");
  const alts = recheckProviders();
  by.hidden = alts.length < 2;
  sel.replaceChildren(...alts.map((a) => new Option(a.label, a.provider)));
  const show = (on) => {
    box.hidden = !on;
    open.setAttribute("aria-expanded", String(on));
    if (on) ta.focus();
  };
  open.onclick = () => show(box.hidden);
  box.querySelector(".rc-cancel").onclick = () => show(false);
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); rb.click(); } };
  rb.onclick = () => {
    const note = ta.value.trim().slice(0, 1000);
    show(false);
    recheckClaim(c, sel.value || S.provider, note);
  };
  copy.onclick = () => openReply([c], findSource(c.srcId));
}

// ---------- wynik pod postem (przycisk „Sprawdź fakty” na X / Facebooku) ----------
// Ramka z oceną całości, twierdzeniami, opinią i źródłami trafia pod post, z którego przyszło zlecenie.
// Panel buduje ją tymi samymi klasami co siebie (fc-tokens.css + fc-components.css w Shadow DOM strony);
// treść ze stron i od modelu jest wstawiana jako tekst, więc gotowy HTML nie niesie skryptów.
let injectCss = null;
const injectSent = new Map(); // srcId → podpis ostatnio wysłanego wyniku (wysyłamy tylko zmiany)
const INJECT_EXTRA_CSS = `
:host { display: block; }
.fc-inject { margin: 0; font-family: var(--fc-font); font-size: var(--fc-fs-14); line-height: var(--fc-lh-14); max-width: 640px; }
.fc-inject p { margin: 0; }
.fc-inject a { color: var(--fc-accent-text); }
.fc-inject svg { width: 16px; height: 16px; flex-shrink: 0; }
.fc-inject .fc-pill svg { width: 13px; height: 13px; }
.fc-inject .fc-logo { width: 22px; height: 22px; border-radius: 6px; }
.fc-inject .fc-logo svg { width: 13px; height: 13px; }
.fc-inject .fc-btn--icon { width: 26px; height: 26px; min-height: 26px; }
.fc-inject .fc-btn--icon svg, .fc-inject .fc-btn--sm svg { width: 14px; height: 14px; }
.fc-inject .inj-level { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.fc-inject .inj-level i { width: 10px; height: 10px; border-radius: 3px; background: var(--oc, var(--fc-o-off)); }
.fc-inject .fc-label svg { width: 13px; height: 13px; }
.fc-inject .inj-src a { overflow-wrap: anywhere; }
.fc-inject .fc-scam { padding: 10px 12px; }
.fc-inject .scam-advice { background: var(--fc-surface); }
.fc-inject .fc-scam .fc-row { margin-top: 8px; }
`;
// Style ramki = te same arkusze co panel (już wczytane – bez ponownego pobierania plików).
async function injectStyles() {
  if (!injectCss) {
    const sheets = [...document.styleSheets].filter((x) => /\/fc-(tokens|components)\.css$/.test(x.href || ""));
    injectCss = `${sheets.map((x) => [...x.cssRules].map((r) => r.cssText).join("\n")).join("\n")}\n${INJECT_EXTRA_CSS}`;
  }
  return injectCss;
}
function injectFrameEl(src, claims, s) {
  const box = h("div", "fc fc-inject");
  box.setAttribute("role", "region");
  box.setAttribute("aria-label", t("inj.region"));
  const head = h("div", "fc-inject__head");
  const logo = h("span", "fc-logo");
  logo.append(icon("check"));
  head.append(logo, h("span", "fc-t-13 fc-strong fc-grow", "Fact Checker"));
  if (s?.genre && s.genre !== "inne") head.append(h("span", "fc-tag", t(`genre.${s.genre}`)));
  const close = fcBtn({ variant: "icon", iconName: "x", label: t("inj.close") });
  close.dataset.act = "close";
  head.append(close);
  const body = h("div", "fc-inject__body");
  if (src.scam?.level === "high" && S.scamCheck !== false) {
    const sc = scamEl(src.scam);
    sc.querySelector(".fc-row button")?.remove(); // „Dlaczego?” – tylko w panelu
    sc.querySelector(".scam-note")?.remove();
    body.append(sc);
  }
  if (s) {
    const pos = LEVELS.indexOf(s.level);
    const lv = h("div", `fc-t-16 fc-strong inj-level${pos >= 0 ? ` fc-o-${pos + 1}` : ""}`);
    lv.append(h("i"), h("span", "", t(`level.${s.level}`)));
    const meter = h("div", "fc-meter");
    meter.setAttribute("role", "img");
    meter.setAttribute("aria-label", t(`level.${s.level}`));
    meter.append(...LEVELS.map((_, i) => h("span", `fc-meter__seg fc-o-${i + 1}${i === pos ? " is-on is-active" : ""}`)));
    const labels = h("div", "fc-meter__labels");
    labels.append(h("span", "", t(`level.${LEVELS[0]}`)), h("span", "", t(`level.${LEVELS.at(-1)}`)));
    const wrap = h("div");
    wrap.append(lv, meter, labels);
    body.append(wrap);
  }
  const sorted = [...claims].sort((a, b) => severityRank(a.verdict) - severityRank(b.verdict));
  for (const c of sorted.slice(0, 4)) {
    const row = h("div", `fc-inject__claim ${vClass(c.verdict)}`);
    const st = h("div", "fc-stack fc-grow");
    st.style.gap = "4px";
    const r1 = h("div", "fc-row");
    const conf = h("span", "fc-conf");
    conf.dataset.level = String(CONF_LEVEL[c.confidence] || 2);
    conf.setAttribute("role", "img");
    conf.setAttribute("aria-label", t("card.confidence", { c: t(`conf.${c.confidence}`) }));
    conf.append(h("i"), h("i"), h("i"));
    r1.append(verdictPill(c.verdict), conf);
    st.append(r1, h("span", "fc-t-13 fc-strong", c.claim), h("span", "fc-t-13 fc-muted", c.explanation));
    row.append(st);
    body.append(row);
  }
  if (claims.length > 4) body.append(h("p", "fc-t-12 fc-faint", t("inj.more", { n: claims.length - 4 })));
  if (!claims.length) body.append(h("p", "fc-t-13 fc-muted", t("src.noClaims")));
  if (s?.headline) {
    const op = h("div", "fc-inject__opinion");
    const lab = h("div", "fc-label");
    lab.append(icon("sparkles"), t("inj.opinion"));
    op.append(lab, h("p", "fc-t-13", s.headline));
    body.append(op);
  }
  const hosts = new Map(); // do 3 źródeł z różnych serwisów, od najważniejszych werdyktów
  for (const c of sorted) for (const x of c.sources || []) {
    let host = "";
    try { host = new URL(x.url).hostname.replace(/^www\./, ""); } catch { continue; }
    if (!hosts.has(host) && hosts.size < 3) hosts.set(host, x);
  }
  if (hosts.size) {
    const row = h("div", "fc-row inj-src");
    row.style.gap = "6px";
    row.append(h("span", "fc-t-12 fc-faint", t("inj.sources")));
    for (const [host, x] of hosts) {
      const a = h("a", "fc-link fc-t-12", host);
      a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.title = x.title || x.url;
      row.append(a);
    }
    body.append(row);
  }
  const btns = h("div", "fc-row");
  btns.style.gap = "6px";
  if (claims.length) {
    const rp = fcBtn({ variant: "soft", iconName: "copy", label: t("reply.copy") });
    rp.dataset.act = "reply";
    btns.append(rp);
  }
  const more = fcBtn({ variant: "ghost", iconName: "panel-right", label: t("inj.details") });
  more.dataset.act = "panel";
  btns.append(more);
  body.append(btns);
  box.append(head, body);
  return box;
}
function injectUpdate(src) {
  if (src?.via !== "button" || src.tabId == null || !src.captureId) return;
  if (activity.on && activity.srcId === src.id) return; // jeszcze sprawdzamy
  const claims = state.claims.filter((c) => c.srcId === src.id);
  const st = summaryState(src, claims);
  if (st?.status === "pending") return; // ocena całości w drodze
  const sig = `${getLang()}|${summaryKey(claims)}|${src.summary?.at || ""}|${src.scam?.level || ""}|${claims.length}`;
  if (injectSent.get(src.id) === sig) return;
  injectSent.set(src.id, sig);
  const html = injectFrameEl(src, claims, st?.status === "ready" ? st.s : null).outerHTML;
  injectStyles()
    .then((css) => runInTab(src.tabId, "injectResult", { captureId: src.captureId, html, css }, { frameId: src.frameId || 0 }))
    .catch((e) => console.warn(e));
}
// Post z przycisku nie zostanie sprawdzony (anulowany podgląd, duplikat, błąd) – przycisk wraca do „Sprawdź fakty”.
function injectReset(p) {
  if (p?.via === "article" && p.tabId != null) { sendArticleMark(p.tabId, { url: p.meta?.url || p.url || "", reset: true }); return; }
  if (p?.via !== "button" || p.tabId == null || !p.captureId) return;
  runInTab(p.tabId, "injectResult", { captureId: p.captureId, reset: true }, { frameId: p.frameId || 0 }).catch(() => {});
}

// ---------- znaczek z oceną przy tytule artykułu (ikonki przy artykułach – content/articles.js) ----------
// Po sprawdzeniu artykułu ocena całości (albo werdykt, gdy twierdzenie jest jedno) staje przy jego tytule na stronie.
// Gdy pamięć werdyktów jest włączona, trafia też na krótką listę „adres → ocena” (bez treści) – przy kolejnej wizycie
// znaczek wraca od razu. Lista wygasa razem z pamięcią werdyktów i czyści się razem z nią.
const markSent = new Map(); // srcId → podpis ostatnio wysłanej oceny
let markChain = Promise.resolve();
function articleMarkOf(src, claims) {
  if (activity.on && activity.srcId === src.id) return null; // jeszcze sprawdzamy
  const st = summaryState(src, claims);
  if (st?.status === "pending") return null; // ocena całości w drodze
  if (st?.status === "ready") return { level: st.s.level, n: claims.length };
  if (!claims.length) return { n: 0 };
  const worst = [...claims].sort((a, b) => severityRank(a.verdict) - severityRank(b.verdict))[0];
  return { verdict: worst.verdict, n: claims.length };
}
function articleMarkUpdate(src) {
  if (src?.kind !== "article" || !src.url) return;
  const claims = state.claims.filter((c) => c.srcId === src.id);
  const m = articleMarkOf(src, claims);
  if (!m) return;
  const sig = `${getLang()}|${JSON.stringify(m)}`;
  if (markSent.get(src.id) === sig) return;
  markSent.set(src.id, sig);
  if (S.memoryDays > 0) saveArticleMark(src, { ...m, at: src.fromMemory?.at || src.at || Date.now() });
  if (src.tabId == null) return;
  const v = markView(m, t);
  sendArticleMark(src.tabId, { url: src.url, label: v.label, tone: v.tone, captureId: src.captureId || "" });
}
function saveArticleMark(src, mark) {
  const keys = [articleKey(src.url), articleKey(src.meta?.canonical || "")];
  markChain = markChain.then(async () => {
    const { [MARKS_KEY]: marks } = await chrome.storage.local.get(MARKS_KEY);
    await chrome.storage.local.set({ [MARKS_KEY]: addMark(marks, keys, mark, { maxAgeDays: S.memoryDays }) });
  }).catch((e) => console.warn(e));
}
// Tylko do karty, która wciąż pokazuje ten artykuł; bez skryptu ikonek na stronie – nic się nie dzieje.
async function sendArticleMark(tabId, data) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !sameUrl(tab.url, data.url)) return;
  chrome.scripting.executeScript({ target: { tabId }, func: (a) => !!globalThis.__fcArticles?.mark?.(a), args: [data] }).catch(() => {});
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
async function recheckClaim(c, provider = S.provider, note = "") {
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
        claim: c, src: view, note, maxSearches: modeOf("thorough").searches,
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
      recheck: { at: Date.now(), prev, provider: who.provider, model: who.model, note },
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
function setToggle(running) {
  const b = $("toggle");
  b.classList.toggle("stop", running);
  b.querySelector("svg")?.replaceWith(icon(running ? "square" : "play"));
  $("toggleLabel").textContent = t(running ? "btn.stop" : "btn.start");
}
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
  el.classList.toggle("fc-activity--live", listening);
  $("actCancel").hidden = !activity.on;
  $("actStop").hidden = !state.running;
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
  const node = h("article", "card skeleton fc-vcard open");
  const label = h("div", "sk-label");
  label.append(icon("loader-circle", { cls: "fc-spin" }), h("span", "", stageLabel()));
  node.append(label, ...[1, 2, 3].map(() => h("div", "sk-line fc-skel")));
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
    const li = h("li");
    const label = h("span", "", captureTitle(q));
    label.title = q.meta?.url || "";
    li.append(icon(kindIcon(q.kind)), label, fcBtn({ variant: "icon", iconName: "x", label: t("queue.remove"), cls: "q-del",
      onClick: () => { state.queue = state.queue.filter((x) => x !== q); injectReset(q); renderQueue(); renderActivity(); } }));
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
    const b = h("button", "fc-chip chip");
    b.type = "button";
    const on = state.speaker === value;
    const av = h("span", "fc-chip__av", value ? initials(value) : "");
    if (!value) av.append(icon("sparkles"));
    b.append(av, h("span", "", label));
    if (on && value) { const w = h("span", "fc-chip__wave"); w.setAttribute("aria-hidden", "true"); w.append(h("i"), h("i"), h("i")); b.append(w); }
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    if (!value) b.title = t("spk.hint");
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
  if (!u.calls) { el.hidden = true; $("summary").hidden = !state.claims.length; return; }
  const lang = getLang();
  const plan = S.provider === "chatgpt" && !u.cost;
  el.replaceChildren(icon(plan ? "coins" : "wallet"), h("span", "", plan
    ? t("cost.plan", { tokens: fmtTokens(u.input + u.output, lang) })
    : t("cost.line", { session: fmtUsd(u.cost, lang), today: fmtUsd(dayUsage.cost, lang) }) + (S.dailyLimit > 0 ? ` ${t("cost.limit", { limit: fmtUsd(S.dailyLimit, lang) })}` : "")));
  el.title = t("cost.title", { calls: u.calls, input: fmtTokens(u.input, lang), output: fmtTokens(u.output, lang), searches: u.searches }) + (u.unknown ? ` ${t("cost.unknown")}` : "");
  const over = !plan && S.dailyLimit > 0 && dayUsage.cost >= S.dailyLimit;
  el.classList.toggle("over", over);
  el.classList.toggle("fc-cost--over", over);
  el.hidden = false;
  $("summary").hidden = !state.claims.length && el.hidden;
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
  const lim = Number(String($("dailyLimit").value).replace(",", ".")) || 0; // wykorzystanie dziennego limitu
  $("limitBar").hidden = !(lim > 0);
  if (lim > 0) {
    $("limitBar").firstElementChild.style.width = `${Math.min(100, Math.round((100 * dayUsage.cost) / lim))}%`;
    $("limitBar").classList.toggle("over", dayUsage.cost >= lim);
  }
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
// Obrazek z tekstem rozpoznany w pamięci po odcisku: odcisk nie widzi zmiany drobnego napisu (rok, słowo, cyfra),
// więc krótko pytamy model, czy tekst jest ten sam co zapamiętany (lib/imageverify.js). Różnica → sprawdzamy od nowa
// (z informacją, co się zmieniło). Gdy zapytać się nie da (limit, błąd sieci, model bez obrazków) – jak dotąd: wynik
// z pamięci z datą i „Sprawdź ponownie”.
async function imagesUnchanged(images, notes) {
  const todo = images.map((im, i) => ({ index: i + 1, dataUrl: im.dataUrl, text: notes[i]?.text || "" })).filter((x) => x.dataUrl && hasText(x.text));
  if (!todo.length || limitReached() || state.disabled.has("images") || !modelTakesImages()) return true;
  setStatus(t("mem.verifying"));
  try {
    await ensureModel();
    let structured = PROVIDERS[S.provider]?.structured !== false && !state.disabled.has("structured");
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await callModel({ provider: S.provider, key: await getToken(), body: buildImageVerifyRequest({ model: S.model, images: todo, structured }), timeoutMs: 60_000, idleMs: 30_000 });
        break;
      } catch (e) {
        if (structured && unsupportedFeature(e) === "structured" && attempt < 1) { structured = false; continue; }
        throw e;
      }
    }
    recordUsage(res.usage).catch((e) => console.warn(e));
    const r = parseImageVerify(res.text);
    // brak odpowiedzi dla któregoś obrazka = nie wiemy → sprawdzamy od nowa
    const bad = todo.find((x) => !r?.get(x.index)?.same);
    if (r && !bad) return true;
    banner(esc(t("mem.imgChanged", { diff: (bad && r?.get(bad.index)?.difference) || t("mem.imgChangedUnknown") })));
    return false;
  } catch (e) {
    console.warn(e);
    return true;
  }
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
  $("rpFor").textContent = claims.length > 1
    ? t("rp.forAll", { n: claims.length, title: sourceTitle(src || {}) })
    : t("rp.forOne", { claim: claims[0].claim });
  $("rpCopyLabel").textContent = t("rp.copy");
  $("replyDlg").showModal();
  showTone("orig"); // oryginał werdyktu od razu, bez zapytania do modelu; inny ton – dopiero po wybraniu
}
// Zakładki: rzeczowo / na luzie / krótko pod X (pisze model) i oryginał (tekst werdyktu bez przeróbek).
function showTone(tone, { regen = false } = {}) {
  reply.tone = tone;
  document.querySelector(`input[name=tone][value=${tone}]`).checked = true;
  $("rpRegenLabel").textContent = t(tone === "orig" ? "rp.restore" : "rp.regen");
  renderToneTabs();
  if (tone === "orig") {
    if (regen) delete replyCache().orig; // „Przywróć oryginał”
    replyBusy(false);
    const summary = reply.claims.length > 1 ? validSummary(reply.src, reply.claims) : null;
    setReplyText(replyCache().orig?.text ?? originalReply(reply.claims, { summary }), "", t("rp.origNote"));
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
    el.classList.toggle("fc-counter--over", n > X_LIMIT);
  } else {
    el.textContent = t("rp.count", { n: [...v].length });
    el.classList.remove("over", "fc-counter--over");
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
    if (!state.running) $("liveDot").className = "fc-dot";
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
// page = { tabId } – słuchanie filmu po kliknięciu ikonki w odtwarzaczu YouTube: dźwięk prosto z filmu (content/media.js),
// bez dźwięku karty i bez okna wyboru karty.
async function start({ page = null } = {}) {
  banner(null);
  if (page) { const r = document.querySelector("input[name=src][value=tab]"); if (r) r.checked = true; }
  S.src = document.querySelector("input[name=src]:checked").value;
  await saveSettings();
  const why = await sttProblem();
  // brak modelu mowy: okienko ustawień; film czeka (ikonka się kręci) i ruszy po „Zacznij słuchać”
  if (why) { if (page) state.pendingPage = { ...page, at: Date.now() }; await openSttSetup(why); return; }
  if (!page && state.pendingPage && Date.now() - state.pendingPage.at < 3 * 60_000 && S.src === "tab") page = state.pendingPage;
  state.pendingPage = null;
  if (!page && S.src === "tab") await askTabCapture(); // pierwszy Start z dźwiękiem karty: zgoda na nagrywanie karty
  const pageStream = async () => {
    tabInfo = await chrome.tabs.get(page.tabId);
    state.pageAudio = await connectPageAudio(page.tabId, {
      onSilent: () => banner(esc(t("err.pageSilent"))),
      onEnd: () => { if (state.running) stop(); },
    });
    return state.pageAudio.stream;
  };
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
      if (page) {
        await state.transcriber.start({ stream: await pageStream() });
      } else if (S.src === "tab") {
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
        cancelPage(page);
        return;
      }
      state.transcriber = new TabTranscriber({ ...common, apiKey: S.apiKey, model: S.sttModel, chunkSec: S.chunkSec });
      if (page) {
        await state.transcriber.start({ stream: await pageStream() });
      } else {
        const tab = await targetTab();
        if (!tab) throw new Error(t("err.noActiveTab"));
        tabInfo = tab;
        await state.transcriber.start(tab.id);
      }
    } else if (S.src === "tab") {
      banner(esc(t("err.chromeMicOnly")), "error");
      cancelPage(page);
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
    state.pageAudio?.stop();
    state.pageAudio = null;
    cancelPage(page);
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
  setToggle(true);
  $("liveDot").className = "fc-dot fc-dot--live";
  state.timer = setInterval(() => runCheck(), S.intervalSec * 1000);
}

async function stop() {
  state.running = false;
  lockSource(false);
  renderSpeakerBar();
  clearInterval(state.timer);
  state.transcriber?.stop();
  state.transcriber = null;
  state.pageAudio?.stop(); // ikonka w odtwarzaczu wraca do „słuchaj”
  state.pageAudio = null;
  $("interim").textContent = "";
  setToggle(false);
  $("liveDot").className = "fc-dot";
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

// ---------- zgoda na nagrywanie karty (tabCapture – uprawnienie opcjonalne) ----------
// Przy instalacji Chrome pokazywałby dla tabCapture „Odczytywanie i zmienianie wszystkich Twoich danych we wszystkich
// witrynach” – jedyny taki napis wtyczki, a to tylko dźwięk karty. Dlatego pytamy dopiero przy pierwszym Start
// z dźwiękiem karty (kliknięcie = gest użytkownika, którego wymaga przeglądarka). Odmowa: Start działa dalej przez
// okno „Udostępnij kartę”, a wtyczka nie pyta znowu (zgodę można dać w ⚙ → Słuchanie na żywo).
let tabCaptureOk = false;
const tabCaptureState = () => chrome.permissions.contains({ permissions: ["tabCapture"] }).catch(() => false).then((ok) => { tabCaptureOk = ok; renderTabCaptureInfo(); return ok; });
chrome.permissions.onAdded?.addListener(() => tabCaptureState());
chrome.permissions.onRemoved?.addListener(() => tabCaptureState());
async function askTabCapture({ force = false } = {}) {
  if (tabCaptureOk || (await tabCaptureState())) return true;
  if (S.tabCaptureNo && !force) return false;
  let ok;
  try { ok = await chrome.permissions.request({ permissions: ["tabCapture"] }); } catch (e) { console.warn(e); return false; } // np. brak gestu
  tabCaptureOk = ok;
  if (!!S.tabCaptureNo !== !ok) { S.tabCaptureNo = !ok; await saveSettings(); }
  renderTabCaptureInfo();
  return ok;
}
function renderTabCaptureInfo() {
  const row = $("tabCaptureRow");
  if (!row) return;
  row.hidden = tabCaptureOk;
}
$("tabCaptureAllow")?.addEventListener("click", () => askTabCapture({ force: true }));
tabCaptureState();

// Ikonka w odtwarzaczu czeka na panel – gdy słuchanie nie ruszy, przestaje się kręcić.
function cancelPage(page) {
  if (page?.tabId != null) chrome.tabs.sendMessage(page.tabId, { type: "fc-media-cancel" }).catch(() => {});
}
// Kliknięcie ikonki w odtwarzaczu YouTube: słuchamy tego filmu (trwające słuchanie innej karty się kończy).
async function listenToPage({ tabId }) {
  if (state.running) await stop();
  await start({ page: { tabId } });
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
  if (e.code === "postGone") { banner(esc(t("page.postGone"))); return; }
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
    injectReset(p);
    return;
  }
  let text = (p.text || "").trim();
  let images = p.images || [];
  if (state.queue.some((q) => q.key === captureKey(p, text)) || state.currentKey === captureKey(p, text)) {
    setStatus(t("queue.dup"));
    pageToast(p, `Fact Checker: ${t("queue.dup")}`);
    injectReset(p);
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
      const notesOf = (list) => images.map((_, i) => list.find((n) => n?.index === i + 1) || null);
      if (hit && (await imagesUnchanged(images, notesOf(hit.imageNotes || [])))) { await applyMemory({ ...p, text, images, memKey }, hit); return; }
      if (!hit && images.length) {
        const found = await findImages(memKey.images, opts).catch(() => []);
        if (found.length === images.length && found.every(Boolean) && (await imagesUnchanged(images, found.map((m) => m.note)))) {
          if (!text) { await applyMemory({ ...p, text, images, memKey }, imagesHit(found)); return; }
          knownImages = found;
        }
      }
    }
  }
  // Podgląd: przy obrazkach zawsze (miniatury), przy tekście – gdy jest długi albo skrócony.
  // Ikonka przy tytule artykułu – jak ikonka przy poście: jedno kliknięcie sprawdza, bez podglądu (chyba że tekst
  // trzeba skrócić).
  const skipPreview = p.skipPreview || (p.via === "article" && text.length <= MAX_TEXT);
  if (p.kind !== "manual" && !skipPreview && (images.length || text.length > PREVIEW_CHARS || p.truncated)) {
    const ok = await showPreview(p, { knownImages });
    if (!ok) { injectReset(p); return; }
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
    $("pvImagesLabel").hidden = box.hidden;
    box.replaceChildren(...(p.images || []).map((im, i) => {
      const fig = h("figure", "fc-thumb");
      const img = h("img");
      img.src = im.thumb;
      img.alt = t("img.n", { n: i + 1 });
      const x = h("button", "fc-switch pv-x");
      x.type = "button";
      x.setAttribute("role", "switch");
      x.setAttribute("aria-checked", "true");
      x.title = t("pv.dropImage");
      x.setAttribute("aria-label", t("img.n", { n: i + 1 }));
      x.onclick = () => {
        if (keep.has(i)) keep.delete(i); else keep.add(i);
        fig.classList.toggle("dropped", !keep.has(i));
        fig.classList.toggle("is-off", !keep.has(i));
        x.setAttribute("aria-checked", String(keep.has(i)));
        update();
      };
      fig.append(img, h("figcaption", "", `${i + 1} · ${im.w}×${im.h}`), x);
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
    ...(p.via ? { via: p.via } : {}),
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
    if (!state.running) $("liveDot").className = "fc-dot";
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
$("qClear").addEventListener("click", (e) => { e.preventDefault(); state.queue.forEach(injectReset); state.queue = []; renderQueue(); renderActivity(); });
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
  $("rpCopyLabel").textContent = ok ? t("reply.copied") : t("reply.failed");
  if (!ok) return;
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
$("spkAdd").addEventListener("click", () => { if ($("spkInput").value.trim()) setSpeaker($("spkInput").value); });
$("actStop").addEventListener("click", () => { if (state.running) stop(); });
// podpowiedzi w nagłówkach sekcji ustawień – na bieżąco
$("settingsForm").addEventListener("change", () => renderAccHints());
$("settingsForm").addEventListener("input", (e) => { if (e.target.matches("input[type=number], #fcKey")) renderAccHints(); });
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
confirmButton($("memClear"), async () => { await clearMemory(); await chrome.storage.local.remove(MARKS_KEY).catch(() => {}); renderMemInfo(); });
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
// Ikonka przy postach: zgoda przeglądarki musi paść w reakcji na kliknięcie, więc prosimy od razu przy zaznaczeniu
// i od razu zapisujemy tylko tę jedną opcję (tło dokłada albo zdejmuje ikonki w otwartych kartach).
// Osobno dla Facebooka i dla X – każda zgoda dotyczy tylko jednego serwisu.
async function renderPostButtonsInfo(note = "") {
  const el = $("postButtonsInfo");
  if (note) { el.textContent = note; el.hidden = false; return; }
  const on = SITE_IDS.filter((id) => $(POST_SITES[id].key).checked);
  if (!on.length) { el.hidden = true; return; }
  const missing = [];
  for (const id of on) if (!(await hasSiteAccess(id))) missing.push(POST_SITES[id].label);
  el.textContent = missing.length ? t("set.postButtonsNoAccess", { site: missing.join(", ") }) : t("set.postButtonsOn");
  el.hidden = false;
}
async function savePostSite(id, on) {
  const key = POST_SITES[id].key;
  const { settings } = await chrome.storage.local.get("settings");
  // pierwsza zmiana po starej wspólnej opcji: drugi serwis zostaje tak, jak był
  const next = { ...(settings || {}), ...Object.fromEntries(SITE_IDS.map((x) => [POST_SITES[x].key, postSitesOn(settings)[x]])), [key]: on };
  delete next.postButtons;
  for (const x of SITE_IDS) S[POST_SITES[x].key] = next[POST_SITES[x].key];
  delete S.postButtons;
  await chrome.storage.local.set({ settings: next });
}
for (const id of SITE_IDS) {
  $(POST_SITES[id].key).addEventListener("change", (e) => {
    const box = e.target;
    if (!box.checked) { savePostSite(id, false).then(() => renderPostButtonsInfo()); return; }
    chrome.permissions.request({ origins: POST_SITES[id].origins }).catch(() => false).then(async (ok) => {
      if (!ok) { box.checked = false; renderPostButtonsInfo(t("set.postButtonsDenied", { site: POST_SITES[id].label })); renderAccHints(); return; }
      await savePostSite(id, true);
      renderPostButtonsInfo();
    });
  });
}
// Ikonka w odtwarzaczu YouTube: zgoda przeglądarki na youtube.com w reakcji na kliknięcie, zapis od razu.
async function renderMediaInfo(note = "") {
  const el = $("mediaInfo");
  if (note) { el.textContent = note; el.hidden = false; return; }
  if (!$("mediaButtonsYt").checked) { el.hidden = true; return; }
  el.textContent = t((await hasMediaAccess()) ? "set.mediaOn" : "set.mediaNoAccess");
  el.hidden = false;
}
async function saveMedia(on) {
  const { settings } = await chrome.storage.local.get("settings");
  S[MEDIA_KEY] = on;
  await chrome.storage.local.set({ settings: { ...(settings || {}), [MEDIA_KEY]: on } });
  renderMediaInfo();
  renderAccHints();
}
$("mediaButtonsYt").addEventListener("change", (e) => {
  const box = e.target;
  if (!box.checked) { saveMedia(false); return; }
  chrome.permissions.request({ origins: MEDIA_ORIGINS }).catch(() => false).then((ok) => {
    if (!ok) { box.checked = false; renderMediaInfo(t("set.mediaDenied")); renderAccHints(); return; }
    saveMedia(true);
  });
});

// Ikonka przy artykułach: tryb (wyłączone / serwisy z listy / wszędzie), lista serwisów z „Zaznacz wszystkie”
// i „Pokazuj ikonkę na tej stronie”. Zgoda przeglądarki musi paść w reakcji na kliknięcie – prosimy o nią od razu
// (już udzielona nie pokazuje okienka), a opcję zapisujemy od razu, bez „Zapisz”.
async function saveArticleCfg(patch) {
  const { settings } = await chrome.storage.local.get("settings");
  Object.assign(S, patch);
  await chrome.storage.local.set({ settings: { ...(settings || {}), ...patch } });
  renderArticleSettings();
  renderAccHints();
}
const askOrigins = (origins) => (origins.length ? chrome.permissions.request({ origins }).catch(() => false) : Promise.resolve(true));
const siteOrigins = (ids) => ids.flatMap((id) => articleSite(id)?.origins || []);
function articleNote(text) {
  const el = $("articleInfo");
  el.replaceChildren(text);
  el.hidden = false;
}
let artHereHost = "";
async function renderArticleSettings() {
  const cfg = articleConfig(S);
  for (const r of document.querySelectorAll("input[name=articleMode]")) r.checked = r.value === cfg.mode;
  $("articleSites").hidden = cfg.mode !== "list";
  renderArticleGroups(cfg);
  renderArticleCustom(cfg);
  const granted = (await chrome.permissions.getAll().catch(() => ({}))).origins || [];
  const want = wantedOrigins(cfg);
  const missing = want.filter((o) => !covered(o, granted));
  const el = $("articleInfo");
  if (cfg.mode === "off") { el.hidden = true; }
  else if (missing.length) {
    const fix = fcBtn({ variant: "secondary", iconName: "lock", label: t("set.articleGrant"), onClick: () => askOrigins(missing).then(() => renderArticleSettings()) });
    el.replaceChildren(h("span", "", cfg.mode === "all" ? t("set.articleNoAccessAll") : t("set.articleNoAccess", { n: missing.length })), " ", fix);
    el.hidden = false;
  } else {
    el.replaceChildren(t(cfg.mode === "all" ? "set.articleOnAll" : "set.articleOnList", { n: cfg.sites.length + cfg.custom.length }));
    el.hidden = false;
  }
  // „Pokazuj ikonkę na tej stronie” – serwis z bieżącej karty, jeśli nie jest jeszcze włączony
  const here = $("articleHere");
  here.hidden = true;
  if (cfg.mode !== "list") return;
  const tab = await targetTab().catch(() => null);
  let host = "";
  try { const u = new URL(tab?.url || ""); if (u.protocol === "https:") host = cleanHost(u.hostname); } catch { /* np. chrome:// */ }
  artHereHost = host;
  const site = host && siteOfHost(host);
  const on = site ? cfg.sites.includes(site.id) : cfg.custom.some((c) => host === c || host.endsWith(`.${c}`));
  if (!host || on || /(^|\.)(facebook|x|twitter|youtube|google)\.com$/.test(host)) return;
  here.replaceChildren(
    h("span", "fc-t-13 fc-grow", t("set.articleHere", { site: site?.id || host })),
    fcBtn({ variant: "secondary", iconName: "plus", label: t("set.articleHereAdd"), onClick: () => addArticleHere(site, host) }),
  );
  here.hidden = false;
}
function addArticleHere(site, host) {
  if (site) { toggleArticleSites([site.id], true); return; }
  askOrigins(customOrigins(host)).then((ok) => {
    if (!ok) { articleNote(t("set.articleDenied")); return; }
    saveArticleCfg({ articleCustom: [...articleConfig(S).custom, host] });
  });
}
function toggleArticleSites(ids, on) {
  const off = new Set(articleConfig(S).off);
  if (!on) {
    ids.forEach((id) => off.add(id));
    saveArticleCfg({ articleSitesOff: [...off] });
    return;
  }
  askOrigins(siteOrigins(ids)).then((ok) => {
    if (!ok) { renderArticleSettings().then(() => articleNote(t("set.articleDenied"))); return; }
    ids.forEach((id) => off.delete(id));
    saveArticleCfg({ articleSitesOff: [...off] });
  });
}
const artOpen = new Set(); // rozwinięte grupy (pl / world)
function renderArticleGroups(cfg) {
  const box = $("articleGroups");
  box.replaceChildren(...ARTICLE_GROUPS.map((g) => {
    const sites = ARTICLE_SITES.filter((x) => x.group === g);
    const on = sites.filter((x) => !cfg.off.has(x.id)).length;
    const grid = h("div", "art-grid");
    for (const x of sites) {
      const lab = h("label", "art-site");
      const cb = h("input", "fc-check");
      cb.type = "checkbox";
      cb.value = x.id;
      cb.checked = !cfg.off.has(x.id);
      cb.addEventListener("change", () => toggleArticleSites([x.id], cb.checked));
      lab.append(cb, h("span", "", x.label));
      grid.append(lab);
    }
    const tools = h("div", "fc-row art-tools");
    tools.append(
      fcBtn({ variant: "ghost", iconName: "square-check", label: t("set.articleAll"), onClick: () => toggleArticleSites(sites.map((x) => x.id), true) }),
      fcBtn({ variant: "ghost", iconName: "square", label: t("set.articleNone"), onClick: () => toggleArticleSites(sites.map((x) => x.id), false) }),
    );
    const body = h("div", "fc-stack");
    body.append(tools, grid);
    const d = discEl(t(`set.articleGroup.${g}`, { on, n: sites.length }), body, { cls: "art-group", open: artOpen.has(g) });
    d.dataset.group = g;
    d.addEventListener("toggle", () => { if (d.open) artOpen.add(g); else artOpen.delete(g); });
    return d;
  }));
}
function renderArticleCustom(cfg) {
  const box = $("articleCustom");
  box.hidden = !cfg.custom.length;
  box.replaceChildren(h("span", "fc-field__label", t("set.articleCustom")), ...cfg.custom.map((host) => {
    const row = h("div", "fc-row art-custom-row");
    row.append(h("span", "fc-t-13 fc-grow", host), fcBtn({ variant: "icon", iconName: "x", label: t("set.articleRemove", { site: host }),
      onClick: () => saveArticleCfg({ articleCustom: articleConfig(S).custom.filter((c) => c !== host) }) }));
    return row;
  }));
}
for (const r of document.querySelectorAll("input[name=articleMode]")) {
  r.addEventListener("change", () => {
    if (!r.checked) return;
    const mode = r.value;
    if (mode === "off") { saveArticleCfg({ articleButtons: "off" }); return; }
    const cfg = articleConfig({ ...S, articleButtons: mode });
    // „Wszędzie”: jedna zgoda na wszystkie strony https; „Serwisy z listy”: zgoda na zaznaczone serwisy (jedno okienko)
    askOrigins(mode === "all" ? ALL_ORIGINS : wantedOrigins(cfg)).then((ok) => {
      if (!ok) { renderArticleSettings().then(() => articleNote(t("set.articleDenied"))); return; }
      saveArticleCfg({ articleButtons: mode });
    });
  });
}

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
// Polecenia dla panelu przychodzą tylko od tła wtyczki – nie od skryptów na stronach WWW.
const fromExtension = (sender) => sender?.id === chrome.runtime.id && String(sender.url || "").startsWith(chrome.runtime.getURL(""));
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!fromExtension(sender)) return;
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
  if (msg?.type === "inject-act") {
    const src = session.sources.find((x) => x.captureId === msg.captureId && (msg.tabId == null || x.tabId === msg.tabId));
    reply({ panel: true, found: !!src });
    if (!src) return;
    const g = groupEl(src.id, { create: false });
    if (g) {
      if (g.classList.contains("collapsed")) { g.classList.remove("collapsed"); renderGroupHead(g); }
      g.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (msg.act === "reply") {
      const mine = state.claims.filter((c) => c.srcId === src.id).sort((a, b) => (a.t || 0) - (b.t || 0));
      if (mine.length) openReply(mine, src);
    }
    isPopupWindow().then((popup) => { if (popup) chrome.windows.update(myWindow.id, { focused: true }).catch(() => {}); });
    return;
  }
  if (msg?.type === "page-listen") {
    reply({ panel: true });
    listenToPage(msg).catch((e) => handleError(e));
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
  for (const n of document.querySelectorAll("[data-i18n-split]")) {
    const [name, ...rest] = t(n.dataset.i18nSplit).split(" – ");
    n.replaceChildren(h("span", "split-name", name), ...(rest.length ? [h("span", "split-desc", rest.join(" – "))] : []));
  }
  $("settingsTitle").textContent = t("app.settingsVersion", { v: chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version });
  setToggle(state.running);
  if (!state.running && !state.busy) setStatus(t("app.ready"));
  if (rerender) {
    rerenderCards();
    if ($("settings").open) { renderModels(); refreshAccount(); }
  }
}

hydrateIcons();
hydrateIcons($("cardTpl").content);
hydrateIcons($("histTpl").content);
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
