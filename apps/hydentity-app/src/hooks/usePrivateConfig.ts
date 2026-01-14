/**
 * Private Vault Configuration Hook
 * 
 * React hook for managing private vault configurations with Arcium MPC.
 * Handles encryption, storage, and updates of destination wallets and
 * privacy settings.
 * 
 * ## Privacy Flow
 * 
 * 1. User configures destinations and privacy settings
 * 2. Hook encrypts config with MXE public key
 * 3. Encrypted config stored on-chain
 * 4. MPC cluster validates and stores internally
 * 5. Future withdrawals use this encrypted config
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

// Types matching the SDK (inline for now, will import from SDK when deployed)
export type PrivacyPreset = 'low' | 'medium' | 'high';

export interface PrivateVaultConfig {
  version: number;
  destinations: PublicKey[];
  minSplits: number;
  maxSplits: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  autoWithdrawEnabled: boolean;
  autoWithdrawThreshold: bigint;
  ownerPubkey: PublicKey;
  usePrivacyCash: boolean;
}

export interface ConfigStatus {
  isInitialized: boolean;
  version: number;
  lastUpdatedAt: Date | null;
  configHash: string | null;
}

export const PRIVACY_PRESETS: Record<PrivacyPreset, {
  label: string;
  description: string;
  minSplits: number;
  maxSplits: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
}> = {
  low: {
    label: 'Low',
    description: 'Quick withdrawals with minimal obfuscation',
    minSplits: 1,
    maxSplits: 3,
    minDelaySeconds: 60,      // 1 minute
    maxDelaySeconds: 600,     // 10 minutes
  },
  medium: {
    label: 'Medium',
    description: 'Balanced privacy and convenience',
    minSplits: 2,
    maxSplits: 5,
    minDelaySeconds: 300,     // 5 minutes
    maxDelaySeconds: 1800,    // 30 minutes
  },
  high: {
    label: 'High',
    description: 'Maximum privacy with longer delays',
    minSplits: 3,
    maxSplits: 5,
    minDelaySeconds: 7200,    // 2 hours
    maxDelaySeconds: 28800,   // 8 hours
  },
};

export interface UsePrivateConfigReturn {
  // State
  isLoading: boolean;
  error: string | null;
  configStatus: ConfigStatus | null;
  
  // Actions
  initializeConfig: (config: PrivateVaultConfigInput) => Promise<string>;
  updateConfig: (updates: ConfigUpdateInput) => Promise<string>;
  fetchConfigStatus: (vaultPubkey: PublicKey) => Promise<ConfigStatus>;
  
  // Helpers
  createConfigFromPreset: (
    ownerPubkey: PublicKey,
    destinations: PublicKey[],
    preset: PrivacyPreset,
  ) => PrivateVaultConfig;
  validateConfig: (config: PrivateVaultConfig) => string[];
}

export interface PrivateVaultConfigInput {
  vaultPubkey: PublicKey;
  destinations: PublicKey[];
  preset?: PrivacyPreset;
  customSettings?: {
    minSplits?: number;
    maxSplits?: number;
    minDelaySeconds?: number;
    maxDelaySeconds?: number;
  };
  autoWithdraw?: {
    enabled: boolean;
    thresholdLamports: bigint;
  };
}

export interface ConfigUpdateInput {
  vaultPubkey: PublicKey;
  preset?: PrivacyPreset;
  addDestination?: PublicKey;
  removeDestinationIndex?: number;
  replaceDestinations?: PublicKey[];
  autoWithdraw?: {
    enabled: boolean;
    thresholdLamports: bigint;
  };
}

// Constants
const MAX_DESTINATIONS = 5;
const MAX_SPLITS = 10;
const MIN_DELAY_FLOOR = 60; // 1 minute
const MAX_DELAY_CEILING = 604800; // 7 days

// Program ID - will match deployed Hydentity program
const HYDENTITY_PROGRAM_ID = new PublicKey('46mwRQo4f6sLy9cigZdVJgdEpeEVc6jLRG1H241Uk9GY');

/**
 * Hook for managing private vault configurations
 */
