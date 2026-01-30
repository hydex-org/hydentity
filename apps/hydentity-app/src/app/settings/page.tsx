'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Header } from '@/components/Header';
import { usePrivateConfig, parseDuration } from '@/hooks/usePrivateConfig';
import { useNetwork } from '@/contexts/NetworkContext';
import { usePrivacyCash } from '@/hooks/usePrivacyCash';
import { NetworkType } from '@/config/networks';

type PrivacyPreset = 'low' | 'medium' | 'high' | 'custom';

interface PrivacySettings {
  minSplits: number;
  maxSplits: number;
  minDelayMins: number;
  maxDelayMins: number;
}

const PRIVACY_PRESETS: Record<Exclude<PrivacyPreset, 'custom'>, PrivacySettings & { label: string; description: string }> = {
  low: {
    label: 'Low',
    description: 'Quick withdrawals with minimal obfuscation',
    minSplits: 1,
    maxSplits: 3,
    minDelayMins: 1,
    maxDelayMins: 10,
  },
  medium: {
    label: 'Medium',
    description: 'Balanced privacy and convenience',
    minSplits: 2,
    maxSplits: 5,
    minDelayMins: 5,
    maxDelayMins: 30,
  },
  high: {
    label: 'High',
    description: 'Maximum privacy with longer delays',
    minSplits: 3,
    maxSplits: 5,
    minDelayMins: 120, // 2 hours
    maxDelayMins: 480, // 8 hours
  },
};

// Convert minutes to display format
function formatDelay(mins: number): { value: number; unit: 'mins' | 'hours' | 'days' } {
  if (mins >= 1440) return { value: Math.round(mins / 1440), unit: 'days' };
  if (mins >= 60) return { value: Math.round(mins / 60), unit: 'hours' };
  return { value: mins, unit: 'mins' };
}

// Convert display format to minutes
function toMinutes(value: number, unit: 'mins' | 'hours' | 'days'): number {
  if (unit === 'days') return value * 1440;
  if (unit === 'hours') return value * 60;
  return value;
}

