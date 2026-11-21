// After a deploy: does remph.de really send the headers public/.htaccess sets? The Content Security Policy is what
// stops an add-on script from loading code from elsewhere, and the isolation headers (COOP, COEP) are what let the
// engine wait for a pop-up's answer. Both come only from that file on netcup's Apache, so a hosting change that
// skips it (Plesk's "serve static files directly by nginx", say) would drop them without anything failing
// (security audit 2026-11-20, finding 06). The deploy's last step runs this; by hand:
//   node tools/live-headers.ts [https://remph.de/mpmb/] [dist]
// It fetches the page and one script of the build and fails when a header is missing or differs from the file.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The headers checked, each as public/.htaccess sets it with `Header always set <name> "<value>"`. */
export const CHECKED = ['Content-Security-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Embedder-Policy'];

/** process.argv starts with node and the script path. */
const ARGS_START = 2;
const TRIES = 3;
const RETRY_MS = 5_000;

/**
 * The value .htaccess sets for each checked header. From `Header always set Cross-Origin-Opener-Policy "same-origin"`
 * it takes `same-origin`. Try it: https://regex101.com/?regex=Header%20always%20set%20Cross-Origin-Opener-Policy%20%22(%5B%5E%22%5D%2B)%22&testString=Header%20always%20set%20Cross-Origin-Opener-Policy%20%22same-origin%22
 */
export function expectedHeaders(htaccess: string): Map<string, string> {
  return new Map(
    CHECKED.map((name) => {
      const value = new RegExp(`Header always set ${name} "([^"]+)"`).exec(htaccess)?.[1];
      if (!value) throw new Error(`public/.htaccess sets no ${name}`);
      return [name, value];
    }),
  );
}

/** What is wrong with one answer's headers, one line each; empty when all match. */
export function problems(url: string, headers: Headers, expected: ReadonlyMap<string, string>): string[] {
  return [...expected].flatMap(([name, value]) => {
    const got = headers.get(name);
    if (got === null) return [`${url}: no ${name}`];
    // Two headers of one name arrive joined with ", ": that differs too (say, the hub's CSP next to the app's).
    return got === value ? [] : [`${url}: ${name} differs\n  sent:     ${got}\n  expected: ${value}`];
  });
}

/** One script of the build in `dist`: its hashed name never changes once it is uploaded. */
export function assetOf(dist: string): string {
  const script = readdirSync(`${dist}/assets`)
    .filter((name) => name.endsWith('.js'))
    .sort()[0];
  if (!script) throw new Error(`no script in ${dist}/assets`);
  return `assets/${script}`;
}

async function fetchHeaders(url: string, triesLeft = TRIES): Promise<Headers> {
  try {
    const response = await fetch(url, { cache: 'no-store', redirect: 'manual' });
    if (!response.ok) throw new Error(`${url}: status ${response.status}`);
    return response.headers;
  } catch (error) {
    if (triesLeft <= 1) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    return fetchHeaders(url, triesLeft - 1);
  }
}

async function main(): Promise<void> {
  const [base = 'https://remph.de/mpmb/', dist = 'dist'] = process.argv.slice(ARGS_START);
  const expected = expectedHeaders(readFileSync(new URL('../public/.htaccess', import.meta.url), 'utf8'));
  const urls = [base, new URL(assetOf(dist), base).href];
  const found = (await Promise.all(urls.map(async (url) => problems(url, await fetchHeaders(url), expected)))).flat();
  if (found.length) {
    console.error(`The live site doesn't send the headers public/.htaccess sets:\n${found.join('\n')}`);
    console.error('See README.md, "Deploy": the upload went through, but the app may be unprotected or broken.');
    process.exit(1);
  }
  console.log(`${urls.join(' and ')}: ${CHECKED.join(', ')} as in public/.htaccess.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
