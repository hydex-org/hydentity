/**
 * =============================================================================
 * SERVER-SIDE RPC CONFIGURATION
 * =============================================================================
 *
 * This file provides RPC endpoints for server-side code (API routes).
 * These use the HELIUS_* environment variables which are NOT exposed to clients.
 *
 * For client-side code, use the proxy endpoint from networks.ts instead.
 * =============================================================================
 */

import { NetworkType } from './networks';

/**
 * Get the actual RPC endpoint for server-side use only.
 * This returns the Helius URL with API key for direct server-to-RPC communication.
 *
 * IMPORTANT: Never expose these URLs to the client!
 */
export function getServerRpcEndpoint(network: NetworkType): string {
  if (network === 'devnet') {
    return process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
  }

  return process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
}

/**
 * Get Privacy Cash configuration for server-side use
 */
export function getPrivacyCashServerConfig(network: NetworkType = 'mainnet-beta') {
  return {
    rpcUrl: getServerRpcEndpoint(network),
    relayerUrl: network === 'mainnet-beta'
      ? 'https://api3.privacycash.org'
      : '', // No devnet relayer
  };
}
