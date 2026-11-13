import { getAccessToken, getAccount, handleCallback, isCallbackUrl, signOut, startSignIn, CALLBACK_PORT } from "./lib/auth.js";
import { initLang, t } from "./lib/i18n.js";
import { runInTab } from "./lib/capture.js";
import { attachImages } from "./lib/shot.js";
import { POST_SCRIPT_FILE, POST_SCRIPT_ID, POST_SITES, SITE_IDS, hasSiteAccess, postSitesOn } from "./lib/postbuttons.js";
import {
  ARTICLE_EXCLUDE, ARTICLE_SCRIPT_FILE, ARTICLE_SCRIPT_ID, MARKS_KEY, articleConfig, articleKey, covered, findMark, markView, urlMatches, wantedOrigins,
} from "./lib/articlebuttons.js";
import { MEDIA_ORIGINS, MEDIA_SCRIPT_FILE, MEDIA_SCRIPT_ID, hasMediaAccess, mediaOn } from "./lib/mediabuttons.js";

// Język komunikatów logowania = język interfejsu (ustawienia albo przeglądarka).
const langReady = initLang();
chrome.storage.onChanged.addListener((ch) => {
  if (!ch.settings) return;
  initLang().then(setupMenus);
  if (JSON.stringify(postSitesOn(ch.settings.oldValue)) !== JSON.stringify(postSitesOn(ch.settings.newValue))) syncPostButtons();
  if (artSig(ch.settings.oldValue) !== artSig(ch.settings.newValue)) syncArticleButtons();
  if (mediaOn(ch.settings.oldValue) !== mediaOn(ch.settings.newValue)) syncMediaButtons();
});
const artSig = (s) => JSON.stringify(wantedOrigins(articleConfig(s)));

// Kliknięcie ikony na pasku narzędzi daje wtyczce zgodę (activeTab) na nagrywanie dźwięku tej karty.
// Chrome: otwieramy panel boczny (chrome.sidePanel).
// Opera: nie ma chrome.sidePanel – panel siedzi na pasku bocznym Opery (sidebar_action), a wtyczka nie może
// go sama otworzyć. Dlatego: jeśli panel jest już otwarty (pasek boczny albo okienko), tylko przekazujemy mu
// kartę; jeśli nie – otwieramy panel w małym oknie obok przeglądarki.
const hasSidePanel = !!chrome.sidePanel?.open;
const manualPanel = () => { if (hasSidePanel) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {}); };
manualPanel();
// Po instalacji/aktualizacji: ikonki przy postach w otwartych kartach zastępujemy nową wersją skryptu.
chrome.runtime.onInstalled.addListener(() => { manualPanel(); setupMenus(); syncPostButtons({ reinject: true }); syncArticleButtons({ reinject: true }); syncMediaButtons({ reinject: true }); });
chrome.runtime.onStartup.addListener(() => { manualPanel(); syncPostButtons(); syncArticleButtons(); syncMediaButtons(); });

const PANEL_W = 440;
async function openPanelWindow(tab) {
  const q = new URLSearchParams({ tabId: String(tab.id), title: tab.title || "" });
  const opts = { url: chrome.runtime.getURL(`sidepanel.html?${q}`), type: "popup", width: PANEL_W, focused: true };
  try {
    const w = await chrome.windows.get(tab.windowId);
    if (w.width && w.height) {
      opts.height = w.height;
      opts.top = w.top;
      opts.left = Math.max(0, w.left + w.width - PANEL_W);
    }
  } catch { /* brak wymiarów okna – zostawiamy domyślne */ }
  await chrome.windows.create(opts);
}

chrome.action.onClicked.addListener(async (tab) => {
  const msg = { type: "tab-invoked", tabId: tab.id, title: tab.title };
  if (hasSidePanel) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {}); // musi być od razu, w reakcji na kliknięcie
    chrome.runtime.sendMessage(msg).catch(() => {});
    return;
  }
  const r = await chrome.runtime.sendMessage(msg).catch(() => null);
  if (!r?.panel) openPanelWindow(tab).catch((e) => console.error(e));
});

// Przechwycenie przekierowania OAuth na adres loopback (łapie też przekierowania 302).
chrome.webRequest.onBeforeRequest.addListener(
  (d) => { if (isCallbackUrl(d.url)) handleCallback(d.url, d.tabId); },
  { urls: [`http://127.0.0.1:${CALLBACK_PORT}/auth/callback*`], types: ["main_frame"] },
);
// Zapasowo: zmiana adresu karty.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url && isCallbackUrl(info.url)) handleCallback(info.url, tabId);
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const run = async () => {
    switch (msg?.type) {
      case "signIn": await startSignIn(); return { ok: true };
      case "signOut": await signOut(); return { ok: true };
      case "account": return { ok: true, account: await getAccount() };
      case "getToken": return { ok: true, token: await getAccessToken() };
      default: return null;
    }
  };
  if (!["signIn", "signOut", "account", "getToken"].includes(msg?.type)) return false;
  run().then(reply, (e) => reply({ ok: false, error: e.message, code: e.code }));
  return true; // odpowiedź asynchroniczna
});

