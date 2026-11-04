# Vendored code

## `mpmb/`: MPMB's Character Record Sheet scripts

The document-level JavaScript of
[MPMB's D&D 5.5e (2024) Character Record Sheet](https://github.com/morepurplemorebetter/2024_MPMBs-Character-Record-Sheet)
by Joost Wijnen (morepurplemorebetter), Flapkan Productions, GPL-3.0 (see `mpmb/LICENSE` and
`mpmb/README.md`). The app runs these scripts unchanged on its stand-in for Acrobat's JavaScript API.

- Upstream commit: `475f46bc344a2e00dbe3eb2dc234afcd5b16e817` (2026-10-29, v24.2.0-3-g475f46b).
- Copied: `_functions/`, `_variables/`, `LICENSE`, `README.md`. Nothing in them is changed.
- To update: see "Updating" below.

The blank-sheet data in `src/engine/data/colorful-a4.json` (field names, field scripts, calculation
order, templates, bookmarks) comes from MPMB's Colorful A4 PDF v24.2.0, which MPMB distributes under
the same licence; `tools/extract-sheet.ts` makes it from the PDF.

## Updating

MPMB changes the scripts on GitHub every few days and releases a new PDF (a new sheet version, a tag
like `v24.2.0`) every few weeks. The scripts and the PDF belong together: scripts from after a release
may already use fields that only the next PDF has.

**New scripts, same sheet version** (commits since the release the app ships):

1. Get the upstream repository: `git clone https://github.com/morepurplemorebetter/2024_MPMBs-Character-Record-Sheet`
   (or `git pull` in an old checkout), and check out the commit to take.
2. `node tools/update-mpmb.ts <checkout>` copies the scripts here, writes the commit above, lists the
   changed scripts and names any field the scripts now use that the sheet data lacks.
3. `pnpm test`. The reference characters must still match Acrobat; `test/script-fields.test.ts` fails on
   a field the sheet lacks. If it does, the scripts need the next PDF: wait for the release.
4. A pull request as usual, with the tool's summary.

**A new release** (new PDF): the same steps for the release's tag, and also

- new sheet data from MPMB's new blank Colorful A4 PDF: `node tools/extract-sheet.ts <blank sheet.pdf>`,
  and the new version in `src/engine/sheet-id.ts`;
- new reference characters: the old reference PDFs imported into the new blank sheet in Acrobat
  (MPMB's "Import from another sheet"), then `node tools/extract-character.ts` for each;
- characters saved on the old version must still open (being built).
