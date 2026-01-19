/**
 * =============================================================================
 * SNS ADAPTER
 * =============================================================================
 *
 * Abstracts SNS (Solana Name Service) operations for different networks.
 *
 * Devnet and mainnet use different PDA derivation methods:
 * - Devnet: Uses devnet.utils from @bonfida/spl-name-service
 * - Mainnet: Uses standard Bonfida SDK functions
 *
 * This adapter encapsulates these differences so consuming code doesn't need
 * to handle network-specific logic.
 * =============================================================================
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  getDomainKeySync,
  getAllDomains,
  reverseLookup,
  getPrimaryDomain,
  NameRegistryState,
  devnet,
} from '@bonfida/spl-name-service';
import type { NetworkType } from '../config/networks';

/** SNS Name Service Program ID (same on all networks) */
export const SNS_NAME_PROGRAM_ID = new PublicKey('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX');

export interface SnsDomain {
  /** Human-readable domain name (without .sol) */
  domain: string;
  /** SNS name account public key */
  nameAccount: PublicKey;
  /** Whether this is the user's primary domain */
  isPrimary?: boolean;
}

export interface SnsAdapter {
  /** Get the network this adapter is for */
  readonly network: NetworkType;

  /** Get SNS name account PDA for a domain */
  getDomainKey(domain: string): PublicKey;

  /** Reverse lookup: name account -> domain name */
  reverseLookup(connection: Connection, nameAccount: PublicKey): Promise<string | null>;

  /** Get all domains owned by a wallet */
  getDomainsForOwner(connection: Connection, owner: PublicKey): Promise<SnsDomain[]>;

  /** Verify if a wallet owns a specific domain */
  verifyOwnership(connection: Connection, domain: string, owner: PublicKey): Promise<boolean>;

  /** Check if a domain exists on-chain */
  domainExists(connection: Connection, domain: string): Promise<boolean>;

  /** Get the primary domain for a wallet (if set) */
  getPrimaryDomain(connection: Connection, owner: PublicKey): Promise<string | null>;
}

/**
 * Clean domain name by removing .sol suffix and lowercasing
 */
function cleanDomain(domain: string): string {
  return domain.toLowerCase().replace(/\.sol$/, '');
}

/**
 * =============================================================================
 * DEVNET SNS ADAPTER
 * =============================================================================
 *
 * Uses Bonfida's devnet utilities for PDA derivation.
 * Devnet has a different TLD authority, so standard derivation doesn't work.
 */
class DevnetSnsAdapter implements SnsAdapter {
  readonly network: NetworkType = 'devnet';

  getDomainKey(domain: string): PublicKey {
    const clean = cleanDomain(domain);
    try {
      const { pubkey } = devnet.utils.getDomainKeySync(clean);
      return pubkey;
    } catch (err) {
      console.warn(`[DevnetSns] Derivation failed for ${clean}, trying mainnet:`, err);
      // Fallback to mainnet derivation (shouldn't happen but safe)
      const { pubkey } = getDomainKeySync(clean);
      return pubkey;
    }
  }

  async reverseLookup(connection: Connection, nameAccount: PublicKey): Promise<string | null> {
    try {
      const domain = await devnet.utils.reverseLookup(connection, nameAccount);
      return domain || null;
    } catch (err) {
      console.warn('[DevnetSns] Reverse lookup failed:', err);
      return null;
    }
  }

  async getDomainsForOwner(connection: Connection, owner: PublicKey): Promise<SnsDomain[]> {
    const domains: SnsDomain[] = [];

    try {
      // Get all SNS accounts owned by the wallet
      // Filter by owner field at offset 32 in the account data
      const ownedAccounts = await connection.getProgramAccounts(SNS_NAME_PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 32, bytes: owner.toBase58() } },
        ],
      });

      // Filter to main domain accounts (500+ bytes) vs smaller metadata accounts
      const mainDomainAccounts = ownedAccounts.filter(acc => acc.account.data.length >= 500);

      // Resolve domain names using devnet reverse lookup
      for (const { pubkey } of mainDomainAccounts) {
        try {
          const domain = await this.reverseLookup(connection, pubkey);
          if (domain && domain.length > 0) {
            domains.push({
              domain: domain.toLowerCase(),
              nameAccount: pubkey,
              isPrimary: false,
            });
          }
        } catch {
          // Skip accounts that fail reverse lookup
        }
      }

      // Sort alphabetically and mark first as primary (devnet doesn't have primary domain feature)
      domains.sort((a, b) => a.domain.localeCompare(b.domain));
      if (domains.length > 0) {
        domains[0].isPrimary = true;
      }
    } catch (error) {
      console.error('[DevnetSns] Failed to fetch domains:', error);
    }

    return domains;
  }

  async verifyOwnership(
    connection: Connection,
    domain: string,
    owner: PublicKey
  ): Promise<boolean> {
    try {
      const nameAccount = this.getDomainKey(domain);
      const accountInfo = await connection.getAccountInfo(nameAccount);
      if (!accountInfo) return false;

      const { registry } = await NameRegistryState.retrieve(connection, nameAccount);
      return registry.owner.equals(owner);
    } catch (err) {
      console.warn('[DevnetSns] Ownership verification failed:', err);
      return false;
    }
  }

  async domainExists(connection: Connection, domain: string): Promise<boolean> {
    try {
      const nameAccount = this.getDomainKey(domain);
      const accountInfo = await connection.getAccountInfo(nameAccount);
      return accountInfo !== null;
    } catch {
      return false;
    }
  }

  async getPrimaryDomain(connection: Connection, owner: PublicKey): Promise<string | null> {
    // Devnet doesn't have primary domain feature, return first owned domain
    const domains = await this.getDomainsForOwner(connection, owner);
    return domains.length > 0 ? domains[0].domain : null;
  }
}

