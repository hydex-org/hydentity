'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { VaultInfo } from '@/hooks/useHydentity';
import { useHydentity } from '@/hooks/useHydentity';

interface VaultCardProps {
  vault: VaultInfo;
  privateCashBalance?: number | null; // Privacy Cash pool balance in SOL
}

export function VaultCard({ vault, privateCashBalance }: VaultCardProps) {
  const { registerDomainForVault, closeVault, fetchVaults } = useHydentity();
  const [showDomainInput, setShowDomainInput] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const formatSol = (lamports: bigint) => {
    return (Number(lamports) / 1e9).toFixed(4);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // Copy vault authority address to clipboard (this is where funds are sent)
  const handleCopyAddress = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(vault.vaultAuthorityAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  }, [vault.vaultAuthorityAddress]);

  // Check if this is a fallback domain name
  const isFallbackDomain = vault.domain.startsWith('vault-');

  const handleRegisterDomain = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (domainInput.trim()) {
      registerDomainForVault(vault.snsNameAccount, domainInput.trim());
      setShowDomainInput(false);
      setDomainInput('');
    }
  };

  const handleCloseVault = async () => {
    setIsClosing(true);
    setCloseError(null);

    try {
      await closeVault(vault.domain);
      setShowCloseModal(false);
      await fetchVaults();
    } catch (err) {
      console.error('Close vault failed:', err);
      setCloseError(err instanceof Error ? err.message : 'Failed to close vault');
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <motion.div
      className="bg-hx-card-bg rounded-xl p-5 border border-hx-text/10 hover:border-hx-green/30 transition-all cursor-pointer group"
      whileHover={{ y: -2 }}
    >
      <Link href={`/vault/${vault.domain}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            {isFallbackDomain ? (
              <>
                <h3 className="text-lg font-semibold text-yellow-400">
                  Unknown Domain
                </h3>
                <button
                  onClick={handleCopyAddress}
                  className="text-xs text-hx-text font-mono hover:text-hx-green transition-colors flex items-center gap-1"
                  title="Click to copy receiving address"
                >
                  SNS: {formatAddress(vault.vaultAuthorityAddress)}
                  {copied ? (
                    <span className="text-hx-green text-[10px]">Copied!</span>
                  ) : (
                    <span className="text-[10px] opacity-50">📋</span>
                  )}
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-hx-white group-hover:text-hx-green transition-colors">
                  {vault.domain}<span className="text-hx-green">.sol</span>
                </h3>
                <button
                  onClick={handleCopyAddress}
                  className="text-xs text-hx-text font-mono hover:text-hx-green transition-colors flex items-center gap-1"
                  title="Click to copy receiving address"
                >
                  {formatAddress(vault.vaultAuthorityAddress)}
                  {copied ? (
                    <span className="text-hx-green text-[10px]">Copied!</span>
                  ) : (
                    <span className="text-[10px] opacity-50">📋</span>
                  )}
                </button>
              </>
            )}
          </div>
          
          {/* Status indicators */}
          <div className="flex flex-col gap-1 items-end">
            <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              vault.policyEnabled 
                ? 'bg-hx-green/10 text-hx-green' 
                : 'bg-yellow-500/10 text-yellow-400'
            }`}>
              {vault.policyEnabled ? 'Active' : 'Paused'}
            </div>
            
            {/* Domain ownership indicator */}
            <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              vault.domainTransferred 
                ? 'bg-hx-blue/10 text-hx-blue' 
                : 'bg-orange-500/10 text-orange-400'
            }`} title={vault.domainTransferred 
              ? 'Domain owned by vault (enhanced privacy)' 
              : 'Domain owned externally'
            }>
              {vault.domainTransferred ? '🔒 Private' : '⚠️ External'}
            </div>
          </div>
        </div>

        {/* Balances */}
        <div className="mb-4 space-y-2">
          {/* Vault Balance */}
          <div>
            <p className="text-xs text-hx-text uppercase tracking-wider mb-0.5">Vault Balance</p>
            <p className="text-2xl font-bold text-hx-white">
              {formatSol(vault.balance)}
              <span className="text-sm text-hx-text ml-2">SOL</span>
            </p>
            {vault.pendingDeposits > 0 && (
              <p className="text-xs text-hx-green">
                +{vault.pendingDeposits} pending deposits
              </p>
            )}
          </div>

          {/* Privacy Cash Balance */}
          {privateCashBalance !== undefined && privateCashBalance !== null && (
            <div className="pt-2 border-t border-hx-text/10">
              <p className="text-xs text-hx-text uppercase tracking-wider mb-0.5">Private Balance</p>
              <p className="text-lg font-semibold text-hx-purple">
                {privateCashBalance.toFixed(4)}
                <span className="text-sm text-hx-text ml-2">SOL</span>
              </p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-hx-text/10">
          <Stat label="Received" value={vault.totalDeposits.toString()} />
          <Stat label="Claim Splits" value={`${vault.minSplits}-${vault.maxSplits}`} />
          <Stat label="Max Delay" value={`${vault.maxDelaySeconds / 60}m`} />
        </div>
      </Link>

      {/* Close Vault button */}
      <div className="mt-4 pt-4 border-t border-hx-text/10 flex justify-end">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowCloseModal(true);
          }}
          className="px-3 py-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded hover:bg-red-500/20 transition-colors"
        >
          Close Vault
        </button>
      </div>

      {/* Close Vault Modal */}
      {showCloseModal && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-hx-bg rounded-xl p-6 max-w-md w-full border border-red-500/30 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-red-400 mb-4">
              Close Vault
            </h3>

            <p className="text-hx-text text-sm mb-4">
              This will close all vault PDAs (vault, vault authority, and policy) and return the rent-exempt SOL to your wallet.
            </p>

            {vault.balance > 0n && (
              <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20 mb-4">
                <p className="text-xs text-yellow-400">
                  <strong>Note:</strong> The vault authority still holds {(Number(vault.balance) / 1e9).toFixed(4)} SOL.
                  This balance will be returned along with rent when the vault is closed.
                </p>
              </div>
            )}

            {vault.domainTransferred && (
              <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 mb-4">
                <p className="text-xs text-red-400">
                  <strong>Warning:</strong> The domain is still transferred to the vault authority.
                  Please reclaim your domain before closing the vault.
                </p>
              </div>
            )}

            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 mb-6">
              <p className="text-xs text-red-400">
                <strong>This action is irreversible.</strong> You will need to create a new vault if you want to use Hydentity for this domain again.
              </p>
            </div>

            {closeError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {closeError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowCloseModal(false);
                  setCloseError(null);
                }}
                className="flex-1 px-4 py-2.5 bg-hx-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCloseVault();
                }}
                disabled={isClosing || vault.domainTransferred}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClosing ? 'Closing...' : 'Close Vault'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Fallback domain warning and fix UI */}
      {isFallbackDomain && (
        <div className="mt-4 pt-4 border-t border-yellow-500/20">
          <div className="flex items-center gap-2 text-yellow-400 text-xs mb-2">
            <span>⚠️</span>
            <span>Domain name not recognized. Enter it manually:</span>
          </div>
          {showDomainInput ? (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="mydomain"
                className="flex-1 px-3 py-1.5 bg-hx-bg border border-hx-text/20 rounded text-sm text-hx-white focus:outline-none focus:border-hx-green"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={handleRegisterDomain}
                className="px-3 py-1.5 bg-hx-green text-hx-bg rounded text-sm font-medium hover:bg-hx-green/90"
              >
                Save
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDomainInput(false);
                }}
                className="px-3 py-1.5 bg-hx-bg border border-hx-text/20 text-hx-text rounded text-sm hover:bg-hx-text/5"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDomainInput(true);
              }}
              className="px-3 py-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded text-xs font-medium hover:bg-yellow-500/20 transition-colors"
            >
              Set Domain Name
            </button>
          )}
        </div>
      )}
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
