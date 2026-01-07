import type { Amount } from '../types/common';
import type { PrivacyPolicy, Distribution, PrivacyMode, DestinationMode } from '../types/policy';
import {
  deriveRandomSeed,
  generateSplitAmounts,
  generateDelays,
} from '../utils/randomness';
import { DUST_THRESHOLD_LAMPORTS } from '../constants';

/**
 * Split plan with amounts for each split
 */
export interface SplitPlan {
  amounts: Amount[];
  totalAmount: Amount;
}

/**
 * Delay plan with timing between splits
 */
export interface DelayPlan {
  delays: number[]; // milliseconds
  totalDelayMs: number;
}

/**
 * Complete execution plan for a private claim
 */
export interface ExecutionPlan {
  /** Amount for each split */
  splits: Amount[];
  /** Delay before each split (in ms), length = splits.length - 1 */
  delays: number[];
  /** Total amount being claimed */
  totalAmount: Amount;
  /** Total delay time in milliseconds */
  totalDelayMs: number;
  /** Number of splits */
  splitCount: number;
  /** Estimated completion time (current time + total delay) */
  estimatedCompletionTime: number;
}

/**
 * Policy-based execution plan generator for private claims
 * 
 * IMPORTANT: This generates plans for the CLAIM side (Umbra → Private Wallet).
 * Deposits from Vault → Umbra are always single full-amount transactions.
 * 
 * Flow:
 *   Vault ══[full amount]══► Umbra ──[this plan]──► Private Wallet
 * 
 * Uses deterministic randomness to generate consistent split and delay
 * patterns for reproducibility and compliance verification.
 */
export class PolicyEngine {
  private userSeed: Uint8Array;
  private nonce: bigint;
  private derivedSeed: Uint8Array;

  /**
   * Create a new PolicyEngine instance
   * 
   * @param userSeed - User's master seed (derived from wallet signature)
   * @param nonce - Current policy nonce or deposit nonce
   */
  constructor(userSeed: Uint8Array, nonce: bigint) {
    this.userSeed = userSeed;
    this.nonce = nonce;
    this.derivedSeed = deriveRandomSeed(userSeed, nonce);
  }

  /**
   * Generate split amounts for a claim
   * 
   * @param totalAmount - Total amount to split
   * @param policy - Privacy policy configuration
   * @returns Split plan with amounts
   */
  generateSplits(
    totalAmount: Amount,
    policy: Pick<PrivacyPolicy, 'minSplits' | 'maxSplits' | 'distribution'>
  ): SplitPlan {
    const amounts = generateSplitAmounts(
      totalAmount,
      this.derivedSeed,
      policy.minSplits,
      policy.maxSplits,
      DUST_THRESHOLD_LAMPORTS
    );

    return {
      amounts,
      totalAmount,
    };
  }

  /**
   * Generate delays between splits
   * 
   * @param splitCount - Number of splits
   * @param policy - Privacy policy configuration
   * @returns Delay plan with timings
   */
  generateDelays(
    splitCount: number,
    policy: Pick<PrivacyPolicy, 'minDelaySeconds' | 'maxDelaySeconds'>
  ): DelayPlan {
    const delays = generateDelays(
      this.derivedSeed,
      splitCount,
      policy.minDelaySeconds,
      policy.maxDelaySeconds
    );

    const totalDelayMs = delays.reduce((sum, d) => sum + d, 0);

    return {
      delays,
      totalDelayMs,
    };
  }

  /**
   * Generate a complete execution plan
   * 
   * @param amount - Total amount to claim
   * @param policy - Privacy policy configuration
   * @returns Complete execution plan
   */
  generateExecutionPlan(
    amount: Amount,
    policy: Pick<PrivacyPolicy, 'minSplits' | 'maxSplits' | 'minDelaySeconds' | 'maxDelaySeconds' | 'distribution'>
  ): ExecutionPlan {
    // Generate splits
    const splitPlan = this.generateSplits(amount, policy);
    
    // Generate delays
    const delayPlan = this.generateDelays(splitPlan.amounts.length, policy);

    const now = Date.now();

    return {
      splits: splitPlan.amounts,
      delays: delayPlan.delays,
      totalAmount: amount,
      totalDelayMs: delayPlan.totalDelayMs,
      splitCount: splitPlan.amounts.length,
      estimatedCompletionTime: now + delayPlan.totalDelayMs,
    };
  }

  /**
   * Preview an execution plan without executing
   * 
   * @param amount - Total amount to claim
   * @param policy - Privacy policy configuration
   * @returns Human-readable execution plan summary
   */
  previewExecutionPlan(
    amount: Amount,
    policy: Pick<PrivacyPolicy, 'minSplits' | 'maxSplits' | 'minDelaySeconds' | 'maxDelaySeconds' | 'distribution'>
  ): {
    plan: ExecutionPlan;
    summary: string;
    steps: Array<{ step: number; amount: string; delayBeforeMs: number }>;
  } {
    const plan = this.generateExecutionPlan(amount, policy);

    const steps = plan.splits.map((splitAmount, i) => ({
      step: i + 1,
      amount: `${Number(splitAmount) / 1e9} SOL`,
      delayBeforeMs: i === 0 ? 0 : plan.delays[i - 1],
    }));

    const totalDelayMinutes = Math.ceil(plan.totalDelayMs / 60000);
    const summary = `${plan.splitCount} splits over ~${totalDelayMinutes} minutes`;

    return { plan, summary, steps };
  }

  /**
   * Update the nonce for generating new randomness
   * 
   * @param newNonce - New nonce value
   */
  updateNonce(newNonce: bigint): void {
    this.nonce = newNonce;
    this.derivedSeed = deriveRandomSeed(this.userSeed, newNonce);
  }

  /**
   * Get the current derived seed (for verification)
   */
  getDerivedSeed(): Uint8Array {
    return new Uint8Array(this.derivedSeed);
  }

  /**
   * Validate that an amount can be split according to policy
   * 
   * @param amount - Amount to validate
   * @param minSplits - Minimum number of splits
   * @returns Validation result
   */
  static validateAmount(
    amount: Amount,
    minSplits: number
  ): { valid: boolean; reason?: string } {
    const minRequired = DUST_THRESHOLD_LAMPORTS * BigInt(minSplits);
    
    if (amount < minRequired) {
      return {
        valid: false,
        reason: `Amount ${amount} is too small for ${minSplits} splits (minimum: ${minRequired})`,
      };
    }

    return { valid: true };
  }

  /**
   * Estimate gas cost for an execution plan
   * 
   * @param splitCount - Number of withdrawal splits
   * @param baseFeePerTx - Base fee per transaction in lamports
   * @returns Estimated total gas cost
   */
  static estimateGasCost(
    splitCount: number,
    baseFeePerTx: bigint = 5000n
  ): bigint {
    // Cost breakdown:
    // 1. Single deposit tx (Vault → Umbra): 1 tx
    // 2. Multiple withdrawal txs (Umbra → Private Wallet): splitCount txs
    const depositTx = 1n;
    const withdrawalTxs = BigInt(splitCount);
    return baseFeePerTx * (depositTx + withdrawalTxs);
  }
}

