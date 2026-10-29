// M1 spike test page logic, shared by both variants. Prints PASS or FAIL and the numbers to send back.
const out = document.getElementById('out');
const lines = [];
const say = (s) => {
  lines.push(s);
  out.textContent = lines.join('\n');
};
const verdict = document.getElementById('verdict');

async function main() {
  say('variant: ' + document.body.dataset.variant);
  say('browser: ' + navigator.userAgent);
  say('crossOriginIsolated: ' + self.crossOriginIsolated);
  say('SharedArrayBuffer available: ' + (typeof SharedArrayBuffer !== 'undefined'));
  try {
    const r = await fetch(location.href, { cache: 'no-store' });
    say('header Cross-Origin-Opener-Policy: ' + r.headers.get('cross-origin-opener-policy'));
    say('header Cross-Origin-Embedder-Policy: ' + r.headers.get('cross-origin-embedder-policy'));
  } catch (e) {
    say('could not read headers: ' + e.message);
  }
  if (typeof SharedArrayBuffer === 'undefined') {
    return fail('SharedArrayBuffer is not available: the headers do not reach the page.');
  }
  const sab = new SharedArrayBuffer(8);
  const flag = new Int32Array(sab);
  let worker;
  try {
    worker = new Worker('probe-worker.js');
  } catch (e) {
    return fail('could not start the worker: ' + e.message);
  }
  worker.onerror = (e) => fail('worker error: ' + (e.message || 'it could not load (blocked by the headers?)'));
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ask') {
      setTimeout(() => {
        Atomics.store(flag, 0, 1);
        Atomics.notify(flag, 0);
      }, 5);
    } else if (m.ok) {
      say(
        'worker blocked and was woken 20 times: ' +
          m.perRoundTripMs.toFixed(1) +
          ' ms per round trip (5 ms of that is the page waiting on purpose)',
      );
      pass();
    } else {
      fail(m.why);
    }
  };
  worker.postMessage({ sab, rounds: 20 });
}

function pass() {
  verdict.textContent = 'PASS';
  verdict.className = 'pass';
  say('RESULT: PASS');
}
function fail(why) {
  verdict.textContent = 'FAIL';
  verdict.className = 'fail';
  say('RESULT: FAIL: ' + why);
}

export { main };
