import { describe, expect, it } from 'vitest';
import { BUILD, SOURCE_URL, sourceUrl } from './version.ts';

describe('version', () => {
  it('links a known commit to its source tree', () => {
    expect(sourceUrl('eb9ca3b00a3b')).toBe('https://github.com/Remph/mpmb-web/tree/eb9ca3b00a3b');
  });

  it('falls back to the repo when the commit is unknown', () => {
    expect(sourceUrl('')).toBe(SOURCE_URL);
  });

  it('gets the commit from git at build time', () => {
    // The tests run in a git checkout, so vite.config.ts found one.
    expect(BUILD.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(BUILD.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
