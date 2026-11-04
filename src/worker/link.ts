// The link between two engine workers while one updates a character to a new sheet version: the
// importing worker asks the worker that holds the old sheet (source-doc.ts) and must have the answer
// at once, because MPMB's import reads the old sheet in the middle of its scripts. The question goes
// over a MessagePort; the answer comes back through shared memory, while the importing worker sleeps
// in Atomics.wait as it does for the player's answers (channel.ts).
//
// An answer can be larger than the buffer (an add-on file of several MB, read as one string): it comes
// in pieces, the answering worker waiting until each piece is taken.
//
// Buffer layout: Int32 [0] state (0 empty, 1 piece ready), [1] piece length in bytes, [2] 1 when more
// pieces follow; then the piece, UTF-8 JSON.

const STATE = 0;
const LENGTH = 1;
const MORE = 2;
const HEADER_INTS = 3;
const HEADER_BYTES = HEADER_INTS * Int32Array.BYTES_PER_ELEMENT;
const EMPTY = 0;
const READY = 1;
/** 1 MiB per piece: most answers are a few bytes; the large ones are rare and may take a few pieces. */
export const LINK_BYTES = 1_048_576;

export interface Link {
  buffer: SharedArrayBuffer;
}

export function createLink(bytes = LINK_BYTES): Link {
  return { buffer: new SharedArrayBuffer(HEADER_BYTES + bytes) };
}

/** Answering side: puts the answer in, piece by piece, each once the asking side took the one before. */
export function sendReply(link: Link, text: string): void {
  const header = new Int32Array(link.buffer, 0, HEADER_INTS);
  const body = new Uint8Array(link.buffer, HEADER_BYTES);
  const encoded = new TextEncoder().encode(text);
  // At least one piece, also for an empty answer.
  const pieces = Math.max(1, Math.ceil(encoded.length / body.length));
  Array.from({ length: pieces }, (_, i) => i).forEach((i) => {
    Atomics.wait(header, STATE, READY);
    const piece = encoded.subarray(i * body.length, (i + 1) * body.length);
    body.set(piece);
    Atomics.store(header, LENGTH, piece.length);
    Atomics.store(header, MORE, Number(i < pieces - 1));
    Atomics.store(header, STATE, READY);
    Atomics.notify(header, STATE);
  });
}

/** Asking side: sleeps until every piece of the answer came, and returns it. */
export function waitForReply(link: Link): string {
  const header = new Int32Array(link.buffer, 0, HEADER_INTS);
  const pieces: Uint8Array[] = [];
  const takePiece = (): boolean => {
    Atomics.wait(header, STATE, EMPTY);
    const length = Atomics.load(header, LENGTH);
    const more = Atomics.load(header, MORE) === 1;
    // TextDecoder can't read shared memory, and a later piece overwrites this one: copied out.
    pieces.push(new Uint8Array(link.buffer, HEADER_BYTES, length).slice());
    Atomics.store(header, STATE, EMPTY);
    Atomics.notify(header, STATE);
    return more;
  };
  // A handful of pieces at most, so the recursion stays shallow.
  const takeAll = (): void => {
    if (takePiece()) takeAll();
  };
  takeAll();
  const all = new Uint8Array(pieces.reduce((sum, p) => sum + p.length, 0));
  pieces.reduce((offset, p) => {
    all.set(p, offset);
    return offset + p.length;
  }, 0);
  // Decoded once at the end: a piece may end in the middle of a character.
  return new TextDecoder().decode(all);
}
