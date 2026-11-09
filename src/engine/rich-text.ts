// A rich text field's styled text, both ways: Acrobat's runs (`field.richValue`, an array of spans) and the
// XHTML that a PDF keeps of them in the field's /RV (PDF 1.7, 12.7.3.4; the XFA rich text subset).
//
// Why the app needs it: MPMB writes some labels as styled runs, small capitals made of two font sizes ("K"
// at 7 pt, "G" at 4.9 pt; the speed and weight units, spell sheet headers). Acrobat keeps them in /RV and
// draws them from there. The engine has to hand those runs back to MPMB's scripts (some read, change and
// set them again, like the theme colour of "ARMOR:"), and a filled PDF has to carry the runs MPMB set last.
//
// Acrobat's XHTML, as it saves it (see test/characters for whole sheets):
//   <?xml version="1.0"?><body xmlns=... style="font-size:7.0pt;text-align:center;...;font-family:'Footlight
//   MT Light',serif"><p>K<span style="font-size:4.9pt">G</span></p></body>
// The body's style is the field's default style; a run in that style is bare text, and a span names only
// what differs. A line break inside the text is a character reference (&#13;), a new <p> one too.
// Pure functions, no DOM: the engine runs in a worker, which has no DOMParser.
import type { Span } from './field.ts';
import type { FieldDef } from './types.ts';
import { FF } from './types.ts';

/** The XML declaration Acrobat starts /RV with. */
const XML_DECLARATION = '<?xml version="1.0"?>';
/** The body Acrobat writes for a field, used when a field had no /RV yet. */
const BODY_OPEN =
  '<body xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/" xfa:APIVersion="Acrobat:26.2.0" xfa:spec="2.0.2">';

/**
 * A tag or a run of text between tags. Group 1 "/" for a closing tag, 2 the tag name, 3 its attributes, 4
 * "/" for an empty tag (<br/>), 5 the text. Matches `<span style="a">`, `</p>`, `<br/>` and `Text &amp; more`.
 * Try it: https://regex101.com/?regex=%3C(%5C%2F%3F)(%5B%5Cw%3A-%5D%2B)(%5B%5E%3E%5D*%3F)(%5C%2F%3F)%3E%7C(%5B%5E%3C%5D%2B)&testString=%3Cp%3EK%3Cspan%20style%3D%22font-size%3A4.9pt%22%3EG%3C%2Fspan%3E%3Cbr%2F%3E%3C%2Fp%3E
 */
const TOKEN = /<(\/?)([\w:-]+)([^>]*?)(\/?)>|([^<]+)/g;
/**
 * The style attribute of a tag's attributes. Matches ` style="font-size:7.0pt"` (group 2: the style),
 * with ' or " around it, not `xfa:style=`.
 * Try it: https://regex101.com/?regex=(%3F%3A%5E%7C%5Cs)style%3D(%5B%22%27%5D)(.*%3F)%5C1&testString=%20dir%3D%22ltr%22%20style%3D%22font-size%3A7.0pt%22
 */
