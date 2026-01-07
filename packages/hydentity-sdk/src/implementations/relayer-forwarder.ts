import { VersionedTransaction } from '@solana/web3.js';
import {
  ITransactionForwarder,
  TransactionForwarderError,
  sleep,
  validateDelayArray,
} from '../interfaces/transaction-forwarder';
import type { SolanaTransactionSignature, SolanaAddress } from '../types/solana';
import { RELAYER_BASE_URL, DEFAULT_RELAYER_TIMEOUT_MS } from '../constants';

/**
 * Response from the relayer service
 */
interface RelayerResponse {
  success: boolean;
  signature?: string;
  error?: string;
}

/**
 * Transaction forwarder that submits transactions via a relayer service
 * 
 * This enables gasless transactions where the relayer pays for the transaction fees
 */
export class RelayerForwarder extends ITransactionForwarder<SolanaTransactionSignature> {
  readonly relayerPublicKey: SolanaAddress;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  private constructor(
    relayerPublicKey: SolanaAddress,
    options?: {
      baseUrl?: string;
      timeoutMs?: number;
    }
  ) {
    super();
    this.relayerPublicKey = relayerPublicKey;
    this.baseUrl = options?.baseUrl ?? RELAYER_BASE_URL;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_RELAYER_TIMEOUT_MS;
  }

  /**
   * Create from a known relayer public key
   */
  static fromPublicKey(
    relayerPublicKey: SolanaAddress,
    options?: {
      baseUrl?: string;
      timeoutMs?: number;
    }
  ): RelayerForwarder {
    return new RelayerForwarder(relayerPublicKey, options);
  }

  /**
   * Get a random relayer from the available pool
   */
  static async getRandomRelayerForwarder(
    options?: {
      baseUrl?: string;
      timeoutMs?: number;
    }
  ): Promise<RelayerForwarder> {
    const relayers = await RelayerForwarder.getRelayerList(options?.baseUrl);
    if (relayers.length === 0) {
      throw new TransactionForwarderError('No relayers available', 'NO_RELAYERS');
    }
    const randomIndex = Math.floor(Math.random() * relayers.length);
    return new RelayerForwarder(relayers[randomIndex], options);
  }

  /**
   * Get the list of available relayers
   */
  static async getRelayerList(baseUrl?: string): Promise<SolanaAddress[]> {
    const url = `${baseUrl ?? RELAYER_BASE_URL}relayers`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new TransactionForwarderError(
          `Failed to fetch relayer list: ${response.statusText}`,
          'RELAYER_LIST_ERROR'
        );
      }

      const data = await response.json() as { relayers: string[] };
      const { PublicKey } = await import('@solana/web3.js');
      return data.relayers.map(addr => new PublicKey(addr) as SolanaAddress);
    } catch (error) {
      if (error instanceof TransactionForwarderError) {
        throw error;
      }
      throw new TransactionForwarderError(
        `Failed to fetch relayer list: ${error instanceof Error ? error.message : String(error)}`,
        'RELAYER_LIST_ERROR'
      );
    }
  }

  /**
   * Forward a single transaction via the relayer
   */
  async forwardTransaction(transaction: VersionedTransaction): Promise<SolanaTransactionSignature> {
    const serialized = transaction.serialize();
    const base64Tx = Buffer.from(serialized).toString('base64');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}relay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: base64Tx,
          relayer: this.relayerPublicKey.toBase58(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new TransactionForwarderError(
          `Relayer error: ${errorText}`,
          'RELAYER_ERROR'
        );
      }

      const data = await response.json() as RelayerResponse;

      if (!data.success || !data.signature) {
        throw new TransactionForwarderError(
          `Relayer failed: ${data.error ?? 'Unknown error'}`,
          'RELAYER_FAILED'
        );
      }

      return data.signature;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof TransactionForwarderError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TransactionForwarderError(
          `Relayer request timed out after ${this.timeoutMs}ms`,
          'RELAYER_TIMEOUT'
        );
      }

      throw new TransactionForwarderError(
        `Relayer error: ${error instanceof Error ? error.message : String(error)}`,
        'RELAYER_ERROR'
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

