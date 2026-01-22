/**
 * Next.js Instrumentation
 *
 * This file runs before any other code on the server.
 * We use it to set up the Privacy Cash cache directory for Vercel.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';

    if (isVercel) {
      console.log('[instrumentation] Vercel environment detected, setting up Privacy Cash cache...');

      const VERCEL_CACHE_DIR = '/tmp/privacycash-cache';

      try {
        // Use require for synchronous operations
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');

        // Create /tmp cache directory
        if (!fs.existsSync(VERCEL_CACHE_DIR)) {
          fs.mkdirSync(VERCEL_CACHE_DIR, { recursive: true });
          console.log('[instrumentation] Created Privacy Cash cache dir:', VERCEL_CACHE_DIR);
        }

        // Patch node-localstorage to use /tmp
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeLocalStorage = require('node-localstorage');
        const OriginalLocalStorage = nodeLocalStorage.LocalStorage;

        class PatchedLocalStorage extends OriginalLocalStorage {
          constructor(location: string) {
            console.log('[instrumentation] Redirecting LocalStorage', location, 'to', VERCEL_CACHE_DIR);
            super(VERCEL_CACHE_DIR);
          }
        }

        // Replace in module cache - this affects all future requires
        nodeLocalStorage.LocalStorage = PatchedLocalStorage;

        console.log('[instrumentation] Patched node-localstorage for Vercel');
      } catch (err) {
        console.error('[instrumentation] Failed to set up Privacy Cash cache:', err);
      }
    }
  }
}
