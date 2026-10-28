# MPMB Web

A web version of [MorePurpleMoreBetter's D&D 5.5e (2024) Character Record Sheet](https://github.com/morepurplemorebetter/2024_MPMBs-Character-Record-Sheet),
for playing and building characters in the browser on laptops and tablets. It runs MPMB's own sheet
logic in the browser, so it behaves like the PDF without needing Adobe Acrobat.

**Status:** in development, nothing to use yet. Built for a single play group first.

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
