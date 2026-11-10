// Katalog lokalnych modeli rozpoznawania mowy (ONNX, uruchamiane w przeglądarce przez transformers.js).
// Rozmiary = jednorazowe pobranie (MB): gpu – WebGPU (enkoder fp16 + dekoder q4), cpu – bez karty graficznej (q8).

export const DTYPES = {
  gpu: { encoder_model: "fp16", decoder_model_merged: "q4" },
  cpu: { encoder_model: "q8", decoder_model_merged: "q8" },
};

export const MODELS = [
  {
    id: "pl-best", lang: "pl", tier: "best", repo: "onnx-community/whisper-large-v3-turbo",
    name: "Whisper Large v3 Turbo", size: { gpu: 1608, cpu: 1085 }, multilingual: true, needsGpu: true,
    note: {
      pl: "Najlepsza jakość po polsku (ten sam model co w MacWhisper / superwhisper). Rozumie też angielski i 97 innych języków.",
      en: "Best quality for Polish (the same model MacWhisper / superwhisper use). Also understands English and 97 other languages.",
    },
  },
  {
    id: "pl-mid", lang: "pl", tier: "mid", repo: "onnx-community/whisper-small",
    name: "Whisper Small", size: { gpu: 410, cpu: 249 }, multilingual: true,
    note: {
      pl: "Przyzwoity polski, myli rzadkie nazwiska i liczby. Działa na zwykłym laptopie.",
      en: "Decent Polish, gets rare names and numbers wrong. Runs on an ordinary laptop.",
    },
  },
  {
    id: "pl-light", lang: "pl", tier: "light", repo: "onnx-community/whisper-base",
    name: "Whisper Base", size: { gpu: 165, cpu: 77 }, multilingual: true,
    note: {
      pl: "Szybki i lekki, ale po polsku sporo błędów. Do słabszych komputerów.",
      en: "Fast and light, but makes many mistakes in Polish. For weaker computers.",
    },
  },
  {
    id: "en-best", lang: "en", tier: "best", repo: "onnx-community/distil-large-v3.5-ONNX",
    name: "Distil-Whisper Large v3.5", size: { gpu: 1575, cpu: 1030 }, multilingual: false, needsGpu: true,
    note: {
      pl: "Tylko angielski. Dokładność jak Whisper Large, ok. 1,5× szybszy.",
      en: "English only. Accuracy close to Whisper Large, about 1.5× faster.",
    },
  },
  {
    id: "en-mid", lang: "en", tier: "mid", repo: "onnx-community/whisper-small.en",
    name: "Whisper Small.en", size: { gpu: 410, cpu: 249 }, multilingual: false,
    note: {
      pl: "Tylko angielski. Wyraźnie lepszy od wielojęzycznego Small przy angielskim.",
      en: "English only. Clearly better than the multilingual Small for English.",
    },
  },
  {
    id: "en-light", lang: "en", tier: "light", repo: "onnx-community/moonshine-base-ONNX",
    name: "Moonshine Base", size: { gpu: 113, cpu: 63 }, multilingual: false,
    note: {
      pl: "Tylko angielski. Bardzo szybki model do transkrypcji na żywo, lepszy od Whisper Base.",
      en: "English only. A very fast model built for live transcription, better than Whisper Base.",
    },
  },
];

export const LANGS = { pl: "Polski", en: "English" };

export const getModel = (id) => MODELS.find((m) => m.id === id);

export async function detectDevice() {
  try {
    if (navigator.gpu && (await navigator.gpu.requestAdapter())) return "gpu";
  } catch { /* brak WebGPU */ }
  return "cpu";
}

// Pobrane modele zapisujemy w chrome.storage.local, a pliki trzyma Cache API ("transformers-cache").
export async function getDownloaded() {
  return (await chrome.storage.local.get("downloadedModels")).downloadedModels || {};
}
export async function markDownloaded(id, device) {
  const d = await getDownloaded();
  d[id] = { device, at: new Date().toISOString() };
  await chrome.storage.local.set({ downloadedModels: d });
}
export async function deleteModel(id) {
  const m = getModel(id);
  const d = await getDownloaded();
  delete d[id];
  await chrome.storage.local.set({ downloadedModels: d });
  // Ten sam plik może należeć do innego wpisu tylko przy tym samym repo – u nas repo są unikalne.
  const cache = await caches.open("transformers-cache");
  let freed = 0;
  for (const req of await cache.keys()) {
    if (req.url.includes(`/${m.repo}/`)) { await cache.delete(req); freed++; }
  }
  return freed;
}

export async function storageEstimate() {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usageMB: Math.round(usage / 1e6), quotaMB: Math.round(quota / 1e6) };
  } catch { return null; }
}

// Whisper na ciszy / szumie lubi "dopowiadać" typowe zdania z napisów filmowych – wycinamy je.
const HALLUCINATIONS = [
  /napisy (stworzone|wykonane) przez społeczność amara\.org/i,
  /dziękuję za (uwagę|obejrzenie)\.?$/i,
  /subskrybuj (kanał)?/i,
  /^(\[|\()?(muzyka|music|cisza|silence|brawa|applause)(\]|\))?\.?$/i,
  /thanks? (you )?for watching/i,
  /subtitles by the amara\.org community/i,
  /^\.+$|^…$/,
];
export function cleanTranscript(text, audioSec = 0) {
  let t = (text || "").replace(/\s+/g, " ").trim();
  for (const re of HALLUCINATIONS) if (re.test(t) && t.length < 80) return "";
  // pętle powtórzeń: ta sama fraza (1–8 słów) 3+ razy pod rząd → zostaje raz
  const rep = /((?:[\p{L}\d]+[,.!?;:]?\s+){1,8}?)\1{2,}/giu;
  for (let i = 0; i < 5 && rep.test(t + " "); i++) t = (t + " ").replace(rep, "$1").trim();
  // więcej słów, niż da się powiedzieć w tym czasie (~4/s) = halucynacja – ucinamy nadmiar
  if (audioSec > 0) {
    const max = Math.ceil(audioSec * 4.5) + 5;
    const words = t.split(" ");
    if (words.length > max) t = words.slice(0, max).join(" ") + "…";
  }
  return t;
}

// Wyrównanie głośności: Whisper gorzej rozpoznaje cichy dźwięk, więc podbijamy szczyt do ~0,9 (maks. 20×).
export function normalizeGain(audio) {
  let peak = 0;
  for (const v of audio) if (Math.abs(v) > peak) peak = Math.abs(v);
  if (peak <= 0) return audio;
  const g = Math.min(20, 0.9 / peak);
  if (g > 1.05) for (let i = 0; i < audio.length; i++) audio[i] *= g;
  return audio;
}
