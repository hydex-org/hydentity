'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { VaultCard } from '@/components/VaultCard';
import { ClientOnly } from '@/components/ClientOnly';
import { useVaults } from '@/hooks/useVaults';
import { useNetwork } from '@/contexts/NetworkContext';

function AnimatedHero({ connected }: { connected: boolean }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timings = [800, 3000, 3000, 3000, 800];
    if (phase < 5) {
      const timer = setTimeout(() => setPhase(p => p + 1), timings[phase]);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  return (
    <div className="text-center mb-16 min-h-[320px] flex flex-col items-center justify-center">
      <AnimatePresence mode="wait">
        {phase < 4 ? (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-lg mx-auto relative"
          >
            <div className="bg-[#1a1a24] rounded-2xl border border-hx-text/20 overflow-hidden shadow-2xl">
              <div className="bg-[#12121a] px-5 py-4 flex items-center gap-3 border-b border-hx-text/10">
                <div className="w-3.5 h-3.5 rounded-full bg-red-500/80"></div>
                <div className="w-3.5 h-3.5 rounded-full bg-yellow-500/80"></div>
                <div className="w-3.5 h-3.5 rounded-full bg-green-500/80"></div>
                <span className="ml-2 text-sm text-hx-text/60">Messages</span>
              </div>
              <div className="p-6 space-y-4 min-h-[180px]">
                <AnimatePresence>
                  {phase >= 1 && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex justify-start"
                    >
                      <div className="bg-hx-text/10 rounded-2xl rounded-bl-md px-5 py-3 max-w-[85%]">
                        <p className="text-base text-hx-white">Yo, send me your .sol</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {phase >= 2 && (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex justify-end"
                    >
                      <div className="bg-hx-purple/80 rounded-2xl rounded-br-md px-5 py-3 max-w-[85%]">
                        <p className="text-base text-white">
                          NP, it&apos;s <span className="text-blue-400 underline underline-offset-2 cursor-pointer hover:text-blue-300">my-entire-financial-history.sol</span>
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <AnimatePresence>
              {phase >= 3 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  transition={{ duration: 0.4, type: "spring", bounce: 0.4 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl"
                >
                  <div className="text-center">
                    <span className="inline-block px-8 py-3 bg-red-500/30 border-2 border-red-500/60 rounded-full text-red-400 font-bold text-xl md:text-2xl tracking-wide shadow-lg">
                      STOP doing this
                    </span>
                    <p className="mt-3 text-hx-text text-sm">Keep your finances private.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="final"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full"
          >
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0, duration: 0.4 }}
              className="text-3xl md:text-5xl font-bold mb-6 text-hx-white"
            >
              Keep your finances private.
            </motion.h1>
            <AnimatePresence>
              {phase >= 5 && (
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="text-xl md:text-2xl text-hx-text mb-8"
                >
                  <span className="text-hx-green font-mono">&lt;route&gt;</span>
                  <span className="text-hx-white"> your SOL through </span>
                  <span className="text-gradient font-semibold">Hydex Router</span>
                </motion.p>
              )}
            </AnimatePresence>
            <ClientOnly>
              {!connected && phase >= 5 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                >
                  <WalletMultiButton />
                </motion.div>
              )}
            </ClientOnly>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  const { connected } = useWallet();
  const { vaults, pools, isLoading } = useVaults();
  const { config } = useNetwork();
  const programId = new PublicKey(config.routerProgramId);

  return (
    <main className="min-h-screen bg-hx-bg">
      <Header />

      <div className="container mx-auto px-4 py-12">
        <AnimatedHero connected={connected} />

        {/* Connected: Vault list */}
        <ClientOnly>
          {connected && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex justify-center gap-4 mb-12">
                <Link href="/vault/new">
                  <motion.button
                    className="px-8 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Create New Vault
                  </motion.button>
                </Link>
              </div>

              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-hx-white">Your Vaults</h2>
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
                        key={vault.pubkey.toBase58()}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.3 }}
                      >
                        <VaultCard
                          vault={vault}
                          pool={pools.get(vault.poolAddress.toBase58())}
                          programId={programId}
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
                      Create your first privacy vault to start routing SOL through Hydex Router.
                    </p>
                    <Link href="/vault/new">
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

        {/* Disconnected: Features */}
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
                title="Private Vaults"
                description="Create wallet-based vaults with encrypted destinations. Anyone can deposit, only you can withdraw."
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                }
                title="MPC Encrypted Routing"
                description="Arcium MPC encrypts your destination. Automated cranks handle withdrawals — no manual claims."
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                }
                title="Liquidity Pooling"
                description="Funds pool with other vaults for privacy. Regime-based liquidity adapts to volume automatically."
              />
            </motion.section>
          )}
        </ClientOnly>
      </div>
    </main>
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
