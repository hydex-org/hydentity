/**
 * =============================================================================
 * PRIVACY CASH SERVICE
 * =============================================================================
 *
 * Client-side service that communicates with the Privacy Cash API routes.
 * The actual SDK runs on the server since it uses Node.js modules.
 *
 * Flow:
 * 1. Client derives a key from wallet signature
 * 2. Client sends the key to the server API
 * 3. Server runs the Privacy Cash SDK
 * 4. Results are returned to the client
 *
 * =============================================================================
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export interface PrivacyCashConfig {
  programId: string;
  relayerUrl: string;
}

export interface DepositResult {
  signature: string;
  amount: number;
}

export interface WithdrawResult {
  signature: string;
  amountReceived: number;
  fee: number;
}

export interface PrivateBalance {
  lamports: number;
  sol: number;
}

/**
 * Privacy Cash Service
 *
 * Communicates with the server-side Privacy Cash API.
 */
export class PrivacyCashService {
  private walletPubkey: string | null = null;
  private secretKey: Uint8Array | null = null;
  private initialized = false;
  private initError: string | null = null;
  private cachedBalance: PrivateBalance | null = null;

  /**
   * Check if Privacy Cash is available
   * Returns true since we use server-side API
   */
  static async isAvailable(): Promise<boolean> {
    // API is always available on mainnet
    return true;
  }

  /**
   * Initialize the Privacy Cash service
   * Stores the wallet info and validates with the server
   */
  async initialize(walletPubkey: string, secretKey: Uint8Array): Promise<void> {
    this.walletPubkey = walletPubkey;
    this.secretKey = secretKey;

    try {
      console.log('[PrivacyCash] Initializing via API...');

      const response = await fetch('/api/privacy-cash/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletPubkey,
          secretKey: Array.from(secretKey),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize');
      }

      this.initialized = true;
      this.cachedBalance = data.balance;
      this.initError = null;

      console.log('[PrivacyCash] Initialized successfully, balance:', data.balance.sol, 'SOL');
    } catch (err) {
      this.initError = err instanceof Error ? err.message : 'Failed to initialize Privacy Cash';
      this.initialized = false;
      console.error('[PrivacyCash] Initialization failed:', err);
      throw new Error(this.initError);
    }
  }

  /**
   * Check if service is ready for operations
   */
  isReady(): boolean {
    return this.initialized && this.walletPubkey !== null && this.secretKey !== null;
  }

  /**
   * Get initialization error if any
   */
  getInitError(): string | null {
    return this.initError;
  }

  /**
   * Deposit SOL to Privacy Cash pool
   */
  async deposit(lamports: number): Promise<DepositResult> {
    this.ensureInitialized();

    console.log(`[PrivacyCash] Depositing ${lamports / LAMPORTS_PER_SOL} SOL to pool...`);

    const response = await fetch('/api/privacy-cash/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletPubkey: this.walletPubkey,
        secretKey: Array.from(this.secretKey!),
        lamports,
      }),
    });

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('[PrivacyCash] Failed to parse response:', parseError);
      throw new Error(`Deposit failed: Server returned ${response.status} ${response.statusText}`);
    }

    if (!response.ok) {
      console.error('[PrivacyCash] Deposit error from server:', data);
      throw new Error(data.error || `Deposit failed with status ${response.status}`);
    }

    console.log('[PrivacyCash] Deposit successful:', data.signature);

    return data;
  }

  /**
   * Withdraw SOL from Privacy Cash pool
   */
  async withdraw(lamports: number, recipient?: string): Promise<WithdrawResult> {
    this.ensureInitialized();

    console.log(`[PrivacyCash] Withdrawing ${lamports / LAMPORTS_PER_SOL} SOL from pool...`);
    if (recipient) {
      console.log(`[PrivacyCash] Recipient: ${recipient}`);
    }

    const response = await fetch('/api/privacy-cash/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletPubkey: this.walletPubkey,
        secretKey: Array.from(this.secretKey!),
        lamports,
        recipient,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Withdrawal failed');
    }

    console.log('[PrivacyCash] Withdrawal successful:', data.signature);
    console.log('[PrivacyCash] Amount received:', data.amountReceived / LAMPORTS_PER_SOL, 'SOL');
    console.log('[PrivacyCash] Fee:', data.fee / LAMPORTS_PER_SOL, 'SOL');

    return data;
  }

  /**
   * Get private balance in pool
   */
  async getBalance(): Promise<PrivateBalance> {
    this.ensureInitialized();

    const response = await fetch('/api/privacy-cash/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletPubkey: this.walletPubkey,
        secretKey: Array.from(this.secretKey!),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get balance');
    }

    this.cachedBalance = data.balance;
    return data.balance;
  }

  /**
   * Get cached balance (without API call)
   */
  getCachedBalance(): PrivateBalance | null {
    return this.cachedBalance;
  }

  /**
   * Ensure service is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.walletPubkey || !this.secretKey) {
      throw new Error('Privacy Cash not initialized. Call initialize() first.');
    }
  }
}

// Singleton instance
let serviceInstance: PrivacyCashService | null = null;

/**
 * Get the Privacy Cash service singleton
 */
export function getPrivacyCashService(): PrivacyCashService {
  if (!serviceInstance) {
    serviceInstance = new PrivacyCashService();
  }
  return serviceInstance;
}

/**
 * Create Privacy Cash service from network config
 * Returns the singleton instance
 */
export function createPrivacyCashService(
  _rpcUrl: string,
  config: { programId: string; relayerUrl: string; enabled: boolean } | undefined
): PrivacyCashService | null {
  if (!config?.enabled || !config.relayerUrl) {
    return null;
  }

  return getPrivacyCashService();
}

/**
 * Estimate fees for Privacy Cash operations
 *
 * Fee rates fetched from https://api3.privacycash.org/config
 * - withdraw_fee_rate: 0.0035 (0.35%)
 * - withdraw_rent_fee: 0.006 SOL
 */
export function estimatePrivacyCashFees(lamports: number): {
  depositFee: number;
  withdrawFee: number;
  withdrawRentFee: number;
  totalFees: number;
  netAmount: number;
} {
  // Privacy Cash fees (from relayer config):
  // - Deposit: Free (just SOL tx fee ~0.000005 SOL)
  // - Withdrawal: 0.35% + rent fee (0.006 SOL)
  const depositFee = 5000; // ~0.000005 SOL tx fee
  const withdrawFeeRate = 0.0035; // 0.35%
  const withdrawRentFee = 6000000; // 0.006 SOL rent fee

  const withdrawFee = Math.floor(lamports * withdrawFeeRate) + withdrawRentFee;
  const totalFees = depositFee + withdrawFee;
  const netAmount = lamports - totalFees;

  return {
    depositFee,
    withdrawFee,
    withdrawRentFee,
    totalFees,
    netAmount,
  };
}
