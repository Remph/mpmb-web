// The way back from the page to a waiting worker. MPMB's scripts call app.alert and app.execDialog
// and expect the answer as the return value, so the worker has to stop until the user answers. A
// worker can do that with Atomics.wait on shared memory, while the page stays responsive; the page
// writes the answer into the shared buffer and wakes the worker up.
//
// Shared memory needs a cross-origin isolated page (COOP and COEP headers). Without it, `canWait` is
// false and the worker answers pop-ups itself (see engine.worker.ts).
//
// Buffer layout: Int32 [0] state (0 empty, 1 answer ready), Int32 [1] answer length in bytes, then the
// answer as UTF-8 JSON.

const STATE = 0;
const LENGTH = 1;
const HEADER_INTS = 2;
const HEADER_BYTES = HEADER_INTS * Int32Array.BYTES_PER_ELEMENT;
const EMPTY = 0;
const READY = 1;
/** Room for the largest answer, 4 MiB: a dialog's whole state (MPMB's biggest lists are a few hundred KB). */
export const CHANNEL_BYTES = 4_194_304;

export interface Channel {
  buffer: SharedArrayBuffer;
}

export const canWait = (): boolean =>
  typeof SharedArrayBuffer === 'function' && globalThis.crossOriginIsolated === true;

export function createChannel(bytes = CHANNEL_BYTES): Channel {
  return { buffer: new SharedArrayBuffer(HEADER_BYTES + bytes) };
}

/** Page side: put the answer in and wake the worker. */
export function sendAnswer(channel: Channel, answer: unknown): void {
  const header = new Int32Array(channel.buffer, 0, HEADER_INTS);
  const body = new Uint8Array(channel.buffer, HEADER_BYTES);
  const encoded = new TextEncoder().encode(JSON.stringify(answer ?? null));
  if (encoded.length > body.length) throw new Error(`Answer too large for the channel (${encoded.length} bytes)`);
  body.set(encoded);
  Atomics.store(header, LENGTH, encoded.length);
  Atomics.store(header, STATE, READY);
  Atomics.notify(header, STATE);
}

/** Worker side: sleep until the page answered, then take the answer out. */
export function waitForAnswer<T>(channel: Channel): T {
  const header = new Int32Array(channel.buffer, 0, HEADER_INTS);
  Atomics.wait(header, STATE, EMPTY);
  const length = Atomics.load(header, LENGTH);
  // TextDecoder can't read shared memory directly, so the bytes are copied out first.
  const bytes = new Uint8Array(channel.buffer, HEADER_BYTES, length).slice();
  Atomics.store(header, STATE, EMPTY);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
