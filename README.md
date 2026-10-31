# MPMB Web

A web version of [MorePurpleMoreBetter's D&D 5.5e (2024) Character Record Sheet](https://github.com/morepurplemorebetter/2024_MPMBs-Character-Record-Sheet),
for playing and building characters in the browser on laptops and tablets. It runs MPMB's own sheet
logic in the browser, so it behaves like the PDF without needing Adobe Acrobat.

MPMB Web is an unofficial fan project, not affiliated with or endorsed by MorePurpleMoreBetter (Joost
Wijnen). Get the PDF sheets from MPMB directly: [MPMB's website](https://www.flapkan.com/download/#charactersheets)
or [MPMB's Patreon](https://www.patreon.com/morepurplemorebetter).

**Status:** in development. Built for a single play group first. You can import characters from filled
MPMB PDFs (Colorful A4 v24.2.0, with the add-on scripts in them), keep them in the browser, and move
them between devices with backup files, and play them at the table: hit points, conditions, attacks,
spell slots, limited features, rests, checks, inventory, features and notes, on laptops and the iPad.
The engine (MPMB's scripts on a stand-in for Acrobat) matches Acrobat on the reference characters.

The font is [Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/) by the Braille
Institute (SIL Open Font License 1.1), bundled with the app.

## Develop

Needs Node 22 and pnpm 10.

```sh
pnpm install
pnpm dev            # local server
pnpm test           # unit tests (Vitest)
pnpm check          # type checks
pnpm build          # static build in dist/
pnpm format:check   # Prettier
```

### Where things are

- `vendor/mpmb/`: MPMB's scripts, unchanged (see `vendor/README.md`).
- `src/engine/`: the stand-in for Acrobat's JavaScript API that runs them: fields, events, calculations,
  dialogs, templates. `src/engine/data/colorful-a4.json` is the blank Colorful A4 sheet.
- `src/pdf/`: reads MPMB sheet PDFs (the blank sheet and filled characters).
- `src/worker/`: the engine in a Web Worker, with pop-ups that wait for the user. That needs a
  cross-origin isolated page: `pnpm dev` and `pnpm preview` send the headers, the live site gets them
  from `public/.htaccess`.
- `src/store/`: characters in the browser (IndexedDB) and backup files.
- `src/popups/`: the page's side of MPMB's pop-ups (alerts, menus, dialogs) and the app's own questions.
- `src/views/`, `src/App.svelte`, `src/session.svelte.ts`: the pages and what they do.
- `test/`: the reference characters (made in Acrobat, SRD only) and the tests that compare the engine
  with them. `test/browser/engine-check.html` runs one of them through the worker in a browser: open it
  under `pnpm dev`.

Sheet data from a PDF (Node 22 runs the TypeScript directly):

```sh
node tools/extract-sheet.ts <blank Colorful A4.pdf>            # src/engine/data/colorful-a4.json
node tools/extract-character.ts <filled sheet.pdf> <out.json>  # a character as differences from it
```

## Deploy

The live app is at <https://remph.de/mpmb/>. Every push to `main` (a merged pull request) runs
`.github/workflows/deploy.yml`: install, test, type check, build, then `scripts/deploy.sh` uploads
`dist/` into that folder over FTP with TLS. The folder then equals the build; characters are not on
the server (they live in each player's browser), so a deploy never touches them.

- The folder needs Apache with `mod_headers`: `public/.htaccess` sends the two cross-origin isolation
  headers the pop-ups depend on, keeps `index.html` fresh and caches the hashed build files.
- Setup, once: an FTP user whose base folder is the app's folder (so it can't reach the rest of the
  site), then the repository secrets `DEPLOY_HOST` (the server name in its TLS certificate),
  `DEPLOY_USER`, `DEPLOY_PASSWORD` and `DEPLOY_DIR` (`/` for such a user). Then Actions, "Deploy to
  remph.de", Run workflow with "dry run" ticked, and read the list of uploads and deletions.
- Safety nets: no upload without `index.html`, `.htaccess` and `assets/` in the build, and none into
  a folder that has subfolders the app doesn't make (a wrong `DEPLOY_DIR` pointing at the site's root).
- By hand: `pnpm build`, then copy everything in `dist/` into the folder, including the hidden
  `.htaccess`, and delete files from an older build.

## Credits and licence

- Sheet logic and data: [MPMB's Character Record Sheet](https://github.com/morepurplemorebetter/2024_MPMBs-Character-Record-Sheet)
  by Joost Wijnen (morepurplemorebetter), Flapkan Productions, GPL-3.0. This project is not made or
  endorsed by MPMB.
- This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the
  Coast LLC, available at <https://www.dndbeyond.com/srd>. The SRD 5.2.1 is licensed under the Creative
  Commons Attribution 4.0 International License, available at
  <https://creativecommons.org/licenses/by/4.0/legalcode>.
- Dungeons & Dragons is a trademark of Wizards of the Coast LLC. This project is unofficial.
- Only SRD content is included. Other content can be added by each player through MPMB add-on scripts,
  which stay in their own browser.

MPMB Web is free software: you can redistribute it and/or modify it under the terms of the GNU General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at your
option) any later version. See [LICENSE](LICENSE).
