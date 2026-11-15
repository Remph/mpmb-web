import { describe, expect, it } from 'vitest';
import { health } from './health.ts';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const VERSION = 'v22.12.0';
const UPTIME = 12.4;
const ROUNDED = 12;
const DATABASE = { DB_HOST: 'localhost', DB_NAME: 'mpmb', DB_USER: 'mpmb', DB_PASSWORD: 'secret' };

describe('health', () => {
  it('names the Node version and how it runs', () => {
    expect(health({}, VERSION, UPTIME, NOW)).toEqual({
      ok: true,
      service: 'mpmb-web-sync',
      node: VERSION,
      runner: 'plain',
      uptime: ROUNDED,
      database: 'not configured',
      time: NOW.toISOString(),
    });
  });

  it('sees Passenger, Plesk’s way of running Node', () => {
    expect(health({ PASSENGER_APP_ENV: 'production' }, VERSION, UPTIME, NOW).runner).toBe('passenger');
    expect(health({ IN_PASSENGER: '1' }, VERSION, UPTIME, NOW).runner).toBe('passenger');
  });

  it('says whether the database settings are there, never their values', () => {
    const answer = health(DATABASE, VERSION, UPTIME, NOW);
    expect(answer.database).toBe('configured');
    expect(JSON.stringify(answer)).not.toContain('secret');
    expect(health({ ...DATABASE, DB_PASSWORD: '' }, VERSION, UPTIME, NOW).database).toBe('not configured');
  });
});
