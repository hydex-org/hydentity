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

const DEFAULT_NETWORK: NetworkType = 'mainnet-beta';

interface NetworkContextValue {
  network: NetworkType;
  config: NetworkConfig;
  snsAdapter: SnsAdapter;
  setNetwork: (network: NetworkType) => void;
  isMainnet: boolean;
  isDevnet: boolean;
  availableNetworks: NetworkType[];
  isFeatureEnabled: (feature: keyof NetworkConfig['features']) => boolean;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

interface NetworkProviderProps {
  children: React.ReactNode;
  forceNetwork?: NetworkType;
}

export function NetworkProvider({ children, forceNetwork }: NetworkProviderProps) {
  const { connection } = useConnection();

  const [network, setNetworkState] = useState<NetworkType>(() => {
    if (forceNetwork) return forceNetwork;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'devnet' || saved === 'mainnet-beta') return saved;
    }
    return DEFAULT_NETWORK;
  });

  const config = useMemo(() => getNetworkConfig(network), [network]);
  const snsAdapter = useMemo(() => createSnsAdapter(network), [network]);
  const availableNetworks = useMemo(() => Object.keys(NETWORK_CONFIGS) as NetworkType[], []);

  const setNetwork = useCallback((newNetwork: NetworkType) => {
    if (newNetwork === network) return;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newNetwork);
      window.location.reload();
    }
  }, [network]);

  const isFeatureEnabled = useCallback(
    (feature: keyof NetworkConfig['features']) => config.features[feature],
    [config]
  );

  useEffect(() => {
    if (forceNetwork) return;
    const detected = detectNetworkFromEndpoint(connection.rpcEndpoint);
    if (detected !== network) {
      console.warn(`[NetworkContext] Mismatch: stored=${network}, RPC suggests=${detected}`);
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

export function useNetwork(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}

export function useNetworkType(): NetworkType {
  return useNetwork().network;
}

export function useIsMainnet(): boolean {
  return useNetwork().isMainnet;
}

export function useIsDevnet(): boolean {
  return useNetwork().isDevnet;
}
