/**
 * Privacy Cash Server-Side Service
 *
 * This service runs the Privacy Cash SDK on the server since it uses
 * Node.js modules that can't run in the browser.
 *
 * NOTE: On Vercel, the node-localstorage module is mocked with an in-memory
 * implementation via instrumentation.ts. This allows the SDK to work without
 * filesystem access. The cache is only for convenience - our frontend handles
 * re-initialization via browser localStorage.
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// Store initialized clients per wallet (in-memory cache)
// Note: This cache is per-invocation on serverless, so clients may be recreated
const clientCache = new Map<string, any>();

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

  // Import the SDK dynamically
  // Note: On Vercel, instrumentation.ts provides an in-memory mock for node-localstorage
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
