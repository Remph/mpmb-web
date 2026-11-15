// Plesk's Node.js starts the app through Phusion Passenger, whose loader calls require() on the startup file.
// Node versions before 20.19 / 22.12 can't require() an ES module (ERR_REQUIRE_ESM), and the service is one
// (server/package.json says "type": "module"). This CommonJS file loads it with import() instead, so the
// startup file works whichever Node version Plesk offers. See server/README.md, step 4.
import('./dist/app.js');
