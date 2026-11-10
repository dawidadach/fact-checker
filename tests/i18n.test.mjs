// Run: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { DICTIONARY, resolveLang, setLang, t } from "../lib/i18n.js";
import { MODELS } from "../lib/models.js";
import { VERDICTS } from "../lib/factcheck.js";

test("en i pl mają te same klucze i te same {zmienne}", () => {
  const { en, pl } = DICTIONARY;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(pl).sort());
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(en)) assert.equal(vars(en[k]), vars(pl[k]), k);
});

test("każdy werdykt, poziom pewności i model ma tłumaczenie", () => {
  for (const lang of ["en", "pl"]) {
    setLang(lang);
    for (const v of Object.keys(VERDICTS)) assert.notEqual(t(`verdict.${v}`), `verdict.${v}`);
    for (const c of ["wysoka", "srednia", "niska"]) assert.notEqual(t(`conf.${c}`), `conf.${c}`);
    for (const m of MODELS) { assert.ok(m.note.en && m.note.pl); assert.notEqual(t(`models.tier.${m.tier}`), `models.tier.${m.tier}`); }
  }
});

test("t() podstawia zmienne, resolveLang wybiera język", () => {
  setLang("pl");
  assert.equal(t("status.new", { n: 2, total: 5 }), "Nowe: 2 · łącznie 5");
  setLang("en");
  assert.equal(t("status.new", { n: 2, total: 5 }), "New: 2 · total 5");
  assert.equal(resolveLang("pl"), "pl");
  assert.equal(resolveLang("en"), "en");
  assert.ok(["pl", "en"].includes(resolveLang("auto")));
});
