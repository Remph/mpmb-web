// MPMB Web's sync service, PR 1 of M15: a health check only, to learn how the remph.de webspace runs Node (Plesk's
// Node.js extension starts this file through Phusion Passenger). No framework and no dependencies, so the upload is
// two files. The sync itself (codes, characters, leases) comes in later PRs; see server/README.md.
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { health } from './health.ts';

/** The app's own address: the only page allowed to read the answers from a browser. */
const APP_ORIGIN = 'https://remph.de';
/** Passenger hands the port in; by hand it is this one (`node dist/app.js`, then open localhost:3000/health). */
const DEFAULT_PORT = 3000;
const OK = 200;
const NOT_FOUND = 404;
const NO_CONTENT = 204;
/** The paths the health check answers on: the subdomain's root path, or under /api if Plesk mounts it there. */
const HEALTH_PATHS = new Set(['/health', '/api/health', '/mpmb/api/health']);

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    // The app sends Cross-Origin-Embedder-Policy; a fetch from it to another origin needs CORS (and CORP for safety).
    'Access-Control-Allow-Origin': APP_ORIGIN,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function handle(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (req.method === 'OPTIONS') return send(res, NO_CONTENT);
  if (req.method === 'GET' && HEALTH_PATHS.has(path)) {
    return send(res, OK, health(process.env, process.version, process.uptime(), new Date()));
  }
  return send(res, NOT_FOUND, { ok: false, error: 'not found' });
}

createServer(handle).listen(Number(process.env.PORT) || DEFAULT_PORT);
