# Polityka prywatności – Fact Checker

*Wersja z 14 listopada 2026 r. (wtyczka 0.7.8). English version below.*

Fact Checker to wtyczka do przeglądarki (Chrome, Edge, Opera), która sprawdza fakty w tym, co oglądasz i czytasz. Nie ma własnego serwera: nie zbiera statystyk, nie wysyła niczego autorom i nie ma kont użytkowników. Dane trafiają tylko do usług, które sam wybierzesz w ustawieniach, i tylko wtedy, gdy wtyczka wykonuje to, o co prosisz.

## Co, dokąd i kiedy jest wysyłane

| Co | Dokąd | Kiedy |
|---|---|---|
| Fragmenty transkrypcji rozmowy (tekst) | wybrany dostawca modelu: OpenAI (plan ChatGPT albo klucz API), Google Gemini, Anthropic Claude albo OpenRouter (a przez niego dostawca wybranego modelu) | w trakcie nagrywania, co kilkadziesiąt sekund, i po kliknięciu „Sprawdź teraz” |
| Tekst wskazany na stronie (artykuł, post, zaznaczenie) wraz z tytułem, adresem, nazwą serwisu, autorem i datą publikacji | wybrany dostawca modelu | tylko po Twoim wskazaniu: przycisk w panelu, menu pod prawym przyciskiem, skrót klawiszowy, ikonka przy poście lub przy tytule artykułu (opcja) |
| Zrzuty widocznych obrazków albo zaznaczonego wycinka ekranu | wybrany dostawca modelu | tylko po wskazaniu obrazka, posta z obrazkiem albo wycinka, po podglądzie z miniaturami (ikonka przy poście – bez podglądu). Zrzut jest odrzucany, jeśli w jego trakcie zmienisz kartę albo strona przejdzie gdzie indziej – nie trafi tam nic z innej karty |
| Dźwięk (kawałki nagrania) – z karty, z mikrofonu albo, po kliknięciu ikonki w odtwarzaczu YouTube, prosto z filmu | OpenAI – tylko gdy w ⚙ wybierzesz transkrypcję „OpenAI”. Domyślny model lokalny działa na Twoim komputerze i nic nie wysyła. Rozpoznawanie wbudowane w przeglądarkę (Chrome, Edge) działa według jej zasad. | w trakcie nagrywania |
| Werdykt i treść wskazanego posta (do napisania komentarza) | wybrany dostawca modelu | tylko po wybraniu tonu (Rzeczowo / Na luzie / Krótko pod X) w okienku „Kopiuj jako odpowiedź” – sam „Oryginał” nic nie wysyła |
| Twierdzenie, poprzedni werdykt, fragment tekstu wokół cytatu i Twoja uwaga (opcjonalna) | wybrany dostawca modelu albo inny, którego wskażesz na liście | tylko po kliknięciu „Sprawdź dokładniej” |
| Nic o Tobie – wtyczka tylko pobiera całą publiczną Listę Ostrzeżeń (plik z domenami) i sprawdza adresy u siebie | CERT Polska (hole.cert.pl) | najwyżej raz na 12 h, przy sprawdzaniu tekstu ze strony; można wyłączyć w ⚙ |
| Werdykty i początek sprawdzonego tekstu (do oceny całości) | wybrany dostawca modelu | po sprawdzeniu artykułu lub posta z co najmniej 2 twierdzeniami – można wyłączyć w ⚙ (wtedy tylko po kliknięciu „Podsumuj całość”) |
| Krótkie hasło z każdego twierdzenia (kilka słów kluczowych) | Google Fact Check Tools (factchecktools.googleapis.com) | tylko jeśli wpiszesz klucz Google Fact Check w ⚙ |
| Adres obrazka | Google Lens, TinEye albo Yandex | tylko po kliknięciu przycisku wyszukiwania obrazem |
| Pliki modeli rozpoznawania mowy (pobieranie) | huggingface.co | tylko po kliknięciu „Pobierz” przy modelu lokalnym |

Wyszukiwanie w sieci (jeśli jest włączone) wykonuje dostawca modelu po swojej stronie. Wtyczka nie widzi i nie zapisuje tych zapytań, poza ich liczbą w liczniku kosztów.

Gdy słuchasz dźwięku karty, wtyczka odczytuje z tej strony tylko datę publikacji filmu (metadane), żeby oceniać wypowiedzi według stanu na ten dzień.

## Czego wtyczka nie robi

