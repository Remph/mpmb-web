// What the app does with characters: import PDFs, keep them in the browser, open one, back up and
// restore. The views call these methods and draw the state; the engine runs in the worker behind
// EngineClient, and its pop-ups go to the PopUpStack.
import type { AddOns, ScriptChanges, ScriptFile, ScriptFiles } from './engine/add-ons.ts';
import { parseScriptFiles, scriptName } from './build/add-ons.ts';
import type { BuilderInfo, UnitSystem } from './engine/builder.ts';
import type { ScoreChange } from './engine/scores.ts';
import type { SpellPicks, SpellSheetPicks, SpellsInfo } from './engine/spells.ts';
import type { CompanionTemplate } from './engine/companion-options.ts';
import { sheetChanges } from './engine/sheet-changes.ts';
import type { FieldValues } from './engine/sheet-changes.ts';
import type { CharacterData } from './engine/sheet-data.ts';
import { SHEET_ID } from './engine/sheet-id.ts';
import type { SheetPack } from './engine/sheet-pack.ts';
import { keptVersions, loadSheetPack } from './sheet-versions.ts';
import { FF } from './engine/types.ts';
import type { ImageSlot, SheetImage, SheetImages } from './engine/types.ts';
import { fitImages, fitPicture } from './play/pictures.ts';
import { followMaxHp } from './play/rules.ts';
import { keepChoices, readChoices, setupSteps, withChoice } from './play/attack-setup.ts';
import type { AttackSetup } from './play/attack-setup.ts';
import type { Texts } from './i18n.ts';
import { counted, fill } from './i18n.ts';
import { PopUpStack } from './popups/popups.svelte.ts';
import { backupFileName, filledPdfName, makeBackup, planRestore, readBackup } from './store/backup.ts';
import {
  UpdateLeft,
  UpdateStopped,
  backupFailureText,
  errorText,
  failureText,
  restoreLines,
  sameNamed,
} from './session-texts.ts';
import { CharacterStore, copyHomebrew, describeCharacter, keepStorage } from './store/characters.ts';
import { TabLock, browserLocks } from './store/tab-lock.ts';
import type { Locks } from './store/tab-lock.ts';
import type { UltCharges } from './homebrew/ult.ts';
import type { CharacterHomebrew, CharacterMeta, PreviousVersion, StoredCharacter } from './store/characters.ts';
import type { PointReason, RestorePoint } from './store/restore-points.ts';
import type { Effect } from './play/effects.ts';
import type { Beast, InForm } from './play/wild-shapes.ts';
import { EngineClient, EngineError } from './worker/client.ts';
import type { Done, PopUps, WorkerLike } from './worker/client.ts';
import { createLink } from './worker/link.ts';
import { newEngineWorker } from './worker/start.ts';
import type { FieldViews } from './worker/views.ts';
import type { MenuNode, Migrated, Opened } from './worker/protocol.ts';

/** Where MPMB keeps the imported script files in a saved sheet (Acrobat's toSource of CurrentScriptFiles). */
const SCRIPT_FILES_FIELD = 'User_Imported_Files.Stringified';

/** A script file another character in this browser carries, with that character's name. */
export interface OtherScript extends ScriptFile {
  owner: string;
}

/** A line under the list: what an import or restore did. */
export interface Note {
  id: number;
  /** `info`: something to know that isn't a failure (the character is open in another tab). */
  kind: 'busy' | 'ok' | 'error' | 'info';
  text: string;
  /** A button at the end of the line: the way out of what it says (Remph's pick, 2026-11-04). */
  action?: { label: string; run: () => void };
  /** Stays when other notes are cleared, until the page reloads (the database went to a newer tab). */
  keep?: boolean;
}

/**
 * Whether the open character takes no changes: still opening, failed (until reopened), or open in another
 * tab that took it over (`elsewhere`; see store/tab-lock.ts).
 */
export const readOnly = (status: OpenCharacter['status']): boolean =>
  status === 'opening' || status === 'error' || status === 'elsewhere';

export interface OpenCharacter {
  meta: CharacterMeta;
  /** The fields as the engine shows them (value and Format text). */
  fields: FieldViews;
  menu: MenuNode[];
  status: 'opening' | 'working' | 'saving' | 'saved' | 'error' | 'elsewhere';
  /** The portrait and organisation symbol (M8). */
  images: SheetImages;
}

/**
 * One change the play view makes on the sheet: type into a field, or click a check box or button
 * (`shift`: with Shift held, which opens a spell row's own menu in MPMB; `newRow`: a spell level's "+ Row"
 * there, see newSpellRow in engine/spells.ts).
 */
export type Step =
  /** cancelable: a pop-up the player cancels while MPMB applies the text cancels the edit (Engine.edit). */
  | { edit: string; text: string; cancelable?: boolean }
  /** menuTitle: the title for a menu of MPMB's that the click opens (MPMB's menus have none). */
  | { click: string; shift?: boolean; newRow?: boolean; menuTitle?: string };

/**
 * The fields as they will be once the worker made these steps. The page shows them at once, so the
 * next tap reads the new state: five quick taps on "−" count five, not one. The worker's own update
 * replaces them a moment later (with whatever MPMB's scripts changed besides).
 */
export function expected(fields: FieldViews, steps: Step[]): FieldViews {
  const next = { ...fields };
  steps.forEach((step) => {
    const name = 'edit' in step ? step.edit : step.click;
    const view = next[name];
    // A push button (MPMB's row menus) only runs its script; the worker reports what that changed.
    if (!view || ('click' in step && (view.flags & FF.pushButton || step.shift || step.newRow))) return;
    // A click toggles a check box between "Off" and the value its widget has when on.
    const on = view.widgets[0]?.on ?? 'Yes';
    const value = 'edit' in step ? step.text : view.value === 'Off' || view.value === '' ? on : 'Off';
    next[name] = { ...view, value, text: undefined };
  });
  return next;
}

/** The name of MPMB's bookmark that empties the sheet. */
const RESET = 'Reset';

/** Whether any field differs; the client replaces a changed field's view, so a changed one is a new object. */
function fieldsChanged(before: Readonly<Record<string, unknown>>, after: Readonly<Record<string, unknown>>): boolean {
  const names = Object.keys(after);
  return names.length !== Object.keys(before).length || names.some((name) => before[name] !== after[name]);
}

