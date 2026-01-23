/**
 * Privacy Cash Deposit API
 *
 * POST /api/privacy-cash/deposit
 * Body: { walletPubkey: string, secretKey: number[], lamports: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { deposit } from '../service';
import { getPrivacyCashServerConfig } from '@/config/server-rpc';

// Get server-side config (uses HELIUS_* env vars, not exposed to client)
const PRIVACY_CASH_CONFIG = getPrivacyCashServerConfig('mainnet-beta');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletPubkey, secretKey, lamports } = body;

    if (!walletPubkey || !secretKey || !lamports) {
      return NextResponse.json(
        { error: 'Missing walletPubkey, secretKey, or lamports' },
        { status: 400 }
      );
    }

    // Convert secretKey array back to Uint8Array
    const secretKeyBytes = new Uint8Array(secretKey);

    console.log('[API/privacy-cash/deposit] Depositing', lamports / 1e9, 'SOL for wallet:', walletPubkey);

    const result = await deposit(
      walletPubkey,
      secretKeyBytes,
      lamports,
      PRIVACY_CASH_CONFIG
    );

    console.log('[API/privacy-cash/deposit] Success, tx:', result.signature);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API/privacy-cash/deposit] Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
