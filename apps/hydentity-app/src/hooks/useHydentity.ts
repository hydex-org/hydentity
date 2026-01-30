'use client';

/**
 * =============================================================================
 * HYDENTITY HOOK - Main interface for interacting with Hydentity protocol
 * =============================================================================
 *
 * This hook uses the NetworkContext for network-specific behavior.
 * SNS operations are delegated to the SNS adapter (devnet/mainnet handled automatically).
 *
 * =============================================================================
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { useTestMode } from '@/contexts/TestModeContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { pollForConfirmation } from '@/lib/pollForConfirmation';

// =============================================================================
// PROGRAM CONFIGURATION
// =============================================================================

// SNS Name Service Program ID (same on mainnet and devnet)
const SNS_NAME_PROGRAM_ID = new PublicKey('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX');

// PDA Seeds (must match Anchor program)
const VAULT_SEED = Buffer.from('vault');
const VAULT_AUTH_SEED = Buffer.from('vault_auth');
const POLICY_SEED = Buffer.from('policy');

/**
 * Compute Anchor instruction discriminator
 * This is sha256("global:<instruction_name>")[0..8]
 */
async function computeDiscriminator(instructionName: string): Promise<Buffer> {
  const preimage = `global:${instructionName}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(preimage);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Buffer.from(hashArray.slice(0, 8));
}

/**
 * Compute Anchor account discriminator
 * This is sha256("account:<AccountName>")[0..8]
 */
async function computeAccountDiscriminator(accountName: string): Promise<Buffer> {
  const preimage = `account:${accountName}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(preimage);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Buffer.from(hashArray.slice(0, 8));
}

/**
 * NameVault account layout:
 * - 8 bytes: discriminator
 * - 32 bytes: owner
 * - 32 bytes: sns_name
 * - 8 bytes: total_sol_received
 * - 8 bytes: deposit_count
 * - 8 bytes: created_at
 * - 8 bytes: last_deposit_at
 * - 1 byte: bump
 * - 1 byte: domain_transferred
 * - 63 bytes: reserved
 */
const NAME_VAULT_SIZE = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 + 63;

/**
 * Parse a NameVault account from raw data
 */
function parseNameVault(data: Buffer): {
  owner: PublicKey;
  snsName: PublicKey;
  totalSolReceived: bigint;
  depositCount: bigint;
  createdAt: bigint;
  lastDepositAt: bigint;
  bump: number;
  domainTransferred: boolean;
} | null {
  if (data.length < NAME_VAULT_SIZE) {
    return null;
  }

  let offset = 8; // Skip discriminator

  const owner = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const snsName = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const totalSolReceived = data.readBigUInt64LE(offset);
  offset += 8;

  const depositCount = data.readBigUInt64LE(offset);
  offset += 8;

  const createdAt = data.readBigInt64LE(offset);
  offset += 8;

  const lastDepositAt = data.readBigInt64LE(offset);
  offset += 8;

  const bump = data.readUInt8(offset);
  offset += 1;

  const domainTransferred = data.readUInt8(offset) === 1;

  return {
    owner,
    snsName,
    totalSolReceived,
    depositCount,
    createdAt,
    lastDepositAt,
    bump,
    domainTransferred,
  };
}

/**
 * NOTE: reverseLookupDomain is now handled by the SNS adapter.
 * This function is kept for backwards compatibility but delegates to the adapter.
 * See: adapters/sns-adapter.ts
 */

/**
 * Vault information from on-chain state
 */
export interface VaultInfo {
  domain: string;
  vaultAddress: string;
  /** The vault authority PDA - this is where SNS resolves to and where funds are sent */
  vaultAuthorityAddress: string;
  ownerAddress: string;
  snsNameAccount: string;
  balance: bigint;
  totalDeposits: number;
  pendingDeposits: number;
  policyEnabled: boolean;
  minSplits: number;
  maxSplits: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  createdAt: number;
  lastDepositAt: number;
  /** Whether the SNS domain ownership has been transferred to the vault authority */
  domainTransferred: boolean;
}

/**
 * Hook state
 */
interface HydentityState {
  vaults: VaultInfo[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Derive PDA for vault
 */
function getVaultPda(snsNameAccount: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, snsNameAccount.toBuffer()],
    programId
  );
}

/**
 * Derive PDA for vault authority
 */
function getVaultAuthorityPda(snsNameAccount: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_AUTH_SEED, snsNameAccount.toBuffer()],
    programId
  );
}

/**
 * Derive PDA for policy
 */
function getPolicyPda(snsNameAccount: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_SEED, snsNameAccount.toBuffer()],
    programId
  );
}

/**
 * NOTE: getSnsNameAccount is now handled by the SNS adapter.
 * Use snsAdapter.getDomainKey(domain) instead.
 * See: adapters/sns-adapter.ts
 */

/**
 * Build the initialize_vault instruction
 */
async function buildInitializeVaultInstruction(
  owner: PublicKey,
  snsNameAccount: PublicKey,
  programId: PublicKey,
): Promise<TransactionInstruction> {
  const [vault] = getVaultPda(snsNameAccount, programId);
  const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount, programId);
  const [policy] = getPolicyPda(snsNameAccount, programId);

  // Compute discriminator dynamically to ensure correctness
  const discriminator = await computeDiscriminator('initialize_vault');
  console.log('Discriminator bytes:', Array.from(discriminator));

  // Account metas in the order expected by the Anchor program
  const keys = [
    { pubkey: owner, isSigner: true, isWritable: true },           // owner
    { pubkey: snsNameAccount, isSigner: false, isWritable: false }, // sns_name_account
    { pubkey: vault, isSigner: false, isWritable: true },           // vault (init)
    { pubkey: vaultAuthority, isSigner: false, isWritable: true },  // vault_authority (init)
    { pubkey: policy, isSigner: false, isWritable: true },          // policy (init)
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data: discriminator,
  });
}