const closed = (): Promise<never> => Promise.reject(new Error('closed'));
/**
 * The old sheet's pop-ups during an update, answered as closed (EngineClient answers a failed pop-up with
 * null): the player sees only the new sheet's.
 */
const CLOSED_POP_UPS: PopUps = { alert: closed, dialog: closed, menu: closed, openFile: closed };

/**
 * Resolves when the work is over, also when it failed: what waits for it (leaving a character) goes
 * on. The work reports its own errors.
 */
async function settled(work: Promise<void>): Promise<void> {
  try {
    await work;
  } catch {
    // Reported by the work itself.
  }
}

export class Session {
  readonly popUps = new PopUpStack();
  readonly client: EngineClient;
  characters: CharacterMeta[] = $state([]);
  notes: Note[] = $state([]);
  /** The character on screen, or null for the list. */
  current: OpenCharacter | null = $state(null);
  /** The storage could not be opened (e.g. a private window that forbids it). */
  storageError = $state('');
  /** The sheet menu's "Level up": the Build screen opens with the level-up question. */
  levelUpNext = $state(false);
  private store: CharacterStore | null = null;
  private nextNote = 1;
  /** Whether the open sheet changed since it was saved. */
  private dirty = false;
  /**
   * The work on the one engine worker: an import batch, or the last action on the open sheet with its
   * saving. Leaving and opening a character wait for it, and a new import batch starts after it.
   */
  private running: Promise<void> = Promise.resolve();
  /** Field values the play view set that the worker hasn't made yet, by field, with their change. */
  private readonly waiting = new Map<string, { value: string | string[]; change: number }>();
  private nextChange = 1;
  /** Whether the browser was asked to keep the data during this visit. */
  private askedToKeep = false;
  /**
   * Changes and Build steps waiting in line, the one running included. The last one saves for all of them:
   * a save writes the whole character (about 600 KB), and five quick taps saved five times (tech review
   * 2026-11-04, finding 4a).
   */
  private queued = 0;
  /** This tab's hold on the open character, so another tab can't overwrite it (finding 2). */
  private readonly tabLock: TabLock;

  constructor(
    private readonly texts: () => Texts,
    /** Starts an engine worker: newEngineWorker in the app, a stand-in in tests. */
    private readonly newWorker: () => WorkerLike = newEngineWorker,
    /** The browser's locks across tabs; a stand-in in tests. */
    locks: Locks | undefined = browserLocks(),
  ) {
    this.tabLock = new TabLock(locks, (id) => this.lostToOtherTab(id));
    this.client = new EngineClient(this.popUps, newWorker);
    this.client.onFields = () => {
      this.dirty = true;
      if (this.current) this.current.fields = this.shownFields();
    };
    this.client.onMenu = (menu) => {
      if (this.current) this.current.menu = menu;
    };
    this.popUps.linkQuestion = () => ({
      title: this.t.linkTitle,
      message: this.t.linkMessage,
      open: this.t.openLink,
      cancel: this.t.cancel,
    });
  }

  private get t(): Texts {
    return this.texts();
  }

  /**
   * Opens the storage and lists the characters. The list and its buttons show at once, so a restore, an
   * import or a new character can come before the storage is open: they wait for `started` (a restore
   * right after the page opened found no storage and saved nothing; the flaky deploy test, 2026-11-07).
   */
  start(): Promise<void> {
    this.started = this.openStore();
    return this.started;
  }

  /** What `start` is doing; done (also when it failed) before saving or listing is any use. */
  private started: Promise<void> = Promise.resolve();

  private async openStore(): Promise<void> {
    try {
      let waiting: number | undefined;
      this.store = await CharacterStore.open(indexedDB, undefined, {
        blocked: () => {
          waiting = this.note('info', this.t.dbBlocked, undefined, { keep: true });
        },
        replaced: () => this.replacedByNewerTab(),
      });
      if (waiting) this.notes = this.notes.filter((n) => n.id !== waiting);
      await this.refresh();
    } catch (err) {
      this.storageError = errorText(err);
    }
  }

  /**
   * A tab of a newer release upgraded the database: this tab closed it so the upgrade could go on, and
   * can't save any more. The open character stops taking changes; a reload loads the new release.
   */
  private replacedByNewerTab(): void {
    this.store = null;
    if (this.current) this.current.status = 'elsewhere';
    this.note('error', this.t.dbReplaced, undefined, {
      keep: true,
      action: { label: this.t.reload, run: () => location.reload() },
    });
  }

  private async refresh(): Promise<void> {
    this.characters = (await this.store?.list()) ?? [];
  }

  private note(
    kind: Note['kind'],
    text: string,
    replacing?: number,
    extra: Pick<Note, 'action' | 'keep'> = {},
  ): number {
    const id = replacing ?? this.nextNote++;
    const note = { id, kind, text, ...extra };
    this.notes = replacing ? this.notes.map((n) => (n.id === id ? note : n)) : [...this.notes, note];
    return id;
  }

  /** Clears the notes of finished work; an import still running keeps its line, and so does a kept one. */
  clearNotes(): void {
    this.notes = this.notes.filter((n) => n.kind === 'busy' || n.keep);
  }

  /**
   * An error nothing else caught (a crash in a part of the page outside the session): shown as a note,
   * so it isn't lost in the browser's console (tech review 2026-11-04, finding 6).
   */
  reportError(err: unknown): void {
    this.note('error', fill(this.t.unexpectedError, { reason: errorText(err) }));
  }

  // ---- Import ----

  /**
   * Imports each PDF in turn: the worker opens it (running its add-on scripts) and it is saved.
   * Opening a character meanwhile (its card is still there) waits until the batch is done; it used to
   * end the import's worker, and the PDF was lost without a word.
   */
  async importPdfs(files: File[]): Promise<void> {
    const batch = this.importAfter(this.running, files);
    this.running = settled(batch);
    await batch;
  }

  private async importAfter(before: Promise<void>, files: File[]): Promise<void> {
    await this.started;
    await before;
    this.clearNotes();
    // One after the other: each import uses the one engine worker.
    await files.reduce<Promise<void>>(async (previous, file) => {
      await previous;
      await this.importPdf(file);
    }, Promise.resolve());
    await this.refresh();
  }

