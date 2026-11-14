// Fact Checker – ikonka „Sprawdź fakty” przy postach na Facebooku i X oraz ramka z wynikiem pod postem.
// Opcja w ustawieniach, domyślnie WYŁĄCZONA; działa dopiero po zgodzie przeglądarki na facebook.com / x.com.
// Ikonka pojawia się dopiero po najechaniu na post – w prawym górnym rogu, na lewo od „…” (menu posta) – i nie
// zmienia układu strony (leży nad nią). Ten skrypt sam niczego nie czyta i niczego nie wysyła: śledzi tylko, nad
// którym postem jest kursor, i czeka na kliknięcie. Dopiero kliknięcie mówi tłu, KTÓRY post sprawdzić – treść pobiera
// zwykły skrypt strony (content/page.js), tak samo jak przy „Wskaż post”. Wynik przysyła panel (gotowy HTML i style
// wtyczki); ramka i przycisk siedzą w zamkniętym Shadow DOM – serwis nie zmienia ich wyglądu i nie czyta wyniku.
(() => {
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const VERSION = (() => { try { return chrome.runtime.getManifest().version; } catch { return ""; } })();

  // Już działa (ponowne wstrzyknięcie po włączeniu opcji) → tylko upewniamy się, że jest uruchomiony.
  // Instancja ze starej wersji wtyczki (po aktualizacji) – sprzątamy ją i startujemy od nowa.
  const prev = globalThis.__fcButtons;
  if (prev?.alive?.() && prev.version === VERSION) { prev.start(); return; }
  try { prev?.stop?.(); } catch { /* stara instancja */ }

  const host = location.hostname.replace(/^www\./, "");
  const isX = /(^|\.)(x|twitter)\.com$/.test(host);
  const isFB = /(^|\.)facebook\.com$/.test(host);
  if (!isX && !isFB) return;

  const GEN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const TAG = "fc-post-btn";
  const FRAME = "fc-post-result";
  const MINE = `${TAG}[data-fc-gen="${GEN}"]`;
  // Treść posta na Facebooku – te same znaczniki, których używa „Wskaż post” (page.js).
  const FB_MSG = '[data-ad-preview="message"], [data-ad-comet-preview="message"]';
  const FB_MSG2 = '[data-ad-rendering-role="story_message"]';
  const LOADING_MS = 4 * 60_000; // bez odpowiedzi panelu tyle czasu → przycisk wraca do „Sprawdź fakty”

  // ---------- teksty (język interfejsu z ustawień wtyczki) ----------
  const DICT = {
    pl: {
      title: "Sprawdź ten post w Fact Checkerze", label: "Sprawdź fakty", checking: "Sprawdzam…", hide: "Ukryj", show: "Pokaż wynik",
      reload: "Fact Checker został zaktualizowany – odśwież stronę, żeby znów sprawdzać posty jednym kliknięciem.",
    },
    en: {
      title: "Fact-check this post", label: "Fact-check", checking: "Checking…", hide: "Hide", show: "Show result",
      reload: "Fact Checker was updated – reload the page to check posts with one click again.",
    },
  };
  const uiLang = () => { try { return chrome.i18n.getUILanguage(); } catch { return navigator.language || "en"; } };
  let lang = /^pl\b/i.test(uiLang()) ? "pl" : "en";
  const L = () => DICT[lang] || DICT.en;
  const applyLang = (pref) => {
    const next = pref === "pl" || pref === "en" ? pref : /^pl\b/i.test(uiLang()) ? "pl" : "en";
    if (next !== lang) { lang = next; relabel(); }
  };
  // Język z ustawień wtyczki podaje tło (skrypty na stronach nie mają dostępu do zapisanych danych wtyczki).
  try {
    chrome.runtime.sendMessage({ type: "fc-ui-lang" }).then((r) => applyLang(r?.lang)).catch(() => {});
    chrome.runtime.onMessage.addListener((m) => { if (m?.type === "fc-ui-lang" && alive()) applyLang(m.lang); });
  } catch { /* poza wtyczką */ }

  // Motyw strony (X i Facebook mają własny tryb ciemny, niezależny od systemu) – po jasności tła.
  function pageTheme() {
    for (const el of [document.body, document.documentElement]) {
      const m = el && getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (!m || m[4] === "0") continue;
      return (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) < 128 ? "dark" : "light";
    }
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  // ---------- posty ----------
  // Ta sama logika co postOf w page.js: tweet; na FB role="article" (komentarze to zagnieżdżone role="article"),
  // a gdy go brak – element listy w kanale (aria-posinset).
  function postRoot(el) {
    if (!el?.closest) return null;
    if (isX) return el.closest('article[data-testid="tweet"]') || el.closest("article");
    return el.closest('[role="article"]') || el.closest("[aria-posinset]");
  }
  // Komentarz albo udostępniony post w środku innego posta – przycisk tylko dla posta „z wierzchu”.
  const nested = (root) => !!root.parentElement?.closest(isX ? "article" : '[role="article"]');
  const own = (root, sel) => [...root.querySelectorAll(sel)].filter((n) => postRoot(n) === root);
  const outermost = (list) => list.find((m) => !list.some((o) => o !== m && o.contains(m))) || null;

  // Post „z wierzchu” pod kursorem: z komentarza albo udostępnionego posta przechodzimy do posta, w którym siedzi.
  // Na FB post w kanale bywa bez role="article", a jego komentarze je mają – komentarz poznajemy po tym, że nie
  // zaczyna się na górze elementu listy kanału (aria-posinset).
  function topPost(el) {
    let root = postRoot(el);
    while (root && nested(root)) root = postRoot(root.parentElement);
    if (root && isFB && root.matches('[role="article"]')) {
      const item = root.parentElement?.closest("[aria-posinset]");
      if (item && !item.closest('[role="article"]') && root.getBoundingClientRect().top - item.getBoundingClientRect().top > 40) return item;
    }
    return root;
  }
  // Tekst posta na Facebooku – pod nim stanie ramka z wynikiem.
  function fbMessage(root) {
    let msgs = own(root, FB_MSG);
    if (!msgs.length) msgs = own(root, FB_MSG2);
    return outermost(msgs);
  }
  // Menu posta „…” w prawym górnym rogu (X: data-testid="caret"; FB: przycisk z menu w nagłówku posta) i lewa
  // krawędź grupy przycisków obok niego (X: ikonka Groka, FB: np. „Dołącz”) – ikonka staje na lewo od nich.
  const FB_MENU = '[aria-haspopup="menu"], [aria-label="Działania dla tego posta"], [aria-label="Actions for this post"]';
  function menuAnchor(root) {
    const r = root.getBoundingClientRect();
    let menu = null, mr = null;
    for (const m of root.querySelectorAll(isX ? '[data-testid="caret"]' : FB_MENU)) {
      if (isX && postRoot(m) !== root) continue;
      const b = m.getBoundingClientRect();
      if (!b.width || !b.height || b.top - r.top > 110 || r.right - b.right > 140) continue; // tylko prawy róg nagłówka
      if (!mr || b.top < mr.top - 2 || (Math.abs(b.top - mr.top) <= 2 && b.left < mr.left)) { menu = m; mr = b; }
    }
    if (!menu) return null;
    const cy = mr.top + mr.height / 2;
    const near = [...root.querySelectorAll('[role="button"], button, a[href]')]
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter(({ el, b }) => el !== menu && !el.contains(menu) && !menu.contains(el) && b.width > 0 && b.width < 140 && b.top <= cy && b.bottom >= cy);
    let left = { el: menu, x: mr.left };
    for (let moved = true; moved;) {
      moved = false;
      for (const n of near) if (n.b.left < left.x && n.b.right <= left.x + 1 && left.x - n.b.right <= 12) { left = { el: n.el, x: n.b.left }; moved = true; }
    }
    return { menu, left: left.el };
  }
  // Czy pod kursorem jest coś, co warto sprawdzać (tekst albo większy obrazek).
  function worthIt(root) {
    if ((root.innerText || "").trim().length >= 20) return true;
    return [...root.querySelectorAll("img, video, canvas")].some((m) => {
      const r = m.getBoundingClientRect();
      return r.width >= 100 && r.height >= 80;
    });
  }

  // ---------- przycisk ----------
  // Ikony Lucide (ISC): shield-check, loader-circle. Kolory – wartości tokenów wtyczki (fc-tokens.css: akcent).
  const SVG = (paths, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICON_CHECK = SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>');
  const ICON_SPIN = SVG('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>', "spin");
  const SIZE = 30;
  const CSS = `
    :host { all: initial; --acc: oklch(0.47 0.17 263); --soft: oklch(0.95 0.025 263); --txt: oklch(0.44 0.17 263); --on: oklch(0.99 0 0); --surface: oklch(1 0 0); }
    :host([data-theme="dark"]) { --acc: oklch(0.72 0.13 263); --soft: oklch(0.3 0.06 263); --txt: oklch(0.78 0.12 263); --on: oklch(0.17 0.03 263); --surface: oklch(0.205 0.016 262); }
    button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; white-space: nowrap;
      font: 600 12px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--txt); transition: background-color .12s, color .12s; }
    button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    svg { flex: none; width: 14px; height: 14px; }
    .float { width: ${SIZE}px; height: ${SIZE}px; justify-content: center; border-radius: 50%; color: var(--acc); background: var(--soft);
      border: 1px solid color-mix(in oklab, var(--acc) 35%, transparent); box-shadow: 0 1px 5px rgba(0, 0, 0, .18); animation: in .12s ease-out; }
    .float svg { width: 17px; height: 17px; }
    .float:hover, .float[aria-expanded="true"] { background: var(--acc); color: var(--on); }
    .float[aria-busy="true"] { cursor: progress; }
    @keyframes in { from { opacity: 0; transform: scale(.85); } }
    .spin { animation: spin .9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spin, .float { animation: none; } }
  `;
  const parts = new WeakMap(); // host przycisku → { b }
  const posts = new WeakMap(); // post → { state: idle|loading|open|hidden, frame, shadow, timer, worth }
  const info = (root) => { let p = posts.get(root); if (!p) { p = { state: "idle" }; posts.set(root, p); } return p; };
  function makeButton() {
    const h = document.createElement(TAG);
    h.dataset.fcGen = GEN;
    h.dataset.theme = pageTheme();
    h.style.cssText = "position:fixed;display:none;z-index:2147483645;";
    const sh = h.attachShadow({ mode: "closed" });
    const st = document.createElement("style");
    st.textContent = CSS;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "float";
    // Kliknięcie nie może dojść do serwisu (X otwiera tweet po kliknięciu gdziekolwiek w nim).
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "auxclick"]) b.addEventListener(t, (e) => e.stopPropagation());
    // tylko prawdziwe kliknięcie (mysz, klawiatura) – zdarzenie wywołane skryptem strony nic nie robi
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!e.isTrusted) return;
      if (hover.root) press(hover.root);
    });
    sh.append(st, b);
    parts.set(h, { b });
    paintButton(h);
    return h;
  }
  // Wygląd przycisku według stanu posta: Sprawdź fakty → Sprawdzam… → Ukryj ⇄ Pokaż wynik.
  function paintButton(h) {
    const p = parts.get(h);
    if (!p) return;
    const state = hover.root ? info(hover.root).state : "idle";
    const text = { idle: L().label, loading: L().checking, open: L().hide, hidden: L().show }[state];
    p.b.innerHTML = state === "loading" ? ICON_SPIN : ICON_CHECK; // stałe ikony wtyczki
    p.b.title = state === "idle" ? L().title : `Fact Checker: ${text}`;
    p.b.setAttribute("aria-label", state === "idle" ? L().title : text);
    p.b.setAttribute("aria-busy", String(state === "loading"));
    if (state === "open" || state === "hidden") p.b.setAttribute("aria-expanded", String(state === "open"));
    else p.b.removeAttribute("aria-expanded");
  }
  const repaint = (root) => { if (hover.h && hover.root === root) paintButton(hover.h); };
  function relabel() {
    if (hover.h) paintButton(hover.h);
  }
  function setState(root, state) {
    const p = info(root);
    p.state = state;
    clearTimeout(p.timer);
    if (state === "loading") p.timer = setTimeout(() => { if (info(root).state === "loading") setState(root, p.frame ? "open" : "idle"); }, LOADING_MS);
    if (p.frame) p.frame.style.display = state === "open" ? "block" : "none";
    repaint(root);
  }

  // ---------- kliknięcie → tło ----------
  // Tło pobiera post przez page.js (ten sam świat skryptu – stąd odbiera wskazany element po tokenie).
  const pending = new Map();
  let seq = 0;
  function press(root) {
    const p = info(root);
    if (p.state === "loading") return;
    if (p.state === "open") { setState(root, "hidden"); return; }
    if (p.state === "hidden") { setState(root, "open"); return; }
    if (!alive()) { stop(); note(L().reload); return; }
    const token = `${GEN}-${++seq}`;
    pending.set(token, root);
    while (pending.size > 20) pending.delete(pending.keys().next().value);
    try {
      chrome.runtime.sendMessage({ type: "fc-post-button", token }).catch(() => {});
    } catch {
      stop();
      note(L().reload);
      return;
    }
    setState(root, "loading");
  }
  function take(token) {
    const el = pending.get(token) || null;
    pending.delete(token);
    return el?.isConnected ? el : null;
  }

  // ---------- ramka z wynikiem pod postem ----------
  // Panel przysyła gotowy HTML (treść wstawiona jako tekst, bez skryptów) i style wtyczki; przyciski w ramce
  // wołają panel przez tło (kopiuj odpowiedź, szczegóły w panelu).
  function frameAnchor(root) {
    if (isX) { const bar = own(root, '[role="group"]').at(-1); if (bar) return { el: bar, where: "after" }; }
    const msg = isFB && fbMessage(root);
    if (msg) return { el: msg, where: "after" };
    const comment = [...root.querySelectorAll('[role="article"]')][0];
    return comment ? { el: comment, where: "before" } : { el: root, where: "append" };
  }
  function showResult(root, { html = "", css = "", captureId = "", reset = false } = {}) {
    if (!root?.isConnected) return false;
    const p = info(root);
    if (reset) { setState(root, p.frame?.isConnected ? "open" : "idle"); return true; }
    if (!p.frame?.isConnected) {
      const f = document.createElement(FRAME);
      f.dataset.fcGen = GEN;
      f.style.cssText = "display:block;margin:10px 0 4px;max-width:100%;";
      for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick"]) f.addEventListener(t, (e) => e.stopPropagation());
      p.frame = f;
      p.shadow = f.attachShadow({ mode: "closed" });
      const a = frameAnchor(root);
      if (a.where === "after") a.el.after(f); else if (a.where === "before") a.el.before(f); else a.el.append(f);
    }
    p.frame.dataset.theme = pageTheme();
    p.shadow.innerHTML = `<style>${css}</style>${html}`; // HTML z panelu wtyczki – dane już jako tekst
    p.shadow.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault();
      if (!e.isTrusted) return;
      const act = b.dataset.act;
      if (act === "close") { setState(root, "hidden"); return; }
      if (!alive()) { note(L().reload); return; }
      try { chrome.runtime.sendMessage({ type: "fc-inject-act", act, captureId }).catch(() => {}); } catch { note(L().reload); }
    }));
    setState(root, "open");
    return true;
  }

  // Komunikat w rogu (np. po aktualizacji wtyczki, gdy ta kopia skryptu już nie działa).
  function note(text) {
    const n = document.createElement("fc-post-note");
    n.style.cssText = "all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483647;max-width:380px;background:#17191c;color:#fff;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);";
    n.textContent = text;
    document.documentElement.append(n);
    setTimeout(() => n.remove(), 6000);
  }

  // ---------- ikonka po najechaniu na post ----------
  // Jedna ikonka na stronie, nad postem pod kursorem: na lewo od „…”; gdy menu nie ma – w prawym górnym rogu posta,
  // pod nagłówkiem. Chowa się, gdy zjedziesz z posta albo gdy jej miejsce zasłania pasek serwisu (przewijanie).
  const hover = { h: null, root: null, anchor: null, hideTimer: 0, frame: 0, lastTarget: null };
  function place() {
    if (!hover.h || !hover.root?.isConnected) return hide();
    const a = hover.anchor;
    let top, left;
    if (a?.menu?.isConnected && a.left.isConnected) {
      const mr = a.menu.getBoundingClientRect();
      if (!mr.width) return soft(false);
      top = mr.top + mr.height / 2 - SIZE / 2;
      left = a.left.getBoundingClientRect().left - SIZE - 6;
    } else {
      const r = hover.root.getBoundingClientRect();
      // pod nagłówkiem posta (autor) – żeby nie zasłaniać przycisków serwisu; krótki post – na środku wysokości
      top = r.top + Math.min(60, Math.max(8, (r.height - SIZE) / 2));
      left = Math.min(r.right, innerWidth) - SIZE - 12;
      if (r.bottom - top < SIZE + 4) return soft(false);
    }
    if (top < 0 || top + SIZE > innerHeight || left < 0) return soft(false);
    Object.assign(hover.h.style, { top: `${top}px`, left: `${left}px` });
    // miejsce zasłonięte (górny pasek serwisu nad przewiniętym postem) → nie pokazujemy
    const under = document.elementsFromPoint(left + SIZE / 2, top + SIZE / 2).find((n) => n !== hover.h);
    soft(!under || hover.root.contains(under));
  }
  const soft = (on) => { if (hover.h) hover.h.style.display = on ? "block" : "none"; };
  function hide() {
    soft(false);
    hover.root = null;
    hover.anchor = null;
  }
  function onMove(e) {
    hover.lastTarget = e.target;
    if (hover.frame) return;
    hover.frame = requestAnimationFrame(() => {
      hover.frame = 0;
      const t = hover.lastTarget;
      if (t === hover.h) { clearTimeout(hover.hideTimer); return; }
      const root = topPost(t);
      if (root && root !== hover.root) {
        const p = info(root);
        p.worth ??= worthIt(root);
        if (!p.worth) { clearTimeout(hover.hideTimer); if (hover.root) hover.hideTimer = setTimeout(hide, 300); return; }
      }
      if (!root) {
        clearTimeout(hover.hideTimer);
        if (hover.root) hover.hideTimer = setTimeout(hide, 300);
        return;
      }
      clearTimeout(hover.hideTimer);
      if (!hover.h) { hover.h = makeButton(); document.documentElement.append(hover.h); }
      if (root !== hover.root) {
        hover.root = root;
        hover.anchor = menuAnchor(root);
        hover.h.dataset.theme = pageTheme();
        paintButton(hover.h);
      }
      place();
    });
  }
  const onScroll = () => { if (hover.root) place(); };

  let running = false;
  function start() {
    if (running || !alive()) return;
    running = true;
    // przyciski i ramki po poprzedniej kopii skryptu (np. sprzed aktualizacji wtyczki)
    document.querySelectorAll(`${TAG}, ${FRAME}`).forEach((n) => { if (n.dataset.fcGen !== GEN) n.remove(); });
    addEventListener("mousemove", onMove, { capture: true, passive: true });
    addEventListener("scroll", onScroll, { capture: true, passive: true });
    addEventListener("resize", onScroll, { passive: true });
  }
  function stop() {
    running = false;
    clearTimeout(hover.hideTimer);
    removeEventListener("mousemove", onMove, { capture: true });
    removeEventListener("scroll", onScroll, { capture: true });
    removeEventListener("resize", onScroll);
    document.querySelectorAll(`${MINE}, ${FRAME}[data-fc-gen="${GEN}"]`).forEach((n) => n.remove());
    hover.h = null;
    hover.root = null;
    hover.anchor = null;
    pending.clear();
  }

  globalThis.__fcButtons = {
    version: VERSION, gen: GEN, alive, start, stop, take, showResult,
    count: () => document.querySelectorAll(MINE).length,
  };
  start();
})();
