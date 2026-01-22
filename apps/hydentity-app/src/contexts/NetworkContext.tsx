/**
 * =============================================================================
 * NETWORK CONTEXT
 * =============================================================================
 *
 * Provides network configuration and SNS adapter to the entire application.
 * This is the single source of truth for network-specific behavior.
 *
 * Usage:
 *   const { network, config, snsAdapter, setNetwork } = useNetwork();
 *
 * =============================================================================
 */

'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import {
  NetworkType,
  NetworkConfig,
  getNetworkConfig,
  detectNetworkFromEndpoint,
  NETWORK_CONFIGS,
} from '../config/networks';
import { createSnsAdapter, SnsAdapter } from '../adapters/sns-adapter';

const STORAGE_KEY = 'hydentity-network';

/**
 * Default network when no preference is stored
 * IMPORTANT: This must match the default in Providers.tsx
 */
const DEFAULT_NETWORK: NetworkType = 'mainnet-beta';

interface NetworkContextValue {
  /** Current network */
  network: NetworkType;

  /** Full network configuration */
  config: NetworkConfig;

  /** SNS adapter for current network */
  snsAdapter: SnsAdapter;

  /** Change network (requires page reload to take effect) */
  setNetwork: (network: NetworkType) => void;

  /** Convenience: is current network mainnet */
  isMainnet: boolean;

  /** Convenience: is current network devnet */
  isDevnet: boolean;

  /** All available networks */
  availableNetworks: NetworkType[];

  /** Check if a feature is enabled on current network */
  isFeatureEnabled: (feature: keyof NetworkConfig['features']) => boolean;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

interface NetworkProviderProps {
  children: React.ReactNode;
  /** Force a specific network (useful for testing) */
  forceNetwork?: NetworkType;
}

export function NetworkProvider({ children, forceNetwork }: NetworkProviderProps) {
  const { connection } = useConnection();

  // Initialize network from localStorage or use default
  // IMPORTANT: This logic must match Providers.tsx to avoid hydration mismatch
  const [network, setNetworkState] = useState<NetworkType>(() => {
    if (forceNetwork) return forceNetwork;

    // Check localStorage first (client-side only)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'devnet' || saved === 'mainnet-beta') {
        return saved;
      }
    }

    // Use consistent default (must match Providers.tsx)
    return DEFAULT_NETWORK;
  });

  // Derive config and adapter from network
  const config = useMemo(() => getNetworkConfig(network), [network]);
  const snsAdapter = useMemo(() => createSnsAdapter(network), [network]);

  // Available networks
  const availableNetworks = useMemo(
    () => Object.keys(NETWORK_CONFIGS) as NetworkType[],
    []
  );

  /**
   * Set network and persist to localStorage
   * Triggers a page reload to apply new RPC connection
   */
  const setNetwork = useCallback((newNetwork: NetworkType) => {
    if (newNetwork === network) return;

    console.log(`[NetworkContext] Switching network from ${network} to ${newNetwork}`);

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newNetwork);
      // Reload page to apply new RPC endpoint
      // The Providers component will read the new network from localStorage
      window.location.reload();
    }
  }, [network]);

  /**
   * Check if a feature is enabled on current network
   */
  const isFeatureEnabled = useCallback(
    (feature: keyof NetworkConfig['features']) => {
      return config.features[feature];
    },
    [config]
  );

  // Log network mismatch between stored preference and actual RPC
  useEffect(() => {
    if (forceNetwork) return;

    const detectedNetwork = detectNetworkFromEndpoint(connection.rpcEndpoint);
    if (detectedNetwork !== network) {
      console.warn(
        `[NetworkContext] Network mismatch: stored=${network}, RPC suggests=${detectedNetwork}. ` +
        `This can happen if NEXT_PUBLIC_RPC_ENDPOINT doesn't match stored preference.`
      );
    }
  }, [connection.rpcEndpoint, network, forceNetwork]);

  const value = useMemo<NetworkContextValue>(
    () => ({
      network,
      config,
      snsAdapter,
      setNetwork,
      isMainnet: network === 'mainnet-beta',
      isDevnet: network === 'devnet',
      availableNetworks,
      isFeatureEnabled,
    }),
    [network, config, snsAdapter, setNetwork, availableNetworks, isFeatureEnabled]
  );

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

/**
 * Hook to access network context
 *
 * @throws Error if used outside NetworkProvider
 */
export function useNetwork(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}

/**
 * Hook to get just the current network type
 * Lighter weight than full useNetwork if you only need the network name
 */
export function useNetworkType(): NetworkType {
  const { network } = useNetwork();
  return network;
}

/**
 * Hook to check if current network is mainnet
 */
export function useIsMainnet(): boolean {
  const { isMainnet } = useNetwork();
  return isMainnet;
}

/**
 * Hook to check if current network is devnet
 */
export function useIsDevnet(): boolean {
  const { isDevnet } = useNetwork();
  return isDevnet;
}