  private async importPdf(file: File): Promise<void> {
    const busy = this.note('busy', fill(this.t.reading, { file: file.name }));
    try {
      const { opened, from } = await this.openPdf(file);
      const data = await this.client.save();
      // The PDF's portrait comes as it was put in (up to a few MB): scaled down before it is stored.
      const images = await fitImages(data.images);
      if (images) data.images = images;
      else delete data.images;
      const { addOns } = opened.result;
      const before = await this.sameAs(data, addOns);
      if (before === 'cancel') {
        this.notes = this.notes.filter((n) => n.id !== busy);
        return;
      }
      const meta = describeCharacter(data, addOns, before);
      await this.save({ meta, data });
      // The next PDF of the same batch may be this character again.
      await this.refresh();
      const name = meta.name || this.t.unnamed;
      const count = addOns.files.length + Number(addOns.manual);
      const done = count
        ? counted(this.t.importedAddOnsOne, this.t.importedAddOns, count, { name })
        : fill(this.t.imported, { name });
      this.note('ok', from ? fill(this.t.importedUpdated, { name, from, to: SHEET_ID.version }) : done, busy);
    } catch (err) {
      this.note('error', fill(this.t.importFailed, { file: file.name, reason: this.explain(err) }), busy);
    } finally {
      this.client.close();
    }
  }

  /**
   * Opens a PDF in the client's worker. A PDF of an older sheet version that the app keeps is opened on
   * that version in a second worker and updated onto the current sheet (`from`: its version then).
   */
  private async openPdf(file: File): Promise<{ opened: Done<Opened>; from: string | null }> {
    try {
      return { opened: await this.client.importPdf(await file.arrayBuffer()), from: null };
    } catch (err) {
      const found = err instanceof EngineError && err.code === 'wrong-sheet' ? err.found : undefined;
      const pack = found?.type === SHEET_ID.type ? await loadSheetPack(found.version) : null;
      if (!found || !pack || !this.client.answersPopUps) throw err;
      // The bytes moved to the first worker; the file is read again.
      const bytes = await file.arrayBuffer();
      const { migrated } = await this.migrate((source) => source.importPdf(bytes, pack));
      return { opened: migrated, from: found.version };
    }
  }

  /**
   * Moves a character from an older version of the sheet onto the current one, with MPMB's own "Import
   * from another sheet" (M11): `openOld` opens it on its version in a second worker, which then answers
   * the client's worker as the old document (see the workers' `serve` and `migrate`). The updated
   * character stays open in the client's worker. Needs shared memory (the client answers pop-ups).
   */
  private async migrate(
    openOld: (source: EngineClient) => Promise<unknown>,
    wanted: () => boolean = () => true,
  ): Promise<{ migrated: Done<Migrated>; before: FieldValues }> {
    const source = new EngineClient(CLOSED_POP_UPS, this.newWorker);
    try {
      await openOld(source);
      // The import leaves out the pictures (the app carries them), so they come from the old sheet.
      const { images } = await source.save();
      // What the player saw, to tell them what the update changed.
      const before = await source.values();
      const { port1, port2 } = new MessageChannel();
      const link = createLink();
      await source.serve(port1, link.buffer);
      // Leaving a character closes only the client's worker, not this one: if the player left while the
      // old sheet opened here, the client's worker may hold another character by now and must not be
      // restarted for this update (review of #39).
      if (!wanted()) throw new UpdateLeft();
      const migrated = await this.client.migrate(port2, link.buffer, images);
      if (migrated.result.summary === null) throw new UpdateStopped(this.t.sheetUpdateStopped);
      return { migrated, before };
    } finally {
      source.close();
    }
  }

  /**
   * A character with the same name is probably the same one, imported again from a newer PDF (its
   * classes may have changed with a level): the player decides whether the import replaces it (keeping
   * its id and creation date).
   */
  private async sameAs(data: CharacterData, addOns: AddOns): Promise<CharacterMeta | null | 'cancel'> {
    const fresh = describeCharacter(data, addOns, null);
    const same = sameNamed(this.characters, fresh.name);
    if (!same) return null;
    const answer = await this.popUps.choose({
      title: this.t.sameCharacterTitle,
      message: fill(this.t.sameCharacter, { name: same.name, classes: same.classes || '–' }),
      buttons: [
        { value: 'cancel', label: this.t.cancel },
        { value: 'both', label: this.t.keepBoth },
        { value: 'replace', label: this.t.replace, primary: true },
      ],
      cancel: 'cancel',
    });
    if (answer === 'cancel') return 'cancel';
    return answer === 'replace' ? same : null;
  }

  private explain(err: unknown): string {
    return failureText(err, this.t);
  }

  private async save(...characters: StoredCharacter[]): Promise<void> {
    if (!this.store) throw new Error(this.storageError || 'no storage');
    await this.store.put(...characters);
    // Once per visit, after the first save, ask the browser to keep the data. Firefox asks the player;
    // asking on every save would bring its question back after each action when it was dismissed.
    if (!this.askedToKeep) {
      this.askedToKeep = true;
      void keepStorage();
    }
  }

  /**
   * A new character on the blank sheet, saved at once so it has its place in the list; returns its id
   * (null when storage or the engine failed, with a note). MPMB greets a blank sheet with its welcome
   * and source pop-ups, as in Acrobat.
   */
  async create(): Promise<string | null> {
    await this.started;
    await this.running;
    this.clearNotes();
    try {
      await this.client.open(null);
      const data = await this.client.save();
      const meta = describeCharacter(data, { files: [], manual: false }, null);
      await this.save({ meta, data });
      await this.refresh();
      return meta.id;
    } catch (err) {
      this.note('error', this.explain(err));
      return null;
    } finally {
      this.client.close();
    }
  }

  // ---- One character ----

