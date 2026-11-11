// Uruchamianie poleceń skryptu strony (content/page.js) w karcie – zawsze w odpowiedzi na akcję użytkownika.
// Dostęp do strony daje: kliknięcie ikony wtyczki / menu pod prawym przyciskiem / skrót (activeTab)
// albo stałe pozwolenie dla danej witryny, jeśli użytkownik je nadał.

export class PageAccessError extends Error {
  constructor(code, { url = "", cause } = {}) {
    super(code);
    this.code = code; // "restricted" | "noAccess" | "noArticle" | "failed"
    this.url = url;
    this.cause = cause;
  }
  get origin() { try { return new URL(this.url).origin; } catch { return ""; } }
  get host() { try { return new URL(this.url).hostname.replace(/^www\./, ""); } catch { return ""; } }
}

// Strony, na których przeglądarka nigdy nie pozwala wtyczkom działać.
export function isRestrictedUrl(url = "") {
  if (!/^(https?|file):/i.test(url)) return true;
  return /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|addons\.opera\.com|microsoftedge\.microsoft\.com\/addons)/i.test(url);
}

function classify(e, url) {
  if (e instanceof PageAccessError) return e;
  const msg = String(e?.message || e);
  if (isRestrictedUrl(url) || /cannot be scripted|chrome:\/\/|opera:\/\/|edge:\/\//i.test(msg)) return new PageAccessError("restricted", { url, cause: e });
  if (/permission|cannot access|host/i.test(msg)) return new PageAccessError("noAccess", { url, cause: e });
  return new PageAccessError("failed", { url, cause: e });
}

export async function runInTab(tabId, cmd, args = {}, { frameId = 0, readability = false, css = false } = {}) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) throw new PageAccessError("failed");
  const url = tab.url || tab.pendingUrl || "";
  if (isRestrictedUrl(url)) throw new PageAccessError("restricted", { url });
  const target = { tabId, ...(frameId ? { frameIds: [frameId] } : {}) };
  try {
    await chrome.scripting.executeScript({ target, files: readability ? ["lib/vendor/Readability.js", "content/page.js"] : ["content/page.js"] });
    if (css) {
      const [need] = await chrome.scripting.executeScript({ target, func: () => globalThis.__fc?.cssNeeded() });
      if (need?.result) await chrome.scripting.insertCSS({ target, files: ["content/page.css"] });
    }
    const [res] = await chrome.scripting.executeScript({ target, func: (c, a) => globalThis.__fc?.[c]?.(a), args: [cmd, args] });
    const out = res?.result;
    if (out?.error) throw new PageAccessError(out.error, { url });
    return out ?? null;
  } catch (e) {
    throw classify(e, url);
  }
}

// Dla historii: czy otwarta karta pokazuje tę samą stronę (bez #kotwicy).
export function sameUrl(a = "", b = "") {
  const strip = (u) => String(u).replace(/#.*$/, "").replace(/\/$/, "");
  return !!a && !!b && strip(a) === strip(b);
}
