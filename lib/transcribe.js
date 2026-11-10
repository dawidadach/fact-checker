// Dwa źródła tekstu:
//  - TabTranscriber: dźwięk z karty (chrome.tabCapture) → kawałki audio → OpenAI /audio/transcriptions (klucz API),
//  - MicTranscriber: wbudowane rozpoznawanie mowy Chrome (Web Speech API) z mikrofonu – darmowe.

import { transcribe } from "./llm.js";
import { cleanTranscript, DTYPES, getModel, markDownloaded, normalizeGain } from "./models.js";

export const SR = 16000;

// ---------- przechwycenie dźwięku karty ----------
// 1) chrome.tabCapture – bez okienek, ale Chrome wymaga, by na tej karcie kliknięto ikonę wtyczki;
// 2) zapasowo systemowe okno „Udostępnij kartę” (getDisplayMedia) – działa zawsze, użytkownik wskazuje kartę.
// Zwraca { stream, muted } – muted=true, gdy Chrome wyciszył kartę i trzeba oddać dźwięk na głośniki.
export const NOT_INVOKED = /invoked|activeTab|Cannot capture a tab|has not been invoked/i;

export async function captureTabAudio(tabId) {
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } }, video: false,
    });
    return { stream, muted: true, via: "tabCapture" };
  } catch (e) {
    // Chrome podaje jeden komunikat dla „nie kliknięto ikony” i „strony Chrome nie da się nagrać”
    // – w obu przypadkach pokazujemy okno wyboru karty.
    if (!NOT_INVOKED.test(e.message) && !/Chrome pages cannot be captured/i.test(e.message)) throw e;
  }
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: true, // Chrome wymaga wideo w tym oknie – od razu je wyłączamy
    audio: { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    preferCurrentTab: false, selfBrowserSurface: "exclude", surfaceSwitching: "include", systemAudio: "exclude",
  });
  const audio = display.getAudioTracks();
  display.getVideoTracks().forEach((t) => t.stop());
  if (!audio.length) {
    throw Object.assign(new Error("Nie udostępniono dźwięku. Wybierz kartę i zostaw włączone „Udostępnij też dźwięk karty”."), { code: "NO_TAB_AUDIO" });
  }
  return { stream: new MediaStream(audio), muted: false, via: "picker" };
}

// ---------- silnik lokalny (jeden wątek roboczy na panel) ----------
class LocalEngine {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.listeners = new Set();
    this.seq = 0;
    this.ready = null; // {repo, device}
  }
  _w() {
    if (!this.worker) {
      this.worker = new Worker(new URL("./whisper-worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }) => {
        if (data.type === "result" || (data.type === "error" && data.id != null)) {
          const p = this.pending.get(data.id);
          this.pending.delete(data.id);
          if (data.type === "result") p?.resolve(data); else p?.reject(new Error(data.message));
        }
        for (const l of this.listeners) l(data);
      };
      this.worker.onerror = (e) => { for (const l of this.listeners) l({ type: "error", message: e.message || "Błąd wątku modelu" }); };
    }
    return this.worker;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // Pobiera (przy pierwszym razie) i ładuje model. onProgress(loadedBytes, totalBytes).
  load(modelId, device, onProgress) {
    const m = getModel(modelId);
    if (this.ready?.repo === m.repo && this.ready?.device === device) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const off = this.on((d) => {
        if (d.repo !== m.repo && d.type !== "error") return;
        if (d.type === "progress") onProgress?.(d.loaded, d.total);
        else if (d.type === "ready") { off(); this.ready = { repo: m.repo, device }; markDownloaded(modelId, device).then(resolve); }
        else if (d.type === "error" && d.id == null) { off(); reject(new Error(d.message)); }
      });
      this.ready = null;
      this._w().postMessage({ type: "load", repo: m.repo, device, dtype: DTYPES[device] });
    });
  }

  transcribe(audio, { multilingual, language }) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this._w().postMessage({ type: "transcribe", id, audio, multilingual, language }, [audio.buffer]);
    });
  }

  unload() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    for (const p of this.pending.values()) p.reject(new Error("Model wyładowany"));
    this.pending.clear();
  }
}
export const localEngine = new LocalEngine();