  /**
   * Opens a saved character; false when it isn't saved here. Open in another tab, it shows only a line
   * offering to take it over (`steal`: take it from that tab, which stops saving).
   */
  async open(id: string, steal = false): Promise<boolean> {
    this.clearNotes();
    const found = await this.store?.get(id);
    if (!found) return false;
    this.waiting.clear();
    if (!(await this.tabLock.take(id, steal))) {
      this.current = { meta: found.meta, fields: {}, menu: [], status: 'elsewhere', images: {} };
      this.note('info', this.t.openElsewhere, undefined, {
        action: { label: this.t.takeOver, run: () => void this.takeOver() },
      });
      return true;
    }
    // Taken from another tab: read it again, the other tab may have saved while the lock changed hands.
    const stored = steal ? ((await this.store?.get(id)) ?? found) : found;
    // Opened again right after a rollback: the rollback kept the way back already, and a point of the sheet
    // just rolled back to would only push out an older one.
    if (this.rolledBack === id) this.rolledBack = null;
    else await this.keepPoint(stored, 'opened');
    this.current = { meta: stored.meta, fields: {}, menu: [], status: 'opening', images: { ...stored.data.images } };
    // This opening, not a later one of the same character (read back: Svelte's state wraps the object).
    const shown = this.current;
    try {
      const from = stored.data.info.SheetVersion;
      const pack = from && from !== SHEET_ID.version ? await loadSheetPack(from) : null;
      if (pack) await this.openOlder(stored, pack, () => this.current === shown);
      else await this.client.open(stored.data);
      this.dirty = false;
      if (this.current?.meta.id === id) {
        this.current.fields = { ...this.client.fields };
        this.current.menu = this.client.menu;
        this.current.status = 'saved';
      }
    } catch (err) {
      // Left during an update: nothing to say, the next opening tries again.
      if (err instanceof UpdateLeft) return true;
      if (this.current?.meta.id === id) this.current.status = 'error';
      this.failed(err);
    }
    return true;
  }

  // ---- Restore points (store/restore-points.ts) ----

  /** The character a rollback opens again, which takes no "opened" point. */
  private rolledBack: string | null = null;

  /**
   * Keeps a restore point of a saved character. A point that can't be written (the disk is full) mustn't stop
   * what the player is doing, so a failure only goes to the console.
   */
  private async keepPoint(character: StoredCharacter, reason: PointReason): Promise<void> {
    try {
      await this.store?.addPoint($state.snapshot(character), reason);
    } catch (err) {
      console.warn('No restore point:', err);
    }
  }

  /**
   * A restore point of the open character as saved after the work before it: before the Build screen and
   * "Start over" change it.
   */
  takePoint(reason: PointReason): Promise<void> {
    const open = this.current;
    const before = this.running;
    // In line itself, so that a change made right after (the Build screen's first tap) waits for the point.
    const take = async (): Promise<void> => {
      await settled(before);
      const stored = await this.savedCopy(open);
      if (stored) await this.keepPoint(stored, reason);
    };
    this.running = take();
    return this.running;
  }

  /** The open character as saved, while this tab may still change it; null when a point of it can't be kept. */
  private async savedCopy(open: OpenCharacter | null): Promise<StoredCharacter | null> {
    if (!open || this.current !== open || readOnly(open.status) || !this.tabLock.holds(open.meta.id)) return null;
    return (await this.store?.get(open.meta.id)) ?? null;
  }

  /** The open character's restore points, the newest first. */
  async points(): Promise<RestorePoint[]> {
    const id = this.current?.meta.id;
    return (id && (await this.store?.points(id))) || [];
  }

  /**
   * Rolls the open character back to one of its points, after asking: the sheet as it is now becomes a point
   * itself, so this can be undone. The character opens again on the sheet rolled back to.
   */
  async rollBack(point: RestorePoint, when: string): Promise<void> {
    const open = this.current;
    if (!open || readOnly(open.status) || !this.store) return;
    const answer = await this.popUps.choose({
      title: fill(this.t.rollbackAsk, { when }),
      message: this.t.rollbackAskLine,
      buttons: [
        { value: 'cancel', label: this.t.cancel },
        { value: 'rollback', label: this.t.rollbackButton, primary: true },
      ],
      cancel: 'cancel',
    });
    if (answer !== 'rollback') return;
    await this.running;
    if (this.current !== open || readOnly(open.status) || !this.tabLock.holds(open.meta.id)) return;
    const current = await this.store.get(open.meta.id);
    if (!current) return;
    try {
      await this.store.rollBack(current, $state.snapshot(point));
    } catch (err) {
      this.note('error', this.explain(err));
      return;
    }
    await this.refresh();
    this.client.close();
    this.rolledBack = open.meta.id;
    await this.open(open.meta.id);
    this.note('ok', fill(this.t.rolledBack, { when }));
  }

  /** The open character is open in another tab: this tab takes it over, and the other one stops saving it. */
  async takeOver(): Promise<void> {
    const id = this.current?.meta.id;
    if (!id) return;
    await this.running;
    this.client.close();
    await this.open(id, true);
  }

  /**
   * After a failed action the character takes no changes (the engine's state is unsure): opening it again
   * loads what was saved last, without the way back through the list (finding 6).
   */
  async reopen(): Promise<void> {
    const id = this.current?.meta.id;
    if (!id) return;
    await this.running;
    this.client.close();
    await this.open(id);
  }

  /** Another tab took over the open character: this one stops saving it and says so. */
  private lostToOtherTab(id: string): void {
    const open = this.current;
    if (open?.meta.id !== id) return;
    open.status = 'elsewhere';
    this.waiting.clear();
    this.note('info', this.t.takenElsewhere, undefined, {
      action: { label: this.t.takeOver, run: () => void this.takeOver() },
    });
  }

  /**
   * A failed action's note, with the button that opens the character again (Remph's pick A, 2026-11-04).
   * Nothing to say when another tab took the character over meanwhile: that has its own line.
   */
  private failed(err: unknown): void {
    const open = this.current;
    if (open?.status === 'elsewhere') return;
    if (!open) {
      this.note('error', this.explain(err));
      return;
    }
    const reason = this.explain(err);
    // The reason may come without a full stop (an engine message): the hint is a sentence of its own.
    const stop = /[.!?…]$/.test(reason) ? '' : '.';
    this.note('error', `${reason}${stop} ${this.t.reopenHint}`, undefined, {
      action: { label: this.t.reopen, run: () => void this.reopen() },
    });
  }

