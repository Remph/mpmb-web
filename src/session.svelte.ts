// What the app does with characters: import PDFs, keep them in the browser, open one, back up and
// restore. The views call these methods and draw the state; the engine runs in the worker behind
// EngineClient, and its pop-ups go to the PopUpStack.
import type { AddOns } from './engine/add-ons.ts';
import type { CharacterData } from './engine/sheet-data.ts';
import { SHEET_ID } from './engine/sheet-id.ts';
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

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export class Session {
  readonly popUps = new PopUpStack();
  readonly client = new EngineClient(this.popUps, newEngineWorker);
  characters: CharacterMeta[] = $state([]);
  notes: Note[] = $state([]);
  /** The character on screen, or null for the list. */
  current: OpenCharacter | null = $state(null);
  /** The storage could not be opened (e.g. a private window that forbids it). */
  storageError = $state('');
  private store: CharacterStore | null = null;
  private nextNote = 1;
  /** Whether the open sheet changed since it was saved. */
  private dirty = false;
  /** The last action on the open sheet, with its saving; leaving waits for it. */
  private running: Promise<void> = Promise.resolve();

  constructor(private readonly texts: () => Texts) {
    this.client.onFields = () => {
      this.dirty = true;
      if (this.current) this.current.fields = { ...this.client.fields };
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

  clearNotes(): void {
    this.notes = [];
  }

  // ---- Import ----

  /** Imports each PDF in turn: the worker opens it (running its add-on scripts) and it is saved. */
  async importPdfs(files: File[]): Promise<void> {
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
   * A character with the same name and classes is probably the same one, imported again from a newer
   * PDF: the player decides whether the import replaces it (keeping its place in the list).
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
    // After the first character, ask the browser to keep the data (Firefox asks the player once).
    void keepStorage();
  }

  // ---- One character ----

  async open(id: string): Promise<boolean> {
    this.clearNotes();
    const stored = await this.store?.get(id);
    if (!stored) return false;
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
    const open = this.current;
    if (!open || open.status === 'opening' || open.status === 'working') return this.running;
    this.clearNotes();
    open.status = 'working';
    this.running = this.client
      .bookmark(path)
      .then(() => this.saveOpen())
      .catch((err: unknown) => {
        open.status = 'error';
        this.note('error', this.explain(err));
      });
    return this.running;
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