// ---------- cięcie dźwięku na kawałki w miejscach ciszy ----------
export function rms(a, from = 0, to = a.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

// Zwraca indeks cięcia: najcichsze okno 200 ms w ostatnich `searchSec` sekundach bufora.
export function findCut(samples, length, { sr = SR, searchSec = 3, winMs = 200 } = {}) {
  const win = Math.round((sr * winMs) / 1000);
  const start = Math.max(0, length - sr * searchSec);
  let best = length, bestRms = Infinity;
  for (let i = start; i + win <= length; i += win / 2) {
    const r = rms(samples, i, i + win);
    if (r < bestRms) { bestRms = r; best = i + win / 2; }
  }
  return Math.round(best);
}

export class Segmenter {
  constructor({ targetSec = 12, maxSec = 25, silence = 0.002, onSegment }) {
    Object.assign(this, { targetSec, maxSec, silence, onSegment });
    this.buf = new Float32Array(SR * (maxSec + 5));
    this.n = 0;
  }
  push(chunk) {
    if (this.n + chunk.length > this.buf.length) this._emit(this.n);
    this.buf.set(chunk, this.n);
    this.n += chunk.length;
    if (this.n >= SR * this.maxSec) this._emit(this.n);
    else if (this.n >= SR * this.targetSec) {
      const cut = findCut(this.buf, this.n);
      // tniemy tylko w faktycznej przerwie; inaczej czekamy dalej aż do maxSec
      if (rms(this.buf, Math.max(0, cut - SR / 10), Math.min(this.n, cut + SR / 10)) < this.silence * 1.5 || this.n >= SR * (this.targetSec + 6)) this._emit(cut);
    }
  }
  flush() { if (this.n > SR) this._emit(this.n); else this.n = 0; }
  _emit(cut) {
    const seg = this.buf.slice(0, cut);
    this.buf.copyWithin(0, cut, this.n);
    this.n -= cut;
    if (rms(seg) > this.silence) this.onSegment?.(seg); // sama cisza – pomijamy
  }
}

// ---------- transkrypcja lokalna (dźwięk karty albo mikrofon) ----------
export class LocalTranscriber {
  constructor({ modelId, device, language, chunkSec = 12, onText, onStatus, onError, onLatency }) {
    Object.assign(this, { modelId, device, language, chunkSec, onText, onStatus, onError, onLatency });
    this.model = getModel(modelId);
    this.running = false;
    this.queue = Promise.resolve();
    this.backlog = 0;
  }

  async start({ tabId, stream } = {}) {
    if (!this.model) throw new Error("Wybierz model w ustawieniach.");
    this.onStatus?.(`Ładuję model ${this.model.name}…`);
    // Model ładujemy równolegle: okno wyboru karty musi się pojawić od razu po kliknięciu Start
    // (Chrome wymaga świeżego kliknięcia), a nagrany w tym czasie dźwięk czeka w kolejce.
    const loading = localEngine.load(this.modelId, this.device, (l, t) => t && this.onStatus?.(`Pobieram model: ${Math.round((100 * l) / t)}%`));
    loading.catch(() => {});
    if (tabId != null) {
      const cap = await captureTabAudio(tabId);
      stream = cap.stream;
      this.via = cap.via;
      if (cap.muted) {
        this.playback = new AudioContext(); // tabCapture wycisza kartę – oddajemy dźwięk na głośniki
        this.playback.createMediaStreamSource(stream).connect(this.playback.destination);
      }
    } else if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
    }
    try {
      await loading;
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      this.playback?.close();
      throw e;
    }
    this.stream = stream;
    this.ctx = new AudioContext({ sampleRate: SR });
    await this.ctx.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
    const node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.seg = new Segmenter({ targetSec: this.chunkSec, onSegment: (a) => this._send(a) });
    node.port.onmessage = ({ data }) => this.running && this.seg.push(data);
    this.ctx.createMediaStreamSource(stream).connect(node);
    this.node = node;
    this.running = true;
    stream.getAudioTracks()[0]?.addEventListener("ended", () => this.stop());
    this.onStatus?.(`Słucham · ${this.model.name} (${this.device === "gpu" ? "GPU" : "CPU"})`);
  }

  _send(audio) {
    const sec = audio.length / SR;
    this.backlog++;
    const p = localEngine.transcribe(normalizeGain(audio), { multilingual: this.model.multilingual, language: this.language });
    this.queue = this.queue.then(async () => {
      try {
        const r = await p;
        const text = cleanTranscript(r.text, sec);
        this.onLatency?.({ audioSec: sec, ms: r.ms, backlog: this.backlog - 1, raw: r.text });
        if (text) this.onText?.(text);
      } catch (e) { if (this.running) this.onError?.(e); }
      finally { this.backlog--; }
    });
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.seg?.flush();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.playback?.close();
    this.onStatus?.("Zatrzymano.");
  }
}

