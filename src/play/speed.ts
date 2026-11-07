// The Speed window's pure parts: reading MPMB's explanation of a speed, and the steps that write a change.
import type { Step } from '../session.svelte.ts';

export const SPEED_MODES = ['walk', 'burrow', 'climb', 'fly', 'swim'] as const;
export type SpeedMode = (typeof SPEED_MODES)[number];

export interface SpeedSource {
  mode: SpeedMode;
  /** MPMB's own entries, as on the sheet: "Silver Dragonborn [9 m]", "Draconic Flight [as Speed]". */
  items: string[];
}

/**
 * MPMB writes where a speed comes from into the Speed field's tooltip (SetProf "speed", Functions2.js), one
 * block per kind of movement: "The total Fly Speed comes from:" and a line " • <source> [<speed>]" each. The
 * caption is MPMB's English, so the window shows its own heading and only keeps the mode and the entries.
 * Anything else in the tooltip (an older sheet's text) is left out rather than shown half-understood.
 */
export function speedSources(tooltip: string | undefined): SpeedSource[] {
  const sources: SpeedSource[] = [];
  let current: SpeedSource | null = null;
  for (const raw of (tooltip ?? '').split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    const caption = /^The total (?:encumbered )?(?:(Burrow|Climb|Fly|Swim) )?Speed comes from:$/i.exec(line);
    if (caption) {
      current = { mode: (caption[1]?.toLowerCase() ?? 'walk') as SpeedMode, items: [] };
      sources.push(current);
    } else if (current && line.startsWith('•')) {
      current.items.push(line.slice(1).trim());
    } else if (line) {
      current = null;
    }
  }
  return sources.filter((s) => s.items.length > 0);
}

/**
 * The edits for what the player typed, like typing into the PDF: only the fields that changed, trimmed (MPMB
 * clears some fields to a space). MPMB keeps the difference to its own total as a typed-in extra.
 */
export function speedSteps(
  before: { speed: string; encumbered: string },
  typed: { speed: string; encumbered: string },
): Step[] {
  const steps: Step[] = [];
  if (typed.speed.trim() !== before.speed.trim()) steps.push({ edit: 'Speed', text: typed.speed.trim() });
  if (typed.encumbered.trim() !== before.encumbered.trim())
    steps.push({ edit: 'Speed encumbered', text: typed.encumbered.trim() });
  return steps;
}
