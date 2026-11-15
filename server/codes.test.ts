import { describe, expect, it } from 'vitest';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { CODE_WORDS, codeMatches, hashCode, hashToken, newCode, newToken, normalCode } from './codes.ts';

const CODE = 'orbit-hazard-melt-ripple';
const SHA256_HEX = 64;
const TOKEN_LENGTH = 43;

describe('codes', () => {
  it('are four words of the list, joined by dashes', () => {
    // abandon, ability, able … zoo: the list's first three words and its last.
    const picks = [...wordlist.keys()].slice(0, CODE_WORDS - 1).concat(wordlist.length - 1);
    let next = 0;
    expect(newCode(() => picks[next++] ?? 0)).toBe('abandon-ability-able-zoo');
    expect(newCode().split('-')).toHaveLength(CODE_WORDS);
  });

  it.each([
    ['Orbit Hazard  melt.ripple', CODE],
    [' orbit-hazard-melt-ripple\n', CODE],
    ['ORBIT,HAZARD,MELT,RIPPLE', CODE],
    ['orbit hazard melt', null],
    ['orbit hazard melt ripple zoo', null],
    ['orbit hazard melt rippel', null],
    ['', null],
  ])('reads %j as %j', (typed, normal) => {
    expect(normalCode(typed)).toBe(normal);
  });

  it('keep only a salted hash that the right code matches', async () => {
    const stored = await hashCode(CODE);
    expect(stored).not.toContain('orbit');
    expect(stored).not.toBe(await hashCode(CODE));
    expect(await codeMatches(CODE, stored)).toBe(true);
    expect(await codeMatches('orbit-hazard-melt-zoo', stored)).toBe(false);
    expect(await codeMatches(CODE, 'something else')).toBe(false);
  });
});

describe('device tokens', () => {
  it('are long, random and kept as a SHA-256', () => {
    const token = newToken();
    expect(token).toHaveLength(TOKEN_LENGTH);
    expect(newToken()).not.toBe(token);
    expect(hashToken(token)).toHaveLength(SHA256_HEX);
    expect(hashToken(token)).toBe(hashToken(token));
  });
});
