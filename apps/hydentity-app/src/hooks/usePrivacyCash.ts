/**
 * =============================================================================
 * USE PRIVACY CASH HOOK
 * =============================================================================
 *
 * React hook for Privacy Cash integration with Hydentity.
 * Provides state management and actions for the ZK mixer pool.
 *
 * Usage:
 *   const {
 *     isAvailable,
 *     isInitialized,
 *     balance,
 *     deposit,
 *     withdraw,
 *   } = usePrivacyCash();
 *
 * =============================================================================
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { useNetwork } from '@/contexts/NetworkContext';
import * as nacl from 'tweetnacl';
import {
  PrivacyCashService,
  createPrivacyCashService,
  PrivateBalance,
  DepositResult,
  WithdrawResult,
  estimatePrivacyCashFees,
} from '@/services/privacy-cash';

export interface UsePrivacyCashReturn {
  // Availability
  isAvailable: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Balance
  balance: PrivateBalance | null;

  // Derived keypair public key (for receiving funds before deposit)
  derivedPublicKey: PublicKey | null;

  // Derived keypair balance (SOL sitting at the derived address, not yet in pool)
  derivedKeyBalance: number | null;

  // Actions
  initialize: (secretKey: Uint8Array) => Promise<void>;
  initializeWithWallet: () => Promise<void>;
  deposit: (lamports: number) => Promise<DepositResult>;
  withdraw: (lamports: number, recipient?: string) => Promise<WithdrawResult>;
  refreshBalance: () => Promise<void>;

  // Recovery: transfer SOL from derived keypair to any address
  recoverFromDerivedKey: (lamports: number, recipient: string) => Promise<string>;
  refreshDerivedKeyBalance: () => Promise<void>;

  // Fee estimation
  estimateFees: (lamports: number) => {
    depositFee: number;
    withdrawFee: number;
    totalFees: number;
    netAmount: number;
  };

  // Combined flow for Hydentity withdrawals
  depositAfterVaultWithdrawal: (lamports: number) => Promise<DepositResult>;
}

// Message to sign for deriving Privacy Cash key
const PRIVACY_CASH_SIGN_MESSAGE = 'Hydentity Privacy Cash Key Derivation v1\n\nSign this message to derive your Privacy Cash encryption key.\nThis key is used to manage your private balance in the ZK mixer pool.';

// Session storage key for caching the derived seed (cleared on browser close for security)
const PRIVACY_CASH_SEED_CACHE_KEY = 'hydentity_privacy_cash_seed';

/**
 * Get cached Privacy Cash seed from sessionStorage
 */
function getCachedSeed(walletPubkey: string): Uint8Array | null {
  try {
    const cached = sessionStorage.getItem(`${PRIVACY_CASH_SEED_CACHE_KEY}_${walletPubkey}`);
    if (cached) {
      const seedArray = JSON.parse(cached);
      return new Uint8Array(seedArray);
    }
  } catch (e) {
    console.warn('[usePrivacyCash] Failed to read cached seed:', e);
  }
  return null;
}

/**
 * Cache Privacy Cash seed to sessionStorage
 */
function cacheSeed(walletPubkey: string, seed: Uint8Array): void {
  try {
    sessionStorage.setItem(
      `${PRIVACY_CASH_SEED_CACHE_KEY}_${walletPubkey}`,
      JSON.stringify(Array.from(seed))
    );
    console.log('[usePrivacyCash] Seed cached for session');
  } catch (e) {
    console.warn('[usePrivacyCash] Failed to cache seed:', e);
  }
}

