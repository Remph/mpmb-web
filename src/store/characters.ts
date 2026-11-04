// The characters on this device, in the browser's IndexedDB: they survive a reload and stay until the
// player deletes them (or clears the site's data, which is what backups are for).
//
// Two object stores: `meta` holds what the character list shows (a few hundred bytes each), `data` the
// sheet itself (half a megabyte or more). The list reads only `meta`.
import type { AddOns } from '../engine/add-ons.ts';
import type { SheetChange } from '../engine/sheet-changes.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import type { UltCharges } from '../homebrew/ult.ts';

export interface CharacterMeta {
  id: string;
  /** From the sheet: name, class and levels, species; empty when the player left them empty. */
  name: string;
  classes: string;
  species: string;
  addOns: AddOns;
  /** The portrait's small picture for the list (a data URL), when the character has a portrait. */
  portrait?: string;
  /** ISO dates. `updated` is the last change on any device (a backup carries it along). */
  created: string;
  updated: string;
  /** The last update of the character to a new release of MPMB's sheet, when it had one. */
  sheetUpdate?: SheetUpdate;
  /** Homebrew the app adds on top of MPMB's sheet (never in a PDF); see src/homebrew/. */
  homebrew?: CharacterHomebrew;
}

/** A character's homebrew values. Kept even while its switch is off, so turning it on again finds them. */
export interface CharacterHomebrew {
  ult?: UltCharges;
}

/** A character moved to a new release of MPMB's sheet with MPMB's own import (M11). */
export interface SheetUpdate {
  /** MPMB's version numbers, as the sheets' document info has them ("24.2.0"). */
  from: string;
  to: string;
  /** ISO date. */
  date: string;
  /** Whether the player has seen the note about it (kept the update, or undid it). */
  seen: boolean;
  /** How many entries the player sees differ from before (the update note says so). */
  changes: number;
  /** The player went back to the version before: the character stays on `from` until they update again. */
  undone?: boolean;
}

export interface StoredCharacter {
  meta: CharacterMeta;
  data: CharacterData;
}

/** The character as it was before its last sheet update, kept so that the player can go back. */
export interface PreviousVersion extends StoredCharacter {
  /** MPMB's closing "Things to consider about the import" text (English, as MPMB writes it). */
  summary: string;
  /** The entries the player sees that differ after the update. */
  changes: SheetChange[];
}

const DB_NAME = 'mpmb-web';
/** 2: the `previous` store (M11). */
const DB_VERSION = 2;
const META = 'meta';
const DATA = 'data';
/** The copy each character had before its last sheet update, by id (see PreviousVersion). */
const PREVIOUS = 'previous';

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
      if (!db.objectStoreNames.contains(PREVIOUS)) db.createObjectStore(PREVIOUS);
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
    const tx = this.db.transaction([META, DATA, PREVIOUS], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(DATA).delete(id);
    tx.objectStore(PREVIOUS).delete(id);
    await committed(tx);
  }

  /**
   * Saves a character updated to a new sheet together with its copy from before, all or none: an update
   * is never saved without the way back. Replaces the copy of an earlier update.
   */
  async putUpdated(character: StoredCharacter, previous: PreviousVersion): Promise<void> {
    const tx = this.db.transaction([META, DATA, PREVIOUS], 'readwrite');
    tx.objectStore(META).put(character.meta);
    tx.objectStore(DATA).put(character.data, character.meta.id);
    tx.objectStore(PREVIOUS).put(previous, character.meta.id);
    await committed(tx);
  }

  /**
   * Undoes the last sheet update: the copy from before becomes the character again (with this list entry),
   * and the copy is gone.
   */
  async putBack(character: StoredCharacter): Promise<void> {
    const tx = this.db.transaction([META, DATA, PREVIOUS], 'readwrite');
    tx.objectStore(META).put(character.meta);
    tx.objectStore(DATA).put(character.data, character.meta.id);
    tx.objectStore(PREVIOUS).delete(character.meta.id);
    await committed(tx);
  }

  /** Replaces only the list entry (the update note was seen), keeping the sheet. */
  async putMeta(meta: CharacterMeta): Promise<void> {
    const tx = this.db.transaction(META, 'readwrite');
    tx.objectStore(META).put(meta);
    await committed(tx);
  }

  /** The character's copy from before its last sheet update, if it has one. */
  async previous(id: string): Promise<PreviousVersion | undefined> {
    const tx = this.db.transaction(PREVIOUS, 'readonly');
    return done(tx.objectStore(PREVIOUS).get(id) as IDBRequest<PreviousVersion | undefined>);
  }

  close(): void {
    this.db.close();
  }
}

/** A field's text in the saved character; the blank sheet's fields are empty where these are read. */
const textOf = (data: CharacterData, field: string): string => {
  const value: unknown = data.fields[field]?.value;
  // String(): a calculated field (Character Level) may hold a number at run time, whatever the type says.
  return (Array.isArray(value) ? value.join(', ') : String(value ?? '')).trim();
};

/** Any digit: a class text with a level in it ("Paladin 8"). */
const HAS_LEVEL = /\d/;

/**
 * The class line of the list and the top bar. A player may type only a subclass ("Evoker"), which MPMB
 * understands; the line then gets the character's level, as MPMB writes classes: "Evoker 10".
 */
function classLine(data: CharacterData): string {
  const classes = textOf(data, 'Class and Levels');
  const level = textOf(data, 'Character Level');
  return classes && level && !HAS_LEVEL.test(classes) ? `${classes} ${level}` : classes;
}

/** The list entry for a character, from its sheet. `before` keeps the id, creation date and last update. */
export function describeCharacter(
  data: CharacterData,
  addOns: AddOns,
  before: Pick<CharacterMeta, 'id' | 'created' | 'sheetUpdate' | 'homebrew'> | null,
  now = new Date(),
): CharacterMeta {
  const portrait = data.images?.portrait?.thumb;
  const sheetUpdate = before?.sheetUpdate;
  const homebrew = before?.homebrew;
  return {
    ...(portrait ? { portrait } : {}),
    ...(sheetUpdate ? { sheetUpdate: { ...sheetUpdate } } : {}),
    // A copy, for the same reason as the add-ons below.
    ...(homebrew ? { homebrew: copyHomebrew(homebrew) } : {}),
    id: before?.id ?? crypto.randomUUID(),
    name: textOf(data, 'PC Name'),
    classes: classLine(data),
    species: textOf(data, 'Race'),
    // A copy: the page's add-ons can be reactive proxies, which IndexedDB can't store.
    addOns: { files: [...addOns.files], manual: addOns.manual },
    created: before?.created ?? now.toISOString(),
    updated: now.toISOString(),
  };
}

/** A plain copy (the page's values can be reactive proxies, which IndexedDB can't store). */
export function copyHomebrew(homebrew: CharacterHomebrew): CharacterHomebrew {
  return homebrew.ult ? { ult: { ...homebrew.ult } } : {};
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
