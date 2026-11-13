// Ikonka przy artykułach: lista serwisów, tryby, zgody, adresy i zapamiętane oceny.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_ORIGINS, ARTICLE_EXCLUDE, ARTICLE_SITES, MAX_MARKS, addMark, articleConfig, articleKey, cleanHost, covered, findMark, markView,
  siteOfHost, urlMatches, wantedOrigins,
} from "../lib/articlebuttons.js";
import { DICTIONARY } from "../lib/i18n.js";

const t = (k, v = {}) => (DICTIONARY.pl[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? "");

test("lista serwisów: polskie i zagraniczne, bez powtórek, poprawne wzorce", () => {
  const ids = ARTICLE_SITES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const pl = ARTICLE_SITES.filter((s) => s.group === "pl").map((s) => s.id);
  const world = ARTICLE_SITES.filter((s) => s.group === "world").map((s) => s.id);
  for (const id of ["onet.pl", "wp.pl", "interia.pl", "tvn24.pl", "rp.pl", "wyborcza.pl", "wpolityce.pl", "dorzeczy.pl", "oko.press", "polityka.pl", "pap.pl"]) assert.ok(pl.includes(id), id);
  for (const id of ["bbc.com", "nytimes.com", "reuters.com", "theguardian.com", "foxnews.com", "spiegel.de", "abcnews.go.com"]) assert.ok(world.includes(id), id);
  assert.ok(pl.length >= 35 && world.length >= 35);
  for (const s of ARTICLE_SITES) for (const o of s.origins) assert.match(o, /^https:\/\/(\*\.)?[a-z0-9.-]+\.[a-z]{2,}\/\*$/);
  // dokładny host tam, gdzie domena obejmuje dużo więcej niż serwis informacyjny
  assert.deepEqual(ARTICLE_SITES.find((s) => s.id === "abcnews.go.com").origins, ["https://abcnews.go.com/*"]);
  assert.deepEqual(ARTICLE_SITES.find((s) => s.id === "news.sky.com").origins, ["https://news.sky.com/*"]);
  // nic z serwisów, gdzie są ikonki przy postach
  assert.ok(!ARTICLE_SITES.some((s) => /facebook|twitter|(^|\.)x\.com/.test(s.id)));
});

test("tryby: domyślnie wyłączone; lista = wszystkie bez odznaczonych + dodane; wszędzie = https", () => {
  assert.equal(articleConfig({}).mode, "off");
  assert.equal(articleConfig(undefined).mode, "off");
  assert.equal(articleConfig({ articleButtons: "cokolwiek" }).mode, "off");
  assert.deepEqual(wantedOrigins(articleConfig({})), []);
  const list = articleConfig({ articleButtons: "list", articleSitesOff: ["onet.pl"], articleCustom: ["https://www.Blog-Test.pl/wpis", "zły host", "blog-test.pl"] });
  assert.equal(list.sites.length, ARTICLE_SITES.length - 1);
  assert.deepEqual(list.custom, ["blog-test.pl"]);
  const w = wantedOrigins(list);
  assert.ok(!w.includes("https://*.onet.pl/*") && w.includes("https://*.wp.pl/*") && w.includes("https://*.blog-test.pl/*"));
  assert.deepEqual(wantedOrigins(articleConfig({ articleButtons: "all", articleSitesOff: ["onet.pl"] })), ALL_ORIGINS);
});

test("hosty: dodawanie ręczne i przypisanie do serwisu z listy", () => {
  assert.equal(cleanHost("WWW.Example-News.com"), "example-news.com");
  assert.equal(cleanHost("https://www.blog-test.pl/wpis/1?x=1"), "blog-test.pl");
  assert.equal(cleanHost("localhost"), "");
  assert.equal(cleanHost("javascript:alert(1)"), "");
  assert.equal(siteOfHost("wiadomosci.onet.pl")?.id, "onet.pl");
  assert.equal(siteOfHost("www.bbc.co.uk")?.id, "bbc.co.uk");
  assert.equal(siteOfHost("abcnews.go.com")?.id, "abcnews.go.com");
  assert.equal(siteOfHost("espn.go.com"), null);
  assert.equal(siteOfHost("notonet.pl"), null);
});

test("zgody i dopasowanie adresów", () => {
  assert.ok(covered("https://*.onet.pl/*", ["https://*.onet.pl/*"]));
  assert.ok(covered("https://*.onet.pl/*", ["https://*/*"]));
  assert.ok(covered("https://*.onet.pl/*", ["<all_urls>"]));
  assert.ok(!covered("https://*.onet.pl/*", ["https://*.wp.pl/*"]));
  assert.ok(covered("https://abcnews.go.com/*", ["https://*.go.com/*"]));
  assert.ok(!covered("https://*/*", ["https://*.onet.pl/*"]));
  assert.ok(urlMatches("https://*.onet.pl/*", "https://wiadomosci.onet.pl/kraj/1"));
  assert.ok(urlMatches("https://*.onet.pl/*", "https://onet.pl/"));
  assert.ok(!urlMatches("https://*.onet.pl/*", "https://notonet.pl/"));
  assert.ok(!urlMatches("https://*.onet.pl/*", "http://onet.pl/"));
  assert.ok(urlMatches("https://*/*", "https://example.com/a"));
  assert.ok(urlMatches("https://abcnews.go.com/*", "https://abcnews.go.com/US/story"));
  assert.ok(!urlMatches("https://abcnews.go.com/*", "https://espn.go.com/"));
  assert.ok(ARTICLE_EXCLUDE.some((m) => urlMatches(m, "https://www.facebook.com/")));
  assert.ok(ARTICLE_EXCLUDE.some((m) => urlMatches(m, "https://x.com/home")));
});

test("adres artykułu do oceny: bez #, parametrów śledzących, www. i końcowego /", () => {
  assert.equal(articleKey("https://www.onet.pl/kraj/a/?utm_source=fb&fbclid=1#kom"), "onet.pl/kraj/a");
  assert.equal(articleKey("https://wiadomosci.onet.pl/kraj/test-artykul/abc123"), "wiadomosci.onet.pl/kraj/test-artykul/abc123");
  assert.equal(articleKey("https://example.com/news.php?b=2&id=7&utm_medium=x"), "example.com/news.php?b=2&id=7");
  assert.equal(articleKey("chrome://settings"), "");
  assert.equal(articleKey(""), "");
});

test("zapamiętane oceny: wygasają, limit wpisów, adres kanoniczny", () => {
  const now = Date.UTC(2026, 10, 13);
  const day = 86_400_000;
  let marks = addMark({}, ["a.pl/1", "a.pl/kanon", "a.pl/1"], { level: "mieszany", n: 3, at: now - day }, { now });
  assert.deepEqual(Object.keys(marks), ["a.pl/1", "a.pl/kanon"]);
  marks = addMark({ ...marks, "stary.pl/x": { level: "rzetelny", at: now - 40 * day } }, ["b.pl/2"], { verdict: "prawda", n: 1, at: now }, { now, maxAgeDays: 30 });
  assert.ok(!marks["stary.pl/x"] && marks["b.pl/2"]);
  assert.equal(findMark(marks, ["", "a.pl/kanon"], { now })?.level, "mieszany");
  assert.equal(findMark(marks, ["a.pl/1"], { now: now + 31 * day, maxAgeDays: 30 }), null);
  const many = {};
  for (let i = 0; i < MAX_MARKS + 50; i++) many[`s.pl/${i}`] = { n: 0, at: now - i };
  const cut = addMark(many, ["nowy.pl/1"], { n: 0, at: now + 1 }, { now });
  assert.equal(Object.keys(cut).length, MAX_MARKS);
  assert.ok(cut["nowy.pl/1"] && cut["s.pl/0"] && !cut[`s.pl/${MAX_MARKS + 49}`]);
});

test("znaczek: ocena całości, jedno twierdzenie, kilka bez oceny, nic do sprawdzenia", () => {
  assert.deepEqual(markView({ level: "wprowadza_w_blad" }, t), { label: "Wprowadza w błąd", tone: "bad" });
  assert.deepEqual(markView({ level: "rzetelny" }, t), { label: "Rzetelny", tone: "good" });
  assert.deepEqual(markView({ verdict: "prawda", n: 1 }, t), { label: "Prawda", tone: "good" });
  assert.deepEqual(markView({ verdict: "falsz", n: 4 }, t), { label: "Twierdzenia: 4", tone: "bad" });
  assert.deepEqual(markView({ n: 0 }, t), { label: "Brak twierdzeń do sprawdzenia", tone: "muted" });
  assert.equal(markView(null, t), null);
});
