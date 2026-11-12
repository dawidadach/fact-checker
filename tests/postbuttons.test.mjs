// Ikonka przy postach: osobno dla Facebooka i X, z przejściem ze starej wspólnej opcji.
import test from "node:test";
import assert from "node:assert/strict";
import { POST_ORIGINS, POST_SITES, postSitesOn } from "../lib/postbuttons.js";

test("ikonka przy postach: osobne serwisy, stara wspólna opcja włącza oba", () => {
  assert.deepEqual(postSitesOn({}), { fb: false, x: false });
  assert.deepEqual(postSitesOn(undefined), { fb: false, x: false });
  assert.deepEqual(postSitesOn({ postButtons: true }), { fb: true, x: true });
  assert.deepEqual(postSitesOn({ postButtons: true, postButtonsX: false }), { fb: true, x: false });
  assert.deepEqual(postSitesOn({ postButtonsFb: true }), { fb: true, x: false });
  assert.deepEqual(POST_SITES.fb.origins, ["https://*.facebook.com/*"]);
  assert.deepEqual(POST_SITES.x.origins, ["https://*.x.com/*", "https://*.twitter.com/*"]);
  assert.equal(POST_ORIGINS.length, 3);
});
