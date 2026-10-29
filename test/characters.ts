// The two SRD reference characters (made and saved in Acrobat, see test/characters/README.md) and
// helpers to run the engine on them.
import fs from 'node:fs';
import { Engine } from '../src/engine/engine.ts';
import type { Host } from '../src/engine/host.ts';
import { mpmbScripts } from '../src/engine/scripts.ts';
import type { CharacterData } from '../src/engine/sheet-data.ts';
import { blankSheet, characterSheet } from '../src/engine/sheet.ts';
import { allowTimer } from '../src/engine/startup.ts';
import type { SheetSnapshot } from '../src/engine/types.ts';
import { ScriptedHost } from './hosts.ts';
import { vmRealm } from './vm-realm.ts';

export const REFERENCE_CHARACTERS = ['paladin8-warlock2', 'wizard10-evoker'] as const;
export type ReferenceCharacter = (typeof REFERENCE_CHARACTERS)[number];

/** The sheet as Acrobat saved it. */
export function referenceSheet(name: ReferenceCharacter): SheetSnapshot {
  const data = JSON.parse(
    fs.readFileSync(new URL(`characters/${name}.json`, import.meta.url), 'utf8'),
  ) as CharacterData;
  return characterSheet(data);
}

/**
 * Opens a sheet the way the worker does: load the scripts, let the opening timers the app allows run,
 * then run every Format script for the text each field shows.
 */
export function openSheet(sheet: SheetSnapshot = blankSheet(), host: Host = new ScriptedHost()): Engine {
  const engine = Engine.load({ sheet, scripts: mpmbScripts, host, realm: vmRealm(), allowTimer });
  engine.runTimers();
  engine.doc.formatAll();
  return engine;
}