const STYLE_ATTR = /(?:^|\s)style=(["'])(.*?)\1/;
/**
 * `<?xml ...?>` and comments: nothing to show. Matches `<?xml version="1.0"?>` and `<!-- x -->`, not `<body>`.
 * Try it: https://regex101.com/?regex=%3C%5C%3F%5B%5Cs%5CS%5D%2A%3F%5C%3F%3E%7C%3C%21--%5B%5Cs%5CS%5D%2A%3F--%3E&testString=%3C%3Fxml%20version%3D%221.0%22%3F%3E%3Cbody%3E
 */
const PROLOG = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g;
/**
 * The opening body tag: matches `<body style="x">`, not `<bodyx>` or `</body>`. Try it: https://regex101.com/?regex=%3Cbody%5Cb%5B%5E%3E%5D*%3E&testString=%3C%3Fxml%20version%3D%221.0%22%3F%3E%3Cbody%20style%3D%22x%22%3E%3Cp%3EK%3C%2Fp%3E%3C%2Fbody%3E
 */
const BODY_TAG = /<body\b[^>]*>/;
/**
 * A character reference or one of XML's named entities: `&#13;`, `&#x25C6;`, `&amp;`.
 * Try it: https://regex101.com/?regex=%26(%3F%3A%23(%5Cd%2B)%7C%23x(%5B%5Cda-f%5D%2B)%7C(%5Cw%2B))%3B&testString=a%20%26amp%3B%20b%26%2313%3B%26%23x25C6%3B&flags=i
 */
const ENTITY = /&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/**
 * A line break in any form: Acrobat stores \r in values and may keep \n in runs. Matches "\r\n" (as one),
 * "\r" and "\n"; not "a". Try it: https://regex101.com/?regex=%5Cr%5Cn%7C%5Cr%7C%5Cn&testString=a%0D%0Ab
 */
const LINE_BREAKS = /\r\n|\r|\n/g;
const RADIX_HEX = 16;
/** Colour channels in CSS run 0 to 255; Acrobat's colour arrays 0 to 1. */
const CHANNEL_MAX = 255;
const HEX_PAIR = 2;
/**
 * A CSS hex colour, a hash and three pairs: matches "#642481", not "#fff" or "purple".
 * Try it: https://regex101.com/?regex=%5E%23%28%5B%5Cda-f%5D%7B2%7D%29%28%5B%5Cda-f%5D%7B2%7D%29%28%5B%5Cda-f%5D%7B2%7D%29%24&testString=%23642481&flags=i
 */
const HEX_COLOR = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i;
const NORMAL_WEIGHT = 400;
const BOLD_WEIGHT = 700;
const WEIGHT_NAMES: Record<string, number> = { normal: NORMAL_WEIGHT, bold: BOLD_WEIGHT };
/** Acrobat writes sizes with one decimal ("7.0pt", "4.9pt"); a finer size keeps two. */
const SIZE_DECIMALS = 100;
const ONE_DECIMAL = 10;
const RGB_CHANNELS = 3;
/**
 * Quotes around a font name: matches the ' at both ends of "'Footlight MT Light'".
 * Try it: https://regex101.com/?regex=%5E%5B%5C%27%22%5D%7C%5B%5C%27%22%5D%24&testString=%27Footlight%20MT%20Light%27
 */
const FAMILY_QUOTES = /^['"]|['"]$/g;
/**
 * A font name that CSS needs in quotes: matches the spaces of "Footlight MT Light", nothing in "Pterra".
 * Try it: https://regex101.com/?regex=%5B%5Cs%2C%5C%27%22%5D&testString=Footlight%20MT%20Light
 */
const NEEDS_QUOTES = /[\s,'"]/;
/** Printable ASCII is written as it is; anything else as a character reference, as Acrobat does (&#9670;). */
const LAST_PRINTABLE = 0x7e;
const FIRST_PRINTABLE = 0x20;

/** Text the same way line breaks and all: the value "a\rb" and runs that spell "a\nb" are one text. */
export const sameText = (a: string, b: string): boolean =>
  a.replace(LINE_BREAKS, '\r') === b.replace(LINE_BREAKS, '\r');

// ---- Reading Acrobat's XHTML ----

/** A number from a CSS length ("7.0pt" is 7), or undefined. */
const length = (v: string): number | undefined => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? undefined : n;
};

/** What each CSS property sets on a span, by the names Acrobat's richValue uses. */
const FROM_CSS: Record<string, (v: string) => Span> = {
  'font-size': (v) => ({ textSize: length(v) }),
  'font-family': (v) => ({ fontFamily: v.split(',').map((f) => f.trim().replace(FAMILY_QUOTES, '')) }),
  'font-weight': (v) => ({ fontWeight: WEIGHT_NAMES[v] ?? (Number(v) || NORMAL_WEIGHT) }),
  'font-style': (v) => ({ fontStyle: v }),
  'font-stretch': (v) => ({ fontStretch: v }),
  color: (v) => {
    const m = HEX_COLOR.exec(v);
    return m ? { textColor: ['RGB', ...m.slice(1).map((h) => parseInt(h, RADIX_HEX) / CHANNEL_MAX)] } : {};
  },
  'text-align': (v) => ({ alignment: v }),
  'text-decoration': (v) => ({ underline: v.includes('underline'), strikethrough: v.includes('line-through') }),
  'vertical-align': (v) => ({
    superscript: v === 'super' || v.startsWith('+'),
    subscript: v === 'sub' || v.startsWith('-'),
  }),
  // MPMB's own span key for the line height (correctRichTextLineSpacing); Acrobat keeps it as line-height.
  'line-height': (v) => ({ linespacing: length(v) }),
};

/** The span keys a CSS style sets, the way Acrobat's richValue hands them out. */
function styleToSpan(css: string): Span {
  const span: Span = {};
  css.split(';').forEach((decl) => {
    const at = decl.indexOf(':');
    const set = at < 0 ? undefined : FROM_CSS[decl.slice(0, at).trim().toLowerCase()];
    const v = decl.slice(at + 1).trim();
    if (!set || !v) return;
    Object.entries(set(v)).forEach(([key, got]) => {
      if (got !== undefined) span[key] = got;
    });
  });
  return span;
}

const decode = (text: string): string =>
  text.replace(ENTITY, (whole, dec: string | undefined, hex: string | undefined, named: string | undefined) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, RADIX_HEX));
    return NAMED[named ?? ''] ?? whole;
  });

