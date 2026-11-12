// Poziom źródła przy linku – wyłącznie po domenie, bez modelu (0 tokenów). Widać od razu, czy werdykt stoi
// na danych i dokumentach, czy na artykule prasowym albo wpisie w mediach społecznościowych.
// Kolejność sprawdzania: dokładne reguły (domena + ścieżka) → domeny → końcówki (.gov.pl, .gov, .edu…).

export const TIERS = ["dane", "dokument", "nauka", "urzad", "sondaz", "factcheck", "encyklopedia", "media", "social"];
export const TIER_TONE = {
  dane: "good", dokument: "good", nauka: "good", urzad: "info", sondaz: "info", factcheck: "info", encyklopedia: "muted", media: "muted", social: "warn",
};

// [domena (bez www), poziom] – domena pasuje też do subdomen (bdl.stat.gov.pl → stat.gov.pl).
const DOMAINS = [
  // dane: statystyka i instytucje niezależne od cyklu wyborczego
  ...["stat.gov.pl", "nbp.pl", "zus.pl", "ecb.europa.eu", "oecd.org", "worldbank.org", "imf.org", "who.int", "ilo.org", "fao.org",
    "unesco.org", "data.un.org", "bls.gov", "bea.gov", "census.gov", "federalreserve.gov", "eia.gov", "ons.gov.uk", "destatis.de", "insee.fr", "istat.it",
    "ine.es", "cso.ie", "statista.com", "ourworldindata.org", "bis.org", "iea.org", "copernicus.eu", "imgw.pl", "noaa.gov", "nasa.gov"].map((d) => [d, "dane"]),
  // dokument: prawo, parlament, sądy
  ...["sejm.gov.pl", "senat.gov.pl", "dziennikustaw.gov.pl", "monitorpolski.gov.pl", "legislacja.gov.pl", "trybunal.gov.pl", "sn.pl", "nsa.gov.pl",
    "orzeczenia.ms.gov.pl", "orzeczenia.nsa.gov.pl", "eur-lex.europa.eu", "europarl.europa.eu", "curia.europa.eu", "consilium.europa.eu",
    "congress.gov", "govinfo.gov", "supremecourt.gov", "federalregister.gov", "legislation.gov.uk", "parliament.uk", "prezydent.pl"].map((d) => [d, "dokument"]),
  // nauka: recenzowane publikacje i bazy
  ...["pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "doi.org", "arxiv.org", "nature.com", "science.org", "sciencedirect.com", "springer.com",
    "wiley.com", "thelancet.com", "nejm.org", "bmj.com", "jamanetwork.com", "cochranelibrary.com", "jstor.org", "plos.org", "frontiersin.org",
    "mdpi.com", "academic.oup.com", "tandfonline.com", "cambridge.org", "pnas.org", "cell.com", "scholar.google.com", "semanticscholar.org",
    "pbn.nauka.gov.pl", "ipcc.ch"].map((d) => [d, "nauka"]),
  // sondaże
  ...["cbos.pl", "ibris.pl", "ipsos.com", "kantar.com", "kantarpublic.com", "opinia24.pl", "panelariadna.pl", "socialchanges.pl", "ogb.pl",
    "unitedsurveys.pl", "yougov.com", "yougov.co.uk", "pewresearch.org", "gallup.com", "eurobarometer.europa.eu"].map((d) => [d, "sondaz"]),
  // fact-checking
  ...["demagog.org.pl", "konkret24.tvn24.pl", "sprawdzam.afp.com", "factcheck.afp.com", "fakehunter.pap.pl", "politifact.com", "snopes.com",
    "fullfact.org", "leadstories.com", "factcheck.org", "euvsdisinfo.eu", "checkyourfact.com", "healthfeedback.org", "sciencefeedback.co",
    "correctiv.org", "maldita.es", "newtral.es", "pagellapolitica.it", "logically.ai", "factchecknet.org"].map((d) => [d, "factcheck"]),
  ...["wikipedia.org", "britannica.com", "wikidata.org"].map((d) => [d, "encyklopedia"]),
  // media społecznościowe i platformy
  ...["x.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com", "youtube.com", "youtu.be", "threads.net", "bsky.app", "reddit.com",
    "linkedin.com", "t.me", "telegram.org", "wykop.pl", "substack.com", "medium.com", "rumble.com"].map((d) => [d, "social"]),
  // media
  ...["pap.pl", "tvn24.pl", "polsatnews.pl", "rmf24.pl", "rmf.fm", "wp.pl", "onet.pl", "interia.pl", "gazeta.pl", "wyborcza.pl", "rp.pl", "money.pl",
    "bankier.pl", "businessinsider.com.pl", "dziennik.pl", "gazetaprawna.pl", "forsal.pl", "wprost.pl", "polityka.pl", "newsweek.pl", "tvp.info",
    "tvp.pl", "polskieradio.pl", "radiozet.pl", "natemat.pl", "oko.press", "wpolityce.pl", "dorzeczy.pl", "niezalezna.pl", "pb.pl", "spidersweb.pl",
    "tokfm.pl", "300polityka.pl", "notesfrompoland.com", "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "nytimes.com", "washingtonpost.com",
    "theguardian.com", "ft.com", "wsj.com", "bloomberg.com", "cnn.com", "nbcnews.com", "cbsnews.com", "abcnews.go.com", "npr.org", "politico.com",
    "politico.eu", "axios.com", "economist.com", "dw.com", "euronews.com", "aljazeera.com", "foxnews.com", "usatoday.com", "latimes.com", "time.com",
    "theatlantic.com", "newyorker.com", "lemonde.fr", "spiegel.de", "zeit.de", "faz.net", "elpais.com", "corriere.it", "kyivindependent.com",
    "euractiv.com", "theverge.com", "wired.com", "arstechnica.com", "forbes.com", "cnbc.com", "marketwatch.com", "independent.co.uk",
    "telegraph.co.uk", "sky.com", "france24.com", "rferl.org", "meduza.io"].map((d) => [d, "media"]),
];
// Dokładniejsze reguły z adresem (domena wspólna dla kilku poziomów).
const PATHS = [
  [/^ec\.europa\.eu\/eurostat/, "dane"],
  [/^reuters\.com\/fact-check/, "factcheck"],
  [/^apnews\.com\/hub\/ap-fact-check/, "factcheck"],
  [/^isap\.sejm\.gov\.pl/, "dokument"],
  [/^api\.sejm\.gov\.pl/, "dokument"],
  [/^bdl\.stat\.gov\.pl/, "dane"],
  [/^oko\.press\/.*(fact-?check|sprawdzam)/, "factcheck"],
];
// Końcówki domen, gdy domena nie jest na listach.
const SUFFIXES = [
  [/(^|\.)gov\.pl$/, "urzad"], [/(^|\.)europa\.eu$/, "urzad"], [/(^|\.)gov$/, "urzad"], [/(^|\.)gov\.uk$/, "urzad"], [/(^|\.)mil$/, "urzad"],
  [/(^|\.)edu$/, "nauka"], [/(^|\.)edu\.pl$/, "nauka"], [/(^|\.)ac\.uk$/, "nauka"],
];
const MAP = new Map(DOMAINS);

// URL → poziom (np. "dane") albo "" (nieznany – bez plakietki).
export function sourceTier(url) {
  let u;
  try { u = new URL(url); } catch { return ""; }
  if (!/^https?:$/.test(u.protocol)) return "";
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const full = `${host}${u.pathname.toLowerCase()}`;
  for (const [re, tier] of PATHS) if (re.test(full)) return tier;
  for (let h = host; h.includes("."); h = h.slice(h.indexOf(".") + 1)) {
    if (MAP.has(h)) return MAP.get(h);
  }
  for (const [re, tier] of SUFFIXES) if (re.test(host)) return tier;
  return "";
}

// Ile źródeł z każdego poziomu (np. do podsumowania karty).
export function tierCounts(sources = []) {
  const out = {};
  for (const s of sources) { const k = sourceTier(s.url); if (k) out[k] = (out[k] || 0) + 1; }
  return out;
}
