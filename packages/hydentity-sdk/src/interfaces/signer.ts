import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import type { SolanaSignature, SolanaAddress } from '../types/solana';
import type { Bytes } from '../types/common';

/**
 * Error class for signer-related errors
 */
export class SignerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignerError';
  }
}

/**
 * Abstract interface for Solana message and transaction signing
 * 
 * This interface defines the contract that all signer implementations
 * must follow. It's designed to be compatible with wallet adapters
 * and other signing mechanisms.
 */
export abstract class ISigner {
  /**
   * Sign a message and return the signature
   * @param message - The message bytes to sign
   * @returns The 64-byte Ed25519 signature
   */
  abstract signMessage(message: Bytes): Promise<SolanaSignature>;

  /**
   * Sign a versioned transaction
   * @param transaction - The transaction to sign
   * @returns The signed transaction
   */
  abstract signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;

  /**
   * Sign multiple versioned transactions
   * @param transactions - The transactions to sign
   * @returns Array of signed transactions
   */
  abstract signTransactions(transactions: VersionedTransaction[]): Promise<VersionedTransaction[]>;

  /**
   * Get the public key of the signer
   * @returns The signer's public key
   */
  abstract getPublicKey(): Promise<SolanaAddress>;
}

/**
 * Keypair-based signer implementation
 * Useful for testing and backend services
 */
export class KeypairSigner extends ISigner {
  private keypair: import('@solana/web3.js').Keypair;

  constructor(keypair: import('@solana/web3.js').Keypair) {
    super();
    this.keypair = keypair;
  }

  async signMessage(message: Bytes): Promise<SolanaSignature> {
    const { sign } = await import('@noble/ed25519');
    const signature = await sign(message, this.keypair.secretKey.slice(0, 32));
    return signature as SolanaSignature;
  }

  async signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction> {
    transaction.sign([this.keypair]);
    return transaction;
  }

  async signTransactions(transactions: VersionedTransaction[]): Promise<VersionedTransaction[]> {
    return transactions.map(tx => {
      tx.sign([this.keypair]);
      return tx;
    });
  }

  async getPublicKey(): Promise<SolanaAddress> {
    return this.keypair.publicKey;
  }
}

/**
 * Wallet adapter signer wrapper
 * Wraps a wallet adapter to implement ISigner
 */
export class WalletAdapterSigner extends ISigner {
  private wallet: {
    publicKey: PublicKey;
    signMessage?(message: Uint8Array): Promise<Uint8Array>;
    signTransaction?<T extends VersionedTransaction>(transaction: T): Promise<T>;
    signAllTransactions?<T extends VersionedTransaction>(transactions: T[]): Promise<T[]>;
  };

  constructor(wallet: WalletAdapterSigner['wallet']) {
    super();
    if (!wallet.publicKey) {
      throw new SignerError('Wallet must be connected');
    }
    this.wallet = wallet;
  }

  async signMessage(message: Bytes): Promise<SolanaSignature> {
    if (!this.wallet.signMessage) {
      throw new SignerError('Wallet does not support message signing');
    }
    const signature = await this.wallet.signMessage(message);
    return signature as SolanaSignature;
  }

  async signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction> {
    if (!this.wallet.signTransaction) {
      throw new SignerError('Wallet does not support transaction signing');
    }
    return this.wallet.signTransaction(transaction);
  }

  async signTransactions(transactions: VersionedTransaction[]): Promise<VersionedTransaction[]> {
    if (!this.wallet.signAllTransactions) {
      throw new SignerError('Wallet does not support batch transaction signing');
    }
    return this.wallet.signAllTransactions(transactions);
  }

  async getPublicKey(): Promise<SolanaAddress> {
    return this.wallet.publicKey;
  }
}