export function usePrivacyCash(): UsePrivacyCashReturn {
  const { connection } = useConnection();
  const { publicKey, connected, signMessage } = useWallet();
  const { config, network } = useNetwork();

  const [service, setService] = useState<PrivacyCashService | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<PrivateBalance | null>(null);
  const [derivedPublicKey, setDerivedPublicKey] = useState<PublicKey | null>(null);
  const [derivedKeyBalance, setDerivedKeyBalance] = useState<number | null>(null);
  const [derivedSecretKey, setDerivedSecretKey] = useState<Uint8Array | null>(null);

  // Check if Privacy Cash is available for current network
  const networkSupportsPrivacyCash = useMemo(() => {
    return config.features.privacyCashRouting && config.privacyCash?.enabled === true;
  }, [config]);

  // Check SDK availability and create service on mount/network change
  useEffect(() => {
    async function checkAvailability() {
      if (!networkSupportsPrivacyCash) {
        setIsAvailable(false);
        setService(null);
        return;
      }

      try {
        // Check if the SDK is installed
        const sdkAvailable = await PrivacyCashService.isAvailable();
        setIsAvailable(sdkAvailable);

        if (sdkAvailable && config.privacyCash) {
          const newService = createPrivacyCashService(
            connection.rpcEndpoint,
            {
              programId: config.privacyCash.programId.toBase58(),
              relayerUrl: config.privacyCash.relayerUrl,
              enabled: config.privacyCash.enabled,
            }
          );
          setService(newService);
        }
      } catch (err) {
        console.warn('[usePrivacyCash] SDK not available:', err);
        setIsAvailable(false);
        setService(null);
      }
    }

    checkAvailability();
  }, [connection.rpcEndpoint, config, networkSupportsPrivacyCash]);

  // Reset state when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setIsInitialized(false);
      setBalance(null);
      setError(null);
    }
  }, [connected]);

  // Auto-initialize if we have a cached seed (no signature required)
  useEffect(() => {
    async function autoInitialize() {
      if (!service || !publicKey || isInitialized || isLoading) {
        return;
      }

      const cachedSeed = getCachedSeed(publicKey.toBase58());
      if (cachedSeed) {
        console.log('[usePrivacyCash] Found cached seed, auto-initializing...');
        try {
          // Generate keypair from cached seed
          const keypair = nacl.sign.keyPair.fromSeed(cachedSeed);
          const derivedPubkey = new PublicKey(keypair.publicKey);

          setDerivedPublicKey(derivedPubkey);
          setDerivedSecretKey(keypair.secretKey);

          // Get derived key balance
          try {
            const derivedBalance = await connection.getBalance(derivedPubkey);
            setDerivedKeyBalance(derivedBalance / LAMPORTS_PER_SOL);
          } catch (e) {
            console.warn('[usePrivacyCash] Failed to get derived key balance:', e);
          }

          // Initialize service
          await service.initialize(publicKey.toBase58(), keypair.secretKey);
          setIsInitialized(true);

          // Get pool balance
          const initialBalance = service.getCachedBalance();
          if (initialBalance) {
            setBalance(initialBalance);
          }

          console.log('[usePrivacyCash] Auto-initialized from cached seed');
        } catch (err) {
          console.warn('[usePrivacyCash] Auto-initialization failed:', err);
          // Don't set error - user can still manually initialize
        }
      }
    }

    autoInitialize();
  }, [service, publicKey, isInitialized, isLoading, connection]);

  /**
   * Initialize Privacy Cash with wallet pubkey and secret key
   *
   * Note: Prefer using initializeWithWallet() which derives the key
   * from a wallet signature automatically.
   */
  const initialize = useCallback(async (secretKey: Uint8Array) => {
    if (!service) {
      throw new Error('Privacy Cash not available on this network');
    }

    if (!publicKey) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      await service.initialize(publicKey.toBase58(), secretKey);
      setIsInitialized(true);

      // Get cached balance from initialization
      const initialBalance = service.getCachedBalance();
      if (initialBalance) {
        setBalance(initialBalance);
      }

      console.log('[usePrivacyCash] Initialized, balance:', initialBalance?.sol ?? 0, 'SOL');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize Privacy Cash';
      setError(message);
      setIsInitialized(false);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [service, publicKey]);

  /**
   * Initialize Privacy Cash using wallet signature
   *
   * This derives a deterministic key from a wallet signature, allowing
   * browser wallets to work with Privacy Cash without exposing private keys.
   *
   * The derived key is unique per wallet and deterministic, so the same
   * wallet will always derive the same Privacy Cash key.
   */
  const initializeWithWallet = useCallback(async () => {
    if (!service) {
      throw new Error('Privacy Cash not available on this network');
    }

    if (!publicKey) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      const walletPubkeyStr = publicKey.toBase58();

      // Check for cached seed first
      let seed = getCachedSeed(walletPubkeyStr);

      if (seed) {
        console.log('[usePrivacyCash] Using cached seed (no signature required)');
      } else {
        // No cached seed, need to sign
        if (!signMessage) {
          throw new Error('Wallet does not support message signing');
        }

        console.log('[usePrivacyCash] Requesting signature to derive key...');

        // Sign the deterministic message
        const message = new TextEncoder().encode(PRIVACY_CASH_SIGN_MESSAGE);
        const signature = await signMessage(message);

        // Hash the signature to get 32 bytes for the keypair seed
        // Using SHA-256 via Web Crypto API
        const hashBuffer = await crypto.subtle.digest('SHA-256', signature.buffer as ArrayBuffer);
        seed = new Uint8Array(hashBuffer);

        // Cache the seed for this session
        cacheSeed(walletPubkeyStr, seed);
      }

      // Generate keypair from the seed
      const keypair = nacl.sign.keyPair.fromSeed(seed);

      // Store the derived keypair info for receiving funds and recovery
      const derivedPubkey = new PublicKey(keypair.publicKey);
      setDerivedPublicKey(derivedPubkey);
      setDerivedSecretKey(keypair.secretKey);

      console.log('[usePrivacyCash] Derived Privacy Cash key from wallet signature');
      console.log('[usePrivacyCash] Derived public key:', derivedPubkey.toBase58());

      // Get the balance of the derived public key (SOL sitting at that address)
      try {
        const derivedBalance = await connection.getBalance(derivedPubkey);
        setDerivedKeyBalance(derivedBalance / LAMPORTS_PER_SOL);
        console.log('[usePrivacyCash] Derived key balance:', derivedBalance / LAMPORTS_PER_SOL, 'SOL');
      } catch (e) {
        console.warn('[usePrivacyCash] Failed to get derived key balance:', e);
      }

      // Initialize with the wallet pubkey and derived secret key
      await service.initialize(publicKey.toBase58(), keypair.secretKey);
      setIsInitialized(true);

      // Get cached balance from initialization (Privacy Cash pool balance)
      const initialBalance = service.getCachedBalance();
      if (initialBalance) {
        setBalance(initialBalance);
      }

      console.log('[usePrivacyCash] Initialized with wallet-derived key, pool balance:', initialBalance?.sol ?? 0, 'SOL');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize Privacy Cash';
      setError(message);
      setIsInitialized(false);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [service, signMessage, publicKey]);

  /**
   * Deposit SOL to Privacy Cash pool
   */
  const deposit = useCallback(async (lamports: number): Promise<DepositResult> => {
    if (!service || !isInitialized) {
      throw new Error('Privacy Cash not initialized');
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await service.deposit(lamports);

      // Refresh balance after deposit
      const newBalance = await service.getBalance();
      setBalance(newBalance);

      console.log('[usePrivacyCash] Deposited:', lamports / LAMPORTS_PER_SOL, 'SOL');
      console.log('[usePrivacyCash] New balance:', newBalance.sol, 'SOL');

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [service, isInitialized]);

  /**
   * Withdraw SOL from Privacy Cash pool
   */
  const withdraw = useCallback(async (
    lamports: number,
    recipient?: string
  ): Promise<WithdrawResult> => {
    if (!service || !isInitialized) {
      throw new Error('Privacy Cash not initialized');
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await service.withdraw(lamports, recipient);

      // Refresh balance after withdrawal
      const newBalance = await service.getBalance();
      setBalance(newBalance);

      console.log('[usePrivacyCash] Withdrew:', result.amountReceived / LAMPORTS_PER_SOL, 'SOL');
      console.log('[usePrivacyCash] Fee:', result.fee / LAMPORTS_PER_SOL, 'SOL');
      console.log('[usePrivacyCash] New balance:', newBalance.sol, 'SOL');

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdrawal failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [service, isInitialized]);

  /**
   * Refresh Privacy Cash balance
   */
  const refreshBalance = useCallback(async () => {
    if (!service || !isInitialized) return;

    try {
      const newBalance = await service.getBalance();
      setBalance(newBalance);
    } catch (err) {
      console.warn('[usePrivacyCash] Failed to refresh balance:', err);
    }
  }, [service, isInitialized]);

  /**
   * Estimate fees for a given amount
   */
  const estimateFees = useCallback((lamports: number) => {
    return estimatePrivacyCashFees(lamports);
  }, []);

  /**
   * Combined flow: Deposit to Privacy Cash after vault withdrawal
   *
   * This is the main integration point for Hydentity's privacy routing.
   * After a direct withdrawal from the vault, this deposits the funds
   * to the Privacy Cash pool automatically.
   */
  const depositAfterVaultWithdrawal = useCallback(async (
    lamports: number
  ): Promise<DepositResult> => {
    if (!isAvailable) {
      throw new Error('Privacy Cash not available on this network');
    }

    if (!isInitialized) {
      throw new Error(
        'Privacy Cash not initialized. Please initialize before using privacy routing.'
      );
    }

    console.log('[usePrivacyCash] Depositing after vault withdrawal:', lamports / LAMPORTS_PER_SOL, 'SOL');

    return deposit(lamports);
  }, [isAvailable, isInitialized, deposit]);

  /**
   * Refresh the balance of the derived public key
   */
  const refreshDerivedKeyBalance = useCallback(async () => {
    if (!derivedPublicKey) return;

    try {
      const balance = await connection.getBalance(derivedPublicKey);
      setDerivedKeyBalance(balance / LAMPORTS_PER_SOL);
      console.log('[usePrivacyCash] Refreshed derived key balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    } catch (err) {
      console.warn('[usePrivacyCash] Failed to refresh derived key balance:', err);
    }
  }, [connection, derivedPublicKey]);

  /**
   * Recover SOL from the derived keypair to any address
   * This is useful if the Privacy Cash deposit fails
   */
  const recoverFromDerivedKey = useCallback(async (
    lamports: number,
    recipient: string
  ): Promise<string> => {
    if (!derivedSecretKey || !derivedPublicKey) {
      throw new Error('Privacy Cash not initialized. Please initialize first.');
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[usePrivacyCash] Recovering', lamports / LAMPORTS_PER_SOL, 'SOL to', recipient);

      const response = await fetch('/api/privacy-cash/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretKey: Array.from(derivedSecretKey),
          lamports,
          recipient,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Recovery failed');
      }

      console.log('[usePrivacyCash] Recovery successful:', data.signature);

      // Refresh derived key balance
      await refreshDerivedKeyBalance();

      return data.signature;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Recovery failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [derivedSecretKey, derivedPublicKey, refreshDerivedKeyBalance]);

  // Expose recovery function to window for console access (temporary debug helper)
  useEffect(() => {
    if (isInitialized && derivedSecretKey) {
      (window as any).__recoverPrivacyCash = async (lamports: number, recipient: string) => {
        return recoverFromDerivedKey(lamports, recipient);
      };
      console.log('[usePrivacyCash] Recovery function exposed. Use: window.__recoverPrivacyCash(lamports, recipient)');
    }
    return () => {
      delete (window as any).__recoverPrivacyCash;
    };
  }, [isInitialized, derivedSecretKey, recoverFromDerivedKey]);

  return {
    isAvailable,
    isInitialized,
    isLoading,
    error,
    balance,
    derivedPublicKey,
    derivedKeyBalance,
    initialize,
    initializeWithWallet,
    deposit,
    withdraw,
    refreshBalance,
    recoverFromDerivedKey,
    refreshDerivedKeyBalance,
    estimateFees,
    depositAfterVaultWithdrawal,
  };
}

/**
 * Helper hook to check if Privacy Cash is available without full initialization
 */
export function usePrivacyCashAvailable(): boolean {
  const { config } = useNetwork();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    async function check() {
      if (!config.features.privacyCashRouting || !config.privacyCash?.enabled) {
        setAvailable(false);
        return;
      }

      const sdkAvailable = await PrivacyCashService.isAvailable();
      setAvailable(sdkAvailable);
    }
    check();
  }, [config]);

  return available;
}
