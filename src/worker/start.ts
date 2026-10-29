// Starting the engine worker in the browser.
//
// In the built app each sheet gets a worker made from one Blob of the worker script, fetched once.
// Safari (WebKit) refuses to start a worker again from its cache when the server's 304 answer lacks
// the Cross-Origin-Embedder-Policy header, which servers often send on full answers only (vite
// preview does; Apache's handling of 304s varies). Opening a second sheet then failed. A blob: worker
// takes the page's isolation and never asks the server again. In development the worker is an ES
// module that imports other files by path, which a blob can't, so it loads from its URL there.
import type { WorkerLike } from './client.ts';
import type { ToWorker } from './protocol.ts';
import scriptUrl from './engine.worker.ts?worker&url';

const OPTIONS: WorkerOptions = { type: 'module', name: 'mpmb-engine' };

let blobUrl: Promise<string> | null = null;

/** The worker script as a blob: URL, fetched on first use. */
function workerBlob(): Promise<string> {
  blobUrl ??= fetch(scriptUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.blob();
    })
    .then((blob) => URL.createObjectURL(new Blob([blob], { type: 'text/javascript' })));
  // A failed fetch (offline for a moment) is tried again next time.
  blobUrl.catch(() => (blobUrl = null));
  return blobUrl;
}

/**
 * A worker that exists at once for the client but starts when its script is ready; messages wait
 * until then.
 */
class BlobWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  private worker: Worker | null = null;
  private waiting: [ToWorker, Transferable[]][] = [];
  private ended = false;

  constructor(url: Promise<string>) {
    url.then(
      (u) => this.start(u),
      (err: unknown) =>
        this.onerror?.(new ErrorEvent('error', { message: `The engine could not load: ${String(err)}` })),
    );
  }

  private start(url: string): void {
    if (this.ended) return;
    const worker = new Worker(url, OPTIONS);
    worker.onmessage = (event) => this.onmessage?.(event);
    worker.onerror = (event) => this.onerror?.(event);
    this.waiting.forEach(([message, transfer]) => worker.postMessage(message, transfer));
    this.waiting = [];
    this.worker = worker;
  }

  postMessage(message: ToWorker, transfer: Transferable[] = []): void {
    if (this.worker) this.worker.postMessage(message, transfer);
    else this.waiting.push([message, transfer]);
  }

  terminate(): void {
    this.ended = true;
    this.worker?.terminate();
    this.waiting = [];
  }
}

export const newEngineWorker = (): WorkerLike =>
  import.meta.env.DEV ? (new Worker(scriptUrl, OPTIONS) as unknown as WorkerLike) : new BlobWorker(workerBlob());
