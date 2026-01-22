/**
 * Privacy Cash Server-Side Service
 *
 * This service runs the Privacy Cash SDK on the server since it uses
 * Node.js modules that can't run in the browser.
 *
 * IMPORTANT: On Vercel, the filesystem is read-only except for /tmp.
 * The privacycash SDK tries to create a cache at process.cwd()/cache
 * which fails on Vercel. We patch node-localstorage before importing
 * privacycash to redirect the cache to /tmp.
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

// ============================================================================
// VERCEL CACHE DIRECTORY FIX
// ============================================================================
// The privacycash SDK uses node-localstorage with a hardcoded path.
// We need to patch it BEFORE importing privacycash.

const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const VERCEL_CACHE_DIR = '/tmp/privacycash-cache';

// Ensure cache directory exists
function ensureCacheDir() {
  const cacheDir = isVercel ? VERCEL_CACHE_DIR : path.join(process.cwd(), 'cache');
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
      console.log('[privacy-cash/service] Created cache dir:', cacheDir);
    }
  } catch (err) {
    console.error('[privacy-cash/service] Failed to create cache dir:', err);
  }
  return cacheDir;
}

// Patch node-localstorage to use /tmp on Vercel
// This MUST happen SYNCHRONOUSLY before privacycash is imported
let patchApplied = false;

function patchLocalStorageForVercel() {
  if (patchApplied || !isVercel) return;

  try {
    // Ensure /tmp cache exists first
    ensureCacheDir();

    // Use require() for synchronous loading - this is critical!
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeLocalStorage = require('node-localstorage');
    const OriginalLocalStorage = nodeLocalStorage.LocalStorage;

    // Create a patched version that uses /tmp
    class PatchedLocalStorage extends OriginalLocalStorage {
      constructor(location: string) {
        console.log('[PatchedLocalStorage] Redirecting', location, 'to', VERCEL_CACHE_DIR);
        super(VERCEL_CACHE_DIR);
      }
    }

    // Replace the export in the module cache
    // This affects all future requires of node-localstorage
    nodeLocalStorage.LocalStorage = PatchedLocalStorage;

    patchApplied = true;
    console.log('[privacy-cash/service] Patched node-localstorage for Vercel');
  } catch (err) {
    console.error('[privacy-cash/service] Failed to patch node-localstorage:', err);
  }
}

// Apply patch IMMEDIATELY and SYNCHRONOUSLY on module load
// This must happen before any import of privacycash
if (isVercel) {
  patchLocalStorageForVercel();
}

// Store initialized clients per wallet (in-memory cache)
// In production, use Redis or similar for persistence across serverless invocations
const clientCache = new Map<string, any>();

// Force clear cache on module load (for development)
clientCache.clear();

export interface PrivacyCashConfig {
  rpcUrl: string;
  relayerUrl: string;
}

export interface DepositResult {
  signature: string;
  amount: number;
}

export interface WithdrawResult {
  signature: string;
  amountReceived: number;
  fee: number;
}

export interface PrivateBalance {
  lamports: number;
  sol: number;
}

/**
 * Get or create a Privacy Cash client for a wallet
 */
export async function getPrivacyCashClient(
  walletPubkey: string,
  secretKey: Uint8Array,
  config: PrivacyCashConfig
): Promise<any> {
  const cacheKey = walletPubkey;

  // Check cache first
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey);
  }

  // CRITICAL: Ensure patch is applied before importing privacycash
  // The patch redirects node-localstorage to use /tmp on Vercel
  patchLocalStorageForVercel();

  // Also ensure the cache directory exists
  ensureCacheDir();

  // Import the SDK dynamically (AFTER patching node-localstorage)
  const { PrivacyCash } = await import('privacycash');

  const client = new PrivacyCash({
    RPC_url: config.rpcUrl,
    owner: secretKey,
  });

  // Cache for future requests
  clientCache.set(cacheKey, client);

  return client;
}

/**
 * Initialize a Privacy Cash client
 */
export async function initializeClient(
  walletPubkey: string,
  secretKey: Uint8Array,
  config: PrivacyCashConfig
): Promise<{ success: boolean; balance: PrivateBalance }> {
  const client = await getPrivacyCashClient(walletPubkey, secretKey, config);

  // Get initial balance
  const balance = await client.getPrivateBalance();

  return {
    success: true,
    balance: {
      lamports: balance.lamports,
      sol: balance.lamports / LAMPORTS_PER_SOL,
    },
  };
}

/**
 * Deposit to Privacy Cash pool
 */
export async function deposit(
  walletPubkey: string,
  secretKey: Uint8Array,
  lamports: number,
  config: PrivacyCashConfig
): Promise<DepositResult> {
  const client = await getPrivacyCashClient(walletPubkey, secretKey, config);

  console.log('[deposit] Starting deposit of', lamports / LAMPORTS_PER_SOL, 'SOL');
  console.log('[deposit] Wallet pubkey:', walletPubkey);

  try {
    const result = await client.deposit({ lamports });
    console.log('[deposit] Success! Result:', result);

    return {
      signature: result.tx,
      amount: lamports,
    };
  } catch (err) {
    console.error('[deposit] Privacy Cash SDK error:', err);
    console.error('[deposit] Error message:', err instanceof Error ? err.message : 'Unknown');
    console.error('[deposit] Error stack:', err instanceof Error ? err.stack : 'No stack');
    throw err;
  }
}

/**
 * Withdraw from Privacy Cash pool
 */
export async function withdraw(
  walletPubkey: string,
  secretKey: Uint8Array,
  lamports: number,
  recipient: string | undefined,
  config: PrivacyCashConfig
): Promise<WithdrawResult> {
  const client = await getPrivacyCashClient(walletPubkey, secretKey, config);

  const result = await client.withdraw({
    lamports,
    recipientAddress: recipient,
  });

  return {
    signature: result.tx,
    amountReceived: result.amount_in_lamports,
    fee: result.fee_in_lamports,
  };
}

/**
 * Get private balance
 */
export async function getBalance(
  walletPubkey: string,
  secretKey: Uint8Array,
  config: PrivacyCashConfig
): Promise<PrivateBalance> {
  const client = await getPrivacyCashClient(walletPubkey, secretKey, config);

  const balance = await client.getPrivateBalance();

  return {
    lamports: balance.lamports,
    sol: balance.lamports / LAMPORTS_PER_SOL,
  };
}

/**
 * Clear client cache (for testing/debugging)
 */
export function clearClientCache(walletPubkey?: string): void {
  if (walletPubkey) {
    clientCache.delete(walletPubkey);
  } else {
    clientCache.clear();
  }
}
