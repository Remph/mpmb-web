// The characters on this device, in the browser's IndexedDB: they survive a reload and stay until the
// player deletes them (or clears the site's data, which is what backups are for).
//
// Two object stores: `meta` holds what the character list shows (a few hundred bytes each), `data` the
// sheet itself (half a megabyte or more). The list reads only `meta`.
import type { AddOns } from '../engine/add-ons.ts';
import type { SheetChange } from '../engine/sheet-changes.ts';
import type { CharacterData } from '../engine/sheet-data.ts';
import type { UltCharges } from '../homebrew/ult.ts';
import type { SetupChoice } from '../play/attack-setup.ts';
import type { Effect } from '../play/effects.ts';
import { textOf } from './field-text.ts';
import { pointNeeded, surplus } from './restore-points.ts';
import type { PointReason, RestorePoint } from './restore-points.ts';

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
  /** ISO date of the last backup made in this browser (or the backup it was restored from); see backup-reminder.ts. */
  lastBackup?: string;
  /** The last update of the character to a new release of MPMB's sheet, when it had one. */
  sheetUpdate?: SheetUpdate;
  /** Homebrew the app adds on top of MPMB's sheet (never in a PDF); see src/homebrew/. */
  homebrew?: CharacterHomebrew;
}

/**
 * A character's values that live only in the app, never in a PDF: homebrew (kept even while its switch is
 * off, so turning it on again finds them) and the play view's own marks.
 */
export interface CharacterHomebrew {
  ult?: UltCharges;
  /** Features the player switches on and off (src/play/effects.ts). */
  effects?: Effect[];
  /** Whether attack rolls against the character have advantage or disadvantage (the sheet has no box for it). */
  acEdge?: 'adv' | 'dis';
  /** Attack rows' proficiency and ability as the player set them by hand (src/play/attack-setup.ts). */
  attackChoices?: SetupChoice[];
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
/** 2: the `previous` store (M11). 3: the `points` store (restore points). */
const DB_VERSION = 3;
const META = 'meta';
const DATA = 'data';
/** The copy each character had before its last sheet update, by id (see PreviousVersion). */
const PREVIOUS = 'previous';
/**
 * Each character's restore points (restore-points.ts), keyed [character id, ISO date], with an index by
 * character: the index lists one character's points in the order they were taken.
 */
const POINTS = 'points';
const BY_CHARACTER = 'character';

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

/**
 * Another tab and this one disagree on the database's version (a deploy came between them). Without
 * these, the newer tab's opening waited without end while the older tab kept the database open, and the
 * start page stayed empty without a word (tech review 2026-11-04, finding 3).
 */
export interface VersionEvents {
  /** This tab wants a newer version, and an older tab still has the database open. */
  blocked?: () => void;
  /**
   * A newer tab wants to upgrade: this tab has closed the database so the upgrade can go on, and can't
   * save any more until it is reloaded.
   */
  replaced?: () => void;
}

/** One character's restore points, the oldest first (the index sorts by its primary key, [id, date]). */
const pointsIn = (points: IDBObjectStore, id: string): Promise<RestorePoint[]> =>
  done(points.index(BY_CHARACTER).getAll(id) as IDBRequest<RestorePoint[]>);

export class CharacterStore {
  private constructor(private readonly db: IDBDatabase) {}

  /** Opens (and on the first visit creates) the database. `factory` is a stand-in in tests. */
  static async open(
    factory: IDBFactory = indexedDB,
    name = DB_NAME,
    events: VersionEvents = {},
    version = DB_VERSION,
  ): Promise<CharacterStore> {
    const request = factory.open(name, version);
    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
      if (!db.objectStoreNames.contains(PREVIOUS)) db.createObjectStore(PREVIOUS);
      if (!db.objectStoreNames.contains(POINTS)) db.createObjectStore(POINTS).createIndex(BY_CHARACTER, 'meta.id');
    });
    // The opening goes on by itself once the other tab closes its database (or is closed).
    request.addEventListener('blocked', () => events.blocked?.());
    const db = await done(request);
    db.addEventListener('versionchange', () => {
      db.close();
      events.replaced?.();
    });
    return new CharacterStore(db);
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
    const tx = this.db.transaction([META, DATA, PREVIOUS, POINTS], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(DATA).delete(id);
    tx.objectStore(PREVIOUS).delete(id);
    const points = tx.objectStore(POINTS);
    const keys = await done(points.index(BY_CHARACTER).getAllKeys(id));
    keys.forEach((key) => points.delete(key));
    await committed(tx);
  }