  /**
   * Opens a character saved on an older sheet version that the app keeps: updated onto the current sheet
   * and saved, with the copy from before kept (Remph, 2026-11-04). Without shared memory, or when the
   * update fails, it opens on its own version and stays there until the next try.
   */
  private async openOlder(stored: StoredCharacter, pack: SheetPack, shown: () => boolean): Promise<void> {
    // Loading the older version's pack took a moment: the player may have gone on meanwhile.
    if (!shown()) throw new UpdateLeft();
    const store = this.store;
    const undone = stored.meta.sheetUpdate?.undone === true && stored.meta.sheetUpdate.to === SHEET_ID.version;
    if (!store || !this.client.answersPopUps || undone) {
      await this.client.open(stored.data, pack);
      return;
    }
    const name = stored.meta.name || this.t.unnamed;
    const texts = { name, from: pack.version, to: SHEET_ID.version };
    const busy = this.note('busy', fill(this.t.sheetUpdating, texts));
    try {
      const { migrated, before } = await this.migrate((source) => source.open(stored.data, pack), shown);
      const data = await this.client.save();
      const changes = sheetChanges(before, await this.client.values(), { from: pack.version, to: SHEET_ID.version });
      const sheetUpdate = {
        from: pack.version,
        to: SHEET_ID.version,
        date: new Date().toISOString(),
        seen: false,
        changes: changes.length,
      };
      const meta = describeCharacter(data, migrated.result.addOns, { ...stored.meta, sheetUpdate });
      await store.putUpdated({ meta, data }, { ...stored, summary: migrated.result.summary ?? '', changes });
      if (this.current?.meta.id === meta.id) this.current.meta = meta;
      await this.refresh();
      // The line under the top bar says the rest (CharacterView).
      this.notes = this.notes.filter((n) => n.id !== busy);
    } catch (err) {
      // Left meanwhile (back to the list, or another character): the update stopped before it was saved
      // (putUpdated saves all or none). No fallback sheet for a character no longer shown, and no note
      // saying it is open; the next opening tries again.
      if (err instanceof UpdateLeft || !shown()) {
        this.notes = this.notes.filter((n) => n.id !== busy);
        throw new UpdateLeft();
      }
      this.note('error', fill(this.t.sheetUpdateFailed, { ...texts, reason: this.explain(err) }), busy);
      await this.client.open(stored.data, pack);
    }
  }

  // ---- Homebrew (app only, never in a PDF) ----

  /**
   * The open character's ult charges. Not a sheet field, so MPMB's scripts never see it: it goes straight
   * into the character's list entry, which backups carry along.
   */
  setUlt(ult: UltCharges): Promise<void> {
    return this.setHomebrew({ ult: { ...ult } });
  }

  /** The open character's effects (src/play/effects.ts), kept like the ult charges. */
  setEffects(effects: Effect[]): Promise<void> {
    return this.setHomebrew(copyHomebrew({ effects }));
  }

  /** The Wild Shape form the open character is in (src/play/wild-shapes.ts); null when in none. */
  setInForm(form: InForm | null): Promise<void> {
    return this.setHomebrew({ wildShape: form ? { ...form } : undefined });
  }

  /** Advantage or disadvantage on attack rolls against the open character; '' for neither. */
  setAcEdge(edge: '' | 'adv' | 'dis'): Promise<void> {
    return this.setHomebrew({ acEdge: edge || undefined });
  }

  /**
   * Sets an attack row's proficiency or ability, as the PDF's two boxes in front of the row do, and
   * remembers it: MPMB sets the boxes again when it recalculates the weapons (src/play/attack-setup.ts).
   */
  async setAttackSetup(row: number, set: Partial<AttackSetup>): Promise<void> {
    const open = this.current;
    if (!open || readOnly(open.status)) return;
    const steps = setupSteps(open.fields, row, set);
    const choices = withChoice(open.fields, readChoices(open.meta.homebrew?.attackChoices), row, set);
    await this.setHomebrew({ attackChoices: choices });
    await this.change(steps);
  }

  private async setHomebrew(values: CharacterHomebrew): Promise<void> {
    const open = this.current;
    if (!open || !this.store || !this.tabLock.holds(open.meta.id)) return;
    // A change like any other: the list moves it up, and a backup restore's "older than here" sees it
    // (tech review 2026-11-04, finding 13).
    const updated = new Date().toISOString();
    const homebrew = copyHomebrew({ ...open.meta.homebrew, ...values });
    open.meta = { ...open.meta, updated, homebrew };
    await this.store.putMeta($state.snapshot(open.meta));
    await this.refresh();
  }

  // ---- After a sheet update (M11) ----

  /** The open character's last update: what changed, MPMB's notes and the copy from before. */
  async updateDetails(): Promise<PreviousVersion | null> {
    const id = this.current?.meta.id;
    return (id && (await this.store?.previous(id))) || null;
  }

  /** The player keeps the update: the line and the list's mark go. */
  async keepUpdate(): Promise<void> {
    const open = this.current;
    const update = open?.meta.sheetUpdate;
    if (!open || !update || !this.store) return;
    open.meta = { ...open.meta, sheetUpdate: { ...update, seen: true } };
    await this.store.putMeta($state.snapshot(open.meta));
    await this.refresh();
  }

  /**
   * The player goes back to the copy from before the update (changes made since are lost): it opens again on
   * its old sheet and stays there until the player updates it again (updateAgain).
   */
  async undoUpdate(): Promise<void> {
    const open = this.current;
    const update = open?.meta.sheetUpdate;
    if (!open || !update || !this.store) return;
    await this.running;
    const previous = await this.store.previous(open.meta.id);
    if (!previous) return;
    const meta = { ...previous.meta, sheetUpdate: { ...update, seen: true, undone: true } };
    await this.store.putBack({ meta, data: previous.data });
    await this.refresh();
    await this.open(meta.id);
  }

  /** A character whose update was undone tries again, as when it first opened on the new sheet. */
  async updateAgain(): Promise<void> {
    const open = this.current;
    const update = open?.meta.sheetUpdate;
    if (!open || !update?.undone || !this.store) return;
    await this.running;
    await this.store.putMeta({ ...$state.snapshot(open.meta), sheetUpdate: { ...update, undone: false } });
    await this.refresh();
    await this.open(open.meta.id);
  }

  /** Leaves the open character, after the last action on it is saved. */
  async close(): Promise<void> {
    await this.running;
    this.client.close();
    this.tabLock.free();
    this.current = null;
    this.clearNotes();
  }

