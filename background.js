import { getAccessToken, getAccount, handleCallback, isCallbackUrl, signOut, startSignIn, CALLBACK_PORT } from "./lib/auth.js";

// Kliknięcie ikony: otwiera panel i daje wtyczce zgodę (activeTab) na nagrywanie dźwięku tej karty.
// Panel otwieramy sami (a nie przez openPanelOnActionClick), bo tylko wtedy Chrome traktuje kliknięcie
// jako wywołanie wtyczki na karcie i pozwala na chrome.tabCapture.
const manualPanel = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
manualPanel();
chrome.runtime.onInstalled.addListener(manualPanel);
chrome.runtime.onStartup.addListener(manualPanel);

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {}); // musi być od razu, w reakcji na kliknięcie
  chrome.runtime.sendMessage({ type: "tab-invoked", tabId: tab.id, title: tab.title }).catch(() => {});
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
