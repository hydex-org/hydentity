'use client';

import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { pollForConfirmation } from '@/lib/pollForConfirmation';
import bs58 from 'bs58';
import {
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
} from '@solana/spl-token';
import { devnet, getDomainKeySync } from '@bonfida/spl-name-service';

/**
 * DEVNET_ONLY: Cache for domain mappings
 */
const DEVNET_DOMAIN_CACHE_KEY = 'hydentity_devnet_domains';

interface DomainMapping {
  nameAccount: string;
  domain: string;
  registeredAt: number;
}

function getCachedDomains(): Record<string, DomainMapping> {
  if (typeof window === 'undefined') return {};
  
  try {
    const cached = localStorage.getItem(DEVNET_DOMAIN_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('Failed to read cached domains:', error);
  }
  
  return {};
}

function cacheDomain(nameAccount: PublicKey, domain: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const cached = getCachedDomains();
    cached[nameAccount.toBase58()] = {
      nameAccount: nameAccount.toBase58(),
      domain: domain.toLowerCase(),
      registeredAt: Date.now(),
    };
    localStorage.setItem(DEVNET_DOMAIN_CACHE_KEY, JSON.stringify(cached));
    console.log(`[Devnet] Cached domain mapping: ${nameAccount.toBase58()} -> ${domain}`);
  } catch (error) {
    console.error('Failed to cache domain:', error);
  }
}

/**
 * Parse transaction to extract domain name and name account
 * Strategy:
 * 1. Find nameRegistryUpdate that contains the domain name -> this tells us which account has the domain
 * 2. The account receiving the update is the main domain account (regardless of owner)
 *
 * NOTE: We don't assume Name Owner = payer because on devnet, the owner might be
 * set to a different account (TLD authority, etc.) by the registration bindings.
 */
