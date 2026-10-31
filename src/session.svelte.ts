// What the app does with characters: import PDFs, keep them in the browser, open one, back up and
// restore. The views call these methods and draw the state; the engine runs in the worker behind
// EngineClient, and its pop-ups go to the PopUpStack.
import type { AddOns } from './engine/add-ons.ts';
import type { BuilderInfo, UnitSystem } from './engine/builder.ts';
import type { ScoreChange } from './engine/scores.ts';
import type { CharacterData } from './engine/sheet-data.ts';
import { SHEET_ID } from './engine/sheet-id.ts';
import { FF } from './engine/types.ts';
import type { Texts } from './i18n.ts';
import { counted, fill } from './i18n.ts';
import { PopUpStack } from './popups/popups.svelte.ts';
import { BackupError, backupFileName, makeBackup, planRestore, readBackup } from './store/backup.ts';
import { CharacterStore, describeCharacter, keepStorage } from './store/characters.ts';
import type { CharacterMeta, StoredCharacter } from './store/characters.ts';
import { EngineClient, EngineError } from './worker/client.ts';
import { newEngineWorker } from './worker/start.ts';
import type { FieldViews } from './worker/views.ts';
import type { MenuNode } from './worker/protocol.ts';

/** A line under the list: what an import or restore did. */
export interface Note {
  id: number;
  kind: 'busy' | 'ok' | 'error';
  text: string;
}

export interface OpenCharacter {
  meta: CharacterMeta;
  /** The fields as the engine shows them (value and Format text). */
  fields: FieldViews;
  menu: MenuNode[];
  status: 'opening' | 'working' | 'saving' | 'saved' | 'error';
}

