import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REDRAW_SCRIPT_PATH } from './redraw-script.ts';

describe('redraw script source link', () => {
  it('names the file that holds the script', () => {
    // The Fill MPMB PDF window links to this path on GitHub: a renamed or moved file would break the link.
    expect(readFileSync(REDRAW_SCRIPT_PATH, 'utf8')).toContain('export function redrawScript(');
  });
});
