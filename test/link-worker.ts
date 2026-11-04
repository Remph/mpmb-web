// A Node worker thread for test/link.test.ts: sends one answer through the link, as the engine worker
// that holds the old sheet does in the browser.
import { workerData } from 'node:worker_threads';
import { sendReply } from '../src/worker/link.ts';

const { buffer, text } = workerData as { buffer: SharedArrayBuffer; text: string };
sendReply({ buffer }, text);