- Panel nie łączy się z Google Fonts ani innymi serwerami czcionek – czcionka jest w paczce wtyczki.
- Nie czyta stron sama z siebie. Dostęp do strony daje kliknięcie ikony, menu albo skrótu (`activeTab`). Stały dostęp do witryny wymaga Twojej zgody („Zawsze pozwalaj na …”).
- Opcja „Ikonka przy postach” (domyślnie wyłączona) włącza się osobno dla Facebooka i dla X; każdy wymaga Twojej osobnej zgody – tylko na ten serwis (facebook.com albo x.com). Skrypt na tych stronach tylko pokazuje ikonkę nad postem, na który najedziesz myszą – treść posta jest czytana i wysyłana dopiero po kliknięciu ikonki. Wyłączenie serwisu zdejmuje z niego ikonki i wyłącza tam skrypt. Wynik sprawdzenia pokazuje się pod postem w ramce wtyczki – tylko u Ciebie; wtyczka niczego nie publikuje w serwisie, a ramka jest w zamkniętym Shadow DOM, więc skrypty strony nie mają do niej zwykłego dostępu.
- Opcja „Ikonka przy artykułach” (domyślnie wyłączona) działa na serwisach informacyjnych z listy, które zostawisz zaznaczone, na serwisach dodanych przez Ciebie albo – jeśli wybierzesz „Wszędzie” – na wszystkich stronach; wymaga Twojej zgody na te strony. Skrypt ikonki rozpoznaje artykuł tylko po budowie strony (znaczniki og:type i schema.org, nagłówek h1) i pokazuje ikonkę po najechaniu na tytuł – tekst artykułu jest czytany i wysyłany dopiero po kliknięciu ikonki. Znaczek z oceną przy tytule widzisz tylko Ty (zamknięty Shadow DOM). Adres strony, na której jest skrypt, nie wychodzi poza wtyczkę – służy tylko do pokazania zapamiętanej oceny.
- Opcja „Ikonka w filmach” (domyślnie wyłączona) wymaga Twojej zgody na youtube.com. Skrypt na tej stronie tylko pokazuje ikonkę na pasku odtwarzacza – dopiero jej kliknięcie włącza słuchanie: dźwięk filmu idzie z karty do panelu wtyczki (w przeglądarce) i dalej tak samo jak dźwięk karty po Start. Ponowne kliknięcie, Stop w panelu albo zamknięcie panelu kończy słuchanie. W trakcie reklamy i pauzy dźwięk nie jest przekazywany.
- Nie wysyła komentarzy pod postem ani reszty strony, tylko wskazany fragment.
- Nie ma telemetrii, analityki ani reklam. Autorzy wtyczki nie dostają żadnych danych.

## Co jest zapisywane na Twoim komputerze

Wszystko poniżej zostaje w profilu przeglądarki i znika po odinstalowaniu wtyczki:

- **ustawienia** (chrome.storage);
- **klucze API**: zapisane w przeglądarce jawnym tekstem, nie są szyfrowane. Możesz włączyć opcję „nie zapamiętuj kluczy” – wtedy zostają tylko do zamknięcia przeglądarki. Używaj kluczy z limitem wydatków ustawionym u dostawcy;
- **logowanie do ChatGPT** (tokeny OAuth);
- **historia sesji**: werdykty, transkrypcje, sprawdzane teksty i miniatury obrazków (IndexedDB). Usuniesz ją w 🕘 Historii;
- **pamięć werdyktów**: skróty i „odciski” sprawdzonych tekstów i obrazków z wynikami (IndexedDB). Wyczyścisz ją w ⚙;
- **oceny sprawdzonych artykułów** (do znaczka przy tytule): adres artykułu i ocena całości, bez treści – tylko przy włączonej pamięci werdyktów; wygasają i czyszczą się razem z nią;
- **licznik kosztów** z bieżącego dnia;
- **pobrane modele rozpoznawania mowy**.

Pliki eksportu (.md, .json z ocenami, raport .html) powstają w folderze Pobrane tylko wtedy, gdy o to poprosisz albo włączysz automatyczny eksport.

## Opcje prywatności

**Zamazywanie osób** (⚙ → Prywatność) działa tak:

- na zrzutach zamazuje zdjęcia profilowe i nazwy autorów, zanim zrzut opuści przeglądarkę;
- z tekstu wysyłanego do modelu usuwa autora posta i @uchwyty.

Podgląd przed wysłaniem pokazuje dokładnie to, co pójdzie do modelu.

## Uprawnienia wtyczki