const styleOf = (attrs: string): Span => styleToSpan(STYLE_ATTR.exec(attrs)?.[2] ?? '');

/**
 * The runs of an /RV, each with its whole style (the body's, the paragraph's and its spans' together), as
 * Acrobat's `richValue` hands them out. Paragraphs after the first start with a line break.
 */
export function parseRichValue(xhtml: string): readonly Span[] {
  const known = parsed.get(xhtml);
  if (known) return known;
  if (parsed.size >= PARSED_KEPT) parsed.clear();
  const runs = parseUncached(xhtml);
  parsed.set(xhtml, runs);
  return runs;
}

/**
 * Runs read before, by /RV: every snapshot of the sheet (the app takes one after each change) checks each
 * /RV against its value, and a sheet has hundreds (every feature text Acrobat saved). Read-only.
 */
const parsed = new Map<string, readonly Span[]>();
/** More than a sheet has /RVs; past it, the cache starts again. */
const PARSED_KEPT = 4000;

function parseUncached(xhtml: string): Span[] {
  const runs: Span[] = [];
  /** The style at this point: the body's, then each open tag's on top. */
  const stack: Span[] = [{}];
  let paragraphs = 0;
  [...xhtml.replace(PROLOG, '').matchAll(TOKEN)].forEach((m) => {
    const [, closing, tag = '', attrs = '', empty, text] = m;
    const top = stack[stack.length - 1] ?? {};
    const name = tag.toLowerCase();
    if (text !== undefined) {
      // Text outside a paragraph is only the whitespace between tags.
      if (stack.length > 1) runs.push({ ...top, text: decode(text) });
    } else if (name === 'br') runs.push({ ...top, text: '\r' });
    else if (closing) {
      if (stack.length > 1) stack.pop();
    } else {
      if (name === 'p' && paragraphs++ > 0) runs.push({ ...top, text: '\r' });
      if (!empty) stack.push({ ...top, ...styleOf(attrs) });
    }
  });
  return runs;
}

/** The text an /RV spells. */
export const richValueText = (xhtml: string): string =>
  parseRichValue(xhtml)
    .map((r) => r.text ?? '')
    .join('');

