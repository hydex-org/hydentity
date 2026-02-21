'use client';

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useRouter as useNextRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/Header';
import { ClientOnly } from '@/components/ClientOnly';
import { usePool } from '@/hooks/usePool';
import { useRouter } from '@/hooks/useRouter';
import { useSnsDomains } from '@/hooks/useSnsDomains';
import { useNetwork } from '@/contexts/NetworkContext';
import { useRouterContext } from '@/contexts/RouterContext';
import { regimeLabel, formatVaultBalance, modeLabel, modeDescription } from '@/utils/format';
import { getExplorerTxUrl } from '@/config/networks';

type Step = 'pool' | 'configure' | 'destination' | 'creating';

export default function CreateVaultPage() {
  const { connected } = useWallet();
  const router = useNextRouter();
  const { pool, isLoading: poolLoading, error: poolError } = usePool();
  const { createVault, initDestinationConfig, markDomainTransfer, isProcessing, txError } = useRouter();
  const { client } = useRouterContext();
  const { domains } = useSnsDomains();
  const { network, config } = useNetwork();

  const [step, setStep] = useState<Step>('pool');
  const [selectedMode, setSelectedMode] = useState(1); // Default: Recommended
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [creationStatus, setCreationStatus] = useState('');
  const [createdVaultKey, setCreatedVaultKey] = useState<PublicKey | null>(null);

  const validateDestination = (addr: string): boolean => {
    try {
      new PublicKey(addr);
      setDestinationError(null);
      return true;
    } catch {
      setDestinationError('Invalid Solana address');
      return false;
    }
  };

  const handleCreate = async () => {
    if (!pool) return;
    if (!validateDestination(destination)) return;

    setStep('creating');

    try {
      // Step 1: Create vault
      setCreationStatus('Creating vault...');
      const [vaultKey, txSig] = await createVault(pool, selectedMode);
      setCreatedVaultKey(vaultKey);

      // Step 2: Wait for confirmation
      setCreationStatus('Waiting for confirmation...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 3: Init destination config via MPC (if available)
      if (client && config.features.mpcDestination) {
        setCreationStatus('Encrypting destination via MPC...');
        try {
          // Fetch the newly created vault
          const { Vault } = await import('sdk/src/accounts/vault');
          const vault = await Vault.fetchVault(vaultKey, client['connection']);
          await initDestinationConfig(vault, new PublicKey(destination));
          setCreationStatus('Destination encrypted successfully!');
        } catch (err: any) {
          console.warn('[CreateVault] MPC destination config failed:', err);
          setCreationStatus('Vault created. MPC destination setup can be done later.');
        }
      } else {
        setCreationStatus('Vault created! MPC destination can be configured when available.');
      }

      // Step 4: Optional domain transfer
      if (selectedDomain) {
        setCreationStatus('Linking SNS domain...');
        try {
          const { getDomainKeySync } = await import('@bonfida/spl-name-service');
          const { pubkey: snsNameAccount } = getDomainKeySync(selectedDomain);
          await markDomainTransfer(vaultKey, snsNameAccount);
          setCreationStatus('Domain linked!');
        } catch (err: any) {
          console.warn('[CreateVault] Domain transfer failed:', err);
        }
      }

      // Redirect after short delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      router.push(`/vault/${vaultKey.toBase58()}`);
    } catch (err: any) {
      console.error('[CreateVault] Failed:', err);
      setCreationStatus(`Failed: ${err.message}`);
    }
  };

  return (
    <main className="min-h-screen bg-hx-bg">
      <Header />

      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <h1 className="text-2xl font-bold text-hx-white mb-2">Create Vault</h1>
        <p className="text-hx-text mb-8 text-sm">
          Set up a new privacy vault on Hydex Router
        </p>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {['Pool', 'Configure', 'Destination'].map((label, i) => {
            const steps: Step[] = ['pool', 'configure', 'destination'];
            const isActive = step === steps[i] || step === 'creating';
            const isDone = steps.indexOf(step) > i || step === 'creating';
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                  isDone ? 'bg-hx-green text-hx-bg' : isActive ? 'bg-hx-green/20 text-hx-green border border-hx-green' : 'bg-hx-card-bg text-hx-text border border-hx-text/20'
                }`}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span className={`text-xs ${isActive || isDone ? 'text-hx-white' : 'text-hx-text'}`}>{label}</span>
                {i < 2 && <div className={`w-8 h-px ${isDone ? 'bg-hx-green' : 'bg-hx-text/20'}`} />}
              </div>
            );
          })}
        </div>

        <ClientOnly>
          {!connected ? (
            <div className="bg-hx-card-bg rounded-xl p-8 text-center border border-hx-text/10">
              <p className="text-hx-text mb-4">Connect your wallet to create a vault.</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {/* Step 1: Pool */}
              {step === 'pool' && (
                <motion.div key="pool" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="bg-hx-card-bg rounded-xl p-6 border border-hx-text/10">
                    <h2 className="text-lg font-semibold text-hx-white mb-4">Select Pool</h2>

                    {poolLoading ? (
                      <div className="animate-pulse space-y-3">
                        <div className="h-4 bg-hx-bg rounded w-1/3"></div>
                        <div className="h-6 bg-hx-bg rounded w-1/2"></div>
                      </div>
                    ) : poolError ? (
                      <div className="text-red-400 text-sm">{poolError}</div>
                    ) : pool ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 bg-hx-bg rounded-lg border border-hx-green/30">
                          <div>
                            <p className="text-hx-white font-semibold">SOL Pool</p>
                            <p className="text-xs text-hx-text mt-1">Regime: {regimeLabel(pool.regime)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-hx-white">{formatVaultBalance(pool.poolBalanceK, pool.dBase)}</p>
                            <p className="text-xs text-hx-text">Total Liquidity</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs ${pool.isOperational() ? 'bg-hx-green/10 text-hx-green' : 'bg-red-500/10 text-red-400'}`}>
                            {pool.isOperational() ? 'Operational' : 'Paused'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-hx-text text-sm">No pool found on this network.</p>
                    )}
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => setStep('configure')}
                      disabled={!pool || !pool.isOperational()}
                      className="px-6 py-2.5 bg-hx-green text-hx-bg rounded-lg font-medium hover:bg-hx-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Continue
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Configure */}
              {step === 'configure' && (
                <motion.div key="configure" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="bg-hx-card-bg rounded-xl p-6 border border-hx-text/10">
                    <h2 className="text-lg font-semibold text-hx-white mb-4">Withdrawal Mode</h2>

                    <div className="space-y-3">
                      {[0, 1, 2, 3].map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setSelectedMode(mode)}
                          className={`w-full text-left p-4 rounded-lg border transition-colors ${
                            selectedMode === mode
                              ? 'border-hx-green bg-hx-green/5'
                              : 'border-hx-text/10 hover:border-hx-text/30'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-hx-white font-medium">{modeLabel(mode)}</span>
                            {mode === 1 && <span className="text-xs text-hx-green">Recommended</span>}
                          </div>
                          <p className="text-xs text-hx-text mt-1">{modeDescription(mode)}</p>
                        </button>
                      ))}
                    </div>

                    {/* Optional: SNS domain */}
                    {domains.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-hx-text/10">
                        <h3 className="text-sm font-medium text-hx-white mb-3">Link SNS Domain (Optional)</h3>
                        <div className="space-y-2">
                          <button
                            onClick={() => setSelectedDomain(null)}
                            className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                              !selectedDomain ? 'border-hx-green bg-hx-green/5 text-hx-white' : 'border-hx-text/10 text-hx-text hover:border-hx-text/30'
                            }`}
                          >
                            No domain
                          </button>
                          {domains.map((d) => (
                            <button
                              key={d.domain}
                              onClick={() => setSelectedDomain(d.domain)}
                              className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                                selectedDomain === d.domain ? 'border-hx-green bg-hx-green/5 text-hx-white' : 'border-hx-text/10 text-hx-text hover:border-hx-text/30'
                              }`}
                            >
                              {d.domain}.sol {d.isPrimary && <span className="text-xs text-hx-green ml-1">Primary</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex justify-between">
                    <button
                      onClick={() => setStep('pool')}
                      className="px-6 py-2.5 bg-hx-card-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setStep('destination')}
                      className="px-6 py-2.5 bg-hx-green text-hx-bg rounded-lg font-medium hover:bg-hx-green/90 transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Destination */}
              {step === 'destination' && (
                <motion.div key="destination" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="bg-hx-card-bg rounded-xl p-6 border border-hx-text/10">
                    <h2 className="text-lg font-semibold text-hx-white mb-2">Destination Wallet</h2>
                    <p className="text-xs text-hx-text mb-4">
                      Enter the wallet address where withdrawn funds should be sent.
                      {config.features.mpcDestination && ' This will be encrypted via Arcium MPC.'}
                    </p>

                    <div>
                      <input
                        type="text"
                        value={destination}
                        onChange={(e) => {
                          setDestination(e.target.value.trim());
                          setDestinationError(null);
                        }}
                        placeholder="Destination wallet address (base58)"
                        className="w-full px-4 py-3 bg-hx-bg border border-hx-text/20 rounded-lg text-hx-white font-mono text-sm focus:outline-none focus:border-hx-green"
                      />
                      {destinationError && (
                        <p className="text-red-400 text-xs mt-1">{destinationError}</p>
                      )}
                    </div>

                    {/* Summary */}
                    <div className="mt-6 p-4 bg-hx-bg rounded-lg space-y-2">
                      <h3 className="text-sm font-medium text-hx-white mb-2">Summary</h3>
                      <div className="flex justify-between text-xs">
                        <span className="text-hx-text">Pool</span>
                        <span className="text-hx-white">SOL</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-hx-text">Mode</span>
                        <span className="text-hx-white">{modeLabel(selectedMode)}</span>
                      </div>
                      {selectedDomain && (
                        <div className="flex justify-between text-xs">
                          <span className="text-hx-text">Domain</span>
                          <span className="text-hx-white">{selectedDomain}.sol</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-hx-text">MPC Encryption</span>
                        <span className={config.features.mpcDestination ? 'text-hx-green' : 'text-yellow-400'}>
                          {config.features.mpcDestination ? 'Enabled' : 'Unavailable'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {txError && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <p className="text-sm text-red-400">{txError}</p>
                    </div>
                  )}

                  <div className="mt-6 flex justify-between">
                    <button
                      onClick={() => setStep('configure')}
                      className="px-6 py-2.5 bg-hx-card-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={!destination || isProcessing}
                      className="px-6 py-2.5 bg-hx-green text-hx-bg rounded-lg font-medium hover:bg-hx-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? 'Creating...' : 'Create Vault'}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Creating state */}
              {step === 'creating' && (
                <motion.div key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="bg-hx-card-bg rounded-xl p-8 border border-hx-text/10 text-center">
                    {isProcessing && (
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-hx-green mx-auto mb-6"></div>
                    )}
                    <p className="text-hx-white font-medium mb-2">{creationStatus}</p>
                    {createdVaultKey && (
                      <p className="text-xs text-hx-text font-mono">{createdVaultKey.toBase58()}</p>
                    )}
                    {!isProcessing && txError && (
                      <div className="mt-4">
                        <p className="text-red-400 text-sm mb-4">{txError}</p>
                        <button
                          onClick={() => setStep('destination')}
                          className="px-6 py-2.5 bg-hx-card-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
                        >
                          Go Back
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </ClientOnly>
      </div>
    </main>
  );
}
