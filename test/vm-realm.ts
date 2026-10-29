// A Node vm context as the realm for MPMB's scripts: it stands in for the worker's global scope, and
// every test gets a fresh one.
import vm from 'node:vm';
import type { Realm } from '../src/engine/realm.ts';

export function vmRealm(): Realm {
  const context = vm.createContext({});
  const global = vm.runInContext('this', context) as Record<string, unknown>;
  return {
    global,
    evaluate: (code, filename = 'eval') => vm.runInContext(code, context, { filename }),
  };
}
