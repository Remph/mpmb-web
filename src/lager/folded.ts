// Which of the Lager's groups this device shows folded (Nick, 2026-11-16): one player's tidy view, so it stays in
// this browser's localStorage and never goes to the service or the other players.

/** Where the folded groups' ids are kept. */
export const FOLDED_KEY = 'mpmb-web.lager-folded';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The folded groups' ids; none when nothing is stored, the value is broken, or storage is off (private mode). */
export function loadFolded(storage: Store | undefined): Set<string> {
  try {
    const value: unknown = JSON.parse(storage?.getItem(FOLDED_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Folds or unfolds a group and keeps the result; a storage that refuses (full, private mode) only loses the memory. */
export function toggleFolded(folded: ReadonlySet<string>, id: string, storage: Store | undefined): Set<string> {
  const next = new Set(folded);
  if (!next.delete(id)) next.add(id);
  try {
    storage?.setItem(FOLDED_KEY, JSON.stringify([...next]));
  } catch {
    // The fold still works for this visit.
  }
  return next;
}
