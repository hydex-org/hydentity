'use client';

import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import { TestModeProvider } from '@/contexts/TestModeContext';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Use devnet for development
  const endpoint = useMemo(() => clusterApiUrl('devnet'), []);

  // Configure wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <TestModeProvider>
            {children}
          </TestModeProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

