/**
 * Common types used throughout the SDK
 */

/**
 * Amount type (bigint for precision)
 */
export type Amount = bigint;

/**
 * Unix timestamp in seconds
 */
export type Timestamp = number;

/**
 * Byte array type
 */
export type Bytes = Uint8Array;

/**
 * 128-bit unsigned integer
 */
export type U128 = bigint;

/**
 * 256-bit unsigned integer
 */
export type U256 = bigint;

/**
 * Transaction mode for client operations
 */
export type TransactionMode = 
  | 'connection'  // Sign and send via direct RPC
  | 'forwarder'   // Sign and forward via configured txForwarder
  | 'signed'      // Sign but don't submit
  | 'prepared'    // Populate blockhash/fee payer, don't sign
  | 'raw';        // Build with placeholder blockhash

/**
 * Options for transaction operations
 */
export interface TransactionOptions {
  mode?: TransactionMode;
  skipPreflight?: boolean;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

/**
 * Result of a claim operation
 */
export interface ClaimResult<T> {
  /** Number of splits executed */
  splitCount: number;
  /** Total amount claimed */
  totalAmount: Amount;
  /** Individual transaction results */
  transactions: T[];
  /** Execution plan used */
  executionPlan: {
    splits: Amount[];
    delays: number[];
  };
}

/**
 * Vault balance information
 */
export interface VaultBalance {
  sol: Amount;
  tokens: Map<string, Amount>;
}

