'use client';

/**
 * =============================================================================
 * SNS DOMAINS HOOK - Fetch and manage SNS domains for connected wallet
 * =============================================================================
 *
 * ⚠️  MAINNET TRANSITION: Search for "DEVNET_ONLY" to find devnet-specific code
 *
 * =============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  getAllDomains,
  reverseLookup,
  getPrimaryDomain,
  getDomainKeySync,
  NameRegistryState,
  devnet,
} from '@bonfida/spl-name-service';

/**
 * DEVNET_ONLY: Check if we're on devnet (based on RPC endpoint)
 */
function isDevnet(endpoint: string): boolean {
  return endpoint.includes('devnet') || endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
}

/**
 * DEVNET_ONLY: Find all domains owned by a wallet using devnet.utils.reverseLookup
 *
 * On devnet, the domain name is stored in reverse lookup accounts. We:
 * 1. Get all main domain accounts owned by the wallet (500+ bytes)
 * 2. Use devnet.utils.reverseLookup to get the domain name for each
 */
async function findDomainsFromReverseLookups(
  connection: Connection,
  targetOwner: PublicKey
): Promise<{ domain: string; nameAccount: PublicKey }[]> {
  const results: { domain: string; nameAccount: PublicKey }[] = [];
  const SNS_NAME_PROGRAM_ID = new PublicKey('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX');

  try {
    // Get all SNS accounts owned by the wallet
    const ownedAccounts = await connection.getProgramAccounts(SNS_NAME_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 32, bytes: targetOwner.toBase58() } },
      ],
    });

    // Filter to main domain accounts (500+ bytes) vs smaller metadata accounts
    const mainDomainAccounts = ownedAccounts.filter(acc => acc.account.data.length >= 500);

    // Resolve domain names using devnet reverse lookup
    for (const owned of mainDomainAccounts) {
      try {
        const domain = await devnet.utils.reverseLookup(connection, owned.pubkey);
        if (domain && domain.length > 0) {
          results.push({ domain: domain.toLowerCase(), nameAccount: owned.pubkey });
        }
      } catch {
        // Skip accounts that fail reverse lookup
      }
    }
  } catch (error) {
    console.error('[Devnet] Failed to find domains:', error);
  }

  return results;
}

/**
 * DEVNET_ONLY: Find all SNS name accounts associated with a wallet on devnet
 *
 * Uses devnet.utils.reverseLookup to resolve domain names for owned accounts.
 */
async function fetchDevnetDomains(
  connection: Connection,
  owner: PublicKey
): Promise<SnsDomain[]> {
  try {
    const foundDomains = await findDomainsFromReverseLookups(connection, owner);

    const domains: SnsDomain[] = foundDomains.map(({ domain, nameAccount }) => ({
      domain,
      nameAccount,
      isPrimary: false,
    }));

    // Sort alphabetically and mark first as primary
    domains.sort((a, b) => a.domain.localeCompare(b.domain));
    if (domains.length > 0) {
      domains[0].isPrimary = true;
    }

    return domains;
  } catch (error) {
    console.error('[Devnet] Failed to fetch domains:', error);
    return [];
  }
}

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
 * Hook for fetching and managing SNS domains for the connected wallet
 */
export function useSnsDomains(): UseSnsDomains {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  
  const [domains, setDomains] = useState<SnsDomain[]>([]);
  const [primaryDomain, setPrimaryDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoint = connection.rpcEndpoint;
  const onDevnet = isDevnet(endpoint);

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
      // DEVNET_ONLY: Use devnet-specific lookup
      if (onDevnet) {
        const devnetDomains = await fetchDevnetDomains(connection, publicKey);
        setDomains(devnetDomains);
        setPrimaryDomain(devnetDomains.find(d => d.isPrimary)?.domain || null);
        setLoading(false);
        return;
      }

      // On mainnet, use Bonfida SDK
      // Fetch primary domain first
      let primary: string | null = null;
      try {
        const { reverse } = await getPrimaryDomain(connection, publicKey);
        primary = reverse;
        setPrimaryDomain(reverse);
      } catch {
        // No primary domain set
        setPrimaryDomain(null);
      }

      // Fetch all domain keys
      const domainKeys = await getAllDomains(connection, publicKey);
      
      if (domainKeys.length === 0) {
        setDomains([]);
        setLoading(false);
        return;
      }

      // Reverse lookup each domain to get the human-readable name
      const domainPromises = domainKeys.map(async (nameAccount): Promise<SnsDomain | null> => {
        try {
          const domain = await reverseLookup(connection, nameAccount);
          return {
            domain,
            nameAccount,
            isPrimary: domain === primary,
          };
        } catch {
          // Skip domains that fail reverse lookup
          return null;
        }
      });

      const results = await Promise.all(domainPromises);
      const validDomains = results.filter((d): d is SnsDomain => d !== null);
      
      // Sort with primary domain first, then alphabetically
      validDomains.sort((a, b) => {
        if (a.isPrimary) return -1;
        if (b.isPrimary) return 1;
        return a.domain.localeCompare(b.domain);
      });

      setDomains(validDomains);
    } catch (err) {
      console.error('Failed to fetch SNS domains:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch domains');
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey, connected, onDevnet]);

  // Fetch domains when wallet connects
  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  /**
   * Verify if the current wallet owns a specific domain
   */
  const verifyOwnership = useCallback(async (domain: string): Promise<boolean> => {
    if (!publicKey) return false;

    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');

    // DEVNET_ONLY: Use devnet lookup
    if (onDevnet) {
      try {
        const ownedDomains = await fetchDevnetDomains(connection, publicKey);
        return ownedDomains.some(d => d.domain === cleanDomain);
      } catch {
        return false;
      }
    }

    // Mainnet: Use Bonfida SDK
    try {
      const { pubkey } = getDomainKeySync(cleanDomain);
      const { registry } = await NameRegistryState.retrieve(connection, pubkey);
      return registry.owner.equals(publicKey);
    } catch {
      return false;
    }
  }, [connection, publicKey, onDevnet]);

  /**
   * Get the SNS name account public key for a domain
   */
  const getNameAccount = useCallback(async (domain: string): Promise<PublicKey> => {
    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');

    // DEVNET_ONLY: Try devnet derivation first
    if (onDevnet) {
      try {
        const { pubkey } = devnet.utils.getDomainKeySync(cleanDomain);
        return pubkey;
      } catch {
        // Fall through to mainnet derivation
      }
    }

    // Mainnet: Use Bonfida SDK derivation
    const { pubkey } = getDomainKeySync(cleanDomain);
    return pubkey;
  }, [onDevnet]);

  /**
   * Check if a domain exists on-chain
   */
  const checkDomainExists = useCallback(async (domain: string): Promise<boolean> => {
    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');

    // DEVNET_ONLY: Check using devnet derivation
    if (onDevnet) {
      try {
        const { pubkey } = devnet.utils.getDomainKeySync(cleanDomain);
        const accountInfo = await connection.getAccountInfo(pubkey);
        return accountInfo !== null;
      } catch {
        return false;
      }
    }

    // Mainnet: Use Bonfida SDK
    try {
      const { pubkey } = getDomainKeySync(cleanDomain);
      const accountInfo = await connection.getAccountInfo(pubkey);
      return accountInfo !== null;
    } catch {
      return false;
    }
  }, [connection, onDevnet]);

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
