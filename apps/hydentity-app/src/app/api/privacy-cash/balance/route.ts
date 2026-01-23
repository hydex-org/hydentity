/**
 * Privacy Cash Balance API
 *
 * POST /api/privacy-cash/balance
 * Body: { walletPubkey: string, secretKey: number[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBalance } from '../service';
import { getPrivacyCashServerConfig } from '@/config/server-rpc';

// Get server-side config (uses HELIUS_* env vars, not exposed to client)
const PRIVACY_CASH_CONFIG = getPrivacyCashServerConfig('mainnet-beta');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletPubkey, secretKey } = body;

    if (!walletPubkey || !secretKey) {
      return NextResponse.json(
        { error: 'Missing walletPubkey or secretKey' },
        { status: 400 }
      );
    }

    // Convert secretKey array back to Uint8Array
    const secretKeyBytes = new Uint8Array(secretKey);

    const balance = await getBalance(
      walletPubkey,
      secretKeyBytes,
      PRIVACY_CASH_CONFIG
    );

    return NextResponse.json({ balance });
  } catch (error) {
    console.error('[API/privacy-cash/balance] Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
