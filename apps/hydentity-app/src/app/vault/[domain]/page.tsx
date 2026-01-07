'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { PublicKey } from '@solana/web3.js';
import { useHydentity, VaultInfo } from '@/hooks/useHydentity';
import { ClientOnly } from '@/components/ClientOnly';

export default function VaultDetailPage() {
  return (
    <ClientOnly>
      <VaultDetailContent />
    </ClientOnly>
  );
}

function VaultDetailContent() {
  const params = useParams();
  const router = useRouter();
  const domain = params.domain as string;
  
  const { 
    vaults, 
    isLoading, 
    connected, 
    publicKey,
    transferDomainToVault,
    reclaimDomain,
    fetchVaults,
  } = useHydentity();
  
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isReclaiming, setIsReclaiming] = useState(false);
  const [showReclaimModal, setShowReclaimModal] = useState(false);
  const [reclaimDestination, setReclaimDestination] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Find the vault by domain
  useEffect(() => {
    if (vaults.length > 0) {
      const foundVault = vaults.find(v => v.domain === domain);
      setVault(foundVault || null);
    }
  }, [vaults, domain]);

  const handleTransferToVault = async () => {
    if (!vault) return;
    
    setIsTransferring(true);
    setError(null);
    setSuccess(null);
    
    try {
      const sig = await transferDomainToVault(vault.domain);
      setSuccess(`Domain ownership transferred! Tx: ${sig.slice(0, 8)}...`);
      await fetchVaults();
    } catch (err) {
      console.error('Transfer failed:', err);
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleReclaim = async () => {
    if (!vault || !reclaimDestination) return;
    
    setIsReclaiming(true);
    setError(null);
    setSuccess(null);
    
    try {
      const destination = new PublicKey(reclaimDestination);
      const sig = await reclaimDomain(vault.domain, destination);
      setSuccess(`Domain ownership reclaimed! Tx: ${sig.slice(0, 8)}...`);
      setShowReclaimModal(false);
      setReclaimDestination('');
      await fetchVaults();
    } catch (err) {
      console.error('Reclaim failed:', err);
      setError(err instanceof Error ? err.message : 'Reclaim failed');
    } finally {
      setIsReclaiming(false);
    }
  };

  const formatSol = (lamports: bigint) => {
    return (Number(lamports) / 1e9).toFixed(4);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  if (!connected) {
    return (
      <div className="min-h-screen bg-hx-bg flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl text-hx-white mb-4">Connect your wallet</h2>
          <p className="text-hx-text">Please connect your wallet to view vault details</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-hx-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-hx-green mx-auto mb-4"></div>
          <p className="text-hx-text">Loading vault...</p>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="min-h-screen bg-hx-bg flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl text-hx-white mb-4">Vault not found</h2>
          <p className="text-hx-text mb-6">No vault found for domain &quot;{domain}.sol&quot;</p>
          <Link href="/" className="text-hx-green hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-hx-bg">
      {/* Header */}
      <header className="border-b border-hx-text/10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link href="/" className="text-hx-text hover:text-hx-green transition-colors text-sm">
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Vault Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-hx-white mb-2">
            {vault.domain}<span className="text-hx-green">.sol</span>
          </h1>
          <p className="text-hx-text font-mono text-sm">
            Vault: {formatAddress(vault.vaultAddress)}
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400"
          >
            {error}
          </motion.div>
        )}
        
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-hx-green/10 border border-hx-green/30 rounded-lg text-hx-green"
          >
            {success}
          </motion.div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Balance" value={`${formatSol(vault.balance)} SOL`} />
          <StatCard label="Received" value={vault.totalDeposits.toString()} />
          <StatCard label="Claim Splits" value={`${vault.minSplits}-${vault.maxSplits}`} />
          <StatCard label="Claim Delay" value={`${vault.maxDelaySeconds / 60}m max`} />
        </div>

        {/* Domain Ownership Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-hx-white mb-4 flex items-center gap-2">
            <span>🔐</span> Domain Ownership
          </h2>
          
          <div className={`p-6 rounded-xl border ${
            vault.domainTransferred 
              ? 'bg-hx-blue/5 border-hx-blue/30' 
              : 'bg-orange-500/5 border-orange-500/30'
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-3 ${
                  vault.domainTransferred 
                    ? 'bg-hx-blue/10 text-hx-blue' 
                    : 'bg-orange-500/10 text-orange-400'
                }`}>
                  {vault.domainTransferred ? '🔒 Domain Owned by Vault' : '⚠️ Domain Owned Externally'}
                </div>
                
                <h3 className="text-lg font-medium text-hx-white mb-2">
                  {vault.domainTransferred ? 'Enhanced Privacy Active' : 'Transfer for Enhanced Privacy'}
                </h3>
                
                <p className="text-hx-text text-sm max-w-xl">
                  {vault.domainTransferred 
                    ? 'Your domain ownership has been transferred to the vault authority. The original owner wallet is no longer directly linked to this domain on-chain.'
                    : 'Transfer your domain ownership to the vault for enhanced privacy. This breaks the on-chain link between your wallet and the domain, making fund flows harder to trace.'}
                </p>
                
                {!vault.domainTransferred && (
                  <div className="mt-4 p-4 bg-hx-bg/50 rounded-lg border border-hx-text/10">
                    <h4 className="text-sm font-medium text-hx-white mb-2">⚠️ Privacy Recommendation</h4>
                    <p className="text-xs text-hx-text">
                      For maximum privacy, claim funds to a <strong>different wallet</strong> than the one that originally owned this domain. 
                      The historical ownership is always visible on-chain, but future fund flows will be private through Umbra.
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-6 flex gap-3">
              {vault.domainTransferred ? (
                <button
                  onClick={() => setShowReclaimModal(true)}
                  disabled={isReclaiming}
                  className="px-5 py-2.5 bg-orange-500/10 text-orange-400 rounded-lg font-medium hover:bg-orange-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isReclaiming ? 'Reclaiming...' : 'Reclaim Domain'}
                </button>
              ) : (
                <button
                  onClick={handleTransferToVault}
                  disabled={isTransferring}
                  className="px-5 py-2.5 bg-hx-green text-hx-bg rounded-lg font-medium hover:bg-hx-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isTransferring ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Transferring...
                    </>
                  ) : (
                    <>
                      <span>🔒</span>
                      Transfer Domain to Vault
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Vault Info Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-hx-white mb-4">Vault Details</h2>
          
          <div className="bg-hx-card-bg rounded-xl p-6 border border-hx-text/10">
            <dl className="space-y-4">
              <InfoRow label="Vault Address" value={vault.vaultAddress} mono />
              <InfoRow label="Owner Address" value={vault.ownerAddress} mono />
              <InfoRow label="SNS Name Account" value={vault.snsNameAccount} mono />
              <InfoRow label="Policy Status" value={vault.policyEnabled ? 'Active' : 'Paused'} />
              <InfoRow 
                label="Created" 
                value={vault.createdAt > 0 
                  ? new Date(vault.createdAt * 1000).toLocaleString() 
                  : 'Unknown'
                } 
              />
              <InfoRow 
                label="Last Deposit" 
                value={vault.lastDepositAt > 0 
                  ? new Date(vault.lastDepositAt * 1000).toLocaleString() 
                  : 'No deposits yet'
                } 
              />
            </dl>
          </div>
        </section>

        {/* Actions Section */}
        <section>
          <h2 className="text-xl font-semibold text-hx-white mb-4">Actions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link href="/claim">
              <motion.div 
                className="p-5 bg-hx-card-bg rounded-xl border border-hx-text/10 hover:border-hx-green/30 transition-all cursor-pointer"
                whileHover={{ y: -2 }}
              >
                <h3 className="text-lg font-medium text-hx-white mb-2">💸 Claim Funds</h3>
                <p className="text-sm text-hx-text">Privately withdraw funds through Umbra</p>
              </motion.div>
            </Link>
            
            <Link href="/settings">
              <motion.div 
                className="p-5 bg-hx-card-bg rounded-xl border border-hx-text/10 hover:border-hx-green/30 transition-all cursor-pointer"
                whileHover={{ y: -2 }}
              >
                <h3 className="text-lg font-medium text-hx-white mb-2">⚙️ Settings</h3>
                <p className="text-sm text-hx-text">Configure privacy policy and destinations</p>
              </motion.div>
            </Link>
          </div>
        </section>
      </div>

      {/* Reclaim Modal */}
      {showReclaimModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-hx-bg rounded-xl p-6 max-w-md w-full border border-hx-text/20 shadow-2xl"
          >
            <h3 className="text-xl font-semibold text-hx-white mb-4">
              Reclaim Domain Ownership
            </h3>
            
            <p className="text-hx-text text-sm mb-6">
              Transfer the domain ownership from the vault back to a wallet address of your choice.
            </p>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-hx-white mb-2">
                Destination Wallet Address
              </label>
              <input
                type="text"
                value={reclaimDestination}
                onChange={(e) => setReclaimDestination(e.target.value)}
                placeholder="Enter Solana wallet address..."
                className="w-full px-4 py-3 bg-hx-bg border border-hx-text/20 rounded-lg text-hx-white font-mono text-sm focus:outline-none focus:border-hx-green"
              />
              
              {publicKey && (
                <button
                  onClick={() => setReclaimDestination(publicKey.toBase58())}
                  className="mt-2 text-xs text-hx-blue hover:underline"
                >
                  Use connected wallet ({formatAddress(publicKey.toBase58())})
                </button>
              )}
            </div>
            
            <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20 mb-6">
              <p className="text-xs text-orange-400">
                <strong>Warning:</strong> This will make the domain ownership publicly linked to the destination wallet again. 
                For maximum privacy, use a fresh wallet.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowReclaimModal(false)}
                className="flex-1 px-4 py-2.5 bg-hx-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReclaim}
                disabled={!reclaimDestination || isReclaiming}
                className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isReclaiming ? 'Reclaiming...' : 'Reclaim Domain'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-hx-card-bg rounded-xl p-4 border border-hx-text/10">
      <p className="text-xs text-hx-text uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-semibold text-hx-white">{value}</p>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
      <dt className="text-sm text-hx-text">{label}</dt>
      <dd className={`text-sm text-hx-white ${mono ? 'font-mono' : ''} break-all`}>
        {value}
      </dd>
    </div>
  );
}

