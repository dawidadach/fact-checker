// Ikonka „słuchaj tego filmu” w odtwarzaczu YouTube (content/media.js) – wspólne dla tła i panelu.
// Opcja domyślnie wyłączona; przeglądarka pyta o dostęp tylko do youtube.com.
// Dlaczego dźwięk z filmu, a nie z karty: dźwięk karty (chrome.tabCapture) Chrome daje tylko po kliknięciu ikony
// wtyczki na pasku, menu albo skrótu – kliknięcie w stronę mu nie wystarcza. Skrypt ikonki bierze więc dźwięk prosto
// z odtwarzacza (video.captureStream) i przesyła go do panelu, a panel robi z niego zwykły strumień do transkrypcji.
export const MEDIA_KEY = "mediaButtonsYt";
export const MEDIA_ORIGINS = ["https://*.youtube.com/*"];
export const MEDIA_SCRIPT_ID = "fc-media-buttons";
export const MEDIA_SCRIPT_FILE = "content/media.js";
export const mediaOn = (s = {}) => !!s?.[MEDIA_KEY];
export const hasMediaAccess = () => chrome.permissions.contains({ origins: MEDIA_ORIGINS }).catch(() => false);

// PCM 16-bit ↔ base64 (wiadomości między kartą a panelem przechodzą przez JSON).
export function decodePcm(b64) {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 32768;
  }
  return out;
}
export function encodePcm(f32) {
  let bin = "";
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    const v = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    const u = v & 0xffff;
    bin += String.fromCharCode(u & 0xff, u >> 8);
  }
  return btoa(bin);
}
