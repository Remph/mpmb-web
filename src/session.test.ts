/* eslint-disable ts-patterns/no-magic-numbers -- counts and dates are the test data */
// The session's work on saved characters (import, the same-name question, restore, remove) on a stand-in
// engine worker and a stand-in IndexedDB. The engine's own behaviour is tested elsewhere; here the worker
// only answers the commands the session sends, so the tests are about what gets saved and what the player
// is asked and told.
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ui } from './i18n.ts';
import { CHARACTER_FORMAT, FORMAT_VERSION } from './engine/sheet-data.ts';
import type { CharacterData } from './engine/sheet-data.ts';
import { SHEET_ID } from './engine/sheet-id.ts';
import type { Entry } from './popups/popups.svelte.ts';
import { Session } from './session.svelte.ts';
import { makeBackup } from './store/backup.ts';
import { describeCharacter } from './store/characters.ts';
import type { StoredCharacter } from './store/characters.ts';
import type { WorkerLike } from './worker/client.ts';
import type { Command, FromWorker, ToWorker } from './worker/protocol.ts';

const t = ui.en;
const NO_ADD_ONS = { files: [], manual: false };

const sheetOf = (name: string, classes = 'Wizard 3'): CharacterData => ({
  format: CHARACTER_FORMAT,
  version: FORMAT_VERSION,
  info: { SheetType: SHEET_ID.type, SheetVersion: SHEET_ID.version },
  numPages: 6,
  fields: { 'PC Name': { value: name }, 'Class and Levels': { value: classes } },
});

/** What the stand-in worker answers a command with: a result, or a failure as the real worker reports it. */
type Reply = { result: unknown } | { error: string; code?: 'unreadable-pdf' | 'wrong-sheet' };

/**
 * The engine worker as the session sees it. Every command gets the reply `answer` gives for it; the PDF a
 * test imports decides what `save` returns (the character in that PDF).
 */
class StandInWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor(private readonly answer: (command: Command) => Reply) {}

  postMessage(message: ToWorker): void {
    if (message.type !== 'command') return;
    const reply = this.answer(message.command);
    const { id } = message;
    // Asynchronous, like a real worker.
    queueMicrotask(() => {
      const data: FromWorker =
        'result' in reply
          ? { type: 'done', id, result: reply.result, summary: { errors: 0, missing: {} } }
          : { type: 'failed', id, error: reply.error, ...(reply.code ? { code: reply.code } : {}) };
      this.onmessage?.({ data } as MessageEvent<FromWorker>);
    });
  }

  terminate(): void {
    this.onmessage = null;
  }
}

/** A session on a fresh stand-in database; an imported "PDF" is the character's JSON. */
async function startSession(): Promise<Session> {
  vi.stubGlobal('indexedDB', new IDBFactory());
  let opened: CharacterData | null = null;
  const answer = (command: Command): Reply => {
    if (command.type === 'importPdf') {
      const text = new TextDecoder().decode(command.bytes);
      if (text === 'not a pdf') return { error: 'Invalid PDF structure', code: 'unreadable-pdf' };
      opened = JSON.parse(text) as CharacterData;
      return { result: { addOns: NO_ADD_ONS } };
    }
    if (command.type === 'open') {
      if (command.character?.fields['PC Name']?.value === 'Broken') return { error: 'MPMB threw' };
      opened = command.character ?? sheetOf('');
      return { result: { addOns: NO_ADD_ONS } };
    }
    if (command.type === 'save') return { result: structuredClone(opened) };
    return { error: `no stand-in for ${command.type}` };
  };
  const session = new Session(
    () => t,
    () => new StandInWorker(answer),
  );
  await session.start();
  return session;
}

const pdf = (data: CharacterData | string, name = 'sheet.pdf'): File =>
  new File([typeof data === 'string' ? data : JSON.stringify(data)], name, { type: 'application/pdf' });

/** Waits for the session's question and answers it like the player; returns the question. */
async function answer(session: Session, value: string): Promise<Extract<Entry, { kind: 'choice' }>> {
  const asked = await vi.waitFor(() => {
    const entry = session.popUps.entries.find((e) => e.kind === 'choice');
    if (!entry || entry.kind !== 'choice') throw new Error('no question yet');
    return entry;
  });
  session.popUps.answerChoice(asked.id, value);
  return asked;
}

const names = (session: Session): string[] => session.characters.map((c) => c.name).sort();

