import type { VersionedTransaction } from '@solana/web3.js';

/**
 * Error class for transaction forwarder errors
 */
export class TransactionForwarderError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'TransactionForwarderError';
    this.code = code;
  }
}

/**
 * Abstract interface for forwarding transactions to the Solana network
 * 
 * This interface supports multiple strategies for transaction submission,
 * including direct RPC calls and relayer services.
 */
export abstract class ITransactionForwarder<T> {
  /**
   * Forward a single transaction
   * @param transaction - The signed transaction to forward
   * @returns The result of the forwarding operation
   */
  abstract forwardTransaction(transaction: VersionedTransaction): Promise<T>;

  /**
   * Forward multiple transactions without delay
   * @param transactions - The signed transactions to forward
   * @returns Array of results
   */
  abstract forwardTransactions(transactions: VersionedTransaction[]): Promise<T[]>;

  /**
   * Forward multiple transactions with a fixed delay between each
   * @param transactions - The signed transactions to forward
   * @param delayMs - Delay in milliseconds between transactions
   * @returns Array of results
   */
  abstract forwardTransactionsWithDelay(
    transactions: VersionedTransaction[],
    delayMs: number
  ): Promise<T[]>;

  /**
   * Forward multiple transactions with variable delays
   * @param transactions - The signed transactions to forward
   * @param delaysMs - Array of delays in milliseconds (length must match transactions - 1)
   * @returns Array of results
   */
  abstract forwardTransactionsWithDelays(
    transactions: VersionedTransaction[],
    delaysMs: number[]
  ): Promise<T[]>;

  /**
   * Forward transactions starting from an offset with fixed delay
   * Useful for resuming failed batch operations
   * @param transactions - The signed transactions to forward
   * @param offset - Starting index
   * @param delayMs - Delay in milliseconds between transactions
   * @returns Array of results
   */
  abstract forwardTransactionsFromOffset(
    transactions: VersionedTransaction[],
    offset: number,
    delayMs: number
  ): Promise<T[]>;
}

/**
 * Helper to wait for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate delay array length
 */
export function validateDelayArray(
  transactions: VersionedTransaction[],
  delays: number[]
): void {
  if (delays.length !== transactions.length - 1 && delays.length !== 0) {
    throw new TransactionForwarderError(
      `Invalid delay array length: expected ${transactions.length - 1} or 0, got ${delays.length}`,
      'INVALID_DELAY_ARRAY'
    );
  }
}

