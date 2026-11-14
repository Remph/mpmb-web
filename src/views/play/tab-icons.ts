/**
 * The phone's bottom bar icons (M13): line drawings on a 24 px grid, drawn with the text colour (stroke in the
 * bar's CSS). Our own shapes, so no icon library for five paths. Static strings, never data from a sheet.
 */
export const TAB_ICONS = {
  // Crossed blade and guard.
  combat: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>',
  // Two sparks.
  spells:
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  // A die.
  checks: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M12 22V12M3 7l9 5 9-5"/>',
  // A bag.
  inventory: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  features: '',
  profile: '',
  notes: '',
  // Three dots.
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
} as const;
