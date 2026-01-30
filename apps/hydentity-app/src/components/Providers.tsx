'use client';

import { useMemo, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { TestModeProvider } from '@/contexts/TestModeContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { NetworkType, getClientRpcEndpoint, NETWORK_CONFIGS } from '@/config/networks';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

const NETWORK_STORAGE_KEY = 'hydentity-network';

/**
 * Default network when no preference is stored
 * IMPORTANT: This must match the default in NetworkContext.tsx
 */
const DEFAULT_NETWORK: NetworkType = 'mainnet-beta';

/**
 * Get initial network from localStorage (must match NetworkContext logic)
 */
function getInitialNetwork(): NetworkType {
  if (typeof window === 'undefined') return DEFAULT_NETWORK;

  try {
    const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
    if (stored === 'devnet' || stored === 'mainnet-beta') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return DEFAULT_NETWORK;
}

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Read network from localStorage to determine RPC endpoint
  // This must be in sync with NetworkContext
  const [network, setNetwork] = useState<NetworkType>(DEFAULT_NETWORK);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const storedNetwork = getInitialNetwork();
    setNetwork(storedNetwork);
    setIsHydrated(true);

    // Listen for network changes (from NetworkContext)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === NETWORK_STORAGE_KEY && e.newValue) {
        const newNetwork = e.newValue as NetworkType;
        if (newNetwork !== network) {
          // Reload page to apply new RPC endpoint
          window.location.reload();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [network]);

  // Get RPC endpoint based on current network
  // Uses the proxy endpoint to keep API keys server-side
  const endpoint = useMemo(() => {
    return getClientRpcEndpoint(network);
  }, [network]);

  // Get WebSocket endpoint directly (not through proxy - Vercel doesn't support WS)
  const wsEndpoint = useMemo(() => {
    return NETWORK_CONFIGS[network].wsEndpoint;
  }, [network]);

  // Configure wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
    ],
    []
  );

  // Show loading state during hydration to prevent flash
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-hx-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-hx-green"></div>
      </div>
    );
  }

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed', wsEndpoint }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <NetworkProvider>
            <TestModeProvider>
              <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2 text-center text-xs text-yellow-400">
                <strong>Unaudited Software:</strong> This app has been tested but the code has not been audited. Interaction with this app could result in loss of funds. Use devnet for testing to avoid this risk.
              </div>
              {children}
            </TestModeProvider>
          </NetworkProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