/**
 * Hook for interacting with Hydentity protocol
 */
export function useHydentity() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { testMode } = useTestMode();
  const { config, snsAdapter, network } = useNetwork();

  // Get program ID from network config
  const programId = useMemo(() => config.hydentityProgramId, [config]);

  const [state, setState] = useState<HydentityState>({
    vaults: [],
    isLoading: false,
    error: null,
  });

  /**
   * Fetch vaults owned by the connected wallet
   */
  const fetchVaults = useCallback(async () => {
    if (!connected || !publicKey) {
      setState(prev => ({ ...prev, vaults: [], isLoading: false }));
      return;
    }

    // Only show loading spinner on initial fetch (no vaults loaded yet).
    // Background refreshes update silently to avoid interrupting the UI.
    setState(prev => ({
      ...prev,
      isLoading: prev.vaults.length === 0,
      error: null,
    }));

    try {
      console.log(`Fetching vaults for wallet on ${network}:`, publicKey.toBase58());
      // Compute the NameVault account discriminator
      const vaultDiscriminator = await computeAccountDiscriminator('NameVault');
      console.log('NameVault discriminator:', Array.from(vaultDiscriminator));

      // Fetch all NameVault accounts owned by this wallet
      // Filter by:
      // 1. Account data size
      // 2. Owner field (at offset 8, after discriminator)
      const accounts = await connection.getProgramAccounts(programId, {
        filters: [
          // Filter by data size (NameVault::LEN)
          { dataSize: NAME_VAULT_SIZE },
          // Filter by owner field (offset 8 = after discriminator)
          {
            memcmp: {
              offset: 8,
              bytes: publicKey.toBase58(),
            },
          },
        ],
      });

      console.log(`Found ${accounts.length} vault account(s)`);

      const vaults: VaultInfo[] = [];

      // Load cached domain names from localStorage
      const domainCache: Record<string, string> = {};
      try {
        const cached = localStorage.getItem('hydentity_domain_cache');
        if (cached) {
          Object.assign(domainCache, JSON.parse(cached));
        }
      } catch (e) {
        console.warn('Failed to load domain cache:', e);
      }

      for (const { pubkey, account } of accounts) {
        try {
          const vaultData = parseNameVault(Buffer.from(account.data));
          if (!vaultData) {
            console.warn('Failed to parse vault:', pubkey.toBase58());
            continue;
          }

          const snsNameKey = vaultData.snsName.toBase58();

          // First check cache for domain name
          let domain: string | null = domainCache[snsNameKey] || null;

          // If not in cache, try reverse lookup using SNS adapter
          if (!domain) {
            try {
              domain = await snsAdapter.reverseLookup(connection, vaultData.snsName);
              if (domain) {
                // Cache the result
                domainCache[snsNameKey] = domain;
              }
            } catch (lookupErr) {
              console.warn('Reverse lookup failed for', snsNameKey, lookupErr);
            }
          }

          if (!domain) {
            console.warn('Could not find domain for SNS account:', snsNameKey);
          }

          // Get vault authority PDA - this is where SNS resolves to and where funds are held
          const [vaultAuthority] = getVaultAuthorityPda(vaultData.snsName, programId);
          const vaultAuthorityAddress = vaultAuthority.toBase58();

          // Get balance from vault_authority PDA (where SOL deposits are held)
          let balance = 0;
          try {
            balance = await connection.getBalance(vaultAuthority);
          } catch (balanceErr) {
            console.warn('Failed to get balance for vault:', pubkey.toBase58(), balanceErr);
          }

          // Get the policy PDA and fetch policy data
          let policyEnabled = true;
          let minSplits = 1;
          let maxSplits = 5;
          let minDelaySeconds = 0;
          let maxDelaySeconds = 3600;

          try {
            const [policyPda] = getPolicyPda(vaultData.snsName, programId);
            const policyAccount = await connection.getAccountInfo(policyPda);

            if (policyAccount && policyAccount.data.length >= 80) {
              const policyData = Buffer.from(policyAccount.data);
              // Skip discriminator (8) + vault (32) + sns_name (32) = 72
              policyEnabled = policyData.readUInt8(72) === 1;
              minSplits = policyData.readUInt8(73);
              maxSplits = policyData.readUInt8(74);
              minDelaySeconds = policyData.readUInt32LE(75);
              maxDelaySeconds = policyData.readUInt32LE(79);
            }
          } catch (policyErr) {
            console.warn('Failed to get policy for vault:', pubkey.toBase58(), policyErr);
          }

          // Use a better fallback name that includes the SNS account
          const fallbackName = `vault-${snsNameKey.slice(0, 6)}`;

          // Check actual SNS ownership on-chain (in case flag is out of sync)
          let actualDomainTransferred = vaultData.domainTransferred;
          try {
            const snsAccountInfo = await connection.getAccountInfo(vaultData.snsName);
            if (snsAccountInfo && snsAccountInfo.data.length >= 64) {
              // SNS account data: first 32 bytes is parent, next 32 bytes is owner
              const snsOwner = new PublicKey(snsAccountInfo.data.slice(32, 64));
              const isOwnedByVault = snsOwner.equals(vaultAuthority);
              if (isOwnedByVault !== vaultData.domainTransferred) {
                console.log(`Domain ownership mismatch: flag=${vaultData.domainTransferred}, actual=${isOwnedByVault}`);
                actualDomainTransferred = isOwnedByVault;
              }
            }
          } catch (snsErr) {
            console.warn('Failed to check SNS ownership:', snsErr);
          }

          vaults.push({
            domain: domain || fallbackName,
            vaultAddress: pubkey.toBase58(),
            vaultAuthorityAddress,
            ownerAddress: vaultData.owner.toBase58(),
            snsNameAccount: snsNameKey,
            balance: BigInt(balance),
            totalDeposits: Number(vaultData.depositCount),
            pendingDeposits: 0, // Would need to track pending deposits
            policyEnabled,
            minSplits,
            maxSplits,
            minDelaySeconds,
            maxDelaySeconds,
            createdAt: Number(vaultData.createdAt),
            lastDepositAt: Number(vaultData.lastDepositAt),
            domainTransferred: actualDomainTransferred,
          });

          console.log('Parsed vault:', {
            domain: domain || fallbackName,
            address: pubkey.toBase58(),
            snsName: snsNameKey,
            balance: balance / 1e9,
            domainTransferred: actualDomainTransferred,
            flagFromChain: vaultData.domainTransferred,
          });
        } catch (parseError) {
          console.error('Error parsing vault account:', pubkey.toBase58(), parseError);
        }
      }

      // Save updated domain cache
      try {
        localStorage.setItem('hydentity_domain_cache', JSON.stringify(domainCache));
      } catch (e) {
        console.warn('Failed to save domain cache:', e);
      }

      // Sort by creation time (newest first)
      vaults.sort((a, b) => b.createdAt - a.createdAt);

      console.log(`Successfully loaded ${vaults.length} vault(s)`);

      setState({
        vaults,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to fetch vaults:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch vaults'),
      }));
    }
  }, [connected, publicKey, connection, snsAdapter, programId, network]);

  // Fetch vaults when wallet connects
  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

  // Auto-refresh balances every 15 seconds when connected
  useEffect(() => {
    if (!connected || !publicKey) return;

    const refreshInterval = setInterval(() => {
      fetchVaults();
    }, 30000); // 30 seconds

    return () => clearInterval(refreshInterval);
  }, [connected, publicKey, fetchVaults]);

  /**
   * Initialize a new vault for a domain
   *
   * In test mode: Creates a vault with a mock SNS account (program verifies ownership)
   * In production: Creates a vault with real SNS account (program verifies ownership)
   */
  const initializeVault = useCallback(async (domain: string): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');

    try {
      let snsNameAccount: PublicKey;

      if (testMode) {
        // In test mode, create a deterministic fake SNS account from domain name
        // Note: This will fail on-chain SNS verification unless the program is also in test mode
        [snsNameAccount] = PublicKey.findProgramAddressSync(
          [Buffer.from('test_sns'), Buffer.from(cleanDomain)],
          programId
        );

        console.log(`[Test Mode] Using mock SNS account: ${snsNameAccount.toBase58()}`);
      } else {
        // Use real SNS name account via SNS adapter (handles devnet/mainnet automatically)
        snsNameAccount = snsAdapter.getDomainKey(cleanDomain);

        // Verify the SNS account exists and check its owner
        const accountInfo = await connection.getAccountInfo(snsNameAccount);
        if (!accountInfo) {
          throw new Error(`SNS domain "${cleanDomain}.sol" not found on-chain`);
        }

        // Log the account owner for debugging
        console.log('SNS Account Info:', {
          address: snsNameAccount.toBase58(),
          owner: accountInfo.owner.toBase58(),
          expectedOwner: SNS_NAME_PROGRAM_ID.toBase58(),
          ownerMatches: accountInfo.owner.equals(SNS_NAME_PROGRAM_ID),
          dataLength: accountInfo.data.length,
        });

        // Check if the account is owned by SNS Name Program
        if (!accountInfo.owner.equals(SNS_NAME_PROGRAM_ID)) {
          throw new Error(
            `SNS account is not owned by SNS Name Program.\n` +
            `Account owner: ${accountInfo.owner.toBase58()}\n` +
            `Expected: ${SNS_NAME_PROGRAM_ID.toBase58()}`
          );
        }
      }

      // Derive PDAs
      const [vault] = getVaultPda(snsNameAccount, programId);
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount, programId);
      const [policy] = getPolicyPda(snsNameAccount, programId);

      console.log('Initializing vault:', {
        domain: cleanDomain,
        snsNameAccount: snsNameAccount.toBase58(),
        vault: vault.toBase58(),
        vaultAuthority: vaultAuthority.toBase58(),
        policy: policy.toBase58(),
        testMode,
      });

      // Check if vault already exists
      const vaultAccountInfo = await connection.getAccountInfo(vault);
      if (vaultAccountInfo) {
        throw new Error(`Vault already exists for domain "${cleanDomain}.sol"`);
      }

      // Build the initialize_vault instruction
      const instruction = await buildInitializeVaultInstruction(publicKey, snsNameAccount, programId);

      // Create and configure transaction
      const transaction = new Transaction().add(instruction);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      // Try to simulate the transaction first for better error messages
      console.log('Simulating transaction...');
      try {
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) {
          console.error('Simulation error:', simulation.value.err);
          console.error('Simulation logs:', simulation.value.logs);
          throw new Error(
            `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}\n` +
            `Logs: ${simulation.value.logs?.join('\n') || 'No logs'}`
          );
        }
        console.log('Simulation successful:', simulation.value.logs);
      } catch (simError) {
        console.error('Simulation failed:', simError);
        throw simError;
      }

      // Log transaction details for debugging
      console.log('Transaction details:', {
        recentBlockhash: transaction.recentBlockhash,
        feePayer: transaction.feePayer?.toBase58(),
        instructions: transaction.instructions.length,
        signers: transaction.signatures.map(s => s.publicKey.toBase58()),
      });

      // Send transaction (wallet adapter handles signing)
      // Use skipPreflight since we already simulated, and specify commitment
      let signature: string;
      try {
        signature = await sendTransaction(transaction, connection, {
          skipPreflight: true, // We already simulated successfully
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });
        console.log('Transaction sent:', signature);
      } catch (sendError: unknown) {
        console.error('Send transaction error details:', {
          error: sendError,
          name: sendError instanceof Error ? sendError.name : 'Unknown',
          message: sendError instanceof Error ? sendError.message : String(sendError),
          // Log wallet state
          walletConnected: connected,
          walletPublicKey: publicKey?.toBase58(),
        });

        // If wallet error, suggest checking wallet network
        if (sendError instanceof Error && sendError.message.includes('Invalid account')) {
          throw new Error(
            `Wallet rejected transaction: "Invalid account". ` +
            `Please ensure your wallet is connected to Mainnet (not Devnet). ` +
            `Check your wallet settings and try again.\n` +
            `Original error: ${sendError.message}`
          );
        }
        throw sendError;
      }

      // Wait for confirmation (polling to avoid WebSocket issues)
      await pollForConfirmation(connection, signature, lastValidBlockHeight);

      console.log('Vault initialized successfully:', signature);

      // Cache the domain name in localStorage so we can find it even after domain transfer
      try {
        const cached = localStorage.getItem('hydentity_domain_cache');
        const domainCache = cached ? JSON.parse(cached) : {};
        domainCache[snsNameAccount.toBase58()] = cleanDomain;
        localStorage.setItem('hydentity_domain_cache', JSON.stringify(domainCache));
        console.log('Cached domain name:', cleanDomain, 'for SNS account:', snsNameAccount.toBase58());
      } catch (e) {
        console.warn('Failed to cache domain name:', e);
      }

      // Refetch vaults
      await fetchVaults();

      return signature;
    } catch (error) {
      console.error('Failed to initialize vault:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection, testMode, fetchVaults, programId, snsAdapter]);

  /**
   * Get vault balance
   */
  const getVaultBalance = useCallback(async (domain: string): Promise<bigint> => {
    try {
      const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
      let snsNameAccount: PublicKey;

      if (testMode) {
        [snsNameAccount] = PublicKey.findProgramAddressSync(
          [Buffer.from('test_sns'), Buffer.from(cleanDomain)],
          programId
        );
      } else {
        snsNameAccount = snsAdapter.getDomainKey(cleanDomain);
      }

      // Get balance from vault_authority PDA (where SOL deposits are held)
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount, programId);
      const balance = await connection.getBalance(vaultAuthority);
      return BigInt(balance);
    } catch {
      return 0n;
    }
  }, [connection, testMode, programId, snsAdapter]);

  /**
   * Update vault policy
   */
  const updatePolicy = useCallback(async (
    domain: string,
    config: {
      enabled?: boolean;
      minSplits?: number;
      maxSplits?: number;
      minDelaySeconds?: number;
      maxDelaySeconds?: number;
    }
  ): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    // TODO: Integrate with SDK when program is deployed
    console.log('Update policy:', { domain, config, testMode });
    await new Promise(resolve => setTimeout(resolve, 2000));
    return 'mock_policy_signature_' + Date.now();
  }, [connected, publicKey, testMode]);

  /**
   * Execute private claim
   */
  const executeClaim = useCallback(async (
    domain: string,
    amount: bigint,
    destination: PublicKey
  ): Promise<{ signatures: string[]; splitCount: number }> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    // TODO: Integrate with SDK when program is deployed
    console.log('Execute claim:', { domain, amount, destination: destination.toBase58(), testMode });
    await new Promise(resolve => setTimeout(resolve, 5000));
    return {
      signatures: ['mock_claim_sig_' + Date.now()],
      splitCount: 3,
    };
  }, [connected, publicKey, testMode]);

  /**
   * Direct withdrawal (emergency) - bypasses privacy for owner-only withdrawals
   */
  const withdrawDirect = useCallback(async (
    domain: string,
    destination: PublicKey,
    amount: bigint
  ): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');

    try {
      // Get SNS name account
      let snsNameAccount: PublicKey;
      if (testMode) {
        [snsNameAccount] = PublicKey.findProgramAddressSync(
          [Buffer.from('test_sns'), Buffer.from(cleanDomain)],
          programId
        );
      } else {
        snsNameAccount = snsAdapter.getDomainKey(cleanDomain);
      }

      // Derive PDAs
      const [vault] = getVaultPda(snsNameAccount, programId);
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount, programId);

      console.log('Direct withdrawal:', {
        domain: cleanDomain,
        vault: vault.toBase58(),
        vaultAuthority: vaultAuthority.toBase58(),
        destination: destination.toBase58(),
        amount: amount.toString(),
      });

      // Build withdraw_direct instruction
      const discriminator = await computeDiscriminator('withdraw_direct');

      // Encode amount as u64 (little-endian)
      const amountBuffer = Buffer.alloc(8);
      amountBuffer.writeBigUInt64LE(amount);

      // Encode mint option (None for SOL)
      const mintOptionBuffer = Buffer.from([0]); // 0 = None

      const instructionData = Buffer.concat([discriminator, amountBuffer, mintOptionBuffer]);

      // Token program ID (required even for SOL transfers)
      const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

      // For optional accounts that are None, use default pubkey (all zeros)
      const NONE_ACCOUNT = new PublicKey('11111111111111111111111111111111');

      const keys = [
        { pubkey: publicKey, isSigner: true, isWritable: true },           // owner
        { pubkey: snsNameAccount, isSigner: false, isWritable: false },    // sns_name_account
        { pubkey: vault, isSigner: false, isWritable: true },              // vault
        { pubkey: vaultAuthority, isSigner: false, isWritable: true },     // vault_authority (holds SOL deposits)
        { pubkey: destination, isSigner: false, isWritable: true },        // destination
        { pubkey: NONE_ACCOUNT, isSigner: false, isWritable: false },      // vault_token_account (None - system program as placeholder)
        { pubkey: NONE_ACCOUNT, isSigner: false, isWritable: false },      // destination_token_account (None - system program as placeholder)
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },  // token_program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ];

      // Debug: log accounts being sent
      console.log('Withdraw accounts:', keys.map((k, i) => `${i}: ${k.pubkey.toBase58()}`));

      const instruction = new TransactionInstruction({
        keys,
        programId,
        data: instructionData,
      });

      const transaction = new Transaction().add(instruction);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      // Simulate first
      console.log('Simulating withdrawal...');
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        console.error('Simulation error:', simulation.value.err);
        console.error('Logs:', simulation.value.logs);
        throw new Error(`Withdrawal simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      console.log('Simulation successful:', simulation.value.logs);

      // Send transaction
      const signature = await sendTransaction(transaction, connection);

      await pollForConfirmation(connection, signature, lastValidBlockHeight);

      console.log('Direct withdrawal successful:', signature);

      // Refetch vaults to update balance
      await fetchVaults();

      return signature;
    } catch (error) {
      console.error('Failed to withdraw:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection, testMode, fetchVaults, programId, snsAdapter]);

  /**
   * Build SNS transfer instruction manually
   * SPL Name Service Transfer instruction format:
   * - Instruction data: [2 (tag), ...new_owner_pubkey (32 bytes)]
   * - Accounts: [name_account (writable), current_owner (signer)]
   *
   * NOTE: The new owner is passed in instruction data, NOT as an account
   */
  const buildSnsTransferInstruction = useCallback((
    nameAccount: PublicKey,
    currentOwner: PublicKey,
    newOwner: PublicKey,
  ): TransactionInstruction => {
    // Instruction data: 1 byte tag + 32 byte new owner pubkey
    const data = Buffer.alloc(1 + 32);
    data.writeUInt8(2, 0); // Transfer instruction tag
    newOwner.toBuffer().copy(data, 1); // New owner pubkey

    return new TransactionInstruction({
      programId: SNS_NAME_PROGRAM_ID,
      keys: [
        { pubkey: nameAccount, isSigner: false, isWritable: true },
        { pubkey: currentOwner, isSigner: true, isWritable: false },
      ],
      data,
    });
  }, []);

  /**
   * Transfer SNS domain ownership to the vault authority
   *
   * This is a two-step process:
   * 1. Transfer domain using SNS instruction (user signs)
   * 2. Call markDomainTransferred to verify and update vault state
   */
  const transferDomainToVault = useCallback(async (domain: string): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');

    try {
      // Get SNS name account via SNS adapter (handles devnet/mainnet automatically)
      const snsNameAccount = snsAdapter.getDomainKey(cleanDomain);

      // Get vault authority PDA (the new owner)
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount, programId);

      console.log('Transferring domain ownership to vault:', {
        domain: cleanDomain,
        snsNameAccount: snsNameAccount.toBase58(),
        currentOwner: publicKey.toBase58(),
        newOwner: vaultAuthority.toBase58(),
      });

      // Verify the SNS account exists
      const snsAccountInfo = await connection.getAccountInfo(snsNameAccount);
      if (!snsAccountInfo) {
        throw new Error(`SNS name account not found: ${snsNameAccount.toBase58()}`);
      }

      // Build the SNS transfer instruction manually (avoids Bonfida SDK derivation issues on devnet)
      const transferIx = buildSnsTransferInstruction(
        snsNameAccount,
        publicKey,
        vaultAuthority
      );

      // Create transaction with the transfer instruction
      const transaction = new Transaction().add(transferIx);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      // Simulate first
      console.log('Simulating SNS transfer...');
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        console.error('SNS transfer simulation error:', simulation.value.err);
        console.error('Logs:', simulation.value.logs);
        throw new Error(`SNS transfer simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      console.log('Simulation successful');

      // Send the transfer transaction
      console.log('Sending domain transfer transaction...');
      const transferSig = await sendTransaction(transaction, connection);

      // Wait for confirmation (polling to avoid WebSocket issues)
      await pollForConfirmation(connection, transferSig, lastValidBlockHeight);

      console.log('Domain transfer successful:', transferSig);

      // Step 2: Call markDomainTransferred to verify and update vault state
      // This is optional - if it fails, the transfer still succeeded
      console.log('Marking domain as transferred in vault state...');
      try {
        await markDomainTransferredOnChain(snsNameAccount);
      } catch (markError) {
        console.warn('Failed to mark domain as transferred on-chain, but transfer succeeded:', markError);
        console.log('The vault state will be updated when the page refreshes.');
        // Don't throw - the main transfer succeeded
      }

      // Refetch vaults
      await fetchVaults();

      return transferSig;
    } catch (error) {
      console.error('Failed to transfer domain to vault:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection, fetchVaults, buildSnsTransferInstruction, snsAdapter, programId]);

  /**
   * Call the mark_domain_transferred instruction to verify and update vault state
   */
  const markDomainTransferredOnChain = useCallback(async (snsNameAccount: PublicKey): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    try {
      const [vault] = getVaultPda(snsNameAccount, programId);
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount, programId);

      // Build the mark_domain_transferred instruction
      const discriminator = await computeDiscriminator('mark_domain_transferred');

      const keys = [
        { pubkey: publicKey, isSigner: true, isWritable: false },           // owner
        { pubkey: snsNameAccount, isSigner: false, isWritable: false },     // sns_name_account
        { pubkey: vault, isSigner: false, isWritable: true },               // vault
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },     // vault_authority
      ];

      const instruction = new TransactionInstruction({
        keys,
        programId,
        data: discriminator,
      });

      const transaction = new Transaction().add(instruction);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      // Simulate first
      console.log('Simulating mark_domain_transferred...');
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        console.error('Simulation error:', simulation.value.err);
        console.error('Logs:', simulation.value.logs);
        throw new Error(`mark_domain_transferred simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      console.log('Simulation successful:', simulation.value.logs);

      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
      });

      await pollForConfirmation(connection, signature, lastValidBlockHeight);

      console.log('Domain marked as transferred:', signature);
      return signature;
    } catch (error) {
      console.error('Failed to mark domain as transferred:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection, programId]);

  /**
   * Reclaim domain ownership from the vault
   *
   * Transfers SNS domain ownership from the vault authority PDA back to
   * a specified destination address.
   */
  const reclaimDomain = useCallback(async (
    domain: string,
    destination: PublicKey
  ): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');

    try {
      // Get SNS name account via SNS adapter
      const snsNameAccount = snsAdapter.getDomainKey(cleanDomain);

      // Get vault and vault authority PDAs
      const [vault] = getVaultPda(snsNameAccount, programId);
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount, programId);

      console.log('Reclaiming domain ownership:', {
        domain: cleanDomain,
        snsNameAccount: snsNameAccount.toBase58(),
        destination: destination.toBase58(),
      });

      // Build the reclaim_domain instruction
      const discriminator = await computeDiscriminator('reclaim_domain');

      const keys = [
        { pubkey: publicKey, isSigner: true, isWritable: true },           // owner
        { pubkey: snsNameAccount, isSigner: false, isWritable: true },     // sns_name_account
        { pubkey: vault, isSigner: false, isWritable: true },               // vault
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },     // vault_authority
        { pubkey: destination, isSigner: false, isWritable: false },        // destination
        { pubkey: SNS_NAME_PROGRAM_ID, isSigner: false, isWritable: false }, // sns_name_program
      ];

      const instruction = new TransactionInstruction({
        keys,
        programId,
        data: discriminator,
      });

      const transaction = new Transaction().add(instruction);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      // Simulate first
      console.log('Simulating reclaim transaction...');
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        console.error('Simulation error:', simulation.value.err);
        console.error('Simulation logs:', simulation.value.logs);
        throw new Error(`Reclaim simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }

      const signature = await sendTransaction(transaction, connection);

      await pollForConfirmation(connection, signature, lastValidBlockHeight);

      console.log('Domain reclaimed successfully:', signature);

      // Refetch vaults
      await fetchVaults();

      return signature;
    } catch (error) {
      console.error('Failed to reclaim domain:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection, fetchVaults, snsAdapter, programId]);

  /**
   * Get PDA addresses for a domain (useful for debugging)
   */
  const getVaultAddresses = useCallback((domain: string) => {
    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
    let snsNameAccount: PublicKey;

    if (testMode) {
      [snsNameAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('test_sns'), Buffer.from(cleanDomain)],
        programId
      );
    } else {
      snsNameAccount = snsAdapter.getDomainKey(cleanDomain);
    }

    const [vault, vaultBump] = getVaultPda(snsNameAccount, programId);
    const [vaultAuthority, vaultAuthBump] = getVaultAuthorityPda(snsNameAccount, programId);
    const [policy, policyBump] = getPolicyPda(snsNameAccount, programId);

    return {
      snsNameAccount: snsNameAccount.toBase58(),
      vault: vault.toBase58(),
      vaultBump,
      vaultAuthority: vaultAuthority.toBase58(),
      vaultAuthBump,
      policy: policy.toBase58(),
      policyBump,
    };
  }, [testMode, snsAdapter, programId]);

  /**
   * Manually register a domain name for a vault (useful for recovery)
   * This caches the domain name locally so the vault can be found even if reverse lookup fails
   */
  const registerDomainForVault = useCallback((snsNameAccountKey: string, domain: string) => {
    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
    try {
      const cached = localStorage.getItem('hydentity_domain_cache');
      const domainCache = cached ? JSON.parse(cached) : {};
      domainCache[snsNameAccountKey] = cleanDomain;
      localStorage.setItem('hydentity_domain_cache', JSON.stringify(domainCache));
      console.log('Registered domain:', cleanDomain, 'for SNS account:', snsNameAccountKey);
      // Refetch vaults to update with new domain name
      fetchVaults();
      return true;
    } catch (e) {
      console.error('Failed to register domain:', e);
      return false;
    }
  }, [fetchVaults]);

  /**
   * Get the cached domain name for an SNS account
   */
  const getCachedDomain = useCallback((snsNameAccountKey: string): string | null => {
    try {
      const cached = localStorage.getItem('hydentity_domain_cache');
      if (cached) {
        const domainCache = JSON.parse(cached);
        return domainCache[snsNameAccountKey] || null;
      }
    } catch (e) {
      console.warn('Failed to get cached domain:', e);
    }
    return null;
  }, []);

  /**
   * Manually lookup a vault by domain name
   * Useful for recovering vaults that aren't being found by automatic scan
   */
  const lookupVaultByDomain = useCallback(async (domain: string): Promise<VaultInfo | null> => {
    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
    console.log('Looking up vault for domain:', cleanDomain);

    try {
      let snsNameAccount: PublicKey;

      if (testMode) {
        [snsNameAccount] = PublicKey.findProgramAddressSync(
          [Buffer.from('test_sns'), Buffer.from(cleanDomain)],
          programId
        );
      } else {
        snsNameAccount = snsAdapter.getDomainKey(cleanDomain);
      }

      console.log('SNS Name Account:', snsNameAccount.toBase58());

      // Derive vault PDA
      const [vaultPda] = getVaultPda(snsNameAccount, programId);
      console.log('Vault PDA:', vaultPda.toBase58());

      // Check if vault exists
      const vaultAccount = await connection.getAccountInfo(vaultPda);
      if (!vaultAccount) {
        console.log('Vault not found on-chain');
        return null;
      }

      console.log('Vault found! Data length:', vaultAccount.data.length);

      // Parse vault data
      const vaultData = parseNameVault(Buffer.from(vaultAccount.data));
      if (!vaultData) {
        console.log('Failed to parse vault data');
        return null;
      }

      console.log('Vault owner:', vaultData.owner.toBase58());
      console.log('Vault SNS name:', vaultData.snsName.toBase58());

      // Get vault authority PDA - this is where SNS resolves to and where funds are held
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount, programId);
      const vaultAuthorityAddress = vaultAuthority.toBase58();

      // Get balance from vault authority (where SOL deposits are held)
      const balance = await connection.getBalance(vaultAuthority);

      // Cache the domain
      try {
        const cached = localStorage.getItem('hydentity_domain_cache');
        const domainCache = cached ? JSON.parse(cached) : {};
        domainCache[snsNameAccount.toBase58()] = cleanDomain;
        localStorage.setItem('hydentity_domain_cache', JSON.stringify(domainCache));
      } catch (e) {
        console.warn('Failed to cache domain:', e);
      }

      const vaultInfo: VaultInfo = {
        domain: cleanDomain,
        vaultAddress: vaultPda.toBase58(),
        vaultAuthorityAddress,
        ownerAddress: vaultData.owner.toBase58(),
        snsNameAccount: snsNameAccount.toBase58(),
        balance: BigInt(balance),
        totalDeposits: Number(vaultData.depositCount),
        pendingDeposits: 0,
        policyEnabled: true,
        minSplits: 1,
        maxSplits: 5,
        minDelaySeconds: 0,
        maxDelaySeconds: 3600,
        createdAt: Number(vaultData.createdAt),
        lastDepositAt: Number(vaultData.lastDepositAt),
        domainTransferred: vaultData.domainTransferred,
      };

      console.log('Vault info:', vaultInfo);

      // Refetch all vaults to include this one
      await fetchVaults();

      return vaultInfo;
    } catch (error) {
      console.error('Failed to lookup vault:', error);
      return null;
    }
  }, [connection, testMode, fetchVaults, programId, snsAdapter]);

  /**
   * Debug: Fetch ALL vault accounts from the program (no filtering)
   * This helps diagnose issues with vault discovery
   */
  const debugFetchAllVaults = useCallback(async () => {
    console.log('=== DEBUG: Fetching ALL vault accounts ===');
    console.log('Program ID:', programId.toBase58());
    console.log('Network:', network);
    console.log('Expected vault size:', NAME_VAULT_SIZE);

    try {
      // Fetch all accounts owned by the program with the vault size
      const accounts = await connection.getProgramAccounts(programId, {
        filters: [
          { dataSize: NAME_VAULT_SIZE },
        ],
      });

      console.log(`Found ${accounts.length} vault-sized accounts`);

      for (const { pubkey, account } of accounts) {
        const data = Buffer.from(account.data);
        console.log('\n--- Vault Account ---');
        console.log('Address:', pubkey.toBase58());
        console.log('Data length:', data.length);

        // Parse owner (at offset 8)
        const owner = new PublicKey(data.slice(8, 40));
        console.log('Owner:', owner.toBase58());

        // Parse sns_name (at offset 40)
        const snsName = new PublicKey(data.slice(40, 72));
        console.log('SNS Name:', snsName.toBase58());

        // Check if owner matches connected wallet
        if (publicKey) {
          console.log('Matches connected wallet:', owner.equals(publicKey));
        }

        // Try to get domain using SNS adapter
        try {
          const domain = await snsAdapter.reverseLookup(connection, snsName);
          console.log('Domain:', domain || 'NOT FOUND');
        } catch (e) {
          console.log('Domain lookup failed:', e);
        }
      }

      console.log('\n=== END DEBUG ===');
      return accounts.length;
    } catch (error) {
      console.error('Debug fetch failed:', error);
      return 0;
    }
  }, [connection, publicKey, programId, network, snsAdapter]);

  /**
   * Manually sync the domain transfer state on-chain
   * Call this if the vault shows incorrect domain transfer status
   */
  const syncDomainTransferState = useCallback(async (domain: string): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
    let snsNameAccount: PublicKey;

    if (testMode) {
      [snsNameAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('test_sns'), Buffer.from(cleanDomain)],
        programId
      );
    } else {
      snsNameAccount = snsAdapter.getDomainKey(cleanDomain);
    }

    console.log('Syncing domain transfer state for:', cleanDomain);
    console.log('SNS Name Account:', snsNameAccount.toBase58());

    return markDomainTransferredOnChain(snsNameAccount);
  }, [connected, publicKey, testMode, programId, snsAdapter, markDomainTransferredOnChain]);

  /**
   * Close a vault, reclaiming all PDA rent
   */
  const closeVault = useCallback(async (domain: string): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');

    try {
      let snsNameAccount: PublicKey;
      if (testMode) {
        [snsNameAccount] = PublicKey.findProgramAddressSync(
          [Buffer.from('test_sns'), Buffer.from(cleanDomain)],
          programId
        );
      } else {
        snsNameAccount = snsAdapter.getDomainKey(cleanDomain);
      }

      const [vault] = getVaultPda(snsNameAccount, programId);
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount, programId);
      const [policy] = getPolicyPda(snsNameAccount, programId);

      const discriminator = await computeDiscriminator('close_vault');

      const keys = [
        { pubkey: publicKey, isSigner: true, isWritable: true },           // owner
        { pubkey: snsNameAccount, isSigner: false, isWritable: false },    // sns_name_account
        { pubkey: vault, isSigner: false, isWritable: true },              // vault
        { pubkey: vaultAuthority, isSigner: false, isWritable: true },     // vault_authority
        { pubkey: policy, isSigner: false, isWritable: true },             // policy
      ];

      const instruction = new TransactionInstruction({
        keys,
        programId,
        data: discriminator,
      });

      const transaction = new Transaction().add(instruction);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      console.log('Simulating close_vault...');
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        console.error('Simulation error:', simulation.value.err);
        console.error('Logs:', simulation.value.logs);
        throw new Error(`close_vault simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      console.log('Simulation successful:', simulation.value.logs);

      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
      });

      await pollForConfirmation(connection, signature, lastValidBlockHeight);

      console.log('Vault closed successfully:', signature);

      await fetchVaults();

      return signature;
    } catch (error) {
      console.error('Failed to close vault:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection, testMode, fetchVaults, programId, snsAdapter]);

  /**
   * Claim a vault as the new domain owner
   */
  const claimVault = useCallback(async (domain: string): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');

    try {
      let snsNameAccount: PublicKey;
      if (testMode) {
        [snsNameAccount] = PublicKey.findProgramAddressSync(
          [Buffer.from('test_sns'), Buffer.from(cleanDomain)],
          programId
        );
      } else {
        snsNameAccount = snsAdapter.getDomainKey(cleanDomain);
      }

      const [vault] = getVaultPda(snsNameAccount, programId);
      const [policy] = getPolicyPda(snsNameAccount, programId);

      const discriminator = await computeDiscriminator('claim_vault');

      const keys = [
        { pubkey: publicKey, isSigner: true, isWritable: true },           // new_owner
        { pubkey: snsNameAccount, isSigner: false, isWritable: false },    // sns_name_account
        { pubkey: vault, isSigner: false, isWritable: true },              // vault
        { pubkey: policy, isSigner: false, isWritable: true },             // policy
      ];

      const instruction = new TransactionInstruction({
        keys,
        programId,
        data: discriminator,
      });

      const transaction = new Transaction().add(instruction);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      console.log('Simulating claim_vault...');
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        console.error('Simulation error:', simulation.value.err);
        console.error('Logs:', simulation.value.logs);
        throw new Error(`claim_vault simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      console.log('Simulation successful:', simulation.value.logs);

      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
      });

      await pollForConfirmation(connection, signature, lastValidBlockHeight);

      console.log('Vault claimed successfully:', signature);

      await fetchVaults();

      return signature;
    } catch (error) {
      console.error('Failed to claim vault:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection, testMode, fetchVaults, programId, snsAdapter]);

  return {
    // State
    vaults: state.vaults,
    isLoading: state.isLoading,
    error: state.error,

    // Actions
    fetchVaults,
    initializeVault,
    getVaultBalance,
    updatePolicy,
    executeClaim,
    withdrawDirect,
    getVaultAddresses,

    // Domain transfer actions
    transferDomainToVault,
    reclaimDomain,
    syncDomainTransferState,

    // Vault lifecycle
    closeVault,
    claimVault,

    // Domain cache helpers
    registerDomainForVault,
    getCachedDomain,

    // Debug & Recovery
    debugFetchAllVaults,
    lookupVaultByDomain,

    // Wallet state
    connected,
    publicKey,

    // Mode
    testMode,
  };
}
