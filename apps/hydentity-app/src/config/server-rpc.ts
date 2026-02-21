/**
 * SERVER-SIDE RPC CONFIGURATION
 *
 * RPC endpoints for server-side code (API routes).
 * Uses environment variables NOT exposed to clients.
 * For client-side code, use the proxy endpoint from networks.ts.
 */

import { NetworkType } from './networks';

export function getServerRpcEndpoint(network: NetworkType): string {
  if (network === 'devnet') {
    return process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
  }
  return process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
}