// ---- Writing it ----

/** `textColor` (Acrobat's colour array: RGB, G, CMYK or T) as a CSS hex colour; undefined for none (T). */
function cssColor(color: unknown): string | undefined {
  if (!Array.isArray(color)) return undefined;
  const [space, ...c] = color as [unknown, ...number[]];
  const n = c.map(Number);
  let rgb: number[];
  if (space === 'RGB') rgb = n.slice(0, RGB_CHANNELS);
  else if (space === 'G') rgb = [n[0] ?? 0, n[0] ?? 0, n[0] ?? 0];
  else if (space === 'CMYK') {
    const [cy = 0, mg = 0, ye = 0, k = 0] = n;
    rgb = [(1 - cy) * (1 - k), (1 - mg) * (1 - k), (1 - ye) * (1 - k)];
  } else return undefined;
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(Math.min(1, Math.max(0, v)) * CHANNEL_MAX)
          .toString(RADIX_HEX)
          .padStart(HEX_PAIR, '0'),
      )
      .join('')
  );
}

const points = (n: number): string => {
  const rounded = Math.round(n * SIZE_DECIMALS) / SIZE_DECIMALS;
  return `${Number.isInteger(rounded * ONE_DECIMAL) ? rounded.toFixed(1) : String(rounded)}pt`;
};

const quoteFamily = (f: string): string => (NEEDS_QUOTES.test(f) ? `'${f.replaceAll("'", '')}'` : f);

/**
 * A span's style as CSS declarations, in the order Acrobat writes them. Undefined keys are left out; the
 * paragraph's alignment isn't a span's.
 */
function spanToCss(span: Span): [string, string][] {
  const out: [string, string][] = [];
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const height = num(span.linespacing);
  if (height !== undefined) out.push(['line-height', points(height)]);
  const size = num(span.textSize);
  if (size !== undefined) out.push(['font-size', points(size)]);
  const color = cssColor(span.textColor);
  if (color) out.push(['color', color]);
  const weight = num(span.fontWeight);
  if (weight !== undefined) out.push(['font-weight', weight === NORMAL_WEIGHT ? 'normal' : String(weight)]);
  if (typeof span.fontStyle === 'string') out.push(['font-style', span.fontStyle]);
  const families = Array.isArray(span.fontFamily) ? span.fontFamily.map(String) : undefined;
  if (families?.length) out.push(['font-family', families.map(quoteFamily).join(',')]);
  if (typeof span.fontStretch === 'string') out.push(['font-stretch', span.fontStretch]);
  if (span.underline !== undefined || span.strikethrough !== undefined) {
    const lines = [span.underline ? 'underline' : '', span.strikethrough ? 'line-through' : ''].filter(Boolean);
    out.push(['text-decoration', lines.join(' ') || 'none']);
  }
  if (span.superscript || span.subscript) out.push(['vertical-align', span.superscript ? 'super' : 'sub']);
  return out;
}

/** The declarations of `css` that `base` doesn't already have. */
const differing = (css: [string, string][], base: [string, string][]): [string, string][] => {
  const has = new Map(base);
  return css.filter(([k, v]) => {
    const was = has.get(k);
    // A declaration the base leaves out is its default: no line through, not raised.
    if (was === undefined) return !(k === 'text-decoration' && v === 'none');
    return was !== v;
  });
};

const escapeText = (text: string): string =>
  Array.from(text, (ch) => {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    const code = ch.codePointAt(0) ?? 0;
    return code < FIRST_PRINTABLE || code > LAST_PRINTABLE ? `&#${code};` : ch;
  }).join('');

/**
 * The /RV for `spans`: the body of `base` (the field's /RV so far, which carries its default style) with one
 * paragraph of the runs, each naming only what differs from that style, as Acrobat writes it.
 */
