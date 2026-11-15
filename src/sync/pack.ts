// How a character travels to the sync service (M15). The service never reads `data` (the sheet, half a megabyte
// or more as JSON), so the app sends it gzipped: about a tenth of the size, which matters on a phone's data plan
// and keeps far below the service's 12 MB limit. Text, because the service stores and returns a string: "gz:"
// and the bytes in base64. A copy without the prefix is plain JSON (a browser without CompressionStream).
import type { CharacterData } from '../engine/sheet-data.ts';
import type { CharacterMeta } from '../store/characters.ts';

const GZIP = 'gz:';

/** Bytes as base64, in slices: String.fromCharCode with half a million arguments overflows the stack. */
function toBase64(bytes: Uint8Array): string {
  let text = '';
  const SLICE = 0x8000;
  for (let at = 0; at < bytes.length; at += SLICE) {
    text += String.fromCharCode(...bytes.subarray(at, at + SLICE));
  }
  return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function through(bytes: Uint8Array<ArrayBuffer>, stream: Coder): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

type Coder = CompressionStream | DecompressionStream;

/** The sheet as the service keeps it. */
export async function packData(data: CharacterData): Promise<string> {
  const json = JSON.stringify(data);
  if (typeof CompressionStream !== 'function') return json;
  return GZIP + toBase64(await through(new TextEncoder().encode(json), new CompressionStream('gzip')));
}

/** The sheet back from the service's text; throws on text that isn't a sheet. */
export async function unpackData(text: string): Promise<CharacterData> {
  const json = text.startsWith(GZIP)
    ? new TextDecoder().decode(await through(fromBase64(text.slice(GZIP.length)), new DecompressionStream('gzip')))
    : text;
  const data = JSON.parse(json) as CharacterData;
  if (!data || typeof data !== 'object' || typeof data.fields !== 'object') throw new Error('not a sheet');
  return data;
}

/**
 * The list entry as the service keeps it: all of it but `lastBackup`, which says when a backup was made in THIS
 * browser (the start page's reminder), not on the player's other devices.
 */
export function serverMeta(meta: CharacterMeta): Omit<CharacterMeta, 'lastBackup'> {
  const { lastBackup: _here, ...rest } = meta;
  return rest;
}

/**
 * A list entry from the service, with this browser's `lastBackup` kept; null when it doesn't look like one (the
 * service takes any object, so a broken save from an older app mustn't break the list).
 */
export function localMeta(value: unknown, id: string, here: CharacterMeta | undefined): CharacterMeta | null {
  if (!value || typeof value !== 'object') return null;
  const meta = value as Partial<CharacterMeta>;
  if (typeof meta.updated !== 'string' || typeof meta.created !== 'string') return null;
  if (!meta.addOns || !Array.isArray(meta.addOns.files)) return null;
  const clean: CharacterMeta = {
    ...(meta as CharacterMeta),
    id,
    name: String(meta.name ?? ''),
    classes: String(meta.classes ?? ''),
    species: String(meta.species ?? ''),
  };
  delete clean.lastBackup;
  return here?.lastBackup ? { ...clean, lastBackup: here.lastBackup } : clean;
}
