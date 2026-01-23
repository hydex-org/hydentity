/**
 * Next.js Instrumentation
 *
 * This file runs before server code.
 * The privacycash SDK now handles serverless environments natively via
 * the PRIVACYCASH_CACHE_DIR environment variable.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const cacheDir = process.env.PRIVACYCASH_CACHE_DIR;
    if (cacheDir) {
      console.log(`[instrumentation] PrivacyCash cache mode: ${cacheDir}`);
    }
  }
}