export function buildRichValue(spans: readonly Span[], base?: string): string {
  const body = (base && BODY_TAG.exec(base)?.[0]) || BODY_OPEN;
  const bodyStyle = styleOf(body.slice('<body'.length));
  const bodyCss = spanToCss(bodyStyle);
  // Not Array.prototype.find: MPMB replaces it in the worker (engine-code.test.ts).
  const align = spans.filter((s) => typeof s.alignment === 'string')[0]?.alignment;
  const p = typeof align === 'string' && align !== bodyStyle.alignment ? `<p style="text-align:${align}">` : '<p>';
  const runs = spans
    .filter((s) => String(s.text ?? '') !== '')
    .map((s) => {
      const text = escapeText(String(s.text ?? ''));
      const css = differing(spanToCss(s), bodyCss);
      return css.length ? `<span style="${css.map(([k, v]) => `${k}:${v}`).join(';')}">${text}</span>` : text;
    })
    .join('');
  return `${XML_DECLARATION}${body}${p}${runs}</p></body>`;
}

/** Runs the same when drawn: same text in the same style, however they are cut into spans. */
function sameRuns(a: readonly Span[], b: readonly Span[]): boolean {
  const flat = (runs: readonly Span[]): string[] =>
    runs.flatMap((r) => {
      const css = JSON.stringify(spanToCss(r));
      return Array.from(String(r.text ?? '').replace(LINE_BREAKS, '\r'), (ch) => ch + css);
    });
  return JSON.stringify(flat(a)) === JSON.stringify(flat(b));
}

/** `spans` with the style of `base`'s body under each run, as Acrobat would hand them back. */
const withBodyStyle = (spans: readonly Span[], base: string): Span[] => {
  const body = styleOf(BODY_TAG.exec(base)?.[0].slice('<body'.length) ?? '');
  return spans.map((s) => ({ ...body, ...s }));
};

/**
 * The /RV a rich text field should carry for `value`, from the /RV it has (`rv`) and the runs a script set
 * last (`spans`, when the engine has them):
 * - runs set by a script: those runs, in `rv`'s body; `rv` itself when it shows them already;
 * - no runs, and `rv` still spells the value: `rv`;
 * - no runs, and `rv` is an older text (the value was set as plain text): the value in the style of `rv`'s
 *   first run, so it keeps the label's font. Without this, Acrobat would draw the old text's runs or, with the
 *   check in the opening script, the value in no style of the label's;
 * - an empty value: no /RV.
 * Undefined when the field has no /RV: the runs need its body for the field's own font (spell sheet headers,
 * which MPMB makes rich only at run time, have none; they keep being drawn in one style).
 */
export function currentRichValue(rv: string | undefined, value: string, spans?: readonly Span[]): string | undefined {
  if (!rv) return undefined;
  if (value === '') return undefined;
  const runs = parseRichValue(rv);
  if (spans?.length) {
    return sameRuns(runs, withBodyStyle(spans, rv)) ? rv : buildRichValue(spans, rv);
  }
  const text = runs.map((r) => r.text ?? '').join('');
  if (sameText(text, value)) return rv;
  const first = runs.filter((r) => String(r.text ?? '').trim() !== '')[0] ?? runs[0] ?? {};
  return buildRichValue([{ ...first, text: value }], rv);
}

/**
 * The /RV to save for a field with `value` (and the runs a script set, `spans`): currentRichValue for a rich
 * text field. A field that is no longer rich (MPMB turns it off when a spell row stops being a header) keeps
 * its /RV only while it spells the value: Acrobat would show the old runs again if the field became rich.
 */
export function savedRichValue(def: FieldDef, value: string, spans?: readonly Span[]): string | undefined {
  const rv = def.richValue;
  if (def.type !== 'Tx' || !rv) return rv;
  if (def.flags & FF.richText) return currentRichValue(rv, value, spans);
  return sameText(richValueText(rv), value) ? rv : undefined;
}