// ---------- tekst ze strony: menu pod prawym przyciskiem, skrót klawiszowy ----------
// Kliknięcie w menu / skrót daje wtyczce jednorazowy dostęp do bieżącej karty (activeTab).
// Czytamy tylko to, co użytkownik wskazał: zaznaczenie, treść artykułu albo wskazany post.

// Kolejka, żeby równoległe wywołania (instalacja, start, zmiana języka) nie tworzyły duplikatów.
let menuChain = Promise.resolve();
function setupMenus() {
  menuChain = menuChain.then(async () => {
    await langReady.catch(() => {});
    await chrome.contextMenus.removeAll();
    const add = (o) => new Promise((ok) => chrome.contextMenus.create(o, () => { void chrome.runtime.lastError; ok(); }));
    await add({ id: "fc-selection", title: t("menu.selection"), contexts: ["selection"] });
    await add({ id: "fc-article", title: t("menu.article"), contexts: ["page", "link", "image"] });
    await add({ id: "fc-pick", title: t("menu.pick"), contexts: ["page", "link", "image"] });
    await add({ id: "fc-image", title: t("menu.image"), contexts: ["image"] });
    await add({ id: "fc-area", title: t("menu.area"), contexts: ["page", "link", "image", "selection"] });
  }).catch((e) => console.error(e));
  return menuChain;
}
chrome.runtime.onStartup.addListener(setupMenus);

const areaLabels = () => ({ hint: t("page.areaBar"), cancel: t("page.pickCancel") });
const pickLabels = () => ({ hint: t("page.pickBar"), cancel: t("page.pickCancel"), empty: t("page.pickEmpty"), added: t("page.pickAdded", { n: "{n}" }) });

// Przekazanie wyniku do panelu: zapis w storage.session + powiadomienie; w Operze, gdy panel nie jest otwarty,
// otwieramy go w okienku (w Chrome panel boczny otwieramy od razu przy kliknięciu – wymaga tego przeglądarka).
// Lista (nie jedno miejsce): kilka wskazań pod rząd trafia do kolejki w panelu, nic się nie nadpisuje.
// Wszystkie operacje na liście idą po kolei przez jeden łańcuch obietnic.
let captureChain = Promise.resolve();
let lastWindowOpen = 0;
const serial = (fn) => (captureChain = captureChain.then(fn).catch((e) => console.error(e)));
function deliver(payload, tab) {
  return serial(async () => {
    // obrazki (post z grafiką, obrazek spod prawego przycisku, wycinek) – zrzut od razu, póki są na ekranie
    const { settings } = await chrome.storage.local.get("settings");
    const withImages = await attachImages(payload, tab, { mask: !!settings?.maskPeople });
    const p = { ...withImages, at: Date.now(), tabId: tab?.id ?? payload.tabId ?? null };
    const { pendingCaptures: list = [] } = await chrome.storage.session.get("pendingCaptures");
    await chrome.storage.session.set({ pendingCaptures: [...list, p].slice(-30) });
    const r = await chrome.runtime.sendMessage({ type: "pending-capture" }).catch(() => null);
    // Opera: panel zamknięty → jedno okienko (kilka wskazań naraz nie otwiera kilku okien).
    if (!r?.panel && !hasSidePanel && tab && Date.now() - lastWindowOpen > 8000) {
      lastWindowOpen = Date.now();
      await openPanelWindow(tab).catch((e) => console.error(e));
    }
    return !!r?.panel; // czy otwarty panel od razu odebrał zlecenie
  });
}
// Panel odbiera całą listę naraz (po kolei z dopisywaniem – bez wyścigu).
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "take-captures") return false;
  clearBadges();
  serial(async () => {
    const { pendingCaptures: list = [] } = await chrome.storage.session.get("pendingCaptures");
    if (list.length) await chrome.storage.session.remove("pendingCaptures");
    reply({ list });
  });
  return true;
});
const errorPayload = (e, tab) => ({ error: e.code || "failed", url: e.url || tab?.url || "" });

