# Polityka prywatności – Fact Checker

*Wersja z 11 listopada 2026 r. (wtyczka 0.5.4). English version below.*

Fact Checker to wtyczka do przeglądarki (Chrome, Edge, Opera), która sprawdza fakty w tym, co oglądasz i czytasz. Nie ma własnego serwera: nie zbiera statystyk, nie wysyła niczego autorom i nie ma kont użytkowników. Dane trafiają tylko do usług, które sam wybierzesz w ustawieniach, i tylko wtedy, gdy wtyczka wykonuje to, o co prosisz.

## Co, dokąd i kiedy jest wysyłane

| Co | Dokąd | Kiedy |
|---|---|---|
| Fragmenty transkrypcji rozmowy (tekst) | wybrany dostawca modelu: OpenAI (plan ChatGPT albo klucz API), Google Gemini, Anthropic Claude albo OpenRouter (a przez niego dostawca wybranego modelu) | w trakcie nagrywania, co kilkadziesiąt sekund, i po kliknięciu „Sprawdź teraz” |
| Tekst wskazany na stronie (artykuł, post, zaznaczenie) wraz z tytułem, adresem, nazwą serwisu, autorem i datą publikacji | wybrany dostawca modelu | tylko po Twoim wskazaniu: przycisk w panelu, menu pod prawym przyciskiem, skrót klawiszowy |
| Zrzuty widocznych obrazków albo zaznaczonego wycinka ekranu | wybrany dostawca modelu | tylko po wskazaniu obrazka, posta z obrazkiem albo wycinka, po podglądzie z miniaturami |
| Dźwięk (kawałki nagrania) | OpenAI – tylko gdy w ⚙ wybierzesz transkrypcję „OpenAI”. Domyślny model lokalny działa na Twoim komputerze i nic nie wysyła. Rozpoznawanie wbudowane w przeglądarkę (Chrome, Edge) działa według jej zasad. | w trakcie nagrywania |
| Werdykt i treść wskazanego posta (do napisania komentarza) | wybrany dostawca modelu | tylko po kliknięciu „Kopiuj jako odpowiedź” albo „Odpowiedz na cały post” |
| Krótkie hasło z każdego twierdzenia (kilka słów kluczowych) | Google Fact Check Tools (factchecktools.googleapis.com) | tylko jeśli wpiszesz klucz Google Fact Check w ⚙ |
| Adres obrazka | Google Lens, TinEye albo Yandex | tylko po kliknięciu przycisku wyszukiwania obrazem |
| Pliki modeli rozpoznawania mowy (pobieranie) | huggingface.co | tylko po kliknięciu „Pobierz” przy modelu lokalnym |

Wyszukiwanie w sieci (jeśli jest włączone) wykonuje dostawca modelu po swojej stronie. Wtyczka nie widzi i nie zapisuje tych zapytań, poza ich liczbą w liczniku kosztów.

Gdy słuchasz dźwięku karty, wtyczka odczytuje z tej strony tylko datę publikacji filmu (metadane), żeby oceniać wypowiedzi według stanu na ten dzień.

## Czego wtyczka nie robi

- Nie czyta stron sama z siebie. Dostęp do strony daje kliknięcie ikony, menu albo skrótu (`activeTab`). Stały dostęp do witryny wymaga Twojej zgody („Zawsze pozwalaj na …”).
- Nie wysyła komentarzy pod postem ani reszty strony, tylko wskazany fragment.
- Nie ma telemetrii, analityki ani reklam. Autorzy wtyczki nie dostają żadnych danych.

## Co jest zapisywane na Twoim komputerze

Wszystko poniżej zostaje w profilu przeglądarki i znika po odinstalowaniu wtyczki:

- **ustawienia** (chrome.storage);
- **klucze API**: zapisane w przeglądarce jawnym tekstem, nie są szyfrowane. Możesz włączyć opcję „nie zapamiętuj kluczy” – wtedy zostają tylko do zamknięcia przeglądarki. Używaj kluczy z limitem wydatków ustawionym u dostawcy;
- **logowanie do ChatGPT** (tokeny OAuth);
- **historia sesji**: werdykty, transkrypcje, sprawdzane teksty i miniatury obrazków (IndexedDB). Usuniesz ją w 🕘 Historii;
- **pamięć werdyktów**: skróty i „odciski” sprawdzonych tekstów i obrazków z wynikami (IndexedDB). Wyczyścisz ją w ⚙;
- **licznik kosztów** z bieżącego dnia;
- **pobrane modele rozpoznawania mowy**.

Pliki eksportu (.md, .json z ocenami, raport .html) powstają w folderze Pobrane tylko wtedy, gdy o to poprosisz albo włączysz automatyczny eksport.

## Opcje prywatności

**Zamazywanie osób** (⚙ → Prywatność) działa tak:

- na zrzutach zamazuje zdjęcia profilowe i nazwy autorów, zanim zrzut opuści przeglądarkę;
- z tekstu wysyłanego do modelu usuwa autora posta i @uchwyty.

