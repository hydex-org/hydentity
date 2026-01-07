import { PublicKey, VersionedTransaction } from '@solana/web3.js';

/**
 * Solana address type
 */
export type SolanaAddress = PublicKey;

/**
 * Mint address type
 */
export type MintAddress = PublicKey;

/**
 * Transaction signature string
 */
export type SolanaTransactionSignature = string;

/**
 * Solana signature bytes
 */
export type SolanaSignature = Uint8Array;

/**
 * Program Derived Address
 */
export type ProgramDerivedAddress = PublicKey;

/**
 * Transaction result type based on mode
 */
export type TransactionResult<T> = SolanaTransactionSignature | T | VersionedTransaction;

/**
 * Name vault account state
 */
export interface NameVaultAccount {
  owner: PublicKey;
  snsName: PublicKey;
  totalSolReceived: bigint;
  depositCount: bigint;
  createdAt: number;
  lastDepositAt: number;
  bump: number;
}

/**
 * Vault authority account state
 */
export interface VaultAuthorityAccount {
  vault: PublicKey;
  snsName: PublicKey;
  bump: number;
}

/**
 * SNS name info
 */
export interface SnsNameInfo {
  /** The SNS name account public key */
  nameAccount: PublicKey;
  /** The domain name (without .sol) */
  domain: string;
  /** The owner of the domain */
  owner: PublicKey;
  /** The resolved address (what the domain points to) */
  resolvedAddress?: PublicKey;
}