- `tabCapture` (opcjonalne – przeglądarka pyta przy pierwszym Start z dźwiękiem karty): nagrywanie dźwięku karty, na której klikniesz Start. Chrome opisuje je jako „Odczytywanie i zmienianie wszystkich Twoich danych we wszystkich witrynach” – to jego stały tekst dla nagrywania karty, nie dostęp do stron. Bez tej zgody Start działa przez okno „Udostępnij kartę”.
- `activeTab`, `scripting`: odczyt wskazanego tekstu i podświetlenia na stronie.
- `contextMenus`: menu pod prawym przyciskiem.
- `storage`, `unlimitedStorage`: ustawienia, historia i modele lokalne.
- `downloads`: eksport plików.
- `tabs`: tytuł i adres karty.
- `sidePanel`: panel boczny w Chrome i Edge.
- `webRequest`: przechwycenie powrotu z logowania ChatGPT na adres 127.0.0.1.
- Dostęp do wszystkich stron jest opcjonalny i nadajesz go sam, np. dla zrzutów obrazków.
- Dostęp do facebook.com i do x.com (opcjonalny, każdy osobno): tylko dla ikonki przy postach w serwisie, w którym ją włączysz.
- Dostęp do serwisów informacyjnych z listy, do serwisów dodanych przez Ciebie albo do wszystkich stron (opcjonalny): tylko dla ikonki przy artykułach – w trybie, który wybierzesz.
- Dostęp do youtube.com (opcjonalny): tylko dla ikonki w odtwarzaczu, która jednym kliknięciem włącza słuchanie filmu.

## Usługi zewnętrzne

Dane wysłane do dostawców podlegają ich zasadom:

