# ATLAS local tests
- `node tests/ids.test.js` - drop-ID engine (panel rollover, Z->AA, spares/voids, undo, restore, renumber). No browser needed.
- Browser tests (Playwright + Chrome): `npm i playwright-core pdf-lib`, serve the app on :8080, then
  - `node tests/make-rotated-pdf.js` (synthetic /Rotate 90/0/270 sheets)
  - `ATLAS_TEST_PDF=/path/to/print.pdf node tests/e2e-stage1.js` - 50 drops, TR1-A-01..48 -> TR1-B-01, spare in Drop Index only, undo/redo, duplicate warning, renumber preview, phone/tablet layout
  - `ATLAS_TEST_PDF=/path/to/print.pdf node tests/e2e-stage2.js` - sharper zoom, calibration, multi-cable, path lengths, MACs, vector export at true size, rotated export, offline reload, touch placement
  Stage 2 expects the print to be 2592x1728 pt (36x24 in); adjust the size assertion for other sheets. Screenshots go to `shots/` (git-ignored).
