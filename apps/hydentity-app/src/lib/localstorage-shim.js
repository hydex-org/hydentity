/**
 * LocalStorage Shim for Vercel Serverless
 *
 * The privacycash SDK uses node-localstorage with process.cwd()/cache
 * which doesn't work on Vercel (read-only filesystem).
 *
 * This shim redirects all LocalStorage instances to use /tmp on Vercel.
 */

const { LocalStorage: OriginalLocalStorage } = require('node-localstorage');
const path = require('path');
const fs = require('fs');

// Determine cache directory based on environment
// - Vercel serverless: use /tmp (only writable location)
// - Local development: use process.cwd()/cache
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const cacheDir = isVercel
  ? '/tmp/privacycash-cache'
  : path.join(process.cwd(), 'cache');

// Ensure the cache directory exists
try {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
} catch (err) {
  console.warn('[localstorage-shim] Could not create cache directory:', err.message);
}

/**
 * Shimmed LocalStorage that always uses our configured cache directory
 */
class LocalStorage extends OriginalLocalStorage {
  constructor(location) {
    // Ignore the passed location and use our cache directory
    // This intercepts the privacycash SDK's attempt to use process.cwd()/cache
    super(cacheDir);

    if (process.env.NODE_ENV === 'development' || isVercel) {
      console.log('[localstorage-shim] Using cache directory:', cacheDir);
    }
  }
}

module.exports = { LocalStorage };