- [OpenAI](https://openai.com/policies/privacy-policy/)
- [Google (Gemini API)](https://ai.google.dev/gemini-api/terms) i [Google](https://policies.google.com/privacy)
- [Anthropic](https://www.anthropic.com/legal/privacy)
- [OpenRouter](https://openrouter.ai/privacy)

W bezpłatnych planach niektórzy dostawcy mogą wykorzystywać dane do ulepszania swoich usług.

## Kontakt

Pytania i zgłoszenia: zakładka Issues w repozytorium projektu na GitHubie.

---

# Privacy policy – Fact Checker

*Version of 14 November 2026 (extension 0.7.8).*

Fact Checker is a browser extension (Chrome, Edge, Opera) that fact-checks what you watch and read. It has no server of its own: no analytics, nothing is sent to its authors, and there are no user accounts. Data goes only to the services you choose in the settings, and only while the extension does what you asked for.

## What is sent, where and when

| What | Where | When |
|---|---|---|
| Transcript excerpts (text) | the model provider you chose: OpenAI (ChatGPT plan or API key), Google Gemini, Anthropic Claude or OpenRouter (and through it the provider of the chosen model) | while recording, every few dozen seconds, and when you click “Check now” |
| Text you point at on a page (article, post, selection) with its title, URL, site name, author and publication date | the chosen model provider | only after you point at it: panel button, right-click menu, keyboard shortcut, the icon on a post or next to an article's headline (optional) |
| Screenshots of visible images or of a selected screen area | the chosen model provider | only after you point at an image, a post with images or an area, after a preview with thumbnails (the post icon skips the preview). A screenshot is discarded if you switch tabs or the page navigates away while it is taken – nothing from another tab gets in |
| Audio chunks – from the tab, the microphone or, after you click the icon in the YouTube player, straight from the video | OpenAI – only if you choose “OpenAI” transcription in ⚙. The default local model runs on your computer and sends nothing. Recognition built into the browser (Chrome, Edge) follows its rules. | while recording |
| The verdict and the text of the post you pointed at (to write a comment) | the chosen model provider | only when you pick a tone (Matter-of-fact / Casual / Short for X) in the “Copy as reply” window – the “Original” tab sends nothing |
| The claim, the earlier verdict, the text around the quote and your note (optional) | the chosen model provider, or another one you pick from the list | only when you click “Check more thoroughly” |
| Nothing about you – the extension only downloads the whole public warning list (a file of domains) and checks addresses locally | CERT Polska (hole.cert.pl) | at most every 12 hours, when checking text from a page; can be turned off in ⚙ |
| The verdicts and the beginning of the checked text (for the overall rating) | the chosen model provider | after checking an article or post with 2 or more claims – can be turned off in ⚙ (then only when you click “Sum up the whole”) |
| A short query for each claim (a few keywords) | Google Fact Check Tools (factchecktools.googleapis.com) | only if you enter a Google Fact Check key in ⚙ |
| An image URL | Google Lens, TinEye or Yandex | only when you click a reverse image search button |
| Speech model files (download) | huggingface.co | only when you click “Download” for a local model |

Web search (when enabled) is done by the model provider on its side. The extension does not see or store those queries, except for counting them in the cost counter.

When you listen to a tab, the extension reads only the video’s publication date (page metadata) from that page, so that statements are judged as of that day.

## What the extension does not do

- The panel does not contact Google Fonts or any other font server – the font ships with the extension.
- It never reads pages on its own. Page access comes from clicking the icon, the menu or the shortcut (`activeTab`). Permanent access to a site requires your consent (“Always allow on …”).
- The “Icon on posts” option (off by default) is switched on separately for Facebook and for X; each needs your separate consent for that site only (facebook.com or x.com). The script on those sites only shows an icon over the post you hover – a post's content is read and sent only after you click the icon. Switching a site off removes the icons there and stops the script on it. The result is shown under the post in the extension's own box – only to you; nothing is posted to the site, and the box lives in a closed Shadow DOM, so the site's scripts have no ordinary access to it.
- The “Icon on articles” option (off by default) works on the news sites from the list that you keep ticked, on sites you add yourself or – if you choose “Everywhere” – on all sites; it needs your consent for those sites. The icon script recognises an article only by the page's structure (og:type and schema.org tags, the h1 headline) and shows the icon when you hover over the headline – the article text is read and sent only after you click the icon. The rating badge next to the headline is visible only to you (closed Shadow DOM). The address of the page the script runs on never leaves the extension – it is used only to show a remembered rating.
- The “Icon in videos” option (off by default) needs your consent for youtube.com. The script there only shows an icon in the player bar – listening starts only when you click it: the video's sound goes from the tab to the extension's panel (inside the browser) and on exactly like tab audio after Start. Clicking again, Stop in the panel or closing the panel ends listening. During ads and pauses no sound is passed on.
- It does not send comments or the rest of the page, only the part you pointed at.
- No telemetry, analytics or ads. The authors receive no data.

## What is stored on your computer

Everything below stays in your browser profile and is removed when you uninstall the extension:

- **settings** (chrome.storage);
- **API keys**: stored in the browser as plain text, not encrypted. You can turn on “don’t remember keys” so they are kept only until the browser closes. Use keys with a spending limit set at the provider;
- **ChatGPT sign-in** (OAuth tokens);
- **session history**: verdicts, transcripts, checked texts and image thumbnails (IndexedDB). Delete it in 🕘 History;
- **verdict memory**: hashes and fingerprints of checked texts and images with their results (IndexedDB). Clear it in ⚙;
- **ratings of checked articles** (for the badge next to the headline): the article's address and its overall rating, no text – only while verdict memory is on; they expire and are cleared together with it;
- **today’s cost counter**;
- **downloaded speech models**.

Export files (.md, .json with ratings, .html report) are created in your Downloads folder only when you ask for them or turn on automatic export.

## Privacy options

**Hide people** (⚙ → Privacy) works like this:

- on screenshots it blurs profile pictures and author names before the screenshot leaves the browser;
- from text sent to the model it removes the post author and @handles.

The preview before sending shows exactly what will go to the model.

## Permissions

- `tabCapture` (optional – the browser asks on the first Start with tab audio): recording the audio of the tab you start on. Chrome describes it as “Read and change all your data on all websites” – that is its fixed wording for recording a tab, not access to websites. Without this permission Start works through the “Share tab” window.
- `activeTab`, `scripting`: reading the text you point at and highlighting on the page.
- `contextMenus`: the right-click menu.
- `storage`, `unlimitedStorage`: settings, history and local models.
- `downloads`: exporting files.
- `tabs`: the tab’s title and URL.
- `sidePanel`: the side panel in Chrome and Edge.
- `webRequest`: catching the ChatGPT sign-in redirect to 127.0.0.1.
- Access to all sites is optional and granted by you, e.g. for image screenshots.
- Access to facebook.com and to x.com (optional, each separately): only for the icon on posts on the site where you turn it on.
- Access to the news sites from the list, to sites you add or to all sites (optional): only for the icon on articles – in the mode you choose.
- Access to youtube.com (optional): only for the icon in the player that starts listening to the video with one click.

## Third-party services

Data sent to providers is subject to their policies:

- [OpenAI](https://openai.com/policies/privacy-policy/)
- [Google (Gemini API)](https://ai.google.dev/gemini-api/terms) and [Google](https://policies.google.com/privacy)
- [Anthropic](https://www.anthropic.com/legal/privacy)
- [OpenRouter](https://openrouter.ai/privacy)

On free plans some providers may use data to improve their services.

## Contact

Questions and reports: the Issues tab of the project’s GitHub repository.
