// Fact Checker – ikonka „Słuchaj i sprawdzaj” w odtwarzaczu YouTube.
// Opcja w ustawieniach, domyślnie WYŁĄCZONA; działa dopiero po zgodzie przeglądarki na youtube.com.
// Ikonka stoi na pasku odtwarzacza, obok napisów. Kliknięcie włącza słuchanie tego filmu od razu – bez Start
// i bez wybierania karty: dźwięk bierzemy prosto z odtwarzacza (video.captureStream – film gra normalnie, karta nie jest
// wyciszana) i przez port wysyłamy do panelu, który zamienia go na tekst tak jak przy Start. Ponowne kliknięcie
// zatrzymuje. Dopóki nie klikniesz, skrypt niczego nie słucha, nie czyta i nie wysyła. Przycisk siedzi w zamkniętym
// Shadow DOM. W trakcie reklamy i pauzy dźwięk nie idzie dalej.
(() => {
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const VERSION = (() => { try { return chrome.runtime.getManifest().version; } catch { return ""; } })();

  const prev = globalThis.__fcMedia;
  if (prev?.alive?.() && prev.version === VERSION) { prev.start(); return; }
  try { prev?.stop?.(); } catch { /* stara instancja (sprzed aktualizacji wtyczki) */ }

  if (!/(^|\.)youtube\.com$/.test(location.hostname) || /^(m|music|studio)\./.test(location.hostname)) return;

  const GEN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const TAG = "fc-yt-btn";
  const SR = 16000;
  const WAIT_MS = 3 * 60_000; // tyle czekamy, aż panel zacznie słuchać (np. pobieranie modelu mowy)
  const BUF_CHUNKS = Math.ceil((30 * SR) / 4096); // do 30 s dźwięku czeka, aż panel się połączy
  const SILENT_SEC = 8; // film gra, a z odtwarzacza płyną same zera → podpowiedź w panelu

  // ---------- teksty (język interfejsu z ustawień wtyczki) ----------
  const DICT = {
    pl: {
      idle: "Fact Checker: słuchaj i sprawdzaj ten film", connecting: "Fact Checker: włączam słuchanie…",
      listening: "Fact Checker słucha tego filmu – kliknij, aby zatrzymać",
      reload: "Fact Checker został zaktualizowany – odśwież stronę, żeby znów słuchać filmów jednym kliknięciem.",
      noVideo: "Fact Checker: nie widzę tu filmu.", noPanel: "Fact Checker nie zaczął słuchać – otwórz panel wtyczki (ikona na pasku).",
      failed: "Fact Checker: nie udało się wziąć dźwięku z tego filmu – użyj Start w panelu.",
    },
    en: {
      idle: "Fact Checker: listen to and fact-check this video", connecting: "Fact Checker: starting to listen…",
      listening: "Fact Checker is listening to this video – click to stop",
      reload: "Fact Checker was updated – reload the page to listen to videos with one click again.",
      noVideo: "Fact Checker: there is no video here.", noPanel: "Fact Checker did not start listening – open the extension's panel (toolbar icon).",
      failed: "Fact Checker: couldn't take the sound from this video – use Start in the panel.",
    },
  };
  const uiLang = () => { try { return chrome.i18n.getUILanguage(); } catch { return navigator.language || "en"; } };
  let lang = /^pl\b/i.test(uiLang()) ? "pl" : "en";
  const L = () => DICT[lang] || DICT.en;
  const applyLang = (pref) => {
    const next = pref === "pl" || pref === "en" ? pref : /^pl\b/i.test(uiLang()) ? "pl" : "en";
    if (next !== lang) { lang = next; paint(); }
  };
  const onStorage = (ch) => { if (ch.settings && alive()) applyLang(ch.settings.newValue?.uiLang); };

  // ---------- przycisk ----------
  // Ikony Lucide (ISC): shield-check, loader-circle.
  const SVG = (paths, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICON_CHECK = SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>');
  const ICON_SPIN = SVG('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>', "spin");
  const CSS = `
    :host { all: initial; }
    button { all: unset; box-sizing: border-box; position: relative; display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%; cursor: pointer; color: #fff; opacity: .9; transition: opacity .1s; }
    button:hover, button[aria-pressed="true"] { opacity: 1; }
    button:focus-visible { outline: 2px solid #fff; outline-offset: -6px; border-radius: 8px; }
    svg { width: 24px; height: 24px; filter: drop-shadow(0 0 2px rgba(0, 0, 0, .45)); }
    button[aria-pressed="true"] svg { color: oklch(0.8 0.12 263); }
    button[aria-pressed="true"]::after { content: ""; position: absolute; top: 28%; right: 24%; width: 8px; height: 8px; border-radius: 50%;
      background: #f03; box-shadow: 0 0 0 2px rgba(0, 0, 0, .35); animation: pulse 1.4s ease-in-out infinite; }
    .float { width: 40px; height: 40px; border-radius: 50%; background: rgba(0, 0, 0, .55); }
    .spin { animation: spin .9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 50% { opacity: .35; } }
    @media (prefers-reduced-motion: reduce) { .spin, button::after { animation: none !important; } }
  `;
  let btn = null; // { h, b, float }
  function makeButton(float) {
    const h = document.createElement(TAG);
    h.dataset.fcGen = GEN;
    h.style.cssText = float
      ? "all:initial;position:absolute;top:12px;right:12px;z-index:70;width:40px;height:40px;display:block;"
      : "all:initial;display:inline-block;width:48px;height:100%;vertical-align:top;flex:none;";
    const sh = h.attachShadow({ mode: "closed" });
    const st = document.createElement("style");
    st.textContent = CSS;
    const b = document.createElement("button");
    b.type = "button";
    if (float) b.className = "float";
    // kliknięcie i klawisze nie mogą dojść do odtwarzacza (pauza, skróty klawiszowe YouTube)
    for (const ev of ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "auxclick", "keydown", "keyup"]) b.addEventListener(ev, (e) => e.stopPropagation());
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); press(); });
    sh.append(st, b);
    btn = { h, b, float };
    paint();
    return h;
  }
  function paint() {
    if (!btn) return;
    const { b } = btn;
    b.innerHTML = mode === "connecting" ? ICON_SPIN : ICON_CHECK; // stałe ikony wtyczki
    const text = L()[mode];
    b.title = text;
    b.setAttribute("aria-label", text);
    b.setAttribute("aria-pressed", String(mode !== "idle"));
  }
  const player = () => document.querySelector("#movie_player");
  const isWatch = () => location.pathname === "/watch" || location.pathname.startsWith("/live/");
  // Przycisk na pasku odtwarzacza, na lewo od napisów i ustawień; gdy paska nie ma – w prawym górnym rogu filmu.
  function ensureButton() {
    const p = player();
    const show = !!p && (isWatch() || mode !== "idle");
    if (!show) { btn?.h.remove(); return; }
    const bar = p.querySelector(".ytp-right-controls");
    const float = !bar;
    if (btn && btn.float !== float) { btn.h.remove(); btn = null; }
    const h = btn?.h || makeButton(float);
    if (bar) { if (h.parentNode !== bar || bar.firstElementChild !== h) bar.prepend(h); }
    else if (h.parentNode !== p) p.append(h);
  }

  // ---------- dźwięk z odtwarzacza ----------
  let mode = "idle"; // idle | connecting | listening
  let cap = null;    // { ctx, node, video, stream, src, key }
  let port = null;
  let buf = [];
  let waitTimer = 0, silentFor = 0, silentSent = false;
  const mainVideo = () => player()?.querySelector("video.html5-main-video") || player()?.querySelector("video") || document.querySelector("video");
  const adShowing = () => !!player()?.classList.contains("ad-showing");

  function encode(f32) {
    let bin = "";
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      const v = (s < 0 ? Math.round(s * 32768) : Math.round(s * 32767)) & 0xffff;
      bin += String.fromCharCode(v & 0xff, v >> 8);
    }
    return btoa(bin);
  }
  function onPcm(f32) {
    if (!cap || mode === "idle") return;
    const v = cap.video;
    if (!v?.isConnected || v.paused || v.ended || adShowing()) return; // pauza, reklama – nic nie wysyłamy
    let peak = 0;
    for (let i = 0; i < f32.length; i += 8) peak = Math.max(peak, Math.abs(f32[i]));
    if (peak === 0 && !v.muted && v.volume > 0) {
      silentFor += f32.length / SR;
      if (silentFor >= SILENT_SEC && !silentSent && port) { silentSent = true; port.postMessage({ type: "silent" }); }
    } else silentFor = 0;
    const msg = { pcm: encode(f32) };
    if (port) port.postMessage(msg);
    else { buf.push(msg); if (buf.length > BUF_CHUNKS) buf.shift(); }
  }
  function capture(video) {
    const ctx = new AudioContext({ sampleRate: SR });
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0; // przetwarzanie działa tylko podłączone do wyjścia – na wyjście idzie cisza (film gra sam)
    node.connect(mute);
    mute.connect(ctx.destination);
    node.onaudioprocess = (e) => onPcm(e.inputBuffer.getChannelData(0));
    cap = { ctx, node, video: null, stream: null, src: null, key: "" };
    attach(video);
  }
  // Film w tej samej karcie się zmienia (YouTube nie przeładowuje strony): ten sam element, nowe ścieżki dźwięku.
  function attach(video) {
    cap.video = video;
    cap.stream = video.captureStream();
    cap.stream.addEventListener("addtrack", relink);
    cap.key = "";
    relink();
  }
  function relink() {
    if (!cap) return;
    const tracks = cap.stream.getAudioTracks().filter((tr) => tr.readyState === "live");
    const key = tracks.map((tr) => tr.id).join();
    if (key === cap.key) return;
    cap.src?.disconnect();
    cap.src = null;
    cap.key = key;
    if (!tracks.length) return; // film jeszcze się nie załadował – ścieżka dojdzie (addtrack)
    cap.src = cap.ctx.createMediaStreamSource(new MediaStream(tracks));
    cap.src.connect(cap.node);
  }

  // ---------- kliknięcie ----------
  function press() {
    if (mode !== "idle") { finish(); return; }
    if (!alive()) { stop(); note(L().reload); return; }
    const v = mainVideo();
    if (!v) { note(L().noVideo); return; }
    try { capture(v); } catch (e) { console.warn("Fact Checker:", e); finish(); note(L().failed); return; }
    mode = "connecting";
    silentFor = 0;
    silentSent = false;
    paint();
    waitTimer = setTimeout(() => { if (mode === "connecting") { finish(); note(L().noPanel); } }, WAIT_MS);
    // Tło otwiera panel (to kliknięcie jest gestem użytkownika), panel łączy się z tą kartą przez port.
    try { chrome.runtime.sendMessage({ type: "fc-media-listen" }).catch(() => {}); } catch { finish(); note(L().reload); }
  }
  // Koniec słuchania: ponowne kliknięcie, Stop w panelu (rozłączony port), zamknięty panel.
  function finish() {
    clearTimeout(waitTimer);
    const p = port;
    port = null;
    try { p?.disconnect(); } catch { /* już rozłączony */ }
    if (cap) {
      cap.src?.disconnect();
      cap.stream?.removeEventListener("addtrack", relink);
      cap.ctx.close().catch(() => {});
    }
    cap = null;
    buf = [];
    mode = "idle";
    paint();
  }
  function onConnect(p) {
    if (p.name !== "fc-media") return;
    if (mode === "idle" || !cap) { p.postMessage({ type: "gone" }); p.disconnect(); return; }
    try { port?.disconnect(); } catch { /* poprzedni panel */ }
    port = p;
    clearTimeout(waitTimer);
    mode = "listening";
    paint();
    p.postMessage({ type: "hello", url: location.href });
    for (const m of buf) p.postMessage(m);
    buf = [];
    p.onMessage.addListener((m) => { if (m?.type === "stop") finish(); });
    p.onDisconnect.addListener(() => { if (port === p) finish(); });
  }
  // Tło albo panel: „nie zaczynam” (panel się nie otworzył, błąd ustawień).
  function onMessage(msg) {
    if (msg?.type !== "fc-media-cancel") return;
    if (mode === "connecting") { finish(); if (msg.reason === "noPanel") note(L().noPanel); }
  }

  function note(text) {
    const n = document.createElement("fc-post-note");
    n.style.cssText = "all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483647;max-width:380px;background:#17191c;color:#fff;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);";
    n.textContent = text;
    document.documentElement.append(n);
    setTimeout(() => n.remove(), 6000);
  }

  // ---------- start / stop skryptu ----------
  let running = false, poll = 0;
  function tick() {
    if (!alive()) { stop(); return; }
    ensureButton();
    if (cap) {
      const v = mainVideo();
      if (v && v !== cap.video) { cap.stream?.removeEventListener("addtrack", relink); cap.src?.disconnect(); attach(v); } // nowy element filmu
      else relink();
    }
  }
  function start() {
    if (running || !alive()) return;
    running = true;
    document.querySelectorAll(TAG).forEach((n) => { if (n.dataset.fcGen !== GEN) n.remove(); });
    try {
      chrome.storage.local.get("settings").then(({ settings }) => applyLang(settings?.uiLang)).catch(() => {});
      chrome.storage.onChanged.addListener(onStorage);
      chrome.runtime.onConnect.addListener(onConnect);
      chrome.runtime.onMessage.addListener(onMessage);
    } catch { /* poza wtyczką */ }
    tick();
    poll = setInterval(tick, 1000);
  }
  function stop() {
    running = false;
    clearInterval(poll);
    finish();
    try {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onConnect.removeListener(onConnect);
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch { /* wtyczka przeładowana */ }
    btn?.h.remove();
    btn = null;
  }

  globalThis.__fcMedia = { version: VERSION, gen: GEN, alive, start, stop, state: () => ({ mode, button: !!btn?.h.isConnected }) };
  start();
})();
