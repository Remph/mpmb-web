// Which links the scripts may open without asking. MPMB's scripts open its own sites (the FAQ, how-tos,
// Patreon) and the web pages of the books a sheet uses; add-on scripts can add any address, also one
// that carries the character's data in its query. So MPMB's own sites open at once and every other
// web address is shown to the player first; anything that isn't a web address never opens.

export type LinkKind = 'mpmb' | 'other' | 'refused';

/** MPMB's own pages: its website, and its accounts on Patreon and GitHub. */
const MPMB_SITE = 'flapkan.com';
const MPMB_ACCOUNTS: Record<string, string> = {
  'patreon.com': '/morepurplemorebetter',
  'github.com': '/morepurplemorebetter',
};

/**
 * A leading "www.": matches "www.flapkan.com", not "flapkan.com" or "wwwflapkan.com".
 * Try it: https://regex101.com/?regex=%5Ewww%5C.&testString=www.flapkan.com
 */
const WWW = /^www\./;

export function linkKind(url: string): LinkKind {
  const parsed = parseUrl(url);
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) return 'refused';
  const host = parsed.hostname.toLowerCase().replace(WWW, '');
  if (host === MPMB_SITE || host.endsWith(`.${MPMB_SITE}`)) return 'mpmb';
  const account = MPMB_ACCOUNTS[host];
  return account && underPath(parsed.pathname.toLowerCase(), account) ? 'mpmb' : 'other';
}

/** "/morepurplemorebetter" and "/morepurplemorebetter/x", not "/morepurplemorebetter-fan". */
function underPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** new URL, not URL.parse: Safari has URL.parse only from version 18, and the iPad may be older. */
function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
