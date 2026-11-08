// Every colour on screen comes from the theme's tokens in src/app.css (data-theme and data-mode on <html>,
// see src/look.ts). A component that brings its own colour or asks the device for dark follows the device
// instead of the look the player picked: light text on a page they set to light. These tests find that
// before a player does.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

/**
 * Files that may hold fixed colours, and why. app.css is where the tokens are made; it isn't scanned.
 * - LookWindow: the theme previews show each theme whatever theme is on (src/look.test.ts keeps them equal
 *   to app.css).
 * - PrintSheet: paper is white in every theme.
 */
const FIXED_COLOURS_OK = new Set(['src/views/LookWindow.svelte', 'src/views/print/PrintSheet.svelte']);

// A component or a stylesheet by its name: "Modal.svelte" and "recursive-latin.css" match, "look.ts" doesn't.
// Try it: https://regex101.com/?regex=%5C.(svelte%7Ccss)%24&testString=Modal.svelte
const SCANNED = /\.(svelte|css)$/;

/** Every .svelte file and every stylesheet under src/ except app.css, with its text. */
function sources(dir = 'src'): [string, string][] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry): [string, string][] => {
    const file = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    if (!SCANNED.test(entry.name) || file === 'src/app.css') return [];
    return [[file, fs.readFileSync(file, 'utf8')]];
  });
}

// A CSS comment, across lines; a comment may name a colour to explain a token. "/* #fff */" matches. Taken out of
// CSS only (a stylesheet, a <style> block, a style attribute): in markup or script, "/*" is also part of
// accept="image/*" or a glob, and would hide everything up to the next "*/", <style> block and all.
// Try it: https://regex101.com/?regex=%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&testString=%2F*%20%23fff%20*%2F%20color%3A%20red%3B
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;

// An HTML comment in a component's markup, across lines: "<!-- #000 -->".
// Try it: https://regex101.com/?regex=%3C!--%5B%5Cs%5CS%5D*%3F--%3E&testString=%3Cp%3Ea%3C%2Fp%3E%20%3C!--%20%23000%20--%3E
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

// A component's <style> block, with its tags: "<style>a { color: red }</style>".
// Try it: https://regex101.com/?regex=%3Cstyle%5B%5E%3E%5D*%3E%5B%5Cs%5CS%5D*%3F%3C%5C%2Fstyle%3E&testString=%3Cp%3Ea%3C%2Fp%3E%3Cstyle%3Ea%20%7B%20color%3A%20red%20%7D%3C%2Fstyle%3E
const STYLE_BLOCK = /<style[^>]*>[\s\S]*?<\/style>/g;

/** A file without its comments: CSS comments in CSS, HTML comments in markup. Script comments stay. */
function withoutComments(file: string, text: string): string {
  if (file.endsWith('.css')) return text.replace(CSS_COMMENT, '');
  return text.replace(HTML_COMMENT, '').replace(STYLE_BLOCK, (block) => block.replace(CSS_COMMENT, ''));
}

// The places a colour can be written: a <style> block's body, or a style, fill, stroke or color attribute.
// Not the rest of the markup, where "#add" can be a link to an element. Matches "<style>a { color: #fff }</style>"
// and 'fill="#fff"'.
// Try it: https://regex101.com/?regex=%3Cstyle%5B%5E%3E%5D*%3E(%5B%5Cs%5CS%5D*%3F)%3C%5C%2Fstyle%3E%7C%5Cb(%3F%3Astyle%7Cfill%7Cstroke%7Ccolor)%3D%22(%5B%5E%22%5D*)%22&testString=%3Csvg%20fill%3D%22%23fff%22%3E%3C%2Fsvg%3E%20%3Cstyle%3Ea%20%7B%20color%3A%20%23fff%20%7D%3C%2Fstyle%3E
const STYLED = /<style[^>]*>([\s\S]*?)<\/style>|\b(?:style|fill|stroke|color)="([^"]*)"/g;

/** The text of a file where colours are written: all of a stylesheet, the styled parts of a component. */
function styled(file: string, text: string): string {
  if (file.endsWith('.css')) return text.replace(CSS_COMMENT, '');
  return [...text.replace(HTML_COMMENT, '').matchAll(STYLED)]
    .map(([, block, attribute]) => block ?? attribute ?? '')
    .join('\n')
    .replace(CSS_COMMENT, '');
}

// A fixed colour: "#fff", "#1d1a26", "rgb(20 30 40)", "hsl(250 40% 40%)". Not black see-through shades such as
// "rgb(0 0 0 / 0.45)": a shadow or a dimmed backdrop is dark in every theme.
// Try it: https://regex101.com/?regex=%23%5B0-9a-f%5D%7B3%2C8%7D%5Cb%7C%5Cb(%3F%3Argba%3F%7Chsla%3F)%5C((%3F!0%5B%20%2C%5D%2B0%5B%20%2C%5D%2B0%5B%20%2C%5D*%5B%2F%2C%5D)&testString=color%3A%20%231d1a26%3B%20background%3A%20rgb(0%200%200%20%2F%200.45)%3B%20border-color%3A%20hsl(250%2040%25%2040%25)%3B
const FIXED_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\((?!0[ ,]+0[ ,]+0[ ,]*[/,])/gi;

test('no component asks the device for light or dark: the theme on <html> says which', () => {
  const offenders = sources()
    .filter(([file, text]) => withoutComments(file, text).includes('prefers-color-scheme'))
    .map(([file]) => file);
  expect(offenders).toEqual([]);
});

test('no component brings its own colours: they come from the theme (var(--…))', () => {
  const offenders = sources()
    .filter(([file]) => !FIXED_COLOURS_OK.has(file))
    .flatMap(([file, text]) => (styled(file, text).match(FIXED_COLOUR) ?? []).map((colour) => `${file}: ${colour}`));
  expect(offenders).toEqual([]);
});

test('the check finds what it should', () => {
  const component = [
    '<a href="#add">Add</a>',
    // "/*" outside CSS: once hid all up to the comment's "*/" below.
    '<input type="file" accept="image/*" />',
    '<svg fill="#123456"></svg>',
    '<style>',
    '  /* #fff in a comment */',
    '  .a { color: #fff; background: rgb(0 0 0 / 0.4); border-color: hsl(250 40% 40%); }',
    '</style>',
  ].join('\n');
  expect(styled('x.svelte', component).match(FIXED_COLOUR)).toEqual(['#123456', '#fff', 'hsl(']);
});