  /**
   * The page is going away or out of sight (another app on the iPad): saves what isn't saved yet. Changes
   * in line save after the last of them anyway; this covers a change nothing saved after.
   */
  flush(): void {
    const open = this.current;
    if (!open || !this.dirty || this.queued > 0 || readOnly(open.status)) return;
    const before = this.running;
    const save = async (): Promise<void> => {
      await before;
      try {
        await this.saveOpen();
      } catch (err) {
        this.failed(err);
      }
    };
    this.running = save();
  }

  /**
   * Clicks one of MPMB's bookmarks; what the scripts change is saved right after. The title names a menu of
   * MPMB's that the bookmark opens.
   */
  async runMenu(path: string[], menuTitle?: string): Promise<void> {
    const run = (): Promise<unknown> => this.popUps.titled(menuTitle, () => this.client.bookmark(path));
    // MPMB's "Reset" empties the whole sheet ("Start over" in the Sheet menu, or from MPMB's full menu). The
    // sheet as saved before it becomes a restore point, but only once the player said Yes to MPMB's question:
    // a "No" mustn't push out the oldest of the three points (UI review 3, finding 03). The answer itself
    // stays inside the scripts, so "Yes" is told by the sheet having changed.
    if (!path.some((name) => name.trim() === RESET)) return this.work(run);
    await settled(this.running);
    const saved = await this.savedCopy(this.current);
    return this.work(async () => {
      const before = { ...this.client.fields };
      await run();
      if (saved && fieldsChanged(before, this.client.fields)) await this.keepPoint(saved, 'reset');
    });
  }

  /** Imperial or metric, through MPMB's own units bookmark (the app answers its dialog). */
  setUnits(system: UnitSystem): Promise<void> {
    return this.work(() => this.client.units(system));
  }

  /**
   * New ability score columns, through MPMB's own Ability Scores dialog (the app answers it). In line
   * after the changes before it, like a play view change, so that quick taps on the Build screen all count.
   */
  setScores(changes: ScoreChange[]): Promise<void> {
    if (changes.length === 0) return this.running;
    return this.inLine(() => this.client.scores(changes));
  }

  /**
   * Picks an option of one of MPMB's menus on the Build screen's Choices step (see the worker's `pick`).
   * In line like setScores, so that three quick taps on invocations pick three.
   */
  pick(field: string, answer: string): Promise<void> {
    return this.inLine(() => this.client.pick(field, answer));
  }

  /** The same for one of MPMB's bookmarks (its "Functions" menu), as `path` names it. */
  pickBookmark(path: string[], answer: string): Promise<void> {
    return this.inLine(() => this.client.pickBookmark(path, answer));
  }

  /**
   * The Spells step's picks through MPMB's spell dialogs, then MPMB makes the spell sheet pages again. In line
   * after the changes before it, like setScores.
   */
  setSpells(picks: SpellPicks[], sheet: SpellSheetPicks | null): Promise<void> {
    return this.inLine(() => this.client.setSpells(picks, sheet));
  }

  /** Runs a worker command after the work before it, then shows and saves what it changed. */
  private inLine(job: () => Promise<unknown>): Promise<void> {
    const open = this.current;
    if (!open || readOnly(open.status)) return this.running;
    return this.queue(open, async () => {
      await job();
    });
  }

  /**
   * Puts work on the open sheet in line after the work before it; the fields then show what it changed.
   * Only the last piece of work in line saves, for all of them (finding 4a). `onFail` tidies up after
   * a failure, before the error note.
   */
  private queue(
    open: OpenCharacter,
    job: () => Promise<void>,
    onFail?: () => void,
    own: Set<string> = new Set(),
  ): Promise<void> {
    this.queued++;
    const before = this.running;
    const run = async (): Promise<void> => {
      await before;
      try {
        try {
          if (this.current !== open || readOnly(open.status)) return;
          open.status = 'working';
          await this.followingMaxHp(job, own);
          open.fields = this.shownFields();
        } finally {
          this.queued--;
        }
        if (this.queued === 0) await this.saveOpen();
      } catch (err) {
        onFail?.();
        if (open.status !== 'elsewhere') open.status = 'error';
        this.failed(err);
      }
    };
    this.running = run();
    return this.running;
  }

  /**
   * What the Build screen offers and shows, read from the open sheet after the work before it (a change
   * in line may add a class); null without an open character or when the sheet failed.
   */
  async builderInfo(): Promise<BuilderInfo | null> {
    const open = this.current;
    await this.running;
    if (!open || this.current !== open || readOnly(open.status)) return null;
    try {
      return await this.client.builder();
    } catch (err) {
      this.note('error', this.explain(err));
      return null;
    }
  }

  /** The companion templates and creatures the sheet's lists offer, for "Add a companion"; null like builderInfo. */
  async companionOptions(): Promise<CompanionTemplate[] | null> {
    const open = this.current;
    await this.running;
    if (!open || this.current !== open || readOnly(open.status)) return null;
    try {
      return await this.client.companionOptions();
    } catch (err) {
      this.note('error', this.explain(err));
      return null;
    }
  }

  /** The creatures MPMB's "Add Wild Shape" menu offers, for "Add a Wild Shape form"; null like builderInfo. */
  async wildShapeOptions(): Promise<Beast[] | null> {
    const open = this.current;
    await this.running;
    if (!open || this.current !== open || readOnly(open.status)) return null;
    try {
      return await this.client.wildShapeOptions();
    } catch (err) {
      this.note('error', this.explain(err));
      return null;
    }
  }

  /** What MPMB's spell dialogs offer and hold, for the Spells step; null like builderInfo. */
  async spellsInfo(): Promise<SpellsInfo | null> {
    const open = this.current;
    await this.running;
    if (!open || this.current !== open || readOnly(open.status)) return null;
    try {
      return await this.client.spells();
    } catch (err) {
      this.note('error', this.explain(err));
      return null;
    }
  }

  /** The open sheet's add-on scripts with their code, for the "Add-on scripts" window; null like builderInfo. */
  async scriptFiles(): Promise<ScriptFiles | null> {
    const open = this.current;
    await this.running;
    if (!open || this.current !== open || readOnly(open.status)) return null;
    try {
      return await this.client.scriptFiles();
    } catch (err) {
      this.note('error', this.explain(err));
      return null;
    }
  }

