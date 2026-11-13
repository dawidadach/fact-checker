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

Przyciski w panelu (Start, Artykuł, Wskaż post, Zaznaczenie, Wycinek) zawsze działają na karcie, którą masz teraz przed sobą.

### Ikonka w odtwarzaczu YouTube – słuchanie jednym kliknięciem

Włącz w **⚙ → Ikonka w filmach** (domyślnie wyłączona; przeglądarka zapyta o dostęp tylko do youtube.com). Na pasku
odtwarzacza, na lewo od przycisku napisów, pojawi się ikonka Fact Checkera. **Kliknięcie od razu włącza słuchanie tego
filmu** – bez Start, bez okna „Udostępnij kartę” i bez klikania ikony wtyczki na pasku. Panel się otwiera, źródło ma
tytuł filmu, a werdykty pojawiają się jak przy Start. W trakcie słuchania ikonka ma czerwoną kropkę; ponowne kliknięcie
(albo Stop w panelu) zatrzymuje.

Dźwięk wtyczka bierze **prosto z odtwarzacza** – film gra normalnie, karta nie jest wyciszana, a dźwięk innych kart
i powiadomień nie trafia do transkrypcji. W czasie reklamy i pauzy nic nie idzie dalej (nie płacisz za ciszę).
Gdy w tej samej karcie przejdziesz do kolejnego filmu, słuchanie trwa dalej, a w panelu powstaje nowe źródło.
Zamiana mowy na tekst działa tak samo jak przy Start: model lokalny albo OpenAI (⚙). Jeśli nie masz jeszcze modelu,
po kliknięciu pojawi się okienko jego wyboru, a film zacznie być słuchany po **Zacznij słuchać**.

Dlaczego to nie zwykły „dźwięk karty”: przeglądarka daje wtyczce dźwięk karty tylko po kliknięciu ikony wtyczki na pasku,
w menu albo skrótem – kliknięcie w stronę jej nie wystarcza. Jeśli panel napisze, że nie słyszy dźwięku filmu (a film
nie jest wyciszony), zatrzymaj i użyj **Start**.

### Wygląd panelu

- **Na górze:** nazwa, stan („Gotowe…”, „Sprawdzam…”, „Słucham…”) oraz ikony **Historia** (zegar) i **Ustawienia**
  (koło zębate). Gdy coś się sprawdza albo słuchasz, pod nagłówkiem jest pasek z czasem i przyciskiem **Przerwij**
  albo czerwony pasek **Na żywo** z przyciskiem **Stop**.
- **Pusty panel:** dwie karty – **Sprawdź stronę** (Artykuł, Wskaż post, Zaznaczenie, Wycinek) i **Słuchaj na żywo**
  (Dźwięk karty / Mikrofon i duży **Start**) – oraz krótkie „Jak to działa”. Po pierwszym wyniku te same przyciski
  zostają nad wynikami jako zwarty pasek – kolejną rzecz sprawdzisz bez przewijania.
- **Nad wynikami:** pigułki z liczbą werdyktów każdego rodzaju (kliknięcie pokazuje tylko te karty, drugie – wszystkie),
  przełącznik **Tylko problemy** i koszt sesji.
- **Wynik:** karta źródła (rodzaj, serwis, tytuł, data, liczniki), **Ocena całości** z paskiem pięciu poziomów,
  ostrzeżenie przed oszustwem, karty werdyktów i chwyty erystyczne.
- Jasny i ciemny motyw według systemu. Panel działa przy szerokości od 320 do 480 px.

Do sprawdzania faktów potrzebny jest dostawca modelu: logowanie **Continue with ChatGPT**, klucz API albo inny dostawca
(Gemini, Claude, OpenRouter – niżej). To wystarczy do artykułów, postów, zaznaczeń i obrazków.

**Model mowy dopiero przy słuchaniu.** Gdy pierwszy raz klikniesz **Start**, a zamiana mowy na tekst nie jest gotowa,
pojawi się okienko **„Zamiana mowy na tekst”**:

