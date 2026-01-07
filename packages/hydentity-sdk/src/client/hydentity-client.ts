import {
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import type { Amount, TransactionMode, TransactionOptions, ClaimResult, VaultBalance } from '../types/common';
import type { PrivacyPolicy, PrivacyPolicyConfig, UpdatePolicyParams } from '../types/policy';
import type { SolanaTransactionSignature, SolanaAddress, NameVaultAccount } from '../types/solana';
import { ISigner } from '../interfaces/signer';
import { ITransactionForwarder } from '../interfaces/transaction-forwarder';
import { ConnectionForwarder } from '../implementations/connection-forwarder';
import { PolicyEngine } from './policy-engine';
import { UmbraBridge } from './umbra-bridge';
import {
  getNameVaultPda,
  getVaultAuthorityPda,
  getPrivacyPolicyPda,
  getDelegateSessionPda,
  getAllVaultPdas,
} from '../utils/pda';
import { getSnsNameAccount, resolveSnsName, verifySnsOwnership } from '../utils/sns';
import {
  buildInitializeVaultInstruction,
  buildWithdrawDirectSolInstruction,
} from '../instruction-builders/vault';
import { buildUpdatePolicyInstruction, createUpdatePolicyParams } from '../instruction-builders/policy';
import { buildAddDelegateInstruction, buildRevokeDelegateInstruction } from '../instruction-builders/delegate';
import { HYDENTITY_PROGRAM_ID } from '../constants';

/**
 * Configuration options for HydentityClient
 */
export interface HydentityClientConfig {
  /** RPC endpoint URL */
  rpcUrl?: string;
  /** Existing Connection instance */
  connection?: Connection;
  /** Commitment level */
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

/**
 * Main entry point for interacting with Hydentity protocol
 * 
 * @typeParam T - Return type for custom transaction forwarders
 */
export class HydentityClient<T = SolanaTransactionSignature> {
  private connection: Connection;
  private signer?: ISigner;
  private txForwarder?: ITransactionForwarder<T>;
  private connectionForwarder: ConnectionForwarder;
  private umbraBridge?: UmbraBridge;

  private constructor(config: HydentityClientConfig) {
    if (config.connection) {
      this.connection = config.connection;
    } else if (config.rpcUrl) {
      this.connection = new Connection(config.rpcUrl, config.commitment ?? 'confirmed');
    } else {
      throw new Error('Either connection or rpcUrl must be provided');
    }

    this.connectionForwarder = ConnectionForwarder.fromConnection(this.connection, {
      commitment: config.commitment ?? 'confirmed',
    });
  }

  /**
   * Create a new HydentityClient instance
   */
  static create<T = SolanaTransactionSignature>(
    config: HydentityClientConfig
  ): HydentityClient<T> {
    return new HydentityClient<T>(config);
  }

  /**
   * Create from RPC URL
   */
  static fromRpcUrl<T = SolanaTransactionSignature>(rpcUrl: string): HydentityClient<T> {
    return HydentityClient.create<T>({ rpcUrl });
  }

  /**
   * Create from existing Connection
   */
  static fromConnection<T = SolanaTransactionSignature>(connection: Connection): HydentityClient<T> {
    return HydentityClient.create<T>({ connection });
  }

  /**
   * Get the underlying connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Set the signer for transaction signing
   */
  setSigner(signer: ISigner): void {
    this.signer = signer;
  }

  /**
   * Set a custom transaction forwarder
   */
  setTransactionForwarder(forwarder: ITransactionForwarder<T>): void {
    this.txForwarder = forwarder;
  }

  /**
   * Set the Umbra bridge for private claims
   */
  setUmbraBridge(bridge: UmbraBridge): void {
    this.umbraBridge = bridge;
  }

  /**
   * Get signer public key (throws if no signer set)
   */
  private async getSignerPublicKey(): Promise<SolanaAddress> {
    if (!this.signer) {
      throw new Error('No signer configured. Call setSigner() first.');
    }
    return this.signer.getPublicKey();
  }

  /**
   * Build, sign, and optionally send a transaction based on mode
   */
  private async processTransaction(
    instructions: VersionedTransaction | TransactionMessage,
    opts?: TransactionOptions
  ): Promise<SolanaTransactionSignature | T | VersionedTransaction> {
    const mode = opts?.mode ?? 'connection';

    let transaction: VersionedTransaction;

    if (instructions instanceof VersionedTransaction) {
      transaction = instructions;
    } else {
      const recentBlockhash = await this.connection.getLatestBlockhash();
      transaction = new VersionedTransaction(
        instructions.compileToV0Message()
      );
      transaction.message.recentBlockhash = recentBlockhash.blockhash;
    }

    switch (mode) {
      case 'raw':
        return transaction;

      case 'prepared':
        // Just return with blockhash populated
        return transaction;

      case 'signed':
        if (!this.signer) {
          throw new Error('No signer configured for signed mode');
        }
        return this.signer.signTransaction(transaction);

      case 'forwarder':
        if (!this.signer) {
          throw new Error('No signer configured for forwarder mode');
        }
        if (!this.txForwarder) {
          throw new Error('No transaction forwarder configured');
        }
        const signedTx = await this.signer.signTransaction(transaction);
        return this.txForwarder.forwardTransaction(signedTx);

      case 'connection':
      default:
        if (!this.signer) {
          throw new Error('No signer configured');
        }
        const signedTransaction = await this.signer.signTransaction(transaction);
        return this.connectionForwarder.forwardTransaction(signedTransaction);
    }
  }

  // ============================================
  // Vault Management
  // ============================================

  /**
   * Initialize a new vault for an SNS domain
   * 
   * @param domain - The SNS domain (e.g., "myname" or "myname.sol")
   * @param opts - Transaction options
   */
  async initializeVault(
    domain: string,
    opts?: TransactionOptions
  ): Promise<SolanaTransactionSignature | T | VersionedTransaction> {
    const owner = await this.getSignerPublicKey();
    const snsNameAccount = await getSnsNameAccount(domain);

    const instruction = buildInitializeVaultInstruction(owner, snsNameAccount);

    const recentBlockhash = await this.connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: owner,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [instruction],
    });

    return this.processTransaction(message, opts);
  }

  /**
   * Get the vault PDA for an SNS domain
   */
  async getVaultAddress(domain: string): Promise<PublicKey> {
    const snsNameAccount = await getSnsNameAccount(domain);
    const [vault] = getNameVaultPda(snsNameAccount);
    return vault;
  }

  /**
   * Get vault account data
   */
  async getVaultAccount(domain: string): Promise<NameVaultAccount | null> {
    const vaultAddress = await this.getVaultAddress(domain);
    const accountInfo = await this.connection.getAccountInfo(vaultAddress);

    if (!accountInfo) {
      return null;
    }

    // Parse account data (skip 8-byte discriminator)
    const data = accountInfo.data;
    if (data.length < 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1) {
      return null;
    }

    let offset = 8; // Skip discriminator

    const owner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const snsName = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const totalSolReceived = data.readBigUInt64LE(offset);
    offset += 8;

    const depositCount = data.readBigUInt64LE(offset);
    offset += 8;

    const createdAt = Number(data.readBigInt64LE(offset));
    offset += 8;

    const lastDepositAt = Number(data.readBigInt64LE(offset));
    offset += 8;

    const bump = data[offset];

    return {
      owner,
      snsName,
      totalSolReceived,
      depositCount,
      createdAt,
      lastDepositAt,
      bump,
    };
  }

  /**
   * Get vault balance
   */
  async getVaultBalance(domain: string): Promise<VaultBalance> {
    const vaultAddress = await this.getVaultAddress(domain);
    const balance = await this.connection.getBalance(vaultAddress);

    // TODO: Add SPL token balance fetching
    const tokens = new Map<string, Amount>();

    return {
      sol: BigInt(balance),
      tokens,
    };
  }

  // ============================================
  // Policy Management
  // ============================================

  /**
   * Update the privacy policy for a vault
   */
  async updatePolicy(
    domain: string,
    config: PrivacyPolicyConfig,
    opts?: TransactionOptions
  ): Promise<SolanaTransactionSignature | T | VersionedTransaction> {
    const authority = await this.getSignerPublicKey();
    const snsNameAccount = await getSnsNameAccount(domain);

    const params = createUpdatePolicyParams(config);
    const instruction = buildUpdatePolicyInstruction(authority, snsNameAccount, params);

    const recentBlockhash = await this.connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: authority,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [instruction],
    });

    return this.processTransaction(message, opts);
  }

  /**
   * Get the current privacy policy for a vault
   */
  async getPolicy(domain: string): Promise<PrivacyPolicy | null> {
    const snsNameAccount = await getSnsNameAccount(domain);
    const [policyAddress] = getPrivacyPolicyPda(snsNameAccount);
    const accountInfo = await this.connection.getAccountInfo(policyAddress);

    if (!accountInfo) {
      return null;
    }

    // TODO: Implement full policy parsing
    // For now, return a simplified version
    return null;
  }

  // ============================================
  // Delegate Management
  // ============================================

  /**
   * Add a delegate with time-bounded permissions
   */
  async addDelegate(
    domain: string,
    delegate: PublicKey,
    expiresAt: number,
    permissions: number,
    opts?: TransactionOptions
  ): Promise<SolanaTransactionSignature | T | VersionedTransaction> {
    const owner = await this.getSignerPublicKey();
    const snsNameAccount = await getSnsNameAccount(domain);

    const instruction = buildAddDelegateInstruction(
      owner,
      snsNameAccount,
      delegate,
      expiresAt,
      permissions
    );

    const recentBlockhash = await this.connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: owner,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [instruction],
    });

    return this.processTransaction(message, opts);
  }

  /**
   * Revoke a delegate's permissions
   */
  async revokeDelegate(
    domain: string,
    delegate: PublicKey,
    opts?: TransactionOptions
  ): Promise<SolanaTransactionSignature | T | VersionedTransaction> {
    const owner = await this.getSignerPublicKey();
    const snsNameAccount = await getSnsNameAccount(domain);

    const instruction = buildRevokeDelegateInstruction(owner, snsNameAccount, delegate);

    const recentBlockhash = await this.connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: owner,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [instruction],
    });

    return this.processTransaction(message, opts);
  }

  // ============================================
  // Private Claims
  // ============================================

  /**
   * Execute a private claim through Umbra
   * 
   * This moves funds from the vault through Umbra for private withdrawal
   */
  async executePrivateClaim(
    domain: string,
    amount: Amount,
    destination: PublicKey,
    opts?: TransactionOptions & {
      /** Override policy settings */
      policyOverrides?: Partial<PrivacyPolicyConfig>;
    }
  ): Promise<ClaimResult<SolanaTransactionSignature | T | VersionedTransaction>> {
    if (!this.umbraBridge) {
      throw new Error('Umbra bridge not configured. Call setUmbraBridge() first.');
    }

    // Get policy
    const policy = await this.getPolicy(domain);
    if (!policy) {
      throw new Error('Vault policy not found. Initialize the vault first.');
    }

    // Get vault balance
    const balance = await this.getVaultBalance(domain);
    if (balance.sol < amount) {
      throw new Error(`Insufficient vault balance: ${balance.sol} < ${amount}`);
    }

    // Create policy engine for this claim
    const signer = await this.getSignerPublicKey();
    const masterSeed = new Uint8Array(32); // TODO: Derive from signer
    const policyEngine = new PolicyEngine(masterSeed, policy.policyNonce);

    // Generate execution plan
    const mergedPolicy = { ...policy, ...opts?.policyOverrides };
    const executionPlan = policyEngine.generateExecutionPlan(amount, mergedPolicy);

    // Execute splits via Umbra
    const transactions: Array<SolanaTransactionSignature | T | VersionedTransaction> = [];

    for (let i = 0; i < executionPlan.splits.length; i++) {
      const splitAmount = executionPlan.splits[i];
      
      // Apply delay (except for first split)
      if (i > 0 && executionPlan.delays[i - 1] > 0) {
        await new Promise(resolve => setTimeout(resolve, executionPlan.delays[i - 1]));
      }

      // TODO: Implement actual Umbra deposit and withdrawal
      // For now, this is a placeholder
      const txResult = await this.umbraBridge.depositIntoMixer(splitAmount);
      transactions.push(txResult.signature as SolanaTransactionSignature);
    }

    return {
      splitCount: executionPlan.splits.length,
      totalAmount: amount,
      transactions,
      executionPlan: {
        splits: executionPlan.splits,
        delays: executionPlan.delays,
      },
    };
  }

  // ============================================
  // Emergency Recovery
  // ============================================

  /**
   * Direct withdrawal (bypasses privacy - for emergency recovery)
   * 
   * Warning: This exposes the link between vault and destination
   */
  async withdrawDirect(
    domain: string,
    destination: PublicKey,
    amount: Amount,
    opts?: TransactionOptions
  ): Promise<SolanaTransactionSignature | T | VersionedTransaction> {
    const owner = await this.getSignerPublicKey();
    const snsNameAccount = await getSnsNameAccount(domain);

    const instruction = buildWithdrawDirectSolInstruction(
      owner,
      snsNameAccount,
      destination,
      amount
    );

    const recentBlockhash = await this.connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: owner,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [instruction],
    });

    return this.processTransaction(message, opts);
  }

  // ============================================
  // SNS Helpers
  // ============================================

  /**
   * Verify ownership of an SNS domain
   */
  async verifySnsOwnership(domain: string, owner?: PublicKey): Promise<boolean> {
    const checkOwner = owner ?? await this.getSignerPublicKey();
    return verifySnsOwnership(this.connection, domain, checkOwner);
  }

  /**
   * Get SNS name information
   */
  async getSnsNameInfo(domain: string) {
    return resolveSnsName(this.connection, domain);
  }
}

