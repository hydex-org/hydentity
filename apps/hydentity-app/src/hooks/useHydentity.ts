'use client';

/**
 * =============================================================================
 * HYDENTITY HOOK - Main interface for interacting with Hydentity protocol
 * =============================================================================
 * 
 * ⚠️  MAINNET TRANSITION CHECKLIST - Search for "DEVNET_ONLY" in this file
 * 
 * Before deploying to mainnet, the following changes are required:
 * 
 * 1. HYDENTITY_PROGRAM_ID - Update to mainnet deployed program ID
 * 2. DEVNET_SNS_DOMAINS - Remove hardcoded mapping (use Bonfida SDK only)
 * 3. getSnsNameAccount() - Remove devnet-specific logic, use getDomainKeySync only
 * 4. reverseLookupDomain() - Use Bonfida's reverseLookup for mainnet
 * 5. buildSnsTransferInstruction() - Can use Bonfida's transferNameOwnership on mainnet
 * 6. Test mode logic - Remove or disable test mode for production
 * 
 * =============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  TransactionInstruction,
} from '@solana/web3.js';
import { getDomainKeySync } from '@bonfida/spl-name-service';
import { useTestMode } from '@/contexts/TestModeContext';

// =============================================================================
// PROGRAM CONFIGURATION
// =============================================================================

/**
 * DEVNET_ONLY: Hydentity Program ID
 * TODO for mainnet: Update to mainnet deployed program ID
 */
const HYDENTITY_PROGRAM_ID = new PublicKey('46mwRQo4f6sLy9cigZdVJgdEpeEVc6jLRG1H241Uk9GY');

// SNS Name Service Program ID (same on mainnet and devnet)
const SNS_NAME_PROGRAM_ID = new PublicKey('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX');

// PDA Seeds (must match Anchor program)
const VAULT_SEED = Buffer.from('vault');
const VAULT_AUTH_SEED = Buffer.from('vault_auth');
const POLICY_SEED = Buffer.from('policy');

/**
 * DEVNET_ONLY: Hardcoded devnet SNS domains for testing
 * 
 * On devnet, the Bonfida SDK's getDomainKeySync doesn't derive correct PDAs
 * because devnet SNS uses a different structure. This mapping allows us to
 * test with real devnet SNS domains.
 * 
 * TODO for mainnet: Remove this entire mapping and use Bonfida SDK exclusively
 */
const DEVNET_SNS_DOMAINS: Record<string, string> = {
  'hydentity': '9PqfhsmVFZ3UVmSCwcqUZx8dEbxr4R65AQeGAAcQKZCa',
};

/**
 * DEVNET_ONLY: Check if we're on devnet
 * TODO for mainnet: This function can be removed or simplified
 */
function isDevnet(endpoint: string): boolean {
  return endpoint.includes('devnet') || endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
}

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
 * DEVNET_ONLY: Reverse lookup SNS name account -> domain name
 * 
 * On devnet, uses hardcoded mapping because Bonfida's reverseLookup
 * doesn't work with devnet's different SNS structure.
 * 
 * TODO for mainnet: Replace with Bonfida's reverseLookup:
 *   import { reverseLookup } from '@bonfida/spl-name-service';
 *   const domain = await reverseLookup(connection, snsNameAccount);
 */
function reverseLookupDomain(snsNameAccount: PublicKey, endpoint: string): string | null {
  if (isDevnet(endpoint)) {
    // DEVNET_ONLY: Reverse lookup in hardcoded devnet domains
    for (const [domain, account] of Object.entries(DEVNET_SNS_DOMAINS)) {
      if (account === snsNameAccount.toBase58()) {
        return domain;
      }
    }
  }
  // TODO for mainnet: Use Bonfida's reverseLookup
  return null;
}

/**
 * Vault information from on-chain state
 */
export interface VaultInfo {
  domain: string;
  vaultAddress: string;
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
function getVaultPda(snsNameAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, snsNameAccount.toBuffer()],
    HYDENTITY_PROGRAM_ID
  );
}

/**
 * Derive PDA for vault authority
 */
function getVaultAuthorityPda(snsNameAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_AUTH_SEED, snsNameAccount.toBuffer()],
    HYDENTITY_PROGRAM_ID
  );
}

/**
 * Derive PDA for policy
 */
function getPolicyPda(snsNameAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_SEED, snsNameAccount.toBuffer()],
    HYDENTITY_PROGRAM_ID
  );
}

/**
 * DEVNET_ONLY: Get SNS name account for a domain
 * 
 * On devnet, uses hardcoded mapping because Bonfida's getDomainKeySync
 * derives PDAs using mainnet's TLD authority.
 * 
 * TODO for mainnet: Simplify to just use getDomainKeySync:
 *   const { pubkey } = getDomainKeySync(cleanDomain);
 *   return pubkey;
 */
