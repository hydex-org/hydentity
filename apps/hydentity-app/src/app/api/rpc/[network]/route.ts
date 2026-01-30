/**
 * RPC Proxy API Route
 *
 * Proxies JSON-RPC requests to the actual RPC endpoint (e.g., Helius)
 * keeping API keys server-side only.
 *
 * POST /api/rpc/devnet - Proxy to devnet RPC
 * POST /api/rpc/mainnet-beta - Proxy to mainnet RPC
 */

import { NextRequest, NextResponse } from 'next/server';

// Server-side only RPC endpoints (NOT prefixed with NEXT_PUBLIC_)
const RPC_ENDPOINTS: Record<string, string> = {
  'devnet': process.env.DEVNET_RPC || 'https://api.devnet.solana.com',
  'mainnet-beta': process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com',
};

// Allowed JSON-RPC methods (whitelist for security)
const ALLOWED_METHODS = new Set([
  // Account methods
  'getAccountInfo',
  'getBalance',
  'getMultipleAccounts',
  'getProgramAccounts',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getTokenLargestAccounts',
  'getTokenSupply',

  // Transaction methods
  'getTransaction',
  'getSignaturesForAddress',
  'getSignatureStatuses',
  'sendTransaction',
  'simulateTransaction',

  // Block methods
  'getBlock',
  'getBlockHeight',
  'getBlockTime',
  'getBlocks',
  'getLatestBlockhash',
  'getRecentBlockhash', // deprecated but still used
  'isBlockhashValid',

  // Slot methods
  'getSlot',
  'getSlotLeader',

  // Network methods
  'getHealth',
  'getVersion',
  'getClusterNodes',
  'getEpochInfo',
  'getMinimumBalanceForRentExemption',
  'getFeeForMessage',
  'getRecentPrioritizationFees',

  // Subscription-related (for polling fallback)
  'getConfirmedTransaction',
  'getConfirmedBlock',
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ network: string }> }
) {
  const { network } = await params;

  // Validate network
  const rpcEndpoint = RPC_ENDPOINTS[network];
  if (!rpcEndpoint) {
    return NextResponse.json(
      { error: `Invalid network: ${network}` },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    // Handle both single requests and batch requests
    const requests = Array.isArray(body) ? body : [body];

    // Validate all methods in the request
    for (const req of requests) {
      if (!req.method || !ALLOWED_METHODS.has(req.method)) {
        return NextResponse.json(
          { error: `Method not allowed: ${req.method}` },
          { status: 403 }
        );
      }
    }

    // Forward the request to the actual RPC endpoint
    const response = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RPC Proxy] Upstream error for ${network}:`, response.status, errorText);
      return NextResponse.json(
        { error: 'RPC request failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error(`[RPC Proxy] Error for ${network}:`, error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'RPC proxy error', details: message },
      { status: 500 }
    );
  }
}

// Also support GET for health checks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ network: string }> }
) {
  const { network } = await params;

  const rpcEndpoint = RPC_ENDPOINTS[network];
  if (!rpcEndpoint) {
    return NextResponse.json(
      { error: `Invalid network: ${network}` },
      { status: 400 }
    );
  }

  // Health check - verify RPC is reachable
  try {
    const response = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth',
      }),
    });

    if (response.ok) {
      return NextResponse.json({ status: 'ok', network });
    } else {
      return NextResponse.json(
        { status: 'error', network, message: 'RPC unhealthy' },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { status: 'error', network, message: 'RPC unreachable' },
      { status: 503 }
    );
  }
}
