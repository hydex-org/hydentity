import { Connection, VersionedTransaction, SendTransactionError } from '@solana/web3.js';
import {
  ITransactionForwarder,
  TransactionForwarderError,
  sleep,
  validateDelayArray,
} from '../interfaces/transaction-forwarder';
import type { SolanaTransactionSignature } from '../types/solana';

/**
 * Transaction forwarder that submits transactions directly via Solana RPC
 */
export class ConnectionForwarder extends ITransactionForwarder<SolanaTransactionSignature> {
  readonly connection: Connection;
  private skipPreflight: boolean;
  private commitment: 'processed' | 'confirmed' | 'finalized';

  private constructor(
    connection: Connection,
    options?: {
      skipPreflight?: boolean;
      commitment?: 'processed' | 'confirmed' | 'finalized';
    }
  ) {
    super();
    this.connection = connection;
    this.skipPreflight = options?.skipPreflight ?? false;
    this.commitment = options?.commitment ?? 'confirmed';
  }

  /**
   * Create from existing Connection
   */
  static fromConnection(
    connection: Connection,
    options?: {
      skipPreflight?: boolean;
      commitment?: 'processed' | 'confirmed' | 'finalized';
    }
  ): ConnectionForwarder {
    return new ConnectionForwarder(connection, options);
  }

  /**
   * Create from RPC URL
   */
  static fromRpcUrl(
    rpcUrl: string,
    options?: {
      skipPreflight?: boolean;
      commitment?: 'processed' | 'confirmed' | 'finalized';
    }
  ): ConnectionForwarder {
    const connection = new Connection(rpcUrl, options?.commitment ?? 'confirmed');
    return new ConnectionForwarder(connection, options);
  }

  /**
   * Get the underlying connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Forward a single transaction
   */
  async forwardTransaction(transaction: VersionedTransaction): Promise<SolanaTransactionSignature> {
    try {
      const signature = await this.connection.sendTransaction(transaction, {
        skipPreflight: this.skipPreflight,
      });

      // Wait for confirmation
      const result = await this.connection.confirmTransaction(signature, this.commitment);

      if (result.value.err) {
        throw new TransactionForwarderError(
          `Transaction failed: ${JSON.stringify(result.value.err)}`,
          'TRANSACTION_FAILED'
        );
      }

      return signature;
    } catch (error) {
      if (error instanceof TransactionForwarderError) {
        throw error;
      }
      if (error instanceof SendTransactionError) {
        throw new TransactionForwarderError(
          `Send transaction error: ${error.message}`,
          'SEND_TRANSACTION_ERROR'
        );
      }
      throw new TransactionForwarderError(
        `Unknown error: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR'
      );
    }
  }

  /**
   * Forward multiple transactions without delay
   */
  async forwardTransactions(
    transactions: VersionedTransaction[]
  ): Promise<SolanaTransactionSignature[]> {
    const results: SolanaTransactionSignature[] = [];

    for (const tx of transactions) {
      const signature = await this.forwardTransaction(tx);
      results.push(signature);
    }

    return results;
  }

  /**
   * Forward multiple transactions with a fixed delay
   */
  async forwardTransactionsWithDelay(
    transactions: VersionedTransaction[],
    delayMs: number
  ): Promise<SolanaTransactionSignature[]> {
    const results: SolanaTransactionSignature[] = [];

    for (let i = 0; i < transactions.length; i++) {
      if (i > 0) {
        await sleep(delayMs);
      }
      const signature = await this.forwardTransaction(transactions[i]);
      results.push(signature);
    }

    return results;
  }

  /**
   * Forward multiple transactions with variable delays
   */
  async forwardTransactionsWithDelays(
    transactions: VersionedTransaction[],
    delaysMs: number[]
  ): Promise<SolanaTransactionSignature[]> {
    validateDelayArray(transactions, delaysMs);

    const results: SolanaTransactionSignature[] = [];

    for (let i = 0; i < transactions.length; i++) {
      if (i > 0 && delaysMs[i - 1]) {
        await sleep(delaysMs[i - 1]);
      }
      const signature = await this.forwardTransaction(transactions[i]);
      results.push(signature);
    }

    return results;
  }

  /**
   * Forward transactions starting from an offset
   */
  async forwardTransactionsFromOffset(
    transactions: VersionedTransaction[],
    offset: number,
    delayMs: number
  ): Promise<SolanaTransactionSignature[]> {
    const remainingTxs = transactions.slice(offset);
    return this.forwardTransactionsWithDelay(remainingTxs, delayMs);
  }
}

