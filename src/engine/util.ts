// Acrobat's `util` object (printd, printf, scand) and the number rules that Acrobat's field values
// follow. Pure functions, so they are tested on their own.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const SHORT_NAME = 3;
const TWO_DIGITS = 2;
const HALF_DAY = 12;
const CENTURY = 100;
/** Two-digit years below this are 20xx, the rest 19xx (Acrobat's window). */
const YEAR_PIVOT = 50;
const CENTURY_20 = 1900;
const CENTURY_21 = 2000;
const PRINTD_PRESETS = ['D:yyyymmddHHMMss', 'yyyy.mm.dd HH:MM:ss', 'm/d/yy h:MM:ss tt'] as const;

const pad = (n: number): string => String(n).padStart(TWO_DIGITS, '0');
const hour12 = (d: Date): number => d.getHours() % HALF_DAY || HALF_DAY;

/** Date tokens, longest first so that "mmmm" wins over "mm". */
const DATE_TOKENS: Record<string, (d: Date) => string | number> = {
  yyyy: (d) => d.getFullYear(),
  yy: (d) => pad(d.getFullYear() % CENTURY),
  mmmm: (d) => MONTHS[d.getMonth()] ?? '',
  mmm: (d) => (MONTHS[d.getMonth()] ?? '').slice(0, SHORT_NAME),
  mm: (d) => pad(d.getMonth() + 1),
  m: (d) => d.getMonth() + 1,
  dddd: (d) => DAYS[d.getDay()] ?? '',
  ddd: (d) => (DAYS[d.getDay()] ?? '').slice(0, SHORT_NAME),
  dd: (d) => pad(d.getDate()),
  d: (d) => d.getDate(),
  HH: (d) => pad(d.getHours()),
  H: (d) => d.getHours(),
  hh: (d) => pad(hour12(d)),
  h: (d) => hour12(d),
  MM: (d) => pad(d.getMinutes()),
  M: (d) => d.getMinutes(),
  ss: (d) => pad(d.getSeconds()),
  s: (d) => d.getSeconds(),
  tt: (d) => (d.getHours() < HALF_DAY ? 'am' : 'pm'),
  t: (d) => (d.getHours() < HALF_DAY ? 'a' : 'p'),
};
/**
 * One date token, or a backslash-escaped character. Matches "yyyy", "mm", "\\m"; leaves "-" and "/".
 * Try it: https://regex101.com/?regex=%5C%5C.%7Cyyyy%7Cyy%7Cmmmm%7Cmmm%7Cmm%7Cm&testString=yyyy-mm-dd
 */
const DATE_TOKEN = /\\.|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|HH|H|hh|h|MM|M|ss|s|tt|t/g;

/** `util.printd(cFormat, oDate)`: cFormat is a pattern or one of Acrobat's three presets (0 to 2). */
export function printd(format: string | number, date: Date): string {
  const pattern = typeof format === 'number' ? (PRINTD_PRESETS[format] ?? PRINTD_PRESETS[0]) : String(format);
  return pattern.replace(DATE_TOKEN, (t) => (t.startsWith('\\') ? t.slice(1) : String(DATE_TOKENS[t]?.(date) ?? t)));
}

interface DateParts {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  pm?: boolean;
}

const monthByName = (s: string): number | undefined => {
  const i = MONTHS.findIndex((m) => m.toLowerCase().startsWith(s.toLowerCase().slice(0, SHORT_NAME)));
  return i === -1 ? undefined : i + 1;
};