  /** A character's restore points, the newest first. */
  async points(id: string): Promise<RestorePoint[]> {
    const tx = this.db.transaction(POINTS, 'readonly');
    return (await pointsIn(tx.objectStore(POINTS), id)).reverse();
  }

  /**
   * Keeps the character as it is as a restore point, unless it hasn't changed since the newest one; the
   * oldest beyond KEEP_POINTS go. True when a point was taken.
   */
  async addPoint(character: StoredCharacter, reason: PointReason, now = new Date()): Promise<boolean> {
    const tx = this.db.transaction(POINTS, 'readwrite');
    const points = tx.objectStore(POINTS);
    const before = await pointsIn(points, character.meta.id);
    if (!pointNeeded(character.meta, before.at(-1))) {
      await committed(tx);
      return false;
    }
    const point: RestorePoint = { ...character, at: now.toISOString(), reason };
    points.put(point, [character.meta.id, point.at]);
    surplus([...before, point]).forEach((old) => points.delete([old.meta.id, old.at]));
    await committed(tx);
    return true;
  }

  /**
   * Rolls a character back to one of its points, all or none: the character as it is now becomes a point
   * ("before rolling back", so the rollback can be undone), and the point rolled back to goes, since the
   * character is now that. Returns the character's new list entry.
   */
  async rollBack(current: StoredCharacter, point: RestorePoint, now = new Date()): Promise<CharacterMeta> {
    const id = current.meta.id;
    // A change like any other: the list moves it up, and the backup reminder counts it.
    const meta: CharacterMeta = {
      ...point.meta,
      id,
      created: current.meta.created,
      updated: now.toISOString(),
      ...(current.meta.lastBackup ? { lastBackup: current.meta.lastBackup } : {}),
    };
    const tx = this.db.transaction([META, DATA, POINTS], 'readwrite');
    const points = tx.objectStore(POINTS);
    const before = await pointsIn(points, id);
    const kept = before.filter((p) => p.at !== point.at);
    const saved: RestorePoint = { ...current, at: now.toISOString(), reason: 'rollback' };
    points.delete([id, point.at]);
    points.put(saved, [id, saved.at]);
    surplus([...kept, saved]).forEach((old) => points.delete([id, old.at]));
    tx.objectStore(META).put(meta);
    tx.objectStore(DATA).put(point.data, id);
    await committed(tx);
    return meta;
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
  before: Pick<CharacterMeta, 'id' | 'created' | 'sheetUpdate' | 'homebrew' | 'lastBackup'> | null,
  now = new Date(),
): CharacterMeta {
  const portrait = data.images?.portrait?.thumb;
  const sheetUpdate = before?.sheetUpdate;
  const homebrew = before?.homebrew;
  const lastBackup = before?.lastBackup;
  return {
    ...(portrait ? { portrait } : {}),
    ...(sheetUpdate ? { sheetUpdate: { ...sheetUpdate } } : {}),
    // A copy, for the same reason as the add-ons below.
    ...(homebrew ? { homebrew: copyHomebrew(homebrew) } : {}),
    ...(lastBackup ? { lastBackup } : {}),
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
  const { ult, effects, acEdge, attackChoices } = homebrew;
  return {
    ...(ult ? { ult: { ...ult } } : {}),
    ...(effects ? { effects: effects.map(copyEffect) } : {}),
    ...(acEdge ? { acEdge } : {}),
    ...(attackChoices ? { attackChoices: attackChoices.map((c) => ({ ...c })) } : {}),
  };
}

const copyEffect = (effect: Effect): Effect => ({
  ...effect,
  applied: effect.applied && {
    ...(effect.applied.ac ? { ac: { ...effect.applied.ac } } : {}),
    attacks: effect.applied.attacks.map((a) => ({ ...a })),
  },
});

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