function getSnsNameAccount(domain: string, endpoint: string): PublicKey {
  const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
  
  // DEVNET_ONLY: Check hardcoded mapping first
  if (isDevnet(endpoint)) {
    const devnetAccount = DEVNET_SNS_DOMAINS[cleanDomain];
    if (devnetAccount) {
      console.log(`[DEVNET_ONLY] Using hardcoded SNS account for ${cleanDomain}: ${devnetAccount}`);
      return new PublicKey(devnetAccount);
    }
  }
  
  // For mainnet: Use Bonfida SDK derivation
  const { pubkey } = getDomainKeySync(cleanDomain);
  return pubkey;
}

/**
 * Build the initialize_vault instruction
 */
async function buildInitializeVaultInstruction(
  owner: PublicKey,
  snsNameAccount: PublicKey,
): Promise<TransactionInstruction> {
  const [vault] = getVaultPda(snsNameAccount);
  const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount);
  const [policy] = getPolicyPda(snsNameAccount);

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
    programId: HYDENTITY_PROGRAM_ID,
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

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      console.log('Fetching vaults for wallet:', publicKey.toBase58());
      
      // Compute the NameVault account discriminator
      const vaultDiscriminator = await computeAccountDiscriminator('NameVault');
      console.log('NameVault discriminator:', Array.from(vaultDiscriminator));
      
      // Fetch all NameVault accounts owned by this wallet
      // Filter by:
      // 1. Account data size
      // 2. Owner field (at offset 8, after discriminator)
      const accounts = await connection.getProgramAccounts(HYDENTITY_PROGRAM_ID, {
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
      
      for (const { pubkey, account } of accounts) {
        try {
          const vaultData = parseNameVault(Buffer.from(account.data));
          if (!vaultData) {
            console.warn('Failed to parse vault:', pubkey.toBase58());
            continue;
          }
          
          // Reverse lookup the domain name
          const domain = reverseLookupDomain(vaultData.snsName, connection.rpcEndpoint);
          if (!domain) {
            console.warn('Could not find domain for SNS account:', vaultData.snsName.toBase58());
            // Use truncated pubkey as fallback
          }
          
          // Get the vault authority PDA to check balance
          const [vaultAuthority] = getVaultAuthorityPda(vaultData.snsName);
          const balance = await connection.getBalance(vaultAuthority);
          
          // Get the policy PDA and fetch policy data
          const [policyPda] = getPolicyPda(vaultData.snsName);
          const policyAccount = await connection.getAccountInfo(policyPda);
          
          // Parse policy data (simplified - just get enabled status and split range)
          let policyEnabled = true;
          let minSplits = 1;
          let maxSplits = 5;
          let minDelaySeconds = 0;
          let maxDelaySeconds = 3600;
          
          if (policyAccount && policyAccount.data.length >= 80) {
            const policyData = Buffer.from(policyAccount.data);
            // Skip discriminator (8) + vault (32) + sns_name (32) = 72
            policyEnabled = policyData.readUInt8(72) === 1;
            minSplits = policyData.readUInt8(73);
            maxSplits = policyData.readUInt8(74);
            minDelaySeconds = policyData.readUInt32LE(75);
            maxDelaySeconds = policyData.readUInt32LE(79);
          }
          
          vaults.push({
            domain: domain || `vault-${pubkey.toBase58().slice(0, 8)}`,
            vaultAddress: pubkey.toBase58(),
            ownerAddress: vaultData.owner.toBase58(),
            snsNameAccount: vaultData.snsName.toBase58(),
            balance: BigInt(balance),
            totalDeposits: Number(vaultData.depositCount),
            pendingDeposits: 0, // Would need to track pending Umbra deposits
            policyEnabled,
            minSplits,
            maxSplits,
            minDelaySeconds,
            maxDelaySeconds,
            createdAt: Number(vaultData.createdAt),
            lastDepositAt: Number(vaultData.lastDepositAt),
            domainTransferred: vaultData.domainTransferred,
          });
          
          console.log('Parsed vault:', {
            domain: domain || 'unknown',
            address: pubkey.toBase58(),
            balance: balance / 1e9,
            createdAt: new Date(Number(vaultData.createdAt) * 1000).toISOString(),
          });
        } catch (parseError) {
          console.error('Error parsing vault account:', pubkey.toBase58(), parseError);
        }
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
  }, [connected, publicKey, connection]);

  // Fetch vaults when wallet connects
  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

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
          HYDENTITY_PROGRAM_ID
        );
        
        console.log(`[Test Mode] Using mock SNS account: ${snsNameAccount.toBase58()}`);
      } else {
        // Use real SNS name account (devnet uses hardcoded mapping)
        snsNameAccount = getSnsNameAccount(cleanDomain, connection.rpcEndpoint);
        
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
      const [vault] = getVaultPda(snsNameAccount);
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount);
      const [policy] = getPolicyPda(snsNameAccount);

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
      const instruction = await buildInitializeVaultInstruction(publicKey, snsNameAccount);

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

      // Send transaction (wallet adapter handles signing)
      const signature = await sendTransaction(transaction, connection);
      
      console.log('Transaction sent:', signature);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log('Vault initialized successfully:', signature);
      
      // Refetch vaults
      await fetchVaults();

      return signature;
    } catch (error) {
      console.error('Failed to initialize vault:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection, testMode, fetchVaults]);

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
          HYDENTITY_PROGRAM_ID
        );
      } else {
        snsNameAccount = getSnsNameAccount(cleanDomain, connection.rpcEndpoint);
      }
      
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount);
      const balance = await connection.getBalance(vaultAuthority);
      return BigInt(balance);
    } catch {
      return 0n;
    }
  }, [connection, testMode]);

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
   * Direct withdrawal (emergency)
   */
  const withdrawDirect = useCallback(async (
    domain: string,
    destination: PublicKey,
    amount: bigint
  ): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    // TODO: Integrate with SDK when program is deployed
    console.log('Direct withdraw:', { domain, destination: destination.toBase58(), amount, testMode });
    await new Promise(resolve => setTimeout(resolve, 2000));
    return 'mock_withdraw_signature_' + Date.now();
  }, [connected, publicKey, testMode]);

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
      // Get SNS name account (uses hardcoded mapping on devnet)
      const snsNameAccount = getSnsNameAccount(cleanDomain, connection.rpcEndpoint);
      
      // Get vault authority PDA (the new owner)
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount);
      
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
      
      // Wait for confirmation
      await connection.confirmTransaction({
        signature: transferSig,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log('Domain transfer successful:', transferSig);

      // Step 2: Call markDomainTransferred to verify and update vault state
      console.log('Marking domain as transferred in vault state...');
      await markDomainTransferredOnChain(snsNameAccount);

      // Refetch vaults
      await fetchVaults();

      return transferSig;
    } catch (error) {
      console.error('Failed to transfer domain to vault:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection, fetchVaults, buildSnsTransferInstruction]);

  /**
   * Call the mark_domain_transferred instruction to verify and update vault state
   */
  const markDomainTransferredOnChain = useCallback(async (snsNameAccount: PublicKey): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    try {
      const [vault] = getVaultPda(snsNameAccount);
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount);

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
        programId: HYDENTITY_PROGRAM_ID,
        data: discriminator,
      });

      const transaction = new Transaction().add(instruction);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      const signature = await sendTransaction(transaction, connection);
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log('Domain marked as transferred:', signature);
      return signature;
    } catch (error) {
      console.error('Failed to mark domain as transferred:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection]);

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
      // Get SNS name account
      const snsNameAccount = getSnsNameAccount(cleanDomain, connection.rpcEndpoint);
      
      // Get vault and vault authority PDAs
      const [vault] = getVaultPda(snsNameAccount);
      const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount);
      
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
        programId: HYDENTITY_PROGRAM_ID,
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
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log('Domain reclaimed successfully:', signature);

      // Refetch vaults
      await fetchVaults();

      return signature;
    } catch (error) {
      console.error('Failed to reclaim domain:', error);
      throw error;
    }
  }, [connected, publicKey, sendTransaction, connection, fetchVaults]);

  /**
   * Get PDA addresses for a domain (useful for debugging)
   */
  const getVaultAddresses = useCallback((domain: string) => {
    const cleanDomain = domain.toLowerCase().replace(/\.sol$/, '');
    let snsNameAccount: PublicKey;
    
    if (testMode) {
      [snsNameAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('test_sns'), Buffer.from(cleanDomain)],
        HYDENTITY_PROGRAM_ID
      );
    } else {
      snsNameAccount = getSnsNameAccount(cleanDomain, connection.rpcEndpoint);
    }
    
    const [vault, vaultBump] = getVaultPda(snsNameAccount);
    const [vaultAuthority, vaultAuthBump] = getVaultAuthorityPda(snsNameAccount);
    const [policy, policyBump] = getPolicyPda(snsNameAccount);
    
    return {
      snsNameAccount: snsNameAccount.toBase58(),
      vault: vault.toBase58(),
      vaultBump,
      vaultAuthority: vaultAuthority.toBase58(),
      vaultAuthBump,
      policy: policy.toBase58(),
      policyBump,
    };
  }, [testMode, connection.rpcEndpoint]);

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
    
    // Wallet state
    connected,
    publicKey,
    
    // Mode
    testMode,
  };
}
