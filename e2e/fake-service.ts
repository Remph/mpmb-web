// The stand-in sync service (test/fake-sync.ts) in a real browser: Playwright answers the app's calls to
// https://sync.remph.de from it. Shared by the sync and Lager browser tests.
import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FakeSync } from '../test/fake-sync.ts';

export const CODE = 'orbit-hazard-melt-ripple';
const NO_CONTENT = 204;

/**
 * Answers the app's calls to the sync service from `service`, with the headers the real one sends (CORS, CORP).
 * While `service.offline` is true, every call fails as if the network were down.
 */
export async function routeSync(context: BrowserContext, service: FakeSync): Promise<void> {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  await context.route('https://sync.remph.de/**', async (route) => {
    const request = route.request();
    if (service.offline) {
      await route.abort('internetdisconnected');
      return;
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: NO_CONTENT, headers });
      return;
    }
    const { status, body } = service.handle(request.method(), request.url(), request.headers(), request.postDataJSON());
    await route.fulfill({
      status,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: status === NO_CONTENT ? '' : JSON.stringify(body),
    });
  });
}

/** Types the code on the start page and names the device. */
export async function connect(page: Page, name: string): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Type your code' }).click();
  const window = page.getByRole('dialog', { name: 'Sync with your code' });
  await window.getByRole('textbox', { name: 'Your code' }).fill(CODE.replaceAll('-', ' '));
  await window.getByRole('textbox', { name: 'This device’s name, shown to your other devices' }).fill(name);
  await window.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Connected as Anna: your characters are syncing.')).toBeVisible();
}
