// MPMB's welcome pop-up on a new sheet ("Before you get started with MPMB's Character Record Sheet")
// points to the PDF's bookmarks and its "JavaScript Window" toolbar, which the app doesn't have; what it
// says about SRD-only content and the 2024 rules is on the start page. So (UI review, 2026-10-31) the
// app answers it in the player's place, with "don't show again" ticked, as a player would.
import { ALERT_ANSWER } from './host.ts';
import type { AlertReply, AlertRequest } from './host.ts';

/** The start of the welcome's title (Functions1.js); the rest names the sheet type. */
const WELCOME_TITLE = 'Before you get started with MPMB';

/** The player's answer to the welcome pop-up; null for every other alert (the player answers). */
export const answerWelcome = (request: AlertRequest): AlertReply | null =>
  request.title.startsWith(WELCOME_TITLE) ? { answer: ALERT_ANSWER.ok, checkboxValue: true } : null;
