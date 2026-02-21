'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRouterContext } from '@/contexts/RouterContext';
import type { Vault } from 'sdk/src/accounts/vault';
import type { Pool } from 'sdk/src/accounts/pool';
import { SUPPORTED_MINTS } from 'sdk/src/utils/const';
import { derivePoolAddress } from 'sdk/src/utils/pda';

interface UseVaultsReturn {
  vaults: Vault[];
  pools: Map<string, Pool>;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches all vaults owned by the connected wallet and their associated pools.
 */
export function useVaults(): UseVaultsReturn {
  const { baseClient, isSignerReady } = useRouterContext();
  const { publicKey } = useWallet();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [pools, setPools] = useState<Map<string, Pool>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVaults = useCallback(async () => {
    if (!baseClient || !publicKey) {
      setVaults([]);
      setPools(new Map());
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const userVaults = await baseClient.getAllVaultsByOwner({
        owner: publicKey,
      });
      setVaults(userVaults);

      // Fetch unique pools for these vaults
      const poolMap = new Map<string, Pool>();
      const uniquePoolAddresses = [...new Set(userVaults.map(v => v.poolAddress.toBase58()))];

      for (const poolAddr of uniquePoolAddresses) {
        try {
          // Find a mint for this pool by checking supported mints
          for (const mint of SUPPORTED_MINTS) {
            const derived = derivePoolAddress(baseClient['programId'], mint);
            if (derived.toBase58() === poolAddr) {
              const pool = await baseClient.getPool(mint);
              poolMap.set(poolAddr, pool);
              break;
            }
          }
        } catch {
          // Pool fetch failed, continue
        }
      }

      setPools(poolMap);
    } catch (err: any) {
      console.error('[useVaults] Failed to fetch vaults:', err);
      setError(err.message || 'Failed to fetch vaults');
    } finally {
      setIsLoading(false);
    }
  }, [baseClient, publicKey]);

  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

  return { vaults, pools, isLoading, error, refetch: fetchVaults };
}
