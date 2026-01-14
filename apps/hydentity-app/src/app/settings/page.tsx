'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';
import { Header } from '@/components/Header';

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
  const { connected, publicKey } = useWallet();
  const [network, setNetwork] = useState<'devnet' | 'mainnet'>('devnet');
  
  // Privacy settings state - default to MEDIUM
  const [preset, setPreset] = useState<PrivacyPreset>('medium');
  const [minSplits, setMinSplits] = useState(PRIVACY_PRESETS.medium.minSplits);
  const [maxSplits, setMaxSplits] = useState(PRIVACY_PRESETS.medium.maxSplits);
  const [minDelayValue, setMinDelayValue] = useState(5);
  const [minDelayUnit, setMinDelayUnit] = useState<'mins' | 'hours' | 'days'>('mins');
  const [maxDelayValue, setMaxDelayValue] = useState(30);
  const [maxDelayUnit, setMaxDelayUnit] = useState<'mins' | 'hours' | 'days'>('mins');
  const [usePrivacyCash, setUsePrivacyCash] = useState(false);
  
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
                onClick={() => setNetwork('mainnet')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  network === 'mainnet'
                    ? 'border-hx-green bg-hx-green/10'
                    : 'border-vault-border hover:border-vault-accent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    network === 'mainnet' ? 'bg-hx-green' : 'bg-hx-text'
                  }`} />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-hx-white">Mainnet</p>
                    <p className="text-[10px] text-hx-text">Production</p>
                  </div>
                </div>
              </button>
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

          {/* Privacy Defaults */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl p-5"
          >
            <h2 className="text-base font-semibold mb-4 text-hx-white">Default Claim Settings</h2>
            <p className="text-xs text-hx-text mb-4">
              Controls how funds are withdrawn from Umbra to your private wallet.
              Splits and delays are applied <span className="text-hx-green">after</span> the Umbra mixer to maximize unlinkability.
            </p>
            
            {/* Privacy Flow Diagram */}
            <div className="bg-hx-bg/50 rounded-lg p-3 mb-5 text-[10px] font-mono text-hx-text">
              <div className="flex items-center gap-2 justify-center">
                <span>Vault</span>
                <span className="text-hx-green">══►</span>
                <span>Umbra</span>
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
                  Number of separate withdrawals from Umbra: <span className="text-hx-white font-medium">{minSplits} – {maxSplits}</span>
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

            {/* Privacy Cash Routing Toggle */}
            <div className="mt-6 pt-6 border-t border-vault-border">
              <label className="block text-[10px] text-hx-text mb-3 uppercase tracking-wider">
                Withdrawal Routing
              </label>
              <div className="flex items-center justify-between p-4 bg-hx-bg/50 rounded-lg border border-vault-border">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-hx-white mb-1">
                    Privacy Cash Routing
                  </div>
                  <div className="text-[10px] text-hx-text/60">
                    Route withdrawals through Privacy Cash ZK pool instead of Arcium splits
                  </div>
                </div>
                <button
                  onClick={() => setUsePrivacyCash(!usePrivacyCash)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    usePrivacyCash ? 'bg-hx-green' : 'bg-hx-text/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      usePrivacyCash ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <button className="w-full mt-6 py-2.5 bg-hx-green/10 border border-hx-green rounded-lg font-semibold text-sm text-hx-green hover:bg-hx-green/20 transition-all">
              Save Defaults
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
