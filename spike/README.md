# M1 spike (throwaway, not for merging)

Question: can MPMB's own scripts run unchanged in the browser on a small stand-in for Acrobat's
JavaScript API? Findings are written up in the private docs repo (`architecture.md`, `decisions.md`).

- `src/` the stand-in (`acrobat.js`: fields, events, calculation order, `app`, `util`, templates),
  `prelude.js` (`toSource()`), `sheet.js` (loads the 27 scripts, headless dialogs).
- `node/` Node runs of the same code in a `vm` context: `compare-open.mjs` (open a filled PDF,
  recalculate, compare every field with what Acrobat saved), `build-char.mjs` (type a character into
  the blank sheet, compare page 1), `ev.mjs` (evaluate an expression inside the loaded sheet).
- `web/` the same code in a Web Worker in Chromium (`run-browser.mjs`, Playwright): pop-ups that block
  the worker with `Atomics.wait`, timings, and reading a filled PDF with `@cantoo/pdf-lib`.
- `coop-test/` two tiny pages for the real host: `htaccess/` and `serviceworker/`.
- `tools/` `extract-pdf.py` (needs `pypdf`) turns a PDF into JSON; `build-upstream-json.mjs` bundles the
  upstream scripts.

`spike/data/` is git-ignored: it holds JSON made from the blank sheet and the reference characters.
Regenerate with `python3 -I spike/tools/extract-pdf.py <pdf> spike/data/<name>.json [--docjs]`.
