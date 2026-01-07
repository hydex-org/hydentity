'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { VaultCard } from '@/components/VaultCard';
import { ClientOnly } from '@/components/ClientOnly';
import { useHydentity } from '@/hooks/useHydentity';

export default function Home() {
  const { connected } = useWallet();
  const { vaults, isLoading } = useHydentity();

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
            primary wallet private. Powered by Umbra Protocol.
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
                <h2 className="text-xl font-semibold mb-6 text-hx-white">
                  Your Vaults
                </h2>
                
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
                        <VaultCard vault={vault} />
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

              {/* Stats Section */}
              <div className="max-w-4xl mx-auto mt-12 grid grid-cols-2 gap-4">
                <div className="bg-hx-card-bg rounded-xl p-6 border border-hx-text/10">
                  <p className="text-sm text-hx-text mb-1">Total Staked</p>
                  <p className="text-2xl font-bold text-hx-white">0.00 SOL</p>
                </div>
                <div className="bg-hx-card-bg rounded-xl p-6 border border-hx-text/10">
                  <p className="text-sm text-hx-text mb-1">Current APY</p>
                  <p className="text-2xl font-bold text-hx-green">0.00%</p>
                </div>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
                title="Gas Abstraction"
                description="Claim funds without holding SOL using relayer services."
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
