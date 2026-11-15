// What a sync round does with each character: compares the characters in this browser, what this browser last
// knew of the service (its sync records) and the service's list, and decides per character. Pure, so every case
// has a test (plan.test.ts); sync.svelte.ts carries the steps out.
//
// The rules (decisions.md 2026-11-08 and 2026-11-15): nothing is overwritten without a trace. A character changed
// here and elsewhere since the last sync keeps this browser's copy as a restore point and takes the service's.
// A change wins over a delete from another device, so a delete never loses work.
import type { ServerCharacter } from './api.ts';

/** What this browser knows of a character at the service. */
export interface SyncRecord {
  /** The service's version this browser's copy is based on. */
  version: number;
  /** The `updated` of the copy last sent or received: a different `updated` here means a change not sent yet. */
  pushed: string;
  /** Deleted here, and the service doesn't know yet. */
  deleted?: boolean;
}

/** A character in this browser, as far as the plan needs it. */
export interface LocalCharacter {
  id: string;
  updated: string;
}

export type SyncStep =
  /** New or newer at the service, unchanged here: take the service's copy. */
  | { kind: 'download'; id: string; server: ServerCharacter }
  /** Changed here and at the service: keep this copy as a restore point, then take the service's. */
  | { kind: 'conflict'; id: string; server: ServerCharacter }
  /** Changed here (or new): send it over `version` (0 for a character the service doesn't have). */
  | { kind: 'push'; id: string; version: number }
  /** Deleted at the service, unchanged here: delete it here too. */
  | { kind: 'remove'; id: string }
  /** Deleted here: tell the service, over `version`. */
  | { kind: 'delete'; id: string; version: number }
  /** A record with nothing left to do (a delete both sides know of): drop it. */
  | { kind: 'drop'; id: string }
  /** The same copy here and at the service, without a record (a backup restored on both): note the version. */
  | { kind: 'adopt'; id: string; server: ServerCharacter };

/** Whether this browser's copy has a change the service hasn't had yet. */
export const changedHere = (local: LocalCharacter, record: SyncRecord | undefined): boolean =>
  record?.pushed !== local.updated;

/** The `updated` of the service's copy, from its list entry (its meta is the app's own list entry). */
export const serverUpdated = (server: ServerCharacter): string | undefined => {
  const updated = (server.meta as { updated?: unknown } | null)?.updated;
  return typeof updated === 'string' ? updated : undefined;
};

/**
 * The steps for one sync round. `server` null: push only (between full rounds, after a save; the service's list
 * isn't asked for). `hold`: characters left alone except for pushes (the one open here, while this device edits
 * it: a download would swap the sheet under the player).
 */
export function planSync(
  local: LocalCharacter[],
  records: ReadonlyMap<string, SyncRecord>,
  server: ServerCharacter[] | null,
  hold: ReadonlySet<string> = new Set(),
): SyncStep[] {
  const steps: SyncStep[] = [];
  const here = new Map(local.map((c) => [c.id, c]));
  const there = new Map((server ?? []).map((c) => [c.id, c]));

  records.forEach((record, id) => {
    const found = there.get(id);
    if (!record.deleted) {
      // A record left over from a character gone from both sides.
      if (server && !here.has(id) && (!found || found.deleted)) steps.push({ kind: 'drop', id });
      return;
    }
    if (!server) steps.push({ kind: 'delete', id, version: record.version });
    else if (!found || found.deleted) steps.push({ kind: 'drop', id });
    else if (found.version === record.version) steps.push({ kind: 'delete', id, version: record.version });
    // Changed elsewhere after this browser's copy: the change wins, the character comes back.
    else if (!hold.has(id)) steps.push({ kind: 'download', id, server: found });
  });

  here.forEach((character, id) => {
    const record = records.get(id);
    const changed = changedHere(character, record);
    if (!server) {
      if (changed) steps.push({ kind: 'push', id, version: record?.version ?? 0 });
      return;
    }
    const found = there.get(id);
    // Not at the service (new here, or its row is gone): it starts there with this copy.
    if (!found) {
      steps.push({ kind: 'push', id, version: 0 });
      return;
    }
    if (found.deleted) {
      // Changed here: the change wins over the delete and brings it back (a save over the deleted row).
      steps.push(changed ? { kind: 'push', id, version: found.version } : { kind: 'remove', id });
      return;
    }
    if (!record) {
      // Known here and there without this browser having synced it: the same copy, or two that went apart.
      if (serverUpdated(found) === character.updated) steps.push({ kind: 'adopt', id, server: found });
      else if (!hold.has(id)) steps.push({ kind: 'conflict', id, server: found });
      return;
    }
    if (record.version === found.version) {
      if (changed) steps.push({ kind: 'push', id, version: found.version });
      return;
    }
    if (hold.has(id)) {
      // Only pushes for the held character; one from an older copy is refused (409) and waits for the player.
      if (changed) steps.push({ kind: 'push', id, version: record.version });
      return;
    }
    steps.push(changed ? { kind: 'conflict', id, server: found } : { kind: 'download', id, server: found });
  });

  // New at the service (from another device), never here.
  there.forEach((found, id) => {
    if (here.has(id) || found.deleted || records.get(id)?.deleted) return;
    steps.push({ kind: 'download', id, server: found });
  });
  return steps;
}
