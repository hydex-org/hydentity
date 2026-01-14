import { Connection, PublicKey } from '@solana/web3.js';
import {
  getAllDomains,
  getDomainKeySync,
  NameRegistryState,
  resolve,
  reverseLookup,
  getPrimaryDomain,
} from '@bonfida/spl-name-service';
import type { SnsNameInfo } from '../types/solana';
import { SOL_TLD_AUTHORITY } from '../constants';

// SNS Name Service Program ID
export const NAME_PROGRAM_ID = new PublicKey('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX');

/**
 * Error class for SNS-related errors
 */
export class SnsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnsError';
  }
}

/**
 * Get the SNS name account for a .sol domain using Bonfida SDK
 * 
 * @param domain - The domain name (with or without .sol suffix)
 * @returns The SNS name account public key
 */
export function getSnsNameAccount(domain: string): PublicKey {
  // Remove .sol suffix if present
  const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
  
  const { pubkey } = getDomainKeySync(cleanDomain);
  return pubkey;
}

/**
 * Resolve an SNS name to get full information using Bonfida SDK
 * 
 * @param connection - Solana connection
 * @param domain - The domain name (with or without .sol suffix)
 * @returns SNS name information including owner and resolved address
 */
export async function resolveSnsName(
  connection: Connection,
  domain: string
): Promise<SnsNameInfo> {
  const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
  const { pubkey: nameAccount } = getDomainKeySync(cleanDomain);
  
  // Get the name registry state
  const { registry } = await NameRegistryState.retrieve(connection, nameAccount);
  
  // Try to resolve to get the actual address (may be different from owner)
  let resolvedAddress: PublicKey | undefined;
  try {
    resolvedAddress = await resolve(connection, cleanDomain);
  } catch {
    // Resolution may fail if no address record is set
    resolvedAddress = registry.owner;
  }
  
  return {
    nameAccount,
    domain: cleanDomain,
    owner: registry.owner,
    resolvedAddress,
  };
}

/**
 * Verify that a public key owns an SNS name
 * 
 * @param connection - Solana connection
 * @param domain - The domain name
 * @param expectedOwner - The expected owner's public key
 * @returns True if the owner matches
 */
export async function verifySnsOwnership(
  connection: Connection,
  domain: string,
  expectedOwner: PublicKey
): Promise<boolean> {
  try {
    const nameInfo = await resolveSnsName(connection, domain);
    return nameInfo.owner.equals(expectedOwner);
  } catch {
    return false;
  }
}

/**
 * Get all SNS domains owned by a public key using Bonfida SDK
 * 
 * @param connection - Solana connection
 * @param owner - The owner's public key
 * @returns Array of domain information objects
 */
export async function getSnsDomainsForOwner(
  connection: Connection,
  owner: PublicKey
): Promise<{ domain: string; nameAccount: PublicKey }[]> {
  try {
    // Get all domain public keys owned by this wallet
    const domainKeys = await getAllDomains(connection, owner);
    
    // Reverse lookup each domain to get the human-readable name
    const domains = await Promise.all(
      domainKeys.map(async (nameAccount) => {
        try {
          const domain = await reverseLookup(connection, nameAccount);
          return { domain, nameAccount };
        } catch {
          // Skip domains that fail reverse lookup
          return null;
        }
      })
    );
    
    // Filter out nulls
    return domains.filter((d): d is { domain: string; nameAccount: PublicKey } => d !== null);
  } catch (error) {
    console.warn('Failed to fetch SNS domains:', error);
    return [];
  }
}

/**
 * Get the primary (favorite) domain for a wallet
 * 
 * @param connection - Solana connection
 * @param owner - The owner's public key
 * @returns The primary domain name or null if none set
 */
export async function getPrimaryDomainForOwner(
  connection: Connection,
  owner: PublicKey
): Promise<string | null> {
  try {
    const { reverse } = await getPrimaryDomain(connection, owner);
    return reverse;
  } catch {
    return null;
  }
}

/**
 * Check if a domain name is valid for SNS
 */
export function isValidSnsDomain(domain: string): boolean {
  const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
  
  // SNS domain rules:
  // - 1-63 characters
  // - Alphanumeric and hyphens
  // - Cannot start or end with hyphen
  // - Cannot have consecutive hyphens
  
  if (cleanDomain.length < 1 || cleanDomain.length > 63) {
    return false;
  }
  
  const validPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  if (!validPattern.test(cleanDomain)) {
    // Single character domains are valid
    if (cleanDomain.length === 1 && /^[a-z0-9]$/.test(cleanDomain)) {
      return true;
    }
    return false;
  }
  
  // Check for consecutive hyphens
  if (cleanDomain.includes('--')) {
    return false;
  }
  
  return true;
}

/**
 * Check if an SNS domain exists on-chain
 * 
 * @param connection - Solana connection
 * @param domain - The domain name
 * @returns True if the domain exists
 */
export async function doesSnsDomainExist(
  connection: Connection,
  domain: string
): Promise<boolean> {
  try {
    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
    const { pubkey } = getDomainKeySync(cleanDomain);
    const accountInfo = await connection.getAccountInfo(pubkey);
    return accountInfo !== null;
  } catch {
    return false;
  }
}
