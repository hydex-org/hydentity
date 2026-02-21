/**
 * =============================================================================
 * NETWORK CONFIGURATION — Router V2
 * =============================================================================
 *
 * Central configuration for network-specific settings.
 * All Privacy Cash / old Hydentity program references removed.
 * The Router SDK provides the default ROUTER_PROGRAM_ID, but we allow
 * per-network overrides (e.g. devnet deployment differs from SDK default).
 *
 * NOTE: Client-side RPC calls go through /api/rpc/[network] proxy to keep
 * API keys server-side.
 * =============================================================================
 */

import { PublicKey } from '@solana/web3.js';

export type NetworkType = 'devnet' | 'mainnet-beta';

export interface NetworkConfig {
  name: NetworkType;
  displayName: string;
  rpcEndpoint: string;
  wsEndpoint?: string;
  routerProgramId: string;
  features: {
    domainTransfer: boolean;
    mpcDestination: boolean;
  };
  explorerUrl: string;
}

/**
 * Network configurations
 *
 * devnet uses the live Router deployment.
 * mainnet config is placeholder until Router is deployed there.
 */
export const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  'devnet': {
    name: 'devnet',
    displayName: 'Devnet',
    rpcEndpoint: 'https://api.devnet.solana.com',
    wsEndpoint: process.env.NEXT_PUBLIC_DEVNET_WS || 'wss://api.devnet.solana.com',
    routerProgramId: 'GjsWbz3UbnNDpxhteaZsobibXDiwmDbGmtifXymvRYz1',
    features: {
      domainTransfer: true,
      mpcDestination: true,
    },
    explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
  },
  'mainnet-beta': {
    name: 'mainnet-beta',
    displayName: 'Mainnet',
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    wsEndpoint: process.env.NEXT_PUBLIC_MAINNET_WS || 'wss://api.mainnet-beta.solana.com',
    routerProgramId: 'GjsWbz3UbnNDpxhteaZsobibXDiwmDbGmtifXymvRYz1',
    features: {
      domainTransfer: true,
      mpcDestination: false, // Arcium not on mainnet yet
    },
    explorerUrl: 'https://explorer.solana.com',
  },
};

/**
 * Get the RPC endpoint for client-side use.
 * Uses the proxy endpoint to keep API keys server-side.
 */
export function getClientRpcEndpoint(network: NetworkType): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/rpc/${network}`;
  }
  if (network === 'devnet') {
    return process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
  }
  return process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
}

/**
 * Get configuration for a specific network
 */
export function getNetworkConfig(network: NetworkType): NetworkConfig {
  const config = NETWORK_CONFIGS[network];
  if (!config) {
    throw new Error(`Unknown network: ${network}`);
  }
  return config;
}

/**
 * Detect network type from RPC endpoint URL
 */
export function detectNetworkFromEndpoint(endpoint: string): NetworkType {
  const lower = endpoint.toLowerCase();
  if (lower.includes('devnet') || lower.includes('localhost') || lower.includes('127.0.0.1')) {
    return 'devnet';
  }
  return 'mainnet-beta';
}

/**
 * Check if a feature is enabled for a network
 */
export function isFeatureEnabled(
  network: NetworkType,
  feature: keyof NetworkConfig['features']
): boolean {
  return NETWORK_CONFIGS[network].features[feature];
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerTxUrl(network: NetworkType, signature: string): string {
  const clusterParam = network === 'devnet' ? 'cluster=devnet&' : '';
  return `https://orbmarkets.io/tx/${signature}?${clusterParam}tab=summary`;
}

/**
 * Get explorer URL for an address
 */
export function getExplorerAddressUrl(network: NetworkType, address: string): string {
  const config = NETWORK_CONFIGS[network];
  const clusterParam = network === 'devnet' ? '?cluster=devnet' : '';
  return `${config.explorerUrl}/address/${address}${clusterParam}`;
}
