'use client';

import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useRouterContext } from '@/contexts/RouterContext';
import type { Pool } from 'sdk/src/accounts/pool';
import { SYSTEM_PROGRAM_ID } from 'sdk/src/utils/spl';

interface UsePoolReturn {
  pool: Pool | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches a single pool by asset mint. Defaults to SOL pool.
 */
export function usePool(assetMint?: PublicKey): UsePoolReturn {
  const { baseClient } = useRouterContext();
  const [pool, setPool] = useState<Pool | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mint = assetMint ?? SYSTEM_PROGRAM_ID;

  const fetchPool = useCallback(async () => {
    if (!baseClient) {
      setPool(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const fetchedPool = await baseClient.getPool(mint);
      setPool(fetchedPool);
    } catch (err: any) {
      console.error('[usePool] Failed to fetch pool:', err);
      setError(err.message || 'Failed to fetch pool');
    } finally {
      setIsLoading(false);
    }
  }, [baseClient, mint.toBase58()]);

  useEffect(() => {
    fetchPool();
  }, [fetchPool]);

  return { pool, isLoading, error, refetch: fetchPool };
}
