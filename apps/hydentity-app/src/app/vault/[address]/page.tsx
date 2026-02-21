'use client';

import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { motion } from 'framer-motion';
import { Header } from '@/components/Header';
import { ClientOnly } from '@/components/ClientOnly';
import { useRouter } from '@/hooks/useRouter';
import { useNetwork } from '@/contexts/NetworkContext';
import { useRouterContext } from '@/contexts/RouterContext';
import { Vault } from 'sdk/src/accounts/vault';
import { Pool } from 'sdk/src/accounts/pool';
import { deriveVaultAuthorityAccount } from 'sdk/src/utils/pda';
import { SUPPORTED_MINTS } from 'sdk/src/utils/const';
import { derivePoolAddress } from 'sdk/src/utils/pda';
import {
  formatVaultBalance,
  formatSol,
  modeLabel,
  regimeLabel,
  truncateAddress,
} from '@/utils/format';
import { getExplorerTxUrl, getExplorerAddressUrl } from '@/config/networks';

export default function VaultDetailPage() {
  const params = useParams();
  const address = params.address as string;
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { config, network } = useNetwork();
  const { baseClient, client } = useRouterContext();
  const {
    freezeVault,
    closeVault,
    sweepVault,
    viewVaultBalance,
    isProcessing,
    txError,
    lastTxSignature,
  } = useRouter();

  const [vault, setVault] = useState<Vault | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [mpcBalance, setMpcBalance] = useState<{
    availableK: bigint;
    spentK: bigint;
    remainingBondK: bigint;
  } | null>(null);
  const [mpcLoading, setMpcLoading] = useState(false);

  const programId = new PublicKey(config.routerProgramId);

  const fetchVault = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const vaultPubkey = new PublicKey(address);
      const fetchedVault = await Vault.fetchVault(vaultPubkey, connection);
      setVault(fetchedVault);

      // Fetch the associated pool
      for (const mint of SUPPORTED_MINTS) {
        const poolAddr = derivePoolAddress(programId, mint);
        if (poolAddr.equals(fetchedVault.poolAddress)) {
          try {
            const fetchedPool = await Pool.fetchPoolAccount(poolAddr, connection);
            setPool(fetchedPool);
          } catch {}
          break;
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load vault');
    } finally {
      setIsLoading(false);
    }
  }, [address, connection, programId]);

  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  const isOwner = vault && publicKey && vault.owner.equals(publicKey);
  const vaultAuthority = vault ? deriveVaultAuthorityAccount(programId, vault.pubkey) : null;

  const handleCopy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleFreeze = async () => {
    if (!vault) return;
    try {
      const sig = await freezeVault(vault.pubkey);
      setActionResult(`Vault ${vault.isFrozen ? 'unfrozen' : 'frozen'}. TX: ${sig.slice(0, 8)}...`);
      await fetchVault();
    } catch {}
  };

  const handleClose = async () => {
    if (!vault) return;
    if (!confirm('Are you sure you want to close this vault? This action is irreversible.')) return;
    try {
      const sig = await closeVault(vault.pubkey);
      setActionResult(`Vault closed. TX: ${sig.slice(0, 8)}...`);
    } catch {}
  };

  const handleSweep = async () => {
    if (!vault) return;
    try {
      const sig = await sweepVault(vault);
      setActionResult(`Sweep triggered. TX: ${sig.slice(0, 8)}...`);
      await fetchVault();
    } catch {}
  };

  const handleViewBalance = async () => {
    if (!vault || !client) return;
    setMpcLoading(true);
    try {
      const result = await viewVaultBalance(vault);
      setMpcBalance({
        availableK: result.availableK,
        spentK: result.spentK,
        remainingBondK: result.remainingBondK,
      });
    } catch (err: any) {
      setActionResult(`MPC balance view failed: ${err.message}`);
    } finally {
      setMpcLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-hx-bg">
      <Header />

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <ClientOnly>
          {isLoading ? (
            <div className="space-y-4">
              <div className="bg-hx-card-bg rounded-xl p-6 animate-pulse border border-hx-text/10">
                <div className="h-6 bg-hx-bg rounded w-1/3 mb-4"></div>
                <div className="h-8 bg-hx-bg rounded w-1/2"></div>
              </div>
            </div>
          ) : error ? (
            <div className="bg-hx-card-bg rounded-xl p-8 border border-red-500/20 text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={fetchVault}
                className="px-4 py-2 bg-hx-card-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : vault ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-hx-white font-mono">
                    {truncateAddress(vault.pubkey.toBase58(), 8)}
                  </h1>
                  <button
                    onClick={() => handleCopy(vault.pubkey.toBase58(), 'vault')}
                    className="text-xs text-hx-text hover:text-hx-green transition-colors font-mono"
                  >
                    {copied === 'vault' ? 'Copied!' : 'Copy full address'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    vault.isFrozen ? 'bg-blue-500/10 text-blue-400' : 'bg-hx-green/10 text-hx-green'
                  }`}>
                    {vault.isFrozen ? 'Frozen' : 'Active'}
                  </span>
                  {vault.egressInitialized && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400">
                      Egress Active
                    </span>
                  )}
                </div>
              </div>

              {/* Deposit Address */}
              {vaultAuthority && (
                <div className="bg-hx-card-bg rounded-xl p-5 border border-hx-green/20">
                  <h2 className="text-sm font-medium text-hx-text mb-2">Deposit Address</h2>
                  <div className="flex items-center gap-3">
                    <code className="text-sm text-hx-white font-mono flex-1 break-all">
                      {vaultAuthority.toBase58()}
                    </code>
                    <button
                      onClick={() => handleCopy(vaultAuthority.toBase58(), 'authority')}
                      className="px-3 py-1.5 bg-hx-green/10 text-hx-green text-xs rounded hover:bg-hx-green/20 transition-colors shrink-0"
                    >
                      {copied === 'authority' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[10px] text-hx-text mt-2">Send SOL to this address to deposit into the vault.</p>
                </div>
              )}

              {/* Balance Panel */}
              <div className="bg-hx-card-bg rounded-xl p-5 border border-hx-text/10">
                <h2 className="text-sm font-medium text-hx-text mb-4">Balances</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-hx-text uppercase tracking-wider mb-1">Total Balance</p>
                    <p className="text-xl font-bold text-hx-white">
                      {pool ? formatVaultBalance(vault.balanceK, pool.dBase, pool.assetMint) : `${vault.balanceK.toString()} k-units`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-hx-text uppercase tracking-wider mb-1">Eligible</p>
                    <p className="text-xl font-bold text-hx-green">
                      {pool ? formatVaultBalance(vault.eligibleK, pool.dBase, pool.assetMint) : `${vault.eligibleK.toString()} k-units`}
                    </p>
                  </div>
                  {vault.pendingDepositCount > 0 && (
                    <div>
                      <p className="text-xs text-hx-text uppercase tracking-wider mb-1">Pending Deposits</p>
                      <p className="text-lg font-semibold text-yellow-400">{vault.pendingDepositCount}</p>
                    </div>
                  )}
                  {vault.totalBondAllocatedK.gtn(0) && (
                    <div>
                      <p className="text-xs text-hx-text uppercase tracking-wider mb-1">Bond Allocated</p>
                      <p className="text-lg font-semibold text-hx-text">
                        {pool ? formatVaultBalance(vault.totalBondAllocatedK, pool.dBase, pool.assetMint) : `${vault.totalBondAllocatedK.toString()} k-units`}
                      </p>
                    </div>
                  )}
                </div>

                {/* MPC balance view */}
                {mpcBalance && (
                  <div className="mt-4 pt-4 border-t border-hx-text/10">
                    <p className="text-xs text-hx-text uppercase tracking-wider mb-2">MPC Encrypted Balance View</p>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-hx-text">Available</p>
                        <p className="text-hx-white font-mono">{mpcBalance.availableK.toString()}k</p>
                      </div>
                      <div>
                        <p className="text-hx-text">Spent</p>
                        <p className="text-hx-white font-mono">{mpcBalance.spentK.toString()}k</p>
                      </div>
                      <div>
                        <p className="text-hx-text">Remaining Bond</p>
                        <p className="text-hx-white font-mono">{mpcBalance.remainingBondK.toString()}k</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Egress Status */}
              {vault.egressInitialized && (
                <div className="bg-hx-card-bg rounded-xl p-5 border border-yellow-500/20">
                  <h2 className="text-sm font-medium text-yellow-400 mb-3">Egress Status</h2>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-hx-text">Remaining</p>
                      <p className="text-hx-white">
                        {pool ? formatVaultBalance(vault.egressRemainingK, pool.dBase, pool.assetMint) : `${vault.egressRemainingK.toString()} k-units`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-hx-text">Deadline Interval</p>
                      <p className="text-hx-white">{vault.egressDeadlineInterval.toString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Configuration */}
              <div className="bg-hx-card-bg rounded-xl p-5 border border-hx-text/10">
                <h2 className="text-sm font-medium text-hx-text mb-3">Configuration</h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-hx-text">Withdrawal Mode</p>
                    <p className="text-hx-white">{modeLabel(vault.mode)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-hx-text">Nonce</p>
                    <p className="text-hx-white">{vault.nonce.toString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-hx-text">Created Interval</p>
                    <p className="text-hx-white">{vault.createdAtInterval.toString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-hx-text">Domain Transferred</p>
                    <p className={vault.domainTransferred ? 'text-hx-green' : 'text-hx-text'}>
                      {vault.domainTransferred ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-hx-text">Config Version</p>
                    <p className="text-hx-white">{vault.configVersion.toString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-hx-text">Bond Initialized</p>
                    <p className={vault.bondInitialized ? 'text-hx-green' : 'text-hx-text'}>
                      {vault.bondInitialized ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Pool Info */}
              {pool && (
                <div className="bg-hx-card-bg rounded-xl p-5 border border-hx-text/10">
                  <h2 className="text-sm font-medium text-hx-text mb-3">Pool Info</h2>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-hx-text">Regime</p>
                      <p className="text-hx-white">{regimeLabel(pool.regime)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-hx-text">Total Liquidity</p>
                      <p className="text-hx-white">{formatVaultBalance(pool.poolBalanceK, pool.dBase, pool.assetMint)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-hx-text">Available Liquidity</p>
                      <p className="text-hx-white">{formatVaultBalance(pool.eligibleK, pool.dBase, pool.assetMint)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-hx-text">D_BASE</p>
                      <p className="text-hx-white font-mono">{pool.dBase.toString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions (owner only) */}
              {isOwner && (
                <div className="bg-hx-card-bg rounded-xl p-5 border border-hx-text/10">
                  <h2 className="text-sm font-medium text-hx-text mb-4">Actions</h2>

                  {txError && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <p className="text-sm text-red-400">{txError}</p>
                    </div>
                  )}

                  {actionResult && (
                    <div className="mb-4 p-3 bg-hx-green/10 border border-hx-green/20 rounded-lg">
                      <p className="text-sm text-hx-green">{actionResult}</p>
                    </div>
                  )}

                  {lastTxSignature && (
                    <div className="mb-4">
                      <a
                        href={getExplorerTxUrl(network, lastTxSignature)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-hx-blue hover:underline"
                      >
                        View last transaction on explorer
                      </a>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    {config.features.mpcDestination && client && (
                      <button
                        onClick={handleViewBalance}
                        disabled={isProcessing || mpcLoading}
                        className="px-4 py-2 bg-hx-blue/10 text-hx-blue border border-hx-blue/20 rounded-lg text-sm hover:bg-hx-blue/20 transition-colors disabled:opacity-50"
                      >
                        {mpcLoading ? 'Viewing (up to 3min)...' : 'View Encrypted Balance'}
                      </button>
                    )}

                    <button
                      onClick={handleSweep}
                      disabled={isProcessing}
                      className="px-4 py-2 bg-hx-green/10 text-hx-green border border-hx-green/20 rounded-lg text-sm hover:bg-hx-green/20 transition-colors disabled:opacity-50"
                    >
                      Sweep Vault
                    </button>

                    <button
                      onClick={handleFreeze}
                      disabled={isProcessing}
                      className="px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-sm hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    >
                      {vault.isFrozen ? 'Unfreeze' : 'Freeze'}
                    </button>

                    <button
                      onClick={handleClose}
                      disabled={isProcessing || vault.balanceK.gtn(0) || vault.eligibleK.gtn(0)}
                      className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      title={vault.balanceK.gtn(0) ? 'Vault must be empty to close' : ''}
                    >
                      Close Vault
                    </button>
                  </div>
                </div>
              )}

              {/* Explorer link */}
              <div className="text-center">
                <a
                  href={getExplorerAddressUrl(network, vault.pubkey.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-hx-text hover:text-hx-green transition-colors"
                >
                  View on Solana Explorer
                </a>
              </div>
            </motion.div>
          ) : null}
        </ClientOnly>
      </div>
    </main>
  );
}