async function extractDomainFromTransaction(
  connection: Connection,
  signature: string
): Promise<{ nameAccount: PublicKey; domain: string } | null> {
  try {
    console.log(`[Devnet] Parsing transaction: ${signature}`);

    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx || !tx.transaction) {
      console.warn('[Devnet] Transaction not found');
      return null;
    }

    const SNS_NAME_PROGRAM_ID = new PublicKey('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX');

    // Get account keys from the transaction message (works for both legacy and versioned)
    const accountKeys = tx.transaction.message.getAccountKeys();
    if (!accountKeys) {
      console.warn('[Devnet] Could not get account keys from transaction');
      return null;
    }

    // Collect all nameRegistryUpdate instructions with their domain names and target accounts
    const domainUpdates: { nameAccount: PublicKey; domain: string }[] = [];

    // Parse inner instructions to find nameRegistryUpdate calls
    if (tx.meta?.innerInstructions) {
      for (const innerIxGroup of tx.meta.innerInstructions) {
        for (const innerIx of innerIxGroup.instructions) {
          if ('programId' in innerIx && innerIx.programId) {
            const programId = new PublicKey(innerIx.programId);
            if (programId.equals(SNS_NAME_PROGRAM_ID)) {
              // nameRegistryUpdate has discriminator 1
              if ('data' in innerIx && innerIx.data) {
                // Decode base58 data
                const dataArray = bs58.decode(innerIx.data);
                if (dataArray.length > 0 && dataArray[0] === 1) {
                  // nameRegistryUpdate account structure: [0=NameAccount, 1=NameOwner, ...]
                  // Format: [discriminator(1), offset(4), data_vec]
                  // data_vec: [length(4), domain_bytes...]
                  if (dataArray.length >= 9) {
                    const dataStart = 5; // Skip discriminator (1) + offset (4)
                    if (dataArray.length > dataStart + 4) {
                      // Read u32 little-endian for length
                      const nameLength = dataArray[dataStart] |
                                       (dataArray[dataStart + 1] << 8) |
                                       (dataArray[dataStart + 2] << 16) |
                                       (dataArray[dataStart + 3] << 24);
                      if (nameLength > 0 && nameLength < 100 && dataArray.length >= dataStart + 4 + nameLength) {
                        const nameBytes = dataArray.slice(dataStart + 4, dataStart + 4 + nameLength);
                        const domain = new TextDecoder().decode(nameBytes).trim();

                        // Get the name account from the instruction accounts
                        // Account[0] is the NameAccount being updated
                        if (innerIx.accounts && innerIx.accounts.length > 0) {
                          const nameAccountIndex = innerIx.accounts[0];
                          if (nameAccountIndex !== undefined) {
                            const nameAccountKey = accountKeys.get(nameAccountIndex);
                            if (nameAccountKey) {
                              console.log(`[Devnet] Found nameRegistryUpdate: ${domain} -> ${nameAccountKey.toBase58()}`);
                              domainUpdates.push({
                                nameAccount: nameAccountKey,
                                domain: domain.toLowerCase(),
                              });
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // If we found domain updates, return the most likely main domain
    // The main domain is typically the longest domain name (not reverse lookups which have specific patterns)
    if (domainUpdates.length > 0) {
      // Filter out reverse lookups (they contain the full pubkey as domain)
      // Reverse lookups have domain names that are 32+ chars and look like base58 pubkeys
      const mainDomains = domainUpdates.filter(d => {
        // Reverse lookups are typically base58-encoded pubkeys (32-44 chars of alphanumeric)
        const isReverseLookup = d.domain.length >= 32 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(d.domain);
        return !isReverseLookup && d.domain.length >= 1 && d.domain.length <= 63;
      });

      if (mainDomains.length > 0) {
        // Sort by domain length (shorter domains are more likely to be the main registration)
        // and pick the one that looks most like a user-registered domain
        mainDomains.sort((a, b) => a.domain.length - b.domain.length);
        const result = mainDomains[0];
        console.log(`[Devnet] ✅ Successfully extracted: ${result.domain} -> ${result.nameAccount.toBase58()}`);
        return result;
      }

      // Fallback: just use the first update
      const result = domainUpdates[0];
      console.log(`[Devnet] ✅ Using first update (fallback): ${result.domain} -> ${result.nameAccount.toBase58()}`);
      return result;
    }

    console.warn(`[Devnet] No nameRegistryUpdate instructions found in transaction`);
    return null;
  } catch (error) {
    console.error('[Devnet] Failed to extract domain from transaction:', error);
    return null;
  }
}

/**
 * Manual cache utility - can be called from browser console for testing
 * Usage: 
 *   window.hydentityCacheDomain('H4b3NFtD9sjLv9hkjrxNGtnsHZznkYp2kPCBTxBQQxLq', 'privacy-maxi')
 *   window.hydentityParseTransaction('FGtCFBp44jYFEN2b7doKSJSRWVWpvpL25c85v26nj5UKyz7uwUouY3bjCjWrQh5giRETWvA6iVmEiNfzJLerhSm')
 */
if (typeof window !== 'undefined') {
  (window as any).hydentityCacheDomain = (nameAccount: string, domain: string) => {
    try {
      const pubkey = new PublicKey(nameAccount);
      cacheDomain(pubkey, domain);
      console.log(`✅ Manually cached: ${domain} -> ${nameAccount}`);
      return true;
    } catch (error) {
      console.error('Failed to manually cache domain:', error);
      return false;
    }
  };
  
  (window as any).hydentityParseTransaction = async (signature: string, rpcUrl?: string) => {
    try {
      // Create a connection (use provided RPC or default devnet)
      const { Connection } = await import('@solana/web3.js');
      const connection = new Connection(
        rpcUrl || 'https://api.devnet.solana.com', 
        'confirmed'
      );
      
      const result = await extractDomainFromTransaction(connection, signature);
      if (result) {
        cacheDomain(result.nameAccount, result.domain);
        console.log(`✅ Parsed and cached: ${result.domain} -> ${result.nameAccount.toBase58()}`);
        return result;
      } else {
        console.warn('Could not extract domain from transaction');
        return null;
      }
    } catch (error) {
      console.error('Failed to parse transaction:', error);
      return null;
    }
  };
  
  /**
   * Scan transaction history to find and cache all domain registrations
   * This is useful for populating the cache with existing domains
   */
  (window as any).hydentityScanTransactions = async (walletAddress: string, limit: number = 50, rpcUrl?: string) => {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');
      const connection = new Connection(
        rpcUrl || 'https://api.devnet.solana.com', 
        'confirmed'
      );
      
      const wallet = new PublicKey(walletAddress);
      console.log(`[Devnet] Scanning last ${limit} transactions for wallet ${walletAddress}...`);
      
      // Get recent signatures
      const signatures = await connection.getSignaturesForAddress(wallet, { limit });
      console.log(`[Devnet] Found ${signatures.length} transactions`);
      
      let cachedCount = 0;
      
      // Process each transaction
      for (const sigInfo of signatures) {
        try {
          const result = await extractDomainFromTransaction(connection, sigInfo.signature);
          if (result) {
            cacheDomain(result.nameAccount, result.domain);
            console.log(`[Devnet] ✅ Cached: ${result.domain} -> ${result.nameAccount.toBase58()}`);
            cachedCount++;
          }
        } catch (error) {
          // Skip errors for individual transactions
          continue;
        }
      }
      
      console.log(`[Devnet] ✅ Scan complete! Cached ${cachedCount} domain(s)`);
      return { scanned: signatures.length, cached: cachedCount };
    } catch (error) {
      console.error('[Devnet] Failed to scan transactions:', error);
      return null;
    }
  };
  
  (window as any).hydentityGetCache = () => {
    return getCachedDomains();
  };
  
  (window as any).hydentityClearCache = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(DEVNET_DOMAIN_CACHE_KEY);
      console.log('✅ Cleared domain cache');
      return true;
    }
    return false;
  };
}

/**
 * Extract name account from transaction by looking for the largest account created
 * This is a fallback when we can't get the domain name from nameRegistryUpdate
 *
 * NOTE: This function is deprecated in favor of extractDomainFromTransaction
 * which also extracts the domain name. Kept for backward compatibility.
 */
async function extractNameAccountFromTransaction(
  connection: Connection,
  signature: string
): Promise<PublicKey | null> {
  try {
    console.log(`[Devnet] Attempting to extract name account from transaction: ${signature}`);

    // Wait a bit for transaction to be fully indexed
    await new Promise(resolve => setTimeout(resolve, 2000));

    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx || !tx.transaction) {
      console.warn('[Devnet] Transaction not found or invalid');
      return null;
    }

    const SNS_NAME_PROGRAM_ID = new PublicKey('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX');

    // Get account keys from the transaction message (works for both legacy and versioned)
    const accountKeys = tx.transaction.message.getAccountKeys();
    if (!accountKeys) {
      console.warn('[Devnet] Could not get account keys from transaction');
      return null;
    }

    // Collect all nameRegistryCreate accounts with their sizes
    const createdAccounts: { pubkey: PublicKey; size: number }[] = [];

    // Check inner instructions (CPI calls) - this is where nameRegistryCreate usually is
    if (tx.meta?.innerInstructions) {
      for (const innerIxGroup of tx.meta.innerInstructions) {
        for (const innerIx of innerIxGroup.instructions) {
          if ('programId' in innerIx && innerIx.programId) {
            const programId = new PublicKey(innerIx.programId);
            if (programId.equals(SNS_NAME_PROGRAM_ID)) {
              // Check if this is nameRegistryCreate (discriminator 0)
              if ('data' in innerIx && innerIx.data) {
                // Decode base58 data
                const dataArray = bs58.decode(innerIx.data);
                if (dataArray.length > 0 && dataArray[0] === 0) {
                  // This is nameRegistryCreate
                  // Account structure: [0=System, 1=Payer, 2=NameAccount, 3=NameOwner, ...]
                  // Extract space from instruction data: [discriminator(1), hashedName(32), lamports(8), space(4), ...]
                  if (innerIx.accounts && innerIx.accounts.length > 2) {
                    const nameAccountIndex = innerIx.accounts[2]; // Name Account Key

                    if (nameAccountIndex !== undefined) {
                      const nameAccountKey = accountKeys.get(nameAccountIndex);
                      if (nameAccountKey) {
                        // Try to get size from instruction data or use 0 as fallback
                        let size = 0;
                        if (dataArray.length >= 45) {
                          // Space is at offset 41 (1 + 32 + 8)
                          size = dataArray[41] |
                                 (dataArray[42] << 8) |
                                 (dataArray[43] << 16) |
                                 (dataArray[44] << 24);
                        }
                        createdAccounts.push({
                          pubkey: nameAccountKey,
                          size: size,
                        });
                        console.log(`[Devnet] Found nameRegistryCreate: ${nameAccountKey.toBase58()} (size: ${size})`);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (createdAccounts.length === 0) {
      console.warn('[Devnet] No nameRegistryCreate instructions found in transaction');
      return null;
    }

    // Return the account with the largest allocated space (most likely the main domain)
    // Main domains typically have space=1000, while parent/class accounts are smaller
    createdAccounts.sort((a, b) => b.size - a.size);
    const result = createdAccounts[0];
    console.log(`[Devnet] Selected name account (largest): ${result.pubkey.toBase58()} (size: ${result.size})`);
    return result.pubkey;
  } catch (error) {
    console.error('[Devnet] Failed to extract name account from transaction:', error);
    return null;
  }
}

/**
 * Hook for registering SNS domains on devnet
 * This is useful for hackathon demos where devnet SNS tools aren't well supported
 */
export function useDevnetDomainRegistration() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  /**
   * Register a domain on devnet
   * @param domainLabel - The domain label (e.g., "hydentity" for "hydentity.sol")
   * @param wrapSol - Amount of SOL to wrap for purchase + rent (default: 0.05 SOL)
   * @param space - Space allocated for the name registry data (default: 1000)
   */
  const registerDomain = useCallback(
    async (
      domainLabel: string,
      wrapSol: number = 0.05,
      space: number = 1000
    ): Promise<string> => {
      if (!publicKey || !sendTransaction) {
        throw new Error('Wallet not connected');
      }

      if (!domainLabel || !domainLabel.trim()) {
        throw new Error('Domain label is required');
      }

      // Validate domain label format (alphanumeric and hyphens, no spaces)
      const domainRegex = /^[a-z0-9-]+$/i;
      if (!domainRegex.test(domainLabel)) {
        throw new Error(
          'Domain label can only contain letters, numbers, and hyphens'
        );
      }

      setIsRegistering(true);
      setError(null);
      setTxSignature(null);

      try {
        // Derive wSOL Associated Token Account
        const wsolAta = getAssociatedTokenAddressSync(
          NATIVE_MINT,
          publicKey,
          true
        );

        // Create transaction
        const transaction = new Transaction();

        // Check if wSOL ATA exists, create if not
        const ataInfo = await connection.getAccountInfo(wsolAta);
        if (!ataInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              wsolAta,
              publicKey,
              NATIVE_MINT
            )
          );
        }

        // Wrap SOL → wSOL
        const lamportsToWrap = Math.floor(wrapSol * LAMPORTS_PER_SOL);

        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: wsolAta,
            lamports: lamportsToWrap,
          }),
          createSyncNativeInstruction(wsolAta)
        );

        // Get SNS registration instructions (DEVNET)
        // IMPORTANT: registerDomainNameV2 returns an array of instructions
        const registerIxs = await devnet.bindings.registerDomainNameV2(
          connection,
          domainLabel,
          space,
          publicKey,
          wsolAta,
          NATIVE_MINT
        );

        transaction.add(...registerIxs);

        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = publicKey;

        // Simulate transaction for better error messages
        console.log('Simulating domain registration transaction...');
        try {
          const simulation = await connection.simulateTransaction(transaction);
          if (simulation.value.err) {
            console.error('Simulation error:', simulation.value.err);
            console.error('Simulation logs:', simulation.value.logs);
            throw new Error(
              `Transaction simulation failed: ${JSON.stringify(
                simulation.value.err
              )}\n` +
                `Logs: ${simulation.value.logs?.join('\n') || 'No logs'}`
            );
          }
          console.log('Simulation successful:', simulation.value.logs);
        } catch (simError) {
          console.error('Simulation failed:', simError);
          throw simError;
        }

        // Send transaction (wallet adapter handles signing)
        const signature = await sendTransaction(transaction, connection);

        console.log('Domain registration transaction sent:', signature);
        setTxSignature(signature);

        // Wait for confirmation (polling to avoid WebSocket issues)
        await pollForConfirmation(connection, signature, lastValidBlockHeight);

        console.log('Domain registered successfully:', signature);
        
        // Cache the domain mapping after successful registration
        try {
          console.log(`[Devnet] Attempting to cache domain: ${domainLabel.trim()}`);
          
          // First, try to extract both domain name and name account from transaction instruction data
          const extracted = await extractDomainFromTransaction(connection, signature);
          if (extracted && extracted.domain === domainLabel.trim()) {
            console.log(`[Devnet] Successfully extracted from transaction: ${extracted.domain} -> ${extracted.nameAccount.toBase58()}`);
            cacheDomain(extracted.nameAccount, extracted.domain);
            console.log(`[Devnet] ✅ Cached domain: ${extracted.domain} -> ${extracted.nameAccount.toBase58()}`);
          } else {
            // Fallback: Extract name account from transaction structure
            const nameAccount = await extractNameAccountFromTransaction(connection, signature);
            if (nameAccount) {
              console.log(`[Devnet] Successfully extracted name account: ${nameAccount.toBase58()}`);
              cacheDomain(nameAccount, domainLabel.trim());
              console.log(`[Devnet] ✅ Cached domain: ${domainLabel.trim()} -> ${nameAccount.toBase58()}`);
            } else {
              // Fallback: try to derive it (might not work on devnet)
              console.warn('[Devnet] Could not extract name account from transaction, trying derivation');
              try {
                const { pubkey } = getDomainKeySync(domainLabel.trim());
                console.log(`[Devnet] Derived name account: ${pubkey.toBase58()}`);
                cacheDomain(pubkey, domainLabel.trim());
                console.log(`[Devnet] ✅ Cached domain (derived): ${domainLabel.trim()} -> ${pubkey.toBase58()}`);
              } catch (derivError) {
                console.warn('[Devnet] Could not derive name account, domain not cached. You can manually cache it using:');
                console.warn(`window.hydentityCacheDomain('NAME_ACCOUNT_PUBKEY', '${domainLabel.trim()}')`);
                console.warn(`Or parse the transaction: window.hydentityParseTransaction('${signature}')`);
                console.warn('Find the name account in the transaction details on Solscan/Explorer');
              }
            }
          }
        } catch (error) {
          console.error('[Devnet] Failed to cache domain mapping:', error);
          console.warn('You can manually cache the domain using:');
          console.warn(`window.hydentityCacheDomain('NAME_ACCOUNT_PUBKEY', '${domainLabel.trim()}')`);
          console.warn(`Or parse the transaction: window.hydentityParseTransaction('${signature}')`);
          // Don't fail the registration if caching fails
        }
        
        return signature;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to register domain';
        setError(message);
        console.error('Domain registration error:', err);
        throw err;
      } finally {
        setIsRegistering(false);
      }
    },
    [publicKey, sendTransaction, connection]
  );

  const reset = useCallback(() => {
    setError(null);
    setTxSignature(null);
  }, []);

  return {
    registerDomain,
    isRegistering,
    error,
    txSignature,
    reset,
  };
}
