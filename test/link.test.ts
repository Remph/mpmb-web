/* eslint-disable ts-patterns/no-magic-numbers -- sizes are the test data */
// The link between two engine workers during a sheet update (src/worker/link.ts). The answering side
// runs in a Node worker thread, because an answer of several pieces needs both sides at once.
import { Worker } from 'node:worker_threads';
import { describe, expect, test } from 'vitest';
import { createLink, sendReply, waitForReply } from '../src/worker/link.ts';

/** Sends the text from a worker thread and waits for it here, as the importing worker does. */
async function throughLink(text: string, bytes: number): Promise<string> {
  const link = createLink(bytes);
  const worker = new Worker(new URL('link-worker.ts', import.meta.url), {
    workerData: { buffer: link.buffer, text },
  });
  try {
    return waitForReply(link);
  } finally {
    await worker.terminate();
  }
}

describe('the link between two workers', () => {
  test('carries a short answer in one piece, and is empty again afterwards', () => {
    const link = createLink(1024);
    sendReply(link, '{"value":{"data":"Ada"}}');
    expect(waitForReply(link)).toBe('{"value":{"data":"Ada"}}');
    sendReply(link, '');
    expect(waitForReply(link)).toBe('');
  });

  test('carries an answer larger than its buffer in pieces, also when a piece ends inside a character', async () => {
    // "ë" and "•" take two and three bytes: with 7-byte pieces some are cut in the middle.
    const text = 'Zoë • '.repeat(200);
    expect(await throughLink(text, 7)).toBe(text);
  });

  test('carries a few MB, as a large add-on file', async () => {
    const text = 'x'.repeat(3_000_000);
    expect(await throughLink(text, 1_048_576)).toBe(text);
  });
});
