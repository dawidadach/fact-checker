// Uruchom: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { findCut, Segmenter, SR, rms } from "../lib/transcribe.js";
import { cleanTranscript, MODELS, normalizeGain } from "../lib/models.js";

const tone = (sec, amp = 0.2) => Float32Array.from({ length: Math.round(SR * sec) }, (_, i) => amp * Math.sin(i / 5));
const silence = (sec) => new Float32Array(Math.round(SR * sec));
const concat = (...a) => { const out = new Float32Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };

test("findCut trafia w przerwę w mowie", () => {
  const a = concat(tone(10), silence(0.5), tone(1.5));
  const cut = findCut(a, a.length);
  assert.ok(cut > SR * 10 && cut < SR * 10.5, `cut=${cut / SR}s`);
});

test("Segmenter tnie w ciszy, pomija samą ciszę i nie gubi próbek", () => {
  const segs = [];
  const s = new Segmenter({ targetSec: 12, onSegment: (x) => segs.push(x) });
  const input = concat(tone(12.5), silence(0.6), tone(5), silence(20), tone(3));
  for (let i = 0; i < input.length; i += 4096) s.push(input.subarray(i, i + 4096));
  s.flush();
  assert.ok(segs.length >= 2, `segments=${segs.length}`);
  assert.ok(Math.abs(segs[0].length / SR - 12.8) < 0.5, `first=${segs[0].length / SR}`);
  for (const x of segs) assert.ok(rms(x) > 0.002 && x.length / SR <= 25);
});

test("Segmenter nie przekracza maxSec przy ciągłej mowie", () => {
  const segs = [];
  const s = new Segmenter({ targetSec: 12, maxSec: 25, onSegment: (x) => segs.push(x) });
  const input = tone(60);
  for (let i = 0; i < input.length; i += 4096) s.push(input.subarray(i, i + 4096));
  s.flush();
  assert.ok(segs.every((x) => x.length / SR <= 25.01));
  assert.equal(segs.reduce((n, x) => n + x.length, 0), input.length);
});

test("cleanTranscript wycina typowe halucynacje Whispera", () => {
  assert.equal(cleanTranscript("Napisy stworzone przez społeczność Amara.org"), "");
  assert.equal(cleanTranscript(" Dziękuję za uwagę. "), "");
  assert.equal(cleanTranscript("[Muzyka]"), "");
  assert.equal(cleanTranscript("Inflacja w październiku wyniosła 3,1 procent."), "Inflacja w październiku wyniosła 3,1 procent.");
  assert.equal(cleanTranscript("tak tak tak tak tak tak koniec"), "tak koniec");
});

test("katalog: po 3 modele na język, unikalne repo", () => {
  for (const l of ["pl", "en"]) assert.deepEqual(MODELS.filter((m) => m.lang === l).map((m) => m.tier), ["best", "mid", "light"]);
  assert.equal(new Set(MODELS.map((m) => m.repo)).size, MODELS.length);
});

test("Segmenter nie gubi cichej mowy (szczyt ok. 0,03)", () => {
  const segs = [];
  const s = new Segmenter({ targetSec: 12, onSegment: (x) => segs.push(x) });
  const input = concat(tone(10, 0.02), silence(0.8), tone(10, 0.2), silence(1));
  for (let i = 0; i < input.length; i += 4096) s.push(input.subarray(i, i + 4096));
  s.flush();
  assert.ok(segs[0].length / SR > 9.5 && segs[0].length / SR < 11.5, `first=${segs[0].length / SR}`);
});

test("cleanTranscript zwija pętle całych fraz i ucina nadmiar słów", () => {
  const loop = "Wydaje mi się, " + "że to jest to, ".repeat(40) + "koniec.";
  assert.equal(cleanTranscript(loop), "Wydaje mi się, że to jest to, koniec.");
  const long = Array.from({ length: 200 }, (_, i) => `slowo${i}`).join(" ");
  assert.ok(cleanTranscript(long, 10).split(" ").length <= 51);
});

test("normalizeGain podbija cichy dźwięk, nie przesterowuje głośnego", () => {
  const quiet = tone(1, 0.06); normalizeGain(quiet);
  assert.ok(Math.max(...quiet) > 0.85 && Math.max(...quiet) <= 0.9001);
  const loud = tone(1, 0.95); normalizeGain(loud);
  assert.ok(Math.max(...loud) <= 0.95001);
});
