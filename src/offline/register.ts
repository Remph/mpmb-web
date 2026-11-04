// Starts the service worker (sw.ts), which keeps the app usable without network.
import { SERVICE_WORKER } from './cache-plan.ts';

/**
 * Registers the service worker once the page has loaded, so storing the app's files for offline use
 * (about 6 MB, mostly the engine) doesn't slow down the first visit. Not in `pnpm dev`, which has no
 * built files to store. Where a browser offers no service worker (Firefox's private windows), the app
 * works as before, online only.
 */
export function registerOffline(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const register = async (): Promise<void> => {
    try {
      // Relative, like everything in the app: the service worker then looks after the app's folder only.
      await navigator.serviceWorker.register(`./${SERVICE_WORKER}`);
    } catch (error) {
      console.warn('Offline use is not available:', error);
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
