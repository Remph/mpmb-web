// What the app does with characters: import PDFs, keep them in the browser, open one, back up and
// restore. The views call these methods and draw the state; the engine runs in the worker behind
// EngineClient, and its pop-ups go to the PopUpStack.
import type { AddOns, ScriptChanges, ScriptFile, ScriptFiles } from './engine/add-ons.ts';
import { parseScriptFiles, scriptName } from './build/add-ons.ts';
import type { BuilderInfo, UnitSystem } from './engine/builder.ts';
import type { ScoreChange } from './engine/scores.ts';
import type { SpellPicks, SpellSheetPicks, SpellsInfo } from './engine/spells.ts';
import { sheetChanges } from './engine/sheet-changes.ts';
import type { FieldValues } from './engine/sheet-changes.ts';
import type { CharacterData } from './engine/sheet-data.ts';
import { SHEET_ID } from './engine/sheet-id.ts';
import type { SheetPack } from './engine/sheet-pack.ts';
import { keptVersions, loadSheetPack } from './sheet-versions.ts';
import { FF } from './engine/types.ts';
import type { ImageSlot, SheetImage, SheetImages } from './engine/types.ts';
import { fitImages, fitPicture } from './play/pictures.ts';
import type { Texts } from './i18n.ts';
import { counted, fill } from './i18n.ts';
import { PopUpStack } from './popups/popups.svelte.ts';
import { BackupError, backupFileName, filledPdfName, makeBackup, planRestore, readBackup } from './store/backup.ts';
import { CharacterStore, copyHomebrew, describeCharacter, keepStorage } from './store/characters.ts';
import type { UltCharges } from './homebrew/ult.ts';
import type { CharacterMeta, PreviousVersion, StoredCharacter } from './store/characters.ts';
import { EngineClient, EngineError } from './worker/client.ts';
import type { Done, PopUps } from './worker/client.ts';
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
  kind: 'busy' | 'ok' | 'error';
  text: string;
}

export interface OpenCharacter {
  meta: CharacterMeta;
  /** The fields as the engine shows them (value and Format text). */
  fields: FieldViews;
  menu: MenuNode[];
  status: 'opening' | 'working' | 'saving' | 'saved' | 'error';
  /** The portrait and organisation symbol (M8). */
  images: SheetImages;
}

/**
 * One change the play view makes on the sheet: type into a field, or click a check box or button
 * (`shift`: with Shift held, which opens a spell row's own menu in MPMB; `newRow`: a spell level's "+ Row"
 * there, see newSpellRow in engine/spells.ts).
 */
export type Step =
  | { edit: string; text: string }
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

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Why an update failed although every command worked: MPMB's import stopped after its own pop-up. */
class UpdateStopped extends Error {}

/** An update stopped because the player left the character (or opened another) while it ran. */
class UpdateLeft extends Error {}

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
    const source = new EngineClient(CLOSED_POP_UPS, newEngineWorker);
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
    if (err instanceof UpdateStopped) return err.message;
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
      this.note('error', this.explain(err));
    }
    return true;
  }

  /**
   * Opens a character saved on an older sheet version that the app keeps: updated onto the current sheet
   * and saved, with the copy from before kept (Nick, 2026-11-04). Without shared memory, or when the
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
  async setUlt(ult: UltCharges): Promise<void> {
    const open = this.current;
    if (!open || !this.store) return;
    open.meta = { ...open.meta, homebrew: { ...open.meta.homebrew, ult: { ...ult } } };
    await this.store.putMeta($state.snapshot(open.meta));
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
    this.current = null;
    this.clearNotes();
  }

  /**
   * Clicks one of MPMB's bookmarks; what the scripts change is saved right after. The title names a menu of
   * MPMB's that the bookmark opens.
   */
  runMenu(path: string[], menuTitle?: string): Promise<void> {
    return this.work(() => this.popUps.titled(menuTitle, () => this.client.bookmark(path)));
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
    if (!open || open.status === 'opening' || open.status === 'error') return this.running;
    this.running = this.running
      .then(async () => {
        if (this.current !== open) return;
        open.status = 'working';
        await job();
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

  /** What MPMB's spell dialogs offer and hold, for the Spells step; null like builderInfo. */
  async spellsInfo(): Promise<SpellsInfo | null> {
    const open = this.current;
    await this.running;
    if (!open || this.current !== open || open.status === 'error') return null;
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
    if (!open || this.current !== open || open.status === 'error') return null;
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

  /** Removes and adds script files through MPMB's own files dialog (see the worker's setScripts). */
  setScripts(changes: ScriptChanges): Promise<void> {
    return this.work(() => this.client.setScripts(changes));
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
              'edit' in step
                ? this.client.edit(step.edit, step.text)
                : this.popUps.titled(step.menuTitle, () => this.client.click(step.click, 0, step.shift, step.newRow)),
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
    // Asked each time: "Add Extra Materials" in the Sheet menu adds and removes scripts in the open sheet.
    const addOns = await this.client.addOns();
    const meta = describeCharacter(data, addOns, open.meta);
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
    download(new Blob([JSON.stringify(backup)], { type: 'application/json' }), backupFileName(characters));
  }

  /**
   * The open character written into the player's own copy of MPMB's sheet (M10), after the work before
   * it; returns the filled PDF and its file name, or throws an Error whose message the window shows.
   */
  async fillPdf(file: File): Promise<{ pdf: Blob; name: string }> {
    const open = this.current;
    await this.running;
    if (!open || this.current !== open || open.status === 'error') throw new Error(this.t.fillPdfNoSheet);
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
