// Field helpers for tests that read the play view's values.
import type { FieldViews } from '../src/worker/views.ts';

/** A copy with some fields' values changed, as after the player's edits; throws on a field the sheet lacks. */
export function withValues(fields: FieldViews, values: Record<string, string>): FieldViews {
  const copy = { ...fields };
  Object.entries(values).forEach(([name, value]) => {
    const view = copy[name];
    if (!view) throw new Error(`no field ${name}`);
    copy[name] = { ...view, value, text: undefined };
  });
  return copy;
}
