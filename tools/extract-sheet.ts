// Makes the blank-sheet data that ships with the app from MPMB's blank PDF (Colorful A4).
// Usage: node tools/extract-sheet.ts <blank sheet.pdf> [out.json]
// The PDF itself is not in the repository; the output is, so the app and the tests need no PDF.
import fs from 'node:fs';
import { packSheet } from '../src/engine/sheet-data.ts';
import { readSheetPdf } from '../src/pdf/read-sheet.ts';

/** process.argv starts with node and the script path. */
const ARGS_START = 2;
const KB = 1024;

const [pdfPath, outPath = 'src/engine/data/colorful-a4.json'] = process.argv.slice(ARGS_START);
if (!pdfPath) {
  console.error('Usage: node tools/extract-sheet.ts <blank sheet.pdf> [out.json]');
  process.exit(1);
}
const sheet = await readSheetPdf(fs.readFileSync(pdfPath));
if (sheet.info.SheetType !== 'Colorful - A4')
  console.warn(`Expected the Colorful A4 sheet, got "${sheet.info.SheetType}"`);
fs.writeFileSync(outPath, JSON.stringify(packSheet(sheet)) + '\n');
console.log(
  `${pdfPath}: ${sheet.info.SheetType} v${sheet.info.SheetVersion}, ${Object.keys(sheet.fields).length} fields,`,
  `${sheet.calcOrder.length} calculated -> ${outPath} (${Math.round(fs.statSync(outPath).size / KB)} KB)`,
);
