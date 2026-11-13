// Fact Checker – ikonka „Sprawdź fakty” przy tytule artykułu i znaczek z oceną po sprawdzeniu.
// Opcja w ustawieniach, domyślnie WYŁĄCZONA; działa tylko na serwisach, które wybierzesz (albo wszędzie – jeśli tak
// ustawisz), i dopiero po zgodzie przeglądarki. Ten skrypt sam niczego nie czyta i niczego nie wysyła: po budowie
// strony (og:type, schema.org, nagłówek h1) rozpoznaje, czy to artykuł, i po najechaniu na tytuł pokazuje ikonkę.
// Dopiero kliknięcie mówi tłu „sprawdź ten artykuł” – treść pobiera zwykły skrypt strony (content/page.js), tak samo
// jak „Sprawdź artykuł” w menu. Po sprawdzeniu przy tytule staje znaczek z oceną całości; przy następnej wizycie
// znaczek wraca od razu (ocena zapamiętana w wtyczce, gdy pamięć werdyktów jest włączona). Przycisk i znaczek siedzą
// w zamkniętym Shadow DOM – serwis nie zmienia ich wyglądu i ich nie czyta.
(() => {
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const VERSION = (() => { try { return chrome.runtime.getManifest().version; } catch { return ""; } })();

  const prev = globalThis.__fcArticles;
  if (prev?.alive?.() && prev.version === VERSION) { prev.start(); return; }
  try { prev?.stop?.(); } catch { /* stara instancja (sprzed aktualizacji wtyczki) */ }

  // Na Facebooku i X są ikonki przy postach (content/buttons.js).
  if (/(^|\.)(facebook|x|twitter)\.com$/.test(location.hostname)) return;

  const GEN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const BTN = "fc-article-btn";
  const MARK = "fc-article-mark";
  const SIZE = 28;
  const LOADING_MS = 4 * 60_000; // bez odpowiedzi panelu tyle czasu → znaczek „Sprawdzam…” znika

  // ---------- teksty (język interfejsu z ustawień wtyczki) ----------
  const DICT = {
    pl: {
      title: "Sprawdź ten artykuł w Fact Checkerze", checking: "Sprawdzam…",
      mark: "Fact Checker – ocena: {label}. Kliknij, aby zobaczyć szczegóły w panelu.",
      markOld: "Fact Checker – ocena: {label} (sprawdzone {date}). Kliknij, aby zobaczyć szczegóły w panelu.",
      reload: "Fact Checker został zaktualizowany – odśwież stronę, żeby znów sprawdzać artykuły jednym kliknięciem.",
    },
    en: {
      title: "Fact-check this article", checking: "Checking…",
      mark: "Fact Checker rating: {label}. Click to see the details in the panel.",
      markOld: "Fact Checker rating: {label} (checked {date}). Click to see the details in the panel.",
      reload: "Fact Checker was updated – reload the page to check articles with one click again.",
    },
  };
  const uiLang = () => { try { return chrome.i18n.getUILanguage(); } catch { return navigator.language || "en"; } };
  let lang = /^pl\b/i.test(uiLang()) ? "pl" : "en";
  const L = () => DICT[lang] || DICT.en;
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
  const applyLang = (pref) => {
    const next = pref === "pl" || pref === "en" ? pref : /^pl\b/i.test(uiLang()) ? "pl" : "en";
    if (next !== lang) { lang = next; if (cur.mark?.state === "done") askMark(); else paintAll(); }
  };
  const onStorage = (ch) => { if (ch.settings && alive()) applyLang(ch.settings.newValue?.uiLang); };

  // ---------- czy to artykuł i gdzie jest jego tytuł ----------
  const ARTICLE_TYPE = /^(schema:)?(Article|NewsArticle|ReportageNewsArticle|AnalysisNewsArticle|OpinionNewsArticle|BackgroundNewsArticle|ReviewNewsArticle|AskPublicNewsArticle|SatiricalArticle|LiveBlogPosting|BlogPosting|Report)$/i;
  const meta = (sel) => document.querySelector(sel)?.getAttribute("content")?.trim() || "";
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKC").replace(/[\s ]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  function ldArticle() {
    let found = null;
    const visit = (o, depth) => {
      if (found || !o || typeof o !== "object" || depth > 6) return;
      if (Array.isArray(o)) { for (const x of o) visit(x, depth + 1); return; }
      const types = [].concat(o["@type"] || []);
      if (types.some((x) => typeof x === "string" && ARTICLE_TYPE.test(x))) {
        found = { headline: typeof o.headline === "string" ? o.headline : typeof o.name === "string" ? o.name : "" };
        return;
      }
      if (o["@graph"]) visit(o["@graph"], depth + 1);
      if (o.mainEntity) visit(o.mainEntity, depth + 1);
      if (o.mainEntityOfPage && typeof o.mainEntityOfPage === "object") visit(o.mainEntityOfPage, depth + 1);
    };
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { visit(JSON.parse(s.textContent), 0); } catch { /* błędny JSON na stronie */ }
      if (found) break;
    }
    return found;
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 12) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.1;
  };
  const titleMatch = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const [s, l] = a.length < b.length ? [a, b] : [b, a];
    return (l.includes(s) && s.length >= Math.max(12, l.length * 0.5)) || (s.length >= 30 && l.startsWith(s.slice(0, 30)));
  };
  const SIDE = "nav, footer, aside, [role='navigation'], [role='contentinfo'], [role='banner'], [role='complementary'], [aria-hidden='true']";
  const MAIN = "article, main, [role='main'], [itemprop='articleBody']";
  function findHeadline(titles) {
    let best = null, bestScore = -Infinity;
    for (const el of document.querySelectorAll("h1, [itemprop='headline']")) {
      if (el.closest(`${BTN}, ${MARK}`)) continue;
      const text = norm(el.textContent);
      if (text.length < 12 || text.length > 400 || !visible(el)) continue;
      let score = 0;
      if (titles.some((x) => titleMatch(text, x))) score += 50;
      if (el.closest(MAIN)) score += 20;
      if (el.closest(SIDE)) score -= 60;
      if (el.localName === "h1") score += 10;
      score += Math.min(40, parseFloat(getComputedStyle(el).fontSize) || 0) / 2;
      if (score > bestScore) { best = el; bestScore = score; }
    }
    return bestScore >= 25 ? best : null;
  }
  // Strona główna serwisu (/, /pl/, /index.html) to nie artykuł – tam są tylko zajawki.
  const isHome = () => /^\/((index|default)\.(html?|php|aspx?))?$|^\/[a-z]{2}(-[a-z]{2})?\/?$/i.test(location.pathname);
  function detect() {
    if (isHome()) return null;
    const og = /^article\b/i.test(meta('meta[property="og:type"]'));
    const ld = ldArticle();
    const micro = !!document.querySelector('[itemtype*="schema.org/NewsArticle" i], [itemtype*="schema.org/Article" i], [itemtype*="schema.org/BlogPosting" i], [itemtype*="schema.org/ReportageNewsArticle" i]');
    const titles = [ld?.headline, meta('meta[property="og:title"]'), meta('meta[name="twitter:title"]'), document.title.split(/\s[|–—-]\s/)[0], document.title]
      .map(norm).filter((x) => x.length >= 12);
    const h = findHeadline(titles);
    if (!h) return null;
    if (og || ld || micro) return h;
    // Bez znaczników artykułu: nagłówek w <article>/<main> i kilka dłuższych akapitów obok – inaczej to nie artykuł.
    const box = h.closest(MAIN) || h.parentElement?.closest("article, main") || null;
    if (!box) return null;
    let long = 0;
    for (const p of box.querySelectorAll("p")) if (p.textContent.trim().length >= 80 && ++long >= 3) return h;
    return null;
  }
  const canonical = () => document.querySelector('link[rel="canonical"]')?.href || meta('meta[property="og:url"]') || "";
  const samePage = (url) => {
    try { const u = new URL(url); return u.origin === location.origin && u.pathname.replace(/\/+$/, "") === location.pathname.replace(/\/+$/, ""); } catch { return false; }
  };

  // ---------- wygląd ----------
  function pageTheme() {
    for (const el of [document.body, document.documentElement]) {
      const m = el && getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (!m || m[4] === "0") continue;
      return (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) < 128 ? "dark" : "light";
    }
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  // Ikony Lucide (ISC): shield-check, loader-circle. Kolory – tokeny wtyczki (fc-tokens.css).
  const SVG = (paths, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICON_CHECK = SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>');
  const ICON_SPIN = SVG('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>', "spin");
  const CSS = `
    :host { all: initial; --acc: oklch(0.47 0.17 263); --soft: oklch(0.95 0.025 263); --txt: oklch(0.44 0.17 263); --on: oklch(0.99 0 0);
      --good: oklch(0.5 0.13 150); --good-bg: oklch(0.95 0.04 150); --warn: oklch(0.5 0.12 70); --warn-bg: oklch(0.95 0.05 85);
      --bad: oklch(0.52 0.18 27); --bad-bg: oklch(0.95 0.035 27); --muted: oklch(0.45 0.02 263); --muted-bg: oklch(0.95 0.008 263); }
    :host([data-theme="dark"]) { --acc: oklch(0.72 0.13 263); --soft: oklch(0.3 0.06 263); --txt: oklch(0.78 0.12 263); --on: oklch(0.17 0.03 263);
      --good: oklch(0.8 0.13 150); --good-bg: oklch(0.3 0.05 150); --warn: oklch(0.83 0.12 85); --warn-bg: oklch(0.32 0.05 85);
      --bad: oklch(0.78 0.13 27); --bad-bg: oklch(0.32 0.07 27); --muted: oklch(0.8 0.02 263); --muted-bg: oklch(0.3 0.015 263); }
    button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; white-space: nowrap;
      font: 600 12px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; transition: background-color .12s, color .12s; }
    button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    svg { flex: none; width: 14px; height: 14px; }
    .float { width: ${SIZE}px; height: ${SIZE}px; justify-content: center; border-radius: 50%; color: var(--acc); background: var(--soft);
      border: 1px solid color-mix(in oklab, var(--acc) 35%, transparent); box-shadow: 0 1px 5px rgba(0, 0, 0, .18); animation: in .12s ease-out; }
    .float svg { width: 16px; height: 16px; }
    .float:hover { background: var(--acc); color: var(--on); }
    .mark { height: 24px; padding: 0 10px 0 8px; border-radius: 999px; color: var(--c, var(--txt)); background: var(--b, var(--soft));
      border: 1px solid color-mix(in oklab, var(--c, var(--acc)) 30%, transparent); max-width: 320px; animation: in .12s ease-out; }
    .mark span { overflow: hidden; text-overflow: ellipsis; }
    .mark:hover { border-color: var(--c, var(--acc)); }
    .mark[aria-busy="true"] { cursor: progress; }
    .mark[data-tone="good"] { --c: var(--good); --b: var(--good-bg); }
    .mark[data-tone="warn"] { --c: var(--warn); --b: var(--warn-bg); }
    .mark[data-tone="bad"] { --c: var(--bad); --b: var(--bad-bg); }
    .mark[data-tone="muted"] { --c: var(--muted); --b: var(--muted-bg); }
    @keyframes in { from { opacity: 0; transform: scale(.85); } }
    .spin { animation: spin .9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spin, .float, .mark { animation: none; } }
  `;
  const stopAll = (el) => { for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "auxclick"]) el.addEventListener(t, (e) => e.stopPropagation()); };
  function shadowButton(tag, cls, onClick) {
    const h = document.createElement(tag);
    h.dataset.fcGen = GEN;
    const sh = h.attachShadow({ mode: "closed" });
    const st = document.createElement("style");
    st.textContent = CSS;
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    stopAll(b);
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    sh.append(st, b);
    return { h, b };
  }

  // ---------- stan strony ----------
  // href – adres, dla którego rozpoznaliśmy artykuł; h – element tytułu; mark – znaczek (loading | done).
  const cur = { href: "", h: null, tries: 0, mark: null, badge: null, timer: 0 };
  const hover = { btn: null, on: false, hideTimer: 0, frame: 0, x: 0, y: 0, target: null };

  function note(text) {
    const n = document.createElement("fc-post-note");
    n.style.cssText = "all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483647;max-width:380px;background:#17191c;color:#fff;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);";
    n.textContent = text;
    document.documentElement.append(n);
    setTimeout(() => n.remove(), 6000);
  }
  function send(msg) {
    if (!alive()) { stop(); note(L().reload); return false; }
    try { chrome.runtime.sendMessage(msg).catch(() => {}); return true; } catch { stop(); note(L().reload); return false; }
  }

  // Kliknięcie ikonki: tło otwiera panel (gest użytkownika) i pobiera artykuł przez page.js.
  function press() {
    if (!cur.h || cur.mark?.state === "loading") return;
    if (!send({ type: "fc-article-button" })) return;
    setMark({ state: "loading" });
    hideBtn();
  }
  // Kliknięcie znaczka z oceną: szczegóły w panelu (gdy wynik jest w bieżącej sesji) albo sprawdzenie od nowa –
  // z pamięci werdyktów to chwila i 0 tokenów.
  function pressMark() {
    if (cur.mark?.state !== "done") return;
    send({ type: "fc-article-button", act: "panel", captureId: cur.mark.captureId || "" });
  }

  // ---------- znaczek przy tytule ----------
  function setMark(m) {
    clearTimeout(cur.timer);
    cur.mark = m;
    if (!m) { cur.badge?.remove(); cur.badge = null; return; }
    if (m.state === "loading") cur.timer = setTimeout(() => { if (cur.mark?.state === "loading") setMark(null); }, LOADING_MS);
    paintMark();
    attachMark();
  }
  function paintMark() {
    if (!cur.mark) return;
    if (!cur.badge) cur.badge = shadowButton(MARK, "mark", pressMark);
    const { h, b } = cur.badge;
    h.dataset.theme = pageTheme();
    const m = cur.mark;
    const loading = m.state === "loading";
    const label = loading ? L().checking : m.label || "";
    b.innerHTML = loading ? ICON_SPIN : ICON_CHECK; // stałe ikony wtyczki
    const span = document.createElement("span");
    span.textContent = label;
    b.append(span);
    b.dataset.tone = loading ? "" : m.tone || "muted";
    b.setAttribute("aria-busy", String(loading));
    const date = m.at && m.old ? new Date(m.at).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB") : "";
    b.title = loading ? `Fact Checker: ${label}` : fill(date ? L().markOld : L().mark, { label, date });
    b.setAttribute("aria-label", b.title);
  }
  // Znaczek stoi na końcu tytułu (w jego ostatniej linii); gdy tytuł jest linkiem – zaraz za linkiem.
  function attachMark() {
    const host = cur.badge?.h;
    if (!host || !cur.h?.isConnected) return;
    const link = cur.h.closest("a") || null;
    const spot = link && !cur.h.contains(link) ? link : cur.h;
    host.style.cssText = "all:initial !important;display:inline-block !important;vertical-align:middle !important;margin:0 0 0 10px !important;line-height:1 !important;";
    if (spot === cur.h ? host.parentNode !== cur.h : host.previousSibling !== spot) {
      if (spot === cur.h) cur.h.append(host); else spot.after(host);
    }
  }
  const paintAll = () => { paintMark(); };

  // Ocena zapamiętana przy wcześniejszym sprawdzeniu tego artykułu (pamięć werdyktów w ustawieniach).
  function askMark() {
    if (!alive() || !cur.h) return;
    const href = cur.href;
    try {
      chrome.runtime.sendMessage({ type: "fc-article-mark-get", url: location.href, canonical: canonical() }).then((r) => {
        if (href !== cur.href || cur.mark?.state === "loading" || !r?.mark) return;
        setMark({ state: "done", label: r.mark.label, tone: r.mark.tone, at: r.mark.at, old: true, captureId: "" });
      }).catch(() => {});
    } catch { /* wtyczka przeładowana */ }
  }
  // Wynik z panelu (przez page.js): { url, label, tone, captureId } albo { url, reset: true }.
  function mark(data = {}) {
    if (data.url && !samePage(data.url)) return false;
    if (!cur.h || cur.href !== location.href) refresh(true);
    if (!cur.h) return false;
    if (data.reset) { if (cur.mark?.state === "loading") setMark(null); return true; }
    setMark({ state: "done", label: String(data.label || ""), tone: String(data.tone || "muted"), at: Date.now(), old: false, captureId: String(data.captureId || "") });
    return true;
  }

  // ---------- ikonka po najechaniu na tytuł ----------
  function lineRects() {
    const r = document.createRange();
    r.selectNodeContents(cur.h);
    return [...r.getClientRects()].filter((x) => x.width > 1 && x.height > 4);
  }
  // Miejsca na ikonkę, po kolei: na końcu ostatniej linii tytułu; na lewo od pierwszej linii; nad tytułem z prawej.
  function spots() {
    const box = cur.h.getBoundingClientRect();
    const rects = lineRects();
    if (!rects.length) return [];
    const bottom = Math.max(...rects.map((x) => x.bottom));
    const last = rects.filter((x) => x.bottom > bottom - 4);
    const right = Math.max(...last.map((x) => x.right));
    const lastTop = Math.min(...last.map((x) => x.top));
    const maxX = Math.min(innerWidth, document.documentElement.clientWidth || innerWidth) - 4;
    const first = rects.reduce((a, b) => (b.top < a.top ? b : a));
    return [
      { left: right + 8, top: lastTop + (bottom - lastTop) / 2 - SIZE / 2 },
      { left: first.left - SIZE - 8, top: first.top + first.height / 2 - SIZE / 2 },
      { left: Math.min(box.right, maxX) - SIZE, top: box.top - SIZE - 4 },
    ].filter((s) => s.left >= 4 && s.left + SIZE <= maxX && s.top >= 0 && s.top + SIZE <= innerHeight);
  }
  // Miejsce jest wolne, gdy pod nim jest tytuł albo jego tło (kontener) – a nie np. przyklejony pasek serwisu.
  function free(s, self) {
    const under = document.elementsFromPoint(s.left + SIZE / 2, s.top + SIZE / 2).find((n) => n !== self);
    return !under || under === cur.h || cur.h.contains(under) || under.contains(cur.h);
  }
  function overHeadline(x, y) {
    if (!cur.h?.isConnected) return false;
    const b = cur.h.getBoundingClientRect();
    const p = hover.btn?.h.style.display === "block" ? hover.btn.h.getBoundingClientRect() : null;
    if (p && x >= p.left - 6 && x <= p.right + 6 && y >= p.top - 6 && y <= p.bottom + 6) return true;
    return x >= b.left - 8 && x <= b.right + 8 && y >= b.top - 6 && y <= b.bottom + 6;
  }
  function showBtn() {
    if (!hover.btn) {
      hover.btn = shadowButton(BTN, "float", press);
      hover.btn.h.style.cssText = "position:fixed;display:none;z-index:2147483645;";
      document.documentElement.append(hover.btn.h);
    }
    const { h, b } = hover.btn;
    const s = spots().find((x) => free(x, h));
    if (!s) { h.style.display = "none"; return; }
    h.dataset.theme = pageTheme();
    if (!b.firstChild) b.innerHTML = ICON_CHECK; // stała ikona wtyczki
    b.title = L().title;
    b.setAttribute("aria-label", L().title);
    Object.assign(h.style, { top: `${s.top}px`, left: `${s.left}px`, display: "block" });
  }
  function hideBtn() {
    clearTimeout(hover.hideTimer);
    if (hover.btn) hover.btn.h.style.display = "none";
    hover.on = false;
  }
  function onMove(e) {
    hover.x = e.clientX;
    hover.y = e.clientY;
    hover.target = e.target;
    if (hover.frame) return;
    hover.frame = requestAnimationFrame(() => {
      hover.frame = 0;
      if (cur.href !== location.href) refresh(true);
      if (!cur.h || cur.mark) { if (hover.on) hideBtn(); return; }
      const inside = hover.target === hover.btn?.h || overHeadline(hover.x, hover.y);
      if (inside) {
        clearTimeout(hover.hideTimer);
        hover.on = true;
        showBtn();
      } else if (hover.on) {
        clearTimeout(hover.hideTimer);
        hover.hideTimer = setTimeout(hideBtn, 300);
        hover.on = false;
      }
    });
  }
  const onScroll = () => { if (hover.btn?.h.style.display === "block") showBtn(); };

  // ---------- rozpoznawanie (także po przejściu do innego artykułu bez przeładowania strony) ----------
  let listening = false;
  function listen(on) {
    if (on === listening) return;
    listening = on;
    if (on) {
      addEventListener("mousemove", onMove, { capture: true, passive: true });
      addEventListener("scroll", onScroll, { capture: true, passive: true });
    } else {
      removeEventListener("mousemove", onMove, { capture: true });
      removeEventListener("scroll", onScroll, { capture: true });
      hideBtn();
    }
  }
  function refresh(force = false) {
    const href = location.href;
    if (href !== cur.href) {
      cur.href = href;
      cur.tries = 0;
      cur.h = null;
      setMark(null);
    } else if (cur.h?.isConnected && !force) {
      if (cur.badge && !cur.badge.h.isConnected) attachMark(); // serwis przerysował tytuł
      return;
    }
    if (cur.h && !cur.h.isConnected) cur.h = null;
    if (!cur.h && cur.tries < 8) { // strony dorysowują treść po załadowaniu – kilka prób po każdej zmianie adresu
      cur.tries++;
      const h = detect();
      if (h) {
        cur.h = h;
        if (cur.mark) attachMark(); else askMark();
      }
    }
    listen(!!cur.h);
  }

  let running = false, poll = 0;
  function start() {
    if (running || !alive()) return;
    running = true;
    document.querySelectorAll(`${BTN}, ${MARK}`).forEach((n) => { if (n.dataset.fcGen !== GEN) n.remove(); });
    try {
      chrome.storage.local.get("settings").then(({ settings }) => applyLang(settings?.uiLang)).catch(() => {});
      chrome.storage.onChanged.addListener(onStorage);
    } catch { /* poza wtyczką */ }
    refresh();
    poll = setInterval(() => { if (!alive()) { stop(); return; } refresh(); }, 1500);
  }
  function stop() {
    running = false;
    clearInterval(poll);
    listen(false);
    try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* wtyczka przeładowana */ }
    clearTimeout(cur.timer);
    document.querySelectorAll(`${BTN}[data-fc-gen="${GEN}"], ${MARK}[data-fc-gen="${GEN}"]`).forEach((n) => n.remove());
    hover.btn = null;
    Object.assign(cur, { href: "", h: null, tries: 0, mark: null, badge: null });
  }

  globalThis.__fcArticles = {
    version: VERSION, gen: GEN, alive, start, stop, mark,
    state: () => ({ article: !!cur.h, mark: cur.mark?.state || "" }),
  };
  start();
})();
