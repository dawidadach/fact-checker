// Obrazki do fact-checkingu: zrzut WIDOCZNEJ części karty i wycięcie wskazanych obrazków / wycinka.
// Zrzut zamiast pobierania plików: obrazki z FB/X leżą na ich serwerach, a wtyczka nie ma (i nie chce mieć)
// dostępu do wszystkich stron. Wysyłamy dokładnie to, co użytkownik widzi.
import { runInTab } from "./capture.js";

const MAX_SIDE = 1600;  // do modelu (czytelny drobny tekst infografik)
const THUMB_SIDE = 640; // miniatura do panelu, historii i wyszukiwania obrazem
let lastShot = 0;

async function captureTab(windowId) {
  const wait = 600 - (Date.now() - lastShot); // przeglądarka pozwala na 2 zrzuty na sekundę
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastShot = Date.now();
  return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
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
  try {
    const t = await chrome.tabs.get(tab.id);
    if (!t.active) return { ...p, imageError: "notVisible" };
    const prep = await runInTab(tab.id, "prepareShot", { captureId: p.captureId, area: p.area, mask });
    let shot;
    try {
      await new Promise((r) => setTimeout(r, 60)); // niech nakładki znikną z ekranu
      shot = await captureTab(t.windowId);
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
    const msg = String(e?.message || e);
    return { ...p, imageError: /permission|activeTab|all_urls|Cannot access/i.test(msg) ? "noAccess" : "failed", imageErrorMsg: msg };
  }
}
