'use client';

import { useState, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { usePrivateConfig, PRIVACY_PRESETS, PrivacyPreset, formatDuration } from '../hooks/usePrivateConfig';

interface PrivateConfigSetupProps {
  vaultPubkey: PublicKey;
  onComplete: () => void;
  onCancel: () => void;
}

type SetupStep = 'destinations' | 'privacy' | 'auto-withdraw' | 'review';

/**
 * Private Configuration Setup Wizard
 * 
 * Multi-step wizard for setting up encrypted vault configuration
 * including destination wallets and privacy settings.
 */
export function PrivateConfigSetup({
  vaultPubkey,
  onComplete,
  onCancel,
}: PrivateConfigSetupProps) {
  const { initializeConfig, validateConfig, isLoading, error } = usePrivateConfig();
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState<SetupStep>('destinations');
  
  // Configuration state
  const [destinations, setDestinations] = useState<string[]>(['']);
  const [selectedPreset, setSelectedPreset] = useState<PrivacyPreset>('medium');
  const [customSettings, setCustomSettings] = useState({
    minSplits: PRIVACY_PRESETS.medium.minSplits,
    maxSplits: PRIVACY_PRESETS.medium.maxSplits,
    minDelaySeconds: PRIVACY_PRESETS.medium.minDelaySeconds,
    maxDelaySeconds: PRIVACY_PRESETS.medium.maxDelaySeconds,
  });
  const [useCustomSettings, setUseCustomSettings] = useState(false);
  const [autoWithdrawEnabled, setAutoWithdrawEnabled] = useState(false);
  const [autoWithdrawThreshold, setAutoWithdrawThreshold] = useState('');
  
  // Validation errors
  const [destinationErrors, setDestinationErrors] = useState<string[]>([]);

  /**
   * Add a destination input field
   */
  const addDestination = useCallback(() => {
    if (destinations.length < 5) {
      setDestinations([...destinations, '']);
    }
  }, [destinations]);

  /**
   * Remove a destination input field
   */
  const removeDestination = useCallback((index: number) => {
    if (destinations.length > 1) {
      setDestinations(destinations.filter((_, i) => i !== index));
    }
  }, [destinations]);

  /**
   * Update a destination value
   */
  const updateDestination = useCallback((index: number, value: string) => {
    const newDestinations = [...destinations];
    newDestinations[index] = value;
    setDestinations(newDestinations);
    
    // Clear error for this field
    const newErrors = [...destinationErrors];
    newErrors[index] = '';
    setDestinationErrors(newErrors);
  }, [destinations, destinationErrors]);

  /**
   * Validate destinations
   */
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
        errors[i] = 'Invalid address';
        valid = false;
      }
    });
    
    setDestinationErrors(errors);
    return valid;
  }, [destinations]);

  /**
   * Apply a preset
   */
  const applyPreset = useCallback((preset: PrivacyPreset) => {
    setSelectedPreset(preset);
    setCustomSettings({
      minSplits: PRIVACY_PRESETS[preset].minSplits,
      maxSplits: PRIVACY_PRESETS[preset].maxSplits,
      minDelaySeconds: PRIVACY_PRESETS[preset].minDelaySeconds,
      maxDelaySeconds: PRIVACY_PRESETS[preset].maxDelaySeconds,
    });
    setUseCustomSettings(false);
  }, []);

  /**
   * Navigate to next step
   */
  const nextStep = useCallback(() => {
    const steps: SetupStep[] = ['destinations', 'privacy', 'auto-withdraw', 'review'];
    const currentIndex = steps.indexOf(currentStep);
    
    // Validate current step
    if (currentStep === 'destinations') {
      if (!validateDestinations()) {
        return;
      }
    }
    
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  }, [currentStep, validateDestinations]);

  /**
   * Navigate to previous step
   */
  const prevStep = useCallback(() => {
    const steps: SetupStep[] = ['destinations', 'privacy', 'auto-withdraw', 'review'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  }, [currentStep]);

  /**
   * Submit the configuration
   */
  const handleSubmit = useCallback(async () => {
    try {
      const validDestinations = destinations
        .filter(d => d.trim() !== '')
        .map(d => new PublicKey(d.trim()));
      
      const thresholdLamports = autoWithdrawEnabled && autoWithdrawThreshold
        ? BigInt(Math.floor(parseFloat(autoWithdrawThreshold) * 1e9))
        : BigInt(0);
      
      await initializeConfig({
        vaultPubkey,
        destinations: validDestinations,
        preset: useCustomSettings ? undefined : selectedPreset,
        customSettings: useCustomSettings ? customSettings : undefined,
        autoWithdraw: {
          enabled: autoWithdrawEnabled,
          thresholdLamports,
        },
      });
      
      onComplete();
    } catch (err) {
      console.error('Failed to initialize config:', err);
    }
  }, [
    destinations,
    vaultPubkey,
    selectedPreset,
    useCustomSettings,
    customSettings,
    autoWithdrawEnabled,
    autoWithdrawThreshold,
    initializeConfig,
    onComplete,
  ]);

  /**
   * Get current settings (preset or custom)
   */
  const getCurrentSettings = useCallback(() => {
    if (useCustomSettings) {
      return customSettings;
    }
    return PRIVACY_PRESETS[selectedPreset];
  }, [useCustomSettings, customSettings, selectedPreset]);

  return (
    <div className="bg-hx-card-bg rounded-xl border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5">
        <h2 className="text-xl font-bold text-white">Configure Private Withdrawals</h2>
        <p className="text-sm text-white/50 mt-1">
          Set up encrypted destinations for maximum privacy
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="px-6 py-3 bg-black/20 border-b border-white/5">
        <div className="flex items-center gap-4">
          {(['destinations', 'privacy', 'auto-withdraw', 'review'] as SetupStep[]).map((step, i) => {
            const steps: SetupStep[] = ['destinations', 'privacy', 'auto-withdraw', 'review'];
            const currentIndex = steps.indexOf(currentStep);
            const isActive = step === currentStep;
            const isCompleted = i < currentIndex;
            
            return (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-hx-blue text-white'
                    : isCompleted
                      ? 'bg-hx-green/20 text-hx-green'
                      : 'bg-white/10 text-white/50'
                }`}>
                  {isCompleted ? '✓' : i + 1}
                </div>
                {i < 3 && (
                  <div className={`w-8 h-0.5 ml-2 ${
                    isCompleted ? 'bg-hx-green/50' : 'bg-white/10'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Step 1: Destinations */}
        {currentStep === 'destinations' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Destination Wallets</h3>
              <p className="text-sm text-white/50">
                Add up to 5 wallets where withdrawals will be sent. 
                These addresses are encrypted and never visible on-chain.
              </p>
            </div>

            <div className="space-y-3">
              {destinations.map((dest, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={dest}
                      onChange={(e) => updateDestination(i, e.target.value)}
                      placeholder="Solana wallet address"
                      className={`w-full px-4 py-3 bg-black/30 border rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 transition-all ${
                        destinationErrors[i]
                          ? 'border-red-500/50 focus:ring-red-500/50'
                          : 'border-white/10 focus:ring-hx-blue/50'
                      }`}
                    />
                    {destinationErrors[i] && (
                      <p className="text-xs text-red-400 mt-1">{destinationErrors[i]}</p>
                    )}
                  </div>
                  {destinations.length > 1 && (
                    <button
                      onClick={() => removeDestination(i)}
                      className="px-3 py-2 text-white/50 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {destinations.length < 5 && (
              <button
                onClick={addDestination}
                className="text-sm text-hx-blue hover:text-hx-blue/80 transition-colors"
              >
                + Add another destination
              </button>
            )}

            <div className="mt-4 p-4 bg-hx-blue/10 border border-hx-blue/20 rounded-lg">
              <p className="text-sm text-white/70">
                <span className="text-hx-blue font-medium">🔒 Privacy Note:</span> Destinations are 
                encrypted with MPC technology. The Arcium network collectively manages these addresses 
                without any single party knowing them.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Privacy Settings */}
        {currentStep === 'privacy' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Privacy Level</h3>
              <p className="text-sm text-white/50">
                Choose how withdrawals are split and timed for privacy.
              </p>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(PRIVACY_PRESETS) as PrivacyPreset[]).map((preset) => {
                const config = PRIVACY_PRESETS[preset];
                const isSelected = selectedPreset === preset && !useCustomSettings;
                
                return (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-hx-blue/20 border-hx-blue'
                        : 'bg-black/20 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className={`font-semibold capitalize ${isSelected ? 'text-hx-blue' : 'text-white'}`}>
                      {config.label}
                    </div>
                    <div className="text-xs text-white/50 mt-1">
                      {config.description}
                    </div>
                    <div className="text-xs text-white/30 mt-2">
                      {config.minSplits}-{config.maxSplits} splits
                    </div>
                    <div className="text-xs text-white/30">
                      {formatDuration(config.minDelaySeconds)} - {formatDuration(config.maxDelaySeconds)}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setUseCustomSettings(!useCustomSettings)}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                  useCustomSettings
                    ? 'bg-hx-blue border-hx-blue'
                    : 'border-white/30 hover:border-white/50'
                }`}
              >
                {useCustomSettings && <span className="text-white text-xs">✓</span>}
              </button>
              <span className="text-sm text-white/70">Use custom settings</span>
            </div>

            {/* Custom Settings */}
            {useCustomSettings && (
              <div className="space-y-4 p-4 bg-black/20 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/50 block mb-1">Min Splits</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={customSettings.minSplits}
                      onChange={(e) => setCustomSettings(s => ({ ...s, minSplits: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 block mb-1">Max Splits</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={customSettings.maxSplits}
                      onChange={(e) => setCustomSettings(s => ({ ...s, maxSplits: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/50 block mb-1">Min Delay (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      value={Math.round(customSettings.minDelaySeconds / 60)}
                      onChange={(e) => setCustomSettings(s => ({ ...s, minDelaySeconds: (parseInt(e.target.value) || 1) * 60 }))}
                      className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 block mb-1">Max Delay (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      value={Math.round(customSettings.maxDelaySeconds / 60)}
                      onChange={(e) => setCustomSettings(s => ({ ...s, maxDelaySeconds: (parseInt(e.target.value) || 1) * 60 }))}
                      className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Auto-Withdraw */}
        {currentStep === 'auto-withdraw' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Automatic Withdrawals</h3>
              <p className="text-sm text-white/50">
                Optionally enable automatic withdrawals when your vault reaches a threshold.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoWithdrawEnabled(!autoWithdrawEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  autoWithdrawEnabled ? 'bg-hx-green' : 'bg-white/20'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  autoWithdrawEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
              <span className="text-white/70">Enable auto-withdraw</span>
            </div>

            {autoWithdrawEnabled && (
              <div className="p-4 bg-black/20 rounded-lg space-y-3">
                <div>
                  <label className="text-xs text-white/50 block mb-1">Threshold (SOL)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={autoWithdrawThreshold}
                    onChange={(e) => setAutoWithdrawThreshold(e.target.value)}
                    placeholder="e.g., 1.0"
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30"
                  />
                </div>
                <p className="text-xs text-white/40">
                  When vault balance exceeds this amount, MPC will automatically initiate a withdrawal.
                </p>
              </div>
            )}

            <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <p className="text-sm text-white/70">
                <span className="text-orange-400 font-medium">⚡ Note:</span> Auto-withdrawals are 
                processed by the MPC cluster. You&apos;ll receive funds at your configured destinations 
                without needing to take any action.
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 'review' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Review Configuration</h3>
              <p className="text-sm text-white/50">
                Review your settings before saving.
              </p>
            </div>

            <div className="space-y-3">
              {/* Destinations */}
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="text-xs text-white/50 mb-2">Destinations</div>
                <div className="space-y-1">
                  {destinations.filter(d => d.trim()).map((dest, i) => (
                    <div key={i} className="text-sm text-white font-mono truncate">
                      {dest}
                    </div>
                  ))}
                </div>
              </div>

              {/* Privacy Settings */}
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="text-xs text-white/50 mb-2">Privacy Level</div>
                <div className="text-white font-medium capitalize">
                  {useCustomSettings ? 'Custom' : PRIVACY_PRESETS[selectedPreset].label}
                </div>
                <div className="text-sm text-white/50 mt-1">
                  {getCurrentSettings().minSplits}-{getCurrentSettings().maxSplits} splits, {' '}
                  {formatDuration(getCurrentSettings().minDelaySeconds)} - {formatDuration(getCurrentSettings().maxDelaySeconds)} delays
                </div>
              </div>

              {/* Auto-Withdraw */}
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="text-xs text-white/50 mb-2">Auto-Withdraw</div>
                <div className="text-white">
                  {autoWithdrawEnabled ? (
                    <span>Enabled at {autoWithdrawThreshold || '0'} SOL threshold</span>
                  ) : (
                    <span className="text-white/50">Disabled</span>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/5 flex justify-between">
        <button
          onClick={currentStep === 'destinations' ? onCancel : prevStep}
          className="px-4 py-2 text-white/70 hover:text-white transition-colors"
          disabled={isLoading}
        >
          {currentStep === 'destinations' ? 'Cancel' : 'Back'}
        </button>
        
        {currentStep === 'review' ? (
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-6 py-2 bg-hx-green text-black font-semibold rounded-lg hover:bg-hx-green/90 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Encrypting...' : 'Save Configuration'}
          </button>
        ) : (
          <button
            onClick={nextStep}
            className="px-6 py-2 bg-hx-blue text-white font-semibold rounded-lg hover:bg-hx-blue/90 transition-colors"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

