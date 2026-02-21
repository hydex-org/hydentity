'use client';

import { useState, useCallback } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import BN from 'bn.js';
import { useRouterContext } from '@/contexts/RouterContext';
import type { Vault } from 'sdk/src/accounts/vault';
import type { Pool } from 'sdk/src/accounts/pool';
import buildCreateVaultInstruction from 'sdk/src/instructions/createVault';
import { deriveVaultAddress } from 'sdk/src/utils/pda';

interface UseRouterReturn {
  createVault: (pool: Pool, mode: number) => Promise<[PublicKey, string]>;
  initDestinationConfig: (vault: Vault, destination: PublicKey) => Promise<[PublicKey, string]>;
  viewVaultBalance: (vault: Vault) => Promise<{
    availableK: bigint;
    spentK: bigint;
    intervalCursor: bigint;
    exitLength: bigint;
    remainingBondK: bigint;
  }>;
  freezeVault: (vault: PublicKey) => Promise<string>;
  closeVault: (vault: PublicKey) => Promise<string>;
  markDomainTransfer: (vault: PublicKey, snsNameAccount: PublicKey) => Promise<string>;
  reclaimDomain: (snsNameAccount: PublicKey, vault: PublicKey, destination: PublicKey) => Promise<string>;
  sweepVault: (vault: Vault) => Promise<string>;
  isProcessing: boolean;
  txError: string | null;
  lastTxSignature: string | null;
}

export function useRouter(): UseRouterReturn {
  const { client, baseClient, isSignerReady } = useRouterContext();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastTxSignature, setLastTxSignature] = useState<string | null>(null);

  const withProcessing = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setIsProcessing(true);
      setTxError(null);
      try {
        const result = await fn();
        return result;
      } catch (err: any) {
        const message = err.message || 'Transaction failed';
        setTxError(message);
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  /**
   * Create a new vault with nonce bug workaround.
   * SDK's createVault() crashes on empty vault array (line 290).
   * We manually build the instruction with nonce=0 when no vaults exist.
   */
  const createVault = useCallback(
    async (pool: Pool, mode: number): Promise<[PublicKey, string]> => {
      if (!baseClient || !publicKey || !signTransaction) {
        throw new Error('Wallet not connected');
      }

      return withProcessing(async () => {
        // Fetch existing vaults to determine nonce
        const existingVaults = await baseClient.getAllVaultsByOwner({
          owner: publicKey,
          mint: pool.assetMint,
        });

        let vaultKey: PublicKey;
        let txSig: string;

        if (existingVaults.length === 0) {
          // WORKAROUND: SDK crashes on empty array, build instruction manually
          const nonce = new BN(0);
          const programId = new PublicKey(baseClient['programId']);
          vaultKey = deriveVaultAddress(publicKey, pool.pubkey, nonce, programId);

          const ix = buildCreateVaultInstruction({
            signer: publicKey,
            programId,
            pool: pool.pubkey,
            nonce,
            assetMint: pool.assetMint,
            mode: new BN(mode),
          });

          const tx = new Transaction().add(ix);
          tx.feePayer = publicKey;
          tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
          const signed = await signTransaction(tx);
          txSig = await connection.sendRawTransaction(signed.serialize());
        } else {
          // SDK works normally when vaults exist
          [vaultKey, txSig] = await baseClient.createVault(pool, new BN(mode));
        }

        setLastTxSignature(txSig);
        return [vaultKey, txSig];
      });
    },
    [baseClient, publicKey, signTransaction, connection, withProcessing]
  );

  const initDestinationConfig = useCallback(
    async (vault: Vault, destination: PublicKey): Promise<[PublicKey, string]> => {
      if (!client) throw new Error('MPC client not available');
      return withProcessing(async () => {
        const [configKey, txSig] = await client.initDestinationConfig(vault, destination);
        setLastTxSignature(txSig);
        return [configKey, txSig];
      });
    },
    [client, withProcessing]
  );

  const viewVaultBalance = useCallback(
    async (vault: Vault) => {
      if (!client) throw new Error('MPC client not available');
      return withProcessing(async () => {
        return client.viewVaultBalance(vault, {
          pollIntervalMs: 3000,
          timeoutMs: 180000,
        });
      });
    },
    [client, withProcessing]
  );

  const freezeVault = useCallback(
    async (vault: PublicKey): Promise<string> => {
      if (!baseClient) throw new Error('Client not available');
      return withProcessing(async () => {
        const txSig = await baseClient.freezeVault(vault);
        setLastTxSignature(txSig);
        return txSig;
      });
    },
    [baseClient, withProcessing]
  );

  const closeVault = useCallback(
    async (vault: PublicKey): Promise<string> => {
      if (!baseClient) throw new Error('Client not available');
      return withProcessing(async () => {
        const txSig = await baseClient.closeVault(vault);
        setLastTxSignature(txSig);
        return txSig;
      });
    },
    [baseClient, withProcessing]
  );

  const markDomainTransfer = useCallback(
    async (vault: PublicKey, snsNameAccount: PublicKey): Promise<string> => {
      if (!baseClient) throw new Error('Client not available');
      return withProcessing(async () => {
        const txSig = await baseClient.markDomainTransfer(vault, snsNameAccount);
        setLastTxSignature(txSig);
        return txSig;
      });
    },
    [baseClient, withProcessing]
  );

  const reclaimDomain = useCallback(
    async (snsNameAccount: PublicKey, vault: PublicKey, destination: PublicKey): Promise<string> => {
      if (!baseClient) throw new Error('Client not available');
      return withProcessing(async () => {
        const txSig = await baseClient.reclaimDomain(snsNameAccount, vault, destination);
        setLastTxSignature(txSig);
        return txSig;
      });
    },
    [baseClient, withProcessing]
  );

  const sweepVault = useCallback(
    async (vault: Vault): Promise<string> => {
      if (!baseClient) throw new Error('Client not available');
      if (!vault.pool) throw new Error('Vault has no associated pool');
      return withProcessing(async () => {
        const txSig = await baseClient.sweepVault(vault);
        setLastTxSignature(txSig);
        return txSig;
      });
    },
    [baseClient, withProcessing]
  );

  return {
    createVault,
    initDestinationConfig,
    viewVaultBalance,
    freezeVault,
    closeVault,
    markDomainTransfer,
    reclaimDomain,
    sweepVault,
    isProcessing,
    txError,
    lastTxSignature,
  };
}
