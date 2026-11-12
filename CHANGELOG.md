# Lista zmian – Fact Checker

Rozwinięcie wtyczki [dawidadach/fact-checker](https://github.com/dawidadach/fact-checker) (punkt wyjścia: v0.4.1).

## 0.7.1 – 12 listopada 2026

- **Chwyty erystyczne:** gdy model nie znajdzie żadnego, pod kartami jest linijka „🎭 Brak wyraźnych chwytów erystycznych”. Wcześniej nie było nic i nie było wiadomo, czy chwyty w ogóle były sprawdzane. Pamięć werdyktów zapamiętuje także ten wynik.
- **Instrukcja dla modelu przestała go zniechęcać do zgłaszania chwytów:**
  - usunięte zdanie „w większości tekstów ich nie ma”, które ciągnęło odpowiedź do pustej listy;
  - model ma teraz patrzeć także na nagłówki, podpisy i cytowane komentarze, którymi autor coś udowadnia (np. warunkowe ostrzeżenie podane jako pewne zagrożenie = straszenie);
  - zostają: tylko wyraźne przypadki i najwyżej 3 na tekst.

## 0.7.0 – 12 listopada 2026

### Ostrzeżenie przed oszustwem
- **Ramka „⚠ Możliwe oszustwo”** (czerwona) albo **„Sygnały typowe dla oszustw”** (pomarańczowa) nad oceną całości: powody z cytatem albo adresem, rada i gdzie zgłosić (incydent.cert.pl, SMS 8080, „Zgłoś reklamę” na Facebooku).
- **Lista Ostrzeżeń CERT Polska:**
  - wtyczka pobiera cały publiczny plik domen (najwyżej raz na 12 h, leniwie, w tle) i sprawdza adresy u siebie;
  - wpis obejmuje subdomeny;
  - ucięty albo pusty plik nie zastępuje dobrej kopii.
- **Adresy udające marki** – banki, płatności, kurierzy, sklepy, gov.pl/mObywatel, media:
  - nazwa marki w obcym adresie, marka w subdomenie, podmienione znaki (0/o, 1/l, rn/m);
  - literówki – tylko w adresach banków, płatności, kurierów i sklepów;
  - strona przedstawiająca się jako marka pod innym adresem, znaki z innych alfabetów, sam adres IP.
- **Linki z posta** są teraz zbierane, z rozpakowaniem przekierowań Facebooka i Google. Sprawdzane są też adresy wpisane w tekst.
- **Sformułowania (PL i EN):** obietnica zysku, platforma inwestycyjna, „sekret”, presja czasu, prośba o dane albo płatność, kontakt poza serwisem, nagroda.
- **Bez fałszywych alarmów:**
  - pojedyncze sformułowanie albo sama końcówka adresu nie ostrzega;
  - na znanych serwisach (media, urzędy, nauka) treść i adresy w tekście się nie liczą, bo artykuł o oszustwach to nie oszustwo.
- **0 tokenów na samo wykrywanie.** Model dostaje krótką uwagę tylko przy znalezionych sygnałach. Ocena całości powstaje wtedy nawet przy jednym twierdzeniu, a model potwierdza w niej rodzaj „Możliwe oszustwo” albo uznaje alarm za fałszywy.
- **Ostrzeżenie trafia też** do historii (plakietka ⚠), raportu i eksportu Markdown.
- **Ustawienia „Ochrona przed oszustwami”:** obie opcje są domyślnie włączone; jest też stan listy CERT i „Odśwież listę”.
- **Nowe uprawnienie:** hole.cert.pl.

### Poprawki
- **Pamięć werdyktów:** zapisy idą po kolei. Dwa zapisy tuż po sobie (np. po „Sprawdź dokładniej” i nowej ocenie całości) zostawiały wcześniej dwa wpisy, a odczyt brał starszy.
- **Pisownia:** „Na podstawie 1 sprawdzonego twierdzenia” (zamiast „1 sprawdzonych twierdzeń”).

## 0.6.0 – 12 listopada 2026

### Chwyty erystyczne
- **Wykrywanie 15 chwytów:** fałszywy dylemat, atak na osobę, chochoł, „a u was…”, dowód anegdotyczny, wybiórcze fakty, równia pochyła, fałszywy autorytet, odwołanie do większości, straszenie, „my kontra oni”, pytanie z tezą, fałszywa przyczyna, presja czasu, galop Gisha.
- **Lista „🎭 Chwyty erystyczne” pod kartami:** nazwa, cytat, mówca, „dlaczego” oraz rozwijane „Na czym polega · jak odpowiedzieć”.
- **Na stronie** chwyty mają osobny, fioletowy kolor (przerywane podkreślenie) i dymek. Licznik „podświetlone na stronie” liczy tylko werdykty.
- **To nie werdykt.** Model zgłasza tylko wyraźne przypadki: najwyżej 3 na tekst, 2 na fragment rozmowy.
- **Mało tokenów:** definicje i „jak odpowiedzieć” (PL i EN) są zapisane we wtyczce, a model zwraca tylko numer, cytat i jedno zdanie.
  - Pomiar tokenizerem: +430 tokenów na zapytanie i ok. 50 na znaleziony chwyt.
  - Przy wyszukiwaniu w sieci to zwykle 2–5% więcej; bez wyszukiwania ok. 15–20%.
- **Gdzie jeszcze trafiają:**
  - pamięć werdyktów – ten sam artykuł pokazuje chwyty bez zapytania;
  - historia (plakietka 🎭), raport (osobna sekcja i kolumna „Chwyty” w tabeli mówców), eksport Markdown;
  - zapytanie o ocenę całości.
- **Przełącznik** w ⚙ → Tryb sprawdzania, domyślnie włączony.

### Ocena całości: rodzaj treści i brakująca strona
- **Rodzaj treści:** wiadomość, opinia, opinia podana jako wiadomość, wpis prywatny, materiał wyborczy, reklama, satyra, możliwe oszustwo. Ostrzeżenia mają kolor.
- **Nowy punkt ⚖:** czyjego głosu albo jakiej strony brakuje.
- **Koszt:** oba pola są w tym samym zapytaniu, które już szło, więc kosztują kilkadziesiąt tokenów.

### Poziom źródła przy linkach
- **Plakietki:** dane, dokument, nauka, urząd, sondaż, fact-check, encyklopedia, media, social media.
- **Bez modelu:** wtyczka rozpoznaje poziom po domenie i ścieżce (np. ec.europa.eu/eurostat to dane, reuters.com/fact-check to fact-check) – 0 tokenów.
- **Także w raporcie HTML/PDF.**

### Sprawdź dokładniej
- **Po 👎 przycisk „🔍 Sprawdź dokładniej”** sprawdza jedno twierdzenie od zera w trybie dokładnym (do 8 wyszukiwań, źródła pierwotne).
- **Co dostaje model:** fragment tekstu wokół cytatu, poprzedni werdykt i komentarz użytkownika. Komentarz to tylko wskazówka, co sprawdzić – werdykt zmienia się tylko, gdy dowody to potwierdzą.
- **„Druga opinia”:** można wybrać innego dostawcę, który ma w ⚙ klucz i wybrany model.
- **Karta po sprawdzeniu:**
  - pokazuje nowy werdykt i dopisek „Sprawdzone dokładniej (dostawca · model) – wcześniej: …” albo „werdykt bez zmian”;
  - pamięć, podświetlenia i ocena całości aktualizują się same.
- **Eksport ocen** przypisuje ocenę sprzed ponownego sprawdzenia do poprzedniego werdyktu i dopisuje wynik nowego.

### Poprawki
- **Przenoszenie historii do pamięci** (jednorazowe) nie nadpisuje już świeższego wpisu. Wcześniej mogło zgubić ocenę całości albo chwyty z pamięci.

## 0.5.6 – 12 listopada 2026

### Ustawienia
- **Języki na samej górze.** Pod każdym jest opis tego, co zmienia:
  - język interfejsu to także język werdyktów, oceny całości i raportu;
  - język rozmowy służy do rozpoznawania mowy i szukania gotowych fact-checków.
- **Grupa „Słuchanie na żywo – debaty, podcasty, filmy”** zbiera zamianę mowy na tekst, modele lokalne i rytm słuchania. Opis grupy mówi, że to tylko do przycisku Start, a artykuły, posty i obrazki działają bez tego.
- **Pokazuje się tylko to, co dotyczy wybranego sposobu:** lista modeli przy modelu lokalnym, model transkrypcji przy OpenAI. Każdy sposób ma krótki opis.
- **„Rytm słuchania” z wyjaśnieniami:**
  - co ile sekund transkrypcja idzie do sprawdzenia i jak to wpływa na koszt (z wartościami trybów pracy);
  - co zmienia długość kawałka nagrania.

### Model mowy dopiero przy słuchaniu
- **Okienko „Zamiana mowy na tekst” zamiast komunikatu „Pobierz model w ustawieniach”** – pojawia się, gdy klikasz Start, a transkrypcja nie jest gotowa.
- **Model lokalny (zalecany):**
  - wtyczka proponuje model pasujący do języka rozmowy i komputera, a obok link do lżejszego;
  - pobieranie pokazuje pasek postępu i trwa dalej po zamknięciu okienka;
  - po pobraniu przycisk „▶ Zacznij słuchać” (kliknięcie jest potrzebne, bo przeglądarka wymaga go do zgody na kartę lub mikrofon).
- **Zamienniki:** OpenAI (tylko dźwięk karty) albo rozpoznawanie wbudowane w przeglądarkę (tylko mikrofon, Chrome i Edge).
- **Model już pobrany wybiera się sam.**
- **Okienko podaje powód**, gdy wybrany sposób nie pasuje do źródła (OpenAI z mikrofonem, wbudowane z dźwiękiem karty) albo brakuje klucza OpenAI.

## 0.5.5 – 12 listopada 2026

### Ocena całości
- **„Ocena całości” nad kartami artykułu, posta, mema czy infografiki** – od 2 twierdzeń albo przy twierdzeniu z uwagami do obrazka. Dla dźwięku jej nie ma (jest raport).
- **5 nazwanych poziomów zamiast liczby:** Rzetelny · Rzetelny, z drobnymi błędami · Mieszany · Wprowadza w błąd · Nierzetelny, a do tego „Nie do oceny”. Poziom jest pokazany na pasku z 5 pól.
- **Jedno-dwa zdania i punkty** ✓ co się zgadza, ✗ co jest fałszywe lub mylące, ⚠ czego brakuje.
- **Waga, nie liczba werdyktów:**
  - model wskazuje, które twierdzenia są główną tezą;
  - wtyczka pilnuje, żeby poziom nie był łagodniejszy niż ich werdykty: fałsz w tezie to co najmniej „Wprowadza w błąd”, fałsz w szczególe – co najmniej „z drobnymi błędami”;
  - gdy nic nie jest złe, ocena nie może być gorsza niż „Mieszany”.
- **Osobne, małe zapytanie po werdyktach**, bez wyszukiwania, tylko z werdyktów i uwag do obrazków. Dzięki temu widzi też werdykty z pamięci i z kolejnych części długiego tekstu.
- **Nowa ocena przy zmianie werdyktów**, a ↻ pisze ją jeszcze raz.
- **Ocena trafia też gdzie indziej:**
  - do pamięci werdyktów – ten sam artykuł albo mem pokazuje ją od razu, bez zapytania;
  - do historii (plakietka przy sesji), raportu HTML/PDF i eksportu Markdown;
  - do „Odpowiedz na cały post”, która zaczyna od głównej tezy.
- **Ustawienie** „Podsumowuj artykuły i posty” (⚙ → Tryb pracy), domyślnie włączone. Po wyłączeniu jest przycisk „Podsumuj całość”.

### Zwinięte karty
- **Karty zwinięte do jednej linii** (werdykt i twierdzenie), gdy ocena całości jest gotowa. Problemy są na górze: fałsz, wprowadza w błąd, półprawda.
- **Klik w kartę rozwija szczegóły**, a „Rozwiń karty” rozwija wszystkie naraz.

### Poprawki
- **Licznik kosztów** nie gubi już zapytania, gdy dwa kończą się w tym samym momencie (np. sprawdzenie i odpowiedź do wklejenia). Wcześniej dzienna suma mogła być zaniżona.

## 0.5.4 – 11 listopada 2026

### Microsoft Edge
- **Osobna paczka dla Edge** (`fact-checker-edge.zip`; `npm run build` tworzy teraz trzy paczki). Edge ma to samo API panelu bocznego co Chrome, więc kod jest wspólny.
- **Instrukcja instalacji w Edge** i tabela różnic Chrome / Edge / Opera.
- **Teksty niezależne od przeglądarki:**
  - wbudowane rozpoznawanie mowy działa w Chrome i Edge;
  - komunikat o zgodzie na mikrofon podaje adres ustawień właściwej przeglądarki (`chrome://`, `edge://` albo `opera://`).

## 0.5.3 – 11 listopada 2026

### Pamięć obrazków
- **Każdy obrazek jest rozpoznawany osobno, niezależnie od tekstu.** Wcześniej pamięć porównywała całą treść naraz (tekst + obrazki), więc ten sam mem kliknięty sam, po wcześniejszym sprawdzeniu całego posta, był traktowany jako nowy.
- **Trzy przypadki:**

  | Co wskazujesz | Co się dzieje |
  |---|---|
  | Ten sam tekst i te same obrazki | Cały wynik z pamięci. |
  | Sam obrazek | Wynik z pamięci, nawet jeśli był sprawdzany w innym poście. |
  | Znany obrazek w nowym poście | Wynik obrazka z pamięci, a do modelu idzie tylko tekst – taniej i bez dublowania werdyktów. |

- **Pamięć jest sprawdzana przed podglądem.** Wynik z pamięci pojawia się od razu, bez okna podglądu, bo nic nie jest wysyłane.
- **„Sprawdź ponownie” pokazuje podgląd** przed wysłaniem.
- **Nowy odcisk obrazka**: dHash 240 bitów i porównanie bloków miniatury 128×128.
  - Ten sam obrazek pasuje w innym rozmiarze i przy innej kompresji.
  - Ten sam szablon mema z innym napisem albo infografika z podmienioną dużą liczbą **nie** są uznawane za ten sam obrazek.
  - Progi ustalone na pomiarach, m.in. na dwóch prawdziwych zrzutach tego samego obrazka.
  - Ograniczenie: zmiana drobnego tekstu (kilka pikseli) może przejść niezauważona. Dlatego wynik z pamięci zawsze pokazuje datę i odczytany wtedy tekst obrazka.
- **Jednorazowe przeniesienie historii do pamięci**: wcześniej sprawdzone teksty i obrazki (z okresu pamięci, domyślnie 30 dni) też są rozpoznawane.

### Poprawki
- **Zapis sesji co najwyżej 4 s po zmianie i od razu po każdym sprawdzeniu.** Wcześniej seria szybkich sprawdzeń odsuwała zapis, więc po zamknięciu panelu ostatnie wyniki mogły nie trafić do historii.

## 0.5.2 – 11 listopada 2026

### Odpowiedź do wklejenia
- **Nowa zakładka „Oryginał”**: tekst werdyktu tak jak w panelu (twierdzenie, ocena, wyjaśnienie, źródła), bez przeróbek przez AI i bez zapytania do modelu.
  - Poprawki są zapamiętywane.
  - „↺ Przywróć oryginał” cofa zmiany.
- **Każda wersja odpowiedzi pisze się tylko raz.**
  - Wcześniej przełączenie zakładki w trakcie pisania przerywało je, więc po powrocie tekst pisał się od nowa.
  - Teraz pisanie trwa dalej w tle, także po zamknięciu okienka, a gotowy tekst czeka przy werdykcie.
  - Przy zakładkach widać ✓ (gotowe) i … (w trakcie pisania).
- **Zapamiętana zakładka**: ostatnio użyta, także „Oryginał”.
- **W wąskim panelu** zakładki zawijają się do drugiego wiersza.

## 0.5.1 – 11 listopada 2026

### Odpowiedź do wklejenia
- **„📋 Kopiuj jako odpowiedź” otwiera okienko z komentarzem pisanym ludzkim językiem**, dopasowanym do posta. Wcześniej kopiował formalny tekst werdyktu 1:1.
- **Trzy tony.**
  - **Rzeczowo**: 3–6 zdań.
  - **Na luzie**: 2–3 zdania.
  - **Krótko pod X**: do 280 znaków, jeden link i licznik znaków liczący linki tak jak X.
- **Komentarz pisze model na żądanie**, tylko na podstawie gotowego werdyktu: bez wyszukiwania i bez nowych faktów. Przy niskiej pewności werdyktu komentarz to zaznacza.
- **Język i styl dopasowane do posta**: zawsze uprzejmie, bez atakowania autora.
- **Źródła jako zwykłe adresy** z krótkim opisem (bez Markdown, którego Facebook i X nie pokazują), na końcu dopisek o AI.
- **Edycja przed skopiowaniem**, przycisk „↻ Napisz od nowa”.
- **Teksty z poprawkami zostają przy werdykcie**; ostatni ton jest zapamiętany, a przy postach z X od razu wybiera się krótka wersja.
- **„💬 Odpowiedz na cały post”** (albo artykuł, albo wszystkie twierdzenia): jeden spójny komentarz do wszystkich werdyktów źródła.
- **Zapas bez AI** z ostrzeżeniem: szablon pojawia się bez sieci, po dziennym limicie albo przy błędzie modelu.
- **Nowy moduł** `lib/reply.js` z testami.

## 0.5.0 – 11 listopada 2026

### Ocena werdyktów
- 👍 / 👎 pod każdym werdyktem. Po 👎 można wpisać, co jest nie tak.
- Drugie kliknięcie cofa ocenę.
- „Eksportuj oceny (JSON)” w 🕘 Historii zapisuje wszystkie ocenione werdykty z kontekstem: sprawdzany tekst, model, odpowiedź i komentarz. Plik służy do poprawiania promptów.

### Jakość fact-checkingu
- **Gotowe fact-checki (Google Fact Check Tools).**
  - Na karcie pojawia się ocena redakcji fact-checkingowej (np. Demagog, AFP Sprawdzam) z linkiem.
  - Gdy redakcja oceniła coś odwrotnie niż model, karta pokazuje ostrzeżenie ⚠.
  - Do Google wysyłane są tylko słowa kluczowe twierdzenia.
  - Funkcja jest opcjonalna i wymaga darmowego klucza.
- **Źródła pierwotne w instrukcji dla modelu.** Model najpierw szuka w oficjalnych źródłach:
  - głosowania i stenogramy: sejm.gov.pl, api.sejm.gov.pl;
  - prawo: ISAP, Dziennik Ustaw;
  - statystyki: GUS, BDL, NBP;
  - porównania unijne: Eurostat;
  - orzeczenia i wybory: odpowiednie serwisy sądów i PKW.
- **Data wypowiedzi.**
  - Wtyczka bierze datę z metadanych artykułu, posta albo filmu (np. YouTube); dla mikrofonu i transmisji ustawia „na żywo”.
  - Model ocenia wypowiedzi według stanu na ten dzień.
  - Datę można poprawić ręcznie (✎).
- **Mówcy.**
  - W trakcie nagrywania pasek „🗣 Teraz mówi” przypisuje wypowiedzi wskazanej osobie.
  - „Auto” zostawia ustalenie mówcy modelowi, który robi to tylko wtedy, gdy jest pewny.
- **Pamięć werdyktów.**
  - Ten sam tekst albo obrazek (mem) dostaje wynik od razu z pamięci, z datą sprawdzenia i bez kosztów.
  - Obrazki rozpoznawane są po odcisku (dHash), więc pasują też w innym rozmiarze.
  - Przycisk „Sprawdź ponownie” wymusza świeże sprawdzenie.
- Każdy werdykt ma słowa kluczowe – używa ich wyszukiwanie w bazie fact-checków.

### Koszty
- Licznik kosztów sesji i dnia: szacunek wg cenników dostawców; OpenRouter podaje koszt dokładnie, plan ChatGPT pokazuje tylko tokeny.
- Dzienny limit wydatków.
  - Po przekroczeniu limitu sprawdzanie staje, a wskazane teksty czekają w kolejce.
  - Przy 80% limitu pojawia się ostrzeżenie.
  - „Kontynuuj dziś mimo to” wznawia sprawdzanie do północy.
- Własna cena modelu, gdy model nie jest w cenniku.
- Tryby sprawdzania:

  | Tryb | Twierdzeń na fragment | Odstęp | Wyszukiwanie |
  |---|---|---|---|
  | oszczędny | do 3 | 60 s | oszczędne |
  | normalny | do 5 | 30 s | zwykłe |
  | dokładny | do 8 | 20 s | kilka źródeł na twierdzenie |

  Dla Claude tryb ustala też limit wyszukiwań.

### Prywatność
- Polityka prywatności (`PRIVACY.md`, po polsku i angielsku), dostępna też jako strona w ⚙. Opisuje, co, dokąd i kiedy jest wysyłane.
- Opcja „Ukrywaj osoby”: na zrzutach zamazuje zdjęcia profilowe, nazwy autorów i @uchwyty, a z tekstu do modelu usuwa autora posta.
- Opcja „nie zapamiętuj kluczy”: klucze znikają po zamknięciu przeglądarki.
- Przycisk „Usuń wszystkie klucze”.

### Wygoda
- Liczniki werdyktów przy każdym źródle.
- Filtr „Tylko problematyczne”: zostawia półprawdy, manipulacje i fałsze.
- „📋 Kopiuj jako odpowiedź”: twierdzenie, werdykt, wyjaśnienie i źródła, gotowe do wklejenia w komentarzu, z dopiskiem o AI.
- Raport z sesji:
  - zawiera liczby, rozkład werdyktów, tabelę mówców i wszystkie werdykty ze źródłami i obrazkami;
  - można go wydrukować, zapisać jako PDF albo pobrać jako HTML.
- Przyciski Zapisz / Anuluj w ustawieniach są zawsze widoczne.

### Techniczne
- Nowe moduły:
  - `lib/pricing.js`: cenniki i tryby;
  - `lib/factcheckapi.js`: Google Fact Check;
  - `lib/memory.js`: pamięć werdyktów;
  - `lib/report.js`: raport.
- Zużycie tokenów odczytywane od wszystkich dostawców: OpenAI, Claude, Gemini, OpenRouter.
- Baza historii w wersji 2, z nowym magazynem pamięci. Stare sesje zostają.
- Testy jednostkowe nowych funkcji (łącznie 43) i test całościowy w przeglądarce.

## 0.4.3 – port na Operę, wersja dla Chrome i wcześniejsze zmiany

### Przeglądarki
- Działanie w **Operze**: na pasku bocznym albo w okienku obok przeglądarki.
- Jeden kod dla Chrome i Opery. `npm run build` tworzy obie paczki.
- Przyciski panelu działają na karcie, którą masz przed sobą.

### Niezawodność
- Limity czasu zapytań: zawieszone połączenie nie blokuje już sprawdzania.
- „Sprawdź teraz” zawsze reaguje: po 20 s przerywa i ponawia zawieszone sprawdzanie.
- Przycisk „Przerwij”.

### Sesje i historia
- Automatyczny zapis werdyktów i transkrypcji.
- Okno 🕘 Historia z wyszukiwarką, otwieraniem, eksportem .md i usuwaniem.
- **Sesja obejmuje jedno posiedzenie.** Wideo, posty i artykuły trafiają do jednej sesji, pogrupowane według źródeł.
- **Nowa sesja zaczyna się po przycisku albo po przerwie** (domyślnie 3 h). Po otwarciu panelu ostatnia sesja wraca.
- Opcjonalny zapis .md po Stop.
- Każdy Start czyści okno transkrypcji. Wcześniejszy tekst zostaje dostępny.

### Tekst ze stron (artykuły, Facebook, X)
- Zaznaczenie + prawy przycisk albo Alt+Shift+F.
- 📄 Artykuł: sama treść, przez Readability od Mozilli.
- 👆 Wskaż post: sam post, bez komentarzy.
- Wtyczka nigdy nie czyta strony sama.
- Podgląd przed wysłaniem długich tekstów. Bardzo długie teksty są dzielone na części.
- Podświetlanie zdań na stronie kolorem werdyktu, dymek i „Pokaż na stronie”.

### Memy, infografiki, wykresy, zdjęcia
- Obrazki można wskazać na trzy sposoby:
  - prawy przycisk na obrazku;
  - obrazki w poście dołączane automatycznie;
  - 🔲 Wycinek ekranu.
- Wysyłany jest zrzut tego, co widać na ekranie, po podglądzie z miniaturami.
- Model sprawdza tekst z obrazka, fałszywe cytaty, manipulacje wykresów („Problemy z grafiką”) i zrzuty tweetów.
- Nowy werdykt „Satyra / żart”.
- Wyszukiwanie obrazem: Google Lens, TinEye, Yandex.
- Ramki z werdyktem na obrazkach na stronie.
- Opisowe tytuły obrazków zamiast „Może być zdjęciem przedstawiającym tekst”.

### Kolejka
- Teksty i obrazki można dorzucać bez czekania – są sprawdzane po kolei, także w trakcie nasłuchu.
- Shift+klik wskazuje kilka postów pod rząd.
- Lista „Czeka na sprawdzenie” z usuwaniem pozycji. Ten sam tekst nie trafi do kolejki dwa razy.

### Dostawcy modeli
- Obok ChatGPT i OpenAI: Google Gemini (darmowy klucz), Claude (klucz API) i OpenRouter.
- Osobny klucz i model dla każdego dostawcy.
- Sprawdzanie klucza i polecany model.
- Informacja o wyszukiwaniu, obrazkach, kosztach i prywatności.
- Automatyczne obejścia: wyczerpana pula wyszukiwań Gemini albo model bez obrazków.

### Interfejs
- Pasek aktywności z etapem pracy, czasem i odliczaniem.
- Karta „sprawdzam…”, znaczek na ikonie i komunikat na stronie.
- Etykiety „Sprawdzane twierdzenie” i „Ocena” na karcie.
- Czytelny przełącznik Dźwięk karty / Mikrofon, zablokowany w trakcie nagrywania.
- Źródło „Mikrofon” nie podaje tytułu strony.

### Poprawki
- Sprawdzanie przestawało działać po kilku werdyktach.
- Panel pokazywał tytuł innej karty niż słuchana (np. post z Facebooka zamiast filmu z YouTube).
- Stara transkrypcja zostawała po ponownym Start.
- Facebookowy alt „Może być zdjęciem…” trafiał do tytułu i tekstu.

### Projekt
- Instrukcja `INSTRUKCJA.md` dla obu przeglądarek.
- Testy jednostkowe (`npm test`) i skrypt budujący.
- Biblioteki zewnętrzne z licencjami pozwalającymi na publikację.
