// Ikonka „słuchaj tego filmu” w odtwarzaczu YouTube: opcja, zgoda, przesyłanie dźwięku (PCM ↔ base64).
import test from "node:test";
import assert from "node:assert/strict";
import { MEDIA_ORIGINS, decodePcm, encodePcm, mediaOn } from "../lib/mediabuttons.js";

test("opcja domyślnie wyłączona, zgoda tylko na youtube.com", () => {
  assert.equal(mediaOn({}), false);
  assert.equal(mediaOn(undefined), false);
  assert.equal(mediaOn({ mediaButtonsYt: true }), true);
  assert.deepEqual(MEDIA_ORIGINS, ["https://*.youtube.com/*"]);
});

test("PCM 16-bit: kodowanie i dekodowanie bez zniekształceń", () => {
  const src = new Float32Array(4096);
  for (let i = 0; i < src.length; i++) src[i] = Math.sin(i / 7) * 0.8;
  src[0] = 1; src[1] = -1; src[2] = 0; src[3] = 2; src[4] = -2; // przesterowanie przycinamy do ±1
  const out = decodePcm(encodePcm(src));
  assert.equal(out.length, src.length);
  for (let i = 5; i < src.length; i++) assert.ok(Math.abs(out[i] - src[i]) < 1e-4, `próbka ${i}`);
  assert.ok(Math.abs(out[0] - 1) < 1e-4 && out[1] === -1 && out[2] === 0 && Math.abs(out[3] - 1) < 1e-4 && out[4] === -1);
  assert.equal(encodePcm(src).length, Math.ceil((src.length * 2) / 3) * 4); // ~11 KB na 0,25 s
});
