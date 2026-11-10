// Uruchom: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseSSE, extractCitations } from "../lib/llm.js";
import { buildRequest, parseResult, isDuplicate, unsupportedFeature } from "../lib/factcheck.js";
import { b64url, decodeJwt, pkceChallenge, validateIdToken } from "../lib/auth.js";

test("parseSSE dzieli zdarzenia i zostawia niedokończony fragment", () => {
  const [ev, rest] = parseSSE('event: x\ndata: {"type":"a"}\n\ndata: {"type":"b"}\n\ndata: {"ty');
  assert.deepEqual(ev.map((e) => e.type), ["a", "b"]);
  assert.equal(rest, 'data: {"ty');
});

test("extractCitations zbiera unikalne url_citation", () => {
  const r = { output: [{ content: [{ annotations: [
    { type: "url_citation", url: "https://stat.gov.pl", title: "GUS" },
    { type: "url_citation", url: "https://stat.gov.pl", title: "GUS" },
  ] }] }] };
  assert.deepEqual(extractCitations(r), [{ url: "https://stat.gov.pl", title: "GUS" }]);
});

test("buildRequest: wyszukiwanie i schemat JSON, bez pól zakazanych w trybie planu", () => {
  const b = buildRequest({ model: "m", today: "2026-11-09", webSearch: true, fresh: "abc", checked: ["x"] });
  assert.deepEqual(b.tools, [{ type: "web_search" }]);
  assert.equal(b.text.format.type, "json_schema");
  for (const k of ["temperature", "max_output_tokens", "previous_response_id", "metadata"]) assert.ok(!(k in b));
  assert.ok(!b.input.some((i) => i.role === "system"));
  const plain = buildRequest({ model: "m", today: "t", webSearch: false, structured: false, fresh: "abc" });
  assert.ok(!plain.tools && !plain.text);
  assert.match(plain.instructions, /WYŁĄCZNIE obiekt JSON/);
});

test("parseResult radzi sobie z ```json i odrzuca złe URL-e i werdykty", () => {
  const txt = '```json\n{"claims":[{"quote":"q","speaker":"","claim":"Inflacja wynosi 5%","category":"liczby_statystyki","verdict":"zle","confidence":"srednia","explanation":"e","evidence":"","counter_evidence":"","missing_data":"","sources":[{"title":"t","url":"javascript:alert(1)"},{"title":"GUS","url":"https://stat.gov.pl"}]}]}\n```';
  const [c] = parseResult(txt);
  assert.equal(c.verdict, "nieweryfikowalne");
  assert.deepEqual(c.sources, [{ title: "GUS", url: "https://stat.gov.pl" }]);
});

test("isDuplicate wyłapuje to samo twierdzenie innymi słowami", () => {
  assert.ok(isDuplicate("Bezrobocie w Polsce wynosi 5 procent", ["Bezrobocie w Polsce wynosi 5 procent."]));
  assert.ok(!isDuplicate("Inflacja w strefie euro spadła", ["Bezrobocie w Polsce wynosi 5 procent"]));
});

test("unsupportedFeature rozpoznaje odrzucone narzędzie i format", () => {
  assert.equal(unsupportedFeature({ code: "subscription_sharing_unsupported_capability", param: "tools[0]" }), "webSearch");
  assert.equal(unsupportedFeature({ status: 400, param: "text.format" }), "structured");
  assert.equal(unsupportedFeature({ status: 400, message: "Invalid model" }), null);
  assert.equal(unsupportedFeature({ status: 500, param: "tools" }), null);
});

test("PKCE S256 zgodne z RFC 7636 (wektor testowy)", async () => {
  assert.equal(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

async function makeToken(payload, kid = "k1") {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${enc({ alg: "RS256", kid })}.${enc(payload)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(data));
  const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return { jwt: `${data}.${b64url(sig)}`, jwks: { keys: [{ ...jwk, kid }] } };
}

test("validateIdToken: poprawny token przechodzi, zły nonce/aud/podpis nie", async () => {
  const now = Date.now();
  const p = { iss: "https://auth.openai.com", aud: "oaiapp_1", sub: "u1", email: "a@b.c", nonce: "n1", exp: Math.floor(now / 1000) + 600 };
  const { jwt, jwks } = await makeToken(p);
  assert.equal((await validateIdToken(jwt, "oaiapp_1", "n1", { jwks, now })).sub, "u1");
  await assert.rejects(validateIdToken(jwt, "oaiapp_1", "zly", { jwks, now }), /nonce/);
  await assert.rejects(validateIdToken(jwt, "inny", "n1", { jwks, now }), /innego klienta/);
  const other = await makeToken(p);
  await assert.rejects(validateIdToken(jwt, "oaiapp_1", "n1", { jwks: other.jwks, now }), /podpis/);
  assert.equal(decodeJwt(jwt).payload.email, "a@b.c");
});
