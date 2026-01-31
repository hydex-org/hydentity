'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/Header';
import { ClientOnly } from '@/components/ClientOnly';
import { DevnetDomainRegistration } from '@/components/DevnetDomainRegistration';
import { useHydentity } from '@/hooks/useHydentity';
import { useSnsDomains, SnsDomain } from '@/hooks/useSnsDomains';
import { useTestMode } from '@/contexts/TestModeContext';
import { useNetworkType } from '@/contexts/NetworkContext';
import { getExplorerTxUrl } from '@/config/networks';

type SetupStep = 'domain' | 'destinations' | 'policy' | 'confirm' | 'processing' | 'complete';
type PrivacyPreset = 'low' | 'medium' | 'high' | 'custom';

interface PrivacySettings {
  minSplits: number;
  maxSplits: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
}

// Privacy presets matching program defaults (medium = default)
const PRIVACY_PRESETS: Record<Exclude<PrivacyPreset, 'custom'>, PrivacySettings & { label: string; description: string }> = {
  low: {
    label: 'Low',
    description: 'Quick withdrawals, minimal privacy',
    minSplits: 1,
    maxSplits: 3,
    minDelaySeconds: 60,      // 1 min
    maxDelaySeconds: 600,     // 10 mins
  },
  medium: {
    label: 'Medium',
    description: 'Balanced privacy and speed',
    minSplits: 2,
    maxSplits: 5,
    minDelaySeconds: 300,     // 5 mins (program default)
    maxDelaySeconds: 1800,    // 30 mins (program default)
  },
  high: {
    label: 'High',
    description: 'Maximum privacy, longer delays',
    minSplits: 3,
    maxSplits: 5,
    minDelaySeconds: 7200,    // 2 hours
    maxDelaySeconds: 28800,   // 8 hours
  },
};

// Format seconds to human readable
function formatDelay(seconds: number): string {
  if (seconds >= 86400) return `${Math.round(seconds / 86400)} day${seconds >= 172800 ? 's' : ''}`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} hour${seconds >= 7200 ? 's' : ''}`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min${seconds >= 120 ? 's' : ''}`;
  return `${seconds} sec${seconds !== 1 ? 's' : ''}`;
}

