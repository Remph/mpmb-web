// The admin page at /admin (Nick's pick, decisions.md 2026-11-15): Nick adds a player and gets their code, gives a
// player a new code, or removes a player (after a second press: no scripts, so no confirm() either). Behind ADMIN_PASSWORD, which lives in Plesk's Secrets. A plain form without
// scripts: every button posts the form, and the answer is the page again.
import { createHash, timingSafeEqual } from 'node:crypto';
import { checkTries, clearFailures, countFailure } from './attempts.ts';
import { hashCode, newCode } from './codes.ts';
import { Refusal } from './http.ts';
import { cleanName, type Context } from './sync.ts';

export type Lang = 'de' | 'en';

const TEXT = {
  en: {
    title: 'MPMB Web sync: players',
    password: 'Admin password',
    show: 'Show players',
    name: 'New player’s name',
    add: 'Add player',
    newCode: 'New code',
    newCodeNote: 'A new code signs out all of this player’s devices.',
    devices: 'Devices',
    characters: 'Characters',
    lastSeen: 'Last seen',
    never: 'never',
    none: 'No players yet.',
    codeFor: (name: string) => `The code for ${name}`,
    codeNote: 'Shown only now. Hand it to the player; they type it once on each device.',
    wrong: 'Wrong password.',
    tooMany: 'Too many wrong tries. Wait a quarter of an hour.',
    noPassword: 'There is no admin password yet. Add ADMIN_PASSWORD under Secrets on the Node.js page in Plesk.',
    noDatabase: 'The database isn’t set up (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD).',
    taken: 'That name is taken.',
    noName: 'Type a name first.',
    remove: 'Remove',
    removeTitle: (name: string) => `Remove ${name}?`,
    removeNote:
      'Their code stops working, and their devices and characters are deleted from the sync. Each device keeps its own copies in its browser.',
    removeYes: (name: string) => `Yes, remove ${name}`,
    cancel: 'Cancel',
    removed: (name: string) => `${name} was removed.`,
  },
  de: {
    title: 'MPMB Web Sync: Spieler',
    password: 'Admin-Passwort',
    show: 'Spieler zeigen',
    name: 'Name des neuen Spielers',
    add: 'Spieler hinzufügen',
    newCode: 'Neuer Code',
    newCodeNote: 'Ein neuer Code meldet alle Geräte dieses Spielers ab.',
    devices: 'Geräte',
    characters: 'Charaktere',
    lastSeen: 'Zuletzt gesehen',
    never: 'nie',
    none: 'Noch keine Spieler.',
    codeFor: (name: string) => `Der Code für ${name}`,
    codeNote: 'Wird nur jetzt gezeigt. Gib ihn dem Spieler; er tippt ihn auf jedem Gerät einmal ein.',
    wrong: 'Falsches Passwort.',
    tooMany: 'Zu viele falsche Versuche. Warte eine Viertelstunde.',
    noPassword:
      'Es gibt noch kein Admin-Passwort. Lege ADMIN_PASSWORD unter Secrets auf der Node.js-Seite in Plesk an.',
    noDatabase: 'Die Datenbank ist nicht eingerichtet (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD).',
    taken: 'Den Namen gibt es schon.',
    noName: 'Tippe zuerst einen Namen ein.',
    remove: 'Entfernen',
    removeTitle: (name: string) => `${name} entfernen?`,
    removeNote:
      'Der Code gilt nicht mehr, und Geräte und Charaktere werden aus dem Sync gelöscht. Jedes Gerät behält seine eigenen Kopien im Browser.',
    removeYes: (name: string) => `Ja, ${name} entfernen`,
    cancel: 'Abbrechen',
    removed: (name: string) => `${name} wurde entfernt.`,
  },
} as const;

type Texts = (typeof TEXT)[Lang];

/** German when the browser asks for it first, English otherwise. */
export const langOf = (acceptLanguage: string | undefined): Lang =>
  (acceptLanguage ?? '').trim().toLowerCase().startsWith('de') ? 'de' : 'en';

