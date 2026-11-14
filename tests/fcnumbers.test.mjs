// Gotowe fact-checki redakcji: inna liczba albo inny rok = fact-check innego twierdzenia.
import test from "node:test";
import assert from "node:assert/strict";
import { numbersOf, relevance } from "../lib/factcheckapi.js";

test("liczby: 2,5 = 2.5, 1 000 = 1000, lata osobno", () => {
  const n = numbersOf("W 2026 roku 2,5% z 1 000 osób");
  assert.deepEqual([...n.years], ["2026"]);
  assert.deepEqual([...n.other].sort(), ["1000", "2.5"]);
});

test("inna liczba albo inny rok – nie pasuje; ta sama albo brak liczb – może pasować", () => {
  const c = { claim: "Inflacja w Polsce wyniosła 2,5% w październiku 2026", keywords: "inflacja Polska 2,5% październik" };
  assert.equal(relevance(c, { claim: "Inflacja w Polsce wyniosła 25% w październiku 2026", title: "" }), 0);
  assert.ok(relevance(c, { claim: "Inflacja w Polsce wyniosła 2.5% w październiku 2026", title: "" }) > 0.5);
  assert.ok(relevance(c, { claim: "Inflacja w Polsce spada w październiku", title: "Czy inflacja w Polsce spada?" }) > 0.34);
  assert.equal(relevance({ claim: "Inflacja w Polsce w 2023 roku była najwyższa w UE" }, { claim: "Inflacja w Polsce w 2019 roku była najwyższa w UE", title: "" }), 0);
});

test("opis w manifeście: najwyżej 132 znaki (limit Chrome Web Store), nazwa skrócona ≤ 12", async () => {
  const { readFileSync } = await import("node:fs");
  for (const loc of ["en", "pl"]) {
    const m = JSON.parse(readFileSync(new URL(`../_locales/${loc}/messages.json`, import.meta.url), "utf8"));
    assert.ok(m.extDescription.message.length <= 132, `${loc}: ${m.extDescription.message.length}`);
    assert.ok(m.extName.message.length <= 75, loc);
  }
  const man = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.ok(man.short_name.length <= 12);
});
