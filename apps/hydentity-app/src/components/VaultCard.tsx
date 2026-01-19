'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { VaultInfo } from '@/hooks/useHydentity';
import { useHydentity } from '@/hooks/useHydentity';

interface VaultCardProps {
  vault: VaultInfo;
}

export function VaultCard({ vault }: VaultCardProps) {
  const { registerDomainForVault } = useHydentity();
  const [showDomainInput, setShowDomainInput] = useState(false);
  const [domainInput, setDomainInput] = useState('');

  const formatSol = (lamports: bigint) => {
    return (Number(lamports) / 1e9).toFixed(4);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

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
                <p className="text-xs text-hx-text font-mono">
                  SNS: {formatAddress(vault.snsNameAccount)}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-hx-white group-hover:text-hx-green transition-colors">
                  {vault.domain}<span className="text-hx-green">.sol</span>
                </h3>
                <p className="text-xs text-hx-text font-mono">
                  {formatAddress(vault.vaultAddress)}
                </p>
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

        {/* Balance */}
        <div className="mb-4">
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-hx-text/10">
          <Stat label="Received" value={vault.totalDeposits.toString()} />
          <Stat label="Claim Splits" value={`${vault.minSplits}-${vault.maxSplits}`} />
          <Stat label="Max Delay" value={`${vault.maxDelaySeconds / 60}m`} />
        </div>
      </Link>

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