/** One change the play view makes on the sheet: type into a field, or click a check box. */
export type Step = { edit: string; text: string } | { click: string };

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
    if (!view || ('click' in step && view.flags & FF.pushButton)) return;
    // A click toggles a check box between "Off" and the value its widget has when on.
    const on = view.widgets[0]?.on ?? 'Yes';
    const value = 'edit' in step ? step.text : view.value === 'Off' || view.value === '' ? on : 'Off';
    next[name] = { ...view, value, text: undefined };
  });
  return next;
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

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
  readonly client = new EngineClient(this.popUps, newEngineWorker);
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

  constructor(private readonly texts: () => Texts) {
    this.client.onFields = () => {
      this.dirty = true;
      if (this.current) this.current.fields = this.shownFields();
    };
    this.client.onMenu = (menu) => {
      if (this.current) this.current.menu = menu;
    };
  }

  private get t(): Texts {
    return this.texts();
  }

  async start(): Promise<void> {
    try {
      this.store = await CharacterStore.open();
      await this.refresh();
    } catch (err) {
      this.storageError = errorText(err);
    }
  }

  private async refresh(): Promise<void> {
    this.characters = (await this.store?.list()) ?? [];
  }

  private note(kind: Note['kind'], text: string, replacing?: number): number {
    const id = replacing ?? this.nextNote++;
    const note = { id, kind, text };
    this.notes = replacing ? this.notes.map((n) => (n.id === id ? note : n)) : [...this.notes, note];
    return id;
  }

  /** Clears the notes of finished work; an import still running keeps its line. */
  clearNotes(): void {
    this.notes = this.notes.filter((n) => n.kind === 'busy');
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
      const opened = await this.client.importPdf(await file.arrayBuffer());
      const data = await this.client.save();
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
      this.note(
        'ok',
        count
          ? counted(this.t.importedAddOnsOne, this.t.importedAddOns, count, { name })
          : fill(this.t.imported, { name }),
        busy,
      );
    } catch (err) {
      this.note('error', fill(this.t.importFailed, { file: file.name, reason: this.explain(err) }), busy);
    } finally {
      this.client.close();
    }
  }

  /**
   * A character with the same name is probably the same one, imported again from a newer PDF (its
   * classes may have changed with a level): the player decides whether the import replaces it (keeping
   * its id and creation date).
   */
  private async sameAs(data: CharacterData, addOns: AddOns): Promise<CharacterMeta | null | 'cancel'> {
    const fresh = describeCharacter(data, addOns, null);
    const same = this.characters.filter((c) => c.name !== '' && c.name === fresh.name)[0];
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
    if (err instanceof EngineError && err.code === 'unreadable-pdf') return this.t.unreadablePdf;
    if (err instanceof EngineError && err.code === 'wrong-sheet') {
      const found = err.detail ? fill(this.t.wrongSheetFound, { what: err.detail }) : '';
      return fill(this.t.wrongSheet, { version: SHEET_ID.version, found });
    }
    if (err instanceof EngineError) return fill(this.t.engineFailed, { reason: err.message });
    return fill(this.t.storageFailed, { reason: errorText(err) });
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

  async open(id: string): Promise<boolean> {
    this.clearNotes();
    const stored = await this.store?.get(id);
    if (!stored) return false;
    this.waiting.clear();
    this.current = { meta: stored.meta, fields: {}, menu: [], status: 'opening' };
    try {
      await this.client.open(stored.data);
      this.dirty = false;
      if (this.current?.meta.id === id) {
        this.current.fields = { ...this.client.fields };
        this.current.menu = this.client.menu;
        this.current.status = 'saved';
      }
    } catch (err) {
      if (this.current?.meta.id === id) this.current.status = 'error';
      this.note('error', this.explain(err));
    }
    return true;
  }

  /** Leaves the open character, after the last action on it is saved. */
  async close(): Promise<void> {
    await this.running;
    this.client.close();
    this.current = null;
    this.clearNotes();
  }

  /** Clicks one of MPMB's bookmarks; what the scripts change is saved right after. */
  runMenu(path: string[]): Promise<void> {
    return this.work(() => this.client.bookmark(path));
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
    const open = this.current;
    if (!open || open.status === 'opening' || open.status === 'error' || changes.length === 0) return this.running;
    this.running = this.running
      .then(async () => {
        if (this.current !== open) return;
        open.status = 'working';
        await this.client.scores(changes);
        open.fields = this.shownFields();
        await this.saveOpen();
      })
      .catch((err: unknown) => {
        open.status = 'error';
        this.note('error', this.explain(err));
      });
    return this.running;
  }

  /**
   * What the Build screen offers and shows, read from the open sheet after the work before it (a change
   * in line may add a class); null without an open character or when the sheet failed.
   */
  async builderInfo(): Promise<BuilderInfo | null> {
    const open = this.current;
    await this.running;
    if (!open || this.current !== open || open.status === 'error') return null;
    try {
      return await this.client.builder();
    } catch (err) {
      this.note('error', this.explain(err));
      return null;
    }
  }

  /** One piece of work on the open sheet that isn't a play view change (a menu entry, the units); saved after. */
  private work(job: () => Promise<unknown>): Promise<void> {
    const open = this.current;
    if (!open || open.status === 'opening' || open.status === 'working') return this.running;
    this.clearNotes();
    open.status = 'working';
    this.running = job()
      .then(() => this.saveOpen())
      .catch((err: unknown) => {
        open.status = 'error';
        this.note('error', this.explain(err));
      });
    return this.running;
  }

  /**
   * Makes the play view's changes, in order, through MPMB's own field events, and saves after. Taps
   * that come quickly queue up behind each other instead of being dropped like a second menu click.
   */
  change(steps: Step[]): Promise<void> {
    const open = this.current;
    if (!open || open.status === 'opening' || open.status === 'error' || steps.length === 0) return this.running;
    const id = this.nextChange++;
    const next = expected(open.fields, steps);
    steps.forEach((step) => {
      const name = 'edit' in step ? step.edit : step.click;
      const view = next[name];
      if (view) this.waiting.set(name, { value: view.value, change: id });
    });
    open.fields = next;
    this.running = this.running
      .then(async () => {
        if (this.current !== open) return;
        open.status = 'working';
        await steps.reduce<Promise<unknown>>(
          (previous, step) =>
            previous.then(() =>
              'edit' in step ? this.client.edit(step.edit, step.text) : this.client.click(step.click),
            ),
          Promise.resolve(),
        );
        this.waiting.forEach((wait, name) => {
          if (wait.change === id) this.waiting.delete(name);
        });
        open.fields = this.shownFields();
        await this.saveOpen();
      })
      .catch((err: unknown) => {
        this.waiting.clear();
        open.status = 'error';
        this.note('error', this.explain(err));
      });
    return this.running;
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
    if (!this.dirty) {
      open.status = 'saved';
      return;
    }
    open.status = 'saving';
    const data = await this.client.save();
    const meta = describeCharacter(data, open.meta.addOns, open.meta);
    await this.save({ meta, data });
    this.dirty = false;
    open.meta = meta;
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
    const found = await Promise.all(wanted.map((id) => store.get(id)));
    const characters = found.filter((c): c is StoredCharacter => c !== undefined);
    if (!characters.length) return;
    const backup = makeBackup(characters, SHEET_ID);
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName(characters);
    link.click();
    // The download has started from the link; the address can go once the browser took it.
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  }

  async restore(file: File): Promise<void> {
    this.clearNotes();
    try {
      const backup = readBackup(await file.text(), SHEET_ID);
      const plan = planRestore(backup, this.characters);
      const date = new Date(backup.created).toLocaleString(document.documentElement.lang || undefined);
      const answer = await this.popUps.choose({
        title: this.t.restoreTitle,
        message: fill(this.t.restoreFrom, { date }),
        lines: plan.map(({ character, replaces, older }) => {
          const name = character.meta.name || this.t.unnamed;
          if (older) return fill(this.t.restoreOlder, { name });
          return fill(replaces ? this.t.restoreReplaces : this.t.restoreNew, { name });
        }),
        buttons: [
          { value: 'cancel', label: this.t.cancel },
          { value: 'restore', label: this.t.restoreButton, primary: true },
        ],
        cancel: 'cancel',
      });
      if (answer !== 'restore') return;
      await this.save(...backup.characters);
      await this.refresh();
      this.note('ok', counted(this.t.restoredOne, this.t.restored, backup.characters.length));
    } catch (err) {
      this.note('error', this.explainBackup(err));
    }
  }

  private explainBackup(err: unknown): string {
    if (!(err instanceof BackupError)) return fill(this.t.storageFailed, { reason: errorText(err) });
    if (err.problem === 'newer-backup') return this.t.newerBackup;
    if (err.problem === 'wrong-sheet')
      return fill(this.t.wrongSheetBackup, { what: err.detail, version: `${SHEET_ID.type} v${SHEET_ID.version}` });
    return this.t.notABackup;
  }
}

/** How long a backup's download address stays valid. */
const REVOKE_AFTER_MS = 60_000;
