// MPMB's closing "Things to consider about the import" text (FunctionsImport.js), split for the update window
// (M11). MPMB writes it for Acrobat's alert: headings in mathematical bold italic letters (its toUni), points
// starting with "  • ", and a first line about Acrobat's OK button that the app's own window doesn't need.

export interface NoteLine {
  kind: 'heading' | 'text' | 'point';
  text: string;
}

/**
 * MPMB's line about Acrobat's dialog: matches "[Can't see the 'OK' button at the bottom? …]"; rejects "Be Aware".
 * Try it: https://regex101.com/?regex=%5E%5C%5BCan%27t+see+the+%27OK%27+button&testString=%5BCan%27t+see+the+%27OK%27+button+at+the+bottom%3F%5D%0ABe+Aware
 */
const ACROBAT_ONLY = /^\[Can't see the 'OK' button/;
/**
 * A point's bullet: matches "  • The 'Class Features' text"; rejects "Some things that you adjusted".
 * Try it: https://regex101.com/?regex=%5E%5Cs*%E2%80%A2%5Cs*&testString=++%E2%80%A2+The+%27Class+Features%27+text%0ASome+things+that+you+adjusted
 */
const BULLET = /^\s*•\s*/;
/**
 * The line breaks between MPMB's lines: matches the breaks in "a\n\n  • b"; rejects nothing else of note.
 * Try it: https://regex101.com/?regex=%5Cn%2B&testString=a%0A%0A++%E2%80%A2+b
 */
const LINES = /\n+/;
/**
 * A letter of Unicode's Mathematical Alphanumeric Symbols block, which toUni writes: matches "𝘽" in "𝘽𝙚 𝘼𝙬𝙖𝙧𝙚";
 * rejects "Be Aware".
 * Try it: https://regex101.com/?regex=%5B%5Cu%7B1D400%7D-%5Cu%7B1D7FF%7D%5D&flags=u&testString=%F0%9D%98%BD%F0%9D%99%9A+%F0%9D%98%BC%F0%9D%99%AC%F0%9D%99%96%F0%9D%99%A7%F0%9D%99%9A%0ABe+Aware
 */
const MATH_LETTER = /[\u{1D400}-\u{1D7FF}]/u;

/** MPMB's lines as headings, paragraphs and points, in plain letters. */
export function mpmbNotes(summary: string): NoteLine[] {
  return summary
    .split(LINES)
    .filter((line) => line.trim() && !ACROBAT_ONLY.test(line.trim()))
    .map((line): NoteLine => {
      // NFKC turns toUni's mathematical letters into plain ones.
      const plain = line.normalize('NFKC').trim();
      if (BULLET.test(line)) return { kind: 'point', text: plain.replace(BULLET, '') };
      return { kind: MATH_LETTER.test(line) ? 'heading' : 'text', text: plain };
    });
}
