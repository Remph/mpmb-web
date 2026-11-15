// What a device remembers of its sync code (account.ts), and the first guess at its name.
import { describe, expect, test } from 'vitest';
import { guessDeviceName, readAccount, writeAccount } from './account.ts';

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};

describe('the account', () => {
  test('is remembered and forgotten; never the code itself', () => {
    const storage = memory();
    expect(readAccount(storage)).toBeNull();
    const account = { token: 't', player: 'Anna', device: 3, name: 'iPad', auto: false, lastSync: 1_000 };
    writeAccount(account, storage);
    expect(readAccount(storage)).toEqual(account);
    writeAccount(null, storage);
    expect(readAccount(storage)).toBeNull();
  });

  test('one remembered before the auto sync switch syncs by itself', () => {
    const storage = memory();
    storage.setItem('mpmb-web.sync', JSON.stringify({ token: 't', player: 'Anna', device: 3, name: 'iPad' }));
    expect(readAccount(storage)).toMatchObject({ auto: true, lastSync: null });
  });

  test('a broken or blocked storage reads as no account', () => {
    const broken = { ...memory(), getItem: () => '{not json' };
    expect(readAccount(broken)).toBeNull();
    const blocked = {
      ...memory(),
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readAccount(blocked)).toBeNull();
    expect(readAccount(null)).toBeNull();
  });
});

describe('guessDeviceName', () => {
  const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
  const IPAD =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';

  test('names the browser and system, in the player’s language', () => {
    expect(guessDeviceName(FIREFOX_WINDOWS, 0)).toBe('Firefox on Windows');
    expect(guessDeviceName(FIREFOX_WINDOWS, 0, 'unter')).toBe('Firefox unter Windows');
  });

  test('tells an iPad (which says Macintosh) from a Mac by its touch screen', () => {
    expect(guessDeviceName(IPAD, 5)).toBe('iPad');
    expect(guessDeviceName(IPAD, 0)).toBe('Safari on Mac');
    expect(guessDeviceName(IPHONE, 5)).toBe('iPhone');
    expect(guessDeviceName('', 0)).toBe('Browser');
  });
});
