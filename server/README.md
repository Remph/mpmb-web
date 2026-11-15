# MPMB Web sync service

The service behind M15: a player's characters follow them to every device, with one code per player (Nick's
pick, 2026-11-15). It runs on the same webspace as the app, at `https://sync.remph.de`, under Plesk's Node.js
(Phusion Passenger), with a MySQL database. The app's deploy never uploads this folder.

The app's side lives in `src/sync/` (the code window and the start page line in `src/views/sync/`): it keeps
IndexedDB as the copy it works on and sends changes here at most every 5 seconds.

## What it does

- **Codes.** Nick adds a player on the admin page and hands them a four-word code ("orbit-hazard-melt-ripple"),
  and can remove a player there again.
  The database keeps only a slow hash of it (scrypt). A device types the code once and gets a token back; the
  token is what every later request carries. After 10 wrong codes from one address, it waits a quarter of an hour.
- **Characters.** The app saves a character as two parts the service never reads: `meta` (what the character list
  shows) and `data` (the sheet). Every save names the version it started from; a save from an older copy gets
  `409` and the app keeps that copy as a restore point instead of losing it. A deleted character stays as a mark,
  so the other devices learn of it.
- **"Open on another device".** A device that has a character open holds a lease on it and renews it (every 45 s or
  so); a lease lapses 2 minutes after its last renewal, for example when a laptop goes to sleep. Another device gets
  `423` with who holds it and since when, and can read the character or take it over. The first device learns
  this at its next renewal.
- **The Lager** (M16): the group's storage, one list for everyone with a code: groups of items (each either with a
  place per item, like magic items, or with counts, like materials) and the group's gold (kept in copper, so
  1,234.5 gp is exact). Changes come as small steps (`ops`): `addGroup`, `renameGroup`, `removeGroup`, `add`,
  `count` (by a difference), `set` (name, place, note, group), `remove`, `gold` (`by` or `to`, in copper),
  `goldNote`. Counts and gold move by differences, so two players' "+1" at the same moment both count; for a
  name, place or note the last change wins. A request counts whole or not at all. With `request` (an id the app
  makes once per request and sends again with a retry) the service applies it once, however often it arrives (it
  remembers the ids for 30 days). Every change moves the Lager's `version` on; the app asks with `?since=` every
  few seconds while the Lager is open, and an unchanged Lager answers with its version only.

| Route                          | Body                    | Answer                                                     |
| ------------------------------ | ----------------------- | ---------------------------------------------------------- |
| `GET /health`                  |                         | `runner`, `uptime`, `database`: no login needed            |
| `POST /login`                  | `{code, device}`        | `{token, player, device}`; `401` wrong code, `429` waiting |
| `GET /devices`                 |                         | `{player, devices: [{id, name, lastSeen, current}]}`       |
| `DELETE /devices/:id`          |                         | `204`: that device is signed out ("Forget this device")    |
| `GET /characters`              |                         | `{characters: [{id, version, deleted, meta, lease, …}]}`   |
| `GET /characters/:id`          |                         | the same, plus `data`                                      |
| `PUT /characters/:id`          | `{version, meta, data}` | `{version, updated}`; `409` newer version, `423` held      |
| `DELETE /characters/:id`       | `{version}`             | `{version, updated}`                                       |
| `POST /characters/:id/lease`   | `{takeOver?}`           | `{since, until}`; `423` with `lease` when held elsewhere   |
| `DELETE /characters/:id/lease` |                         | `204`                                                      |
| `GET /lager?since=n`           |                         | the group's Lager; only `{version}` while it is still at n |
| `POST /lager`                  | `{ops: [...], request}` | the Lager after the ops; `400` with the bad op's `index`   |
| `GET`, `POST /admin`           | the form                | the admin page                                             |

All but `/health`, `/login` and `/admin` need `Authorization: Bearer <token>`. Errors are `{error: "…"}`. Paths may
also start with `/api`.

## Updating it in Plesk

