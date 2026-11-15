// Players' codes and devices' tokens (M15, design A: one code per player, decisions.md 2026-11-15).
//
// A code is four words from the BIP39 English list ("orbit-hazard-melt-ripple"): 2048^4, about 44 bits, which is
// plenty against guessing online (the service locks an address out after a few wrong tries) and easy to type on a
// phone. The server keeps only a slow scrypt hash of it, so a leaked database doesn't hand out the codes.
//
// A device types the code once and gets a token back; every later request carries the token, not the code. Tokens
// are 32 random bytes, so a fast SHA-256 is enough to store them, and a device is forgotten by deleting its row.
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export const CODE_WORDS = 4;
/** What separates the words in a code as the service hands it out. */
const SEPARATOR = '-';
/** scrypt's cost: about 50 ms per try on a webspace, and the 16 MiB it needs stays far below Node's limits. */
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLEL = 1;
/** scrypt needs 128 * N * r bytes; twice that leaves room. */
const SCRYPT_BYTES_PER_UNIT = 128;
const MEMORY_ROOM = 2;
const memoryFor = (cost: number, blockSize: number) => MEMORY_ROOM * SCRYPT_BYTES_PER_UNIT * cost * blockSize;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const TOKEN_BYTES = 32;
const SCHEME = 'scrypt';
/** scheme, N, r, p, salt, hash. */
const HASH_PARTS = 6;

const WORDS = new Set(wordlist);

/** A new code, four random words joined by dashes. `pick` is for tests; it must return 0 <= n < its argument. */
export function newCode(pick: (max: number) => number = randomInt): string {
  return Array.from({ length: CODE_WORDS }, () => wordlist[pick(wordlist.length)]).join(SEPARATOR);
}

/** A letter a to z: the only thing BIP39's English words are made of. */
const isLetter = (char: string) => char >= 'a' && char <= 'z';

/**
 * The code as the player typed it, in the form it was handed out: lower case, words joined by dashes. Spaces,
 * dashes, dots, commas or line breaks between the words all count as gaps ("Orbit Hazard  melt.ripple" and
 * "orbit-hazard-melt-ripple" are the same code). Null when it isn't four known words.
 */
export function normalCode(typed: string): string | null {
  const words = [...typed.toLowerCase()]
    .map((char) => (isLetter(char) ? char : ' '))
    .join('')
    .split(' ')
    .filter(Boolean);
  if (words.length !== CODE_WORDS || !words.every((word) => WORDS.has(word))) return null;
  return words.join(SEPARATOR);
}

/** What the database keeps for a code: "scrypt$N$r$p$salt$hash", salt and hash in base64. */
export async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(code, salt, HASH_BYTES, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLEL,
    maxmem: memoryFor(COST, BLOCK_SIZE),
  });
  return [SCHEME, COST, BLOCK_SIZE, PARALLEL, salt.toString('base64'), hash.toString('base64')].join('$');
}

/** Whether `code` (already normal) is the one behind `stored`. False for a stored value it can't read. */
export async function codeMatches(code: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== HASH_PARTS || parts[0] !== SCHEME) return false;
  const [, cost = '', blockSize = '', parallel = '', salt = '', hash = ''] = parts;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(code, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallel),
    maxmem: memoryFor(Number(cost), Number(blockSize)),
  });
  return timingSafeEqual(actual, expected);
}

/** A new device token (URL-safe base64, 43 characters). */
export const newToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

/** What the database keeps for a token: its SHA-256 in hex. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