async function captureSelection(tab, frameId = 0, fallbackText = "") {
  try {
    const res = await runInTab(tab.id, "selection", {}, { frameId });
    if (res?.text) return deliver({ ...res, frameId }, tab);
  } catch (e) {
    if (!fallbackText) return deliver(errorPayload(e, tab), tab);
  }
  // np. PDF albo ramka z innej domeny: bierzemy tekst podany przez menu (bez podświetlania)
  if (fallbackText) return deliver({ kind: "selection", text: fallbackText, meta: { title: tab.title, url: tab.url, pageUrl: tab.url }, captureId: null }, tab);
  return null;
}
async function captureArticle(tab, { via = "" } = {}) {
  try {
    return await deliver({ ...(await runInTab(tab.id, "article", {}, { readability: true })), ...(via ? { via } : {}), frameId: 0 }, tab);
  } catch (e) {
    // ikonka przy tytule czeka na wynik – nie będzie go (np. strona bez treści artykułu)
    if (via === "article") chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__fcArticles?.mark?.({ reset: true }) }).catch(() => {});
    return deliver(errorPayload(e, tab), tab);
  }
}
async function startArea(tab) {
  try {
    await runInTab(tab.id, "area", areaLabels());
  } catch (e) {
    deliver(errorPayload(e, tab), tab);
  }
}
// Obrazek spod prawego przycisku; gdy nie da się go namierzyć (ramka, tło CSS) – narzędzie wycinka.
async function captureImage(tab, info) {
  try {
    const res = info.frameId ? null : await runInTab(tab.id, "imageBySrc", { src: info.srcUrl || "" });
    if (res) return deliver({ ...res, frameId: 0 }, tab);
    await runInTab(tab.id, "toast", { text: `Fact Checker: ${t("page.imageNotFound")}` }).catch(() => {});
    return startArea(tab);
  } catch (e) {
    return deliver(errorPayload(e, tab), tab);
  }
}
async function startPick(tab) {
  try {
    await runInTab(tab.id, "pick", pickLabels());
  } catch (e) {
    deliver(errorPayload(e, tab), tab);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (hasSidePanel) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {}); // od razu – w reakcji na kliknięcie
  if (info.menuItemId === "fc-selection") captureSelection(tab, info.frameId || 0, info.selectionText || "");
  else if (info.menuItemId === "fc-article") captureArticle(tab);
  else if (info.menuItemId === "fc-pick") startPick(tab);
  else if (info.menuItemId === "fc-image") captureImage(tab, info);
  else if (info.menuItemId === "fc-area") startArea(tab);
});

// Skrót (domyślnie Alt+Shift+F): jest zaznaczenie → sprawdź je; nie ma → tryb „wskaż post”.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "fact-check") return;
  tab ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!tab?.id) return;
  if (hasSidePanel) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  try {
    const res = await runInTab(tab.id, "selection");
    if (res?.text) return deliver({ ...res, frameId: 0 }, tab);
  } catch (e) {
    return deliver(errorPayload(e, tab), tab);
  }
  startPick(tab);
});

// Wynik trybu „wskaż post” przychodzi ze skryptu strony.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "fc-captured" || !sender.tab) return false;
  deliver({ ...(msg.payload || { cancelled: true }), frameId: sender.frameId || 0 }, sender.tab);
  return false;
});

// ---------- ikonka „sprawdź” przy postach na Facebooku i X (opcja w ustawieniach, domyślnie wyłączona) ----------
// Osobno dla każdego serwisu: skrypt ikonek (content/buttons.js) działa tylko tam, gdzie opcja jest włączona I jest
// zgoda przeglądarki na ten serwis. Rejestracja idzie po kolei (jeden łańcuch) – szybkie przełączanie nie zgłasza
// „Duplicate script ID”.
let postBtnChain = Promise.resolve();
const postTabs = (origins) => (origins.length ? chrome.tabs.query({ url: origins }).catch(() => []) : Promise.resolve([]));
function syncPostButtons({ reinject = false } = {}) {
  postBtnChain = postBtnChain.then(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    const on = postSitesOn(settings);
    const want = [];
    for (const id of SITE_IDS) if (on[id] && (await hasSiteAccess(id))) want.push(...POST_SITES[id].origins);
    const reg = (await chrome.scripting.getRegisteredContentScripts({ ids: [POST_SCRIPT_ID] }).catch(() => []))[0];
    const have = reg?.matches || [];
    const added = want.filter((m) => !have.includes(m)), removed = have.filter((m) => !want.includes(m));
    if (added.length || removed.length) {
      if (reg) await chrome.scripting.unregisterContentScripts({ ids: [POST_SCRIPT_ID] });
      if (want.length) await chrome.scripting.registerContentScripts([{ id: POST_SCRIPT_ID, matches: want, js: [POST_SCRIPT_FILE], runAt: "document_idle", persistAcrossSessions: true }]);
    }
    // otwarte karty: włączenie działa od razu (bez odświeżania), wyłączenie od razu zdejmuje ikonki
    for (const tab of await postTabs(reinject ? want : added)) chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [POST_SCRIPT_FILE] }).catch(() => {});
    for (const tab of await postTabs(removed)) chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__fcButtons?.stop() }).catch(() => {});
  }).catch((e) => console.error(e));
  return postBtnChain;
}
chrome.permissions.onAdded.addListener(() => { syncPostButtons(); syncArticleButtons(); syncMediaButtons(); });
chrome.permissions.onRemoved.addListener(() => { syncPostButtons(); syncArticleButtons(); syncMediaButtons(); });