export function usePrivateConfig(): UsePrivateConfigReturn {
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);

  /**
   * Create a config from a preset
   */
  const createConfigFromPreset = useCallback((
    ownerPubkey: PublicKey,
    destinations: PublicKey[],
    preset: PrivacyPreset = 'medium',
  ): PrivateVaultConfig => {
    const presetConfig = PRIVACY_PRESETS[preset];
    
    return {
      version: 1,
      destinations,
      minSplits: presetConfig.minSplits,
      maxSplits: presetConfig.maxSplits,
      minDelaySeconds: presetConfig.minDelaySeconds,
      maxDelaySeconds: presetConfig.maxDelaySeconds,
      autoWithdrawEnabled: false,
      autoWithdrawThreshold: BigInt(0),
      ownerPubkey,
      usePrivacyCash: false,
    };
  }, []);

  /**
   * Validate a config
   */
  const validateConfig = useCallback((config: PrivateVaultConfig): string[] => {
    const errors: string[] = [];

    if (config.destinations.length === 0) {
      errors.push('At least one destination wallet required');
    }
    if (config.destinations.length > MAX_DESTINATIONS) {
      errors.push(`Maximum ${MAX_DESTINATIONS} destination wallets allowed`);
    }
    if (config.minSplits < 1) {
      errors.push('Minimum splits must be at least 1');
    }
    if (config.minSplits > config.maxSplits) {
      errors.push('Min splits cannot exceed max splits');
    }
    if (config.maxSplits > MAX_SPLITS) {
      errors.push(`Maximum ${MAX_SPLITS} splits allowed`);
    }
    if (config.minDelaySeconds < MIN_DELAY_FLOOR) {
      errors.push(`Minimum delay must be at least ${MIN_DELAY_FLOOR} seconds (1 minute)`);
    }
    if (config.maxDelaySeconds > MAX_DELAY_CEILING) {
      errors.push(`Maximum delay cannot exceed ${MAX_DELAY_CEILING} seconds (7 days)`);
    }
    if (config.minDelaySeconds > config.maxDelaySeconds) {
      errors.push('Min delay cannot exceed max delay');
    }

    // Validate destination addresses
    for (let i = 0; i < config.destinations.length; i++) {
      try {
        // Check if it's a valid pubkey
        new PublicKey(config.destinations[i].toBase58());
      } catch {
        errors.push(`Invalid destination address at index ${i}`);
      }
    }

    return errors;
  }, []);

  /**
   * Initialize private config for a vault
   */
  const initializeConfig = useCallback(async (
    input: PrivateVaultConfigInput,
  ): Promise<string> => {
    if (!publicKey || !signTransaction) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create config from input
      const preset = input.preset || 'medium';
      let config = createConfigFromPreset(publicKey, input.destinations, preset);

      // Apply custom settings if provided
      if (input.customSettings) {
        if (input.customSettings.minSplits !== undefined) {
          config.minSplits = input.customSettings.minSplits;
        }
        if (input.customSettings.maxSplits !== undefined) {
          config.maxSplits = input.customSettings.maxSplits;
        }
        if (input.customSettings.minDelaySeconds !== undefined) {
          config.minDelaySeconds = input.customSettings.minDelaySeconds;
        }
        if (input.customSettings.maxDelaySeconds !== undefined) {
          config.maxDelaySeconds = input.customSettings.maxDelaySeconds;
        }
      }

      // Apply auto-withdraw settings
      if (input.autoWithdraw) {
        config.autoWithdrawEnabled = input.autoWithdraw.enabled;
        config.autoWithdrawThreshold = input.autoWithdraw.thresholdLamports;
      }

      // Validate
      const errors = validateConfig(config);
      if (errors.length > 0) {
        throw new Error(`Invalid config: ${errors.join(', ')}`);
      }

      // TODO: When Arcium is integrated:
      // 1. Initialize ArciumClient
      // 2. Encrypt config with MXE public key
      // 3. Build and send store_private_config transaction
      // 4. Wait for MPC callback

      console.log('Private config to store:', config);
      console.log('Vault:', input.vaultPubkey.toBase58());

      // Placeholder: Return mock signature
      // In production, this would be the actual transaction signature
      const mockSignature = 'ARCIUM_CONFIG_PENDING_' + Date.now().toString(36);
      
      // Update status
      setConfigStatus({
        isInitialized: true,
        version: 1,
        lastUpdatedAt: new Date(),
        configHash: null, // Will be set by MPC callback
      });

      return mockSignature;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize config';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, createConfigFromPreset, validateConfig]);

  /**
   * Update existing private config
   */
  const updateConfig = useCallback(async (
    input: ConfigUpdateInput,
  ): Promise<string> => {
    if (!publicKey || !signTransaction) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: When Arcium is integrated:
      // 1. Fetch current encrypted config
      // 2. Build update instruction
      // 3. Queue Arcium computation
      // 4. MPC applies updates to encrypted config

      console.log('Config update requested:', input);

      // Placeholder
      const mockSignature = 'ARCIUM_UPDATE_PENDING_' + Date.now().toString(36);

      // Update status
      if (configStatus) {
        setConfigStatus({
          ...configStatus,
          version: configStatus.version + 1,
          lastUpdatedAt: new Date(),
        });
      }

      return mockSignature;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update config';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, configStatus]);

  /**
   * Fetch config status for a vault
   */
  const fetchConfigStatus = useCallback(async (
    vaultPubkey: PublicKey,
  ): Promise<ConfigStatus> => {
    try {
      // Derive encrypted config PDA
      const [encryptedConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('encrypted_config'), vaultPubkey.toBuffer()],
        HYDENTITY_PROGRAM_ID,
      );

      // Fetch account
      const accountInfo = await connection.getAccountInfo(encryptedConfigPda);

      if (!accountInfo) {
        return {
          isInitialized: false,
          version: 0,
          lastUpdatedAt: null,
          configHash: null,
        };
      }

      // Parse account data
      // Layout: discriminator(8) + vault(32) + encrypted_data(512) + nonce(16) + 
      //         version(1) + config_hash(32) + last_updated_slot(8) + last_updated_at(8) + ...
      const data = accountInfo.data;
      
      // Skip discriminator (8) + vault (32) + encrypted_data (512) + nonce (16)
      const versionOffset = 8 + 32 + 512 + 16;
      const version = data[versionOffset];
      
      // Config hash at version + 1
      const configHashOffset = versionOffset + 1;
      const configHash = Buffer.from(data.slice(configHashOffset, configHashOffset + 32)).toString('hex');
      
      // Last updated at offset
      const lastUpdatedAtOffset = configHashOffset + 32 + 8; // Skip slot
      const lastUpdatedAtTimestamp = data.readBigInt64LE(lastUpdatedAtOffset);
      
      // Is initialized
      const isInitializedOffset = lastUpdatedAtOffset + 8;
      const isInitialized = data[isInitializedOffset] !== 0;

      const status: ConfigStatus = {
        isInitialized,
        version,
        lastUpdatedAt: isInitialized ? new Date(Number(lastUpdatedAtTimestamp) * 1000) : null,
        configHash: isInitialized ? configHash : null,
      };

      setConfigStatus(status);
      return status;
    } catch (err) {
      console.error('Failed to fetch config status:', err);
      return {
        isInitialized: false,
        version: 0,
        lastUpdatedAt: null,
        configHash: null,
      };
    }
  }, [connection]);

  return {
    isLoading,
    error,
    configStatus,
    initializeConfig,
    updateConfig,
    fetchConfigStatus,
    createConfigFromPreset,
    validateConfig,
  };
}

/**
 * Format seconds to human-readable duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`;
  return `${Math.round(seconds / 86400)} day`;
}

/**
 * Parse duration input to seconds
 */
export function parseDuration(value: number, unit: 'mins' | 'hours' | 'days'): number {
  switch (unit) {
    case 'mins': return value * 60;
    case 'hours': return value * 3600;
    case 'days': return value * 86400;
    default: return value * 60;
  }
}

