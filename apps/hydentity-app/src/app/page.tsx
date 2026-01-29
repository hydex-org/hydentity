'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { VaultCard } from '@/components/VaultCard';
import { ClientOnly } from '@/components/ClientOnly';
import { useHydentity } from '@/hooks/useHydentity';
import { usePrivacyCash } from '@/hooks/usePrivacyCash';

export default function Home() {
  const { connected } = useWallet();
  const { vaults, isLoading, debugFetchAllVaults, lookupVaultByDomain } = useHydentity();
  const { balance: privacyCashBalance, isInitialized: privacyCashInitialized } = usePrivacyCash();
  const [showLookup, setShowLookup] = useState(false);
  const [lookupDomain, setLookupDomain] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!lookupDomain.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    try {
      const vault = await lookupVaultByDomain(lookupDomain);
      if (vault) {
        setShowLookup(false);
        setLookupDomain('');
      } else {
        setLookupError('Vault not found for this domain. Check the console for details.');
      }
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-hx-bg">
      <Header />
      
      <div className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <motion.section 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-6xl font-bold mb-6 text-hx-white">
            Private Receiving
            <br />
            <span className="text-gradient">for Your .sol Domain</span>
          </h1>
          <p className="text-lg text-hx-text max-w-xl mx-auto mb-8">
            Accept SOL and tokens through your SNS domain while keeping your 
            primary wallet private. Powered by Arcium.
          </p>
          
          <ClientOnly>
            {!connected && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                <WalletMultiButton />
              </motion.div>
            )}
          </ClientOnly>
        </motion.section>

        {/* Connected State */}
        <ClientOnly>
          {connected && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* Tab Navigation */}
              <div className="flex justify-center mb-8">
                <div className="inline-flex bg-hx-card-bg rounded-lg p-1">
                  <TabButton active>Dashboard</TabButton>
                  <Link href="/claim">
                    <TabButton>Claim</TabButton>
                  </Link>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex justify-center gap-4 mb-12">
                <Link href="/setup">
                  <motion.button
                    className="px-8 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Setup New Vault
                  </motion.button>
                </Link>
                <Link href="/claim">
                  <motion.button
                    className="px-8 py-3 bg-hx-card-bg border border-hx-text/20 text-hx-text rounded-lg font-semibold hover:border-hx-green/50 hover:text-hx-white transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Claim Funds
                  </motion.button>
                </Link>
              </div>

              {/* Vaults Grid */}
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-hx-white">
                    Your Vaults
                  </h2>
                  <div className="flex gap-2">
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

        {/* Features Section */}
        <ClientOnly>
          {!connected && (
            <motion.section 
              className="grid md:grid-cols-3 gap-6 mt-16"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <FeatureCard
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
                title="Private Receiving"
                description="Senders use your .sol domain. Your main wallet stays hidden."
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                }
                title="Powered by Arcium & Privacy Cash"
                description="Funds are routed through Privacy Cash via Arcium encrypted compute."
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                }
                title="Smart Splitting"
                description="Automatic amount splitting and delay randomization."
              />
            </motion.section>
          )}
        </ClientOnly>
      </div>

      {/* Find My Vault Modal */}
      {showLookup && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-hx-bg rounded-xl p-6 max-w-md w-full border border-hx-text/20 shadow-2xl"
          >
            <h3 className="text-xl font-semibold text-hx-white mb-4">
              Find My Vault
            </h3>

            <p className="text-hx-text text-sm mb-4">
              If your vault isn&apos;t showing up automatically, enter the domain name to look it up directly.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-hx-white mb-2">
                Domain Name
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={lookupDomain}
                  onChange={(e) => setLookupDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="mydomain"
                  className="flex-1 px-4 py-3 bg-hx-bg border border-hx-text/20 rounded-lg text-hx-white font-mono text-sm focus:outline-none focus:border-hx-green"
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                />
                <span className="text-hx-green font-medium">.sol</span>
              </div>
            </div>

            {lookupError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400">{lookupError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowLookup(false);
                  setLookupDomain('');
                  setLookupError(null);
                }}
                className="flex-1 px-4 py-2.5 bg-hx-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLookup}
                disabled={!lookupDomain.trim() || lookupLoading}
                className="flex-1 px-4 py-2.5 bg-hx-green text-hx-bg rounded-lg font-medium hover:bg-hx-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {lookupLoading ? 'Searching...' : 'Find Vault'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}

function TabButton({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
        active 
          ? 'bg-hx-bg text-hx-white' 
          : 'text-hx-text hover:text-hx-white'
      }`}
    >
      {children}
    </button>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <motion.div 
      className="bg-hx-card-bg rounded-xl p-6 border border-hx-text/10 hover:border-hx-green/20 transition-colors"
      whileHover={{ y: -2 }}
    >
      <div className="w-10 h-10 rounded-lg bg-hx-green/10 flex items-center justify-center text-hx-green mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold mb-2 text-hx-white">{title}</h3>
      <p className="text-sm text-hx-text">{description}</p>
    </motion.div>
  );
}
