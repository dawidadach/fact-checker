// Chwyty erystyczne i techniki perswazji: słownik w samej wtyczce (definicja i „jak odpowiedzieć” po polsku
// i angielsku), a model zwraca tylko numer chwytu, krótki cytat i jedno zdanie – tak jest najtaniej w tokenach.
// To nie werdykt: chwyt nie znaczy, że teza jest fałszywa, tylko że argument jest zbudowany nieuczciwie.

export const TRICKS = {
  falszywy_dylemat: {
    en: "false dilemma",
    name: { pl: "Fałszywy dylemat", en: "False dilemma" },
    def: { pl: "Pokazuje tylko dwie skrajne możliwości, choć są też inne.", en: "Offers only two extreme options when there are others." },
    answer: { pl: "Wskaż trzecią możliwość i zapytaj, czemu ją pominięto.", en: "Name a third option and ask why it was left out." },
  },
  ad_hominem: {
    en: "attack on the person",
    name: { pl: "Atak na osobę", en: "Ad hominem" },
    def: { pl: "Zamiast odpowiedzieć na argument, podważa osobę, która go wygłasza.", en: "Attacks the person instead of answering the argument." },
    answer: { pl: "Oddziel osobę od argumentu – nawet trafny zarzut wobec kogoś nie obala tego, co mówi.", en: "Separate the person from the argument – even a fair criticism of someone doesn't refute what they say." },
  },
  chochol: {
    en: "straw man",
    name: { pl: "Chochoł", en: "Straw man" },
    def: { pl: "Przeinacza stanowisko drugiej strony i obala tę łatwiejszą, zmyśloną wersję.", en: "Distorts the other side's position and knocks down the easier, made-up version." },
    answer: { pl: "Przypomnij, co naprawdę zostało powiedziane, i poproś o odpowiedź na to.", en: "Restate what was actually said and ask for an answer to that." },
  },
  whataboutism: {
    en: "whataboutism",
    name: { pl: "„A u was…”", en: "Whataboutism" },
    def: { pl: "Odpowiada na zarzut wytknięciem cudzych błędów zamiast się do niego odnieść.", en: "Answers a criticism by pointing at someone else's faults instead of addressing it." },
    answer: { pl: "Cudze błędy nie unieważniają zarzutu – wróć do pytania.", en: "Other people's faults don't cancel the criticism – go back to the question." },
  },
  anegdota: {
    en: "anecdote as proof",
    name: { pl: "Dowód anegdotyczny", en: "Anecdotal evidence" },
    def: { pl: "Jedna historia albo pojedynczy przypadek ma dowodzić ogólnej reguły.", en: "One story or a single case is used to prove a general rule." },
    answer: { pl: "Zapytaj o dane dla całej grupy – jeden przypadek niczego nie przesądza.", en: "Ask for data on the whole group – one case settles nothing." },
  },
  wybiorcze_fakty: {
    en: "cherry-picking",
    name: { pl: "Wybiórcze fakty", en: "Cherry-picking" },
    def: { pl: "Pokazuje tylko dane wygodne dla tezy, a resztę pomija (np. dobrany okres albo wskaźnik).", en: "Shows only the data that suits the claim and leaves out the rest (e.g. a hand-picked period or measure)." },
    answer: { pl: "Sprawdź pełny obraz: dłuższy okres, inne wskaźniki, porównanie z innymi.", en: "Look at the full picture: a longer period, other measures, a comparison." },
  },
  rownia_pochyla: {
    en: "slippery slope",
    name: { pl: "Równia pochyła", en: "Slippery slope" },
    def: { pl: "Twierdzi, że mały krok nieuchronnie doprowadzi do katastrofy, bez uzasadnienia kolejnych kroków.", en: "Claims a small step will inevitably lead to disaster without justifying each step." },
    answer: { pl: "Zapytaj, dlaczego każdy następny krok miałby rzeczywiście nastąpić.", en: "Ask why each next step would actually happen." },
  },
  falszywy_autorytet: {
    en: "false or irrelevant authority",
    name: { pl: "Fałszywy autorytet", en: "False authority" },
    def: { pl: "Powołuje się na autorytet spoza dziedziny, anonimowych „ekspertów” albo przekręca czyjeś słowa.", en: "Cites an authority from another field, anonymous “experts”, or twists someone's words." },
    answer: { pl: "Sprawdź, kto to jest, czy zna się na temacie i co naprawdę powiedział.", en: "Check who it is, whether they know the subject and what they actually said." },
  },
  ad_populum: {
    en: "bandwagon – popularity as proof",
    name: { pl: "Odwołanie do większości", en: "Bandwagon" },
    def: { pl: "„Wszyscy wiedzą”, „większość uważa” – popularność ma dowodzić prawdy.", en: "“Everybody knows”, “most people think” – popularity is offered as proof." },
    answer: { pl: "Popularność nie jest dowodem – zapytaj o fakty.", en: "Popularity is not evidence – ask for the facts." },
  },
  straszenie: {
    en: "appeal to fear",
    name: { pl: "Straszenie", en: "Appeal to fear" },
    def: { pl: "Wywołuje lęk zamiast podać argument.", en: "Stirs up fear instead of giving an argument." },
    answer: { pl: "Zapytaj, jak duże jest zagrożenie naprawdę i skąd to wiadomo.", en: "Ask how big the threat really is and how we know." },
  },
  my_oni: {
    en: "us vs them",
    name: { pl: "My kontra oni", en: "Us vs them" },
    def: { pl: "Dzieli ludzi na „naszych” i „obcych”, żeby ocena zależała od przynależności, a nie od faktów.", en: "Splits people into “us” and “them” so that judgement depends on the side, not the facts." },
    answer: { pl: "Oceniaj twierdzenie, nie to, kto je wypowiada.", en: "Judge the claim, not who makes it." },
  },
  pytanie_sugerujace: {
    en: "insinuating question (just asking)",
    name: { pl: "Pytanie z tezą", en: "Insinuating question" },
    def: { pl: "Sugeruje oskarżenie w formie pytania („Czy to przypadek, że…?”), bez żadnego dowodu.", en: "Hints at an accusation in the form of a question (“Is it a coincidence that…?”) without evidence." },
    answer: { pl: "Zapytaj wprost: na jakiej podstawie to sugerujesz?", en: "Ask directly: what is this based on?" },
  },
  przyczyna_skutek: {
    en: "false cause",
    name: { pl: "Fałszywa przyczyna", en: "False cause" },
    def: { pl: "Skoro B nastąpiło po A (albo razem z A), to A ma być przyczyną B.", en: "Because B followed A (or came with it), A is said to have caused B." },
    answer: { pl: "Zapytaj o inne wyjaśnienia – to, że coś dzieje się razem, nie znaczy, że jedno powoduje drugie.", en: "Ask about other explanations – happening together doesn't mean one causes the other." },
  },
  falszywa_pilnosc: {
    en: "false urgency",
    name: { pl: "Presja czasu", en: "False urgency" },
    def: { pl: "„Teraz albo nigdy”, „ostatnia szansa” – ma skłonić do decyzji bez namysłu. Częste w oszustwach.", en: "“Now or never”, “last chance” – pushes you to decide without thinking. Common in scams." },
    answer: { pl: "Prawdziwa okazja wytrzyma chwilę sprawdzenia – zwolnij.", en: "A real opportunity survives a moment of checking – slow down." },
  },
  galop_gisha: {
    en: "Gish gallop – a flood of claims",
    name: { pl: "Galop Gisha", en: "Gish gallop" },
    def: { pl: "Zasypuje lawiną twierdzeń, których nie da się sprawdzić na bieżąco.", en: "Floods the listener with more claims than can be checked on the spot." },
    answer: { pl: "Wybierz jedno–dwa najważniejsze twierdzenia i sprawdź je dokładnie.", en: "Pick the one or two most important claims and check them properly." },
  },
};
export const TRICK_IDS = Object.keys(TRICKS);
export const trickName = (id, lang = "pl") => TRICKS[id]?.name[lang] || TRICKS[id]?.name.en || id;