- **Model lokalny (zalecany)** – darmowy, nic nie wychodzi z komputera. Wtyczka proponuje model pasujący do języka rozmowy
  i komputera (z kartą graficzną najlepszy, bez niej średni) i link do lżejszego. **Pobierz** pokazuje pasek postępu;
  okienko można zamknąć, a pobieranie trwa dalej. Po pobraniu kliknij **▶ Zacznij słuchać**.
- **OpenAI** – tylko dźwięk karty, potrzebny klucz API OpenAI.
- **Wbudowane w przeglądarkę** – tylko mikrofon, w Chrome i Edge.

Jeśli jakiś model jest już pobrany, wtyczka użyje go sama, bez pytania. Okienko pojawia się też wtedy, gdy wybrany sposób
nie pasuje do źródła (np. OpenAI z mikrofonem albo wbudowane rozpoznawanie z dźwiękiem karty).

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
  Z posta brany jest **tylko sam post** – bez komentarzy, odpowiedzi i przycisków (także bez „Obserwuj” czy
  „Dołącz” obok nazwy profilu – autorem jest sama nazwa). Komentarz możesz sprawdzić,
  wskazując albo zaznaczając właśnie jego.

### Ikonka przy postach (Facebook, X)

Zamiast wskazywać post, możesz go sprawdzić jednym kliknięciem. Włącz w **⚙ → Ikonka przy postach** – osobno
**na Facebooku** i **na X** (domyślnie oba wyłączone). Przeglądarka zapyta o zgodę tylko na serwis, który włączasz
(facebook.com albo x.com) – bez tej zgody ikonka się tam nie pojawi. Wyłączenie jednego serwisu nie rusza drugiego.
Opcja działa od razu, także w otwartych kartach, bez zapisywania.

Ikonka pojawia się **dopiero po najechaniu myszą na post** – w jego prawym górnym rogu, na lewo od „…” (menu
posta; na X także na lewo od ikonki Groka). Nie zmienia układu strony, a gdy zjedziesz z posta, znika. Kursor nad
komentarzem albo udostępnionym postem też ją pokazuje – zawsze dla posta „z wierzchu”. Post bez „…” ma ikonkę przy
prawej krawędzi, pod nagłówkiem.

Kliknięcie otwiera panel i od razu sprawdza ten post – z obrazkami, bez komentarzy i bez okna podglądu. Na Facebooku
wtyczka sama rozwija „Zobacz więcej”. Na X skrócony tweet pokazuje podgląd, bo „Pokaż więcej” otwiera osobną stronę –
możesz tam dokleić resztę tekstu.

**Wynik pod postem.** W trakcie sprawdzania ikonka się kręci, a potem pod postem (na Facebooku pod tekstem, na X pod
paskiem akcji) pojawia się ramka Fact Checkera: ocena całości (od dwóch twierdzeń), werdykty z krótkim wyjaśnieniem,
opinia, źródła oraz przyciski **Kopiuj jako odpowiedź** i **Szczegóły w panelu**. Po wyniku ikonka jest wypełniona
na niebiesko: kliknięcie chowa ramkę (podpowiedź „Ukryj”), następne pokazuje ją z powrotem bez ponownego sprawdzania
(„Pokaż wynik”). Ramka jest widoczna tylko u Ciebie: wtyczka
niczego nie publikuje, a skrypty serwisu nie mają do niej zwykłego dostępu (zamknięty Shadow DOM). Wynik pod postem
pojawia się, gdy panel jest otwarty – to w nim działa sprawdzanie.

Skrypt ikonek niczego nie czyta ani nie wysyła sam z siebie: śledzi tylko, nad którym postem jest kursor. Treść posta
idzie do modelu dopiero po kliknięciu. Gdyby przeglądarka nie pozwoliła otworzyć panelu, post czeka w kolejce –
kliknij ikonę wtyczki na pasku (będzie na niej „1”).

