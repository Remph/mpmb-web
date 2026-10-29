// Turns a filled MPMB sheet (Colorful A4) into character data: the differences from the blank sheet.
// Usage: node tools/extract-character.ts <character.pdf> <out.json> [blank sheet data]
// Used for the reference characters in test/characters/; the app imports PDFs the same way (M3).
import fs from 'node:fs';
import { diffCharacter, unpackSheet } from '../src/engine/sheet-data.ts';
import { readSheetPdf } from '../src/pdf/read-sheet.ts';

/** process.argv starts with node and the script path. */
const ARGS_START = 2;
const KB = 1024;
/** One space per level: readable diffs of the test characters without doubling their size. */
const INDENT = 1;

const [pdfPath, outPath, blankPath = 'src/engine/data/colorful-a4.json'] = process.argv.slice(ARGS_START);
if (!pdfPath || !outPath) {
  console.error('Usage: node tools/extract-character.ts <character.pdf> <out.json> [blank sheet data]');
  process.exit(1);
}
const blank = unpackSheet(JSON.parse(fs.readFileSync(blankPath, 'utf8')));
const sheet = await readSheetPdf(fs.readFileSync(pdfPath));
// Imported add-on scripts travel in this field; the public test characters must not carry any.
const userScript = sheet.fields['User Script']?.value;
if (userScript) console.warn('This sheet carries imported scripts (User Script is not empty).');
const data = diffCharacter(blank, sheet);
fs.writeFileSync(outPath, JSON.stringify(data, null, INDENT) + '\n');
console.log(
  `${pdfPath}: ${Object.keys(data.fields).length} of ${Object.keys(sheet.fields).length} fields differ from the blank sheet`,
  `-> ${outPath} (${Math.round(fs.statSync(outPath).size / KB)} KB)`,
);