/** What each token reads: the regex for its text, and the date part that text gives (if any). */
const SCAN_TOKENS: Record<string, { re: string; part?: (s: string) => DateParts }> = {
  yyyy: { re: '(\\d{4})', part: (s) => ({ year: Number(s) }) },
  yy: { re: '(\\d{2})', part: (s) => ({ year: Number(s) + (Number(s) < YEAR_PIVOT ? CENTURY_21 : CENTURY_20) }) },
  mmmm: { re: '([A-Za-z]+)', part: (s) => ({ month: monthByName(s) }) },
  mmm: { re: '([A-Za-z]+)', part: (s) => ({ month: monthByName(s) }) },
  mm: { re: '(\\d{1,2})', part: (s) => ({ month: Number(s) }) },
  m: { re: '(\\d{1,2})', part: (s) => ({ month: Number(s) }) },
  dddd: { re: '[A-Za-z]+' },
  ddd: { re: '[A-Za-z]+' },
  dd: { re: '(\\d{1,2})', part: (s) => ({ day: Number(s) }) },
  d: { re: '(\\d{1,2})', part: (s) => ({ day: Number(s) }) },
  HH: { re: '(\\d{1,2})', part: (s) => ({ hour: Number(s) }) },
  H: { re: '(\\d{1,2})', part: (s) => ({ hour: Number(s) }) },
  hh: { re: '(\\d{1,2})', part: (s) => ({ hour: Number(s) }) },
  h: { re: '(\\d{1,2})', part: (s) => ({ hour: Number(s) }) },
  MM: { re: '(\\d{1,2})', part: (s) => ({ minute: Number(s) }) },
  M: { re: '(\\d{1,2})', part: (s) => ({ minute: Number(s) }) },
  ss: { re: '(\\d{1,2})', part: (s) => ({ second: Number(s) }) },
  s: { re: '(\\d{1,2})', part: (s) => ({ second: Number(s) }) },
  tt: { re: '([AaPp][Mm])', part: (s) => ({ pm: s.toLowerCase().startsWith('p') }) },
  t: { re: '([AaPp])', part: (s) => ({ pm: s.toLowerCase() === 'p' }) },
};

/**
 * Characters with a meaning in regular expressions, to match a literal: "." in "yyyy.mm.dd".
 * Try it: https://regex101.com/?regex=%5B.*%2B%3F%5E%24%7B%7D()%7C%5B%5C%5D%5C%5C%5D&testString=yyyy.mm.dd
 */
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const escapeRegex = (s: string): string => s.replace(REGEX_SPECIAL, '\\$&');