Facebook często zmienia budowę strony. Jeśli ikonka przy jakimś poście się nie pojawi albo stanie w złym miejscu, użyj **Wskaż post** albo
skrótu **Alt+Shift+F**.

### Ikonka przy artykułach

Artykuł też sprawdzisz jednym kliknięciem. Włącz w **⚙ → Ikonka przy artykułach** (domyślnie wyłączona) i wybierz:

- **Na wybranych serwisach** – ok. 90 największych serwisów informacyjnych w dwóch grupach: **Polska** (portale, telewizje
  i radia, dzienniki, tygodniki i serwisy opinii z różnych stron sporu, gospodarka, PAP) i **Świat** (USA, Wielka
  Brytania, Europa: BBC, NYT, Reuters, AP, Fox News, The Guardian, Spiegel, Le Monde…). Wszystkie są zaznaczone –
  odznacz te, których nie chcesz; **Zaznacz wszystkie** / **Odznacz wszystkie** działa na całą grupę naraz. Gdy jesteś
  na stronie spoza listy, nad listą pojawia się **„Ta strona: … → Pokazuj ikonkę tutaj”** – dodane serwisy są w części
  „Dodane przez Ciebie” (✕ usuwa).
- **Wszędzie** – na każdej stronie, która wygląda jak artykuł (bez Facebooka i X – tam są ikonki przy postach).

Przeglądarka zapyta o zgodę jeden raz: na serwisy z listy albo – przy „Wszędzie” – na wszystkie strony. Zmiany działają
od razu, także w otwartych kartach, bez zapisywania.

Ikonka pojawia się **dopiero po najechaniu myszą na tytuł artykułu** – na końcu jego ostatniej linii (gdy tam nie ma
miejsca: na lewo od tytułu). Kliknięcie otwiera panel i od razu sprawdza cały artykuł – bez menu, reklam i komentarzy,
bez okna podglądu (chyba że tekst jest dłuższy niż ok. 48 000 znaków). W trakcie sprawdzania przy tytule widać
„Sprawdzam…”, a potem **znaczek z oceną całości** (np. „Wprowadza w błąd”; gdy twierdzenie jest jedno – jego werdykt).
Kliknięcie znaczka pokazuje szczegóły w panelu.

Gdy **pamięć werdyktów** jest włączona (⚙, domyślnie 30 dni), wtyczka zapamiętuje adres artykułu i jego ocenę (bez
treści) – przy kolejnej wizycie znaczek jest przy tytule od razu, a jego kliknięcie pokazuje wynik z pamięci, bez
kosztów. Wyczyszczenie pamięci werdyktów usuwa też te oceny.

Artykuł wtyczka rozpoznaje po budowie strony: znacznikach serwisu (og:type, schema.org NewsArticle) albo nagłówku h1
w treści z kilkoma akapitami. Na stronie głównej serwisu i przy zajawkach ikonki nie ma. Skrypt ikonki niczego nie
czyta ani nie wysyła sam z siebie – treść artykułu idzie do modelu dopiero po kliknięciu. Jeśli na jakiejś stronie
ikonka się nie pojawi, użyj przycisku **📄 Artykuł** w panelu albo prawego przycisku → **Sprawdź artykuł**.

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

- **Historia** (ikona zegara obok ustawień): lista sesji (tytuł = pierwsze źródło, „(+2)” = ile jeszcze), wyszukiwarka,
  **Otwórz**, **Eksport .md** (sekcja na każde źródło), **Raport**, **Usuń**. Otwarta sesja przyjmuje kolejne sprawdzenia.
- Opcja **Zapisuj sesje w historii** (⚙ → *Zapisywanie*, domyślnie włączona). Wyłączona: wyniki są tylko na ekranie
  i znikają po zamknięciu panelu albo nowej sesji. Pamięć werdyktów działa wtedy dalej, jeśli jest włączona.
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

## Ocena całości (artykuł, post, mem, infografika)