// Rejestracja skryptu na stronach (ikonki przy artykułach, w filmach): want = wzorce adresów, na których ma działać.
// Otwarte karty: włączenie działa od razu (bez odświeżania), wyłączenie od razu zdejmuje ikonki (stop).
async function syncScript({ id, file, want, exclude = [], stop, reinject = false }) {
  const reg = (await chrome.scripting.getRegisteredContentScripts({ ids: [id] }).catch(() => []))[0];
  const have = reg?.matches || [];
  const added = want.filter((m) => !have.includes(m)), removed = have.filter((m) => !want.includes(m));
  if (added.length || removed.length) {
    if (reg) await chrome.scripting.unregisterContentScripts({ ids: [id] });
    if (want.length) {
      await chrome.scripting.registerContentScripts([{
        id, matches: want, ...(exclude.length ? { excludeMatches: exclude } : {}), js: [file], runAt: "document_idle", persistAcrossSessions: true,
      }]);
    }
  }
  const hit = (url, list) => list.some((m) => urlMatches(m, url)) && !exclude.some((m) => urlMatches(m, url));
  for (const tab of await chrome.tabs.query({}).catch(() => [])) {
    if (!tab.id || !tab.url) continue;
    if (hit(tab.url, want)) {
      if (reinject || hit(tab.url, added)) chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] }).catch(() => {});
    } else if (hit(tab.url, removed)) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: stop }).catch(() => {});
    }
  }
}

// ---------- ikonka „sprawdź” przy tytułach artykułów (opcja w ustawieniach, domyślnie wyłączona) ----------
// Skrypt ikonek (content/articles.js) działa tylko na serwisach z włączonej listy (albo wszędzie, jeśli tak
// ustawisz) I tam, gdzie jest zgoda przeglądarki. Ten sam łańcuch co przy postach – bez „Duplicate script ID”.
let artChain = Promise.resolve();
function syncArticleButtons({ reinject = false } = {}) {
  artChain = artChain.then(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    const granted = (await chrome.permissions.getAll().catch(() => ({}))).origins || [];
    const want = wantedOrigins(articleConfig(settings)).filter((o) => covered(o, granted));
    await syncScript({ id: ARTICLE_SCRIPT_ID, file: ARTICLE_SCRIPT_FILE, want, exclude: ARTICLE_EXCLUDE, reinject, stop: () => globalThis.__fcArticles?.stop() });
  }).catch((e) => console.error(e));
  return artChain;
}

