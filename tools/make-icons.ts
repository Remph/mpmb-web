// Draws the home screen icons (public/icon-*.png, public/apple-touch-icon.png) from tools/app-icon.svg.
// Usage: node tools/make-icons.ts   (needs Playwright's Chromium once: pnpm exec playwright install chromium)
// iPadOS takes only PNGs for the home screen; the web app manifest names the same files.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

/** Each icon's file and size in pixels: Apple's 180 for the iPad, the manifest's usual 192 and 512. */
const ICONS: readonly [string, number][] = [
  ['public/apple-touch-icon.png', 180],
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
];

const svg = fs.readFileSync('tools/app-icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size] of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: file, omitBackground: false });
  console.log(file, size);
}
await browser.close();