  /**
   * The script files the other characters in this browser carry, each script once (by its iFileName),
   * the last changed character's version first. Read from their saved sheets as data; nothing of theirs
   * runs until the player adds it here.
   */
  async otherScripts(): Promise<OtherScript[]> {
    const store = this.store;
    const open = this.current;
    if (!store || !open) return [];
    const others = this.characters.filter((meta) => meta.id !== open.meta.id && meta.addOns.files.length > 0);
    // One character that can't be read (or holds a script too large to parse) leaves out only its scripts.
    const stored = await Promise.all(others.map((meta) => store.get(meta.id).catch(() => undefined)));
    const all = stored.flatMap((character) =>
      character
        ? parseScriptFiles(String(character.data.fields[SCRIPT_FILES_FIELD]?.value ?? '')).map((file) => ({
            ...file,
            owner: character.meta.name || this.t.unnamed,
          }))
        : [],
    );
    // Files without an iFileName can't be told apart from a version of another; they're kept by their key.
    const seen = new Set<string>();
    return all.filter((file) => {
      const id = scriptName(file.text)?.toLowerCase() ?? file.key;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  /**
   * Removes and adds script files through MPMB's own files dialog (see the worker's setScripts). `quiet`
   * for a file the app writes itself (own spells): MPMB's note and its Source Selection don't come up.
   */
  setScripts(changes: ScriptChanges, quiet = false): Promise<void> {
    return this.work(() => this.client.setScripts(changes, quiet));
  }

  /** Opens MPMB's own dialog for pasted code, which the player fills in. */
  pasteScript(): Promise<void> {
    return this.work(() => this.client.pasteScript());
  }

  /**
   * Puts a picture file on the open sheet as its portrait or symbol (scaled down first), or takes the
   * picture off (null). False when the browser can't read the file; nothing changes then.
   */
  async setImage(slot: ImageSlot, file: Blob | null): Promise<boolean> {
    let image: SheetImage | null = null;
    if (file) {
      try {
        image = await fitPicture(file);
      } catch {
        return false;
      }
    }
    const open = this.current;
    if (!open) return false;
    // In line, not work(): a tap on "Remove" right after typing in a box comes while that box's change
    // is still saving, and work() would drop it.
    await this.inLine(async () => {
      await this.client.setImage(slot, image);
      const { [slot]: _old, ...others } = open.images;
      open.images = image ? { ...others, [slot]: image } : others;
      this.dirty = true;
    });
    return true;
  }

  /** One piece of work on the open sheet that isn't a play view change (a menu entry, the units); saved after. */
  private work(job: () => Promise<unknown>): Promise<void> {
    const open = this.current;
    if (!open || open.status === 'opening' || open.status === 'working' || open.status === 'elsewhere')
      return this.running;
    this.clearNotes();
    open.status = 'working';
    const run = async (): Promise<void> => {
      try {
        await this.followingMaxHp(job);
        await this.saveOpen();
      } catch (err) {
        open.status = 'error';
        this.failed(err);
      }
    };
    this.running = run();
    return this.running;
  }

  /**
   * Runs a change on the open sheet; when it changed the maximum hit points (a level, Constitution, a feat),
   * MPMB's "current maximum" box moves along (see followMaxHp). Here rather than in the level-up buttons:
   * MPMB raises the maximum from many places, and every one of them would leave the box behind.
   * Attack rows' boxes the player set by hand come back the same way when MPMB set them again (a new
   * level recalculates the weapons); `own` names the fields the change wrote itself, which stay.
   */
  private async followingMaxHp(job: () => Promise<unknown>, own: Set<string> = new Set()): Promise<void> {
    const before = { ...this.client.fields };
    await job();
    for (const [name, text] of Object.entries(followMaxHp(before, this.client.fields)))
      await this.client.edit(name, text);
    const choices = readChoices(this.current?.meta.homebrew?.attackChoices);
    for (const step of keepChoices(before, this.client.fields, choices, own)) {
      if ('edit' in step) await this.client.edit(step.edit, step.text);
      else await this.client.click(step.click);
    }
  }

  /**
   * Makes the play view's changes, in order, through MPMB's own field events, and saves after. Taps
   * that come quickly queue up behind each other instead of being dropped like a second menu click.
   */
  change(steps: Step[]): Promise<void> {
    const open = this.current;
    if (!open || readOnly(open.status) || steps.length === 0) return this.running;
    const id = this.nextChange++;
    const next = expected(open.fields, steps);
    steps.forEach((step) => {
      const name = 'edit' in step ? step.edit : step.click;
      const view = next[name];
      if (view) this.waiting.set(name, { value: view.value, change: id });
    });
    open.fields = next;
    const make = async (): Promise<void> => {
      // One after the other: each step's field events may change what the next one finds.
      for (const step of steps) {
        if ('edit' in step) await this.client.edit(step.edit, step.text, step.cancelable);
        else await this.popUps.titled(step.menuTitle, () => this.client.click(step.click, 0, step.shift, step.newRow));
      }
      this.waiting.forEach((wait, name) => {
        if (wait.change === id) this.waiting.delete(name);
      });
    };
    const own = new Set(steps.map((step) => ('edit' in step ? step.edit : step.click)));
    return this.queue(open, make, () => this.waiting.clear(), own);
  }

  /**
   * The worker's fields with the values of changes still waiting in line on top. Without them the
   * worker's update after the first of several quick taps would show the old count again, and the
   * next tap would count from there. Waiting values are absolute (a click is stored as the value it
   * leads to), so laying them over a field the worker already changed does no harm.
   */
  private shownFields(): FieldViews {
    const fields = { ...this.client.fields };
    this.waiting.forEach(({ value }, name) => {
      const view = fields[name];
      if (view) fields[name] = { ...view, value, text: undefined };
    });
    return fields;
  }

  private async saveOpen(): Promise<void> {
    const open = this.current;
    if (!open) return;
    // Another tab took the character over: its saves count from now on, not this tab's.
    if (!this.tabLock.holds(open.meta.id)) return;
    if (!this.dirty) {
      open.status = 'saved';
      return;
    }
    open.status = 'saving';
    const data = await this.client.save();
    // Asked each time: "Add Extra Materials" in the Sheet menu adds and removes scripts in the open sheet.
    const addOns = await this.client.addOns();
    const meta = describeCharacter(data, addOns, open.meta);
    // Asked again: another tab may have taken the character over while the engine was busy. That tab has
    // read the character already, and a write now would leave it showing an older one than is saved.
    if (!this.tabLock.holds(open.meta.id)) return;
    await this.save({ meta, data });
    this.dirty = false;
    // A tap on the ult charges while this save ran is newer than `meta`; its own write came after this one.
    open.meta = open.meta.homebrew ? { ...meta, homebrew: copyHomebrew(open.meta.homebrew) } : meta;
    open.status = 'saved';
    await this.refresh();
  }

  // ---- Delete, back up, restore ----

  async remove(meta: CharacterMeta): Promise<void> {
    const answer = await this.popUps.choose({
      title: this.t.deleteTitle,
      message: fill(this.t.deleteConfirm, { name: meta.name || this.t.unnamed }),
      buttons: [
        { value: 'cancel', label: this.t.cancel },
        { value: 'delete', label: this.t.delete, danger: true },
      ],
      cancel: 'cancel',
    });
    if (answer !== 'delete') return;
    // The other tab would save it again with its next change.
    if ((await this.tabLock.openElsewhere([meta.id])).length) {
      this.note('error', fill(this.t.deleteOpenElsewhere, { name: meta.name || this.t.unnamed }));
      return;
    }
    await this.store?.delete(meta.id);
    await this.refresh();
  }

  /**
   * Asks before the Build screen removes a class: MPMB takes its features away at once, and adding the
   * class again doesn't bring back the choices made for it (nor its place as the first class).
   */
  async confirmRemoveClass(name: string, first: boolean): Promise<boolean> {
    const answer = await this.popUps.choose({
      title: fill(this.t.buildRemoveTitle, { name }),
      message: this.t.buildRemoveConfirm,
      lines: first ? [this.t.buildRemoveFirst] : [],
      buttons: [
        { value: 'cancel', label: this.t.cancel },
        { value: 'remove', label: this.t.buildRemove, danger: true },
      ],
      cancel: 'cancel',
    });
    return answer === 'remove';
  }

  /** Downloads a backup of these characters (all when no ids are given). */
  async backUp(ids?: string[]): Promise<void> {
    if (!this.store) return;
    const store = this.store;
    const wanted = ids ?? this.characters.map((c) => c.id);
    // The open character as saved after its last change (the Sheet menu's backup comes during play).
    if (this.current && wanted.includes(this.current.meta.id)) await this.running;
    const found = await Promise.all(wanted.map((id) => store.get(id)));
    const characters = found.filter((c): c is StoredCharacter => c !== undefined);
    if (!characters.length) return;
    const backup = makeBackup(characters, SHEET_ID);
    download(new Blob([JSON.stringify(backup)], { type: 'application/json' }), backupFileName(characters));
    await this.markBackedUp(characters, backup.created);
  }

  /**
   * Notes the backup in each character's list entry, for the start page's reminder (finding 1). Not a
   * change: `updated` stays, and so does the list's order.
   */
  private async markBackedUp(characters: StoredCharacter[], date: string): Promise<void> {
    const store = this.store;
    if (!store) return;
    await Promise.all(characters.map(({ meta }) => store.putMeta({ ...meta, lastBackup: date })));
    const open = this.current;
    if (open && characters.some(({ meta }) => meta.id === open.meta.id)) open.meta = { ...open.meta, lastBackup: date };
    await this.refresh();
  }

  /**
   * The open character written into the player's own copy of MPMB's sheet (M10), after the work before
   * it; returns the filled PDF and its file name, or throws an Error whose message the window shows.
   */
  async fillPdf(file: File): Promise<{ pdf: Blob; name: string }> {
    const open = this.current;
    await this.running;
    if (!open || this.current !== open || readOnly(open.status)) throw new Error(this.t.fillPdfNoSheet);
    try {
      const { result } = await this.client.exportPdf(await file.arrayBuffer());
      return {
        pdf: new Blob([result as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
        name: filledPdfName(open.meta.name),
      };
    } catch (err) {
      throw new Error(err instanceof EngineError && !err.code ? err.message : this.explain(err));
    }
  }

  /** Saves a file to the player's downloads. */
  download(file: Blob, name: string): void {
    download(file, name);
  }

  async restore(file: File): Promise<void> {
    // Before the plan: it compares the backup with the characters saved here, listed once storage is open.
    await this.started;
    this.clearNotes();
    try {
      const backup = readBackup(await file.text(), SHEET_ID, keptVersions());
      const plan = planRestore(backup, this.characters);
      // Date and time to the minute: the seconds made it read like a log (UI review 2, finding 10).
      const date = new Date(backup.created).toLocaleString(this.t.locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const answer = await this.popUps.choose({
        title: this.t.restoreTitle,
        message: fill(this.t.restoreFrom, { date }),
        lines: restoreLines(plan, this.t),
        buttons: [
          { value: 'cancel', label: this.t.cancel },
          { value: 'restore', label: this.t.restoreButton, primary: true },
        ],
        cancel: 'cancel',
      });
      if (answer !== 'restore') return;
      // The other tab would overwrite a restored character with its next change.
      const elsewhere = await this.tabLock.openElsewhere(backup.characters.map((c) => c.meta.id));
      if (elsewhere.length) {
        const names = backup.characters
          .filter((c) => elsewhere.includes(c.meta.id))
          .map((c) => c.meta.name || this.t.unnamed);
        this.note('error', fill(this.t.restoreOpenElsewhere, { names: names.join(', ') }));
        return;
      }
      // The characters the backup replaces here, kept as they were, so a restore can be rolled back.
      for (const { meta } of backup.characters) {
        const here = await this.store?.get(meta.id);
        if (here) await this.keepPoint(here, 'restore');
      }
      // The file is a backup of them: no reminder until they change again.
      await this.save(...backup.characters.map((c) => ({ ...c, meta: { ...c.meta, lastBackup: backup.created } })));
      await this.refresh();
      this.note('ok', counted(this.t.restoredOne, this.t.restored, backup.characters.length));
    } catch (err) {
      this.note('error', backupFailureText(err, this.t));
    }
  }
}

/** How long a download's address stays valid. */
const REVOKE_AFTER_MS = 60_000;

function download(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The download has started from the link; the address can go once the browser took it.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
