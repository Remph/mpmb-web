// The deploy's check of the live headers (tools/live-headers.ts) and the policy it checks for (public/.htaccess).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { assetOf, expectedHeaders, problems } from '../tools/live-headers.ts';

const htaccess = readFileSync(new URL('../public/.htaccess', import.meta.url), 'utf8');
const expected = expectedHeaders(htaccess);
const PAGE = 'https://remph.de/mpmb/';

describe('the live header check', () => {
  test('passes an answer with exactly the headers .htaccess sets', () => {
    expect(problems(PAGE, new Headers(Object.fromEntries(expected)), expected)).toEqual([]);
  });

  test('names a missing header and one that differs', () => {
    const headers = new Headers(Object.fromEntries(expected));
    headers.delete('Cross-Origin-Embedder-Policy');
    headers.append('Content-Security-Policy', "default-src 'self'");
    const found = problems(PAGE, headers, expected);
    expect(found).toHaveLength(2);
    expect(found[0]).toContain('Content-Security-Policy differs');
    expect(found[1]).toBe(`${PAGE}: no Cross-Origin-Embedder-Policy`);
  });

  test('picks one of the build’s scripts', () => {
    const dist = mkdtempSync(join(tmpdir(), 'live-headers-'));
    mkdirSync(join(dist, 'assets'));
    ['index-B2.js', 'index-A1.css', 'engine-C3.js'].forEach((name) => writeFileSync(join(dist, 'assets', name), ''));
    expect(assetOf(dist)).toBe('assets/engine-C3.js');
  });
});

describe('the policy in public/.htaccess (security audit 2026-11-20, finding 11)', () => {
  const policy = expected.get('Content-Security-Policy') ?? '';
  const directive = (name: string) =>
    policy
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `));

  test('loads scripts only from the app’s own folder, and allows no form posts', () => {
    expect(directive('script-src')).toBe(
      "script-src https://remph.de/mpmb/ https://www.remph.de/mpmb/ 'unsafe-eval' blob:",
    );
    expect(directive('form-action')).toBe("form-action 'none'");
  });

  test('leaves HSTS and nosniff to remph.de’s root .htaccess (one source for the domain)', () => {
    expect(htaccess).not.toMatch(/^\s*Header .*Strict-Transport-Security/m);
    expect(htaccess).not.toMatch(/^\s*Header .*X-Content-Type-Options/m);
  });
});
