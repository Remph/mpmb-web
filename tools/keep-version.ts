// Keeps the current version of MPMB's sheet in vendor/versions/<version>/ before the app moves to a new
// release, so that characters saved on it still open and can be updated (src/sheet-versions.ts).
// Usage: node tools/keep-version.ts
// Copies vendor/mpmb/_functions, vendor/mpmb/_variables and the blank-sheet data; refuses to overwrite a
// version that is already kept (a kept version must stay what the characters were saved on).
import fs from 'node:fs';
import path from 'node:path';
import { SHEET_ID } from '../src/engine/sheet-id.ts';

const SCRIPT_FOLDERS = ['_functions', '_variables'];
const SHEET_DATA = 'src/engine/data/colorful-a4.json';
const KB = 1024;

const target = path.join('vendor', 'versions', SHEET_ID.version);
if (fs.existsSync(target)) {
  console.error(`${target} exists already: version ${SHEET_ID.version} is kept.`);
  process.exit(1);
}

SCRIPT_FOLDERS.forEach((folder) =>
  fs.cpSync(path.join('vendor', 'mpmb', folder), path.join(target, folder), { recursive: true }),
);
fs.copyFileSync(SHEET_DATA, path.join(target, 'colorful-a4.json'));

const files = fs.readdirSync(target, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
const bytes = files.reduce((sum, entry) => sum + fs.statSync(path.join(entry.parentPath, entry.name)).size, 0);
console.log(
  `Kept ${SHEET_ID.type} v${SHEET_ID.version} in ${target}: ${files.length} files, ${Math.round(bytes / KB)} KB.`,
);
