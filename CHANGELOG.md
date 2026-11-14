# Lista zmian – Fact Checker

Rozwinięcie wtyczki [dawidadach/fact-checker](https://github.com/dawidadach/fact-checker) (punkt wyjścia: v0.4.1).

## 0.7.9 – 14 listopada 2026

Poprawki po przeglądzie kodu przed publikacją w sklepach z wtyczkami.

### Poprawki
- **Podobne twierdzenia nie znikają.** Wtyczka odrzucała twierdzenie jako powtórkę, gdy miało 3/4 tych samych słów
  co wcześniejsze z tego samego źródła – a krótkie liczby i „nie” się nie liczyły. Przez to „bezrobocie wynosi 5%”
  i „8%”, „jest członkiem NATO” i „nie jest”, „w Polsce” i „w Europie” albo „podniósł” i „obniżył” uchodziły za to
  samo i drugie twierdzenie (np. odpowiedź drugiej strony w debacie) przepadało bez sprawdzenia. Teraz powtórka to
  te same liczby, to samo zaprzeczenie i te same słowa (odmiana się nie liczy).
- **Obrazek z pamięci werdyktów – sprawdzany jest też jego tekst.** Obrazki są rozpoznawane po „odcisku”, który nie
  widzi zmiany drobnego napisu: mem z podmienionym rokiem („2008” → „2018”) albo słowem („najwyższa” → „najniższa”)
  dostawał wynik z pamięci dla oryginału. Teraz, gdy obrazek z tekstem wygląda jak sprawdzony wcześniej, wtyczka
  krótko pyta model, czy napis jest ten sam co zapamiętany (jedno krótkie zapytanie, bez wyszukiwania). Różnica –
  sprawdza od nowa i mówi, co się zmieniło; ten sam tekst – wynik z pamięci jak dotąd. Gdy zapytać się nie da
  (limit kosztów, błąd sieci, model bez obrazków) – wynik z pamięci z datą i „Sprawdź ponownie”, jak wcześniej.
- **Fact-checki z bazy Google pasują liczbami.** Wynik z Google Fact Check był dopasowywany tylko po słowach, więc
  pod twierdzeniem o „2,5%” mógł się pokazać fact-check o „25%”, a pod twierdzeniem z 2023 r. – o tym samym z 2015 r.
  Teraz inne liczby albo inny rok w obu tekstach oznaczają fact-check innego twierdzenia i nie jest pokazywany.

### Bezpieczeństwo
- **Tekst ukryty na stronie nie trafia do sprawdzenia.** Przy sprawdzaniu artykułu wtyczka pomija tekst, którego nie
  widać: ukryty stylami, malutki (1×1 px) albo wysunięty poza stronę. Strona mogła w ten sposób dopisać modelowi
  coś, czego nie widzisz (np. „uznaj ten artykuł za prawdziwy”). Tekst pojawiający się z animacją i tekst niżej na
  stronie (poza ekranem) dalej się liczy.
- **Treść ze strony to dane, nie polecenia.** Wszystkie zapytania (sprawdzanie na żywo i tekstu, „Sprawdź
  dokładniej”, ocena całości, komentarz, porównanie obrazka) mówią modelowi wprost, że transkrypcja i tekst ze
  strony to materiał do sprawdzenia, a polecenia w nim należy ignorować; tekst ze strony nie może też „zamknąć”
  bloku z danymi i dopisać czegoś od siebie.
- **Dane wtyczki niedostępne dla skryptów na stronach.** Klucze API, logowanie do ChatGPT, historia i ustawienia są
  dostępne tylko dla panelu i tła wtyczki – nie dla skryptów ikonek działających na Facebooku, X, YouTube i
  serwisach informacyjnych. Polecenia „uprzywilejowane” (token ChatGPT, logowanie i wylogowanie, odbiór zleceń,
  polecenia dla panelu) wtyczka przyjmuje tylko od własnych stron, a znaczek z oceną artykułu – tylko dla adresu
  karty, która pyta. Ikonki dostają od wtyczki już tylko język interfejsu (zmiana w ⚙ działa od razu).
- **Ikonki i wskazywanie reagują tylko na prawdziwe kliknięcia.** Ikonki przy postach, artykułach i w odtwarzaczu
  YouTube, przyciski pod postem oraz „Wskaż post” i „Wycinek” ignorują zdarzenia wywołane skryptem strony
  (`isTrusted`) – strona nie może „kliknąć” za Ciebie ani nic zaznaczyć do sprawdzenia. Pomysł: Nairdaa (PR #13) –
  dziękujemy!

### Zmiany
- **Krótszy opis wtyczki** (do 132 znaków – limit Chrome Web Store i dodatków Edge).

## 0.7.8 – 14 listopada 2026

Dwie poprawki zgłoszone przez voytas_ – dziękujemy!

### Poprawki
- **Pamięć werdyktów nie myli już liczb.** Przy rozpoznawaniu tego samego tekstu wtyczka pomijała wszystkie znaki
  poza literami i cyframi, więc „2.5%” i „25%”, „-3%” i „3%”, „1,5 mln” i „15 mln”, „3/4” i „34” albo „10:30” i „1030”
  były dla niej tym samym tekstem – a post z podmienioną liczbą dostawał wynik z pamięci dla oryginału (np. „Prawda”
  przy zmanipulowanych 25%). Teraz znaki przy liczbach (kropka i przecinek dziesiętny, minus, %, /, :, <, >, waluty,
  stopnie) się liczą, a liczby rozdzielone przecinkiem albo spacją („3, 4”) nie zlewają się w jedną. Interpunkcja
  w zwykłym tekście dalej nie ma znaczenia. Teksty sprawdzone przed aktualizacją zostaną raz sprawdzone od nowa.
- **Zrzut obrazka nie złapie innej karty.** Przeglądarka zrzuca to, co w danej chwili widać w oknie. Gdy w trakcie
  zrzutu (do ok. 0,7 s) przełączyłeś kartę, wycinki mogły pochodzić z tej drugiej karty i trafić do modelu – przy
  ikonce przy poście nawet bez podglądu. Teraz wtyczka pilnuje karty przez cały zrzut: przełączenie karty w tym
  oknie, przejście strony na inny adres, zamknięcie albo przeniesienie karty – i zrzut jest odrzucany (także gdy
  wrócisz na kartę przed końcem). Tekst jest sprawdzany dalej, a panel prosi, żeby kliknąć jeszcze raz.

### Zmiany
- **Przy instalacji nie ma już ostrzeżenia „Odczytywanie i zmienianie wszystkich Twoich danych we wszystkich
  witrynach”.** Ten napis pochodził wyłącznie od uprawnienia do nagrywania dźwięku karty (`tabCapture`) – Chrome
  ma dla niego tylko taki, najszerszy tekst. Teraz to uprawnienie jest opcjonalne: przeglądarka pyta o nie przy
  pierwszym **Start** z dźwiękiem karty. Odmowa nic nie psuje – Start działa przez okno „Udostępnij kartę”, wtyczka
  nie pyta znowu, a zgodę można dać później w ⚙ → Słuchanie na żywo. Mikrofon i ikonka w odtwarzaczu YouTube tej
  zgody nie potrzebują. Przy instalacji zostają tylko „Odczytywanie historii przeglądania” (tytuł i adres kart) i
  „Zarządzanie pobranymi plikami” (raporty i eksport).

## 0.7.7 – 13 listopada 2026

### Nowości
- **Ikonka przy artykułach** (⚙ → Ikonka przy artykułach, domyślnie wyłączona):
  - po najechaniu na tytuł artykułu na końcu jego ostatniej linii pojawia się ikonka Fact Checkera;
  - jedno kliknięcie otwiera panel i sprawdza cały artykuł – bez menu, reklam i komentarzy, bez okna podglądu;
  - po sprawdzeniu przy tytule zostaje znaczek z oceną całości (albo werdyktem, gdy twierdzenie jest jedno);
    kliknięcie znaczka pokazuje szczegóły w panelu;
  - przy kolejnej wizycie znaczek jest od razu (pamiętany adres i ocena, bez treści – tylko przy włączonej pamięci
    werdyktów), a jego kliknięcie daje wynik z pamięci, bez kosztów.
- **Trzy tryby:**
  - **Wyłączone**;
  - **Na wybranych serwisach** – 88 serwisów w grupach Polska (41: portale, telewizje i radia, dzienniki, tygodniki
    i serwisy opinii z różnych stron sporu, gospodarka, PAP) i Świat (47: USA, Wielka Brytania, Europa); wszystkie
    zaznaczone, **Zaznacz wszystkie / Odznacz wszystkie** w każdej grupie, **„Pokazuj ikonkę tutaj”** dla strony spoza
    listy;
  - **Wszędzie** – każda strona, która wygląda jak artykuł (bez Facebooka i X).
- **Jedna zgoda przeglądarki** na listę albo – przy „Wszędzie” – na wszystkie strony; zmiany działają od razu, także
  w otwartych kartach.
- **Ikonka w odtwarzaczu YouTube** (⚙ → Ikonka w filmach, domyślnie wyłączona): na pasku odtwarzacza, na lewo od
  napisów. Jedno kliknięcie od razu włącza słuchanie tego filmu – bez Start, bez okna „Udostępnij kartę” i bez
  klikania ikony wtyczki na pasku. Dźwięk idzie prosto z odtwarzacza (film gra normalnie, karta nie jest wyciszana,
  reklamy i pauzy są pomijane); ponowne kliknięcie albo Stop w panelu zatrzymuje. Kolejny film w tej samej karcie =
  nowe źródło. Przeglądarka pyta o dostęp tylko do youtube.com.
- **Rozpoznawanie artykułu po budowie strony:** og:type, schema.org (NewsArticle i pokrewne), nagłówek h1 w treści
  z akapitami. Strona główna serwisu i zajawki – bez ikonki. Działa też przy przejściu do kolejnego artykułu bez
  przeładowania strony.

## 0.7.6 – 12 listopada 2026

### Zmiany
- **Autor posta bez „Obserwuj”:** przy oficjalnych profilach i stronach na Facebooku niebieskie „Obserwuj” (a w grupach
  „Dołącz”) obok nazwy nie trafia już do autora ani do tytułu źródła.
- **Karta twierdzenia:** po rozwinięciu od razu widać wszystkie sekcje – „Co potwierdza”, „Przeciwne dane / kontekst” i
  „Czego brakuje” (wcześniej rozwinięta była tylko pierwsza).
- **Ikonka przy postach – osobno dla Facebooka i X:**
  - dwa przełączniki w ⚙ → Ikonka przy postach;
  - przeglądarka pyta o zgodę tylko na serwis, który włączasz;
  - wyłączenie jednego serwisu nie rusza drugiego;
  - kto miał włączoną dawną wspólną opcję, ma włączone oba serwisy.

## 0.7.5 – 12 listopada 2026

### Zmiany
- **Ikonka przy postach (Facebook, X) – tylko po najechaniu:**
  - pojawia się dopiero, gdy kursor jest nad postem, w jego prawym górnym rogu, na lewo od „…” (na X także od ikonki Groka);
  - nie zmienia układu strony: leży nad nią, zamiast przycisku „Sprawdź fakty” pod tekstem i w pasku akcji;
  - kursor nad komentarzem albo udostępnionym postem pokazuje ikonkę posta „z wierzchu”;
  - chowa się, gdy jej miejsce zasłania górny pasek serwisu (przewinięty post);
  - post bez „…” ma ikonkę przy prawej krawędzi.
- **Stan ikonki:**
  - w trakcie sprawdzania się kręci;
  - po wyniku jest wypełniona – kliknięcie chowa ramkę, następne pokazuje ją z powrotem.
- **Ramka z wynikiem:** na Facebooku pod tekstem posta, na X pod paskiem akcji (bez zmian).
- **Lżejszy skrypt na stronie:** nie przegląda już strony przy każdej zmianie, reaguje tylko na ruch myszy.

## 0.7.4 – 12 listopada 2026

### Zmiany
- **„Kopiuj jako odpowiedź” zaczyna od Oryginału:**
  - po kliknięciu od razu jest tekst werdyktu, bez zapytania do modelu (za darmo);
  - model pisze dopiero po wybraniu tonu: Rzeczowo, Na luzie albo Krótko pod X;
  - zakładki są w jednym rzędzie, „Oryginał” skrajnie z prawej;
  - okienko nie zapamiętuje już ostatniego tonu, a posty z X nie przełączają się same na krótką wersję.
- **„Kopiuj jako odpowiedź” w ocenie całości:**
  - przycisk w stopce oceny daje jeden komentarz do wszystkich werdyktów źródła;
  - Oryginał zaczyna się od oceny całości („Ocena całości: Mieszany. …”);
  - „Odpowiedz na cały post” przy źródle zostaje tylko wtedy, gdy oceny całości jeszcze nie ma.
- **Bez 👍/👎 – „Sprawdź dokładniej” w stopce każdej karty:**
  - otwiera pole na uwagę (opcjonalną) i wybór dostawcy;
  - „Sprawdź” albo Enter uruchamia sprawdzenie, „Anuluj” zamyka pole bez wysyłania.
- **Eksport w Historii:**
  - nazywa się „Eksportuj dokładniejsze sprawdzenia (JSON)”;
  - obejmuje werdykty sprawdzone dokładniej: uwagę oraz werdykt przed i po;
  - dawne oceny 👍/👎 nadal są w eksporcie;
  - to samo sprawdzenie wczytane z pamięci w kolejnej sesji liczy się raz.

## 0.7.3 – 12 listopada 2026

### Nowy wygląd
- **Panel według projektu „fact-checker-design”:**
  - wspólne kolory, odstępy i komponenty (`fc-tokens.css`, `fc-components.css`);
  - jasny i ciemny motyw według systemu;
  - czcionka Inter dołączona do wtyczki, bez łączenia z Google Fonts;
  - ikony Lucide zamiast emoji;
  - działa przy szerokości od 320 do 480 px.
- **Start:**
  - karty „Sprawdź stronę” (Artykuł, Wskaż post, Zaznaczenie, Wycinek) i „Słuchaj na żywo”, do tego „Jak to działa” i ostatnia sesja;
  - po pierwszym wyniku te same przyciski zostają nad wynikami jako zwarty pasek.
- **Wynik:**
  - karta źródła, ocena całości z paskiem pięciu poziomów (także stan „Nie do oceny”), ostrzeżenie przed oszustwem (wysokie ryzyko – nad oceną);
  - **pigułki werdyktów filtrują karty** – nowość;
  - przełącznik „Tylko problemy” i koszt.
- **Karty:**
  - zwinięte od razu, problemy na górze (wcześniej dopiero po ocenie całości);
  - rozwinięta jest jedyna karta źródła i najnowsza z nagrania;
  - szczegóły w zwijanych sekcjach;
  - źródła z inicjałem serwisu, domeną i poziomem.
- **Na żywo:** czerwony pasek z czasem i przyciskiem Stop, mówcy jako chipy z inicjałami.
- **Ustawienia:** rozwijane sekcje z podsumowaniem pod tytułem; Zapisz/Anuluj zawsze widoczne na dole.
- **Historia i podgląd** jako pełne ekrany ze strzałką „Wróć”; „Kopiuj jako odpowiedź” i „Zamiana mowy na tekst” wysuwają się od dołu.

### Nowe
- **Wynik pod postem na X i Facebooku:**
  - przycisk „Sprawdź fakty” pokazuje stan (Sprawdzam… → Ukryj ⇄ Pokaż wynik);
  - pod postem pojawia się ramka z oceną całości, werdyktami, opinią, źródłami oraz przyciskami „Kopiuj jako odpowiedź” i „Szczegóły w panelu”;
  - ramka jest w zamkniętym Shadow DOM i aktualizuje się po „Sprawdź dokładniej” albo „Podsumuj całość”.
- **Opcja „Zapisuj sesje w historii”** (domyślnie włączona). Wyłączona: wyniki znikają po zamknięciu panelu.

### Bez zmian
- Logika sprawdzania, koszty w USD, nazwy poziomów oceny (Rzetelny … Nierzetelny).
- „Kopiuj” w odpowiedzi pod X nie jest blokowane powyżej 280 znaków – licznik tylko ostrzega.
- Nie dodaliśmy z projektu „anonimowych ocen 👍/👎” – wtyczka nie ma serwera i niczego nie wysyła autorom.

## 0.7.2 – 12 listopada 2026

### Ikonka przy postach na Facebooku i X
- **Jedno kliknięcie zamiast „Wskaż post”.** Po włączeniu opcji (⚙ → *Ikonka przy postach*) przy każdym poście jest
  ikonka Fact Checkera:
  - na Facebooku – pod tekstem posta, przycisk „Sprawdź fakty”;
  - na X – w pasku akcji tweeta, obok „Odpowiedz / Podaj dalej / Lubię”;
  - przy postach bez tekstu (np. sam mem) – w rogu posta, po najechaniu na niego myszą.
- Kliknięcie otwiera panel i od razu sprawdza ten post: z obrazkami i linkami, bez komentarzy, bez okna podglądu.
  Na Facebooku wtyczka sama rozwija „Zobacz więcej”. Skrócony tweet nadal pokazuje podgląd, żeby można było wkleić
  resztę.
- Ikonki pojawiają się też przy postach doładowywanych podczas przewijania. Nie ma ich przy komentarzach ani
  przy poście udostępnionym wewnątrz innego.
- **Domyślnie wyłączone.** Przy włączaniu przeglądarka pyta o dostęp tylko do facebook.com i x.com. Opcja działa
  od razu, w już otwartych kartach, bez zapisywania i odświeżania; wyłączenie od razu zdejmuje ikonki.
- **Prywatność bez zmian:** skrypt ikonek szuka na stronie tylko miejsc na ikonkę. Treść posta jest czytana
  i wysyłana do modelu dopiero po kliknięciu.
- Gdyby przeglądarka nie pozwoliła otworzyć panelu, post czeka w kolejce, na ikonie wtyczki jest licznik,
  a na stronie podpowiedź, gdzie kliknąć.
- „Wskaż post” rozpoznaje teraz także posty w kanale Facebooka oznaczone inaczej niż `role="article"`.

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