export class TabTranscriber {
  constructor({ apiKey, model, language, chunkSec = 12, onText, onStatus, onError }) {
    Object.assign(this, { apiKey, model, language, chunkSec, onText, onStatus, onError });
    this.running = false;
    this.lastText = "";
    this.queue = Promise.resolve();
  }

  async start(tabId) {
    const cap = await captureTabAudio(tabId);
    this.stream = cap.stream;
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    if (cap.muted) src.connect(this.ctx.destination); // tabCapture wycisza kartę – oddajemy dźwięk
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);
    this.running = true;
    this.stream.getAudioTracks()[0].addEventListener("ended", () => this.stop());
    this.onStatus?.("Słucham dźwięku z karty…");
    this._loop();
  }

  _level() {
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  }

  // Każdy kawałek nagrywamy osobnym MediaRecorderem, żeby był samodzielnym plikiem webm.
  _loop() {
    if (!this.running) return;
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const rec = new MediaRecorder(this.stream, { mimeType: mime });
    const parts = [];
    let peak = 0;
    const meter = setInterval(() => { peak = Math.max(peak, this._level()); }, 250);
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = () => {
      clearInterval(meter);
      const blob = new Blob(parts, { type: mime });
      if (peak > 0.004 && blob.size > 2000) this._send(blob); // cisza = nie płacimy za transkrypcję
      this._loop();
    };
    rec.start();
    this.recorder = rec;
    this.timer = setTimeout(() => rec.state !== "inactive" && rec.stop(), this.chunkSec * 1000);
  }

  _send(blob) {
    // Kolejkujemy, by tekst trafiał w tej samej kolejności co nagranie.
    const p = transcribe({ apiKey: this.apiKey, blob, model: this.model, language: this.language, prompt: this.lastText.slice(-200) });
    this.queue = this.queue.then(async () => {
      try {
        const text = await p;
        if (text) { this.lastText += " " + text; this.onText?.(text); }
      } catch (e) { this.onError?.(e); }
    });
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.timer);
    if (this.recorder?.state !== "inactive") this.recorder?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.onStatus?.("Zatrzymano.");
  }
}

export class MicTranscriber {
  constructor({ language = "pl", onText, onInterim, onStatus, onError }) {
    Object.assign(this, { language, onText, onInterim, onStatus, onError });
    this.running = false;
  }

  static supported() {
    return "webkitSpeechRecognition" in self || "SpeechRecognition" in self;
  }

  async start() {
    const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
    if (!SR) throw new Error("Ta przeglądarka nie ma wbudowanego rozpoznawania mowy.");
    this.running = true;
    const r = new SR();
    r.lang = this.language === "pl" ? "pl-PL" : this.language;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) this.onText?.(res[0].transcript.trim());
        else interim += res[0].transcript;
      }
      this.onInterim?.(interim);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.running = false;
        const err = new Error("Brak dostępu do mikrofonu.");
        err.code = "MIC_PERMISSION";
        this.onError?.(err);
        return;
      }
      this.onError?.(new Error(`Rozpoznawanie mowy: ${e.error}`));
    };
    // Chrome kończy sesję po chwili ciszy – wznawiamy, dopóki użytkownik nie zatrzyma.
    r.onend = () => { if (this.running) setTimeout(() => this.running && r.start(), 250); };
    this.rec = r;
    r.start();
    this.onStatus?.("Słucham przez mikrofon…");
  }

  stop() {
    this.running = false;
    this.rec?.stop();
    this.onStatus?.("Zatrzymano.");
  }
}
