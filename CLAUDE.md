# Project conventions

MPMB Web (`mpmb-web`): a web version of MorePurpleMoreBetter's D&D 5.5e (2024) Character Record Sheet,
first for Nick's group (four 13-inch laptops, some with touch, and one iPad). Static site: Vite, Svelte 5,
TypeScript, built with pnpm. Public repo, GPL-3.0-or-later.

## What to read

- Plans, architecture, decisions and the PDF analysis live in the private repo `Remph/mpmb-web-dev`
  (`docs/roadmap.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/upstream.md`). Read the roadmap
  first; attach that repo if the session doesn't have it.
- Upstream: <https://github.com/morepurplemorebetter/2024_MPMBs-Character-Record-Sheet> (GPL-3.0). The
  app runs MPMB's own scripts unchanged on a browser stand-in for Acrobat's JavaScript API.

## Commands

In the repo root: `pnpm install`, `pnpm test` (Vitest), `pnpm check` (svelte-check and tsc),
`pnpm build`, `pnpm format:check` (`pnpm format` fixes; Prettier, config in `.prettierrc.json`).
`pnpm dev` serves the app locally.

## Git (human in the loop)

- Claude writes the code; Nick (GitHub `Remph`) reviews every diff, may edit it, and merges.
- Every change goes on its own `feature/<short-name>` branch (never `claude/...`) with a pull request
  (template in `.github/pull_request_template.md`). Never commit or push to `main`, never force-push,
  never rebase (merge `main` in instead).
- One thread pushes to a branch at a time: the review thread during the review, the building thread
  again afterwards. After a merge, new work goes on a new branch. If Nick merged a PR before its review
  finished, further fixes go on a new branch with a new PR.
- No deploy yet. From M5 on, `main` deploys to a folder on nick-scherer.de; this section will say how.
- The private repo `mpmb-web-dev` has its own rules (Claude merges there itself); see its `CLAUDE.md`.

## Checks (no CI on pull requests)

GitHub doesn't check pull requests here. Before reporting done, run `pnpm test`, `pnpm check`,
`pnpm build` and `pnpm format:check`, and list each with its result in the PR description (and anything
that could not run, with the reason). A review runs them again on the branch.

## Reviews

- Every code feature or fix gets an independent review in a new thread before Nick merges. Docs-only
  and text-only changes need none.
- A thread never reviews its own work. When done, it reports "ready for review"; the project's
  coordinator starts the review thread on the same branch, one review thread per PR.
- The review fixes what it judges worth fixing on the same branch without asking, and asks Nick only
  about design choices, one at a time.
- A small fix round is one build thread, one branch, one PR and one review thread; bigger milestones
  get a thread each.
- UI changes come with screenshots (laptop about 1440 px and iPad 820/1180 px, light and dark) and the
  Playwright script in the project folder, plus a phone-viewable overview page.

## Code rules

- Keep MPMB's upstream scripts unchanged; adapt them through the Acrobat stand-in, so new upstream
  releases drop in. Where a change is unavoidable, keep it small, mark it, and note it in the private
  repo's `docs/upstream.md`.
- TypeScript strict. Tests with the code, especially for pure logic and for anything that must match
  Acrobat's behaviour (reference characters).
- Laptops and touch first: touch targets of at least 44 px, nothing hover-only, no stray scroll bars
  from 1024 to 2560 px wide, one clear main action per place. The iPad (768 to 1180 px) must work.
- Every visible text in German and English (`src/i18n.ts`; a missing key is a type error).
- Comment non-obvious code; explain the "why", not the "what".
- Nick builds on Windows: never add two files whose names differ only in case.

## Licence, content and public identity

- GPL-3.0-or-later, like upstream. Keep upstream copyright notices. Every version that goes online must
  have its source here.
- Bundle only SRD 5.2.1 content (CC-BY-4.0, keep the attribution). Never add non-SRD Wizards of the
  Coast content (most PHB 2024 subclasses, species, feats, spells); players import their own add-on
  scripts into their browser.
- Credit MPMB clearly without suggesting MPMB made or endorses this. Don't copy the PDF's artwork or
  layout (designed by Javier Aumente); build our own look.
- "Dungeons & Dragons" is a trademark: say "for D&D 5.5e (2024)", don't brand with it.
- Sign as "Remph". Never put the group's characters, their custom scripts, player names or other private
  details in this repo, an issue or a PR; they stay in `mpmb-web-dev`.

## Dependencies and services

- Commonly used, well-maintained libraries may be added without asking when they make the code simpler or
  safer; check the project is alive and name the new dependency in the PR. Licences must be compatible
  with GPL-3.0.
- Never anything from Palantir, or software tied in a major positive way to Peter Thiel. If unsure who is
  behind a tool or service, ask.
- No paid services.
