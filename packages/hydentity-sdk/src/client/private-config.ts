/**
 * Private Vault Configuration Manager
 * 
 * High-level interface for managing private vault configurations
 * and withdrawal operations. Handles all Arcium encryption and
 * transaction building.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  ArciumClient,
  PrivateVaultConfig,
  EncryptedConfig,
  WithdrawalPlanSummary,
  BalanceInfo,
  validateConfig,
  createDefaultConfig,
} from './arcium-client';
import { VAULT_SEED } from '../constants';

/**
 * Privacy preset levels
 */
export type PrivacyPreset = 'low' | 'medium' | 'high';

/**
 * Preset configurations
 */
export const PRIVACY_PRESETS: Record<PrivacyPreset, {
  minSplits: number;
  maxSplits: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  description: string;
}> = {
  low: {
    minSplits: 1,
    maxSplits: 3,
    minDelaySeconds: 60,      // 1 minute
    maxDelaySeconds: 600,     // 10 minutes
    description: 'Quick withdrawals with minimal obfuscation',
  },
  medium: {
    minSplits: 2,
    maxSplits: 5,
    minDelaySeconds: 300,     // 5 minutes
    maxDelaySeconds: 1800,    // 30 minutes
    description: 'Balanced privacy and convenience',
  },
  high: {
    minSplits: 3,
    maxSplits: 6,
    minDelaySeconds: 7200,    // 2 hours
    maxDelaySeconds: 28800,   // 8 hours
    description: 'Maximum privacy with longer delays',
  },
};

/**
 * Withdrawal request parameters
 */
export interface WithdrawalRequest {
  /** Amount to withdraw in lamports */
  amount: bigint;
  /** Optional urgency level (affects delay multiplier) */
  urgency?: 'normal' | 'fast';
  /** Optional specific destinations (overrides config if provided) */
  destinations?: PublicKey[];
}

/**
 * Configuration update parameters
 */
export interface ConfigUpdate {
  /** New destinations (replaces all) */
  destinations?: PublicKey[];
  /** Add a single destination */
  addDestination?: PublicKey;
  /** Remove destination at index */
  removeDestinationIndex?: number;
  /** New privacy preset */
  preset?: PrivacyPreset;
  /** Custom split range */
  splitRange?: { min: number; max: number };
  /** Custom delay range in seconds */
  delayRange?: { min: number; max: number };
  /** Auto-withdrawal settings */
  autoWithdraw?: {
    enabled: boolean;
    threshold: bigint;
  };
}

/**
 * Private Configuration Manager
 * 
 * Manages encrypted vault configurations and withdrawal operations
 */
export class PrivateConfigManager {
  private connection: Connection;
  private programId: PublicKey;
  private arciumClient: ArciumClient;
  private initialized = false;

  constructor(connection: Connection, programId: PublicKey) {
    this.connection = connection;
    this.programId = programId;
    this.arciumClient = new ArciumClient(connection, programId);
  }

  /**
   * Initialize the manager (required before encryption operations)
   */
  async initialize(): Promise<void> {
    await this.arciumClient.initialize();
    this.initialized = true;
  }

  /**
   * Ensure manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PrivateConfigManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Create a new private configuration with a preset
   */
  createConfig(
    ownerPubkey: PublicKey,
    destinations: PublicKey[],
    preset: PrivacyPreset = 'medium',
  ): PrivateVaultConfig {
    const presetConfig = PRIVACY_PRESETS[preset];
    
    return {
      ...createDefaultConfig(ownerPubkey, destinations),
      minSplits: presetConfig.minSplits,
      maxSplits: presetConfig.maxSplits,
      minDelaySeconds: presetConfig.minDelaySeconds,
      maxDelaySeconds: presetConfig.maxDelaySeconds,
    };
  }

