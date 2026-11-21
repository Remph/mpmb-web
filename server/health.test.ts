import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { adminPage, langOf } from './admin.ts';
import { errorCode, partsOf, service } from './app.ts';
import { databaseDebug, health } from './health.ts';
import { allowedOrigins, corsHeaders } from './http.ts';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const UPTIME = 12.4;
const ROUNDED = 12;
const BAD_REQUEST = 400;

describe('health', () => {
  it('says how it runs and whether it reaches the database', () => {
    expect(health({}, UPTIME, NOW, 'not configured')).toEqual({
      ok: true,
      service: 'mpmb-web-sync',
      runner: 'plain',
      uptime: ROUNDED,
      // Outside a bundle nothing is written in (server/build-info.ts).
      commit: '',
      built: '',
      database: 'not configured',
      time: NOW.toISOString(),
    });
    expect(health({}, UPTIME, NOW, 'connected').database).toBe('connected');
  });

  it('names the build that runs', () => {
    const build = { commit: 'a'.repeat(40), built: '2026-11-21T10:00:00.000Z' };
    expect(health({}, UPTIME, NOW, 'connected', undefined, undefined, build)).toMatchObject(build);
  });

  it('names why the database is unreachable by its code only', () => {
    const answer = health({}, UPTIME, NOW, 'unreachable', 'ECONNREFUSED');
    expect(answer).toMatchObject({ database: 'unreachable', databaseError: 'ECONNREFUSED' });
    expect(health({}, UPTIME, NOW, 'connected')).not.toHaveProperty('databaseError');
    const denied = Object.assign(new Error("Access denied for user 'mpmb'@'localhost'"), {
      code: 'ER_ACCESS_DENIED_ERROR',
    });
    expect(errorCode(denied)).toBe('ER_ACCESS_DENIED_ERROR');
    expect(errorCode(new Error('no code'))).toBe('unknown');
    expect(errorCode('text')).toBe('unknown');
  });

  it('sees Passenger, Plesk’s way of running Node', () => {
    expect(health({ PASSENGER_APP_ENV: 'production' }, UPTIME, NOW, 'connected').runner).toBe('passenger');
    expect(health({ IN_PASSENGER: '1' }, UPTIME, NOW, 'connected').runner).toBe('passenger');
  });
});

describe('database debugging (DB_DEBUG=1)', () => {
  it('shows MySQL’s message and the settings, but only the password’s length', () => {
    const env = { DB_HOST: '127.0.0.1', DB_NAME: 'k1_mpmb', DB_USER: 'k1_mpmb', DB_PASSWORD: ' secret-pw' };
    const denied = new Error("Access denied for user 'k1_mpmb'@'10.0.0.5' (using password: YES)");
    const debug = databaseDebug(env, denied);
    expect(debug).toEqual({
      message: denied.message,
      host: '127.0.0.1',
      name: 'k1_mpmb',
      user: 'k1_mpmb',
      passwordLength: env.DB_PASSWORD.length,
      passwordHasOuterSpaces: true,
    });
    expect(JSON.stringify(health(env, UPTIME, NOW, 'unreachable', 'ER_ACCESS_DENIED_ERROR', debug))).not.toContain(
      'secret',
    );
    expect(health(env, UPTIME, NOW, 'unreachable', 'ER_ACCESS_DENIED_ERROR')).not.toHaveProperty('databaseDebug');
  });
});

describe('requests', () => {
  it.each([
    ['/health', ['health']],
    ['/api/health', ['health']],
    ['/api', []],
    ['/apis/x', ['apis', 'x']],
    ['/characters/abc/lease?x=1', ['characters', 'abc', 'lease']],
    ['/characters/a%20b', ['characters', 'a b']],
  ])('splits %j into %j', (url, parts) => {
    expect(partsOf(url)).toEqual(parts);
  });

  it('turns down a path it can’t read, without stopping the service', async () => {
    expect(() => partsOf('/characters/%E0')).toThrow('bad path');
    // An error thrown before the handler's try would reject handle(): Node then ends the whole process.
    const { handle } = service({}, null);
    const server = createServer((req, res) => {
      handle(req, res).catch((error: unknown) => res.destroy(error as Error));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      const res = await fetch(`http://localhost:${(server.address() as AddressInfo).port}/characters/%`);
      expect(res.status).toBe(BAD_REQUEST);
      expect(await res.json()).toEqual({ error: 'bad path' });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('allow the app’s origin and the extra ones, nothing else', () => {
    const allowed = allowedOrigins({ ALLOWED_ORIGINS: 'http://localhost:5173, ' });
    expect(corsHeaders('https://remph.de', allowed)['Access-Control-Allow-Origin']).toBe('https://remph.de');
    expect(corsHeaders('http://localhost:5173', allowed)['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(corsHeaders('https://example.com', allowed)).toEqual({ Vary: 'Origin' });
    expect(corsHeaders(undefined, allowed)).toEqual({ Vary: 'Origin' });
  });
});

describe('the admin page', () => {
  it('speaks German to a German browser', () => {
    expect(langOf('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
    expect(langOf('en-GB,de;q=0.5')).toBe('en');
    expect(langOf(undefined)).toBe('en');
    expect(adminPage('de')).toContain('Spieler hinzufügen');
  });

  it('names the build that runs, linked to its source unless it was built from changed files', () => {
    const commit = '0123456789abcdef0123456789abcdef01234567';
    const built = '2026-11-21T10:00:00.000Z';
    const page = adminPage('en', {}, { commit, built });
    expect(page).toContain(`<a href="https://github.com/Remph/mpmb-web/tree/${commit}">0123456</a>`);
    expect(page).toContain('21/11/2026, 10:00:00 UTC');
    const changed = adminPage('de', {}, { commit: `${commit}-modified`, built });
    expect(changed).toContain('Stand des Dienstes: 0123456-modified');
    expect(changed).not.toContain('<a href');
    expect(adminPage('en', {}, { commit: '', built: '' })).toContain('Service build: unknown');
  });

  it('shows names as text, never as markup', () => {
    const page = adminPage('en', {
      players: [{ id: 1, name: '<b>Bob</b>', devices: 0, characters: 0, last_seen: null }],
      password: '"><script>',
    });
    expect(page).toContain('&lt;b&gt;Bob&lt;/b&gt;');
    expect(page).not.toContain('<b>Bob');
    expect(page).not.toContain('"><script>');
  });

  it('asks "Remove?" in a form of its own, so Enter in the name box never removes a player', () => {
    const cato = { id: 1, name: 'Cato', devices: 1, characters: 1, last_seen: null };
    const page = adminPage('en', {
      players: [cato],
      removing: { id: cato.id, name: cato.name },
      password: 'pw"',
    });
    const forms = page.split('<form').slice(1);
    const ask = forms.find((f) => f.includes('removeConfirmed'));
    const main = forms.find((f) => f.includes('name="name"'));
    expect(ask).toBeDefined();
    expect(ask).toContain('type="hidden" name="password" value="pw&quot;"');
    // Enter in a text box presses its form's first button: in the main form that must not be the removal.
    expect(main).not.toContain('removeConfirmed');
  });
});
