// Obrazki do fact-checkingu: zrzut WIDOCZNEJ części karty i wycięcie wskazanych obrazków / wycinka.
// Zrzut zamiast pobierania plików: obrazki z FB/X leżą na ich serwerach, a wtyczka nie ma (i nie chce mieć)
// dostępu do wszystkich stron. Wysyłamy dokładnie to, co użytkownik widzi.
import { runInTab } from "./capture.js";

const MAX_SIDE = 1600;  // do modelu (czytelny drobny tekst infografik)
const THUMB_SIDE = 640; // miniatura do panelu, historii i wyszukiwania obrazem
let lastShot = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Przeglądarka zrzuca to, co JEST WIDAĆ w oknie – nie wskazaną kartę. Gdy w trakcie (nakładki znikają, przeglądarka
// pozwala na 2 zrzuty na sekundę – razem do ok. 0,7 s) przełączysz kartę albo strona przejdzie gdzie indziej, zrzut
// byłby z INNEJ karty, a wycinki z niej poszłyby do modelu (zgłosił voytas_). Dlatego przez cały czas pilnujemy karty:
// każde przełączenie karty w tym oknie, przejście strony na inny adres, zamknięcie albo przeniesienie karty → zrzut
// odrzucony. Przed samym zrzutem i po nim sprawdzamy jeszcze, czy na wierzchu jest ta sama karta.
export function watchTab(tabId, windowId) {
  let changed = false;
  const onActivated = (i) => { if (i.windowId === windowId && i.tabId !== tabId) changed = true; };
  const onUpdated = (id, ch) => { if (id === tabId && (ch.url || ch.status === "loading")) changed = true; };
  const onGone = (id) => { if (id === tabId) changed = true; };
  chrome.tabs.onActivated.addListener(onActivated);
  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onRemoved.addListener(onGone);
  chrome.tabs.onDetached.addListener(onGone);
  return {
    // true = karta już nie ta (albo nie na wierzchu)
    async changed() {
      await sleep(20); // zdarzenia z ostatnich chwil muszą zdążyć dojść
      if (changed) return true;
      const [top] = await chrome.tabs.query({ active: true, windowId }).catch(() => []);
      return top?.id !== tabId;
    },
    stop() {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onGone);
      chrome.tabs.onDetached.removeListener(onGone);
    },
  };
}
class TabChanged extends Error {}

async function captureTab(windowId, watch) {
  const wait = 600 - (Date.now() - lastShot); // przeglądarka pozwala na 2 zrzuty na sekundę
  if (wait > 0) await sleep(wait);
  if (await watch.changed()) throw new TabChanged(); // nie robimy zrzutu cudzej karty
  lastShot = Date.now();
  const shot = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  if (await watch.changed()) throw new TabChanged(); // przełączenie w trakcie zrzutu → wyrzucamy
  return shot;
}

export async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(bin)}`;
}

async function crop(bmp, r, scale, maxSide, quality) {
  const sx = Math.max(0, Math.round(r.x * scale)), sy = Math.max(0, Math.round(r.y * scale));
  const sw = Math.min(bmp.width - sx, Math.round(r.w * scale)), sh = Math.min(bmp.height - sy, Math.round(r.h * scale));
  if (sw < 10 || sh < 10) return null;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = new OffscreenCanvas(Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k)));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const blob = await c.convertToBlob({ type: "image/jpeg", quality });
  return { dataUrl: await blobToDataUrl(blob), w: c.width, h: c.height };
}

// p.imageCount > 0 → dokleja p.images = [{ el (nr obrazka w elemencie), dataUrl, thumb, w, h, src }].
// Błąd (brak dostępu, ramka, karta w tle) → p.imageError; tekst zostaje.
// mask: zamazać zdjęcia profilowe i nazwy autorów na zrzucie (opcja prywatności w ⚙).
export async function attachImages(p, tab, { mask = false } = {}) {
  if (!p?.imageCount || p.images || !tab?.id) return p;
  if (p.frameId) return { ...p, imageError: "frame" };
  let watch = null;
  try {
    const t = await chrome.tabs.get(tab.id);
    if (!t.active) return { ...p, imageError: "notVisible" };
    watch = watchTab(tab.id, t.windowId);
    const prep = await runInTab(tab.id, "prepareShot", { captureId: p.captureId, area: p.area, mask });
    let shot;
    try {
      await sleep(60); // niech nakładki znikną z ekranu
      shot = await captureTab(t.windowId, watch);
    } finally {
      runInTab(tab.id, "endShot").catch(() => {});
    }
    const bmp = await createImageBitmap(await (await fetch(shot)).blob());
    const scale = bmp.width / prep.vw;
    const images = [];
    let offscreen = 0;
    for (const [i, r] of prep.rects.entries()) {
      if (!r) { offscreen++; continue; }
      const full = await crop(bmp, r, scale, MAX_SIDE, 0.85);
      const thumb = await crop(bmp, r, scale, THUMB_SIDE, 0.8);
      if (!full) { offscreen++; continue; }
      images.push({ el: i + 1, dataUrl: full.dataUrl, thumb: thumb.dataUrl, w: full.w, h: full.h, src: p.imageSrcs?.[i] || "" });
    }
    bmp.close?.();
    return { ...p, images, imagesOffscreen: offscreen, masked: prep.masked || 0 };
  } catch (e) {
    if (e instanceof TabChanged) return { ...p, imageError: "tabChanged" };
    const msg = String(e?.message || e);
    return { ...p, imageError: /permission|activeTab|all_urls|Cannot access/i.test(msg) ? "noAccess" : "failed", imageErrorMsg: msg };
  } finally {
    watch?.stop();
  }
}