Podgląd przed wysłaniem pokazuje dokładnie to, co pójdzie do modelu.

## Uprawnienia wtyczki

- `tabCapture`: dźwięk karty.
- `activeTab`, `scripting`: odczyt wskazanego tekstu i podświetlenia na stronie.
- `contextMenus`: menu pod prawym przyciskiem.
- `storage`, `unlimitedStorage`: ustawienia, historia i modele lokalne.
- `downloads`: eksport plików.
- `tabs`: tytuł i adres karty.
- `sidePanel`: panel boczny w Chrome i Edge.
- `webRequest`: przechwycenie powrotu z logowania ChatGPT na adres 127.0.0.1.
- Dostęp do wszystkich stron jest opcjonalny i nadajesz go sam, np. dla zrzutów obrazków.

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

*Version of 11 November 2026 (extension 0.5.4).*

Fact Checker is a browser extension (Chrome, Edge, Opera) that fact-checks what you watch and read. It has no server of its own: no analytics, nothing is sent to its authors, and there are no user accounts. Data goes only to the services you choose in the settings, and only while the extension does what you asked for.

## What is sent, where and when

| What | Where | When |
|---|---|---|
| Transcript excerpts (text) | the model provider you chose: OpenAI (ChatGPT plan or API key), Google Gemini, Anthropic Claude or OpenRouter (and through it the provider of the chosen model) | while recording, every few dozen seconds, and when you click “Check now” |
| Text you point at on a page (article, post, selection) with its title, URL, site name, author and publication date | the chosen model provider | only after you point at it: panel button, right-click menu, keyboard shortcut |
| Screenshots of visible images or of a selected screen area | the chosen model provider | only after you point at an image, a post with images or an area, after a preview with thumbnails |
| Audio chunks | OpenAI – only if you choose “OpenAI” transcription in ⚙. The default local model runs on your computer and sends nothing. Recognition built into the browser (Chrome, Edge) follows its rules. | while recording |
| The verdict and the text of the post you pointed at (to write a comment) | the chosen model provider | only when you click “Copy as reply” or “Reply to the whole post” |
| A short query for each claim (a few keywords) | Google Fact Check Tools (factchecktools.googleapis.com) | only if you enter a Google Fact Check key in ⚙ |
| An image URL | Google Lens, TinEye or Yandex | only when you click a reverse image search button |
| Speech model files (download) | huggingface.co | only when you click “Download” for a local model |

Web search (when enabled) is done by the model provider on its side. The extension does not see or store those queries, except for counting them in the cost counter.

When you listen to a tab, the extension reads only the video’s publication date (page metadata) from that page, so that statements are judged as of that day.

## What the extension does not do

- It never reads pages on its own. Page access comes from clicking the icon, the menu or the shortcut (`activeTab`). Permanent access to a site requires your consent (“Always allow on …”).
- It does not send comments or the rest of the page, only the part you pointed at.
- No telemetry, analytics or ads. The authors receive no data.

## What is stored on your computer

Everything below stays in your browser profile and is removed when you uninstall the extension:

- **settings** (chrome.storage);
- **API keys**: stored in the browser as plain text, not encrypted. You can turn on “don’t remember keys” so they are kept only until the browser closes. Use keys with a spending limit set at the provider;
- **ChatGPT sign-in** (OAuth tokens);
- **session history**: verdicts, transcripts, checked texts and image thumbnails (IndexedDB). Delete it in 🕘 History;
- **verdict memory**: hashes and fingerprints of checked texts and images with their results (IndexedDB). Clear it in ⚙;
- **today’s cost counter**;
- **downloaded speech models**.

Export files (.md, .json with ratings, .html report) are created in your Downloads folder only when you ask for them or turn on automatic export.

## Privacy options

**Hide people** (⚙ → Privacy) works like this:

- on screenshots it blurs profile pictures and author names before the screenshot leaves the browser;
- from text sent to the model it removes the post author and @handles.

The preview before sending shows exactly what will go to the model.

## Permissions

- `tabCapture`: tab audio.
- `activeTab`, `scripting`: reading the text you point at and highlighting on the page.
- `contextMenus`: the right-click menu.
- `storage`, `unlimitedStorage`: settings, history and local models.
- `downloads`: exporting files.
- `tabs`: the tab’s title and URL.
- `sidePanel`: the side panel in Chrome and Edge.
- `webRequest`: catching the ChatGPT sign-in redirect to 127.0.0.1.
- Access to all sites is optional and granted by you, e.g. for image screenshots.

## Third-party services

Data sent to providers is subject to their policies:

- [OpenAI](https://openai.com/policies/privacy-policy/)
- [Google (Gemini API)](https://ai.google.dev/gemini-api/terms) and [Google](https://policies.google.com/privacy)
- [Anthropic](https://www.anthropic.com/legal/privacy)
- [OpenRouter](https://openrouter.ai/privacy)

On free plans some providers may use data to improve their services.

## Contact

Questions and reports: the Issues tab of the project’s GitHub repository.
