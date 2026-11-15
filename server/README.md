# MPMB Web sync service

The service behind M15 (sync between devices, one code per player). It lives on the same webspace as the app,
but not in the app's folder: the deploy uploads only the app's `dist/`, never this folder.

**Today (PR 1) it is only a hosting spike:** a health check that tells us whether the webspace can run Node,
and a PHP page that tells us what the fallback would have. No codes, no characters, no database login yet.

## What the health check says

`GET /health` (also `/api/health`) answers with JSON:

| Field      | Meaning                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| `node`     | The Node version Plesk picked.                                               |
| `runner`   | `passenger` when Plesk started it (Phusion Passenger), `plain` when by hand. |
| `uptime`   | Seconds since start. Open the page twice a minute apart: does it keep going? |
| `database` | Whether the `DB_*` settings are set. Their values never leave the server.    |

The PHP page (`php/health.php`) answers with the PHP version and whether `mysqli`, `pdo_mysql` and `sodium`
are there.

## Try it locally

```sh
pnpm build:server              # compiles server/*.ts into server/dist/
node server/dist/app.js        # then open http://localhost:3000/health
php -S localhost:8000 -t server/php   # then open http://localhost:8000/health.php
```

## Setting it up in Plesk (once, by hand)

The steps for the spike. Write down what each step showed (or a screenshot), especially where it differs.

1. **A subdomain for the service.** Plesk, Websites & Domains, Add Subdomain: `sync.remph.de` (any name works).
   Let Plesk issue its SSL certificate (Let's Encrypt), so the address is `https://`.
2. **Turn on Node.js for it.** On the subdomain's page, Node.js. If there is no Node.js entry, the webspace
   can't run Node: skip to step 6.
3. **Upload three files** into the subdomain's folder (for example `sync.remph.de/`), with the same FTP login as
   the deploy:
   - `server/package.json`
   - `server/dist/app.js`
   - `server/dist/health.js` (both from `pnpm build:server`; they go into a `dist/` folder there too)
4. **Node.js settings:** Application Root and Document Root the subdomain's folder, Application Startup File
   `dist/app.js`, the newest Node version offered. Enable Node.js, then Restart App. No NPM install is needed:
   the service has no dependencies.
5. **Open `https://sync.remph.de/health`** and send the JSON it shows. Open it again a minute later: does `uptime`
   go up (Passenger keeps it running) or start again from 0?
6. **The fallback, either way:** upload `php/health.php` into the same subdomain's folder (or any folder of a
   domain with PHP) and open it, for example `https://sync.remph.de/health.php`. Send that JSON too.
7. **Only if Node worked:** Databases, Add Database (MySQL or MariaDB, whatever Plesk offers), name `mpmb`,
   a new user with a long random password. Then in the Node.js page, Custom environment variables:
   `DB_HOST` (Plesk shows it, often `localhost`), `DB_NAME`, `DB_USER`, `DB_PASSWORD`. Restart App, open
   `/health` again: `database` should say `configured`. The password stays in Plesk; never send it in a chat.

What happens next depends on the answers: Node with a database, PHP with a database, or a rethink.

## Why it's built this way

- **No framework, no dependencies:** Plesk runs Node through Passenger, and an upload of two files is the
  smallest thing that can show whether that works. A later PR may add a database driver.
- **Its own subdomain:** Plesk's Node.js runs per domain or subdomain, not in a subfolder of remph.de. So the
  app (on `https://remph.de/mpmb/`) calls it from another origin. Every answer allows that one origin (CORS) and
  says it may be read across origins (`Cross-Origin-Resource-Policy`), which the app's
  `Cross-Origin-Embedder-Policy` needs.
- **`/api/health` too:** in case Plesk mounts the app under a path.