Gdy artykuł albo post ma co najmniej 2 sprawdzone twierdzenia (albo twierdzenie i uwagi do obrazka, np. „nagranie
z 2022 r.”), nad kartami pojawia się **„Ocena całości”**. Pozwala wiedzieć, co jest rzetelne, a co nie, zanim
przeczytasz szczegóły:

- **poziom** na pasku z 5 pól:

  | Poziom | Kiedy |
  |---|---|
  | Rzetelny | główna teza się zgadza, nie ma istotnych błędów |
  | Rzetelny, z drobnymi błędami | teza się zgadza, błędy są w szczegółach |
  | Mieszany | ważna część się nie zgadza albo brakuje kluczowego kontekstu |
  | Wprowadza w błąd | fakty mogą być prawdziwe, ale wniosek albo kontekst jest fałszywy (typowe dla memów) |
  | Nierzetelny | główna teza jest fałszywa |

  Do tego **„Nie do oceny”** – opinie, satyra albo nic, co da się sprawdzić.
- **jedno-dwa zdania**: co tekst mówi i czy to się broni;
- **rodzaj treści**: wiadomość, opinia, *opinia podana jako wiadomość*, wpis prywatny, materiał wyborczy, *reklama*,
  satyra albo *możliwe oszustwo* (pochyłe – to ostrzeżenia, np. fałszywa „inwestycja” ze znaną twarzą);
- **punkty**: ✓ co się zgadza, ✗ co jest fałszywe lub mylące, ⚠ czego brakuje (kontekst, stare zdjęcie…),
  ⚖ czyjego głosu albo jakiej strony brakuje (np. drugiej strony sporu, danych urzędowych).

Poziom zależy od **wagi** twierdzeń, nie od ich liczby: fałsz w głównej tezie waży więcej niż fałsz w szczególe.
Model najpierw wskazuje, które twierdzenia są główną tezą, a wtyczka pilnuje, żeby poziom nie był łagodniejszy niż
ich werdykty (np. fałszywa teza nigdy nie dostanie „Rzetelny, z drobnymi błędami”).

Ocena powstaje **po** werdyktach, osobnym, małym zapytaniem bez wyszukiwania – model pisze ją tylko z werdyktów i
uwag do obrazków, bez nowych faktów. Dotyczy sprawdzonych twierdzeń, nie całego tekstu (opinie i rzeczy
niesprawdzalne do niej nie wchodzą). ↻ pisze ją jeszcze raz. Trafia do pamięci werdyktów (ten sam artykuł czy mem
pokaże ją od razu), do historii (plakietka przy sesji), do raportu i eksportu Markdown. **„Kopiuj jako odpowiedź”**
w stopce oceny daje jeden komentarz do wszystkich werdyktów – zaczyna od oceny całości i głównej tezy.

**Karty zwinięte.** Karty pokazują najpierw tylko werdykt, pewność i twierdzenie; najpierw problemy (fałsz, wprowadza
w błąd, półprawda, brak danych), potem reszta. Kliknij kartę, żeby zobaczyć cytat, wyjaśnienie, co potwierdza, przeciwne
dane, czego brakuje i źródła – wszystkie te sekcje są od razu rozwinięte (każdą możesz zwinąć). **„Rozwiń karty”** (pod oceną albo przy licznikach źródła) rozwija wszystkie naraz.
Rozwinięta od razu jest jedyna karta źródła i najnowsza karta z nagrania.

Dla dźwięku (karta, mikrofon) oceny całości nie ma – tam jest raport sesji. Jedno twierdzenie bez obrazka też jej
nie dostaje, bo karta już jest podsumowaniem. Automat można wyłączyć w ⚙ (Tryb pracy → „Podsumowuj artykuły i
posty”); wtedy w tym miejscu jest przycisk **„Podsumuj całość”**.

## Ostrzeżenie przed oszustwem

