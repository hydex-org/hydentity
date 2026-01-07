'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/Header';
import { ClientOnly } from '@/components/ClientOnly';
import { useHydentity } from '@/hooks/useHydentity';
import { useSnsDomains, SnsDomain } from '@/hooks/useSnsDomains';
import { useTestMode } from '@/contexts/TestModeContext';

type SetupStep = 'domain' | 'policy' | 'confirm' | 'processing' | 'complete';

export default function SetupPage() {
  const { connected } = useWallet();
  const { initializeVault } = useHydentity();
  const { domains, loading: domainsLoading, error: domainsError, verifyOwnership, refetch } = useSnsDomains();
  const { testMode, toggleTestMode } = useTestMode();
  
  const [step, setStep] = useState<SetupStep>('domain');
  const [selectedDomain, setSelectedDomain] = useState<SnsDomain | null>(null);
  const [manualDomain, setManualDomain] = useState('');
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [verifyingOwnership, setVerifyingOwnership] = useState(false);
  const [policy, setPolicy] = useState({
    minSplits: 2,
    maxSplits: 5,
    minDelaySeconds: 60,
    maxDelaySeconds: 3600,
    enabled: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  // Auto-select primary domain if available
  useEffect(() => {
    if (domains.length > 0 && !selectedDomain) {
      const primary = domains.find(d => d.isPrimary);
      setSelectedDomain(primary || domains[0]);
    }
  }, [domains, selectedDomain]);

  const getDomainName = (): string => {
    if (useManualEntry || testMode) {
      return manualDomain;
    }
    return selectedDomain?.domain || '';
  };

  const handleDomainSubmit = async () => {
    const domainName = getDomainName();
    
    if (!domainName.trim()) {
      setError('Please enter or select a domain name');
      return;
    }

    // In test mode, skip verification
    if (testMode) {
      setError(null);
      setStep('policy');
      return;
    }

    // Verify ownership for manual entry
    if (useManualEntry) {
      setVerifyingOwnership(true);
      setError(null);
      
      try {
        const isOwner = await verifyOwnership(domainName);
        if (!isOwner) {
          setError(`You don't own the domain "${domainName}.sol". Please connect the wallet that owns this domain.`);
          setVerifyingOwnership(false);
          return;
        }
      } catch (err) {
        setError('Failed to verify domain ownership. Please try again.');
        setVerifyingOwnership(false);
        return;
      }
      
      setVerifyingOwnership(false);
    }

    setError(null);
    setStep('policy');
  };

  const handlePolicySubmit = () => {
    if (policy.minSplits > policy.maxSplits) {
      setError('Min splits cannot be greater than max splits');
      return;
    }
    if (policy.minDelaySeconds > policy.maxDelaySeconds) {
      setError('Min delay cannot be greater than max delay');
      return;
    }
    setError(null);
    setStep('confirm');
  };

  const handleConfirm = async () => {
    setStep('processing');
    setError(null);

    try {
      const domainName = getDomainName();
      const signature = await initializeVault(domainName);
      setTxSignature(signature);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vault');
      setStep('confirm');
    }
  };

  // Show connect wallet prompt when not connected
  // Wrapped in ClientOnly to prevent hydration mismatch
  if (!connected) {
    return (
      <main className="min-h-screen bg-hx-bg">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-bold mb-6 text-hx-white">
            Connect Your Wallet
          </h1>
          <p className="text-hx-text mb-8">
            Connect your wallet to set up a privacy vault.
          </p>
          <ClientOnly fallback={<div className="h-10 w-40 bg-hx-card-bg rounded-lg animate-pulse mx-auto" />}>
            <WalletMultiButton />
          </ClientOnly>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-hx-bg">
      <Header />
      
      <div className="container mx-auto px-4 py-12 max-w-lg">
        {/* Test Mode Banner */}
        <AnimatePresence>
          {testMode && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 text-lg">⚠️</span>
                <span className="text-yellow-400 text-sm font-medium">Test Mode Active</span>
              </div>
              <span className="text-yellow-400/70 text-xs">SNS verification bypassed</span>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold mb-2 text-hx-white">
            Setup Privacy Vault
          </h1>
          <p className="text-sm text-hx-text">
            Create a private receiving address for your .sol domain.
          </p>
        </motion.div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-10">
          {['domain', 'policy', 'confirm', 'complete'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                ${step === s ? 'bg-hx-green text-hx-bg' :
                  ['domain', 'policy', 'confirm', 'complete'].indexOf(step) > i 
                    ? 'bg-hx-green text-hx-bg' 
                    : 'bg-hx-card-bg border border-hx-text/20 text-hx-text'}
              `}>
                {['domain', 'policy', 'confirm', 'complete'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              {i < 3 && (
                <div className={`w-12 md:w-20 h-0.5 mx-2 ${
                  ['domain', 'policy', 'confirm', 'complete'].indexOf(step) > i 
                    ? 'bg-hx-green' 
                    : 'bg-hx-text/20'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step Content */}
        <div className="bg-hx-card-bg rounded-xl p-6 border border-hx-text/10">
          <AnimatePresence mode="wait">
            {step === 'domain' && (
              <motion.div
                key="domain"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-hx-white">Select Your Domain</h2>
                  
                  {/* Test Mode Toggle */}
                  <button
                    onClick={toggleTestMode}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                      ${testMode 
                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' 
                        : 'bg-hx-bg text-hx-text border border-hx-text/20 hover:border-hx-text/40'}
                    `}
                  >
                    <div className={`w-3 h-3 rounded-full ${testMode ? 'bg-yellow-400' : 'bg-hx-text/30'}`} />
                    Test Mode
                  </button>
                </div>

                {/* Domain Selection */}
                {!testMode && !useManualEntry && (
                  <div className="mb-4">
                    {domainsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-hx-green border-t-transparent rounded-full animate-spin" />
                        <span className="ml-3 text-hx-text text-sm">Loading your domains...</span>
                      </div>
                    ) : domainsError ? (
                      <div className="text-center py-6">
                        <p className="text-red-400 text-sm mb-3">{domainsError}</p>
                        <button
                          onClick={refetch}
                          className="text-hx-blue text-sm hover:underline"
                        >
                          Try again
                        </button>
                      </div>
                    ) : domains.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-hx-text text-sm mb-3">
                          No SNS domains found for your wallet.
                        </p>
                        <p className="text-hx-text/60 text-xs mb-4">
                          You can register a .sol domain at{' '}
                          <a 
                            href="https://sns.id" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-hx-blue hover:underline"
                          >
                            sns.id
                          </a>
                        </p>
                        <button
                          onClick={() => setUseManualEntry(true)}
                          className="text-hx-green text-sm hover:underline"
                        >
                          Or enter domain manually
                        </button>
                      </div>
                    ) : (
                      <>
                        <label className="block text-xs text-hx-text mb-2 uppercase tracking-wider">
                          Your Domains
                        </label>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {domains.map((domain) => (
                            <button
                              key={domain.domain}
                              onClick={() => setSelectedDomain(domain)}
                              className={`
                                w-full flex items-center justify-between p-3 rounded-lg border transition-all
                                ${selectedDomain?.domain === domain.domain
                                  ? 'bg-hx-green/10 border-hx-green text-hx-white'
                                  : 'bg-hx-bg border-hx-text/20 text-hx-text hover:border-hx-green/50'}
                              `}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{domain.domain}</span>
                                <span className="text-hx-green">.sol</span>
                                {domain.isPrimary && (
                                  <span className="px-2 py-0.5 bg-hx-blue/20 text-hx-blue text-[10px] rounded-full uppercase">
                                    Primary
                                  </span>
                                )}
                              </div>
                              {selectedDomain?.domain === domain.domain && (
                                <svg className="w-5 h-5 text-hx-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setUseManualEntry(true)}
                          className="mt-3 text-hx-text/60 text-xs hover:text-hx-text transition-colors"
                        >
                          Enter a different domain manually →
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Manual Domain Entry */}
                {(testMode || useManualEntry) && (
                  <div className="mb-6">
                    <label className="block text-xs text-hx-text mb-2 uppercase tracking-wider">
                      {testMode ? 'Domain Name (Test Mode)' : 'SNS Domain Name'}
                    </label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={manualDomain}
                        onChange={(e) => setManualDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder={testMode ? 'any-test-domain' : 'myname'}
                        className="flex-1 bg-hx-bg border border-hx-text/20 rounded-l-lg px-4 py-3 focus:outline-none focus:border-hx-green transition-colors"
                      />
                      <span className="bg-hx-card-bg border border-l-0 border-hx-text/20 rounded-r-lg px-4 py-3 text-hx-green font-medium">
                        .sol
                      </span>
                    </div>
                    {testMode && (
                      <p className="text-xs text-yellow-400/70 mt-2">
                        ⚠️ Test mode: SNS ownership verification is disabled
                      </p>
                    )}
                    {!testMode && useManualEntry && (
                      <>
                        <p className="text-xs text-hx-text mt-2">
                          Ownership will be verified before vault creation.
                        </p>
                        <button
                          onClick={() => {
                            setUseManualEntry(false);
                            setManualDomain('');
                          }}
                          className="mt-2 text-hx-text/60 text-xs hover:text-hx-text transition-colors"
                        >
                          ← Back to domain list
                        </button>
                      </>
                    )}
                  </div>
                )}

                <button
                  onClick={handleDomainSubmit}
                  disabled={verifyingOwnership || (!getDomainName() && !testMode)}
                  className={`
                    w-full py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2
                    ${verifyingOwnership || (!getDomainName() && !testMode)
                      ? 'bg-hx-text/20 text-hx-text/50 cursor-not-allowed'
                      : 'bg-hx-green text-hx-bg hover:bg-[#a8f740]'}
                  `}
                >
                  {verifyingOwnership ? (
                    <>
                      <div className="w-4 h-4 border-2 border-hx-bg border-t-transparent rounded-full animate-spin" />
                      Verifying ownership...
                    </>
                  ) : (
                    'Continue'
                  )}
                </button>
              </motion.div>
            )}

            {step === 'policy' && (
              <motion.div
                key="policy"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-lg font-semibold mb-4 text-hx-white">Configure Privacy Policy</h2>
                
                <div className="space-y-5">
                  {/* Splits */}
                  <div>
                    <label className="block text-xs text-hx-text mb-2 uppercase tracking-wider">
                      Number of Splits
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-hx-text uppercase">Min</span>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={policy.minSplits}
                          onChange={(e) => setPolicy(p => ({ ...p, minSplits: parseInt(e.target.value) || 1 }))}
                          className="w-full bg-hx-bg border border-hx-text/20 rounded-lg px-4 py-2.5 focus:outline-none focus:border-hx-green"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-hx-text uppercase">Max</span>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={policy.maxSplits}
                          onChange={(e) => setPolicy(p => ({ ...p, maxSplits: parseInt(e.target.value) || 5 }))}
                          className="w-full bg-hx-bg border border-hx-text/20 rounded-lg px-4 py-2.5 focus:outline-none focus:border-hx-green"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Delays */}
                  <div>
                    <label className="block text-xs text-hx-text mb-2 uppercase tracking-wider">
                      Delay Between Splits (seconds)
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-hx-text uppercase">Min</span>
                        <input
                          type="number"
                          min="0"
                          value={policy.minDelaySeconds}
                          onChange={(e) => setPolicy(p => ({ ...p, minDelaySeconds: parseInt(e.target.value) || 0 }))}
                          className="w-full bg-hx-bg border border-hx-text/20 rounded-lg px-4 py-2.5 focus:outline-none focus:border-hx-green"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-hx-text uppercase">Max</span>
                        <input
                          type="number"
                          min="0"
                          value={policy.maxDelaySeconds}
                          onChange={(e) => setPolicy(p => ({ ...p, maxDelaySeconds: parseInt(e.target.value) || 3600 }))}
                          className="w-full bg-hx-bg border border-hx-text/20 rounded-lg px-4 py-2.5 focus:outline-none focus:border-hx-green"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setStep('domain')}
                    className="flex-1 py-3 bg-hx-bg border border-hx-text/20 rounded-lg font-semibold text-hx-text hover:border-hx-green/50 transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={handlePolicySubmit}
                    className="flex-1 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all"
                  >
                    Continue
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'confirm' && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-lg font-semibold mb-4 text-hx-white">Confirm Setup</h2>
                
                {testMode && (
                  <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-yellow-400 text-xs">
                      ⚠️ Test Mode: This vault will be created without SNS verification
                    </p>
                  </div>
                )}
                
                <div className="bg-hx-bg rounded-lg p-4 mb-6">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-hx-text">Domain</span>
                      <span className="font-semibold text-hx-white">{getDomainName()}.sol</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hx-text">Splits</span>
                      <span className="font-semibold text-hx-white">{policy.minSplits} - {policy.maxSplits}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hx-text">Delay Range</span>
                      <span className="font-semibold text-hx-white">
                        {policy.minDelaySeconds}s - {policy.maxDelaySeconds}s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hx-text">Privacy</span>
                      <span className="font-semibold text-hx-green">Enabled</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('policy')}
                    className="flex-1 py-3 bg-hx-bg border border-hx-text/20 rounded-lg font-semibold text-hx-text hover:border-hx-green/50 transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirm}
                    className="flex-1 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all"
                  >
                    Create Vault
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-10"
              >
                <div className="w-12 h-12 mx-auto mb-4 rounded-full border-3 border-hx-green border-t-transparent animate-spin" />
                <h2 className="text-lg font-semibold mb-2 text-hx-white">Creating Vault</h2>
                <p className="text-sm text-hx-text">
                  Please confirm the transaction in your wallet...
                </p>
              </motion.div>
            )}

            {step === 'complete' && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-hx-green/20 flex items-center justify-center">
                  <svg className="w-7 h-7 text-hx-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold mb-2 text-hx-white">Vault Created!</h2>
                <p className="text-sm text-hx-text mb-4">
                  Your privacy vault for <span className="text-hx-green">{getDomainName()}.sol</span> is ready.
                </p>
                {txSignature && (
                  <a
                    href={`https://www.orbmarkets.io/tx/${txSignature}?cluster=devnet&tab=summary`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-hx-blue hover:underline"
                  >
                    View Transaction →
                  </a>
                )}
                <div className="mt-6">
                  <a
                    href="/"
                    className="inline-block px-6 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all"
                  >
                    Go to Dashboard
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
