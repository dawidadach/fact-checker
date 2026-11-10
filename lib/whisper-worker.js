// Wątek roboczy: pobiera i uruchamia lokalny model rozpoznawania mowy (transformers.js + ONNX Runtime).
// Komunikaty: {type:"load", repo, device, dtype} → progress / ready | {type:"transcribe", id, audio, language} → result

import { env, pipeline } from "../vendor/transformers.min.js";

env.allowLocalModels = false;
env.useBrowserCache = true;
// Silnik WASM z plików wtyczki, nie z CDN.
env.backends.onnx.wasm.wasmPaths = new URL("../vendor/", import.meta.url).href;
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;

let asr = null;
let loaded = null; // `${repo}|${device}`
let loading = null;

async function load({ repo, device, dtype }) {
  const key = `${repo}|${device}`;
  if (loaded === key && asr) return;
  if (asr) { try { await asr.dispose(); } catch { /* ignore */ } asr = null; loaded = null; }
  const files = {};
  asr = await pipeline("automatic-speech-recognition", repo, {
    device: device === "gpu" ? "webgpu" : "wasm",
    dtype,
    progress_callback: (p) => {
      if (p.status === "progress" || p.status === "done") {
        if (p.file) files[p.file] = { loaded: p.loaded ?? files[p.file]?.loaded ?? 0, total: p.total ?? files[p.file]?.total ?? 0 };
        if (p.status === "done" && files[p.file]) files[p.file].loaded = files[p.file].total;
        const loadedB = Object.values(files).reduce((s, f) => s + (f.loaded || 0), 0);
        const totalB = Object.values(files).reduce((s, f) => s + (f.total || 0), 0);
        self.postMessage({ type: "progress", repo, loaded: loadedB, total: totalB, file: p.file });
      }
    },
  });
  // Rozgrzewka: pierwsze wywołanie kompiluje shadery / alokuje pamięć.
  await asr(new Float32Array(16000), {});
  loaded = key;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      loading = load(data);
      await loading;
      self.postMessage({ type: "ready", repo: data.repo, device: data.device });
    } else if (data.type === "transcribe") {
      if (loading) await loading;
      if (!asr) throw new Error("Model is not loaded.");
      const opts = data.multilingual ? { language: data.language === "en" ? "english" : data.language === "pl" ? "polish" : data.language, task: "transcribe" } : {};
      const t0 = performance.now();
      const out = await asr(data.audio, { ...opts, chunk_length_s: 30 });
      self.postMessage({ type: "result", id: data.id, text: out.text || "", ms: Math.round(performance.now() - t0) });
    }
  } catch (e) {
    self.postMessage({ type: "error", id: data.id, repo: data.repo, message: String(e?.message || e) });
  }
};
