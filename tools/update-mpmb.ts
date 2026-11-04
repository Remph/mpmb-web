// Copies MPMB's scripts from an upstream checkout into vendor/mpmb/ and says what changed.
// Usage: node tools/update-mpmb.ts <checkout of morepurplemorebetter/2024_MPMBs-Character-Record-Sheet>
// The whole procedure (new scripts, new sheet data, reference characters) is in vendor/README.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SHEET_ID } from '../src/engine/sheet-id.ts';
import { unpackSheet } from '../src/engine/sheet-data.ts';
import type { PackedSheet } from '../src/engine/sheet-data.ts';
import { unknownFields } from './script-fields.ts';
import type { NamedScript } from './script-fields.ts';

/** process.argv starts with node and the script path. */
const ARGS_START = 2;
const VENDOR = 'vendor/mpmb';
const SCRIPT_DIRS = ['_functions', '_variables'] as const;
const FILES = ['LICENSE', 'README.md'] as const;
const README = 'vendor/README.md';
const SHEET_DATA = 'src/engine/data/colorful-a4.json';
/** Git's short commit hash. */
const SHORT_HASH = 7;
/** Width of the change column ("removed") in the list of changed scripts. */
const STATE_WIDTH = 7;

const [upstream] = process.argv.slice(ARGS_START);
if (!upstream || !SCRIPT_DIRS.every((dir) => fs.existsSync(path.join(upstream, dir)))) {
  console.error('Usage: node tools/update-mpmb.ts <checkout of the upstream repository>');
  process.exit(1);
}

const git = (...args: string[]): string => execFileSync('git', ['-C', upstream, ...args], { encoding: 'utf8' }).trim();

/** The scripts in a folder like vendor/mpmb: "_functions/Startup.js" -> its text. */
function readScripts(root: string): Map<string, string> {
  return new Map(
    SCRIPT_DIRS.flatMap((dir) =>
      fs
        .readdirSync(path.join(root, dir))
        .filter((file) => file.endsWith('.js'))
        .map((file) => [`${dir}/${file}`, fs.readFileSync(path.join(root, dir, file), 'utf8')] as const),
    ),
  );
}

const lineCount = (text: string | undefined): number => (text === undefined ? 0 : text.split('\n').length);

// Ask for the release tag before anything is copied: a shallow clone (`git clone --depth 1`) has no tags,
// and `git describe` would fail only after the scripts had already been replaced.
let release: string;
try {
  // The last release tag before the commit: "v24.2.0" -> "24.2.0".
  release = git('describe', '--tags', '--abbrev=0').replace(/^v/, '');
} catch {
  console.error(`${upstream} has no release tags (a shallow clone?): run "git fetch --unshallow" there first.`);
  process.exit(1);
}

const before = readScripts(VENDOR);
const after = readScripts(upstream);
const commit = git('log', '-1', '--format=%H');
const date = git('log', '-1', '--format=%cs');
// "v24.2.0-3-g475f46b": three commits after the v24.2.0 release.
const described = git('describe', '--tags', '--always');

SCRIPT_DIRS.forEach((dir) => {
  fs.rmSync(path.join(VENDOR, dir), { recursive: true, force: true });
  fs.cpSync(path.join(upstream, dir), path.join(VENDOR, dir), { recursive: true });
});
FILES.forEach((file) => fs.copyFileSync(path.join(upstream, file), path.join(VENDOR, file)));

const readme = fs.readFileSync(README, 'utf8');
// The line "- Upstream commit: `<40 hex digits>` (<date>)." in vendor/README.md; group 1 is "- Upstream
// commit: ". Matches "- Upstream commit: `475f...e817` (2026-10-29)."; rejects "Upstream commit 475f".
// Try it: https://regex101.com/?regex=(-%20Upstream%20commit%3A%20)%60%5B0-9a-f%5D%7B40%7D%60%20%5C(%5B%5E)%5D*%5C)&testString=-%20Upstream%20commit%3A%20%60475f46bc344a2e00dbe3eb2dc234afcd5b16e817%60%20(2026-10-29).
const COMMIT_LINE = /(- Upstream commit: )`[0-9a-f]{40}` \([^)]*\)/;
if (!COMMIT_LINE.test(readme)) console.warn(`${README}: no "Upstream commit" line found; update it by hand.`);
fs.writeFileSync(README, readme.replace(COMMIT_LINE, `$1\`${commit}\` (${date}, ${described})`));

console.log(`Copied upstream ${described} (${commit.slice(0, SHORT_HASH)}, ${date}) into ${VENDOR}/.`);
const names = [...new Set([...before.keys(), ...after.keys()])].sort();
const changed = names.filter((name) => before.get(name) !== after.get(name));
console.log(changed.length ? 'Changed scripts:' : 'No script changed.');
changed.forEach((name) => {
  const state =
    [
      { when: !before.has(name), text: 'new' },
      { when: !after.has(name), text: 'removed' },
    ].find((s) => s.when)?.text ?? 'changed';
  console.log(
    `  ${state.padEnd(STATE_WIDTH)} ${name} (${lineCount(before.get(name))} -> ${lineCount(after.get(name))} lines)`,
  );
});

// Scripts written for a newer PDF name fields the shipped sheet data lacks.
const sheet = unpackSheet(JSON.parse(fs.readFileSync(SHEET_DATA, 'utf8')) as PackedSheet);
const scripts: NamedScript[] = [...after].map(([name, code]) => ({ name, code }));
const unknownBefore = unknownFields(
  [...before].map(([name, code]) => ({ name, code })),
  Object.keys(sheet.fields),
);
const newUnknown = [...unknownFields(scripts, Object.keys(sheet.fields))].filter(([f]) => !unknownBefore.has(f));
if (newUnknown.length) {
  console.log(`Fields the scripts now use that sheet v${SHEET_ID.version} doesn't have (a newer PDF needed?):`);
  newUnknown.forEach(([field, users]) => console.log(`  ${field} (${users.join(', ')})`));
}
// The upstream release against the sheet the app ships.
if (release !== SHEET_ID.version) {
  console.log(`Upstream release is v${release}, the sheet data is v${SHEET_ID.version}: new sheet data needed.`);
}
console.log('Next: pnpm test (the reference characters show what behaves differently), then vendor/README.md.');
