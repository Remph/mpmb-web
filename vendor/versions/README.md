# Older versions of MPMB's sheet

Each folder here is one older release of MPMB's Colorful A4 sheet that the app keeps, so that characters
saved on it still open and can be updated to the current version with MPMB's own "Import from another
sheet" (see `src/sheet-versions.ts` and `src/engine/import-sheet.ts`).

A folder holds that release's `_functions/` and `_variables/` (MPMB's scripts, unchanged, as in
`vendor/mpmb/` at the time) and `colorful-a4.json` (its blank-sheet data, made by `tools/extract-sheet.ts`).
`node tools/keep-version.ts` copies the current version here; run it before updating to a new release
(see `vendor/README.md`, "Updating"). Same licence and credits as `vendor/mpmb/`.
