// Fact Checker – skrypt strony.
// Wstrzykiwany WYŁĄCZNIE po akcji użytkownika (menu pod prawym przyciskiem, skrót klawiszowy, przycisk w panelu).
// Nie czyta niczego sam z siebie i niczego nie wysyła bez wskazania: zwraca tylko zaznaczenie, treść artykułu
// albo wskazany post. Nie zmienia treści strony – podświetlenia to CSS Custom Highlight API (bez ingerencji w DOM).
(() => {
  if (globalThis.__fc) return;

  const roots = new Map(); // captureId -> element, w którym szukamy cytatów do podświetlenia
  const imageEls = new Map(); // captureId -> [elementy obrazków] (zrzut ekranu + ramki z werdyktem)
  const areaRects = new Map(); // captureId -> prostokąt wycinka w układzie dokumentu
  let seq = 0;
  const newId = (el) => {
    const id = `c${Date.now().toString(36)}${++seq}`;
    if (el) roots.set(id, el);
    return id;
  };

  const host = location.hostname.replace(/^www\./, "");
  const isX = /(^|\.)(x|twitter)\.com$/.test(host);
  const isFB = /(^|\.)facebook\.com$/.test(host);

  const clean = (s) => String(s || "")
    .replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  // Linie-przyciski z interfejsu serwisów społecznościowych (reakcje, liczniki, „Zobacz więcej”…).
  const UI_LINE = /^(lubię to!?|like|komentarz|skomentuj|comment|udostępnij|share|odpowiedz|reply|zobacz więcej|see more|wyświetl więcej|wszystkie reakcje:?|all reactions:?|obserwuj|follow|zobacz tłumaczenie|see translation|·|\d+([.,]\d+)?\s*(tys\.?|mln|k|m)?(\s*(komentarz\w*|udostępnie\w*|comments?|shares?))?)$/i;

  function pageMeta() {
    const m = (sel) => document.querySelector(sel)?.getAttribute("content")?.trim() || "";
    let author = m('meta[name="author"]') || m('meta[property="article:author"]');
    if (/^https?:/.test(author)) author = "";
    return {
      title: document.title,
      url: location.href,
      pageUrl: location.href,
      site: m('meta[property="og:site_name"]') || host,
      author,
      date: m('meta[property="article:published_time"]') || m('meta[name="date"]') || m('meta[itemprop="datePublished"]') || "",
    };
  }

  // ---------- posty ----------
  // Post rozpoznajemy po strukturze strony, nie po adresie: tweet (X), role="article" (Facebook, LinkedIn,
  // Reddit, Mastodon…). Zwykły <article> na portalach newsowych NIE jest postem – tam wskazuje się akapity.
  function postOf(el) {
    if (!el?.closest) return null;
    return el.closest('article[data-testid="tweet"]') || (isX ? el.closest("article") : null) || el.closest('[role="article"]')
      || (isFB ? el.closest("[aria-posinset]") : null); // kanał FB bez role="article" – element listy
  }
  const isTweet = (el) => el.matches('article[data-testid="tweet"]') || (isX && el.localName === "article");

  // ---------- obrazki ----------
  const MIN_IMG_W = 100, MIN_IMG_H = 80, MAX_IMGS = 4;
  const isMedia = (el) => /^(IMG|CANVAS|VIDEO|SVG)$/i.test(el?.tagName || "") || el?.getAttribute?.("role") === "img";
  const bigEnough = (el) => { const r = el.getBoundingClientRect(); return r.width >= MIN_IMG_W && r.height >= MIN_IMG_H; };
  // Obrazki w elemencie (bez awatarów/emoji i bez tych z zagnieżdżonych komentarzy), maks. 4.
  function imagesIn(el, post = null) {
    const list = [];
    const cands = isMedia(el) ? [el] : [...el.querySelectorAll("img, canvas, video, svg, [role='img']")];
    for (const im of cands) {
      if (post && postOf(im) !== post) continue;
      if (!bigEnough(im)) continue;
      if (list.some((x) => x.contains(im) || im.contains(x))) continue;
      list.push(im);
      if (list.length >= MAX_IMGS) break;
    }
    return list;
  }
  // Duży obrazek pod kursorem (poza postem) – sam jest „fragmentem” do sprawdzenia.
  function mediaOf(el) {
    for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) {
      if (isMedia(n) && bigEnough(n)) return n.closest("figure") || n;
      if (n.localName === "picture" || n.localName === "figure") { const im = n.querySelector("img, canvas, video, svg"); if (im && bigEnough(im)) return n; }
    }
    return null;
  }

  // Najbliższy sensowny blok tekstu pod kursorem (na X/FB – cały post).
  function blockOf(node) {
    let el = node?.nodeType === 1 ? node : node?.parentElement;
    const post = postOf(el);
    if (post) return post;
    const media = el && mediaOf(el);
    if (media) return media;
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.localName === "fc-overlay" || el.localName === "fc-tip") return null;
      const len = (el.innerText || "").trim().length;
      if (/^(ARTICLE|BLOCKQUOTE|P|LI|SECTION|ASIDE|FIGURE|TD|DD|H[1-6]|PRE)$/.test(el.tagName) || el.getAttribute("role") === "article") {
        if (len >= 20) return el;
        continue;
      }
      const d = getComputedStyle(el).display;
      if (d !== "inline" && d !== "contents" && len >= 80) return el;
    }
    return null;
  }

  // Tekst elementu bez zagnieżdżonych postów (na FB komentarze to zagnieżdżone role="article").
  function ownText(el) {
    let text = el.innerText || el.textContent || "";
    for (const inner of el.querySelectorAll('[role="article"], article')) {
      const t = inner.innerText;
      if (t && t.trim()) text = text.replace(t, "");
    }
    return text;
  }

  function xMeta(article) {
    if (!article) return {};
    const raw = article.querySelector('[data-testid="User-Name"]')?.innerText || "";
    const handle = raw.match(/@[A-Za-z0-9_]{1,15}/)?.[0] || "";
    const name = (handle ? raw.split(handle)[0] : raw).split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
    const time = article.querySelector("time[datetime]");
    const link = time?.closest("a[href]");
    return { author: [name, handle && `(${handle})`].filter(Boolean).join(" "), date: time?.getAttribute("datetime") || "", url: link?.href || "" };
  }

  const cleanLines = (t) => t.split("\n").map((l) => l.trim()).filter((l) => l && !UI_LINE.test(l)).join("\n");
  // Nazwa autora bez przycisków, które Facebook wstawia obok niej w tym samym nagłówku: „· Obserwuj” (oficjalne
  // profile, strony), „· Dołącz” (grupy) – i bez samotnych kropek.
  const NEXT_TO_NAME = /^(obserwuj|obserwujesz|follow|following|dołącz|join|polub|subskrybuj|subscribe)$/i;
  const cleanAuthor = (s) => String(s || "").split(/\n|\s*·\s*/)
    .map((p) => p.trim().replace(/(?<=\S)\s*(Obserwuj|Obserwujesz|Follow|Following|Dołącz|Join)$/u, "").trim()) // przyklejone do nazwy
    .filter((p) => p && !NEXT_TO_NAME.test(p) && !UI_LINE.test(p)).join(" · ");
  const SEE_MORE = /^(zobacz więcej|see more|wyświetl więcej|show more|pokaż więcej|…\s*more)$/i;
  const seeMoreBtn = (el) => [...el.querySelectorAll('[role="button"], button')]
    .find((b) => SEE_MORE.test(b.innerText.trim()) && postOf(b) === el) || null;
  const seeMore = (el) => !!seeMoreBtn(el);

  function extractPost(el) {
    const meta = pageMeta();
    const isPost = postOf(el) === el;
    let text = "", extra = {}, truncated = false;
    if (isPost && isTweet(el)) {
      const parts = [...el.querySelectorAll('[data-testid="tweetText"]')].map((n) => n.innerText.trim()).filter(Boolean);
      text = parts.length > 1 ? `${parts[0]}\n\n[Quoted post]\n${parts.slice(1).join("\n\n")}` : parts[0] || "";
      extra = xMeta(el);
      truncated = !!el.querySelector('[data-testid="tweet-text-show-more-link"]');
      if (!text) text = ownText(el);
    } else if (isPost) {
      // Facebook oznacza treść posta atrybutem data-ad-(comet-)preview="message" – bierzemy tylko ją.
      let msgs = [...el.querySelectorAll('[data-ad-preview="message"], [data-ad-comet-preview="message"]')].filter((m) => postOf(m) === el);
      if (!msgs.length) msgs = [...el.querySelectorAll('[data-ad-rendering-role="story_message"]')].filter((m) => postOf(m) === el);
      msgs = msgs.filter((m) => !msgs.some((o) => o !== m && o.contains(m)));
      text = msgs.length ? msgs.map((m) => m.innerText).join("\n\n") : cleanLines(ownText(el));
      const who = [...el.querySelectorAll(isFB ? "h2, h3, h4, strong" : "h2, h3, h4")].find((h) => postOf(h) === el && h.innerText.trim().length < 80);
      extra.author = cleanAuthor(who?.innerText);
      truncated = seeMore(el);
    } else {
      text = ownText(el);
    }
    // „Wskaż post” bierze też obrazki z posta (memy, infografiki) – ich zrzut robi tło.
    const imgs = imagesIn(el, isPost ? el : null);
    const captureId = newId(el);
    if (imgs.length) imageEls.set(captureId, imgs);
    text = clean(text);
    const alts = imgs.map(usefulAlt).filter(Boolean);
    if (alts.length) extra.alt = alts.join(" | ");
    const links = linksIn(el, isPost ? el : null);
    return {
      kind: isPost ? "post" : !text && imgs.length ? "image" : "fragment",
      text,
      truncated,
      imageCount: imgs.length,
      imageSrcs: imgs.map(srcOf),
      meta: { ...meta, author: extra.author || meta.author, date: extra.date || meta.date, url: extra.url || meta.url, ...(extra.alt ? { alt: extra.alt } : {}), ...(links.length ? { links } : {}) },
      captureId,
    };
  }
  // Ikonka „sprawdź” przy poście (content/buttons.js): post wskazany kliknięciem, odebrany po tokenie.
  // Na Facebooku najpierw rozwijamy „Zobacz więcej” (rozwija się w miejscu); na X „Pokaż więcej” przenosi
  // na stronę tweeta, więc tam tylko oznaczamy skrócenie (podgląd pozwoli wkleić resztę).
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function postFrom({ token = "" } = {}) {
    const el = globalThis.__fcButtons?.take?.(token);
    if (!el) return { error: "postGone" };
    const more = isFB ? seeMoreBtn(el) : null;
    if (more) {
      const before = (el.innerText || "").length;
      more.click();
      for (let i = 0; i < 20 && more.isConnected && (el.innerText || "").length <= before; i++) await wait(100);
    }
    const res = extractPost(el);
    return { ...res, via: "button", skipPreview: !res.truncated };
  }

  // Wynik sprawdzenia posta z przycisku „Sprawdź fakty” – ramka pod tym postem (rysuje ją content/buttons.js).
  function injectResult({ captureId = "", html = "", css = "", reset = false } = {}) {
    const el = roots.get(captureId);
    return !!(el && globalThis.__fcButtons?.showResult?.(el, { html, css, captureId, reset }));
  }

  // Linki wychodzące z posta (do sprawdzenia, czy nie prowadzą na podróbkę): rozpakowane przekierowania serwisów,
  // bez linków do samego serwisu (profile, hashtagi). Maks. 15.
  const PLATFORM = /(^|\.)(facebook|fbcdn|instagram|messenger|whatsapp|x|twitter|twimg|tiktok|youtube|youtu|google|gstatic|linkedin|reddit|threads)\.(com|net|be)$/;
  function linksIn(el, post = null) {
    const out = new Set();
    for (const a of el.querySelectorAll("a[href]")) {
      if (post && postOf(a) !== post) continue;
      let u;
      try { u = new URL(a.href); } catch { continue; }
      const inner = /(^|\.)facebook\.com$/.test(u.hostname) && u.pathname === "/l.php" ? u.searchParams.get("u")
        : /(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url" ? u.searchParams.get("q") || u.searchParams.get("url")
        : u.hostname === "t.co" ? (a.textContent || "").trim().replace(/…$/, "") : null;
      if (inner) {
        try { u = new URL(/^https?:/i.test(inner) ? inner : `https://${inner}`); } catch { continue; }
      }
      if (!/^https?:$/.test(u.protocol) || u.hostname === location.hostname || PLATFORM.test(u.hostname)) continue;
      out.add(u.href.slice(0, 300));
      if (out.size >= 15) break;
    }
    return [...out];
  }
  // Automatyczne opisy obrazków (Facebook: „Może być zdjęciem przedstawiającym tekst”, X: „Image”) nic nie mówią.
  const AUTO_ALT = /^(może być|moze byc|may be|brak dostępnego opisu|no photo description|image may contain|obraz może zawierać|to może być|this may be|image|obraz|obrazek|zdjęcie|photo|picture|grafika|graphic|mem|meme)(?!\p{L})/iu; // (?!\p{L}) zamiast \b – \b nie zna polskich liter
  const usefulAlt = (im) => { const a = clean(im?.alt || im?.getAttribute?.("aria-label") || ""); return a.length > 3 && !AUTO_ALT.test(a) ? a : ""; };
  const srcOf = (im) => (/^https?:/.test(im.currentSrc || im.src || "") ? im.currentSrc || im.src : "");

  // Obrazek spod prawego przycisku (adres z menu). W poście – razem z tekstem posta jako kontekstem.
  function imageBySrc({ src }) {
    const norm = (u) => String(u || "").replace(/#.*$/, "");
    const cands = [...document.querySelectorAll("img")].filter((im) => norm(im.currentSrc) === norm(src) || norm(im.src) === norm(src) || (im.srcset || "").includes(src));
    const vis = (im) => { const r = im.getBoundingClientRect(); return Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)); };
    const im = cands.sort((a, b) => vis(b) - vis(a))[0];
    if (!im || !vis(im)) return null;
    const post = postOf(im);
    const res = post ? extractPost(post) : { kind: "image", text: "", truncated: false, meta: pageMeta(), captureId: newId(im) };
    imageEls.set(res.captureId, [im]);
    const alt = usefulAlt(im); // opis wpisany przez autora – tylko jako kontekst, nie tekst do sprawdzenia
    return { ...res, imageCount: 1, imageSrcs: [srcOf(im) || src], meta: { ...res.meta, ...(alt ? { alt } : {}) } };
  }

  // ---------- wycinek ekranu: przeciągnij prostokąt ----------
  function area(labels = {}) {
    picking?.cleanup();
    const hostEl = document.createElement("fc-overlay");
    hostEl.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;cursor:crosshair;";
    const sh = hostEl.attachShadow({ mode: "closed" });
    const shade = document.createElement("div");
    shade.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.25);";
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;display:none;box-sizing:border-box;border:2px solid #1f4fd1;box-shadow:0 0 0 9999px rgba(0,0,0,.35);border-radius:2px;";
    const bar = document.createElement("div");
    bar.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;max-width:92vw;background:#17191c;color:#fff;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;padding:8px 12px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);cursor:default;";
    const msg = document.createElement("span");
    msg.textContent = labels.hint || "Drag to select an area · Esc to cancel";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = labels.cancel || "Cancel";
    cancelBtn.style.cssText = "all:initial;font:inherit;color:#fff;background:#444;padding:3px 10px;border-radius:6px;cursor:pointer;";
    bar.append(msg, cancelBtn);
    sh.append(shade, box, bar);
    document.documentElement.append(hostEl);
    let start = null, rect = null;
    const draw = () => {
      if (!rect) { box.style.display = "none"; shade.style.display = "block"; return; }
      shade.style.display = "none";
      Object.assign(box.style, { display: "block", left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    };
    const down = (e) => { if (e.button !== 0 || e.composedPath().includes(bar)) return; e.preventDefault(); start = [e.clientX, e.clientY]; rect = null; };
    const move = (e) => {
      if (!start) return;
      const [x0, y0] = start;
      rect = { x: Math.min(x0, e.clientX), y: Math.min(y0, e.clientY), w: Math.abs(e.clientX - x0), h: Math.abs(e.clientY - y0) };
      draw();
    };
    const up = () => {
      if (!start) return;
      start = null;
      if (!rect || rect.w < 20 || rect.h < 20) { rect = null; draw(); return; }
      const r = rect;
      cleanup();
      const captureId = newId(null);
      areaRects.set(captureId, { x: r.x + scrollX, y: r.y + scrollY, w: r.w, h: r.h });
      // dwie klatki, żeby nakładka zniknęła z ekranu przed zrzutem
      requestAnimationFrame(() => requestAnimationFrame(() => send({ kind: "area", text: "", area: r, imageCount: 1, imageSrcs: [""], meta: pageMeta(), captureId })));
    };
    const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cleanup(); send({ cancelled: true }); } };
    hostEl.addEventListener("mousedown", down);
    addEventListener("mousemove", move, true);
    addEventListener("mouseup", up, true);
    addEventListener("keydown", key, true);
    cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); cleanup(); send({ cancelled: true }); });
    function cleanup() {
      removeEventListener("mousemove", move, true);
      removeEventListener("mouseup", up, true);
      removeEventListener("keydown", key, true);
      hostEl.remove();
      picking = null;
    }
    picking = { cleanup };
    return { started: true };
  }

  // ---------- prywatność: zamazanie zdjęć profilowych i nazw autorów na zrzucie ----------
  // Opcja w ⚙ (domyślnie wyłączona). Działa tylko na czas zrzutu: rozmycie znika zaraz potem.
  const masked = [];
  function maskPeople(rects) {
    const live = rects.filter(Boolean);
    if (!live.length) return 0;
    const hit = (b) => b.width > 0 && b.height > 0 && live.some((r) => b.right > r.x && b.left < r.x + r.w && b.bottom > r.y && b.top < r.y + r.h);
    const blur = (el) => {
      if (!el || masked.some(([e]) => e === el || e.contains(el))) return;
      masked.push([el, el.style.getPropertyValue("filter"), el.style.getPropertyPriority("filter")]);
      el.style.setProperty("filter", "blur(8px)", "important");
    };
    // zdjęcia profilowe: małe, mniej więcej kwadratowe obrazki (także <image> w <svg> na Facebooku)
    for (const im of document.querySelectorAll("img, svg, [data-testid='Tweet-User-Avatar']")) {
      const b = im.getBoundingClientRect();
      if (b.width < 14 || b.width > 80 || b.height < 14 || b.height > 80 || Math.abs(b.width - b.height) > 0.25 * b.width) continue;
      if (im.localName === "svg" && !im.querySelector("image")) continue; // ikonki interfejsu zostają
      if (hit(b)) blur(im);
    }
    // nazwy autorów: X – User-Name; posty i komentarze (role=article) – nagłówki, pogrubione nazwy, linki do profili
    const names = '[data-testid="User-Name"], [role="article"] h2, [role="article"] h3, [role="article"] h4, [role="article"] strong, ' +
      '[role="article"] a[role="link"] > span, a[href*="/user/"], a[href*="profile.php"], [data-testid="UserName"]';
    for (const el of document.querySelectorAll(names)) {
      const txt = (el.innerText || "").trim();
      if (!txt || txt.length > 70) continue;
      if (hit(el.getBoundingClientRect())) blur(el);
    }
    // @uchwyty w tekście
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/@[A-Za-z0-9_]{2,}/.test(n.data) ? 1 : 2) });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (el && (el.innerText || "").length <= 70 && hit(el.getBoundingClientRect())) blur(el);
    }
    return masked.length;
  }
  function unmaskPeople() {
    for (const [el, val, prio] of masked.splice(0)) {
      if (val) el.style.setProperty("filter", val, prio); else el.style.removeProperty("filter");
    }
  }

  // ---------- data publikacji filmu / strony (do oceny wypowiedzi według stanu na ten dzień) ----------
  function mediaInfo() {
    const m = (sel) => document.querySelector(sel)?.getAttribute("content")?.trim() || "";
    const live = /^true$/i.test(m('meta[itemprop="isLiveBroadcast"]')) && !m('meta[itemprop="endDate"]');
    let date = m('meta[itemprop="datePublished"]') || m('meta[itemprop="uploadDate"]') || m('meta[property="article:published_time"]') ||
      m('meta[property="og:video:release_date"]') || m('meta[name="date"]') || m('meta[property="og:updated_time"]');
    if (!date) {
      for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          for (const o of [JSON.parse(sc.textContent)].flat()) { date = o?.uploadDate || o?.datePublished || ""; if (date) break; }
        } catch { /* uszkodzony JSON-LD */ }
        if (date) break;
      }
    }
    // YouTube przełącza filmy bez przeładowania strony – metadane mogą być jeszcze od poprzedniego filmu
    const v = new URL(location.href).searchParams.get("v");
    const metaUrl = document.querySelector('link[itemprop="url"]')?.href || m('meta[itemprop="url"]') || "";
    const stale = !!(v && metaUrl && !metaUrl.includes(v));
    return { date: stale ? "" : date, live: stale ? false : live, url: location.href };
  }

  // ---------- zrzut ekranu: na chwilę chowamy własne nakładki i podświetlenia ----------
  const OUR_HOSTS = "fc-overlay, fc-busy, fc-toast, fc-tip, fc-imgmarks";
  let savedHighlights = null;
  function prepareShot({ captureId, area: ar, mask = false } = {}) {
    document.querySelectorAll(OUR_HOSTS).forEach((h) => h.style.setProperty("visibility", "hidden", "important"));
    if (globalThis.CSS?.highlights) { savedHighlights = [...CSS.highlights.entries()]; CSS.highlights.clear(); }
    const clip = (r) => {
      const x = Math.max(0, r.left), y = Math.max(0, r.top);
      const w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y;
      return w >= 20 && h >= 20 ? { x, y, w, h } : null; // tylko to, co widać na ekranie
    };
    const rects = ar ? [clip({ left: ar.x, top: ar.y, right: ar.x + ar.w, bottom: ar.y + ar.h })]
      : (imageEls.get(captureId) || []).map((im) => (im.isConnected ? clip(im.getBoundingClientRect()) : null));
    const maskedCount = mask ? maskPeople(rects) : 0;
    return { vw: innerWidth, vh: innerHeight, rects, masked: maskedCount };
  }
  function endShot() {
    unmaskPeople();
    document.querySelectorAll(OUR_HOSTS).forEach((h) => h.style.removeProperty("visibility"));
    if (savedHighlights && globalThis.CSS?.highlights) savedHighlights.forEach(([k, v]) => CSS.highlights.set(k, v));
    savedHighlights = null;
    return true;
  }

  // ---------- zaznaczenie ----------
  function selection() {
    const sel = getSelection();
    const text = clean(sel?.toString());
    if (!text || !sel.rangeCount) return null;
    let root = sel.getRangeAt(0).commonAncestorContainer;
    if (root.nodeType !== 1) root = root.parentElement;
    const meta = pageMeta();
    const post = postOf(root);
    if (post && isTweet(post)) Object.assign(meta, Object.fromEntries(Object.entries(xMeta(post)).filter(([, v]) => v)));
    return { kind: "selection", text, meta, captureId: newId(post || root) };
  }

  // ---------- artykuł (Readability = tryb czytnika) ----------
  const squash = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  function article() {
    const meta = pageMeta();
    let parsed = null;
    try {
      if (typeof Readability === "function") parsed = new Readability(document.cloneNode(true), { charThreshold: 300 }).parse();
    } catch { parsed = null; }
    let text = "";
    if (parsed?.content) {
      const doc = new DOMParser().parseFromString(parsed.content, "text/html");
      const out = [];
      for (const b of doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,td,dd")) {
        if (b.querySelector("p,li,blockquote,pre,h1,h2,h3,h4,h5,h6")) continue; // tylko „liście”, bez dublowania
        const t = b.textContent.replace(/\s+/g, " ").trim();
        if (t) out.push(t);
      }
      text = out.join("\n\n");
      const all = (parsed.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length < all.length * 0.6) text = all; // nietypowy układ – bierzemy cały tekst
    }
    if (text.length < 200) {
      const el = document.querySelector("article, main, [role='main']");
      if (el && el.innerText.length > text.length) text = el.innerText;
    }
    text = clean(text);
    if (text.length < 80) return { error: "noArticle" };
    // Element strony z treścią artykułu – tam szukamy cytatów do podświetlenia.
    const probe = squash(text.slice(0, 120)).slice(0, 40);
    const root = [...document.querySelectorAll("article, main, [role='main'], [itemprop='articleBody']")]
      .find((el) => squash(el.textContent).includes(probe)) || document.body;
    return {
      kind: "article",
      text,
      meta: {
        ...meta,
        title: parsed?.title || meta.title,
        author: parsed?.byline || meta.author,
        date: parsed?.publishedTime || meta.date,
        site: parsed?.siteName || meta.site,
      },
      captureId: newId(root),
    };
  }

  // ---------- tryb „wskaż post” ----------
  let picking = null;
  const send = (payload) => { try { chrome.runtime.sendMessage({ type: "fc-captured", payload }); } catch { /* wtyczka przeładowana */ } };

  function pick(labels = {}) {
    picking?.cleanup();
    const hostEl = document.createElement("fc-overlay");
    hostEl.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    const sh = hostEl.attachShadow({ mode: "closed" });
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;display:none;box-sizing:border-box;border:2px solid #1f4fd1;background:rgba(31,79,209,.10);border-radius:6px;pointer-events:none;transition:all .06s ease-out;";
    const bar = document.createElement("div");
    bar.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;max-width:92vw;background:#17191c;color:#fff;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;padding:8px 12px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:auto;";
    const msg = document.createElement("span");
    msg.textContent = labels.hint || "Click a post · Esc to cancel";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = labels.cancel || "Cancel";
    cancelBtn.style.cssText = "all:initial;font:inherit;color:#fff;background:#444;padding:3px 10px;border-radius:6px;cursor:pointer;";
    bar.append(msg, cancelBtn);
    sh.append(box, bar);
    document.documentElement.append(hostEl);

    let base = null, cur = null, stack = [];
    const picked = []; // { el, frame } – już dodane (Shift+klik)
    const frameOf = (el, f) => {
      const r = el.getBoundingClientRect();
      Object.assign(f.style, { display: el.isConnected ? "block" : "none", left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
    };
    const show = () => {
      picked.forEach((p) => frameOf(p.el, p.frame));
      if (!cur?.isConnected) { box.style.display = "none"; return; }
      frameOf(cur, box);
    };
    const ours = (e) => e.target === hostEl;
    const onMove = (e) => {
      if (ours(e)) return;
      // pasek z podpowiedzią nie może zasłaniać tego, co wskazujemy
      const low = e.clientY > innerHeight - 110;
      bar.style.top = low ? "12px" : "auto";
      bar.style.bottom = low ? "auto" : "16px";
      const el = blockOf(e.target);
      if (el !== base) { base = el; stack = el ? [el] : []; cur = el; show(); }
    };
    const swallow = (e) => { if (ours(e)) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    // Shift/Ctrl+klik: dodaj do kolejki i wskazuj dalej; zwykły klik: dodaj i zakończ.
    const finish = (el, keep = false) => {
      if (picked.some((p) => p.el === el)) return;
      const res = extractPost(el);
      if (res.text.length < 10 && !res.imageCount) { // ani tekstu, ani obrazka – szukamy dalej
        msg.textContent = labels.empty || "No text here – pick another element";
        return;
      }
      send(res);
      if (!keep) { cleanup(); return; }
      const frame = document.createElement("div");
      frame.style.cssText = "position:fixed;box-sizing:border-box;border:2px dashed #137a4b;background:rgba(19,122,75,.08);border-radius:6px;pointer-events:none;";
      sh.append(frame);
      picked.push({ el, frame });
      show();
      msg.textContent = (labels.added || "Queued: {n} · Shift+click for more · Esc to finish").replace("{n}", picked.length);
    };
    const onClick = (e) => { if (ours(e)) return; swallow(e); if (cur) finish(cur, e.shiftKey || e.ctrlKey || e.metaKey); };
    const onKey = (e) => {
      if (e.key === "Escape") { swallow(e); cleanup(); if (!picked.length) send({ cancelled: true }); }
      else if (e.key === "ArrowUp" && cur) {
        swallow(e);
        const p = blockOf(cur.parentElement);
        if (p) { stack.push(p); cur = p; show(); }
      } else if (e.key === "ArrowDown" && stack.length > 1) { swallow(e); stack.pop(); cur = stack.at(-1); show(); }
      else if (e.key === "Enter" && cur) { swallow(e); finish(cur, e.shiftKey); }
    };
    const BLOCK = ["pointerdown", "mousedown", "pointerup", "mouseup", "auxclick", "dblclick", "contextmenu"];
    addEventListener("mousemove", onMove, true);
    addEventListener("click", onClick, true);
    addEventListener("keydown", onKey, true);
    addEventListener("scroll", show, true);
    addEventListener("resize", show, true);
    BLOCK.forEach((t) => addEventListener(t, swallow, true));
    cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); cleanup(); send({ cancelled: true }); });
    function cleanup() {
      removeEventListener("mousemove", onMove, true);
      removeEventListener("click", onClick, true);
      removeEventListener("keydown", onKey, true);
      removeEventListener("scroll", show, true);
      removeEventListener("resize", show, true);
      BLOCK.forEach((t) => removeEventListener(t, swallow, true));
      hostEl.remove();
      picking = null;
    }
    picking = { cleanup };
    return { started: true };
  }

  // ---------- wyszukiwanie cytatów i podświetlanie ----------
  // Porównujemy tylko litery i cyfry (małe), bez spacji i interpunkcji: odporne na cudzysłowy, myślniki,
  // wielokropki, łamanie linii i podział tekstu na elementy.
  const WORD = /[\p{L}\p{N}]/u;
  function buildIndex(root) {
    const nodes = [], nodeOf = [], offOf = [];
    let hay = "";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest("script,style,noscript,textarea,fc-overlay,fc-tip") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n; (n = walker.nextNode());) {
      const ni = nodes.push(n) - 1;
      let i = 0;
      for (const ch of n.data) {
        for (const c of ch.toLowerCase()) if (WORD.test(c)) { hay += c; nodeOf.push(ni); offOf.push(i); }
        i += ch.length;
      }
    }
    return { hay, nodes, nodeOf, offOf };
  }
  const normQuote = (q) => [...String(q || "").toLowerCase()].filter((c) => WORD.test(c)).join("");
  function mkRange(ix, a, b) {
    const r = document.createRange();
    const sn = ix.nodes[ix.nodeOf[a]], en = ix.nodes[ix.nodeOf[b - 1]];
    const eo = ix.offOf[b - 1];
    r.setStart(sn, ix.offOf[a]);
    r.setEnd(en, eo + ((en.data.codePointAt(eo) ?? 0) > 0xffff ? 2 : 1));
    return r;
  }
  const visible = (r) => [...r.getClientRects()].some((x) => x.width > 0 && x.height > 0);
  function findQuote(ix, quote) {
    const q = normQuote(quote);
    if (q.length < 6 || !ix.hay) return null;
    const tryAt = (needle, endFn) => {
      let fallback = null;
      for (let a = ix.hay.indexOf(needle), n = 0; a >= 0 && n < 25; a = ix.hay.indexOf(needle, a + 1), n++) {
        const b = endFn(a);
        if (b == null) continue;
        const r = mkRange(ix, a, b);
        if (visible(r)) return r;
        fallback ??= r;
      }
      return fallback;
    };
    // 1) dokładnie
    let r = tryAt(q, (a) => a + q.length);
    if (r) return r;
    // 2) początek + koniec cytatu (model lekko zmienił środek): coraz krótsze końcówki
    for (const h of [30, 20, 12]) {
      if (q.length < h + 10) continue;
      const head = q.slice(0, h);
      r = tryAt(head, (a) => {
        for (const tl of [20, 14, 10, 7]) {
          if (q.length < h + tl) continue;
          const tail = q.slice(-tl);
          const b = ix.hay.indexOf(tail, a + head.length);
          if (b >= 0 && b - a < q.length * 1.5 + 30) return b + tail.length;
        }
        return null;
      });
      if (r) return r;
    }
    // 3) sam początek (długość jak w cytacie)
    if (q.length >= 24) r = tryAt(q.slice(0, 24), (a) => Math.min(a + q.length, ix.hay.length));
    return r;
  }

  const TONES = ["good", "warn", "bad", "muted", "trick"]; // trick – chwyt erystyczny (osobny kolor, nie werdykt)
  const TONE_COLORS = {
    good: ["#e3f4ea", "#137a4b"], warn: ["#fdf1d6", "#8a5a00"], bad: ["#fbe4e2", "#b3261e"], muted: ["#eceef1", "#4b5563"], trick: ["#efe9fb", "#5b3cc4"],
  };
  let marks = []; // { range | el | docRect, tone, label, claim, expl, quote, captureId }

  // Ramki z plakietką na obrazkach/wycinkach (tekstu w obrazku nie da się podświetlić).
  let imgHost = null, imgLayer = null, imgTimer = null;
  const TONE_RANK = { bad: 3, warn: 2, good: 1, muted: 0, trick: 0 };
  const TONE_BORDER = { good: "#137a4b", warn: "#c08a00", bad: "#c62828", muted: "#646c76", trick: "#5b3cc4" };
  function rectOfMark(m) {
    if (m.el) return m.el.isConnected ? m.el.getBoundingClientRect() : null;
    if (m.docRect) { const d = m.docRect; return new DOMRect(d.x - scrollX, d.y - scrollY, d.w, d.h); }
    return null;
  }
  function visualGroups() {
    const groups = new Map();
    for (const m of marks) {
      if (!m.el && !m.docRect) continue;
      const key = m.el || `${m.captureId}:area`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    return [...groups.values()];
  }
  function paintImages() {
    const groups = visualGroups();
    if (!groups.length) { imgHost?.remove(); imgHost = null; clearInterval(imgTimer); imgTimer = null; return; }
    if (!imgHost?.isConnected) {
      imgHost = document.createElement("fc-imgmarks");
      imgHost.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483645;pointer-events:none;";
      imgLayer = imgHost.attachShadow({ mode: "closed" });
      document.documentElement.append(imgHost);
      if (!paintImages.bound) {
        paintImages.bound = true;
        addEventListener("scroll", placeImages, { capture: true, passive: true });
        addEventListener("resize", placeImages, { passive: true });
      }
    }
    imgLayer.replaceChildren(...groups.map((g) => {
      const tone = g.reduce((a, m) => (TONE_RANK[m.tone] > TONE_RANK[a] ? m.tone : a), "muted");
      const frame = document.createElement("div");
      frame.style.cssText = `position:fixed;box-sizing:border-box;border:3px solid ${TONE_BORDER[tone]};border-radius:6px;display:none;`;
      const badge = document.createElement("div");
      const counts = new Map();
      for (const m of g) counts.set(m.label, (counts.get(m.label) || 0) + 1);
      badge.textContent = `Fact Checker · ${[...counts].map(([l, n]) => `${l} ${n}`).join(" · ")}`;
      badge.style.cssText = `position:absolute;left:0;top:0;max-width:100%;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:${TONE_BORDER[tone]};color:#fff;font:700 11px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.02em;text-transform:uppercase;padding:2px 8px;border-radius:0 0 6px 0;box-shadow:0 1px 4px rgba(0,0,0,.25);`;
      frame.append(badge);
      frame._group = g;
      return frame;
    }));
    placeImages();
    imgTimer ??= setInterval(placeImages, 500); // strony przesuwają elementy także bez przewijania
  }
  function placeImages() {
    if (!imgLayer) return;
    for (const frame of imgLayer.children) {
      const r = rectOfMark(frame._group[0]);
      if (!r || r.width < 2 || r.bottom < 0 || r.top > innerHeight) { frame.style.display = "none"; continue; }
      Object.assign(frame.style, { display: "block", left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
    }
  }

  function paint() {
    paintImages();
    if (!globalThis.CSS?.highlights) return;
    for (const tone of TONES) {
      const rs = marks.filter((m) => m.range && m.tone === tone).map((m) => m.range);
      if (rs.length) CSS.highlights.set(`fc-${tone}`, new Highlight(...rs));
      else CSS.highlights.delete(`fc-${tone}`);
    }
  }
  function clear() {
    marks = [];
    paint();
    CSS.highlights?.delete("fc-flash");
    hideTip();
    return true;
  }
  // Każdy werdykt szukamy najpierw we fragmencie, z którego pochodzi (captureId), potem w całej stronie.
  function locate(items, captureId) {
    const ix = new Map();
    const indexOf = (root) => { if (!ix.has(root)) ix.set(root, buildIndex(root)); return ix.get(root); };
    return items.map((it) => {
      const cid = it.captureId ?? captureId;
      // werdykt z obrazka → ramka na tym obrazku; z wycinka → ramka na wycinku
      if (it.area && areaRects.has(cid)) return { ...it, captureId: cid, range: null, docRect: areaRects.get(cid) };
      const el = it.image > 0 ? imageEls.get(cid)?.[it.image - 1] : null;
      if (el?.isConnected) return { ...it, captureId: cid, range: null, el };
      const root = roots.get(cid);
      let range = it.quote && root?.isConnected ? findQuote(indexOf(root), it.quote) : null;
      if (!range && it.quote) range = findQuote(indexOf(document.body), it.quote);
      return { ...it, captureId: cid, range: range || null };
    });
  }
  function highlight({ captureId, items = [] }) {
    marks = locate(items, captureId);
    paint();
    ensureTip();
    return marks.map((m) => !!(m.range || m.el || m.docRect));
  }

  // Strony typu X/FB podmieniają elementy przy przewijaniu – wtedy szukamy cytatu jeszcze raz.
  function refresh(m) {
    if (m.el || m.docRect) return m.el?.isConnected || m.docRect ? true : null;
    if (m.range?.startContainer.isConnected) return m.range;
    m.range = locate([m], m.captureId)[0].range;
    paint();
    return m.range;
  }
  function scrollToMark({ index }) {
    const m = marks[index];
    if (!m || !refresh(m)) return false;
    if (m.el || m.docRect) { // obrazek / wycinek: przewiń i mrugnij ramką
      if (m.el) m.el.scrollIntoView({ block: "center", behavior: "smooth" });
      else scrollTo({ top: m.docRect.y - innerHeight / 3, behavior: "smooth" });
      setTimeout(() => {
        placeImages();
        const frame = [...(imgLayer?.children || [])].find((f) => f._group.includes(m));
        frame?.animate([{ boxShadow: "0 0 0 0 rgba(31,79,209,.9)" }, { boxShadow: "0 0 0 12px rgba(31,79,209,0)" }], { duration: 700, iterations: 3 });
        const r = rectOfMark(m);
        if (r) { renderTip(m, r.left, r.top + 12); pinned = setTimeout(() => { pinned = null; hideTip(); }, 4000); }
      }, 600);
      return true;
    }
    m.range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (globalThis.CSS?.highlights) {
      CSS.highlights.set("fc-flash", new Highlight(m.range));
      setTimeout(() => CSS.highlights.delete("fc-flash"), 1800);
    }
    setTimeout(() => {
      const r = m.range.getBoundingClientRect();
      renderTip(m, r.left, r.bottom);
      pinned = setTimeout(() => { pinned = null; hideTip(); }, 4000);
    }, 600);
    return true;
  }

  // ---------- dymek z werdyktem po najechaniu na podświetlenie ----------
  let tipHost = null, tipBox = null, raf = 0, lastXY = [0, 0], pinned = null;
  function ensureTip() {
    if (tipHost?.isConnected) return;
    tipHost = document.createElement("fc-tip");
    tipHost.style.cssText = "all:initial;position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;";
    const sh = tipHost.attachShadow({ mode: "closed" });
    tipBox = document.createElement("div");
    tipBox.style.cssText = "display:none;position:fixed;box-sizing:border-box;max-width:340px;background:#fff;color:#17191c;border:1px solid #dfe2e6;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:10px 12px;font:13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;text-align:left;";
    sh.append(tipBox);
    document.documentElement.append(tipHost);
    if (!ensureTip.bound) {
      ensureTip.bound = true;
      addEventListener("mousemove", (e) => { lastXY = [e.clientX, e.clientY]; if (!raf) raf = requestAnimationFrame(onHover); }, { capture: true, passive: true });
      addEventListener("scroll", () => { if (!pinned) hideTip(); }, { capture: true, passive: true });
    }
  }
  function hideTip() { if (tipBox) tipBox.style.display = "none"; }
  function onHover() {
    raf = 0;
    if (pinned || !marks.length) return;
    const [x, y] = lastXY;
    const m = marks.find((mk) => mk.range && [...mk.range.getClientRects()].some((r) => x >= r.left && x <= r.right && y >= r.top - 2 && y <= r.bottom + 2));
    if (m) { renderTip(m, x, y); return; }
    // obrazek / wycinek: lista werdyktów z tego obrazka
    const g = visualGroups().find((gr) => { const r = rectOfMark(gr[0]); return r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
    if (g) renderTip(g, x, y); else hideTip();
  }
  function renderTip(m, x, y) {
    if (!tipBox) return;
    if (Array.isArray(m)) return renderTipList(m, x, y);
    const [bg, fg] = TONE_COLORS[m.tone] || TONE_COLORS.muted;
    const pill = document.createElement("span");
    pill.textContent = m.label;
    pill.style.cssText = `display:inline-block;padding:2px 8px;border-radius:999px;font-weight:700;font-size:11px;letter-spacing:.02em;text-transform:uppercase;background:${bg};color:${fg};`;
    const cl = document.createElement("div");
    cl.textContent = m.claimLabel || "";
    cl.style.cssText = "margin-top:8px;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:#646c76;";
    const claim = document.createElement("div");
    claim.textContent = m.claim;
    claim.style.cssText = "margin-top:2px;font-weight:600;padding:4px 8px;background:#eceef1;border-radius:6px;";
    const expl = document.createElement("div");
    expl.textContent = m.expl?.length > 320 ? `${m.expl.slice(0, 317)}…` : m.expl || "";
    expl.style.cssText = "margin-top:4px;";
    const foot = document.createElement("div");
    foot.textContent = "Fact Checker";
    foot.style.cssText = "margin-top:6px;font-size:11px;color:#646c76;";
    tipBox.replaceChildren(pill, ...(m.claimLabel ? [cl] : []), claim, expl, foot);
    tipBox.style.display = "block";
    const w = tipBox.offsetWidth, h = tipBox.offsetHeight;
    const left = Math.max(8, Math.min(x + 14, innerWidth - w - 8));
    const top = y + 18 + h > innerHeight - 8 ? Math.max(8, y - h - 12) : y + 18;
    Object.assign(tipBox.style, { left: `${left}px`, top: `${top}px` });
  }

  // ---------- „sprawdzam…”: ramka wokół sprawdzanego tekstu + komunikat w rogu ----------
  let busyUi = null;
  function busy({ on, label = "", captureId, done = "" } = {}) {
    if (on) {
      if (!busyUi) {
        const hostEl = document.createElement("fc-busy");
        hostEl.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
        const sh = hostEl.attachShadow({ mode: "closed" });
        const frame = document.createElement("div");
        frame.style.cssText = "position:fixed;display:none;box-sizing:border-box;border:2px dashed #1f4fd1;border-radius:8px;background:rgba(31,79,209,.06);pointer-events:none;";
        const toast = document.createElement("div");
        toast.style.cssText = "position:fixed;left:16px;bottom:16px;display:flex;gap:10px;align-items:center;max-width:380px;background:#17191c;color:#fff;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);";
        const spin = document.createElement("span");
        spin.style.cssText = "flex:none;width:14px;height:14px;box-sizing:border-box;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;";
        const txt = document.createElement("span");
        const time = document.createElement("span");
        time.style.cssText = "opacity:.6;font-variant-numeric:tabular-nums;white-space:nowrap;";
        toast.append(spin, txt, time);
        sh.append(frame, toast);
        document.documentElement.append(hostEl);
        const anims = [
          spin.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 800, iterations: Infinity }),
          frame.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 1400, iterations: Infinity }),
        ];
        busyUi = { hostEl, frame, spin, txt, time, anims, root: null, since: Date.now() };
        const place = () => {
          const r = busyUi?.root?.isConnected ? busyUi.root.getBoundingClientRect() : null;
          if (!r || r.bottom < 0 || r.top > innerHeight) { frame.style.display = "none"; return; }
          Object.assign(frame.style, { display: "block", left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
        };
        busyUi.tick = setInterval(() => {
          place();
          time.textContent = `${Math.round((Date.now() - busyUi.since) / 1000)} s`;
          toast.style.bottom = picking ? "72px" : "16px"; // nie zasłaniaj paska trybu wskazywania
        }, 200);
      }
      if (captureId !== undefined) {
        const r = roots.get(captureId);
        busyUi.root = r && r !== document.body && r !== document.documentElement ? r : null;
      }
      if (label) busyUi.txt.textContent = label;
      return true;
    }
    if (!busyUi) return true;
    const ui = busyUi;
    busyUi = null;
    clearInterval(ui.tick);
    ui.anims.forEach((a) => a.cancel());
    if (!done) { ui.hostEl.remove(); return true; }
    ui.frame.style.display = "none";
    ui.spin.style.display = "none";
    ui.time.textContent = "";
    ui.txt.textContent = done;
    setTimeout(() => ui.hostEl.remove(), 5000);
    return true;
  }

  // Krótki komunikat w rogu (np. „dodano do kolejki”) – niezależny od ramki „sprawdzam…”.
  function toast({ text = "" } = {}) {
    const hostEl = document.createElement("fc-toast");
    hostEl.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    const sh = hostEl.attachShadow({ mode: "closed" });
    const box = document.createElement("div");
    box.textContent = text;
    box.style.cssText = `position:fixed;left:16px;bottom:${16 + (busyUi ? 56 : 0) + (picking ? 56 : 0)}px;max-width:380px;background:#137a4b;color:#fff;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);`;
    sh.append(box);
    document.documentElement.append(hostEl);
    box.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 180 });
    setTimeout(() => hostEl.remove(), 3500);
    return true;
  }

  function renderTipList(list, x, y) {
    const rows = list.slice(0, 5).map((m) => {
      const [bg, fg] = TONE_COLORS[m.tone] || TONE_COLORS.muted;
      const row = document.createElement("div");
      row.style.cssText = "margin-top:6px;";
      const pill = document.createElement("span");
      pill.textContent = m.label;
      pill.style.cssText = `display:inline-block;margin-right:6px;padding:1px 7px;border-radius:999px;font-weight:700;font-size:10.5px;text-transform:uppercase;background:${bg};color:${fg};`;
      const claim = document.createElement("span");
      claim.textContent = m.claim;
      claim.style.cssText = "font-weight:600;";
      row.append(pill, claim);
      return row;
    });
    const head = document.createElement("div");
    head.textContent = list[0].claimLabel || "";
    head.style.cssText = "font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:#646c76;";
    const foot = document.createElement("div");
    foot.textContent = list.length > 5 ? `Fact Checker · +${list.length - 5}` : "Fact Checker";
    foot.style.cssText = "margin-top:6px;font-size:11px;color:#646c76;";
    tipBox.replaceChildren(head, ...rows, foot);
    tipBox.style.display = "block";
    const w = tipBox.offsetWidth, h = tipBox.offsetHeight;
    Object.assign(tipBox.style, { left: `${Math.max(8, Math.min(x + 14, innerWidth - w - 8))}px`, top: `${y + 18 + h > innerHeight - 8 ? Math.max(8, y - h - 12) : y + 18}px` });
  }

  let cssDone = false;
  globalThis.__fc = {
    selection, article, pick, postFrom, injectResult, highlight, clear, busy, toast, imageBySrc, area, prepareShot, endShot, mediaInfo,
    scrollTo: scrollToMark,
    cssNeeded: () => { const need = !cssDone; cssDone = true; return need; },
    // do testów
    _findText: (root, quote) => { const r = findQuote(buildIndex(root || document.body), quote); return r ? r.toString() : null; },
  };
})();
