// The characters on this device, in the browser's IndexedDB: they survive a reload and stay until the
// player deletes them (or clears the site's data, which is what backups are for).
//
// Two object stores: `meta` holds what the character list shows (a few hundred bytes each), `data` the
// sheet itself (half a megabyte or more). The list reads only `meta`.
import type { AddOns } from '../engine/add-ons.ts';
import type { CharacterData } from '../engine/sheet-data.ts';

export interface CharacterMeta {
  id: string;
  /** From the sheet: name, class and levels, species; empty when the player left them empty. */
  name: string;
  classes: string;
  species: string;
  addOns: AddOns;
  /** ISO dates. `updated` is the last change on any device (a backup carries it along). */
  created: string;
  updated: string;
}

export interface StoredCharacter {
  meta: CharacterMeta;
  data: CharacterData;
}

const DB_NAME = 'mpmb-web';
const DB_VERSION = 1;
const META = 'meta';
const DATA = 'data';

/** A request as a promise. */
const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed')));
  });

/** Resolves when the transaction is written, so a reload right after can't lose it. */
const committed = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => reject(tx.error ?? new Error('IndexedDB transaction failed')));
    tx.addEventListener('abort', () => reject(tx.error ?? new Error('IndexedDB transaction aborted')));
  });

export class CharacterStore {
  private constructor(private readonly db: IDBDatabase) {}

  /** Opens (and on the first visit creates) the database. `factory` is a stand-in in tests. */
  static async open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<CharacterStore> {
    const request = factory.open(name, DB_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
    });
    return new CharacterStore(await done(request));
  }

  /** Every character's list entry, the last changed first. */
  async list(): Promise<CharacterMeta[]> {
    const tx = this.db.transaction(META, 'readonly');
    const all = await done(tx.objectStore(META).getAll() as IDBRequest<CharacterMeta[]>);
    return all.sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async get(id: string): Promise<StoredCharacter | undefined> {
    const tx = this.db.transaction([META, DATA], 'readonly');
    const [meta, data] = await Promise.all([
      done(tx.objectStore(META).get(id) as IDBRequest<CharacterMeta | undefined>),
      done(tx.objectStore(DATA).get(id) as IDBRequest<CharacterData | undefined>),
    ]);
    return meta && data ? { meta, data } : undefined;
  }

  /** Adds or replaces characters, all or none. */
  async put(...characters: StoredCharacter[]): Promise<void> {
    const tx = this.db.transaction([META, DATA], 'readwrite');
    characters.forEach(({ meta, data }) => {
      tx.objectStore(META).put(meta);
      tx.objectStore(DATA).put(data, meta.id);
    });
    await committed(tx);
  }

  async delete(id: string): Promise<void> {
    const tx = this.db.transaction([META, DATA], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(DATA).delete(id);
    await committed(tx);
  }

  close(): void {
    this.db.close();
  }
}

/** A field's text in the saved character; the blank sheet's fields are empty where these are read. */
const textOf = (data: CharacterData, field: string): string => {
  const value = data.fields[field]?.value;
  return (Array.isArray(value) ? value.join(', ') : (value ?? '')).trim();
};

/** The list entry for a character, from its sheet. `before` keeps the id and creation date. */
export function describeCharacter(
  data: CharacterData,
  addOns: AddOns,
  before: Pick<CharacterMeta, 'id' | 'created'> | null,
  now = new Date(),
): CharacterMeta {
  return {
    id: before?.id ?? crypto.randomUUID(),
    name: textOf(data, 'PC Name'),
    classes: textOf(data, 'Class and Levels'),
    species: textOf(data, 'Race'),
    // A copy: the page's add-ons can be reactive proxies, which IndexedDB can't store.
    addOns: { files: [...addOns.files], manual: addOns.manual },
    created: before?.created ?? now.toISOString(),
    updated: now.toISOString(),
  };
}

/**
 * Asks the browser to keep the site's data even when the disk runs low; otherwise it may clear it
 * without asking. Firefox asks the player once; others decide by themselves. False when refused or
 * unknown, then backups matter even more.
 */
export async function keepStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
