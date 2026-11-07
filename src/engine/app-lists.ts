// The app's own additions to MPMB's lists, written in MPMB's list syntax (src/engine/lists/). They run with
// MPMB's document scripts, on every version of the sheet the app opens, and change none of MPMB's files.
import type { SheetScript } from './engine.ts';
import findSteed from './lists/find-steed.js?raw';

/**
 * Acrobat runs document scripts in name order (Engine.load sorts them): "ListsWeb" comes after MPMB's last list
 * file ("ListsSpells") and before "Startup", which fills the lists from their Base_ copies when the sheet opens.
 */
export const appLists: readonly SheetScript[] = [{ name: 'ListsWeb', code: findSteed }];

/** A sheet version's scripts with the app's lists added. */
export const withAppLists = (scripts: readonly SheetScript[]): SheetScript[] => [...scripts, ...appLists];
