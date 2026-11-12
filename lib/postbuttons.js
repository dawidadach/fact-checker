// Ikonka „sprawdź” przy postach (content/buttons.js) – wspólne dla tła i panelu.
// Opcja domyślnie wyłączona, osobno dla Facebooka i dla X: przeglądarka pyta o dostęp tylko do serwisu,
// który włączasz.
export const POST_SITES = {
  fb: { key: "postButtonsFb", origins: ["https://*.facebook.com/*"], label: "facebook.com" },
  x: { key: "postButtonsX", origins: ["https://*.x.com/*", "https://*.twitter.com/*"], label: "x.com" },
};
export const SITE_IDS = Object.keys(POST_SITES);
export const POST_ORIGINS = SITE_IDS.flatMap((id) => POST_SITES[id].origins);
export const POST_SCRIPT_ID = "fc-post-buttons";
export const POST_SCRIPT_FILE = "content/buttons.js";

// Które serwisy są włączone. Do wersji 0.7.5 była jedna opcja (postButtons) dla obu – jej wartość obowiązuje,
// dopóki nie przełączysz serwisu osobno.
export const postSitesOn = (s = {}) => Object.fromEntries(SITE_IDS.map((id) => [id, s?.[POST_SITES[id].key] ?? !!s?.postButtons]));
export const hasSiteAccess = (id) => chrome.permissions.contains({ origins: POST_SITES[id].origins }).catch(() => false);
