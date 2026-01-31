'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDevnetDomainRegistration } from '@/hooks/useDevnetDomainRegistration';
import { useSnsDomains } from '@/hooks/useSnsDomains';

interface DevnetDomainRegistrationProps {
  onDomainRegistered?: (domain: string) => void;
}

export function DevnetDomainRegistration({
  onDomainRegistered,
}: DevnetDomainRegistrationProps) {
  const [domainLabel, setDomainLabel] = useState('');
  const [showRegistration, setShowRegistration] = useState(false);
  const { registerDomain, isRegistering, error, txSignature, reset } =
    useDevnetDomainRegistration();
  const { refetch } = useSnsDomains();

  const handleRegister = async () => {
    if (!domainLabel.trim()) {
      return;
    }

    try {
      reset();
      const signature = await registerDomain(domainLabel.trim());
      
      // Refetch domains to include the newly registered one
      await refetch();
      
      // Notify parent component
      if (onDomainRegistered) {
        onDomainRegistered(`${domainLabel.trim()}.sol`);
      }
      
      // Reset form after successful registration
      setDomainLabel('');
      setShowRegistration(false);
    } catch (err) {
      // Error is already set by the hook
      console.error('Registration failed:', err);
    }
  };

  const handleClose = () => {
    setShowRegistration(false);
    setDomainLabel('');
    reset();
  };

  if (!showRegistration) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4"
      >
        <button
          onClick={() => setShowRegistration(true)}
          className="w-full px-4 py-3 bg-hx-green/10 hover:bg-hx-green/20 border border-hx-green/30 hover:border-hx-green/50 rounded-lg text-hx-green text-sm font-medium transition-all flex items-center justify-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Register New Domain on Devnet
        </button>
        <p className="text-xs text-hx-text/60 mt-2 text-center">
          Register a .sol domain directly on devnet for testing
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mt-4 glass rounded-xl p-5 border border-hx-text/10"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-hx-white">
          Register Devnet Domain
        </h3>
        <button
          onClick={handleClose}
          className="text-hx-text/60 hover:text-hx-white transition-colors"
          disabled={isRegistering}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <p className="text-xs text-hx-text/60 mb-4">
        Register a new .sol domain on devnet. This is perfect for hackathon
        demos and testing. The registration will cost approximately 0.05 SOL
        (wrapped as wSOL).
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-hx-text mb-2 uppercase tracking-wider">
            Domain Label
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={domainLabel}
              onChange={(e) => setDomainLabel(e.target.value.toLowerCase())}
              placeholder="hydentity"
              disabled={isRegistering}
              className="flex-1 px-4 py-2.5 bg-hx-bg border border-hx-text/20 rounded-lg text-hx-white placeholder-hx-text/40 focus:outline-none focus:border-hx-green/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              pattern="[a-z0-9-]+"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isRegistering && domainLabel.trim()) {
                  handleRegister();
                }
              }}
            />
            <span className="text-hx-text/60 text-sm">.sol</span>
          </div>
          <p className="text-xs text-hx-text/50 mt-1.5">
            Only letters, numbers, and hyphens allowed
          </p>
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Message */}
        <AnimatePresence>
          {txSignature && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 bg-hx-green/10 border border-hx-green/30 rounded-lg"
            >
              <p className="text-hx-green text-sm font-medium mb-1">
                Domain registered successfully!
              </p>
              <a
                href={`https://orbmarkets.io/tx/${txSignature}?cluster=devnet&tab=summary`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-hx-green/80 hover:text-hx-green underline break-all"
              >
                View Transaction
              </a>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleRegister}
            disabled={!domainLabel.trim() || isRegistering}
            className="flex-1 px-4 py-2.5 bg-hx-green hover:bg-hx-green/80 disabled:bg-hx-text/20 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            {isRegistering ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Registering...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Register Domain
              </>
            )}
          </button>
          <button
            onClick={handleClose}
            disabled={isRegistering}
            className="px-4 py-2.5 bg-hx-bg hover:bg-hx-text/10 border border-hx-text/20 text-hx-text rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}
