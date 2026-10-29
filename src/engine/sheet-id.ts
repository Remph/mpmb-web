// The sheet the app ships, by the document info MPMB writes into it. Kept apart from the sheet data
// (1.2 MB, only the worker loads it), so the page can check backups and show the version.
// sheet-data.test.ts checks that it matches the shipped data.
export const SHEET_ID = { type: 'Colorful - A4', version: '24.2.0' } as const;

export interface SheetId {
  type: string;
  version: string;
}
