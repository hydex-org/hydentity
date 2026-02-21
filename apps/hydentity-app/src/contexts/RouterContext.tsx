'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { RouterClient } from 'sdk/src/client';
import { RouterClientBase } from 'sdk/src/client.base';
import type { Wallet as RouterWallet } from 'sdk/src/types/wallet';
import { useNetwork } from './NetworkContext';

interface RouterContextValue {
  /** RouterClient instance (full MPC support) — null if MPC features unavailable */
  client: RouterClient | null;
  /** RouterClientBase instance (always available, no MPC) */
  baseClient: RouterClientBase | null;
  /** Whether the wallet is connected and client is ready for signing */
  isSignerReady: boolean;
}

const RouterContext = createContext<RouterContextValue>({
  client: null,
  baseClient: null,
  isSignerReady: false,
});

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const { config } = useNetwork();

  const programId = useMemo(
    () => new PublicKey(config.routerProgramId),
    [config.routerProgramId]
  );

  // Adapt wallet-adapter to SDK's Wallet interface
  const routerWallet = useMemo<RouterWallet | null>(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    return {
      publicKey,
      signTransaction: signTransaction as <T extends Transaction>(tx: T) => Promise<T>,
      signAllTransactions: signAllTransactions as <T extends Transaction>(txs: T[]) => Promise<T[]>,
    };
  }, [publicKey, signTransaction, signAllTransactions]);

  const endpoint = useMemo(() => connection.rpcEndpoint, [connection]);

  // Base client (always available, read-only if no wallet)
  const baseClient = useMemo(() => {
    return new RouterClientBase(
      endpoint,
      routerWallet ?? undefined,
      { programId }
    );
  }, [endpoint, routerWallet, programId]);

  // Full client with MPC (only when MPC features are available)
  const client = useMemo(() => {
    if (!config.features.mpcDestination) return null;
    try {
      return new RouterClient(
        endpoint,
        routerWallet ?? undefined,
        { programId }
      );
    } catch {
      console.warn('[RouterContext] Failed to initialize MPC RouterClient');
      return null;
    }
  }, [endpoint, routerWallet, programId, config.features.mpcDestination]);

  const value = useMemo<RouterContextValue>(
    () => ({
      client,
      baseClient,
      isSignerReady: connected && !!routerWallet,
    }),
    [client, baseClient, connected, routerWallet]
  );

  return (
    <RouterContext.Provider value={value}>
      {children}
    </RouterContext.Provider>
  );
}

/**
 * Hook to access the Router context
 */
export function useRouterContext(): RouterContextValue {
  return useContext(RouterContext);
}
