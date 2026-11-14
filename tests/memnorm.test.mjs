// Pamięć werdyktów: liczby różniące się tylko kropką, przecinkiem, minusem, % itp. to RÓŻNE teksty (zgłosił voytas_).
import test from "node:test";
import assert from "node:assert/strict";
import { normText, textHash } from "../lib/memory.js";

test("liczby z innym znakiem to inny tekst (inny skrót)", async () => {
  const pairs = [
    ["Realna stopa procentowa wynosi 2.5%", "Realna stopa procentowa wynosi 25%"],
    ["Inflacja wyniosła -3%", "Inflacja wyniosła 3%"],
    ["Inflacja wyniosła −3%", "Inflacja wyniosła 3%"],
    ["Spotkanie o 10:30", "Spotkanie o 1030"],
    ["3/4 Polaków", "34 Polaków"],
    ["1,5 mln osób", "15 mln osób"],
    ["poniżej <5%", "poniżej 5%"],
    ["wzrost o 25%", "wzrost o 25"],
    ["koszt 5 €", "koszt 5"],
    ["temperatura -5°C", "temperatura 5°C"],
    ["wypadki 3, 4 i 5", "wypadki 34 i 5"],
    ["w 3 4 przypadkach", "w 34 przypadkach"],
  ];
  for (const [a, b] of pairs) {
    assert.notEqual(normText(a), normText(b), `${a} | ${b}`);
    assert.notEqual(await textHash(a), await textHash(b), `${a} | ${b}`);
  }
});

test("ten sam tekst w innym zapisie – nadal ten sam skrót", async () => {
  const pairs = [
    ["Wynosi 2,5%", "wynosi 2.5 %"],
    ["Wisła – jest NAJdłuższa!", "wisła jest najdłuższa"],
    ["Inflacja − 3 %", "inflacja -3%"],
    ["Polska - Niemcy 2:1.", "polska niemcy 2 : 1"],
    ["Rok 2024. Wzrost 5%.", "rok 2024 wzrost 5%"],
    ["1 000 000 zł", "1000000 zł"],
    ["„Cytat” – (dopisek)…", "cytat dopisek"],
  ];
  for (const [a, b] of pairs) {
    assert.equal(normText(a), normText(b), `${a} | ${b}`);
    assert.equal(await textHash(a), await textHash(b), `${a} | ${b}`);
  }
  assert.equal(normText("Realna stopa wynosi 2.5%"), "realnastopawynosi2.5%");
});