Fałszywe reklamy „inwestycji” ze znanymi twarzami, podrobione artykuły „Onetu” czy „TVN24”, „dopłata do paczki”,
„zablokowane konto” – przy sprawdzaniu posta, artykułu, zaznaczenia albo obrazka wtyczka szuka sygnałów oszustwa.
Robi to **w przeglądarce, bez modelu (0 tokenów)**:

- **Lista Ostrzeżeń CERT Polska** – publiczna lista niebezpiecznych domen. Wtyczka pobiera **cały plik** (najwyżej
  raz na 12 h, przy pierwszym sprawdzaniu) i sprawdza adresy u siebie, więc CERT nie dowiaduje się, jakie strony
  oglądasz. Wpis obejmuje też subdomeny.
- **Adres udający markę** – banki (PKO BP, mBank, ING…), płatności (BLIK, PayU, PayPal), kurierzy (InPost, DPD,
  Poczta Polska), sklepy (Allegro, OLX, Vinted), gov.pl i mObywatel, media (Onet, TVN24, Polsat News…):
  nazwa marki w obcym adresie (`tvn24-news.online`), marka w subdomenie (`allegro.pl.oferta-24.com`), podmienione
  znaki (`a11egro.pl`, `rnbank.pl`), literówki w adresach banków i sklepów, strona, która przedstawia się jako „Onet”,
  a ma inny adres, znaki z innych alfabetów (`xn--…`), sam adres IP.
- **Linki w poście** – także te ukryte za przekierowaniem Facebooka (`l.facebook.com/l.php?u=…`), i adresy wpisane w
  tekst („wejdź na …”).
- **Sformułowania** typowe dla oszustw: obietnica zysku („zarabia 5000 zł dziennie”), platforma inwestycyjna i
  kryptowaluty, „sekret, który banki ukrywają”, presja czasu („zostało tylko 7 miejsc”), prośba o dane albo płatność
  („dopłata do przesyłki”, „kod BLIK”), kontakt poza serwisem („konsultant zadzwoni”, WhatsApp), „wygrałeś nagrodę”.

Ramka nad oceną całości:

- **⚠ Możliwe oszustwo** (czerwona) – gdy adres jest na Liście CERT albo udaje markę;
- **⚠ Sygnały typowe dla oszustw** (pomarańczowa) – gdy co najmniej dwa rodzaje podejrzanych sformułowań (albo jedno
  i podejrzany adres).

W ramce są powody (z cytatem albo adresem), rada (nie wpłacaj pieniędzy, nie podawaj danych ani kodów BLIK, adres
banku wpisuj sam) i gdzie zgłosić: **incydent.cert.pl**, SMS na **8080**, na Facebooku „Zgłoś reklamę”.

Żeby nie straszyć bez powodu: pojedyncze słowo („bitcoin”, kwota w złotych) nie wystarcza, sama końcówka adresu
(`.online`) też nie, a na znanych serwisach (media, urzędy) treść i adresy wpisane w tekst nie wywołują ostrzeżenia –
artykuł **o** oszustwach to nie oszustwo.

**Model dostaje informację tylko wtedy, gdy coś się znalazło**: kilkadziesiąt tokenów z listą sygnałów i prośbą, by
sprawdził, czy znane osoby czy marki naprawdę to mówiły. Wtedy powstaje też **ocena całości** (nawet przy jednym
twierdzeniu), w której model potwierdza rodzaj treści **„Możliwe oszustwo”** – albo uznaje alarm za fałszywy.

Ustawienia: ⚙ → **Ochrona przed oszustwami** (obie opcje domyślnie włączone; tam też stan Listy CERT i „Odśwież
listę”). Ostrzeżenie trafia do historii (plakietka ⚠), raportu i eksportu Markdown.

## Chwyty erystyczne

Oprócz faktów wtyczka wyłapuje **chwyty**, czyli nieuczciwe sposoby argumentowania: fałszywy dylemat, atak na osobę,
chochoł, „a u was…”, dowód anegdotyczny, wybiórcze fakty, równia pochyła, fałszywy autorytet, odwołanie do większości,
straszenie, „my kontra oni”, pytanie z tezą, fałszywa przyczyna, presja czasu i galop Gisha.

