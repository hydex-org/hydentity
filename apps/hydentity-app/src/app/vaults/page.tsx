"use client";

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { VaultCard } from '@/components/VaultCard';
import { ClientOnly } from '@/components/ClientOnly';
import { useHydentity } from '@/hooks/useHydentity';
import { usePrivacyCash } from '@/hooks/usePrivacyCash';

export default function Page() {
  const { connected } = useWallet();
  const { vaults, isLoading, debugFetchAllVaults, lookupVaultByDomain } = useHydentity();
  const { balance: privacyCashBalance, isInitialized: privacyCashInitialized } = usePrivacyCash();
  const [showLookup, setShowLookup] = useState(false);
  const [lookupDomain, setLookupDomain] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  
  return (
    <main className="min-h-screen bg-hx-bg">
      <Header />
      <ClientOnly>
        {connected && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
  
            {/* Vaults Grid */}
            <div className="max-w-4xl mx-auto mt-10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-hx-white">
                  Your Vaults
                </h2>
                <div className="flex gap-2">
                  <Link href="/setup">
                    <button
                      className="px-3 py-1.5 text-xs bg-hx-green border border-hx-green/30 text-hx-bg rounded hover:bg-[#a8f740] transition-colors"
                    >
                      Setup New Vault
                    </button>
                  </Link>
                  <Link href="/claim">
                    <motion.button
                      className="px-3 py-1.5 text-xs bg-hx-green/10 border border-hx-green/30 text-hx-green rounded hover:bg-hx-green/20 transition-colors"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Claim Funds
                    </motion.button>
                  </Link>
                  
                  <button
                    onClick={() => setShowLookup(true)}
                    className="px-3 py-1.5 text-xs bg-hx-green/10 border border-hx-green/30 text-hx-green rounded hover:bg-hx-green/20 transition-colors"
                  >
                    Find My Vault
                  </button>
                  <button
                    onClick={() => {
                      debugFetchAllVaults().then((count) => {
                        alert(`Found ${count} vault(s) on-chain. Check browser console for details.`);
                      });
                    }}
                    className="px-3 py-1.5 text-xs bg-hx-card-bg border border-hx-text/20 text-hx-text rounded hover:border-hx-green/50 transition-colors"
                  >
                    Debug
                  </button>
                </div>
              </div>
              
              {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-hx-card-bg rounded-2xl p-6 animate-pulse border border-hx-text/10">
                      <div className="h-5 bg-hx-bg rounded w-1/3 mb-4"></div>
                      <div className="h-8 bg-hx-bg rounded w-1/2 mb-2"></div>
                      <div className="h-4 bg-hx-bg rounded w-2/3"></div>
                    </div>
                  ))}
                </div>
              ) : vaults.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {vaults.map((vault, index) => (
                    <motion.div
                      key={vault.domain}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.3 }}
                    >
                      <VaultCard
                        vault={vault}
                        privateCashBalance={privacyCashInitialized ? privacyCashBalance?.sol : null}
                      />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <motion.div
                  className="bg-hx-card-bg rounded-2xl p-12 text-center border border-hx-text/10"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-hx-green/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-hx-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-hx-white">No Vaults Yet</h3>
                  <p className="text-hx-text mb-6 text-sm">
                    Create your first privacy vault for a .sol domain to start receiving privately.
                  </p>
                  <Link href="/setup">
                    <button className="px-6 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all">
                      Create Vault
                    </button>
                  </Link>
                </motion.div>
              )}
            </div>
          </motion.section>
        )}
      </ClientOnly>
    </main>
  )
}