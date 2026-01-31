/**
 * =============================================================================
 * NETWORK CONFIGURATION
 * =============================================================================
 *
 * Central configuration for all network-specific settings.
 * This is the single source of truth for devnet vs mainnet differences.
 *
 * To add a new network or modify settings, update NETWORK_CONFIGS below.
 *
 * NOTE: Client-side RPC calls go through /api/rpc/[network] proxy to keep
 * API keys server-side. See src/app/api/rpc/[network]/route.ts
 * =============================================================================
 */

import { PublicKey } from '@solana/web3.js';

export type NetworkType = 'devnet' | 'mainnet-beta';

/**
 * Get the RPC endpoint for client-side use.
 * Uses the proxy endpoint to keep API keys server-side.
 *
 * IMPORTANT: Call this function at runtime (e.g., in useEffect or event handlers),
 * not at module load time, since window.location is not available during SSR.
 */
export function getClientRpcEndpoint(network: NetworkType): string {
  // In browser, use the proxy endpoint with full URL (Connection requires http/https)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/rpc/${network}`;
  }
  // During SSR/build, use a placeholder (will be replaced client-side)
  // This should never actually be used since ConnectionProvider only runs client-side
  if (network === 'devnet') {
    return process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
  }
  return process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
}

export interface PrivacyCashConfig {
  programId: PublicKey;
  relayerUrl: string;
  enabled: boolean;
}

export interface ArciumConfig {
  programId: PublicKey;
  feePoolAddress: PublicKey;
  clockAddress: PublicKey;
  mxeAddress: PublicKey;
  clusterOffset: number;
  enabled: boolean;
}

export interface NetworkFeatures {
  /** Arcium MPC withdrawals available */
  mpcWithdrawals: boolean;
  /** Privacy Cash routing available */
  privacyCashRouting: boolean;
  /** SNS domain transfer to vault */
  domainTransfer: boolean;
  /** Direct (non-private) withdrawals */
  directWithdrawals: boolean;
}

export interface NetworkConfig {
  /** Network identifier */
  name: NetworkType;
  /** Display name for UI */
  displayName: string;
  /** Default RPC endpoint */
  rpcEndpoint: string;
  /** WebSocket endpoint (optional) */
  wsEndpoint?: string;

  /** Hydentity program ID */
  hydentityProgramId: PublicKey;

  /** Privacy Cash configuration (optional) */
  privacyCash?: PrivacyCashConfig;

  /** Arcium MPC configuration (optional) */
  arcium?: ArciumConfig;

  /** Feature flags */
  features: NetworkFeatures;

  /** Solana Explorer base URL */
  explorerUrl: string;
}

/**
 * Network configurations
 *
 * IMPORTANT: Update mainnet hydentityProgramId after deployment!
 */
export const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  'devnet': {
    name: 'devnet',
    displayName: 'Devnet',
    // Note: rpcEndpoint is a placeholder - use getClientRpcEndpoint() at runtime for actual URL
    rpcEndpoint: 'https://api.devnet.solana.com',
    wsEndpoint: process.env.NEXT_PUBLIC_DEVNET_WS || 'wss://api.devnet.solana.com',

    hydentityProgramId: new PublicKey('7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx'),

    privacyCash: {
      programId: new PublicKey('ATZj4jZ4FFzkvAcvk27DW9GRkgSbFnHo49fKKPQXU7VS'),
      relayerUrl: '', // No public devnet relayer available
      enabled: false, // Disabled until devnet relayer is available
    },

    arcium: {
      programId: new PublicKey('F3G6Q9tRicyznCqcZLydJ6RxkwDSBeHWM458J7V6aeyk'),
      feePoolAddress: new PublicKey('BSC6rWJ9ucqZ6rcM3knfpgdRwCyJ7Q9KsddjeSL4EdHq'),
      clockAddress: new PublicKey('EQr6UCd7eyRjpuRsNK6a8WxkgrpSGctKMFuz92FRRh63'),
      mxeAddress: new PublicKey('2opbTHbmUSS8wke3aXdft3pwwNzj7pAwL9qj9Y1f8Hty'),
      clusterOffset: 0,
      enabled: true,
    },

    features: {
      mpcWithdrawals: true,
      privacyCashRouting: false, // No devnet relayer
      domainTransfer: true,
      directWithdrawals: true,
    },

    explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
  },

  'mainnet-beta': {
    name: 'mainnet-beta',
    displayName: 'Mainnet',
    // Note: rpcEndpoint is a placeholder - use getClientRpcEndpoint() at runtime for actual URL
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    wsEndpoint: process.env.NEXT_PUBLIC_MAINNET_WS || 'wss://api.mainnet-beta.solana.com',

    // Same program ID as devnet (using same keypair for deployment)
    hydentityProgramId: new PublicKey('7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx'),

    privacyCash: {
      programId: new PublicKey('9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD'),
      relayerUrl: 'https://api3.privacycash.org',
      enabled: true,
    },

    arcium: undefined, // Arcium not yet on mainnet

    features: {
      mpcWithdrawals: false, // Arcium not on mainnet yet
      privacyCashRouting: true, // Privacy Cash available on mainnet
      domainTransfer: true,
      directWithdrawals: true,
    },

    explorerUrl: 'https://explorer.solana.com',
  },
};

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
  const lowerEndpoint = endpoint.toLowerCase();
  if (
    lowerEndpoint.includes('devnet') ||
    lowerEndpoint.includes('localhost') ||
    lowerEndpoint.includes('127.0.0.1')
  ) {
    return 'devnet';
  }
  return 'mainnet-beta';
}

/**
 * Get the appropriate RPC endpoint for a network
 * @deprecated Use getClientRpcEndpoint() for client-side or getServerRpcEndpoint() for server-side
 */
export function getRpcEndpoint(network: NetworkType): string {
  return getClientRpcEndpoint(network);
}

/**
 * Check if a feature is enabled for a network
 */
export function isFeatureEnabled(
  network: NetworkType,
  feature: keyof NetworkFeatures
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
