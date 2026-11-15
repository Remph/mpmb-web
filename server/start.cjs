// Plesk's Node.js starts the app through Phusion Passenger, whose loader calls require() on this startup file.
// The service is bundled into one CommonJS file (`pnpm build:server`, server/README.md), so a plain require works
// on every Node version Plesk offers.
require('./dist/app.cjs');
