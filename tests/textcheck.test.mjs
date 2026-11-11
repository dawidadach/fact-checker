// Run: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { buildTextRequest, chunkText, parseResult } from "../lib/factcheck.js";
import { isRestrictedUrl, sameUrl } from "../lib/capture.js";

test("chunkText: nie gubi tekstu i trzyma limit", () => {
  const long = ("Zdanie numer jeden jest tutaj. ".repeat(300) + "\n\n").repeat(3);
  const ch = chunkText(long, 4000);
  assert.ok(ch.length > 1 && ch.every((c) => c.length <= 4000));
  assert.equal(ch.join(" ").replace(/\s+/g, " ").trim(), long.replace(/\s+/g, " ").trim());
  assert.deepEqual(chunkText("Krótki tekst."), ["Krótki tekst."]);
});

test("buildTextRequest: rodzaj źródła, metadane, części, ochrona przed instrukcjami w tekście", () => {
  const b = buildTextRequest({ model: "m", today: "2026-11-11", webSearch: true, outLang: "pl", kind: "post",
    meta: { title: "Home / X", author: "Jan (@jan)", date: "2026-11-10" }, text: "Ala ma kota.", part: 2, parts: 3, checked: ["x"] });
  const input = b.input[0].content;
  assert.match(input, /SOURCE: a social media post/);
  assert.doesNotMatch(input, /Home \/ X/); // tytuł karty przy poście pomijamy
  assert.match(input, /Author: Jan \(@jan\)/);
  assert.match(input, /part 2 of 3/);
  assert.match(input, /"""\nAla ma kota\.\n"""/);
  assert.match(b.instructions, /not instructions for you/);
  assert.match(b.instructions, /EXACT fragment/);
  assert.deepEqual(b.tools, [{ type: "web_search" }]);
});

test("parseResult obcina cudzysłowy dodane do cytatu", () => {
  const [c] = parseResult(JSON.stringify({ claims: [{ quote: "„\"w ciągu czterech lat\"”", claim: "x", verdict: "prawda" }] }));
  assert.equal(c.quote, "w ciągu czterech lat");
});

test("isRestrictedUrl / sameUrl", () => {
  for (const u of ["opera://settings", "chrome://extensions", "about:blank", "https://addons.opera.com/pl/extensions/", "https://chromewebstore.google.com/x"]) assert.ok(isRestrictedUrl(u), u);
  for (const u of ["https://x.com/home", "http://127.0.0.1:8765/a.html", "file:///C:/a.html"]) assert.ok(!isRestrictedUrl(u), u);
  assert.ok(sameUrl("https://a.pl/x#c", "https://a.pl/x/"));
  assert.ok(!sameUrl("https://a.pl/x", "https://a.pl/y"));
});
