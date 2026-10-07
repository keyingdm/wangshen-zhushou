# Bundled local dependencies

These resources are shipped with the extension. Document extraction and OCR do not fetch code or model data from a CDN at runtime. Source files are unmodified upstream distributions; the SHA-256 inventory is in `vendor/SHA256.json`.

| Dependency | Version / source | License | Local path |
| --- | --- | --- | --- |
| JSZip | 3.10.1, installed runtime distribution | MIT or GPLv3 dual license; used under MIT | vendor/jszip/LICENSE.markdown |
| PDF.js | 5.6.205, legacy browser distribution | Apache-2.0 | vendor/pdfjs/LICENSE |
| Tesseract.js | 7.0.0, browser distribution | Apache-2.0 + bundled third-party notices | vendor/ocr/LICENSE.md and *.LICENSE.txt |
| Tesseract.js-core | 7.0.0, LSTM Wasm builds | Apache-2.0 | vendor/ocr/core/LICENSE |
| tessdata_fast | eng + chi_sim from upstream main, fetched 2026-10-06, hashes pinned in inventory | Apache-2.0 | vendor/ocr/lang/LICENSE |

Upstream: [JSZip](https://github.com/Stuk/jszip), [PDF.js](https://github.com/mozilla/pdf.js), [Tesseract.js](https://github.com/naptha/tesseract.js), [Tesseract.js-core](https://github.com/naptha/tesseract.js-core), [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast).

PDF CMaps, standard fonts and Wasm decoders retain their upstream license / copyright notices in their respective directories. Tesseract language files were downloaded from `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/{eng,chi_sim}.traineddata`.