const LANG_NAMES = { pl: "Polish", en: "English" };

// Dopisek do instrukcji (krótki: same nazwy – definicje zna model i ma je wtyczka).
export function trickRules({ outLang = "pl", max = 3, live = false } = {}) {
  return [
    `techniques: rhetorical tricks that the ${live ? "speaker" : "author or a quoted person"} actually USES in the ${live ? "NEW excerpt" : "text"} (not ones they merely describe or report). Report a trick when the quote itself clearly shows it – also in headlines, captions and quoted comments the author repeats to make a point (e.g. a conditional warning presented as a certain threat = straszenie). At most ${max}; empty array if none.`,
    "Emotional words or a strong opinion alone are not a trick. Do not flag a claim only because it is false – that is what the verdict is for.",
    `For each: id; quote – the exact fragment (5–25 words, copied verbatim like claim quotes); speaker – as for claims; why – one short sentence in ${LANG_NAMES[outLang] || "English"} saying why this fragment is that trick.`,
    `ids: ${TRICK_IDS.map((id) => `${id} = ${TRICKS[id].en}`).join("; ")}.`,
  ];
}

export const TRICKS_PROP = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["id", "quote", "speaker", "why"],
    properties: {
      id: { type: "string", enum: TRICK_IDS },
      quote: { type: "string" },
      speaker: { type: "string" },
      why: { type: "string" },
    },
  },
};
// Schemat odpowiedzi z dodatkowym polem „techniques” (strict: wszystkie pola wymagane).
export function withTricks(schema) {
  return { ...schema, required: [...schema.required, "techniques"], properties: { ...schema.properties, techniques: TRICKS_PROP } };
}

const QUOTES = /^["'„“”«»‚‘’]+|["'„“”«»‚‘’]+$/g;
// bez linków i markdownu (factcheck.js importuje ten moduł – tu nie importujemy z powrotem)
const plain = (s) => String(s || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\(?\s*https?:\/\/\S+\s*\)?/g, "").replace(/\*\*/g, "").replace(/\s{2,}/g, " ");
const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Odpowiedź modelu → [{ trick, quote, speaker, why }]; nieznane id i puste cytaty odpadają, bez powtórek.
export function parseTricks(text, { max = 3, seen = [] } = {}) {
  let obj;
  try {
    const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    obj = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  } catch { return []; }
  const out = [];
  const known = seen.map((x) => `${x.trick}|${norm(x.quote)}`);
  for (const x of Array.isArray(obj?.techniques) ? obj.techniques : []) {
    if (!x || !TRICKS[x.id]) continue;
    const quote = String(x.quote || "").trim().replace(QUOTES, "").trim();
    const why = plain(x.why).trim();
    if (!quote || !why) continue;
    const key = `${x.id}|${norm(quote)}`;
    if (known.includes(key)) continue;
    known.push(key);
    out.push({ trick: x.id, quote, speaker: String(x.speaker || "").trim(), why });
    if (out.length >= max) break;
  }
  return out;
}

// Liczba chwytów według mówcy (raport z debaty).
export function tricksBySpeaker(tricks = []) {
  const m = new Map();
  for (const x of tricks) {
    const k = x.speaker || "";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
