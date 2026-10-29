# Vendored code

## `mpmb/`: MPMB's Character Record Sheet scripts

The document-level JavaScript of
[MPMB's D&D 5.5e (2024) Character Record Sheet](https://github.com/morepurplemorebetter/2024_MPMBs-Character-Record-Sheet)
by Joost Wijnen (morepurplemorebetter), Flapkan Productions, GPL-3.0 (see `mpmb/LICENSE` and
`mpmb/README.md`). The app runs these scripts unchanged on its stand-in for Acrobat's JavaScript API.

- Upstream commit: `475f46bc344a2e00dbe3eb2dc234afcd5b16e817` (2026-10-29).
- Copied: `_functions/`, `_variables/`, `LICENSE`, `README.md`. Nothing in them is changed.
- To update: copy the same folders and files from a newer upstream checkout, change the commit above,
  then run `pnpm test`; the reference characters show whether anything behaves differently. A new
  sheet version (not only new scripts) also needs new sheet data and new reference characters.

The blank-sheet data in `src/engine/data/colorful-a4.json` (field names, field scripts, calculation
order, templates, bookmarks) comes from MPMB's Colorful A4 PDF v24.2.0, which MPMB distributes under
the same licence; `tools/extract-sheet.ts` makes it from the PDF.
