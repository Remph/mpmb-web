// M1 spike test worker: blocks with Atomics.wait until the page answers, like MPMB Web's pop-ups will.
self.onmessage = (e) => {
  const { sab, rounds } = e.data;
  const flag = new Int32Array(sab);
  const t0 = performance.now();
  for (let i = 0; i < rounds; i++) {
    Atomics.store(flag, 0, 0);
    postMessage({ type: 'ask', i });
    const r = Atomics.wait(flag, 0, 0, 5000); // blocks this worker until the page notifies
    if (r === 'timed-out') {
      postMessage({ type: 'result', ok: false, why: 'the page never answered (timed out after 5 s)' });
      return;
    }
  }
  postMessage({ type: 'result', ok: true, perRoundTripMs: (performance.now() - t0) / rounds });
};
