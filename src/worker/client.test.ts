/* eslint-disable ts-patterns/no-magic-numbers -- buffer offsets and counts are the test data */
// The page's side of the worker, with a stand-in worker: which worker gets which answer, and what
// happens to commands when a worker dies.
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AlertReply } from '../engine/host.ts';
import { EngineClient } from './client.ts';
import type { PopUps, WorkerLike } from './client.ts';
import type { FromWorker, ToWorker } from './protocol.ts';

class FakeWorker implements WorkerLike {
  readonly received: ToWorker[] = [];
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  postMessage(message: ToWorker): void {
    this.received.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** What the worker would post to the page. */
  emit(message: FromWorker): void {
    this.onmessage?.({ data: message } as MessageEvent<FromWorker>);
  }
  get buffer(): SharedArrayBuffer | null {
    const setup = this.received[0];
    return setup?.type === 'setup' ? setup.buffer : null;
  }
}

const popUps = (alert: PopUps['alert']): PopUps => ({
  alert,
  dialog: () => Promise.reject(new Error('no dialogs here')),
  menu: () => Promise.resolve(null),
});

const workers = (): { all: FakeWorker[]; make: () => FakeWorker } => {
  const all: FakeWorker[] = [];
  return {
    all,
    make: () => {
      const worker = new FakeWorker();
      all.push(worker);
      return worker;
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('engine client', () => {
  test('an answer to a closed sheet’s pop-up does not reach the next sheet’s worker', async () => {
    // Shared memory needs a cross-origin isolated page; Node has SharedArrayBuffer, so pretend.
    vi.stubGlobal('crossOriginIsolated', true);
    let answer: (reply: AlertReply) => void = () => undefined;
    const pending = new Promise<AlertReply>((resolve) => (answer = resolve));
    const { all, make } = workers();
    const client = new EngineClient(
      popUps(() => pending),
      make,
    );
    const first = client.open().catch(() => 'closed');
    all[0]?.emit({ type: 'ask', ask: { kind: 'alert', request: { message: '?', title: '', icon: 0, buttons: 0 } } });
    void client.open();
    answer({ answer: 1 });
    await pending;
    await Promise.resolve();
    expect(await first).toBe('closed');
    const [old, next] = all;
    expect(old?.buffer).not.toBe(next?.buffer);
    // State 1 means "answer ready" (channel.ts); the new worker's channel must still be empty.
    expect(new Int32Array(next?.buffer ?? new SharedArrayBuffer(8))[0]).toBe(0);
    expect(new Int32Array(old?.buffer ?? new SharedArrayBuffer(8))[0]).toBe(1);
  });

  test('a closed worker’s last messages are dropped', async () => {
    const { all, make } = workers();
    const client = new EngineClient(
      popUps(() => Promise.resolve({ answer: 1 })),
      make,
    );
    void client.open().catch(() => undefined);
    void client.open();
    all[0]?.emit({ type: 'fields', changed: { Old: {} as never }, removed: [] });
    all[1]?.emit({ type: 'fields', changed: { New: {} as never }, removed: [] });
    expect(Object.keys(client.fields)).toEqual(['New']);
    expect(all[0]?.terminated).toBe(true);
  });

  test('something the app does not have yet reaches the page, which explains it', () => {
    const { all, make } = workers();
    const client = new EngineClient(
      popUps(() => Promise.resolve({ answer: 1 })),
      make,
    );
    const used: string[] = [];
    client.onUnavailable = (feature) => used.push(feature);
    void client.open().catch(() => undefined);
    all[0]?.emit({ type: 'unavailable', feature: 'openFile' });
    expect(used).toEqual(['openFile']);
  });

  test('a worker that fails rejects the commands waiting for it', async () => {
    const { all, make } = workers();
    const client = new EngineClient(
      popUps(() => Promise.resolve({ answer: 1 })),
      make,
    );
    const opening = client.open();
    all[0]?.onerror?.({ message: 'SyntaxError in the worker' } as ErrorEvent);
    await expect(opening).rejects.toThrow('The engine stopped: SyntaxError in the worker');
    await expect(client.edit('A', '1')).rejects.toThrow('No sheet open');
  });
});