/**
 * =============================================================================
 * MAINNET SNS ADAPTER
 * =============================================================================
 *
 * Uses standard Bonfida SDK for all operations.
 */
class MainnetSnsAdapter implements SnsAdapter {
  readonly network: NetworkType = 'mainnet-beta';

  getDomainKey(domain: string): PublicKey {
    const clean = cleanDomain(domain);
    const { pubkey } = getDomainKeySync(clean);
    return pubkey;
  }

  async reverseLookup(connection: Connection, nameAccount: PublicKey): Promise<string | null> {
    try {
      const domain = await reverseLookup(connection, nameAccount);
      return domain || null;
    } catch (err) {
      console.warn('[MainnetSns] Reverse lookup failed:', err);
      return null;
    }
  }

  async getDomainsForOwner(connection: Connection, owner: PublicKey): Promise<SnsDomain[]> {
    const domains: SnsDomain[] = [];

    try {
      // Get primary domain first
      let primaryDomainName: string | null = null;
      try {
        const { reverse } = await getPrimaryDomain(connection, owner);
        primaryDomainName = reverse;
      } catch {
        // No primary domain set
      }

      // Get all domain keys owned by wallet
      const domainKeys = await getAllDomains(connection, owner);

      // Resolve each domain name
      for (const nameAccount of domainKeys) {
        try {
          const domain = await this.reverseLookup(connection, nameAccount);
          if (domain) {
            domains.push({
              domain,
              nameAccount,
              isPrimary: domain === primaryDomainName,
            });
          }
        } catch {
          // Skip domains that fail reverse lookup
        }
      }

      // Sort with primary first, then alphabetically
      domains.sort((a, b) => {
        if (a.isPrimary) return -1;
        if (b.isPrimary) return 1;
        return a.domain.localeCompare(b.domain);
      });
    } catch (error) {
      console.error('[MainnetSns] Failed to fetch domains:', error);
    }

    return domains;
  }

  async verifyOwnership(
    connection: Connection,
    domain: string,
    owner: PublicKey
  ): Promise<boolean> {
    try {
      const nameAccount = this.getDomainKey(domain);
      const { registry } = await NameRegistryState.retrieve(connection, nameAccount);
      return registry.owner.equals(owner);
    } catch (err) {
      console.warn('[MainnetSns] Ownership verification failed:', err);
      return false;
    }
  }

  async domainExists(connection: Connection, domain: string): Promise<boolean> {
    try {
      const nameAccount = this.getDomainKey(domain);
      const accountInfo = await connection.getAccountInfo(nameAccount);
      return accountInfo !== null;
    } catch {
      return false;
    }
  }

  async getPrimaryDomain(connection: Connection, owner: PublicKey): Promise<string | null> {
    try {
      const { reverse } = await getPrimaryDomain(connection, owner);
      return reverse;
    } catch {
      return null;
    }
  }
}

/**
 * =============================================================================
 * ADAPTER FACTORY
 * =============================================================================
 */

// Singleton instances
const devnetAdapter = new DevnetSnsAdapter();
const mainnetAdapter = new MainnetSnsAdapter();

/**
 * Get the appropriate SNS adapter for a network
 */
export function createSnsAdapter(network: NetworkType): SnsAdapter {
  return network === 'devnet' ? devnetAdapter : mainnetAdapter;
}

/**
 * Get SNS adapter based on RPC endpoint detection
 */
export function createSnsAdapterFromEndpoint(endpoint: string): SnsAdapter {
  const isDevnetEndpoint =
    endpoint.includes('devnet') ||
    endpoint.includes('localhost') ||
    endpoint.includes('127.0.0.1');

  return isDevnetEndpoint ? devnetAdapter : mainnetAdapter;
}
