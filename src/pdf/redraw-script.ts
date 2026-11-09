// The one script of its own that MPMB Web adds to a filled PDF (the field scripts it writes are MPMB's):
// Acrobat runs it when it opens the PDF, to draw the values the app filled in. It has a file of its own so
// the Fill MPMB PDF window can link to just this, for anyone who wants to see what it does.

/** Where this file sits in the repo, for the link to its source on GitHub (a test checks it's still here). */
export const REDRAW_SCRIPT_PATH = 'src/pdf/redraw-script.ts';

/** The first line of the script that draws the values; finds the script of an earlier export again. */
export const REDRAW_MARK = '// MPMB Web: draw the fields it filled';

/**
 * The script Acrobat runs when it opens the PDF: sets each of `fields` to its own value, so that Acrobat draws
 * it, then leaves `stamp` in the document info so it doesn't run again. MPMB's calculations stay off meanwhile
 * (a first try with them on kept Acrobat busy for minutes) and `delay` draws everything at the end.
 */
export function redrawScript(fields: string[], stamp: string): string {
  // Plain ASCII, so the script reads the same in any text encoding; JSON alone may hold U+2028, which ends a
  // line in older JavaScript.
  const literal = (v: unknown): string =>
    JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return [
    REDRAW_MARK,
    'try {',
    `  if (this.info.MPMBWebDrawn !== ${literal(stamp)}) {`,
    `    var names = ${literal(fields)};`,
    '    this.calculate = false;',
    '    this.delay = true;',
    '    for (var i = 0; i < names.length; i++) {',
    '      var f = this.getField(names[i]);',
    // A rich text field (MPMB's labels in small caps or another font) gets its own styled text back; set
    // to its plain value, Acrobat would draw it in the field's one style. Only while the runs still spell
    // the value: the writer makes /RV spell it (rich-text.ts), but a PDF filled by an older version may carry
    // the blank's runs under a new value, and setting them would undo the change. A line break is the same in
    // any form: the runs of "21 -\n40 kg" spell the value "21 -\r40 kg", not "21 - 40 kg". valueAsString:
    // Acrobat's value turns text that looks like a number into one ("+8" into 8).
    '      if (!f) continue;',
    '      var runs = f.richText ? f.richValue : null;',
    '      var text = "";',
    '      for (var j = 0; runs && j < runs.length; j++) text += runs[j].text;',
    '      var lines = /\\r\\n|\\r|\\n/g;',
    '      if (runs && runs.length && text.replace(lines, "\\r") === f.valueAsString.replace(lines, "\\r")) f.richValue = runs;',
    '      else f.value = f.valueAsString;',
    '    }',
    '    this.delay = false;',
    '    this.calculate = true;',
    `    this.info.MPMBWebDrawn = ${literal(stamp)};`,
    '  }',
    '} catch (e) {',
    '  this.delay = false;',
    '  this.calculate = true;',
    '  console.println("MPMB Web could not draw the fields: " + e);',
    '}',
  ].join('\n');
}
