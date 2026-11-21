// Small pieces for a service without a framework: answers, bodies, and who may call from a browser.
import type { IncomingMessage, ServerResponse } from 'node:http';

export const OK = 200;
export const NO_CONTENT = 204;
export const BAD_REQUEST = 400;
export const UNAUTHORIZED = 401;
/** A player reached a cap (sync.ts CAPS): too many characters or devices. */
export const FORBIDDEN = 403;
export const NOT_FOUND = 404;
export const CONFLICT = 409;
export const PAYLOAD_TOO_LARGE = 413;
/** Another device holds the character (its lease runs): "Read only" or "Take over" in the app. */
export const LOCKED = 423;
export const TOO_MANY = 429;
export const SERVER_ERROR = 500;
export const UNAVAILABLE = 503;

/** A request the service turns down, with the status and the short reason the app reads. */
export class Refusal extends Error {
  readonly status: number;
  readonly reason: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, reason: string, details: Record<string, unknown> = {}) {
    super(reason);
    this.status = status;
    this.reason = reason;
    this.details = details;
  }
}

/** How long browsers keep to HTTPS for the service's host: a year, in seconds. */
const HSTS_SECONDS = 31_536_000;

/** Headers every answer carries. */
const COMMON = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  // HTTPS only for sync.remph.de: remph.de's own Strict-Transport-Security (its root .htaccess) leaves out the
  // subdomains, so the service sends its own (security audit 2026-11-20, finding 11). Browsers ignore it over plain
  // http://, where Plesk's redirect to https:// answers anyway.
  'Strict-Transport-Security': `max-age=${HSTS_SECONDS}`,
  // The app sends Cross-Origin-Embedder-Policy; a response it reads from another origin needs this (and CORS).
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

/** How long a browser may reuse a preflight answer, in seconds. */
const PREFLIGHT_SECONDS = 600;

/** The browser origins allowed to call the service: the app's own, plus ALLOWED_ORIGINS (comma-separated). */
export function allowedOrigins(env: Readonly<Record<string, string | undefined>>): Set<string> {
  const extra = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(['https://remph.de', ...extra]);
}

/** CORS headers for a request from `origin`: none for an origin that isn't allowed (the browser then refuses). */
export function corsHeaders(origin: string | undefined, allowed: ReadonlySet<string>): Record<string, string> {
  if (!origin || !allowed.has(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': String(PREFLIGHT_SECONDS),
    Vary: 'Origin',
  };
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...COMMON, ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

export function sendHtml(res: ServerResponse, status: number, html: string, headers: Record<string, string>): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...COMMON, ...headers });
  res.end(html);
}

/** The body as text, refusing more than `limit` bytes (a character with a portrait is a few megabytes at most). */
export function readText(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        // Stop reading, but leave the connection open so the 413 still reaches the caller: the answer closes it
        // (app.ts sends it with "Connection: close"). Destroying the request here cut the answer off as well.
        req.removeAllListeners('data');
        req.pause();
        reject(new Refusal(PAYLOAD_TOO_LARGE, 'too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** The body as a JSON object; anything else is a bad request. */
export async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const text = await readText(req, limit);
  const value: unknown = text ? safeParse(text) : {};
  if (!isRecord(value)) throw new Refusal(BAD_REQUEST, 'bad body');
  return value;
}

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The bearer token in the Authorization header ("Bearer abc…"), or null. */
export function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization ?? '';
  const prefix = 'Bearer ';
  return header.startsWith(prefix) ? header.slice(prefix.length).trim() || null : null;
}

/**
 * The caller's address. Passenger sits behind the webspace's web server, which passes the browser's address on
 * in X-Forwarded-For; the last entry is the one that server added (earlier ones the browser could fake).
 *
 * Checked live on 2026-11-21 (security audit 2026-11-20, finding 01): with a made-up X-Forwarded-For every wrong
 * code still got "wait", an 81-character header still counted, and a phone on mobile data was counted apart from
 * the PC. So Plesk's nginx appends the real address, and the last entry is it. A hosting change (another proxy in
 * front, nginx off, a new webspace) must check this again: if a caller's own header reached the service unchanged,
 * every made-up address would get fresh tries. The admin page's overall ceiling (attempts.ts) still holds then.
 */
export function addressOf(req: IncomingMessage): string {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded.at(-1) ?? req.socket.remoteAddress ?? 'unknown';
}