export default function SetupPage() {
  const { connected, publicKey } = useWallet();
  const { initializeVault } = useHydentity();
  const { domains, loading: domainsLoading, error: domainsError, verifyOwnership, refetch } = useSnsDomains();
  const { testMode, toggleTestMode } = useTestMode();
  const networkType = useNetworkType();

  const [step, setStep] = useState<SetupStep>('domain');
  const [selectedDomain, setSelectedDomain] = useState<SnsDomain | null>(null);
  const [manualDomain, setManualDomain] = useState('');
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [verifyingOwnership, setVerifyingOwnership] = useState(false);

  // Destination wallets state
  const [destinations, setDestinations] = useState<string[]>(['']);
  const [destinationErrors, setDestinationErrors] = useState<string[]>([]);

  // Privacy settings - default to MEDIUM (matches program constants)
  const [preset, setPreset] = useState<PrivacyPreset>('medium');
  const [policy, setPolicy] = useState<PrivacySettings & { enabled: boolean }>({
    ...PRIVACY_PRESETS.medium,
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

  // NOTE: We intentionally do NOT pre-fill the connected wallet as destination
  // For optimal privacy, users should use a fresh wallet that is not linked to this one

  // Check if current settings match a preset
  useEffect(() => {
    for (const [key, settings] of Object.entries(PRIVACY_PRESETS)) {
      if (
        policy.minSplits === settings.minSplits &&
        policy.maxSplits === settings.maxSplits &&
        policy.minDelaySeconds === settings.minDelaySeconds &&
        policy.maxDelaySeconds === settings.maxDelaySeconds
      ) {
        if (preset !== key) setPreset(key as PrivacyPreset);
        return;
      }
    }
    if (preset !== 'custom') setPreset('custom');
  }, [policy, preset]);

  const getDomainName = (): string => {
    if (useManualEntry || testMode) {
      return manualDomain;
    }
    return selectedDomain?.domain || '';
  };

  // Apply a privacy preset
  const applyPreset = (newPreset: Exclude<PrivacyPreset, 'custom'>) => {
    const settings = PRIVACY_PRESETS[newPreset];
    setPolicy(p => ({
      ...p,
      minSplits: settings.minSplits,
      maxSplits: settings.maxSplits,
      minDelaySeconds: settings.minDelaySeconds,
      maxDelaySeconds: settings.maxDelaySeconds,
    }));
    setPreset(newPreset);
  };

  // ========== Destination Wallet Management ==========

  const addDestination = useCallback(() => {
    if (destinations.length < 5) {
      setDestinations([...destinations, '']);
    }
  }, [destinations]);

  const removeDestination = useCallback((index: number) => {
    if (destinations.length > 1) {
      setDestinations(destinations.filter((_, i) => i !== index));
      setDestinationErrors(destinationErrors.filter((_, i) => i !== index));
    }
  }, [destinations, destinationErrors]);

  const updateDestination = useCallback((index: number, value: string) => {
    const newDestinations = [...destinations];
    newDestinations[index] = value;
    setDestinations(newDestinations);

    // Clear error for this field
    const newErrors = [...destinationErrors];
    newErrors[index] = '';
    setDestinationErrors(newErrors);
  }, [destinations, destinationErrors]);

  const validateDestinations = useCallback((): boolean => {
    const errors: string[] = [];
    let valid = true;

    const nonEmptyDestinations = destinations.filter(d => d.trim() !== '');

    if (nonEmptyDestinations.length === 0) {
      errors[0] = 'At least one destination required';
      valid = false;
    }

    destinations.forEach((dest, i) => {
      if (dest.trim() === '') {
        if (nonEmptyDestinations.length === 0 && i === 0) {
          errors[i] = 'Required';
        }
        return;
      }

      try {
        new PublicKey(dest.trim());
      } catch {
        errors[i] = 'Invalid Solana address';
        valid = false;
      }
    });

    setDestinationErrors(errors);
    return valid;
  }, [destinations]);

  // ========== Step Handlers ==========

  const handleDomainSubmit = async () => {
    const domainName = getDomainName();

    if (!domainName.trim()) {
      setError('Please enter or select a domain name');
      return;
    }

    // In test mode, skip verification
    if (testMode) {
      setError(null);
      setStep('destinations');
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
    setStep('destinations');
  };

  const handleDestinationsSubmit = () => {
    if (!validateDestinations()) {
      return;
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

  const stepOrder: SetupStep[] = ['domain', 'destinations', 'policy', 'confirm', 'complete'];
  const currentStepIndex = stepOrder.indexOf(step);

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
          {['domain', 'destinations', 'policy', 'confirm', 'complete'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                ${step === s ? 'bg-hx-green text-hx-bg' :
                  currentStepIndex > i
                    ? 'bg-hx-green text-hx-bg'
                    : 'bg-hx-card-bg border border-hx-text/20 text-hx-text'}
              `}>
                {currentStepIndex > i ? '✓' : i + 1}
              </div>
              {i < 4 && (
                <div className={`w-8 md:w-14 h-0.5 mx-1 ${
                  currentStepIndex > i
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
                          {' '}or register directly on devnet below.
                        </p>
                        <div className="flex flex-col items-center gap-3">
                          <DevnetDomainRegistration
                            onDomainRegistered={(domain) => {
                              refetch();
                            }}
                          />
                          <button
                            onClick={() => setUseManualEntry(true)}
                            className="text-hx-green text-sm hover:underline"
                          >
                            Or enter domain manually
                          </button>
                        </div>
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

            {step === 'destinations' && (
              <motion.div
                key="destinations"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-lg font-semibold mb-2 text-hx-white">Destination Wallets</h2>
                <p className="text-xs text-hx-text mb-4">
                  Where should withdrawals be sent? These addresses are encrypted with MPC and never exposed on-chain.
                </p>

                {/* Privacy Warning */}
                <div className="mb-4 p-3 bg-hx-purple/10 border border-hx-purple/20 rounded-lg">
                  <p className="text-xs text-hx-purple">
                    <span className="font-semibold">Privacy Tip:</span> For optimal privacy, use a <strong>fresh wallet</strong> that has no prior connection to your current wallet. This helps break on-chain linkability.
                  </p>
                </div>

                <div className="space-y-3 mb-4">
                  {destinations.map((dest, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="flex-1">
                        <div className="relative">
                          <input
                            type="text"
                            value={dest}
                            onChange={(e) => updateDestination(i, e.target.value)}
                            placeholder="Solana wallet address"
                            className={`w-full px-3 py-2.5 bg-hx-bg border rounded-lg text-sm font-mono text-hx-white placeholder-hx-text/40 focus:outline-none transition-all ${
                              destinationErrors[i]
                                ? 'border-red-500/50 focus:border-red-500'
                                : 'border-hx-text/20 focus:border-hx-green'
                            }`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-hx-text/40">
                            #{i + 1}
                          </span>
                        </div>
                        {destinationErrors[i] && (
                          <p className="text-[10px] text-red-400 mt-1 ml-1">{destinationErrors[i]}</p>
                        )}
                      </div>
                      {destinations.length > 1 && (
                        <button
                          onClick={() => removeDestination(i)}
                          className="px-2 text-hx-text hover:text-red-400 transition-colors self-start mt-2.5"
                          title="Remove destination"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {destinations.length < 5 && (
                  <button
                    onClick={addDestination}
                    className="mb-4 text-xs text-hx-blue hover:text-hx-blue/80 transition-colors flex items-center gap-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add another destination ({destinations.length}/5)
                  </button>
                )}

                {/* Use connected wallet button */}
                {publicKey && destinations[0] !== publicKey.toBase58() && (
                  <button
                    onClick={() => updateDestination(0, publicKey.toBase58())}
                    className="mb-4 text-xs text-hx-green hover:underline"
                  >
                    Use connected wallet as destination
                  </button>
                )}

                {/* Privacy note */}
                <div className="mb-6 p-3 bg-hx-blue/5 border border-hx-blue/20 rounded-lg">
                  <p className="text-[10px] text-hx-text leading-relaxed">
                    <span className="text-hx-blue font-medium">Privacy:</span> Destinations are encrypted using Arcium MPC. The network collectively manages withdrawals without any single party knowing your addresses.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('domain')}
                    className="flex-1 py-3 bg-hx-bg border border-hx-text/20 rounded-lg font-semibold text-hx-text hover:border-hx-green/50 transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleDestinationsSubmit}
                    className="flex-1 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all"
                  >
                    Continue
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'policy' && (
              <motion.div
                key="policy"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-lg font-semibold mb-2 text-hx-white">Privacy Settings</h2>
                <p className="text-xs text-hx-text mb-4">
                  Controls how funds are withdrawn to your private wallets.
                </p>

                {/* Privacy Presets */}
                <div className="mb-5">
                  <label className="block text-[10px] text-hx-text mb-2 uppercase tracking-wider">
                    Privacy Level
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map((level) => {
                      const presetData = PRIVACY_PRESETS[level];
                      const isActive = preset === level;
                      return (
                        <button
                          key={level}
                          onClick={() => applyPreset(level)}
                          className={`p-3 rounded-lg border-2 transition-all text-left ${
                            isActive
                              ? level === 'low'
                                ? 'border-yellow-500 bg-yellow-500/10'
                                : level === 'medium'
                                ? 'border-hx-blue bg-hx-blue/10'
                                : 'border-hx-green bg-hx-green/10'
                              : 'border-hx-text/20 hover:border-hx-text/40'
                          }`}
                        >
                          <div className={`text-sm font-semibold mb-0.5 ${
                            isActive
                              ? level === 'low'
                                ? 'text-yellow-400'
                                : level === 'medium'
                                ? 'text-hx-blue'
                                : 'text-hx-green'
                              : 'text-hx-white'
                          }`}>
                            {presetData.label}
                          </div>
                          <div className="text-[9px] text-hx-text leading-tight">
                            {presetData.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {preset === 'custom' && (
                    <div className="mt-2 px-2 py-1 bg-hx-bg/50 rounded text-[10px] text-hx-text text-center">
                      Custom settings
                    </div>
                  )}
                </div>

                <div className="space-y-5">
                  {/* Splits */}
                  <div>
                    <label className="block text-xs text-hx-text mb-2 uppercase tracking-wider">
                      Number of Splits
                    </label>
                    <p className="text-[10px] text-hx-text/60 mb-2">
                      Withdrawals split into multiple transactions
                    </p>
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
                      Delay Between Splits
                    </label>
                    <p className="text-[10px] text-hx-text/60 mb-2">
                      Time spread for withdrawals ({formatDelay(policy.minDelaySeconds)} - {formatDelay(policy.maxDelaySeconds)})
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-hx-text uppercase">Min (seconds)</span>
                        <input
                          type="number"
                          min="60"
                          value={policy.minDelaySeconds}
                          onChange={(e) => setPolicy(p => ({ ...p, minDelaySeconds: parseInt(e.target.value) || 60 }))}
                          className="w-full bg-hx-bg border border-hx-text/20 rounded-lg px-4 py-2.5 focus:outline-none focus:border-hx-green"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-hx-text uppercase">Max (seconds)</span>
                        <input
                          type="number"
                          min="60"
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
                    onClick={() => setStep('destinations')}
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
                      <span className="text-hx-text">Destinations</span>
                      <span className="font-semibold text-hx-white">
                        {destinations.filter(d => d.trim()).length} wallet{destinations.filter(d => d.trim()).length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hx-text">Privacy Level</span>
                      <span className={`font-semibold ${
                        preset === 'low' ? 'text-yellow-400' :
                        preset === 'medium' ? 'text-hx-blue' :
                        preset === 'high' ? 'text-hx-green' : 'text-hx-white'
                      }`}>
                        {preset === 'custom' ? 'Custom' : PRIVACY_PRESETS[preset as keyof typeof PRIVACY_PRESETS].label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hx-text">Splits</span>
                      <span className="font-semibold text-hx-white">{policy.minSplits} - {policy.maxSplits}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hx-text">Delay Range</span>
                      <span className="font-semibold text-hx-white">
                        {formatDelay(policy.minDelaySeconds)} - {formatDelay(policy.maxDelaySeconds)}
                      </span>
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
                    href={getExplorerTxUrl(networkType, txSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-hx-blue hover:underline"
                  >
                    View Transaction →
                  </a>
                )}
                <div className="mt-6 p-4 bg-orange-500/10 rounded-lg border border-orange-500/30 text-left">
                  <p className="text-sm font-medium text-orange-400 mb-1">Next step: Transfer your domain</p>
                  <p className="text-xs text-hx-text">
                    You must transfer domain ownership to the vault for it to receive funds sent to your .sol name.
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  <a
                    href={`/vault/${getDomainName()}`}
                    className="block px-6 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all"
                  >
                    Transfer Domain to Vault
                  </a>
                  <a
                    href="/"
                    className="block px-6 py-3 bg-hx-bg border border-hx-text/20 text-hx-text rounded-lg font-semibold hover:bg-hx-text/5 transition-all"
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