/** `util.scand(cFormat, cDate)`: the date in `text` read with `format`, or null if it doesn't fit. */
export function scand(format: string | number, text: unknown): Date | null {
  const pattern = typeof format === 'number' ? (PRINTD_PRESETS[format] ?? PRINTD_PRESETS[0]) : String(format);
  const tokens = pattern.match(DATE_TOKEN) ?? [];
  const scans = tokens.map((t) => SCAN_TOKENS[t]);
  const source = pattern
    .split(DATE_TOKEN)
    .map((literal, i) => {
      // An escaped character ("\\m") has no scan entry and stands for itself.
      const escaped = escapeRegex((tokens[i] ?? '').slice(1));
      return escapeRegex(literal) + (scans[i]?.re ?? escaped);
    })
    .join('');
  // The whole text must be the date, give or take surrounding spaces: "yy-mm-dd" reads " 26-10-29 ",
  // not "26-10-29x". Try it: https://regex101.com/?regex=%5E%5Cs*(%5Cd%7B2%7D)-(%5Cd%7B1%2C2%7D)-(%5Cd%7B1%2C2%7D)%5Cs*%24&testString=26-10-29
  const m = new RegExp(`^\\s*${source}\\s*$`).exec(String(text ?? ''));
  if (!m) return null;
  const readers = scans.filter((scan) => scan?.re.startsWith('('));
  const parts: DateParts = readers.reduce((acc, scan, i) => ({ ...acc, ...scan?.part?.(m[i + 1] ?? '') }), {});
  const now = new Date();
  const year = parts.year ?? now.getFullYear();
  const month = (parts.month ?? 1) - 1;
  const day = parts.day ?? 1;
  const hour = (parts.hour ?? 0) + (parts.pm && (parts.hour ?? 0) < HALF_DAY ? HALF_DAY : 0);
  const date = new Date(year, month, day, hour, parts.minute ?? 0, parts.second ?? 0);
  // A day like 31 February rolls over in Date; Acrobat rejects it.
  if (date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

/**
 * Number separators by Acrobat's sepStyle (AFNumber_Format, util.printf's ",n" flag):
 * 0 "1,234.56", 1 "1234.56", 2 "1.234,56", 3 "1234,56".
 */
const SEP_STYLES: readonly { group: string; decimal: string }[] = [
  { group: ',', decimal: '.' },
  { group: '', decimal: '.' },
  { group: '.', decimal: ',' },
  { group: '', decimal: ',' },
];

/**
 * The places between thousands groups: "1234567" -> "1,234,567"; "123" has none.
 * Try it: https://regex101.com/?regex=%5CB(%3F%3D(%5Cd%7B3%7D)%2B(%3F!%5Cd))&testString=1234567
 */
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/** A number written with Acrobat's separator style and a fixed number of decimals. */
export function formatNumber(n: number, decimals: number, sepStyle: number): string {
  const style = SEP_STYLES[sepStyle] ?? SEP_STYLES[0] ?? { group: ',', decimal: '.' };
  const [whole = '', frac] = Math.abs(n).toFixed(Math.max(0, decimals)).split('.');
  const grouped = style.group ? whole.replace(THOUSANDS, style.group) : whole;
  return (n < 0 ? '-' : '') + grouped + (frac ? style.decimal + frac : '');
}

/**
 * `util.printf`: %d, %f, %s, %x with Acrobat's flags: ",n" separator style, "+", " ", "0", "#",
 * width and precision. Matches "%,0.2f", "%+d", "%5s", "%%".
 * Try it: https://regex101.com/?regex=%25(%2C%5Cd)%3F(%5B%2B%200%23%5D*)(%5Cd*)(%3F%3A%5C.(%5Cd%2B))%3F(%5Bdfsx%25%5D)&testString=%25%2C0.2f
 */
const PRINTF_SPEC = /%(,\d)?([+ 0#]*)(\d*)(?:\.(\d+))?([dfsx%])/g;
const DEFAULT_PRECISION = 6;
const HEX = 16;
/** Without a ",n" flag, printf writes no thousands separators and a decimal point (sepStyle 1). */
const PRINTF_DEFAULT_SEP = 1;

export function printf(format: string, ...args: unknown[]): string {
  let next = 0;
  return String(format).replace(
    PRINTF_SPEC,
    (all, sep: string | undefined, flags: string, width: string, prec: string | undefined, conv: string) => {
      if (conv === '%') return '%';
      const arg = args[next++];
      const n = Number(arg);
      const sepStyle = sep ? Number(sep.slice(1)) : PRINTF_DEFAULT_SEP;
      const body: Record<string, () => string> = {
        d: () => formatNumber(Math.trunc(n), 0, sepStyle),
        f: () => formatNumber(n, prec === undefined ? DEFAULT_PRECISION : Number(prec), sepStyle),
        x: () => Math.trunc(n).toString(HEX),
        s: () => String(arg),
      };
      let s = body[conv]?.() ?? all;
      if (conv !== 's' && n >= 0) {
        if (flags.includes('+')) s = '+' + s;
        else if (flags.includes(' ')) s = ' ' + s;
      }
      const w = Number(width) || 0;
      return flags.includes('0') && conv !== 's' ? s.padStart(w, '0') : s.padStart(w, ' ');
    },
  );
}

/**
 * Acrobat hands out a text field's value as a Number when the text is a plain decimal number, and
 * MPMB relies on it (it adds `ProfB + ProfMod` read from text fields). "4", "-1", "2.5" and "007"
 * become numbers; "", " ", "+2", "1e3", "0x10", "1,5" and "Infinity" stay strings.
 * Try it: https://regex101.com/?regex=%5E-%3F(%5Cd%2B%5C.%3F%5Cd*%7C%5C.%5Cd%2B)%24&testString=2.5
 */
const PLAIN_NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;

export function acrobatValue(text: string): string | number {
  return PLAIN_NUMBER.test(text) ? Number(text) : text;
}