// ---------- ikonka „słuchaj tego filmu” w odtwarzaczu YouTube (opcja w ustawieniach, domyślnie wyłączona) ----------
let mediaChain = Promise.resolve();
function syncMediaButtons({ reinject = false } = {}) {
  mediaChain = mediaChain.then(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    const want = mediaOn(settings) && (await hasMediaAccess()) ? [...MEDIA_ORIGINS] : [];
    await syncScript({ id: MEDIA_SCRIPT_ID, file: MEDIA_SCRIPT_FILE, want, reinject, stop: () => globalThis.__fcMedia?.stop() });
  }).catch((e) => console.error(e));
  return mediaChain;
}
// Kliknięcie ikonki w odtwarzaczu: panel otwieramy OD RAZU (gest użytkownika) i każemy mu słuchać tej karty –
// panel łączy się ze skryptem ikonki przez port i dostaje dźwięk filmu.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "fc-media-listen" || !sender.tab?.id || sender.frameId) return false;
  const tab = sender.tab;
  if (hasSidePanel) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  askPanel(tab, { type: "page-listen", tabId: tab.id }, { tries: 20 }).then((r) => {
    if (!r?.panel) chrome.tabs.sendMessage(tab.id, { type: "fc-media-cancel", reason: "noPanel" }).catch(() => {});
  });
  return false;
});
// Kliknięcie ikonki przy tytule: panel otwieramy OD RAZU (gest użytkownika), artykuł pobiera page.js – jak „Sprawdź
// artykuł” w menu. Kliknięcie znaczka z oceną: szczegóły w panelu, a gdy wyniku nie ma w bieżącej sesji – sprawdzenie
// od nowa (z pamięci werdyktów: od razu i bez kosztów).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "fc-article-button" || !sender.tab?.id || sender.frameId) return false;
  const tab = sender.tab;
  const opened = hasSidePanel ? chrome.sidePanel.open({ windowId: tab.windowId }).then(() => true, () => false) : Promise.resolve(true);
  articleButton(tab, msg, opened);
  return false;
});
async function articleButton(tab, msg, opened) {
  if (msg.act === "panel" && msg.captureId) {
    const r = await forwardInjectAct(tab, { act: "panel", captureId: String(msg.captureId) });
    if (r?.found) return;
  }
  const took = await captureArticle(tab, { via: "article" });
  if (!took && !(await opened)) waitingBadge(tab);
}
// Ocena zapamiętana przy wcześniejszym sprawdzeniu artykułu (tylko adres → ocena; wygasa z pamięcią werdyktów).
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== "fc-article-mark-get" || !sender.tab?.id) return false;
  lookupMark(msg).then((mark) => reply({ mark }), () => reply({ mark: null }));
  return true;
});
async function lookupMark({ url = "", canonical = "" } = {}) {
  const { settings, [MARKS_KEY]: marks } = await chrome.storage.local.get(["settings", MARKS_KEY]);
  const days = Number(settings?.memoryDays ?? 30);
  if (!(days > 0) || !marks) return null;
  const m = findMark(marks, [articleKey(url), articleKey(canonical)], { maxAgeDays: days });
  if (!m) return null;
  await langReady;
  const v = markView(m, t);
  return v && { ...v, at: m.at || 0 };
}

// Kliknięcie ikonki: panel otwieramy OD RAZU (Chrome pozwala tylko w reakcji na kliknięcie), post pobiera page.js.
const badgeTabs = new Set();
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "fc-post-button" || !sender.tab?.id) return false;
  const tab = sender.tab;
  const opened = hasSidePanel ? chrome.sidePanel.open({ windowId: tab.windowId }).then(() => true, () => false) : Promise.resolve(true);
  capturePost(tab, String(msg.token || ""), opened);
  return false;
});
async function capturePost(tab, token, opened) {
  let took = false;
  try {
    const res = await runInTab(tab.id, "postFrom", { token });
    if (res) took = await deliver({ ...res, frameId: 0 }, tab);
  } catch (e) {
    took = await deliver(errorPayload(e, tab), tab);
  }
  if (!took && !(await opened)) waitingBadge(tab);
}
// Panel nie odebrał zlecenia, a przeglądarka nie dała go otworzyć: zlecenie czeka w kolejce – podpowiadamy, gdzie kliknąć.
function waitingBadge(tab) {
  badgeTabs.add(tab.id);
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#1f4fd1" }).catch(() => {});
  chrome.action.setBadgeText({ tabId: tab.id, text: "1" }).catch(() => {});
  runInTab(tab.id, "toast", { text: `Fact Checker: ${t("page.openPanel")}` }).catch(() => {});
}
// Przyciski w ramce wyniku pod postem („Kopiuj jako odpowiedź”, „Szczegóły w panelu”): panel otwieramy od razu
// (kliknięcie = gest użytkownika), potem przekazujemy mu, o który post chodzi.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "fc-inject-act" || !sender.tab?.id) return false;
  const tab = sender.tab;
  if (hasSidePanel) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  forwardInjectAct(tab, msg);
  return false;
});
const forwardInjectAct = (tab, msg) => askPanel(tab, { type: "inject-act", act: msg.act, captureId: msg.captureId, tabId: tab.id });
// Wiadomość do panelu; gdy go nie ma – Opera: otwieramy okienko; Chrome/Edge: panel właśnie się otwiera – ponawiamy.
async function askPanel(tab, msg, { tries = 12 } = {}) {
  let r = await chrome.runtime.sendMessage(msg).catch(() => null);
  if (!r?.panel && !hasSidePanel) await openPanelWindow(tab).catch((e) => console.error(e));
  for (let i = 0; i < tries && !r?.panel; i++) {
    await new Promise((ok) => setTimeout(ok, 500));
    r = await chrome.runtime.sendMessage(msg).catch(() => null);
  }
  return r;
}
function clearBadges() {
  for (const id of badgeTabs) chrome.action.setBadgeText({ tabId: id, text: "" }).catch(() => {});
  badgeTabs.clear();
}