- Pod kartami źródła jest lista **🎭 Chwyty erystyczne** – nazwa, cytat, jedno zdanie „dlaczego” i rozwijane
  **„Na czym polega · jak odpowiedzieć”**. Na stronie chwyty są podkreślone na fioletowo (przerywaną linią).
- Chwyt to **nie werdykt**: mówi o sposobie argumentowania, nie o tym, czy teza jest prawdziwa.
- Model zgłasza tylko wyraźne przypadki: najwyżej 3 na tekst, 2 na fragment rozmowy. Same emocjonalne słowa albo
  mocna opinia nie są chwytem.
- W raporcie z debaty tabela mówców ma kolumnę **Chwyty** – ile ich użył każdy mówca.
- Definicje i „jak odpowiedzieć” są zapisane we wtyczce, więc model zwraca tylko nazwę, cytat i jedno zdanie.
  Kosztuje to ok. 430 tokenów na zapytanie i ok. 50 na znaleziony chwyt – przy wyszukiwaniu w sieci to zwykle 2–5%
  więcej. Wyłączysz to w ⚙ → Tryb sprawdzania → „Wykrywaj chwyty erystyczne”.

## Karta z werdyktem

Pod werdyktem i cytatem jest **„Sprawdzane twierdzenie”** (wyróżnione tłem) – to teza, którą sprawdzamy, a nie
stwierdzenie wtyczki – a pod nią **„Ocena”**, czyli wyjaśnienie werdyktu. Tak samo w dymku na stronie.

Na dole karty:

- **🔍 Sprawdź dokładniej** – gdy werdykt budzi wątpliwości. Otwiera pole, w którym możesz (nie musisz) napisać, co
  sprawdzić (np. nieaktualne dane, zły kontekst, nikt tego nie powiedział); **„Sprawdź”** (albo Enter) uruchamia
  sprawdzenie, **„Anuluj”** zamyka pole bez wysyłania. To jedno twierdzenie idzie do sprawdzenia od zera w trybie
  dokładnym (więcej wyszukiwań, źródła pierwotne). Model dostaje fragment tekstu wokół cytatu, poprzedni werdykt i Twoją
  uwagę – jako wskazówkę, co sprawdzić, a nie jako fakt (werdykt zmieni tylko, jeśli dowody to potwierdzą). Jeśli
  masz w ⚙ klucz i wybrany model u innego dostawcy (np. Gemini), możesz wybrać go z listy – to „druga opinia”. Karta
  pokaże nowy werdykt i dopisek „Sprawdzone dokładniej (…) – wcześniej: Półprawda” (albo „werdykt bez zmian”);
  pamięć werdyktów i ocena całości aktualizują się same. Kosztuje mniej więcej tyle co jedno zwykłe sprawdzenie.
  Wszystkie takie sprawdzenia wyeksportujesz w 🕘 Historii przyciskiem **„Eksportuj dokładniejsze sprawdzenia (JSON)”**
  – plik zawiera werdykt przed i po, model, sprawdzany tekst i Twoją uwagę, więc nadaje się do poprawiania promptów.
  (Łapki 👍/👎 z wersji do 0.7.3 zniknęły; dawne oceny nadal trafiają do tego eksportu.)
- **📋 Kopiuj jako odpowiedź** – okienko z komentarzem do wklejenia pod postem, napisanym ludzkim językiem i
  dopasowanym do posta (panel mówi formalnie, komentarz – jak człowiek w dyskusji). Szczegóły niżej.
- **📚 Sprawdzali to też fact-checkerzy** – patrz niżej.