/** The page allows no scripts, nothing from elsewhere, and posts only to itself. */
export const ADMIN_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
};

const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Compares two passwords in a time that doesn't depend on how much of them matches. */
function samePassword(given: string, expected: string): boolean {
  const digest = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

interface PlayerRow {
  id: number;
  name: string;
  devices: number;
  characters: number;
  last_seen: number | null;
}

/** What the page shows below the form. */
export interface AdminView {
  message?: string;
  code?: { name: string; code: string };
  /** The player a "Remove" press asks about; the second press removes them. */
  removing?: { id: number; name: string };
  players?: PlayerRow[];
  /** Kept in the form so the next button doesn't need it typed again. */
  password?: string;
}

const STYLE = `
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0 auto; max-width: 40rem; padding: 1rem; line-height: 1.5; }
  input, button { font: inherit; font-size: 1rem; min-height: 2.75rem; box-sizing: border-box; }
  input { width: 100%; padding: 0 0.5rem; }
  button { padding: 0 1rem; margin-top: 0.5rem; }
  label { display: block; margin-top: 1rem; }
  .code { font-size: 1.5rem; font-weight: 700; padding: 1rem; border: 2px solid; border-radius: 0.5rem;
    overflow-wrap: anywhere; }
  .message { font-weight: 600; }
  .players { list-style: none; padding: 0; margin-top: 1.5rem; }
  .players li { display: flex; gap: 0.75rem; align-items: center; justify-content: space-between;
    padding: 0.5rem 0; border-bottom: 1px solid; }
  .players li div { min-width: 0; overflow-wrap: anywhere; }
  .players li > span { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; flex: none; }
  .players button { margin-top: 0; }
  .ask { padding: 1rem; border: 2px solid; border-radius: 0.5rem; }
  .ask button { margin-right: 0.5rem; }
  .facts { font-variant-numeric: tabular-nums; }
`;

const when = (time: number | null, lang: Lang, t: Texts) =>
  time === null ? t.never : new Date(time).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { timeZone: 'UTC' });

// A list, not a table: four columns don't fit a phone. Name first, the numbers on a line below, the button beside.
function playerRow(player: PlayerRow, lang: Lang, t: Texts): string {
  const seen = player.last_seen === null ? t.never : `${when(player.last_seen, lang, t)} UTC`;
  return `<li><div><strong>${escapeHtml(player.name)}</strong><br>
    <span class="facts">${t.devices}: ${player.devices} · ${t.characters}: ${player.characters} ·
    ${t.lastSeen}: ${seen}</span></div>
    <span><button name="newCode" value="${player.id}">${t.newCode}</button>
    <button name="remove" value="${player.id}">${t.remove}</button></span></li>`;
}

function playerTable(list: PlayerRow[], lang: Lang, t: Texts): string {
  if (!list.length) return `<p>${t.none}</p>`;
  return `<ul class="players">${list.map((player) => playerRow(player, lang, t)).join('')}</ul>
    <p>${t.newCodeNote}</p>`;
}

