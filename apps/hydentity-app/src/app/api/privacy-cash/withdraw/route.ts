/**
 * Privacy Cash Withdraw API
 *
 * POST /api/privacy-cash/withdraw
 * Body: { walletPubkey: string, secretKey: number[], lamports: number, recipient?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { withdraw } from '../service';
import { getPrivacyCashServerConfig } from '@/config/server-rpc';
import fs from 'fs';
import path from 'path';

// Force nodejs runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Log circuit file locations for debugging
const circuitPath = process.env.PRIVACYCASH_CIRCUIT_PATH;
console.log('[withdraw route] PRIVACYCASH_CIRCUIT_PATH:', circuitPath);
console.log('[withdraw route] cwd:', process.cwd());

// Check multiple possible locations
const possiblePaths = [
  circuitPath ? `${circuitPath}.wasm` : null,
  path.join(process.cwd(), 'circuit2', 'transaction2.wasm'),
  path.join(process.cwd(), '..', '..', 'circuit2', 'transaction2.wasm'),
  '/var/task/circuit2/transaction2.wasm',
].filter(Boolean) as string[];

for (const p of possiblePaths) {
  console.log(`[withdraw route] Checking ${p}: ${fs.existsSync(p)}`);
}

// Get server-side config (uses HELIUS_* env vars, not exposed to client)
const PRIVACY_CASH_CONFIG = getPrivacyCashServerConfig('mainnet-beta');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletPubkey, secretKey, lamports, recipient } = body;

    if (!walletPubkey || !secretKey || !lamports) {
      return NextResponse.json(
        { error: 'Missing walletPubkey, secretKey, or lamports' },
        { status: 400 }
      );
    }

    // Convert secretKey array back to Uint8Array
    const secretKeyBytes = new Uint8Array(secretKey);

    console.log('[API/privacy-cash/withdraw] Withdrawing', lamports / 1e9, 'SOL for wallet:', walletPubkey);
    if (recipient) {
      console.log('[API/privacy-cash/withdraw] Recipient:', recipient);
    }

    const result = await withdraw(
      walletPubkey,
      secretKeyBytes,
      lamports,
      recipient,
      PRIVACY_CASH_CONFIG
    );

    console.log('[API/privacy-cash/withdraw] Success, tx:', result.signature);
    console.log('[API/privacy-cash/withdraw] Amount received:', result.amountReceived / 1e9, 'SOL');
    console.log('[API/privacy-cash/withdraw] Fee:', result.fee / 1e9, 'SOL');

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API/privacy-cash/withdraw] Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
