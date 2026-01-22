/**
 * Next.js Instrumentation
 *
 * This file runs before server code. On Vercel, the node-localstorage
 * module is replaced with an in-memory mock via webpack alias in next.config.js.
 *
 * This instrumentation hook is kept for potential future use.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
    if (isVercel) {
      console.log('[instrumentation] Running on Vercel - node-localstorage aliased to memory mock via webpack');
    }
  }
}
