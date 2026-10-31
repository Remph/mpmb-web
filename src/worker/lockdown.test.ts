// The real worker scope is checked in a browser by test/browser/engine-check.html; here a stand-in
// built the way browsers build it (some globals on the object, some on its prototypes).
import { describe, expect, test } from 'vitest';
import { REMOVED_GLOBALS, lockDown } from './lockdown.ts';

function workerLikeScope(): Record<string, unknown> {
  const prototype = {
    importScripts: () => undefined,
    get indexedDB() {
      return {};
    },
    get fonts() {
      return {};
    },
  };
  const scope = Object.create(prototype) as Record<string, unknown>;
  Object.assign(scope, {
    fetch: () => undefined,
    XMLHttpRequest: class {},
    WebSocket: class {},
    FontFace: class {},
    caches: {},
    postMessage: () => undefined,
    setTimeout: () => 0,
  });
  return scope;
}

describe('lockDown', () => {
  test('removes network and storage, on the scope and on its prototypes', () => {
    const scope = workerLikeScope();
    expect(lockDown(scope)).toEqual([]);
    REMOVED_GLOBALS.forEach((name) => expect(scope[name]).toBeUndefined());
    expect('indexedDB' in scope).toBe(false);
    expect('fonts' in scope).toBe(false);
  });

  test('keeps what the engine needs', () => {
    const scope = workerLikeScope();
    lockDown(scope);
    expect(scope.postMessage).toBeTypeOf('function');
    expect(scope.setTimeout).toBeTypeOf('function');
  });

  test('a global that cannot be removed is reported', () => {
    const scope = workerLikeScope();
    Object.defineProperty(scope, 'EventSource', { value: class {}, configurable: false, writable: false });
    expect(lockDown(scope)).toEqual(['EventSource']);
  });
});