  /**
   * Encrypt a configuration for storage
   */
  async encryptConfig(config: PrivateVaultConfig): Promise<EncryptedConfig> {
    this.ensureInitialized();
    
    // Validate config
    const errors = validateConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid config: ${errors.join(', ')}`);
    }

    return this.arciumClient.encryptConfig(config);
  }

  /**
   * Build transaction to store private configuration
   * 
   * @param vaultPubkey - The vault to configure
   * @param config - The configuration to store
   * @param payer - Transaction payer
   * @returns Transaction ready to sign and send
   */
  async buildStoreConfigTransaction(
    vaultPubkey: PublicKey,
    config: PrivateVaultConfig,
    payer: PublicKey,
  ): Promise<{
    transaction: Transaction;
    computationOffset: BN;
    encryptedConfig: EncryptedConfig;
  }> {
    this.ensureInitialized();

    // Encrypt the config
    const encryptedConfig = await this.encryptConfig(config);

    // Generate computation offset
    const computationOffset = new BN(Date.now()).mul(new BN(1000)).add(
      new BN(Math.floor(Math.random() * 1000))
    );

    // Derive PDAs
    const [encryptedConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('encrypted_config'), vaultPubkey.toBuffer()],
      this.programId,
    );

    // TODO: Build actual instruction when program is deployed
    // For now, return placeholder
    const instruction = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: vaultPubkey, isSigner: false, isWritable: false },
        { pubkey: encryptedConfigPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([
        // Instruction discriminator for store_private_config
        // TODO: Use actual discriminator
        ...Array(8).fill(0),
        // Computation offset (8 bytes)
        ...computationOffset.toArray('le', 8),
        // Encrypted data (512 bytes)
        ...encryptedConfig.encryptedData,
        // Nonce (16 bytes)
        ...encryptedConfig.nonce,
        // Arcis pubkey (32 bytes)
        ...encryptedConfig.userPubkey,
        // Encryption nonce as u128 (16 bytes)
        ...new BN(encryptedConfig.nonceU128.toString()).toArray('le', 16),
      ]),
    });

    const transaction = new Transaction().add(instruction);

    return {
      transaction,
      computationOffset,
      encryptedConfig,
    };
  }

  /**
   * Build transaction to request a withdrawal
   * 
   * @param vaultPubkey - The vault to withdraw from
   * @param amount - Amount in lamports
   * @param payer - Transaction payer
   * @returns Transaction ready to sign and send
   */
  async buildWithdrawalRequestTransaction(
    vaultPubkey: PublicKey,
    amount: bigint,
    payer: PublicKey,
  ): Promise<{
    transaction: Transaction;
    computationOffset: BN;
    entropy: Uint8Array;
  }> {
    this.ensureInitialized();

    // Generate entropy
    const entropy = this.arciumClient.generateEntropy();
    const entropyTimestamp = Math.floor(Date.now() / 1000);

    // Encrypt entropy
    const { encryptedEntropy, nonce, nonceU128 } = 
      await this.arciumClient.encryptEntropy(entropy);

    // Generate computation offset
    const computationOffset = new BN(Date.now()).mul(new BN(1000)).add(
      new BN(Math.floor(Math.random() * 1000))
    );

    // Derive PDAs
    const [encryptedConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('encrypted_config'), vaultPubkey.toBuffer()],
      this.programId,
    );

    const [withdrawalRequestPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('withdrawal_request'),
        vaultPubkey.toBuffer(),
        computationOffset.toArrayLike(Buffer, 'le', 8),
      ],
      this.programId,
    );

    const [pendingWithdrawalPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('pending_withdrawal'),
        vaultPubkey.toBuffer(),
        computationOffset.toArrayLike(Buffer, 'le', 8),
      ],
      this.programId,
    );

    // TODO: Build actual instruction when program is deployed
    const instruction = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: vaultPubkey, isSigner: false, isWritable: false },
        { pubkey: encryptedConfigPda, isSigner: false, isWritable: false },
        { pubkey: withdrawalRequestPda, isSigner: false, isWritable: true },
        { pubkey: pendingWithdrawalPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([
        // Instruction discriminator for request_withdrawal
        ...Array(8).fill(0),
        // Computation offset (8 bytes)
        ...computationOffset.toArray('le', 8),
        // Amount (8 bytes)
        ...new BN(amount.toString()).toArray('le', 8),
        // User entropy (32 bytes)
        ...encryptedEntropy,
        // Entropy timestamp (8 bytes)
        ...new BN(entropyTimestamp).toArray('le', 8),
        // Entropy signature (64 bytes) - TODO: sign properly
        ...Array(64).fill(0),
        // Arcis pubkey (32 bytes)
        ...this.arciumClient.getUserPublicKey(),
        // Encryption nonce as u128 (16 bytes)
        ...new BN(nonceU128.toString()).toArray('le', 16),
      ]),
    });

    const transaction = new Transaction().add(instruction);

    return {
      transaction,
      computationOffset,
      entropy,
    };
  }

  /**
   * Parse withdrawal plan summary from account data
   */
  parseWithdrawalPlanSummary(
    accountData: Uint8Array,
    nonce: Uint8Array,
  ): WithdrawalPlanSummary {
    this.ensureInitialized();
    return this.arciumClient.decryptPlanSummary(accountData, nonce);
  }

  /**
   * Parse balance info from account data
   */
  parseBalanceInfo(
    accountData: Uint8Array,
    nonce: Uint8Array,
  ): BalanceInfo {
    this.ensureInitialized();
    return this.arciumClient.decryptBalanceInfo(accountData, nonce);
  }

  /**
   * Apply a configuration update
   */
  applyConfigUpdate(
    currentConfig: PrivateVaultConfig,
    update: ConfigUpdate,
  ): PrivateVaultConfig {
    let newConfig = { ...currentConfig };

    // Apply preset if specified
    if (update.preset) {
      const preset = PRIVACY_PRESETS[update.preset];
      newConfig.minSplits = preset.minSplits;
      newConfig.maxSplits = preset.maxSplits;
      newConfig.minDelaySeconds = preset.minDelaySeconds;
      newConfig.maxDelaySeconds = preset.maxDelaySeconds;
    }

    // Apply custom split range
    if (update.splitRange) {
      newConfig.minSplits = update.splitRange.min;
      newConfig.maxSplits = update.splitRange.max;
    }

    // Apply custom delay range
    if (update.delayRange) {
      newConfig.minDelaySeconds = update.delayRange.min;
      newConfig.maxDelaySeconds = update.delayRange.max;
    }

    // Apply destination changes
    if (update.destinations) {
      newConfig.destinations = update.destinations;
    } else if (update.addDestination) {
      if (newConfig.destinations.length >= 5) {
        throw new Error('Maximum 5 destinations allowed');
      }
      newConfig.destinations = [...newConfig.destinations, update.addDestination];
    } else if (update.removeDestinationIndex !== undefined) {
      if (newConfig.destinations.length <= 1) {
        throw new Error('Cannot remove last destination');
      }
      newConfig.destinations = newConfig.destinations.filter(
        (_, i) => i !== update.removeDestinationIndex
      );
    }

    // Apply auto-withdraw settings
    if (update.autoWithdraw) {
      newConfig.autoWithdrawEnabled = update.autoWithdraw.enabled;
      newConfig.autoWithdrawThreshold = update.autoWithdraw.threshold;
    }

    // Validate the updated config
    const errors = validateConfig(newConfig);
    if (errors.length > 0) {
      throw new Error(`Invalid config after update: ${errors.join(', ')}`);
    }

    return newConfig;
  }

  /**
   * Estimate withdrawal fee based on config
   * 
   * @param amount - Withdrawal amount in lamports
   * @param splitCount - Expected number of splits
   * @returns Estimated fees
   */
  estimateWithdrawalFees(amount: bigint, splitCount: number): {
    mpcComputationFee: bigint;
    splitExecutionFees: bigint;
    totalFees: bigint;
    netAmount: bigint;
  } {
    // Estimate based on current Arcium pricing
    // TODO: Get actual prices from Arcium
    const MPC_COMPUTATION_FEE = BigInt(5_000_000); // ~0.005 SOL
    const SPLIT_EXECUTION_FEE = BigInt(2_000_000); // ~0.002 SOL per split

    const mpcComputationFee = MPC_COMPUTATION_FEE;
    const splitExecutionFees = SPLIT_EXECUTION_FEE * BigInt(splitCount);
    const totalFees = mpcComputationFee + splitExecutionFees;
    const netAmount = amount > totalFees ? amount - totalFees : BigInt(0);

    return {
      mpcComputationFee,
      splitExecutionFees,
      totalFees,
      netAmount,
    };
  }
}

/**
 * Format delay for display
 */
export function formatDelay(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}

/**
 * Parse delay from display format
 */
export function parseDelay(value: number, unit: 'mins' | 'hours' | 'days'): number {
  switch (unit) {
    case 'mins': return value * 60;
    case 'hours': return value * 3600;
    case 'days': return value * 86400;
    default: return value * 60;
  }
}

