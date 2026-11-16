// Which Lager groups this device folds (folded.ts): kept per device, and never in the way when storage fails.
import { describe, expect, test } from 'vitest';
import { FOLDED_KEY, loadFolded, toggleFolded } from './folded.ts';

/** localStorage's two calls on a map. */
function memory(start: Record<string, string> = {}) {
  const values = new Map(Object.entries(start));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('folded groups', () => {
  test('a fold is kept and read back; a second tap opens it again', () => {
    const storage = memory();
    const once = toggleFolded(new Set(), 'g1', storage);
    expect([...once]).toEqual(['g1']);
    expect([...loadFolded(storage)]).toEqual(['g1']);
    const twice = toggleFolded(once, 'g1', storage);
    expect([...twice]).toEqual([]);
    expect(storage.values.get(FOLDED_KEY)).toBe('[]');
  });

  test('nothing stored, a broken value, or no storage at all: nothing folded', () => {
    expect(loadFolded(memory()).size).toBe(0);
    expect(loadFolded(memory({ [FOLDED_KEY]: '{not json' })).size).toBe(0);
    expect([...loadFolded(memory({ [FOLDED_KEY]: '["g1", 2, null]' }))]).toEqual(['g1']);
    expect(loadFolded(undefined).size).toBe(0);
  });

  test('a storage that refuses still folds for this visit', () => {
    const refusing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadFolded(refusing).size).toBe(0);
    expect([...toggleFolded(new Set(), 'g1', refusing)]).toEqual(['g1']);
  });
});
