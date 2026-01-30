/**
 * Private Withdrawals Hook
 * 
 * React hook for managing private withdrawals via Arcium MPC.
 * Handles withdrawal requests, plan monitoring, and status tracking.
 * 
 * ## Withdrawal Flow
 * 
 * 1. User requests withdrawal with amount
 * 2. MPC generates randomized plan from encrypted config
 * 3. Plan includes: destinations, split amounts, timing delays
 * 4. MPC executes splits automatically at scheduled times
 * 5. User sees funds arrive at configured destinations
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { pollForConfirmation } from '@/lib/pollForConfirmation';

/**
 * Compute Anchor instruction discriminator
 * This is sha256("global:<instruction_name>")[0..8]
 */
async function computeAnchorDiscriminator(instructionName: string): Promise<Buffer> {
  const preimage = `global:${instructionName}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(preimage);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Buffer.from(hashArray.slice(0, 8));
}

// Arcium SDK imports
let arciumAvailable = false;
let getArciumEnv: any;
let getMXEPublicKey: any;
let getMXEAccAddress: any;
let getCompDefAccAddress: any;
let getMempoolAccAddress: any;
let getExecutingPoolAccAddress: any;
let getComputationAccAddress: any;
let getClusterAccAddress: any;
let awaitComputationFinalization: any;
let RescueCipher: any;
let deserializeLE: any;
let x25519: any;

try {
  const arciumClient = require('@arcium-hq/client');
  getArciumEnv = arciumClient.getArciumEnv;
  getMXEPublicKey = arciumClient.getMXEPublicKey;
  getMXEAccAddress = arciumClient.getMXEAccAddress;
  getCompDefAccAddress = arciumClient.getCompDefAccAddress;
  getMempoolAccAddress = arciumClient.getMempoolAccAddress;
  getExecutingPoolAccAddress = arciumClient.getExecutingPoolAccAddress;
  getComputationAccAddress = arciumClient.getComputationAccAddress;
  getClusterAccAddress = arciumClient.getClusterAccAddress;
  awaitComputationFinalization = arciumClient.awaitComputationFinalization;
  RescueCipher = arciumClient.RescueCipher;
  deserializeLE = arciumClient.deserializeLE;
  x25519 = arciumClient.x25519;
  arciumAvailable = true;
} catch (e) {
  console.warn('Arcium SDK not available for withdrawals. Using mock mode.');
}

// Types
export type WithdrawalStatus = 
  | 'pending'      // Plan created, not started
  | 'in_progress'  // Some splits executed
  | 'completed'    // All splits done
  | 'cancelled'    // User cancelled
  | 'failed'       // Execution failed
  | 'expired';     // Plan expired

export interface WithdrawalPlan {
  planId: string;
  vaultPubkey: PublicKey;
  totalAmount: bigint;
  withdrawnAmount: bigint;
  remainingAmount: bigint;
  totalSplits: number;
  completedSplits: number;
  status: WithdrawalStatus;
  createdAt: Date;
  expiresAt: Date;
  lastExecutionAt: Date | null;
  // Individual split status is encrypted (not visible)
}

export interface WithdrawalRequest {
  vaultPubkey: PublicKey;
  amount: bigint;
  urgency?: 'normal' | 'fast';
}

export interface FeeEstimate {
  mpcComputationFee: bigint;
  splitExecutionFees: bigint;
  totalFees: bigint;
  netAmount: bigint;
  estimatedSplits: number;
  estimatedDuration: {
    min: number; // seconds
    max: number; // seconds
  };
}

export interface UseWithdrawalsReturn {
  // State
  isLoading: boolean;
  error: string | null;
  pendingWithdrawals: WithdrawalPlan[];
  completedWithdrawals: WithdrawalPlan[];
  
  // Actions
  requestWithdrawal: (request: WithdrawalRequest) => Promise<string>;
  cancelWithdrawal: (planId: string) => Promise<string>;
  fetchWithdrawals: (vaultPubkey: PublicKey) => Promise<void>;
  
  // Helpers
  estimateFees: (amount: bigint, preset: 'low' | 'medium' | 'high') => FeeEstimate;
  getWithdrawalById: (planId: string) => WithdrawalPlan | undefined;
}

// Constants
const HYDENTITY_PROGRAM_ID = new PublicKey('7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx');

// Fee estimates (TODO: Get from Arcium)
const MPC_COMPUTATION_FEE = BigInt(5_000_000);  // ~0.005 SOL
const SPLIT_EXECUTION_FEE = BigInt(2_000_000);  // ~0.002 SOL per split

// Preset configs for fee estimation
const PRESET_SPLIT_RANGES = {
  low: { min: 1, max: 3 },
  medium: { min: 2, max: 5 },
  high: { min: 3, max: 6 },
};

const PRESET_DELAY_RANGES = {
  low: { min: 60, max: 600 },       // 1-10 minutes
  medium: { min: 300, max: 1800 },  // 5-30 minutes
  high: { min: 7200, max: 28800 },  // 2-8 hours
};

/**
 * Hook for managing private withdrawals
 */
export function useWithdrawals(): UseWithdrawalsReturn {
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalPlan[]>([]);
  const [completedWithdrawals, setCompletedWithdrawals] = useState<WithdrawalPlan[]>([]);

  /**
   * Estimate fees for a withdrawal
   */
  const estimateFees = useCallback((
    amount: bigint,
    preset: 'low' | 'medium' | 'high',
  ): FeeEstimate => {
    const splitRange = PRESET_SPLIT_RANGES[preset];
    const delayRange = PRESET_DELAY_RANGES[preset];
    
    // Estimate average number of splits
    const avgSplits = Math.ceil((splitRange.min + splitRange.max) / 2);
    
    // Calculate fees
    const mpcComputationFee = MPC_COMPUTATION_FEE;
    const splitExecutionFees = SPLIT_EXECUTION_FEE * BigInt(avgSplits);
    const totalFees = mpcComputationFee + splitExecutionFees;
    const netAmount = amount > totalFees ? amount - totalFees : BigInt(0);
    
    // Estimate duration based on delays
    const minDuration = delayRange.min * (avgSplits - 1);
    const maxDuration = delayRange.max * (avgSplits - 1);

    return {
      mpcComputationFee,
      splitExecutionFees,
      totalFees,
      netAmount,
      estimatedSplits: avgSplits,
      estimatedDuration: {
        min: minDuration,
        max: maxDuration,
      },
    };
  }, []);

  /**
   * Request a new withdrawal via Arcium MPC
   */
  const requestWithdrawal = useCallback(async (
    request: WithdrawalRequest,
  ): Promise<string> => {
    if (!publicKey || !signTransaction) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Validate amount
      if (request.amount <= BigInt(0)) {
        throw new Error('Withdrawal amount must be greater than 0');
      }

      console.log('Withdrawal requested:', {
        vault: request.vaultPubkey.toBase58(),
        amount: request.amount.toString(),
        urgency: request.urgency || 'normal',
      });

      // If Arcium SDK not available, use mock mode
      if (!arciumAvailable) {
        console.log('[Mock Mode] Creating mock withdrawal plan');
        const mockPlanId = 'PLAN_' + Date.now().toString(36).toUpperCase();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const mockPlan: WithdrawalPlan = {
          planId: mockPlanId,
          vaultPubkey: request.vaultPubkey,
          totalAmount: request.amount,
          withdrawnAmount: BigInt(0),
          remainingAmount: request.amount,
          totalSplits: 3,
          completedSplits: 0,
          status: 'pending',
          createdAt: now,
          expiresAt,
          lastExecutionAt: null,
        };

        setPendingWithdrawals(prev => [...prev, mockPlan]);
        return mockPlanId;
      }

      // === Arcium MPC Integration ===
      console.log('Initiating Arcium MPC withdrawal request...');

      // 1. Get MXE public key
      const mxePubkey = await getMXEPublicKey({ connection } as any, HYDENTITY_PROGRAM_ID);
      console.log('MXE pubkey fetched');

      // 2. Create encryption keys
      const privateKey = x25519.utils.randomSecretKey();
      const clientPublicKey = x25519.getPublicKey(privateKey);
      const sharedSecret = x25519.getSharedSecret(privateKey, mxePubkey);
      const cipher = new RescueCipher(sharedSecret);

      // 3. Generate user entropy (32 bytes of randomness)
      const userEntropy = new Uint8Array(32);
      crypto.getRandomValues(userEntropy);

      // 4. Encrypt the entropy
      const encryptedEntropy = cipher.encrypt(userEntropy);

      // 5. Generate entropy timestamp and signature (placeholder - would need actual signing)
      const entropyTimestamp = BigInt(Math.floor(Date.now() / 1000));
      const entropySignature = new Uint8Array(64); // Placeholder - would be actual signature

      // 6. Generate nonce
      const nonce = new Uint8Array(16);
      crypto.getRandomValues(nonce);
      const nonceU128 = deserializeLE(nonce);

      // 7. Generate computation offset (random u64)
      const offsetBytes = new Uint8Array(8);
      crypto.getRandomValues(offsetBytes);
      const computationOffset = new BN(Buffer.from(offsetBytes), 'le');

      // 8. Get Arcium environment
      const arciumEnv = getArciumEnv();
      const clusterOffset = arciumEnv.arciumClusterOffset;

      // 9. Derive required accounts
      const mxeAccount = getMXEAccAddress(HYDENTITY_PROGRAM_ID);
      const mempoolAccount = getMempoolAccAddress(clusterOffset);
      const executingPool = getExecutingPoolAccAddress(clusterOffset);
      const computationAccount = getComputationAccAddress(clusterOffset, computationOffset);
      const clusterAccount = getClusterAccAddress(clusterOffset);

      // Computation definition account at fixed offset 2 for generate_withdrawal_plan
      const COMP_DEF_OFFSET = 2;
      const compDefAccount = getCompDefAccAddress(HYDENTITY_PROGRAM_ID, COMP_DEF_OFFSET);

      // Sign PDA
      const SIGN_PDA_SEED = [115, 105, 103, 110, 95, 112, 100, 97]; // "sign_pda"
      const [signPdaAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from(SIGN_PDA_SEED)],
        HYDENTITY_PROGRAM_ID
      );

      // Encrypted config PDA
      const [encryptedConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('encrypted_config'), request.vaultPubkey.toBuffer()],
        HYDENTITY_PROGRAM_ID
      );

      // Withdrawal request PDA
      const compOffsetBytes = Buffer.alloc(8);
      compOffsetBytes.writeBigUInt64LE(BigInt(computationOffset.toString()));
      const [withdrawalRequestPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('withdrawal_request'), request.vaultPubkey.toBuffer(), compOffsetBytes],
        HYDENTITY_PROGRAM_ID
      );

      // Pending withdrawal PDA
      const [pendingWithdrawalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pending_withdrawal'), request.vaultPubkey.toBuffer(), compOffsetBytes],
        HYDENTITY_PROGRAM_ID
      );

      // Arcium accounts
      const ARCIUM_FEE_POOL = new PublicKey('ArcFeP1k5sNVjSDuGgXa6qAL8xJ1LMKPBD2jw4HuPWkz');
      const ARCIUM_CLOCK = new PublicKey('ArcCLo2Zu7Cw4rPW7z6y1kT9qVyJEoVLxYXBmMJDpump');
      const ARCIUM_PROGRAM = new PublicKey('ArcProgramid1111111111111111111111111111111');

      console.log('Accounts derived:');
      console.log('  Withdrawal request:', withdrawalRequestPda.toBase58());
      console.log('  Pending withdrawal:', pendingWithdrawalPda.toBase58());
      console.log('  Encrypted config:', encryptedConfigPda.toBase58());

      // 10. Build instruction discriminator
      const discriminator = await computeAnchorDiscriminator('request_withdrawal');

      // 11. Build instruction data
      // Parameters: computation_offset: u64, amount: u64, user_entropy: [u8; 32],
      //             entropy_timestamp: i64, entropy_signature: [u8; 64],
      //             arcis_pubkey: [u8; 32], encryption_nonce: u128
      const amountBuf = Buffer.alloc(8);
      amountBuf.writeBigUInt64LE(request.amount);

      const timestampBuf = Buffer.alloc(8);
      timestampBuf.writeBigInt64LE(entropyTimestamp);

      const nonceBuf = Buffer.alloc(16);
      const nonceVal = BigInt(nonceU128.toString());
      for (let i = 0; i < 16; i++) {
        nonceBuf[i] = Number((nonceVal >> BigInt(i * 8)) & 0xffn);
      }

      const instructionData = Buffer.concat([
        discriminator,
        compOffsetBytes, // computation_offset: u64
        amountBuf, // amount: u64
        Buffer.from(encryptedEntropy.slice(0, 32)), // user_entropy: [u8; 32]
        timestampBuf, // entropy_timestamp: i64
        Buffer.from(entropySignature), // entropy_signature: [u8; 64]
        Buffer.from(clientPublicKey), // arcis_pubkey: [u8; 32]
        nonceBuf, // encryption_nonce: u128
      ]);

      // 12. Build account keys
      const keys = [
        { pubkey: publicKey, isSigner: true, isWritable: true }, // owner
        { pubkey: request.vaultPubkey, isSigner: false, isWritable: false }, // vault
        { pubkey: encryptedConfigPda, isSigner: false, isWritable: false }, // encrypted_config
        { pubkey: withdrawalRequestPda, isSigner: false, isWritable: true }, // withdrawal_request
        { pubkey: pendingWithdrawalPda, isSigner: false, isWritable: true }, // pending_withdrawal
        { pubkey: signPdaAccount, isSigner: false, isWritable: true }, // sign_pda_account
        { pubkey: mxeAccount, isSigner: false, isWritable: false }, // mxe_account
        { pubkey: mempoolAccount, isSigner: false, isWritable: true }, // mempool_account
        { pubkey: executingPool, isSigner: false, isWritable: true }, // executing_pool
        { pubkey: computationAccount, isSigner: false, isWritable: true }, // computation_account
        { pubkey: compDefAccount, isSigner: false, isWritable: false }, // comp_def_account
        { pubkey: clusterAccount, isSigner: false, isWritable: true }, // cluster_account
        { pubkey: ARCIUM_FEE_POOL, isSigner: false, isWritable: true }, // pool_account
        { pubkey: ARCIUM_CLOCK, isSigner: false, isWritable: false }, // clock_account
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        { pubkey: ARCIUM_PROGRAM, isSigner: false, isWritable: false }, // arcium_program
      ];

      // 13. Create and send transaction
      const instruction = new TransactionInstruction({
        keys,
        programId: HYDENTITY_PROGRAM_ID,
        data: instructionData,
      });

      const transaction = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      // Simulate first
      console.log('Simulating request_withdrawal transaction...');
      try {
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) {
          console.error('Simulation error:', simulation.value.err);
          console.error('Logs:', simulation.value.logs);
          throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }
        console.log('Simulation successful:', simulation.value.logs);
      } catch (simError: any) {
        console.error('Simulation failed:', simError);
        throw new Error(`Transaction simulation failed: ${simError.message}`);
      }

      // Send transaction
      const signature = await sendTransaction(transaction, connection);
      console.log('Transaction sent:', signature);

      // Wait for confirmation (polling to avoid WebSocket issues)
      await pollForConfirmation(connection, signature, lastValidBlockHeight);

      // Create pending withdrawal tracker
      const now = new Date();
      const planId = computationOffset.toString('hex').slice(0, 16).toUpperCase();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const newPlan: WithdrawalPlan = {
        planId,
        vaultPubkey: request.vaultPubkey,
        totalAmount: request.amount,
        withdrawnAmount: BigInt(0),
        remainingAmount: request.amount,
        totalSplits: 0, // Will be set when MPC plan is generated
        completedSplits: 0,
        status: 'pending',
        createdAt: now,
        expiresAt,
        lastExecutionAt: null,
      };

      setPendingWithdrawals(prev => [...prev, newPlan]);

      // Wait for MPC computation finalization
      console.log('Waiting for MPC computation finalization...');
      try {
        await awaitComputationFinalization(
          { connection } as any,
          computationAccount,
          60000 // 60 second timeout
        );
        console.log('MPC computation finalized - withdrawal plan generated');

        // Update status to in_progress
        setPendingWithdrawals(prev => prev.map(w =>
          w.planId === planId ? { ...w, status: 'in_progress' as WithdrawalStatus } : w
        ));
      } catch (finalizationErr) {
        console.warn('MPC finalization timeout (computation may still complete):', finalizationErr);
      }

      console.log('Withdrawal request submitted successfully');
      return planId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request withdrawal';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, connection, sendTransaction]);

  /**
   * Cancel a pending withdrawal
   */
  const cancelWithdrawal = useCallback(async (
    planId: string,
  ): Promise<string> => {
    if (!publicKey || !signTransaction) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Find the withdrawal
      const withdrawal = pendingWithdrawals.find(w => w.planId === planId);
      if (!withdrawal) {
        throw new Error('Withdrawal not found');
      }

      if (withdrawal.status !== 'pending' && withdrawal.status !== 'in_progress') {
        throw new Error('Cannot cancel completed or already cancelled withdrawal');
      }

      console.log('Cancelling withdrawal:', planId);

      // TODO: When Arcium is integrated:
      // 1. Build cancel_withdrawal transaction
      // 2. Send transaction
      // 3. MPC stops execution

      // Placeholder: Update local state
      setPendingWithdrawals(prev => prev.map(w => 
        w.planId === planId
          ? { ...w, status: 'cancelled' as WithdrawalStatus }
          : w
      ));

      return 'CANCEL_' + planId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel withdrawal';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, pendingWithdrawals]);

  /**
   * Fetch withdrawals for a vault
   */
  const fetchWithdrawals = useCallback(async (
    vaultPubkey: PublicKey,
  ): Promise<void> => {
    try {
      // Derive pending withdrawal PDAs
      // Note: In practice, we'd need to track computation offsets to find all PDAs
      // For now, we'll use a different approach - scanning by vault

      // TODO: When Arcium is integrated:
      // 1. Fetch pending withdrawal accounts for vault
      // 2. Decrypt plan summaries (user can decrypt their own)
      // 3. Parse and return withdrawal list

      console.log('Fetching withdrawals for vault:', vaultPubkey.toBase58());

      // Placeholder: Return empty for now
      // Real implementation would query on-chain accounts

    } catch (err) {
      console.error('Failed to fetch withdrawals:', err);
    }
  }, [connection]);

  /**
   * Get a withdrawal by ID
   */
  const getWithdrawalById = useCallback((
    planId: string,
  ): WithdrawalPlan | undefined => {
    return pendingWithdrawals.find(w => w.planId === planId) ||
           completedWithdrawals.find(w => w.planId === planId);
  }, [pendingWithdrawals, completedWithdrawals]);

  // Poll for withdrawal updates
  useEffect(() => {
    if (pendingWithdrawals.length === 0) return;

    const interval = setInterval(() => {
      // TODO: Poll for withdrawal status updates
      // This would check on-chain accounts for execution progress
      console.log('Polling withdrawal status...');
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [pendingWithdrawals]);

  return {
    isLoading,
    error,
    pendingWithdrawals,
    completedWithdrawals,
    requestWithdrawal,
    cancelWithdrawal,
    fetchWithdrawals,
    estimateFees,
    getWithdrawalById,
  };
}

/**
 * Format withdrawal status for display
 */
export function formatWithdrawalStatus(status: WithdrawalStatus): {
  label: string;
  color: string;
  description: string;
} {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        color: 'text-yellow-400',
        description: 'Plan created, waiting to start',
      };
    case 'in_progress':
      return {
        label: 'In Progress',
        color: 'text-blue-400',
        description: 'Splits being executed',
      };
    case 'completed':
      return {
        label: 'Completed',
        color: 'text-green-400',
        description: 'All splits executed successfully',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        color: 'text-gray-400',
        description: 'Withdrawal was cancelled',
      };
    case 'failed':
      return {
        label: 'Failed',
        color: 'text-red-400',
        description: 'Withdrawal execution failed',
      };
    case 'expired':
      return {
        label: 'Expired',
        color: 'text-orange-400',
        description: 'Plan expired before completion',
      };
  }
}

/**
 * Format lamports to SOL for display
 */
export function formatSol(lamports: bigint, decimals: number = 4): string {
  const sol = Number(lamports) / 1e9;
  return sol.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format duration for display
 */
export function formatDurationRange(min: number, max: number): string {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  };

  return `${formatTime(min)} - ${formatTime(max)}`;
}