**Poziom źródła.** Przy każdym linku jest plakietka: *dane* (GUS, NBP, Eurostat…), *dokument* (ustawy, Sejm,
wyroki), *nauka*, *urząd*, *sondaż*, *fact-check*, *encyklopedia*, *media*, *social media*. Wtyczka rozpoznaje je po
adresie, bez modelu, więc nie kosztują nic. Od razu widać, czy werdykt stoi na danych i dokumentach, czy na artykule
prasowym albo wpisie. Strona spoza list (np. firmy) nie ma plakietki.

Nad listą werdyktów są pigułki z liczbą werdyktów każdego rodzaju – kliknięcie zostawia na ekranie tylko te karty
(np. same fałsze), drugie kliknięcie przywraca wszystkie. Przełącznik **„Tylko problemy”** zostawia półprawdy,
manipulacje i fałsze. Każde źródło ma też własne liczniki.

## Odpowiedź do wklejenia

**📋 Kopiuj jako odpowiedź** jest w trzech miejscach: pod każdym werdyktem, w stopce **oceny całości** (jeden
komentarz do wszystkich werdyktów źródła) i w ramce wyniku pod postem. Gdy źródło ma kilka werdyktów, a oceny całości
jeszcze nie ma, przy źródle jest **💬 Odpowiedz na cały post**. Każdy z nich otwiera okienko z gotowym komentarzem:

- Na start zawsze **Oryginał** (zakładka skrajnie z prawej) – tekst werdyktu tak jak w panelu, bez AI, od razu i za
  darmo. Odpowiedź na całe źródło zaczyna się od oceny całości („Ocena całości: Mieszany. …”), jeśli jest gotowa.
  „↺ Przywróć oryginał” cofa Twoje poprawki.
- Model pisze komentarz **dopiero, gdy wybierzesz ton**: **Rzeczowo** (3–6 zdań, spokojnie), **Na luzie** (2–3
  zdania) albo **Krótko pod X** (mieści się w 280 znakach, z jednym linkiem – licznik pokazuje długość tak, jak liczy
  ją X).
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
- **Ikonka przy postach** (domyślnie wyłączona) daje wtyczce stały dostęp do serwisu, który włączysz (facebook.com,
  x.com – każdy osobno) – tylko po to,
  żeby pokazywać ikonkę po najechaniu na post. Post jest czytany dopiero po kliknięciu jego ikonki.
- **Ikonka w filmach** (domyślnie wyłączona) daje wtyczce stały dostęp do youtube.com tylko po to, żeby pokazać ikonkę
  w odtwarzaczu. Film jest słuchany dopiero po jej kliknięciu – do ponownego kliknięcia albo Stop w panelu.
- **Ikonka przy artykułach** (domyślnie wyłączona) daje wtyczce stały dostęp do serwisów z listy, które zostawisz
  zaznaczone (albo – przy „Wszędzie” – do wszystkich stron), tylko po to, żeby rozpoznać artykuł i pokazać ikonkę po
  najechaniu na tytuł. Artykuł jest czytany dopiero po kliknięciu ikonki.
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
`lib/reply.js` (odpowiedź do wklejenia), `lib/summary.js` (ocena całości), `lib/tricks.js` (chwyty erystyczne), `lib/sourcetier.js` (poziom źródła), `lib/scam.js` (sygnały oszustwa),
`lib/certlist.js` (Lista Ostrzeżeń CERT Polska),
`lib/vendor/Readability.js` (Mozilla, Apache 2.0).

Ceny w `lib/pricing.js` są orientacyjne (listopad 2026) – przy zmianie cenników wystarczy poprawić tabelę.

## Uwagi

- Brak WebGPU w ustawieniach modeli? Włącz akcelerację sprzętową i uruchom przeglądarkę ponownie:
  Chrome – **Ustawienia → System → Używaj akceleracji graficznej, gdy jest dostępna**;
  Opera – **Ustawienia → Przeglądarka → System → Używaj akceleracji sprzętowej, gdy jest dostępna**.
- Wtyczka ma stały identyfikator (`key` w manifeście) – dlatego aktualizacja przez „Przeładuj” zachowuje dane.