beforeEach(() => {
  // No shared memory in these tests: pop-ups of the sheet can't wait, as in a page without the headers.
  vi.stubGlobal('crossOriginIsolated', false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('importing PDFs', () => {
  test('saves each character and says so', async () => {
    const session = await startSession();
    await session.importPdfs([pdf(sheetOf('Anna')), pdf(sheetOf('Bert'))]);
    expect(names(session)).toEqual(['Anna', 'Bert']);
    expect(session.notes.map((n) => [n.kind, n.text])).toEqual([
      ['ok', t.imported.replace('{name}', 'Anna')],
      ['ok', t.imported.replace('{name}', 'Bert')],
    ]);
  });

  test('a PDF that is not readable is named in the note and saves nothing', async () => {
    const session = await startSession();
    await session.importPdfs([pdf('not a pdf', 'notes.txt.pdf')]);
    expect(session.characters).toEqual([]);
    expect(session.notes).toMatchObject([
      { kind: 'error', text: t.importFailed.replace('{file}', 'notes.txt.pdf').replace('{reason}', t.unreadablePdf) },
    ]);
  });

  test('a character with the same name: "Replace" keeps its place (id and creation date)', async () => {
    const session = await startSession();
    await session.importPdfs([pdf(sheetOf('Anna', 'Wizard 3'))]);
    const [first] = session.characters;
    const again = session.importPdfs([pdf(sheetOf('Anna', 'Wizard 4'))]);
    const asked = await answer(session, 'replace');
    await again;
    expect(asked.choice.message).toContain('Anna');
    expect(session.characters).toHaveLength(1);
    expect(session.characters[0]).toMatchObject({ id: first?.id, created: first?.created, classes: 'Wizard 4' });
  });

  test('a character with the same name: "Keep both" adds it, "Cancel" adds nothing', async () => {
    const session = await startSession();
    await session.importPdfs([pdf(sheetOf('Anna'))]);
    const both = session.importPdfs([pdf(sheetOf('Anna', 'Wizard 4'))]);
    await answer(session, 'both');
    await both;
    expect(names(session)).toEqual(['Anna', 'Anna']);

    const cancelled = session.importPdfs([pdf(sheetOf('Anna', 'Wizard 5'))]);
    await answer(session, 'cancel');
    await cancelled;
    expect(session.characters.map((c) => c.classes).sort()).toEqual(['Wizard 3', 'Wizard 4']);
    // The cancelled import leaves no line behind (not even "reading …").
    expect(session.notes).toEqual([]);
  });
});

describe('restoring a backup', () => {
  const stored = (name: string, id: string, updated: string): StoredCharacter => {
    const data = sheetOf(name);
    return { meta: describeCharacter(data, NO_ADD_ONS, { id, created: updated }, new Date(updated)), data };
  };
  const backupFile = (characters: StoredCharacter[]): File =>
    new File([JSON.stringify(makeBackup(characters, SHEET_ID))], 'backup.json', { type: 'application/json' });

  test('asks first, listing what each character does, then saves them all', async () => {
    const session = await startSession();
    await session.importPdfs([pdf(sheetOf('Anna'))]);
    const anna = session.characters[0];
    if (!anna) throw new Error('Anna was not imported');
    // An older copy of Anna (same id) and a new character.
    const file = backupFile([
      stored('Anna', anna.id, '2026-01-01T00:00:00.000Z'),
      stored('Cora', 'cora', '2026-01-02T00:00:00.000Z'),
    ]);
    const restoring = session.restore(file);
    const asked = await answer(session, 'restore');
    await restoring;
    expect(asked.choice.lines).toEqual([
      t.restoreOlder.replace('{name}', 'Anna'),
      t.restoreNew.replace('{name}', 'Cora'),
    ]);
    expect(names(session)).toEqual(['Anna', 'Cora']);
    expect(session.characters.find((c) => c.id === anna.id)?.updated).toBe('2026-01-01T00:00:00.000Z');
    expect(session.notes).toMatchObject([{ kind: 'ok' }]);
  });

  test('"Cancel" changes nothing', async () => {
    const session = await startSession();
    const restoring = session.restore(backupFile([stored('Cora', 'cora', '2026-01-02T00:00:00.000Z')]));
    await answer(session, 'cancel');
    await restoring;
    expect(session.characters).toEqual([]);
  });

  test('a file that is not a backup says so and saves nothing', async () => {
    const session = await startSession();
    await session.restore(new File(['{"hello": 1}'], 'other.json'));
    expect(session.characters).toEqual([]);
    expect(session.notes).toMatchObject([{ kind: 'error', text: t.notABackup }]);
  });
});

describe('removing a character', () => {
  test('only after the player confirms', async () => {
    const session = await startSession();
    await session.importPdfs([pdf(sheetOf('Anna')), pdf(sheetOf('Bert'))]);
    const anna = session.characters.find((c) => c.name === 'Anna');
    if (!anna) throw new Error('Anna was not imported');

    const kept = session.remove(anna);
    await answer(session, 'cancel');
    await kept;
    expect(names(session)).toEqual(['Anna', 'Bert']);

    const removed = session.remove(anna);
    await answer(session, 'delete');
    await removed;
    expect(names(session)).toEqual(['Bert']);
  });
});

describe('a new character', () => {
  test('is saved on the blank sheet at once and gets an id', async () => {
    const session = await startSession();
    const id = await session.create();
    expect(id).not.toBeNull();
    expect(session.characters.map((c) => c.id)).toEqual([id]);
  });
});

describe('opening a character', () => {
  test('opens its saved sheet in the engine', async () => {
    const session = await startSession();
    await session.importPdfs([pdf(sheetOf('Anna'))]);
    const anna = session.characters[0];
    if (!anna) throw new Error('Anna was not imported');
    expect(await session.open(anna.id)).toBe(true);
    expect(session.current).toMatchObject({ meta: { id: anna.id, name: 'Anna' }, status: 'saved' });
  });

  test("a sheet the engine can't open shows as failed, with the reason", async () => {
    const session = await startSession();
    await session.importPdfs([pdf(sheetOf('Broken'))]);
    const broken = session.characters[0];
    if (!broken) throw new Error('Broken was not imported');
    await session.open(broken.id);
    expect(session.current?.status).toBe('error');
    expect(session.notes).toMatchObject([{ kind: 'error', text: t.engineFailed.replace('{reason}', 'MPMB threw') }]);
  });

  test('an id that is not saved here opens nothing', async () => {
    const session = await startSession();
    expect(await session.open('gone')).toBe(false);
    expect(session.current).toBeNull();
  });
});