export default function SettingsPage() {
  const { connected, publicKey, signMessage } = useWallet();
  const { initializeConfig, validateConfig, isLoading, error: configError } = usePrivateConfig();
  const { network, setNetwork, config } = useNetwork();
  const {
    isAvailable: privacyCashAvailable,
    isInitialized: privacyCashInitialized,
    isLoading: privacyCashLoading,
    error: privacyCashError,
    balance: privacyCashBalance,
    initializeWithWallet: initializePrivacyCashWithWallet,
    withdraw: withdrawFromPrivacyCash,
    refreshBalance: refreshPrivacyCashBalance,
  } = usePrivacyCash();

  // Privacy Cash local UI state
  const [showPrivacyCashWithdraw, setShowPrivacyCashWithdraw] = useState(false);
  const [privacyCashWithdrawAmount, setPrivacyCashWithdrawAmount] = useState('');
  const [privacyCashWithdrawAddress, setPrivacyCashWithdrawAddress] = useState('');
  const [privacyCashWithdrawStatus, setPrivacyCashWithdrawStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Destination wallets state
  const [destinations, setDestinations] = useState<string[]>(['']);
  const [destinationErrors, setDestinationErrors] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Privacy settings state - default to MEDIUM
  const [preset, setPreset] = useState<PrivacyPreset>('medium');
  const [minSplits, setMinSplits] = useState(PRIVACY_PRESETS.medium.minSplits);
  const [maxSplits, setMaxSplits] = useState(PRIVACY_PRESETS.medium.maxSplits);
  const [minDelayValue, setMinDelayValue] = useState(5);
  const [minDelayUnit, setMinDelayUnit] = useState<'mins' | 'hours' | 'days'>('mins');
  const [maxDelayValue, setMaxDelayValue] = useState(30);
  const [maxDelayUnit, setMaxDelayUnit] = useState<'mins' | 'hours' | 'days'>('mins');
  const [privacyCashRoutingEnabled, setPrivacyCashRoutingEnabled] = useState(false);

  // Auto-withdraw settings
  const [autoWithdrawEnabled, setAutoWithdrawEnabled] = useState(false);
  const [autoWithdrawThreshold, setAutoWithdrawThreshold] = useState('');
  
  // Minimum gap between min and max delays (in minutes)
  const MIN_DELAY_GAP = 10;
  
  // Slider dragging state
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDraggingMin, setIsDraggingMin] = useState(false);
  const [isDraggingMax, setIsDraggingMax] = useState(false);

  // Update settings when preset changes
  const applyPreset = (newPreset: Exclude<PrivacyPreset, 'custom'>) => {
    const settings = PRIVACY_PRESETS[newPreset];
    setMinSplits(settings.minSplits);
    setMaxSplits(settings.maxSplits);
    
    const minDelay = formatDelay(settings.minDelayMins);
    const maxDelay = formatDelay(settings.maxDelayMins);
    setMinDelayValue(minDelay.value);
    setMinDelayUnit(minDelay.unit);
    setMaxDelayValue(maxDelay.value);
    setMaxDelayUnit(maxDelay.unit);
    setPreset(newPreset);
  };

  // Check if current settings match a preset
  useEffect(() => {
    const currentMinMins = toMinutes(minDelayValue, minDelayUnit);
    const currentMaxMins = toMinutes(maxDelayValue, maxDelayUnit);
    
    for (const [key, settings] of Object.entries(PRIVACY_PRESETS)) {
      if (
        minSplits === settings.minSplits &&
        maxSplits === settings.maxSplits &&
        currentMinMins === settings.minDelayMins &&
        currentMaxMins === settings.maxDelayMins
      ) {
        if (preset !== key) setPreset(key as PrivacyPreset);
        return;
      }
    }
    if (preset !== 'custom') setPreset('custom');
  }, [minSplits, maxSplits, minDelayValue, minDelayUnit, maxDelayValue, maxDelayUnit, preset]);

  // Handle slider interactions
  const handleSliderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const value = Math.round(percent * 9) + 1; // 1-10 range
    
    // Determine which thumb to move based on proximity
    const minDist = Math.abs(value - minSplits);
    const maxDist = Math.abs(value - maxSplits);
    
    if (minDist < maxDist) {
      setMinSplits(Math.min(value, maxSplits));
    } else {
      setMaxSplits(Math.max(value, minSplits));
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!sliderRef.current || (!isDraggingMin && !isDraggingMax)) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const value = Math.round(percent * 9) + 1;
    
    if (isDraggingMin) {
      setMinSplits(Math.min(value, maxSplits));
    } else if (isDraggingMax) {
      setMaxSplits(Math.max(value, minSplits));
    }
  };

  const handleMouseUp = () => {
    setIsDraggingMin(false);
    setIsDraggingMax(false);
  };

  useEffect(() => {
    if (isDraggingMin || isDraggingMax) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingMin, isDraggingMax, minSplits, maxSplits]);

  // Handle minimum delay value change - ensure max is at least MIN_DELAY_GAP greater
  const handleMinDelayValueChange = (newValue: number) => {
    const validValue = Math.max(1, newValue);
    setMinDelayValue(validValue);
    
    const minTotalMins = toMinutes(validValue, minDelayUnit);
    const maxTotalMins = toMinutes(maxDelayValue, maxDelayUnit);
    
    if (maxTotalMins < minTotalMins + MIN_DELAY_GAP) {
      // Update max to be at least MIN_DELAY_GAP greater, in the same unit
      const newMaxMins = minTotalMins + MIN_DELAY_GAP;
      const formatted = formatDelay(newMaxMins);
      setMaxDelayValue(formatted.value);
      setMaxDelayUnit(formatted.unit);
    }
  };

  // Handle minimum delay unit change - sync max unit and ensure gap
  const handleMinDelayUnitChange = (newUnit: 'mins' | 'hours' | 'days') => {
    setMinDelayUnit(newUnit);
    
    const minTotalMins = toMinutes(minDelayValue, newUnit);
    const maxTotalMins = toMinutes(maxDelayValue, maxDelayUnit);
    
    // If switching to a larger unit, also switch max to the same unit with +1
    if (newUnit === 'hours' && maxDelayUnit === 'mins') {
      setMaxDelayUnit('hours');
      setMaxDelayValue(minDelayValue + 1);
    } else if (newUnit === 'days' && (maxDelayUnit === 'mins' || maxDelayUnit === 'hours')) {
      setMaxDelayUnit('days');
      setMaxDelayValue(minDelayValue + 1);
    } else if (maxTotalMins < minTotalMins + MIN_DELAY_GAP) {
      // Ensure gap is maintained
      const newMaxMins = minTotalMins + MIN_DELAY_GAP;
      const formatted = formatDelay(newMaxMins);
      setMaxDelayValue(formatted.value);
      setMaxDelayUnit(formatted.unit);
    }
  };

  // Handle max delay value change - ensure it's at least MIN_DELAY_GAP greater than min
  const handleMaxDelayValueChange = (newValue: number) => {
    const validValue = Math.max(1, newValue);
    const minTotalMins = toMinutes(minDelayValue, minDelayUnit);
    const newMaxTotalMins = toMinutes(validValue, maxDelayUnit);
    
    if (newMaxTotalMins >= minTotalMins + MIN_DELAY_GAP) {
      setMaxDelayValue(validValue);
    } else {
      // Set to minimum allowed value
      const minAllowedMins = minTotalMins + MIN_DELAY_GAP;
      const formatted = formatDelay(minAllowedMins);
      if (formatted.unit === maxDelayUnit) {
        setMaxDelayValue(formatted.value);
      } else {
        setMaxDelayValue(formatted.value);
        setMaxDelayUnit(formatted.unit);
      }
    }
  };

  // Handle max delay unit change - ensure gap is maintained
  const handleMaxDelayUnitChange = (newUnit: 'mins' | 'hours' | 'days') => {
    const minTotalMins = toMinutes(minDelayValue, minDelayUnit);
    const newMaxTotalMins = toMinutes(maxDelayValue, newUnit);
    
    if (newMaxTotalMins >= minTotalMins + MIN_DELAY_GAP) {
      setMaxDelayUnit(newUnit);
    } else {
      // Adjust value to maintain gap
      const minAllowedMins = minTotalMins + MIN_DELAY_GAP;
      if (newUnit === 'mins') {
        setMaxDelayValue(minAllowedMins);
      } else if (newUnit === 'hours') {
        setMaxDelayValue(Math.ceil(minAllowedMins / 60));
      } else {
        setMaxDelayValue(Math.ceil(minAllowedMins / 1440));
      }
      setMaxDelayUnit(newUnit);
    }
  };

  // Select all text on focus for better UX
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
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

  // ========== Save Configuration ==========

  const handleSaveConfig = useCallback(async () => {
    if (!publicKey) return;

    // Validate destinations
    if (!validateDestinations()) {
      return;
    }

    setSaveStatus('saving');

    try {
      const validDestinations = destinations
        .filter(d => d.trim() !== '')
        .map(d => new PublicKey(d.trim()));

      const minDelaySeconds = parseDuration(minDelayValue, minDelayUnit);
      const maxDelaySeconds = parseDuration(maxDelayValue, maxDelayUnit);

      const thresholdLamports = autoWithdrawEnabled && autoWithdrawThreshold
        ? BigInt(Math.floor(parseFloat(autoWithdrawThreshold) * 1e9))
        : BigInt(0);

      // For now, we use a mock vault pubkey - in production this would come from the vault context
      const mockVaultPubkey = publicKey;

      await initializeConfig({
        vaultPubkey: mockVaultPubkey,
        destinations: validDestinations,
        customSettings: {
          minSplits,
          maxSplits,
          minDelaySeconds,
          maxDelaySeconds,
        },
        autoWithdraw: {
          enabled: autoWithdrawEnabled,
          thresholdLamports,
        },
      });

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Failed to save config:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [
    publicKey,
    destinations,
    minSplits,
    maxSplits,
    minDelayValue,
    minDelayUnit,
    maxDelayValue,
    maxDelayUnit,
    autoWithdrawEnabled,
    autoWithdrawThreshold,
    validateDestinations,
    initializeConfig,
  ]);

  // ========== Privacy Cash Functions ==========

  const handleInitializePrivacyCash = useCallback(async () => {
    try {
      await initializePrivacyCashWithWallet();
      console.log('[Settings] Privacy Cash initialized');
    } catch (err) {
      console.error('[Settings] Failed to initialize Privacy Cash:', err);
    }
  }, [initializePrivacyCashWithWallet]);

  const handlePrivacyCashWithdraw = useCallback(async () => {
    if (!privacyCashWithdrawAmount || !privacyCashWithdrawAddress) return;

    setPrivacyCashWithdrawStatus('loading');
    try {
      const lamports = Math.floor(parseFloat(privacyCashWithdrawAmount) * LAMPORTS_PER_SOL);
      await withdrawFromPrivacyCash(lamports, privacyCashWithdrawAddress);
      setPrivacyCashWithdrawStatus('success');
      setPrivacyCashWithdrawAmount('');
      setPrivacyCashWithdrawAddress('');
      setShowPrivacyCashWithdraw(false);
      await refreshPrivacyCashBalance();
      setTimeout(() => setPrivacyCashWithdrawStatus('idle'), 3000);
    } catch (err) {
      console.error('[Settings] Privacy Cash withdrawal failed:', err);
      setPrivacyCashWithdrawStatus('error');
      setTimeout(() => setPrivacyCashWithdrawStatus('idle'), 3000);
    }
  }, [privacyCashWithdrawAmount, privacyCashWithdrawAddress, withdrawFromPrivacyCash, refreshPrivacyCashBalance]);

  if (!connected) {
    return (
      <main className="min-h-screen bg-hx-bg">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-bold mb-6 text-hx-white">
            Connect Your Wallet
          </h1>
          <p className="text-hx-text mb-8">
            Connect your wallet to access settings.
          </p>
          <WalletMultiButton />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-hx-bg">
      <Header />
      
      <div className="container mx-auto px-4 py-12 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold mb-2 text-hx-white">Settings</h1>
          <p className="text-sm text-hx-text">
            Configure your Hydentity preferences.
          </p>
        </motion.div>

        <div className="space-y-4">
          {/* Network Selection */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-xl p-5"
          >
            <h2 className="text-base font-semibold mb-4 text-hx-white">Network</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setNetwork('devnet')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  network === 'devnet'
                    ? 'border-hx-green bg-hx-green/10'
                    : 'border-vault-border hover:border-vault-accent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    network === 'devnet' ? 'bg-hx-green' : 'bg-hx-text'
                  }`} />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-hx-white">Devnet</p>
                    <p className="text-[10px] text-hx-text">Test network</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => setNetwork('mainnet-beta')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  network === 'mainnet-beta'
                    ? 'border-hx-green bg-hx-green/10'
                    : 'border-vault-border hover:border-vault-accent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    network === 'mainnet-beta' ? 'bg-hx-green' : 'bg-hx-text'
                  }`} />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-hx-white">Mainnet</p>
                    <p className="text-[10px] text-hx-text">Production</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Network Features Indicator */}
            <div className="mt-4 p-3 bg-hx-bg/50 rounded-lg">
              <p className="text-[10px] text-hx-text uppercase tracking-wider mb-2">Available Features</p>
              <div className="flex flex-wrap gap-2">
                {config.features.directWithdrawals && (
                  <span className="px-2 py-1 bg-hx-green/10 text-hx-green text-[10px] rounded">Direct Withdrawals</span>
                )}
                {config.features.mpcWithdrawals && (
                  <span className="px-2 py-1 bg-hx-blue/10 text-hx-blue text-[10px] rounded">Arcium MPC</span>
                )}
                {config.features.privacyCashRouting && (
                  <span className="px-2 py-1 bg-hx-purple/10 text-hx-purple text-[10px] rounded">Privacy Cash</span>
                )}
                {config.features.domainTransfer && (
                  <span className="px-2 py-1 bg-hx-text/10 text-hx-text text-[10px] rounded">Domain Transfer</span>
                )}
              </div>
            </div>
          </motion.div>

          {/* Wallet Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl p-5"
          >
            <h2 className="text-base font-semibold mb-4 text-hx-white">Wallet</h2>
            <div className="bg-hx-bg rounded-lg p-3">
              <p className="text-[10px] text-hx-text mb-1 uppercase tracking-wider">Connected Address</p>
              <p className="font-mono text-xs text-hx-white break-all">
                {publicKey?.toBase58()}
              </p>
            </div>
          </motion.div>

          {/* Destination Wallets */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass rounded-xl p-5"
          >
            <h2 className="text-base font-semibold mb-2 text-hx-white">Destination Wallets</h2>
            <p className="text-xs text-hx-text mb-4">
              Private wallets where withdrawals will be sent. These addresses are encrypted with MPC and never exposed on-chain.
            </p>

            <div className="space-y-3">
              {destinations.map((dest, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="text"
                        value={dest}
                        onChange={(e) => updateDestination(i, e.target.value)}
                        placeholder="Solana wallet address (e.g., 7xKX...)"
                        className={`w-full px-3 py-2.5 bg-hx-bg border rounded-lg text-sm font-mono text-hx-white placeholder-hx-text/40 focus:outline-none transition-all ${
                          destinationErrors[i]
                            ? 'border-red-500/50 focus:border-red-500'
                            : 'border-vault-border focus:border-hx-green'
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
                className="mt-3 text-xs text-hx-blue hover:text-hx-blue/80 transition-colors flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add another destination ({destinations.length}/5)
              </button>
            )}

            {/* Privacy note */}
            <div className="mt-4 p-3 bg-hx-blue/5 border border-hx-blue/20 rounded-lg">
              <p className="text-[10px] text-hx-text leading-relaxed">
                <span className="text-hx-blue font-medium">Privacy:</span> Destinations are encrypted using Arcium MPC. The network collectively manages withdrawals without any single party knowing your addresses.
              </p>
            </div>
          </motion.div>

          {/* Privacy Defaults */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl p-5"
          >
            <h2 className="text-base font-semibold mb-4 text-hx-white">Default Claim Settings</h2>
            <p className="text-xs text-hx-text mb-4">
              Controls how funds are withdrawn from the privacy mixer to your private wallet.
              Splits and delays are applied <span className="text-hx-green">after</span> the mixer to maximize unlinkability.
            </p>
            
            {/* Privacy Flow Diagram */}
            <div className="bg-hx-bg/50 rounded-lg p-3 mb-5 text-[10px] font-mono text-hx-text">
              <div className="flex items-center gap-2 justify-center">
                <span>Vault</span>
                <span className="text-hx-green">══►</span>
                <span>Mixer</span>
                <span className="text-hx-blue">──►</span>
                <span>Wallet</span>
              </div>
              <div className="flex items-center gap-2 justify-center mt-1 text-[9px]">
                <span className="text-hx-green">full amount</span>
                <span className="w-8"></span>
                <span className="text-hx-blue">splits + delays</span>
              </div>
            </div>

            {/* Privacy Presets */}
            <div className="mb-6">
              <label className="block text-[10px] text-hx-text mb-3 uppercase tracking-wider">
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
                          : 'border-vault-border hover:border-vault-accent'
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
              {/* Two-Point Splits Slider */}
              <div>
                <label className="block text-[10px] text-hx-text mb-2 uppercase tracking-wider">
                  Withdrawal Splits Range
                </label>
                <p className="text-[10px] text-hx-text/60 mb-3">
                  Number of separate withdrawals from the mixer: <span className="text-hx-white font-medium">{minSplits} – {maxSplits}</span>
                </p>
                
                {/* Custom Range Slider */}
                <div className="px-2">
                  <div 
                    ref={sliderRef}
                    className="relative h-2 bg-hx-bg rounded-full cursor-pointer"
                    onClick={handleSliderClick}
                  >
                    {/* Active range bar */}
                    <div 
                      className="absolute h-full bg-gradient-to-r from-hx-blue to-hx-green rounded-full"
                      style={{
                        left: `${((minSplits - 1) / 9) * 100}%`,
                        right: `${((10 - maxSplits) / 9) * 100}%`,
                      }}
                    />
                    
                    {/* Min thumb */}
                    <div
                      className="absolute w-5 h-5 bg-hx-blue rounded-full border-2 border-hx-white shadow-lg cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1.5 hover:scale-110 transition-transform"
                      style={{ left: `${((minSplits - 1) / 9) * 100}%` }}
                      onMouseDown={(e) => { e.stopPropagation(); setIsDraggingMin(true); }}
                    />
                    
                    {/* Max thumb */}
                    <div
                      className="absolute w-5 h-5 bg-hx-green rounded-full border-2 border-hx-white shadow-lg cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1.5 hover:scale-110 transition-transform"
                      style={{ left: `${((maxSplits - 1) / 9) * 100}%` }}
                      onMouseDown={(e) => { e.stopPropagation(); setIsDraggingMax(true); }}
                    />
                  </div>
                  
                  {/* Scale labels */}
                  <div className="flex justify-between mt-2 text-[9px] text-hx-text/60 px-0">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <span 
                        key={n} 
                        className={`w-4 text-center ${
                          n >= minSplits && n <= maxSplits ? 'text-hx-white' : ''
                        }`}
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Delay Inputs with Units */}
              <div>
                <label className="block text-[10px] text-hx-text mb-2 uppercase tracking-wider">
                  Delay Between Withdrawals
                </label>
                <p className="text-[10px] text-hx-text/60 mb-3">
                  Time spread for withdrawals to private wallet
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Min Delay */}
                  <div>
                    <div className="text-[9px] text-hx-text/60 mb-1.5">Minimum</div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={minDelayValue}
                        onChange={(e) => handleMinDelayValueChange(parseInt(e.target.value) || 1)}
                        onFocus={handleInputFocus}
                        min={1}
                        className="w-16 bg-hx-bg border border-vault-border rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-hx-green select-all"
                      />
                      <select
                        value={minDelayUnit}
                        onChange={(e) => handleMinDelayUnitChange(e.target.value as 'mins' | 'hours' | 'days')}
                        className="flex-1 bg-hx-bg border border-vault-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-hx-green cursor-pointer"
                      >
                        <option value="mins">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Max Delay */}
                  <div>
                    <div className="text-[9px] text-hx-text/60 mb-1.5">Maximum</div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={maxDelayValue}
                        onChange={(e) => handleMaxDelayValueChange(parseInt(e.target.value) || 1)}
                        onFocus={handleInputFocus}
                        min={1}
                        className="w-16 bg-hx-bg border border-vault-border rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-hx-green select-all"
                      />
                      <select
                        value={maxDelayUnit}
                        onChange={(e) => handleMaxDelayUnitChange(e.target.value as 'mins' | 'hours' | 'days')}
                        className="flex-1 bg-hx-bg border border-vault-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-hx-green cursor-pointer"
                      >
                        <option value="mins">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Privacy Cash Section */}
            <div className="mt-6 pt-6 border-t border-vault-border">
              <label className="block text-[10px] text-hx-text mb-3 uppercase tracking-wider">
                Privacy Cash Pool
              </label>

              {!config.features.privacyCashRouting ? (
                // Not available on this network
                <div className="p-4 bg-hx-bg/50 rounded-lg border border-vault-border">
                  <div className="flex items-center gap-2 text-hx-text/60">
                    <span>🔒</span>
                    <span className="text-sm">Privacy Cash not available on {config.displayName}</span>
                  </div>
                  <p className="text-[10px] text-hx-text/40 mt-2">
                    Switch to Mainnet to access Privacy Cash ZK pool features.
                  </p>
                </div>
              ) : !privacyCashAvailable ? (
                // SDK not installed
                <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <span>⚠️</span>
                    <span className="text-sm font-medium">Privacy Cash SDK not installed</span>
                  </div>
                  <p className="text-[10px] text-hx-text mt-2">
                    Install the privacycash package to enable ZK pool features.
                  </p>
                </div>
              ) : !privacyCashInitialized ? (
                // Available but not initialized
                <div className="p-4 bg-hx-purple/10 rounded-lg border border-hx-purple/20">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 text-hx-purple">
                        <span>🔐</span>
                        <span className="text-sm font-medium">Privacy Cash Ready</span>
                      </div>
                      <p className="text-[10px] text-hx-text mt-1">
                        Initialize with your wallet to enable private withdrawals through the ZK pool.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleInitializePrivacyCash}
                    disabled={privacyCashLoading || !signMessage}
                    className="w-full py-2.5 bg-hx-purple text-white rounded-lg font-medium text-sm hover:bg-hx-purple/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {privacyCashLoading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Initializing...
                      </>
                    ) : (
                      <>
                        <span>🔑</span>
                        Initialize Privacy Cash
                      </>
                    )}
                  </button>
                  <p className="text-[9px] text-hx-text/40 mt-2 text-center">
                    You will be asked to sign a message to derive your Privacy Cash key.
                  </p>
                </div>
              ) : (
                // Initialized - show balance and actions
                <div className="space-y-3">
                  {/* Balance Display */}
                  <div className="p-4 bg-hx-purple/10 rounded-lg border border-hx-purple/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-hx-purple">🔒</span>
                          <span className="text-sm font-medium text-hx-white">Privacy Cash Balance</span>
                        </div>
                        <p className="text-2xl font-bold text-hx-white mt-1">
                          {privacyCashBalance ? privacyCashBalance.sol.toFixed(4) : '0.0000'} <span className="text-sm text-hx-text">SOL</span>
                        </p>
                      </div>
                      <button
                        onClick={refreshPrivacyCashBalance}
                        disabled={privacyCashLoading}
                        className="p-2 text-hx-text hover:text-hx-white transition-colors"
                        title="Refresh balance"
                      >
                        <svg className={`h-5 w-5 ${privacyCashLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Withdraw Button */}
                  {!showPrivacyCashWithdraw ? (
                    <button
                      onClick={() => setShowPrivacyCashWithdraw(true)}
                      disabled={!privacyCashBalance || privacyCashBalance.lamports <= 0}
                      className="w-full py-2.5 bg-hx-purple/20 border border-hx-purple/30 text-hx-purple rounded-lg font-medium text-sm hover:bg-hx-purple/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Withdraw from Privacy Cash
                    </button>
                  ) : (
                    <div className="p-4 bg-hx-bg/50 rounded-lg border border-vault-border space-y-3">
                      <div>
                        <label className="block text-[10px] text-hx-text mb-1">Amount (SOL)</label>
                        <input
                          type="number"
                          value={privacyCashWithdrawAmount}
                          onChange={(e) => setPrivacyCashWithdrawAmount(e.target.value)}
                          placeholder="0.0"
                          step="0.0001"
                          className="w-full px-3 py-2 bg-hx-bg border border-vault-border rounded-lg text-sm text-hx-white placeholder-hx-text/40 focus:outline-none focus:border-hx-purple"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-hx-text mb-1">Destination Address</label>
                        <input
                          type="text"
                          value={privacyCashWithdrawAddress}
                          onChange={(e) => setPrivacyCashWithdrawAddress(e.target.value)}
                          placeholder="Solana wallet address..."
                          className="w-full px-3 py-2 bg-hx-bg border border-vault-border rounded-lg text-sm text-hx-white font-mono placeholder-hx-text/40 focus:outline-none focus:border-hx-purple"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowPrivacyCashWithdraw(false);
                            setPrivacyCashWithdrawAmount('');
                            setPrivacyCashWithdrawAddress('');
                          }}
                          className="flex-1 py-2 bg-hx-bg border border-vault-border text-hx-text rounded-lg text-sm hover:bg-vault-hover transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handlePrivacyCashWithdraw}
                          disabled={!privacyCashWithdrawAmount || !privacyCashWithdrawAddress || privacyCashWithdrawStatus === 'loading'}
                          className="flex-1 py-2 bg-hx-purple text-white rounded-lg text-sm font-medium hover:bg-hx-purple/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {privacyCashWithdrawStatus === 'loading' ? 'Withdrawing...' : 'Withdraw'}
                        </button>
                      </div>
                      <p className="text-[9px] text-hx-text/40 text-center">
                        Funds will be withdrawn from the ZK pool with no on-chain link to your vault.
                      </p>
                    </div>
                  )}

                  {/* Status Messages */}
                  {privacyCashError && (
                    <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                      {privacyCashError}
                    </div>
                  )}
                  {privacyCashWithdrawStatus === 'success' && (
                    <div className="p-2 bg-hx-green/10 border border-hx-green/20 rounded text-xs text-hx-green">
                      Withdrawal successful!
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Auto-Withdraw Settings */}
            <div className="mt-6 pt-6 border-t border-vault-border">
              <label className="block text-[10px] text-hx-text mb-3 uppercase tracking-wider">
                Automatic Withdrawals
              </label>
              <div className="flex items-center justify-between p-4 bg-hx-bg/50 rounded-lg border border-vault-border">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-hx-white mb-1">
                    Auto-Withdraw
                  </div>
                  <div className="text-[10px] text-hx-text/60">
                    Automatically withdraw when vault balance exceeds threshold
                  </div>
                </div>
                <button
                  onClick={() => setAutoWithdrawEnabled(!autoWithdrawEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoWithdrawEnabled ? 'bg-hx-green' : 'bg-hx-text/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoWithdrawEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {autoWithdrawEnabled && (
                <div className="mt-3 p-4 bg-hx-bg/50 rounded-lg border border-vault-border">
                  <label className="block text-[10px] text-hx-text mb-2 uppercase tracking-wider">
                    Threshold (SOL)
                  </label>
                  <input
                    type="number"
                    value={autoWithdrawThreshold}
                    onChange={(e) => setAutoWithdrawThreshold(e.target.value)}
                    placeholder="e.g., 1.0"
                    min="0"
                    step="0.1"
                    className="w-full px-3 py-2 bg-hx-bg border border-vault-border rounded-lg text-sm text-hx-white placeholder-hx-text/40 focus:outline-none focus:border-hx-green"
                  />
                  <p className="text-[10px] text-hx-text/60 mt-2">
                    MPC will automatically initiate withdrawal when vault balance exceeds this amount.
                  </p>
                </div>
              )}
            </div>

            {/* Error display */}
            {configError && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-xs text-red-400">{configError}</p>
              </div>
            )}

            {/* Save button */}
            <button
              onClick={handleSaveConfig}
              disabled={isLoading || saveStatus === 'saving'}
              className={`w-full mt-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                saveStatus === 'saved'
                  ? 'bg-hx-green/20 border border-hx-green text-hx-green'
                  : saveStatus === 'error'
                  ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                  : 'bg-hx-green/10 border border-hx-green text-hx-green hover:bg-hx-green/20 disabled:opacity-50'
              }`}
            >
              {isLoading || saveStatus === 'saving' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Encrypting & Saving...
                </span>
              ) : saveStatus === 'saved' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Configuration Saved
                </span>
              ) : saveStatus === 'error' ? (
                'Save Failed - Try Again'
              ) : (
                'Save Configuration'
              )}
            </button>
          </motion.div>

          {/* Danger Zone */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass rounded-xl p-5 border-red-500/20"
          >
            <h2 className="text-base font-semibold mb-4 text-red-400">Danger Zone</h2>
            <p className="text-xs text-hx-text mb-4">
              These actions are irreversible.
            </p>
            
            <button className="w-full py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg font-semibold text-sm text-red-400 hover:bg-red-500/20 transition-all">
              Close All Vaults
            </button>
          </motion.div>
        </div>
      </div>
    </main>
  );
}
