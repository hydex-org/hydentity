'use client';

/**
 * =============================================================================
 * SNS DOMAINS HOOK - Fetch and manage SNS domains for connected wallet
 * =============================================================================
 * 
 * ⚠️  MAINNET TRANSITION CHECKLIST - Search for "DEVNET_ONLY" in this file
 * 
 * Before deploying to mainnet:
 * 1. DEVNET_SNS_DOMAINS - Remove entirely (use Bonfida SDK only)
 * 2. fetchDomains() - Remove devnet-specific logic
 * 3. getNameAccount() - Remove devnet check
 * 4. verifyOwnership() - Remove devnet check
 * 
 * =============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  getAllDomains,
  reverseLookup,
  getPrimaryDomain,
  getDomainKeySync,
  NameRegistryState,
} from '@bonfida/spl-name-service';

/**
 * DEVNET_ONLY: Hardcoded devnet SNS domains for testing
 * 
 * On devnet, the Bonfida SDK's getDomainKeySync and getAllDomains don't work
 * correctly because devnet SNS uses a different TLD authority.
 * 
 * TODO for mainnet: Remove this entire mapping
 */
const DEVNET_SNS_DOMAINS: Record<string, { nameAccount: string; owner: string }> = {
  'hydentity': {
    nameAccount: '9PqfhsmVFZ3UVmSCwcqUZx8dEbxr4R65AQeGAAcQKZCa',
    owner: '3smkPvNBjbeh4KSnwqVWGK2Pk9MeW6ShHXj5YKf3r8Wg',
  },
};

/**
 * DEVNET_ONLY: Check if we're on devnet (based on RPC endpoint)
 * TODO for mainnet: Remove or simplify this function
 */
function isDevnet(endpoint: string): boolean {
  return endpoint.includes('devnet') || endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
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
  getNameAccount: (domain: string) => PublicKey;
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
      // On devnet, use hardcoded mappings
      if (onDevnet) {
        console.log('[Devnet] Using hardcoded SNS domain mappings');
        
        const walletAddress = publicKey.toBase58();
        const devnetDomains: SnsDomain[] = [];
        
        // Check which hardcoded domains belong to this wallet
        for (const [domainName, info] of Object.entries(DEVNET_SNS_DOMAINS)) {
          if (info.owner === walletAddress) {
            devnetDomains.push({
              domain: domainName,
              nameAccount: new PublicKey(info.nameAccount),
              isPrimary: devnetDomains.length === 0, // First one is "primary"
            });
          }
        }
        
        if (devnetDomains.length > 0) {
          console.log('[Devnet] Found domains:', devnetDomains.map(d => d.domain));
        } else {
          console.log('[Devnet] No hardcoded domains for wallet:', walletAddress);
        }
        
        setDomains(devnetDomains);
        setPrimaryDomain(devnetDomains.length > 0 ? devnetDomains[0].domain : null);
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
    
    // On devnet, check hardcoded mapping
    if (onDevnet) {
      const devnetInfo = DEVNET_SNS_DOMAINS[cleanDomain];
      if (devnetInfo) {
        return devnetInfo.owner === publicKey.toBase58();
      }
      return false;
    }

    // On mainnet, use Bonfida SDK
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
  const getNameAccount = useCallback((domain: string): PublicKey => {
    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
    
    // On devnet, check hardcoded mapping first
    if (onDevnet) {
      const devnetInfo = DEVNET_SNS_DOMAINS[cleanDomain];
      if (devnetInfo) {
        return new PublicKey(devnetInfo.nameAccount);
      }
    }
    
    // Fall back to Bonfida SDK derivation
    const { pubkey } = getDomainKeySync(cleanDomain);
    return pubkey;
  }, [onDevnet]);

  /**
   * Check if a domain exists on-chain
   */
  const checkDomainExists = useCallback(async (domain: string): Promise<boolean> => {
    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
    
    // On devnet, check hardcoded mapping
    if (onDevnet) {
      const devnetInfo = DEVNET_SNS_DOMAINS[cleanDomain];
      if (devnetInfo) {
        const accountInfo = await connection.getAccountInfo(new PublicKey(devnetInfo.nameAccount));
        return accountInfo !== null;
      }
      return false;
    }

    // On mainnet, use Bonfida SDK
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