/** The whole page. */
export function adminPage(lang: Lang, view: AdminView = {}): string {
  const t = TEXT[lang];
  const password = escapeHtml(view.password ?? '');
  const code = view.code
    ? `<h2>${escapeHtml(t.codeFor(view.code.name))}</h2><p class="code">${view.code.code}</p><p>${t.codeNote}</p>`
    : '';
  const table = view.players ? playerTable(view.players, lang, t) : '';
  const removing = view.removing;
  // Inside the form, so both buttons send the password along.
  const ask = removing
    ? `<div class="ask" role="alert"><h2>${escapeHtml(t.removeTitle(removing.name))}</h2><p>${t.removeNote}</p>
      <button name="removeConfirmed" value="${removing.id}">${escapeHtml(t.removeYes(removing.name))}</button>
      <button name="action" value="list">${t.cancel}</button></div>`
    : '';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
    <title>${t.title}</title><style>${STYLE}</style></head><body><h1>${t.title}</h1>
    ${view.message ? `<p class="message" role="alert">${escapeHtml(view.message)}</p>` : ''}${code}
    <form method="post" action="/admin">
      <label>${t.password}<input type="password" name="password" value="${password}" required
        autocomplete="current-password"></label>
      ${ask}
      <button name="action" value="list">${t.show}</button>
      <label>${t.name}<input name="name" maxlength="80" autocomplete="off"></label>
      <button name="action" value="add">${t.add}</button>
      ${table}
    </form></body></html>`;
}

async function players(context: Context): Promise<PlayerRow[]> {
  return context.db.rows<PlayerRow>(
    `SELECT p.id, p.name,
       (SELECT COUNT(*) FROM devices d WHERE d.player_id = p.id) AS devices,
       (SELECT COUNT(*) FROM characters c WHERE c.player_id = p.id AND c.deleted = 0) AS characters,
       (SELECT MAX(d.last_seen) FROM devices d WHERE d.player_id = p.id) AS last_seen
     FROM players p ORDER BY p.name`,
  );
}

/** MySQL's error for a value a UNIQUE column already has. */
const DUPLICATE = 'ER_DUP_ENTRY';
const isDuplicate = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === DUPLICATE;

const playerId = (value: string | null): number | null => {
  const id = Number(value);
  return value && Number.isSafeInteger(id) && id > 0 ? id : null;
};

/**
 * A posted form: password, then "list", "add" (with a name), "newCode", "remove" (asks) or "removeConfirmed"
 * (removes; the database deletes the player's devices and characters with them), each with a player's id. Returns what the
 * page shows. `adminPassword` is ADMIN_PASSWORD, empty when it isn't set.
 */
export async function adminPost(
  context: Context,
  form: URLSearchParams,
  address: string,
  adminPassword: string,
  lang: Lang,
): Promise<AdminView> {
  const t = TEXT[lang];
  if (!adminPassword) return { message: t.noPassword };
  const key = `admin:${address}`;
  try {
    await checkTries(context.db, key, context.now);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return { message: t.tooMany };
  }
  const password = form.get('password') ?? '';
  if (!samePassword(password, adminPassword)) {
    await countFailure(context.db, key, context.now);
    return { message: t.wrong };
  }
  await clearFailures(context.db, key);
  const view: AdminView = { password };
  const newCodeFor = playerId(form.get('newCode'));
  const removeAsk = playerId(form.get('remove'));
  const removeNow = playerId(form.get('removeConfirmed'));
  const nameOf = async (id: number) =>
    (await context.db.rows<{ name: string }>('SELECT name FROM players WHERE id = ?', [id]))[0]?.name;
  if (form.get('action') === 'add') {
    const name = cleanName(form.get('name'), '');
    if (!name) return { ...view, message: t.noName, players: await players(context) };
    const code = newCode();
    try {
      await context.db.change('INSERT INTO players (name, code_hash, created) VALUES (?, ?, ?)', [
        name,
        await hashCode(code),
        context.now,
      ]);
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      return { ...view, message: t.taken, players: await players(context) };
    }
    view.code = { name, code };
  } else if (newCodeFor) {
    const name = await nameOf(newCodeFor);
    if (name !== undefined) {
      const code = newCode();
      await context.db.change('UPDATE players SET code_hash = ? WHERE id = ?', [await hashCode(code), newCodeFor]);
      // A new code is for a code that got out: the devices that know the old one are signed out.
      await context.db.change('DELETE FROM devices WHERE player_id = ?', [newCodeFor]);
      view.code = { name, code };
    }
  } else if (removeAsk) {
    const name = await nameOf(removeAsk);
    if (name !== undefined) view.removing = { id: removeAsk, name };
  } else if (removeNow) {
    const name = await nameOf(removeNow);
    if (name !== undefined) {
      // ON DELETE CASCADE (db.ts) takes the player's devices and characters along.
      await context.db.change('DELETE FROM players WHERE id = ?', [removeNow]);
      view.message = t.removed(name);
    }
  }
  return { ...view, players: await players(context) };
}

export const noDatabaseView = (lang: Lang): AdminView => ({ message: TEXT[lang].noDatabase });
