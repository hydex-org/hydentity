'use client';

import { useState, useRef, useEffect } from 'react';
import { useNetwork } from '@/contexts/NetworkContext';
import { NetworkType } from '@/config/networks';

const NETWORK_OPTIONS: { value: NetworkType; label: string; color: string }[] = [
  { value: 'devnet', label: 'Devnet', color: '#00A8FF' },
  { value: 'mainnet-beta', label: 'Mainnet', color: '#97f01d' },
];

export function NetworkSwitcher() {
  const { network, setNetwork, config } = useNetwork();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentNetwork = NETWORK_OPTIONS.find((n) => n.value === network) || NETWORK_OPTIONS[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNetworkChange = (newNetwork: NetworkType) => {
    setNetwork(newNetwork);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-hx-card-bg rounded-lg border border-hx-text/10 hover:border-hx-text/30 transition-colors"
        title={`Current network: ${currentNetwork.label}`}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: currentNetwork.color }}
        />
        <span className="text-sm font-medium text-hx-white">
          {currentNetwork.label}
        </span>
        <svg
          className={`w-4 h-4 text-hx-text transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-hx-bg border border-hx-text/20 rounded-lg shadow-xl overflow-hidden z-50">
          <div className="p-2">
            <p className="text-[10px] text-hx-text uppercase tracking-wider px-2 mb-1">
              Select Network
            </p>
            {NETWORK_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleNetworkChange(option.value)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  network === option.value
                    ? 'bg-hx-green/10 text-hx-white'
                    : 'text-hx-text hover:bg-hx-text/10 hover:text-hx-white'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
                <span className="text-sm font-medium">{option.label}</span>
                {network === option.value && (
                  <svg
                    className="w-4 h-4 ml-auto text-hx-green"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Feature indicators */}
          <div className="border-t border-hx-text/10 p-2 bg-hx-bg/50">
            <p className="text-[9px] text-hx-text uppercase tracking-wider px-2 mb-1">
              Features on {currentNetwork.label}
            </p>
            <div className="flex flex-wrap gap-1 px-2">
              {config.features.mpcWithdrawals && (
                <span className="px-1.5 py-0.5 bg-hx-blue/10 text-hx-blue text-[9px] rounded">
                  MPC
                </span>
              )}
              {config.features.privacyCashRouting && (
                <span className="px-1.5 py-0.5 bg-hx-purple/10 text-hx-purple text-[9px] rounded">
                  Privacy Cash
                </span>
              )}
              {config.features.directWithdrawals && (
                <span className="px-1.5 py-0.5 bg-hx-green/10 text-hx-green text-[9px] rounded">
                  Direct
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
