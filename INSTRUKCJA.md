# Fact Checker – instrukcja (Chrome, Edge i Opera)

Rozwinięcie wtyczki [dawidadach/fact-checker](https://github.com/dawidadach/fact-checker) (v0.4.1): sprawdzanie faktów
na żywo w rozmowach (wideo, podcasty), w artykułach, postach z Facebooka i X oraz w memach i infografikach.
Jeden kod działa w **Chrome**, **Edge** i **Operze**.

## Instalacja

### Chrome
1. Rozpakuj `fact-checker-chrome.zip`.
2. Wejdź na **`chrome://extensions`** i włącz **Tryb dewelopera** (prawy górny róg).
3. Kliknij **Załaduj rozpakowane** i wskaż folder `fact-checker-chrome` (ten z plikiem `manifest.json`).
4. Przypnij ikonę: puzzel **Rozszerzenia** na pasku narzędzi → pinezka przy Fact Checker.

Jeśli masz już starszą wersję Fact Checkera (np. pobraną wcześniej z GitHuba), nie usuwaj jej – podmień pliki w tym samym
folderze i kliknij **Przeładuj** (to ta sama wtyczka, z tym samym identyfikatorem, więc ustawienia i historia zostają).

### Microsoft Edge
1. Rozpakuj `fact-checker-edge.zip`.
2. Wejdź na **`edge://extensions`** i włącz **Tryb dewelopera** (przełącznik w lewym panelu, na dole).
3. Kliknij **Załaduj rozpakowane** i wskaż folder `fact-checker-edge` (ten z plikiem `manifest.json`).
4. Przypnij ikonę: puzzel **Rozszerzenia** na pasku narzędzi → ikona oka **Pokaż na pasku narzędzi** przy Fact Checker.
5. Kliknięcie ikony otwiera panel z prawej strony okna (pasek boczny Edge) – tak jak w Chrome.

Edge może przy starcie przypominać o wyłączeniu rozszerzeń w trybie dewelopera – wybierz, żeby je zostawić.

### Opera
1. Rozpakuj `fact-checker-opera.zip`.
2. Wejdź na **`opera://extensions`** i włącz **Tryb programisty** (prawy górny róg).
3. Kliknij **Załaduj rozpakowane** i wskaż folder `fact-checker-opera`.
4. Przypnij ikonę: kostka **Rozszerzenia** na pasku narzędzi → pinezka przy Fact Checker.
5. (Opcjonalnie) Dodaj panel do paska bocznego Opery: menu **⋯** na dole paska bocznego → zaznacz **Fact Checker**.

### Aktualizacja (każda przeglądarka)
Podmień pliki w tym samym folderze i kliknij **Przeładuj** przy wtyczce – nie usuwaj jej, bo stracisz logowanie,
klucze, pobrane modele i historię.

## Jak używać

**Chrome:** włącz film/podcast i kliknij ikonę Fact Checkera *będąc na tej karcie* – otworzy się panel boczny Chrome
→ ⚙ ustawienia → **Start**. Menu pod prawym przyciskiem i skrót Alt+Shift+F też otwierają panel.

**Opera** (nie ma panelu bocznego Chrome) – dwa sposoby:

- **Ikona na pasku narzędzi** (najprościej): kliknij ikonę Fact Checkera *będąc na karcie z filmem*.
  Otworzy się małe okno z panelem przy prawej krawędzi przeglądarki → ⚙ ustawienia → **Start**.
- **Pasek boczny Opery**: otwórz Fact Checker z paska bocznego, a potem kliknij ikonę na pasku narzędzi na karcie
  z rozmową (to daje wtyczce zgodę na nagrywanie tej karty bez dodatkowych okienek). Jeśli tego nie zrobisz,
  po **Start** pojawi się okno „Udostępnij kartę” – wybierz kartę i zostaw włączone udostępnianie dźwięku.

**Dźwięk karty czy mikrofon?** „Dźwięk karty” słucha konkretnej karty (tej, którą masz przed sobą w chwili
kliknięcia Start) – źródło w panelu ma jej tytuł, a gdy w tej karcie przełączysz film na YouTube, powstaje nowe źródło
z nowym tytułem. „Mikrofon” słucha dźwięku z otoczenia (np. telewizora albo głośników) – wtyczka nie wie wtedy, co gra,
więc źródło nazywa się po prostu „Mikrofon”.

Przyciski w panelu (Start, 📄 Artykuł, 👆 Wskaż post, ✂ Zaznaczenie) zawsze działają na karcie, którą masz teraz przed sobą.

Dalej jak w oryginale: lokalny model mowy (⚙ → Modele lokalne), a do sprawdzania faktów logowanie **Continue with ChatGPT**,
klucz API albo inny dostawca (Gemini, Claude, OpenRouter – niżej).

## Sprawdzanie tekstu ze strony (artykuły, Facebook, X)

Wtyczka **nigdy nie czyta strony sama**. Tekst trafia do sprawdzenia tylko wtedy, gdy go wskażesz – i tylko ten fragment.

Trzy sposoby:

- **Zaznaczenie** – zaznacz tekst → prawy przycisk → **Sprawdź fakty: „…”**. Albo skrót **Alt+Shift+F**
  (bez zaznaczenia skrót włącza tryb wskazywania). Działa też w PDF-ach otwartych w przeglądarce (bez podświetlania).
- **Artykuł** – przycisk **📄 Artykuł** w panelu albo prawy przycisk na stronie → **Sprawdź fakty w tym artykule**.
  Wtyczka bierze tylko treść artykułu (tryb czytnika): bez menu, reklam, polecanych linków i komentarzy.
- **Wskaż post** – przycisk **👆 Wskaż post** albo prawy przycisk → **Wskaż post lub fragment do sprawdzenia**.
  Najedź na post (podświetli się ramką) i kliknij. **Shift+klik** – dodaj i wskazuj dalej (kilka postów/komentarzy
  po kolei, dodane mają zieloną ramkę); ↑/↓ – większy/mniejszy fragment; Esc – koniec.
  Z posta brany jest **tylko sam post** – bez komentarzy, odpowiedzi i przycisków. Komentarz możesz sprawdzić,
  wskazując albo zaznaczając właśnie jego.

Tekst dłuższy niż 2000 znaków (albo skrócony post z „Zobacz więcej”) najpierw pokazuje się w oknie **„Co wyślę do
sprawdzenia”** – możesz go przyciąć albo anulować. Bardzo długie teksty są dzielone na części (maks. ok. 48 000 znaków).

Po sprawdzeniu zdania **podświetlają się na stronie** kolorem werdyktu (zielony – prawda, żółty – półprawda,
czerwony – fałsz / wprowadza w błąd, szary – brak danych). Najechanie myszką pokazuje dymek z werdyktem, a przycisk
**↗ Pokaż na stronie** na karcie przewija stronę do zdania. Podświetlenia nie zmieniają treści strony i znikają po jej
odświeżeniu.

**Dostęp do stron.** Prawy przycisk, skrót i kliknięcie ikony wtyczki dają jednorazowy dostęp do bieżącej karty.
Przyciski w panelu działają na karcie, na której wcześniej kliknąłeś ikonę wtyczki – jeśli nie, panel to podpowie
i zaproponuje **„Zezwól na stałe dla …”** (np. dla x.com czy facebook.com), żeby nie klikać ikony za każdym razem.
Na stronach ustawień, nowej karcie i w sklepie z dodatkami przeglądarka nie pozwala wtyczkom czytać tekstu.

Skrót klawiszowy zmienisz w `chrome://extensions/shortcuts` (Chrome) albo `opera://extensions` → *Skróty klawiaturowe* (Opera).

## Kto sprawdza fakty (dostawcy modeli)

W ⚙ → *Model do sprawdzania faktów* wybierasz dostawcę. Każdy ma osobny klucz i osobno zapamiętany model;
klucze zostają tylko w przeglądarce. Przy każdym jest link „Jak zdobyć klucz”, przycisk sprawdzenia klucza
i informacja, czy model ma wyszukiwanie w sieci i czy przyjmuje obrazki.

| Dostawca | Logowanie | Koszt | Wyszukiwanie w sieci | Obrazki |
|---|---|---|---|---|
| **ChatGPT** | konto Plus/Pro | w ramach planu | tak | tak |
| **OpenAI** | klucz API | za użycie | tak | tak |
| **Google Gemini** | klucz z [AI Studio](https://aistudio.google.com/apikey) | **jest darmowy limit** (bez karty) | tak – Google; darmowa pula miesięczna, potem płatne | tak |
| **Anthropic Claude** | klucz z [konsoli](https://console.anthropic.com/settings/keys) | za użycie | tak – trzeba je **włączyć w konsoli** (~1 cent / wyszukiwanie) | tak |
| **OpenRouter** | klucz z [openrouter.ai](https://openrouter.ai/settings/keys) | za użycie; są modele darmowe | tak (~2 centy / wyszukiwanie lub wg dostawcy) | zależy od modelu |

- **Nie masz ChatGPT?** Najprościej: Gemini z darmowym kluczem z Google AI Studio.
- **Claude Pro/Max** nie da się podpiąć – Anthropic nie pozwala używać subskrypcji w innych aplikacjach; potrzebny klucz API.
- Gdy skończy się darmowa pula wyszukiwań Gemini, wtyczka sprawdza dalej **bez wyszukiwania** i wyraźnie o tym pisze.
- Model OpenRoutera bez obsługi obrazków dostaje sam tekst (wtyczka wie to z listy modeli).
- Prywatność Gemini: w EOG (w tym w Polsce) Google nie używa przesłanych treści do ulepszania modeli także przy
  darmowym kluczu; poza EOG może – wtedy nie wysyłaj danych prywatnych.
- Zamiana mowy na tekst nie zależy od dostawcy: lokalny model działa bez żadnego klucza.

## Memy, infografiki, wykresy, zdjęcia

Trzy sposoby (jak przy tekście – sprawdzane jest tylko to, co wskażesz):

- **Prawy przycisk na obrazku → „Sprawdź fakty na obrazku”.** Jeśli obrazek jest w poście, idzie razem z tekstem posta.
- **👆 Wskaż post** – post z X/FB idzie razem ze swoimi obrazkami (maks. 4, bez awatarów i emoji, bez komentarzy).
  Można też wskazać sam duży obrazek na dowolnej stronie.
- **🔲 Wycinek** (przycisk w panelu albo prawy przycisk → „Wytnij fragment ekranu do sprawdzenia”) – przeciągasz
  prostokąt; działa ze wszystkim, co widać: obrazki „nieklikalne”, wykresy rysowane przez stronę, klatka filmu.

Wtyczka robi **zrzut tego, co widać na ekranie** (nie pobiera plików z serwerów FB/X) – obrazek musi być widoczny;
część poza ekranem jest pomijana. Przed wysłaniem zawsze pokazuje się **podgląd z miniaturami** (✕ – nie wysyłaj).

Co sprawdza model: tekst na obrazku (odczytuje go), **cytaty przypisane osobom** (czy ktoś to naprawdę powiedział),
**wykresy** (obcięte osie, wybrany przedział, różne skale, brak źródła – pole „Problemy z grafiką”), **zrzuty
tweetów/nagłówków** (czy istniały), **zdjęcia** (nie zgaduje pochodzenia – odsyła do wyszukiwania obrazem),
**satyrę** (werdykt „Satyra / żart” zamiast „Fałsz”).

W panelu każdy obrazek ma kartę: miniatura (kliknij – powiększ), typ (mem, wykres, zdjęcie…), **tekst odczytany
z obrazka**, uwagi i **Szukaj obrazem: Google Lens / TinEye / Yandex** – pokazują, gdzie i kiedy ten obraz pojawił
się wcześniej (najlepszy sposób na zdjęcia wyrwane z kontekstu). Dla wycinka: „📋 Kopiuj obraz” i wklej (Ctrl+V)
w Google Lens. Na stronie obrazek dostaje **kolorową ramkę z plakietką** werdyktów; po najechaniu – lista werdyktów.

**Dostęp:** zrzut wymaga jednorazowej zgody na kartę – daje ją prawy przycisk albo kliknięcie ikony wtyczki na tej
karcie. Jeśli użyjesz przycisku w panelu bez tej zgody, tekst i tak zostanie sprawdzony, a panel zaproponuje
„Zezwól na stałe na zrzuty na wszystkich stronach”. Jeśli Twoje konto/model nie przyjmuje obrazków, wtyczka
sprawdzi sam tekst i to napisze.

## Sesje i historia

**Sesja = jedno posiedzenie.** Wszystko, co sprawdzasz – wideo, posty, artykuły, zaznaczenia, wpisany tekst – trafia
do bieżącej sesji i zostaje na ekranie. Karty są pogrupowane według **źródła** (nagłówek z ikoną: 🔊 wideo, 🎙️ mikrofon,
📄 artykuł, 💬 post, ✂️ zaznaczenie, ⌨️ wpisany tekst); najświeższe źródło jest na górze, starsze można zwinąć ▾.

Nowa sesja zaczyna się tylko, gdy:
- klikniesz **Nowa sesja** (w sekcji Transkrypcja), albo
- wrócisz po przerwie dłuższej niż ustawiona w ⚙ → *Zapisywanie* (domyślnie **3 godziny**; 0 = tylko ręcznie).

Zamknięcie i ponowne otwarcie panelu nie zaczyna nowej sesji – ostatnia wraca sama, jeśli przerwa była krótsza.
Ten sam film po Stop/Start to dalej to samo źródło; inny film – nowe źródło w tej samej sesji.

- **🕘 Historia** (obok ⚙): lista sesji (tytuł = pierwsze źródło, „(+2)” = ile jeszcze), wyszukiwarka, **Otwórz**,
  **Eksport .md** (sekcja na każde źródło), **Usuń**. Otwarta sesja przyjmuje kolejne sprawdzenia.
- Opcja **Po Stop zapisz też plik .md** – plik ląduje w `Pobrane/Fact Checker/`.
- Historia jest usuwana tylko razem z wtyczką – przy aktualizacji używaj „Przeładuj”, nie „Usuń”.

## Jak poznać, że wtyczka pracuje

- **Pasek pod nagłówkiem panelu**: animowana linia + etap pracy („Łączę się z ChatGPT…”, „Model analizuje tekst…”,
  „Szukam w sieci (wyszukiwania: 3)…”, „Werdykty: 2…”), licznik sekund i przycisk **Przerwij**.
  W trakcie nasłuchu wideo: czerwony pasek „Słucham: … · sprawdzenie za 18 s”.
- **Karta „sprawdzam…”** w grupie sprawdzanego źródła, dopóki nie pojawią się werdykty.
- **Znaczek na ikonie wtyczki** (widać go też przy schowanym panelu): **…** – sprawdzam, **●** – słucham,
  **liczba** – tyle nowych werdyktów.
- **Na stronie** (tekst ze strony): przerywana ramka wokół sprawdzanego posta/fragmentu i komunikat w prawym dolnym
  rogu z etapem i czasem; po zakończeniu – ile jest werdyktów.

## Kolejka

Możesz dorzucać kolejne teksty, nie czekając na wynik: zaznaczenie, artykuł, wskazany post, wpisany tekst –
wszystko trafia do **kolejki** i jest sprawdzane po kolei (także w trakcie nasłuchu wideo). Kolejka jest widoczna
w panelu („Czeka na sprawdzenie (3)”) – pozycję usuniesz ✕, całość „Wyczyść kolejkę”. Na stronie pojawia się
komunikat „dodano do kolejki (pozycja N)”, a ten sam tekst nie wejdzie do kolejki dwa razy.
Długie teksty (podgląd „Co wyślę”) zatwierdzasz od razu przy dodawaniu – potem sprawdzają się już same.

## Karta z werdyktem

Pod werdyktem i cytatem jest **„Sprawdzane twierdzenie”** (wyróżnione tłem) – to teza, którą sprawdzamy, a nie
stwierdzenie wtyczki – a pod nią **„Ocena”**, czyli wyjaśnienie werdyktu. Tak samo w dymku na stronie.

Na dole karty:

- **👍 / 👎** – oceń werdykt. Po 👎 napisz krótko, co jest nie tak (zły werdykt, nieaktualne dane, nikt tego nie
  powiedział…). Drugie kliknięcie cofa ocenę. Wszystkie oceny wyeksportujesz w 🕘 Historii przyciskiem
  **„Eksportuj oceny (JSON)”** – plik zawiera werdykt, model, sprawdzany tekst i Twój komentarz, więc nadaje się
  do poprawiania promptów.
- **📋 Kopiuj jako odpowiedź** – okienko z komentarzem do wklejenia pod postem, napisanym ludzkim językiem i
  dopasowanym do posta (panel mówi formalnie, komentarz – jak człowiek w dyskusji). Szczegóły niżej.
- **📚 Sprawdzali to też fact-checkerzy** – patrz niżej.

Nad listą werdyktów są liczniki (Prawda: 3 · Fałsz: 2…) i przycisk **„Tylko problematyczne”**, który zostawia na
ekranie tylko półprawdy, manipulacje i fałsze. Każde źródło ma też własne liczniki.

## Odpowiedź do wklejenia

**📋 Kopiuj jako odpowiedź** (pod werdyktem) albo **💬 Odpowiedz na cały post** (przy źródle z kilkoma werdyktami)
otwiera okienko z gotowym komentarzem:

- Trzy tony: **Rzeczowo** (3–6 zdań, spokojnie), **Na luzie** (2–3 zdania) i **Krótko pod X** (mieści się w 280
  znakach, z jednym linkiem – licznik pokazuje długość tak, jak liczy ją X). Przy postach z X od razu wybiera się
  krótka wersja; poza tym – ostatnio używana zakładka.
- Zakładka **Oryginał** – tekst werdyktu tak jak w panelu, bez przeróbek przez AI (nic nie kosztuje).
  „↺ Przywróć oryginał” cofa Twoje poprawki.
- Każda wersja pisze się **tylko raz**: możesz przełączać zakładki w trakcie pisania albo zamknąć okienko – tekst
  dokończy się w tle i będzie czekał. ✓ przy zakładce = gotowe, … = właśnie się pisze.
- Komentarz pisze wybrany model na żądanie (bez wyszukiwania, ułamek centa; w planie ChatGPT bez dopłat) –
  **wyłącznie na podstawie gotowego werdyktu**, bez dokładania nowych faktów. Język i styl dopasowuje do posta, ale
  zawsze spokojnie i bez atakowania autora. Przy niskiej pewności werdyktu komentarz to zaznacza.
- Źródła dokleja wtyczka jako zwykłe adresy z krótkim opisem (Facebook i X nie pokazują linków w Markdown),
  na końcu jest dopisek, że tekst powstał z pomocą AI.
- Tekst można poprawić przed skopiowaniem; **↻ Napisz od nowa** daje nową wersję. Napisane teksty (z poprawkami)
  zostają przy werdykcie – ponowne otwarcie nic nie kosztuje.
- Bez sieci, po dziennym limicie albo przy błędzie modelu pojawia się wersja z szablonu (bez AI) z ostrzeżeniem.

## Gotowe fact-checki (Google Fact Check)

Opcjonalnie wtyczka sprawdza, czy redakcje fact-checkingowe (np. Demagog, AFP Sprawdzam, Konkret24, PolitiFact)
już oceniły dane twierdzenie – w bazie Google Fact Check (ta sama co w Google Fact Check Explorer). Wynik pojawia się
na karcie z oceną redakcji i linkiem, a gdy redakcja oceniła coś odwrotnie niż model – z ostrzeżeniem ⚠.

Jak włączyć (za darmo):
1. W Google Cloud Console włącz **Fact Check Tools API** (link jest w ⚙).
2. **Interfejsy API i usługi → Dane logowania → Utwórz dane logowania → Klucz API.**
3. Wklej klucz w ⚙ → „Gotowe fact-checki”, kliknij „Sprawdź klucz”, zapisz.

Do Google idzie tylko kilka słów kluczowych każdego twierdzenia, nigdy cały tekst. Baza zawiera tylko artykuły
oznaczone przez redakcje standardem ClaimReview, więc przy wielu twierdzeniach nic się nie znajdzie – to normalne.

## Data wypowiedzi i mówcy

Przy każdym źródle jest **📅 data**: z metadanych artykułu, posta albo filmu (YouTube), „na żywo” dla mikrofonu i
transmisji, albo „nieznana”. Model ocenia wypowiedzi **według stanu na ten dzień** – stary wywiad o „inflacji 18%”
z lutego 2023 nie wyjdzie jako fałsz. Datę poprawisz przyciskiem ✎.

W trakcie nagrywania pod przyciskiem Start jest pasek **🗣 Teraz mówi:** – wpisz imię i nazwisko (Enter) albo kliknij
kogoś z listy, gdy zmienia się mówca. Werdykty, transkrypcja i raport przypiszą wypowiedzi tej osobie. „Auto” =
model ustala mówcę z kontekstu (tylko gdy jest pewny).

## Pamięć werdyktów

Ten sam tekst albo obrazek (np. mem, który krąży od tygodni) sprawdzony ponownie dostaje wynik **od razu z pamięci**
– z datą sprawdzenia, bez kosztów, czekania i bez okna podglądu (nic nie jest wysyłane).

- **Każdy obrazek jest rozpoznawany osobno**: mem kliknięty sam rozpozna się także wtedy, gdy wcześniej sprawdzałeś
  go jako część posta (i odwrotnie). Znany obrazek w nowym poście: wynik obrazka z pamięci, do modelu idzie tylko tekst.
- Obrazki rozpoznawane są po „odcisku” – zrzut w innym rozmiarze albo z inną kompresją pasuje, ale ten sam szablon
  mema z innym napisem już nie. Drobna zmiana małego tekstu (np. jednej cyfry drobnym drukiem) może przejść
  niezauważona – porównaj wtedy „Tekst odczytany z obrazka” z tym, co widzisz.
- Przy takim źródle jest przycisk **↻ Sprawdź ponownie**, który wymusza świeże sprawdzenie (z podglądem).
- Po aktualizacji wtyczka jednorazowo dodaje do pamięci to, co sprawdzałeś wcześniej (z historii).
W ⚙ ustawisz, jak długo wyniki są pamiętane (domyślnie 30 dni, 0 = wyłączone), i wyczyścisz pamięć.

## Koszty i tryby

- **Licznik kosztów** pod listą werdyktów: koszt sesji i całego dnia (szacunek wg cenników dostawców; OpenRouter
  podaje koszt dokładnie; plan ChatGPT – tylko liczba tokenów, bez dopłat). Szczegóły po najechaniu myszą.
- **Dzienny limit wydatków** (⚙ → Koszty): po jego przekroczeniu automatyczne sprawdzanie staje, a wskazane teksty
  czekają w kolejce. Przy 80% pojawia się ostrzeżenie; „Kontynuuj dziś mimo to” wznawia pracę do północy.
- Gdy model nie jest w cenniku, wpisz jego cenę w ⚙ → „Własna cena modelu”.
- **Tryb sprawdzania**: *oszczędny* (do 3 twierdzeń na fragment, oszczędne wyszukiwanie, co 60 s),
  *normalny* (do 5, co 30 s), *dokładny* (do 8, kilka źródeł na twierdzenie, co 20 s).

Dokładne rozliczenie jest zawsze w panelu dostawcy – tam też najbezpieczniej ustawić twardy limit wydatków.

## Raport z sesji (np. z debaty)

**Raport** (pod transkrypcją albo przy sesji w 🕘 Historii) otwiera sesję jako czytelny dokument: liczby, rozkład
werdyktów, tabela mówców, wszystkie werdykty ze źródłami i obrazkami. **Drukuj / zapisz jako PDF** albo
**Pobierz HTML** (jeden plik, otworzy się w każdej przeglądarce).

## Prywatność

- Szczegóły: **⚙ → Polityka prywatności** (plik `PRIVACY.md`) – co, dokąd i kiedy jest wysyłane.
- **Ukrywaj osoby**: na zrzutach zamazuje zdjęcia profilowe i nazwy autorów, a z tekstu do modelu usuwa autora
  posta i @uchwyty. W podglądzie przed wysłaniem widać, co dokładnie pójdzie do modelu.
- **Pamiętaj klucze API po zamknięciu przeglądarki** – wyłącz, żeby klucze znikały po zamknięciu przeglądarki.
  „Usuń wszystkie klucze” kasuje je od razu. Klucze nie są szyfrowane – używaj kluczy z limitem wydatków.

## Chrome, Edge i Opera – różnice

| | Chrome | Edge | Opera |
|---|---|---|---|
| Panel | natywny panel boczny | panel boczny Edge (to samo co w Chrome) | pasek boczny Opery albo małe okno obok przeglądarki |
| Rozpoznawanie mowy | lokalny model, OpenAI albo wbudowane w przeglądarkę (mikrofon) | jak w Chrome | lokalny model albo OpenAI (wbudowane nie działa w Operze) |
| Ustawienia mikrofonu | `chrome://settings/content/microphone` | `edge://settings/content/microphone` | `opera://settings/content/microphone` |

Wszystko inne – sprawdzanie tekstu, obrazków, sesje, historia, kolejka, dostawcy modeli – działa tak samo.

## Dla programistów

```
npm test              # testy jednostkowe (node --test)
npm run build         # dist/fact-checker-chrome(.zip), dist/fact-checker-edge(.zip) i dist/fact-checker-opera(.zip)
```

Kod jest wspólny; katalog główny to wersja dla Chrome (ładuje się bez budowania, jak w oryginale).
Edge używa tego samego manifestu co Chrome (ma to samo API panelu bocznego).
`scripts/build.mjs` tworzy wersję dla Opery, zamieniając w manifeście `side_panel` na `sidebar_action`.
Wtyczka sama rozpoznaje przeglądarkę (`chrome.sidePanel` jest tylko w Chrome).

Najważniejsze pliki: `lib/providers.js` (Gemini / Claude / OpenRouter), `lib/llm.js` (OpenAI), `lib/factcheck.js`
(prompt i schemat odpowiedzi), `lib/history.js` (sesje, eksport ocen), `lib/capture.js` + `content/page.js` (tekst i
obrazki ze stron, zamazywanie, data filmu), `lib/shot.js` (zrzuty obrazków), `lib/pricing.js` (cenniki i tryby),
`lib/factcheckapi.js` (Google Fact Check), `lib/memory.js` (pamięć werdyktów), `lib/report.js` (raport),
`lib/reply.js` (odpowiedź do wklejenia),
`lib/vendor/Readability.js` (Mozilla, Apache 2.0).

Ceny w `lib/pricing.js` są orientacyjne (listopad 2026) – przy zmianie cenników wystarczy poprawić tabelę.

## Uwagi

- Brak WebGPU w ustawieniach modeli? Włącz akcelerację sprzętową i uruchom przeglądarkę ponownie:
  Chrome – **Ustawienia → System → Używaj akceleracji graficznej, gdy jest dostępna**;
  Opera – **Ustawienia → Przeglądarka → System → Używaj akceleracji sprzętowej, gdy jest dostępna**.
- Wtyczka ma stały identyfikator (`key` w manifeście) – dlatego aktualizacja przez „Przeładuj” zachowuje dane.
