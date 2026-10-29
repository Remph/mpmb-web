// What the app lets MPMB do when a sheet opens.
//
// Startup.js schedules OpeningStatement() 3 s after opening. On a blank sheet it shows MPMB's welcome
// text and the source selection; on a filled sheet it only schedules PatreonStatement(), MPMB's
// request (every 28 days) to support the PDF on Patreon. That request is made for MPMB's own PDF and
// would read as if MPMB made this app, so the app holds it back and links MPMB's Patreon in its
// credits instead (decided in M3, 2026-10-29).

/** Timers the app never runs, by the code MPMB scheduled. */
const HELD_TIMERS = /\bPatreonStatement\s*\(/;

export const allowTimer = (expr: string): boolean => !HELD_TIMERS.test(expr);