Nick set up the subdomain, Node.js and the database for the hosting test (#101). For this version:

1. **Admin password:** on the subdomain's Node.js page, Environment, Secrets: add `ADMIN_PASSWORD` with a long
   password of your own (a password manager can make one). Like `DB_PASSWORD`, Plesk never shows it again.
2. **Upload** into `/sync.remph.de` (the application root), replacing what's there: `start.cjs`, `package.json`
   and `dist/app.cjs` (from `pnpm build:server`, or the zip in the project folder). Delete the old `dist/app.js`,
   `dist/health.js` and `httpdocs/health.php`: the hosting test needed them, the service doesn't.
3. **Restart App**, then open `https://sync.remph.de/health`: `database` should say `connected` (the service built
   its tables). What the setup on 2026-11-15 taught:
   - **The database runs on another server**, not on the webspace: `DB_HOST` is the name phpMyAdmin shows in its
     top line ("Server: …:3306", without the port). `localhost` or `127.0.0.1` reach a different MySQL, where the
     user doesn't exist (`ER_ACCESS_DENIED_ERROR`).
   - Plesk puts the customer number in front of the names: `DB_NAME` and `DB_USER` are like `k123456_mpmb`.
   - With the database on another server, Plesk offers no "local connections only": allow the webspace's address
     (the one after the `@` in an "Access denied" message).
   - Changes on the Environment tab count only after **OK**, then Restart App. Passenger starts the app at the next
     request, which sometimes took a visit to another page of the webspace before `/health` showed the new values.
   - `databaseError` on `/health` names the kind of failure. While setting up, the variable `DB_DEBUG=1` adds MySQL's
     own message and the settings (only the password's length); remove it again afterwards.
4. **HTTPS only:** in the subdomain's Hosting settings, turn on the permanent 301 redirect from HTTP to HTTPS (if it
   isn't on yet). The admin password and the device tokens must never travel over plain `http://`; check that
   `http://sync.remph.de/health` ends up on `https://`.
5. **Open `https://sync.remph.de/admin`**, type the admin password and a player's name, Add player: the page shows
   their code once. "New code" gives a player a new one and signs out all their devices (for a code that got out).
   "Remove" asks once more, then deletes the player with their devices and characters at the service (each device
   keeps its own copies in its browser).

**Later updates** (a new `dist/app.cjs` only): upload `dist/app.cjs` over the old one, then Restart App and check
`/health`. The database tables stay as they are; new ones (the Lager's, M16) are added on the first request after the restart.

No npm install: `pnpm build:server` bundles the service with its two libraries into `dist/app.cjs`.

## Try it locally

```sh
pnpm build:server                        # bundles server/*.ts into server/dist/app.cjs
DB_HOST=localhost DB_NAME=mpmb DB_USER=mpmb DB_PASSWORD=… ADMIN_PASSWORD=… node server/start.cjs
```

Then `http://localhost:3000/health` and `/admin`. `ALLOWED_ORIGINS=http://localhost:5173` lets the app's dev
server call it too, and `VITE_SYNC_URL=http://localhost:3000 pnpm dev` points the app at it (the app's own
Content-Security-Policy only applies on the webspace, through `public/.htaccess`).

## Tests

`pnpm test` runs the pure tests (`codes.test.ts`, `health.test.ts`) everywhere. `sync.test.ts` drives the whole
service against a real MySQL or MariaDB and runs only when `TEST_DB_HOST`, `TEST_DB_NAME`, `TEST_DB_USER` and
`TEST_DB_PASSWORD` name an empty database it may wipe; otherwise it is skipped. In a cloud session:

```sh
apt-get update && apt-get install -y mariadb-server && service mariadb start
mariadb -e "CREATE DATABASE mpmb_test; CREATE USER 'mpmb'@'localhost' IDENTIFIED BY 'mpmb-test';
  GRANT ALL ON mpmb_test.* TO 'mpmb'@'localhost';"
TEST_DB_HOST=localhost TEST_DB_NAME=mpmb_test TEST_DB_USER=mpmb TEST_DB_PASSWORD=mpmb-test pnpm test server
```

`lager.test.ts` drives the Lager (M16) the same way, in a third empty database, `TEST_LAGER_DB_NAME`:

```sh
mariadb -e "CREATE DATABASE mpmb_lager_test; GRANT ALL ON mpmb_lager_test.* TO 'mpmb'@'localhost';"
TEST_DB_HOST=localhost TEST_DB_NAME=mpmb_test TEST_LAGER_DB_NAME=mpmb_lager_test TEST_DB_USER=mpmb \
  TEST_DB_PASSWORD=mpmb-test pnpm test server
```

`test/sync-real.test.ts` runs the app's sync (`src/sync/`) against this service on the same database server, so
the two can't drift apart while each passes its own tests against a stand-in. It needs a second empty database in
`TEST_APP_DB_NAME`, because test files run side by side and each wipes its tables:

```sh
mariadb -e "CREATE DATABASE mpmb_app_test; GRANT ALL ON mpmb_app_test.* TO 'mpmb'@'localhost';"
TEST_DB_HOST=localhost TEST_DB_NAME=mpmb_test TEST_APP_DB_NAME=mpmb_app_test TEST_DB_USER=mpmb \
  TEST_DB_PASSWORD=mpmb-test pnpm test server test/sync-real
```

## Why it's built this way

- **No framework:** a handful of routes on `node:http`. Two libraries: `mysql2` (the database) and
  `@scure/bip39` (its 2048-word list for the codes); esbuild bundles both, so the upload is three files.
- **Its own subdomain:** Plesk's Node.js runs per domain or subdomain, so the app (on `https://remph.de/mpmb/`)
  calls it from another origin. Answers allow `https://remph.de` (CORS, with the methods and headers a JSON
  request with a token needs) and say they may be read across origins (`Cross-Origin-Resource-Policy`), which the
  app's `Cross-Origin-Embedder-Policy` needs.
- **Times as milliseconds** in BIGINT columns: no time zone between the service, MySQL and the devices.
- **Tables built by the service** on its first request (`db.ts`, one step per schema version): nothing to run by
  hand in Plesk.
- **The admin page posts a plain form**, without scripts, under a strict Content-Security-Policy.

## What the app does with it

- The app's Content-Security-Policy (`public/.htaccess`) allows `connect-src https://sync.remph.de`. Its worker,
  which runs MPMB's and the players' add-on scripts, has no `fetch` (`src/worker/lockdown.ts`), so an add-on script
  can't reach the service.
- Saves go out at most every 5 seconds, with `data` gzipped (CompressionStream, as `gz:` plus base64). Bodies are
  limited to 12 MB.
- A character open for editing holds a lease, renewed every 45 seconds. Another device asks "Read only or Take
  over?"; a device that loses its lease turns read only.
