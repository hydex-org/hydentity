'use client';

import { useState, useCallback } from 'react';
import { useRouter as useNextRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import type { Vault } from 'sdk/src/accounts/vault';
import type { Pool } from 'sdk/src/accounts/pool';
import { deriveVaultAuthorityAccount } from 'sdk/src/utils/pda';
import { formatVaultBalance, modeLabel, truncateAddress } from '@/utils/format';

interface VaultCardProps {
  vault: Vault;
  pool?: Pool;
  programId: import('@solana/web3.js').PublicKey;
}

export function VaultCard({ vault, pool, programId }: VaultCardProps) {
  const router = useNextRouter();
  const [copied, setCopied] = useState(false);

  const vaultAuthority = deriveVaultAuthorityAccount(programId, vault.pubkey);
  const vaultAddress = vault.pubkey.toBase58();
  const authorityAddress = vaultAuthority.toBase58();
  const dBase = pool?.dBase ?? vault.pool?.dBase;

  const handleCopyAddress = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(authorityAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  }, [authorityAddress]);

  const handleClick = () => {
    router.push(`/vault/${vaultAddress}`);
  };

  return (
    <motion.div
      className="bg-hx-card-bg rounded-xl p-5 border border-hx-text/10 hover:border-hx-green/30 transition-all cursor-pointer group"
      whileHover={{ y: -2 }}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-hx-white group-hover:text-hx-green transition-colors font-mono">
            {truncateAddress(vaultAddress, 6)}
          </h3>
          <button
            onClick={handleCopyAddress}
            className="text-xs text-hx-text font-mono hover:text-hx-green transition-colors flex items-center gap-1"
            title="Copy deposit address (vault authority)"
          >
            Deposit: {truncateAddress(authorityAddress)}
            {copied ? (
              <span className="text-hx-green text-[10px]">Copied!</span>
            ) : (
              <span className="text-[10px] opacity-50">Copy</span>
            )}
          </button>
        </div>

        {/* Status badges */}
        <div className="flex flex-col gap-1 items-end">
          <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            vault.isFrozen
              ? 'bg-blue-500/10 text-blue-400'
              : 'bg-hx-green/10 text-hx-green'
          }`}>
            {vault.isFrozen ? 'Frozen' : 'Active'}
          </div>
          {vault.egressInitialized && (
            <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400">
              Egress
            </div>
          )}
          {vault.domainTransferred && (
            <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-hx-blue/10 text-hx-blue">
              SNS Linked
            </div>
          )}
        </div>
      </div>

      {/* Balances */}
      <div className="mb-4 space-y-2">
        <div>
          <p className="text-xs text-hx-text uppercase tracking-wider mb-0.5">Balance</p>
          <p className="text-2xl font-bold text-hx-white">
            {dBase ? formatVaultBalance(vault.balanceK, dBase, pool?.assetMint) : `${vault.balanceK.toString()}k`}
          </p>
        </div>
        {vault.eligibleK.gtn(0) && (
          <div>
            <p className="text-xs text-hx-text uppercase tracking-wider mb-0.5">Eligible</p>
            <p className="text-lg font-semibold text-hx-green">
              {dBase ? formatVaultBalance(vault.eligibleK, dBase, pool?.assetMint) : `${vault.eligibleK.toString()}k`}
            </p>
          </div>
        )}
        {vault.pendingDepositCount > 0 && (
          <p className="text-xs text-yellow-400">
            +{vault.pendingDepositCount} pending deposit{vault.pendingDepositCount > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-hx-text/10">
        <Stat label="Mode" value={modeLabel(vault.mode)} />
        <Stat label="Nonce" value={vault.nonce.toString()} />
        <Stat label="Bond" value={vault.totalBondAllocatedK.gtn(0)
          ? (dBase ? formatVaultBalance(vault.totalBondAllocatedK, dBase, pool?.assetMint) : `${vault.totalBondAllocatedK.toString()}k`)
          : '0'
        } />
      </div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-hx-text uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-hx-white">{value}</p>
    </div>
  );
}
