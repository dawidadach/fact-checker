import { getAccessToken, getAccount, handleCallback, isCallbackUrl, signOut, startSignIn, CALLBACK_PORT } from "./lib/auth.js";
import { initLang, t } from "./lib/i18n.js";
import { runInTab } from "./lib/capture.js";
import { attachImages } from "./lib/shot.js";

// Język komunikatów logowania = język interfejsu (ustawienia albo przeglądarka).
const langReady = initLang();
chrome.storage.onChanged.addListener((ch) => { if (ch.settings) initLang().then(setupMenus); });

// Kliknięcie ikony na pasku narzędzi daje wtyczce zgodę (activeTab) na nagrywanie dźwięku tej karty.
// Chrome: otwieramy panel boczny (chrome.sidePanel).
// Opera: nie ma chrome.sidePanel – panel siedzi na pasku bocznym Opery (sidebar_action), a wtyczka nie może
// go sama otworzyć. Dlatego: jeśli panel jest już otwarty (pasek boczny albo okienko), tylko przekazujemy mu
// kartę; jeśli nie – otwieramy panel w małym oknie obok przeglądarki.
const hasSidePanel = !!chrome.sidePanel?.open;
const manualPanel = () => { if (hasSidePanel) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {}); };
manualPanel();
chrome.runtime.onInstalled.addListener(() => { manualPanel(); setupMenus(); });
chrome.runtime.onStartup.addListener(manualPanel);

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
  });
}
// Panel odbiera całą listę naraz (po kolei z dopisywaniem – bez wyścigu).
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "take-captures") return false;
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
async function captureArticle(tab) {
  try {
    deliver({ ...(await runInTab(tab.id, "article", {}, { readability: true })), frameId: 0 }, tab);
  } catch (e) {
    deliver(errorPayload(e, tab), tab);
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
