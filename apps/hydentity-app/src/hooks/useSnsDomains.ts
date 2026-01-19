/**
 * =============================================================================
 * SNS DOMAINS HOOK
 * =============================================================================
 *
 * Fetch and manage SNS domains for the connected wallet.
 * Uses the SNS adapter from NetworkContext for network-specific operations.
 *
 * =============================================================================
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useNetwork } from '@/contexts/NetworkContext';
import type { SnsDomain as AdapterSnsDomain } from '@/adapters/sns-adapter';

export interface SnsDomain {
  /** The human-readable domain name (without .sol) */
  domain: string;
  /** The SNS name account public key */
  nameAccount: PublicKey;
  /** Whether this is the user's primary domain */
  isPrimary: boolean;
}

interface UseSnsDomains {
  /** List of domains owned by the connected wallet */
  domains: SnsDomain[];
  /** The user's primary domain (if set) */
  primaryDomain: string | null;
  /** Whether domains are currently loading */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch domains */
  refetch: () => Promise<void>;
  /** Verify if current wallet owns a specific domain */
  verifyOwnership: (domain: string) => Promise<boolean>;
  /** Get the SNS name account for a domain */
  getNameAccount: (domain: string) => Promise<PublicKey>;
  /** Check if a domain exists on-chain */
  checkDomainExists: (domain: string) => Promise<boolean>;
}

/**
 * Convert adapter domain to hook domain format
 */
function toSnsDomain(adapterDomain: AdapterSnsDomain): SnsDomain {
  return {
    domain: adapterDomain.domain,
    nameAccount: adapterDomain.nameAccount,
    isPrimary: adapterDomain.isPrimary ?? false,
  };
}

/**
 * Hook for fetching and managing SNS domains for the connected wallet
 */
export function useSnsDomains(): UseSnsDomains {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const { snsAdapter, network } = useNetwork();

  const [domains, setDomains] = useState<SnsDomain[]>([]);
  const [primaryDomain, setPrimaryDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all domains for the connected wallet
   */
  const fetchDomains = useCallback(async () => {
    if (!connected || !publicKey) {
      setDomains([]);
      setPrimaryDomain(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use the SNS adapter to get domains (handles devnet/mainnet automatically)
      const adapterDomains = await snsAdapter.getDomainsForOwner(connection, publicKey);
      const convertedDomains = adapterDomains.map(toSnsDomain);

      setDomains(convertedDomains);

      // Set primary domain
      const primary = convertedDomains.find(d => d.isPrimary);
      setPrimaryDomain(primary?.domain || null);
    } catch (err) {
      console.error(`[useSnsDomains] Failed to fetch domains on ${network}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to fetch domains');
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey, connected, snsAdapter, network]);

  // Fetch domains when wallet connects or network changes
  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  /**
   * Verify if the current wallet owns a specific domain
   */
  const verifyOwnership = useCallback(
    async (domain: string): Promise<boolean> => {
      if (!publicKey) return false;

      try {
        return await snsAdapter.verifyOwnership(connection, domain, publicKey);
      } catch (err) {
        console.warn('[useSnsDomains] Ownership verification failed:', err);
        return false;
      }
    },
    [connection, publicKey, snsAdapter]
  );

  /**
   * Get the SNS name account public key for a domain
   */
  const getNameAccount = useCallback(
    async (domain: string): Promise<PublicKey> => {
      return snsAdapter.getDomainKey(domain);
    },
    [snsAdapter]
  );

  /**
   * Check if a domain exists on-chain
   */
  const checkDomainExists = useCallback(
    async (domain: string): Promise<boolean> => {
      try {
        return await snsAdapter.domainExists(connection, domain);
      } catch {
        return false;
      }
    },
    [connection, snsAdapter]
  );

  return {
    domains,
    primaryDomain,
    loading,
    error,
    refetch: fetchDomains,
    verifyOwnership,
    getNameAccount,
    checkDomainExists,
  };
}
