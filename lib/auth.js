// Logowanie "Sign in with ChatGPT" z użyciem planu ChatGPT (Plus/Pro) – przepływ dla aplikacji
// open-source uruchamianych lokalnie. Dokumentacja:
// https://developers.openai.com/siwc/token-sharing-open-source
//
// Wtyczka nie może nasłuchiwać na porcie, więc przechwytuje przekierowanie na adres loopback
// (http://127.0.0.1:PORT/auth/callback) przez chrome.webRequest i sama wymienia kod na tokeny (PKCE).

import { t } from "./i18n.js";

export const AUTH_BASE = "https://auth.openai.com";
export const AUTHORIZE_URL = `${AUTH_BASE}/api/accounts/authorize`;
export const TOKEN_URL = `${AUTH_BASE}/api/accounts/oauth/token`;
export const REVOKE_URL = `${AUTH_BASE}/api/accounts/oauth/revoke`;
export const JWKS_URL = `${AUTH_BASE}/.well-known/jwks.json`;
export const CALLBACK_PORT = 1457; // 1455 zajmuje Codex CLI, więc bierzemy inny port
export const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/auth/callback`;
export const RESOURCE = "https://api.openai.com/v1";
export const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const APP_NAME = "Fact Checker na zywo";

const K_CREDS = "chatgptCreds";   // aktualne tokeny + konto
const K_REG = "chatgptReg";       // rejestracja (issued client_id, email, id_token) – przeżywa wylogowanie
const K_HOST = "hostId";
const K_PENDING = "chatgptPending";

// ---------- pomocnicze ----------
export function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export function randomString(n = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}
export async function pkceChallenge(verifier) {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}
export function decodeJwt(jwt) {
  const [h, p] = jwt.split(".");
  const dec = (x) => JSON.parse(new TextDecoder().decode(b64urlDecode(x)));
  return { header: dec(h), payload: dec(p) };
}

const store = {
  get: async (k, area = chrome.storage.local) => (await area.get(k))[k],
  set: (k, v, area = chrome.storage.local) => area.set({ [k]: v }),
  del: (k, area = chrome.storage.local) => area.remove(k),
};

async function getHostId() {
  let id = await store.get(K_HOST);
  if (!id) {
    id = `urn:uuid:${crypto.randomUUID()}`;
    await store.set(K_HOST, id);
  }
  return id;
}

// ---------- 1–2: start logowania ----------
export async function startSignIn() {
  const reg = await store.get(K_REG);
  const verifier = randomString(48);
  const pending = {
    state: randomString(24),
    nonce: randomString(24),
    verifier,
    clientId: reg?.client_id || null,
    createdAt: Date.now(),
  };
  const p = new URLSearchParams({
    client_id: pending.clientId || "dynamic_agent_client",
    ext_agent_host_id: await getHostId(),
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    resource: RESOURCE,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge_method: "S256",
    code_challenge: await pkceChallenge(verifier),
  });
  if (!pending.clientId) p.set("agent_name_hint", APP_NAME);
  if (reg?.id_token) p.set("id_token_hint", reg.id_token);
  if (reg?.email) p.set("login_hint", reg.email);

  const tab = await chrome.tabs.create({ url: `${AUTHORIZE_URL}?${p}` });
  pending.tabId = tab.id;
  await store.set(K_PENDING, pending, chrome.storage.session);
}

// ---------- 3–5: callback, wymiana kodu, walidacja, zapis ----------
let callbackInFlight = null;

export function isCallbackUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === "127.0.0.1" && u.port === String(CALLBACK_PORT) && u.pathname === "/auth/callback";
  } catch {
    return false;
  }
}

export function handleCallback(url, tabId) {
  // webRequest i tabs.onUpdated mogą zgłosić ten sam adres – obsługujemy go raz
  if (!callbackInFlight) callbackInFlight = _handleCallback(url, tabId).finally(() => (callbackInFlight = null));
  return callbackInFlight;
}

async function _handleCallback(url, tabId) {
  const pending = await store.get(K_PENDING, chrome.storage.session);
  const q = new URL(url).searchParams;
  if (!pending || q.get("state") !== pending.state) return; // nie nasz / już obsłużony
  await store.del(K_PENDING, chrome.storage.session);
  const finish = (ok, msg) => {
    const page = chrome.runtime.getURL(`signed-in.html?ok=${ok ? 1 : 0}&msg=${encodeURIComponent(msg || "")}`);
    if (tabId != null && tabId >= 0) chrome.tabs.update(tabId, { url: page }).catch(() => {});
    chrome.runtime.sendMessage({ type: "auth-changed", ok, msg }).catch(() => {});
  };
  try {
    if (q.get("error")) {
      throw new Error(q.get("error") === "access_denied"
        ? t("auth.denied")
        : t("auth.error", { e: `${q.get("error")} ${q.get("error_description") || ""}`.trim() }));
    }
    const cbClient = q.get("client_id");
    if (pending.clientId && cbClient && cbClient !== pending.clientId) {
      throw new Error(t("auth.clientMismatch"));
    }
    const clientId = pending.clientId || cbClient;
    if (!clientId || clientId === "dynamic_agent_client") throw new Error(t("auth.incomplete"));

    const tok = await postForm(TOKEN_URL, {
      grant_type: "authorization_code",
      client_id: clientId,
      code: q.get("code"),
      code_verifier: pending.verifier,
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
    });
    const claims = await validateIdToken(tok.id_token, clientId, pending.nonce);
    const scopes = (tok.scope || "").split(/\s+/).filter(Boolean);

    const prevReg = await store.get(K_REG);
    if (prevReg?.subject && prevReg.client_id === clientId && prevReg.subject !== claims.sub) {
      throw new Error(t("auth.otherAccount"));
    }
    await saveTokens({ clientId, claims, tok, scopes });
    if (!scopes.includes(PLAN_SCOPE)) {
      finish(false, t("auth.noPlanScope"));
      return;
    }
    finish(true, claims.email || "");
  } catch (e) {
    finish(false, e.message);
  }
}

async function saveTokens({ clientId, claims, tok, scopes }) {
  const now = Date.now();
  const creds = {
    email: claims.email || "",
    name: claims.name || "",
    subject: claims.sub,
    client_id: clientId,
    id_token: tok.id_token,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    token_type: tok.token_type || "Bearer",
    expires_at: now + (Number(tok.expires_in) || 3600) * 1000,
    scopes,
    saved_at: new Date(now).toISOString(),
  };
  await store.set(K_CREDS, creds);
  await store.set(K_REG, { client_id: clientId, email: creds.email, subject: creds.subject, id_token: tok.id_token });
}

async function postForm(url, fields) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(fields),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 300) }; }
  if (!r.ok) {
    const err = new Error(`${data.error || r.status}: ${data.error_description || ""}`.trim());
    err.code = data.error;
    err.status = r.status;
    throw err;
  }
  return data;
}

// Weryfikacja podpisu ID tokena (RS256) względem JWKS OpenAI + iss/aud/exp/nonce.
export async function validateIdToken(idToken, clientId, nonce, { jwks, now = Date.now() } = {}) {
  if (!idToken) throw new Error("No id_token in the response.");
  const [h, p, s] = idToken.split(".");
  const { header, payload } = decodeJwt(idToken);
  if (header.alg !== "RS256") throw new Error(`Unsupported ID token algorithm: ${header.alg}`);
  const keys = jwks || (await (await fetch(JWKS_URL)).json());
  const jwk = keys.keys.find((k) => k.kid === header.kid) || (keys.keys.length === 1 ? keys.keys[0] : null);
  if (!jwk) throw new Error("ID token signing key not found.");
  const key = await crypto.subtle.importKey(
    "jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
  );
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("Invalid ID token signature.");
  if (payload.iss !== AUTH_BASE) throw new Error("Invalid ID token issuer.");
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(clientId)) throw new Error("ID token was issued for a different client.");
  if (payload.exp * 1000 < now - 60_000) throw new Error("ID token expired.");
  if (nonce && payload.nonce !== nonce) throw new Error("ID token nonce mismatch.");
  return payload;
}

// ---------- token do zapytań + odświeżanie (szeregowane) ----------
let refreshing = null;
const UNUSABLE = ["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired",
  "refresh_token_invalidated", "refresh_token_reused"];

export async function getAccessToken() {
  const creds = await store.get(K_CREDS);
  if (!creds?.access_token) throw Object.assign(new Error(t("auth.needLogin")), { code: "NEED_LOGIN" });
  if (creds.expires_at - Date.now() > 120_000) return creds.access_token;
  if (!refreshing) refreshing = refresh(creds).finally(() => (refreshing = null));
  return refreshing;
}

async function refresh(creds) {
  try {
    const tok = await postForm(TOKEN_URL, {
      grant_type: "refresh_token",
      client_id: creds.client_id,
      refresh_token: creds.refresh_token,
      resource: RESOURCE,
    });
    const next = {
      ...creds,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || creds.refresh_token,
      expires_at: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
      scopes: tok.scope ? tok.scope.split(/\s+/) : creds.scopes,
      id_token: tok.id_token || creds.id_token,
      saved_at: new Date().toISOString(),
    };
    await store.set(K_CREDS, next);
    return next.access_token;
  } catch (e) {
    if (UNUSABLE.includes(e.code)) {
      await store.del(K_CREDS);
      throw Object.assign(new Error(t("auth.expired")), { code: "NEED_LOGIN" });
    }
    throw e; // błąd chwilowy – zachowujemy dane
  }
}

export async function getAccount() {
  const c = await store.get(K_CREDS);
  if (!c?.access_token) return null;
  return { email: c.email, name: c.name, planUsage: (c.scopes || []).includes(PLAN_SCOPE) };
}

export async function signOut() {
  const c = await store.get(K_CREDS);
  await store.del(K_CREDS);
  if (c?.refresh_token) {
    fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: c.refresh_token, token_type_hint: "refresh_token", client_id: c.client_id }),
    }).catch(() => {});
  }
}
