// The colour tokens app.css gives each theme in each mode, read from the file itself, so the tests check
// what the browser gets. Only plain colours (#rrggbb) count; the sky gradients and fonts aren't colours a
// test can measure.
import { readFileSync } from 'node:fs';
import type { Theme } from '../src/look.ts';

// A CSS comment, across lines: "/* tokens */" matches, "--ink: #fff;" doesn't.
// Try it: https://regex101.com/?regex=%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&testString=%2F*%20tokens%20*%2F%20--ink%3A%20%23fff%3B
const COMMENT = /\/\*[\s\S]*?\*\//g;

// An innermost block, its selector and its body: ":root { --ink: #fff; }" matches as ":root " and " --ink: #fff; ";
// the "@media screen {" around a block doesn't, because a selector can't hold a brace.
// Try it: https://regex101.com/?regex=%28%5B%5E%7B%7D%5D%2B%29%5C%7B%28%5B%5E%7B%7D%5D*%29%5C%7D&testString=%40media%20screen%20%7B%20%3Aroot%20%7B%20--ink%3A%20%23fff%3B%20%7D%20%7D
const BLOCK = /([^{}]+)\{([^{}]*)\}/g;

// A custom property and its value up to the semicolon: "--ink: #fff;" matches, "color: #fff;" doesn't.
// Try it: https://regex101.com/?regex=%28--%5B%5Cw-%5D%2B%29%3A%5Cs*%28%5B%5E%3B%5D%2B%29%3B&testString=--ink%3A%20%23fff%3B%20color%3A%20%23fff%3B
const TOKEN = /(--[\w-]+):\s*([^;]+);/g;

// One attribute a selector asks for: "[data-mode='dark']" matches as data-mode and dark; ":root" doesn't.
// Try it: https://regex101.com/?regex=%5C%5B%28%5B%5Cw-%5D%2B%29%3D%27%28%5B%5Cw-%5D%2B%29%27%5C%5D&testString=%3Aroot%5Bdata-mode%3D%27dark%27%5D
const ATTRIBUTE = /\[([\w-]+)='([\w-]+)'\]/g;

// A plain colour: "#1d1a26" matches; "#fff", "var(--ink)" and gradients don't.
// Try it: https://regex101.com/?regex=%5E%23%5B0-9a-f%5D%7B6%7D%24&testString=%231d1a26
const HEX = /^#[0-9a-f]{6}$/i;

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8').replace(COMMENT, '');

/** Every innermost block of app.css: its selector and its custom properties, in file order. */
// Runs of white space, to write a selector on one line: "h1,\n  h2" becomes "h1, h2".
const SPACES = /\s+/g;

const blocks = [...css.matchAll(BLOCK)].map(([, selector, body]) => ({
  selector: selector!.trim().replace(SPACES, ' '),
  tokens: Object.fromEntries([...body!.matchAll(TOKEN)].map(([, name, value]) => [name!, value!.trim()])),
}));

/** The blocks that set tokens on <html>: ":root" alone or with attributes. */
const rootBlocks = blocks.filter((block) => block.selector.startsWith(':root'));

/** Whether a <html> with these attributes matches the selector: every attribute it asks for is there. */
const matches = (selector: string, attributes: Record<string, string>): boolean =>
  [...selector.matchAll(ATTRIBUTE)].every(([, name, value]) => attributes[name!] === value);

/** A block's weight: each attribute selector counts once more than :root alone. */
const weight = (selector: string): number => [...selector.matchAll(ATTRIBUTE)].length;

/** The tokens of one theme in one mode, as the cascade picks them (heavier selectors win, then later ones). */
export function themeTokens(theme: Theme, mode: 'light' | 'dark'): Record<string, string> {
  const attributes = { 'data-theme': theme, 'data-mode': mode };
  const hit = rootBlocks
    .map((block, order) => ({ ...block, order }))
    .filter((block) => matches(block.selector, attributes))
    .sort((a, b) => weight(a.selector) - weight(b.selector) || a.order - b.order);
  return Object.assign({}, ...hit.map((block) => block.tokens)) as Record<string, string>;
}

/** The tokens one block sets itself, by its selector; the first block when several share one. */
export const blockTokens = (selector: string): Record<string, string> | undefined =>
  rootBlocks.find((block) => block.selector === selector)?.tokens;

/** Every theme in every mode it has. */
export const SHOWN: readonly { theme: Theme; mode: 'light' | 'dark' }[] = [
  { theme: 'purple', mode: 'light' },
  { theme: 'purple', mode: 'dark' },
  { theme: 'campfire', mode: 'light' },
  { theme: 'campfire', mode: 'dark' },
  { theme: 'oled', mode: 'dark' },
];

/** A token's colour; throws when the token is missing or isn't a plain #rrggbb. */
export function color(tokens: Record<string, string>, name: string): string {
  const value = tokens[`--${name}`];
  if (!value || !HEX.test(value)) throw new Error(`--${name} is not a #rrggbb colour: ${value}`);
  return value;
}

// WCAG 2's relative luminance: sRGB channels made linear, weighted by how bright the eye sees each.
const CHANNEL_MAX = 255;
const LINEAR_KNEE = 0.03928;
const LINEAR_SLOPE = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA = 2.4;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
/** WCAG's flare added to both sides of a contrast ratio. */
const FLARE = 0.05;
/** Where the red, green and blue pairs start in "#rrggbb", and how long each is. */
const PAIR = 2;
const RED_AT = 1;
const GREEN_AT = RED_AT + PAIR;
const BLUE_AT = GREEN_AT + PAIR;

function luminance(hex: string): number {
  const linear = (start: number): number => {
    const c = parseInt(hex.slice(start, start + PAIR), 16) / CHANNEL_MAX;
    return c <= LINEAR_KNEE ? c / LINEAR_SLOPE : ((c + GAMMA_OFFSET) / (1 + GAMMA_OFFSET)) ** GAMMA;
  };
  return RED_WEIGHT * linear(RED_AT) + GREEN_WEIGHT * linear(GREEN_AT) + BLUE_WEIGHT * linear(BLUE_AT);
}

/** The contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + FLARE) / (lo! + FLARE);
}
