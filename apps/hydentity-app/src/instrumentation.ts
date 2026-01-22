/**
 * Next.js Instrumentation
 *
 * This file runs before any other code on the server.
 * We use it to provide an in-memory mock of node-localstorage for Vercel.
 *
 * The privacycash SDK uses node-localstorage for caching, but:
 * 1. On Vercel, the filesystem is read-only (except /tmp)
 * 2. The cache is only for convenience (persisting derived keys)
 * 3. Our frontend already handles re-initialization via browser localStorage
 *
 * So we provide a memory-only storage that satisfies the SDK without filesystem access.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';

    if (isVercel) {
      console.log('[instrumentation] Vercel detected, installing in-memory localStorage mock...');

      try {
        const Module = require('module');
        const originalLoad = Module._load;

        // In-memory storage that mimics node-localstorage API
        class MemoryLocalStorage {
          private _data: Map<string, string> = new Map();
          public length: number = 0;

          constructor(_location?: string) {
            // Ignore location - we're memory-only
            console.log('[MemoryLocalStorage] Created in-memory storage (no filesystem access)');
          }

          getItem(key: string): string | null {
            return this._data.get(key) ?? null;
          }

          setItem(key: string, value: string): void {
            if (!this._data.has(key)) {
              this.length++;
            }
            this._data.set(key, String(value));
          }

          removeItem(key: string): void {
            if (this._data.has(key)) {
              this._data.delete(key);
              this.length--;
            }
          }

          key(index: number): string | null {
            const keys = Array.from(this._data.keys());
            return keys[index] ?? null;
          }

          clear(): void {
            this._data.clear();
            this.length = 0;
          }

          keys(): string[] {
            return Array.from(this._data.keys());
          }
        }

        // Override Module._load to intercept node-localstorage
        Module._load = function(request: string, parent: any, isMain: boolean) {
          if (request === 'node-localstorage') {
            console.log('[instrumentation] Intercepted node-localstorage, returning memory mock');
            return {
              LocalStorage: MemoryLocalStorage,
              JSONStorage: MemoryLocalStorage, // In case SDK uses this too
            };
          }
          return originalLoad.call(this, request, parent, isMain);
        };

        console.log('[instrumentation] Module._load hook installed for node-localstorage');
      } catch (err) {
        console.error('[instrumentation] Failed to install localStorage mock:', err);
      }
    }
  }
}
