Biblioteki dołączone lokalnie (Chrome nie pozwala wtyczkom ładować kodu z CDN):

- `transformers.min.js` – @huggingface/transformers 4.3.2 (Apache-2.0), build przeglądarkowy z wbudowanym onnxruntime-web
- `ort-wasm-simd-threaded.asyncify.{mjs,wasm}` – onnxruntime-web 1.31.0-dev.20260914-8d85527a0 (MIT)

Aktualizacja: `npm pack @huggingface/transformers@<wersja>`, skopiuj `dist/transformers.min.js`,
a z `onnxruntime-web` w wersji z jego package.json – pliki `dist/ort-wasm-simd-threaded.asyncify.*`.
