import { describe, expect, it } from 'vitest';
import { adminPage, langOf } from './admin.ts';
import { partsOf } from './app.ts';
import { health } from './health.ts';
import { allowedOrigins, corsHeaders } from './http.ts';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const UPTIME = 12.4;
const ROUNDED = 12;

describe('health', () => {
  it('says how it runs and whether it reaches the database', () => {
    expect(health({}, UPTIME, NOW, 'not configured')).toEqual({
      ok: true,
      service: 'mpmb-web-sync',
      runner: 'plain',
      uptime: ROUNDED,
      database: 'not configured',
      time: NOW.toISOString(),
    });
    expect(health({}, UPTIME, NOW, 'connected').database).toBe('connected');
  });

  it('sees Passenger, Plesk’s way of running Node', () => {
    expect(health({ PASSENGER_APP_ENV: 'production' }, UPTIME, NOW, 'connected').runner).toBe('passenger');
    expect(health({ IN_PASSENGER: '1' }, UPTIME, NOW, 'connected').runner).toBe('passenger');
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

  it('shows names as text, never as markup', () => {
    const page = adminPage('en', {
      players: [{ id: 1, name: '<b>Bob</b>', devices: 0, characters: 0, last_seen: null }],
      password: '"><script>',
    });
    expect(page).toContain('&lt;b&gt;Bob&lt;/b&gt;');
    expect(page).not.toContain('<b>Bob');
    expect(page).not.toContain('"><script>');
  });
});
