'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/Header';
import { ClientOnly } from '@/components/ClientOnly';
import { useHydentity } from '@/hooks/useHydentity';

type ClaimStep = 'select' | 'configure' | 'preview' | 'processing' | 'complete';

interface SplitPreview {
  amount: string;
  delay: number;
}

export default function ClaimPage() {
  const { connected, publicKey } = useWallet();
  const { vaults, executeClaim, isLoading } = useHydentity();
  
  const [step, setStep] = useState<ClaimStep>('select');
  const [selectedVault, setSelectedVault] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [useOwnWallet, setUseOwnWallet] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [splitPreview, setSplitPreview] = useState<SplitPreview[]>([]);
  const [progress, setProgress] = useState(0);
  const [completedSplits, setCompletedSplits] = useState(0);

  // Mock split preview generation
  const generatePreview = () => {
    const amountLamports = parseFloat(amount) * 1e9;
    const splits: SplitPreview[] = [];
    const numSplits = Math.floor(Math.random() * 3) + 2;
    let remaining = amountLamports;
    
    for (let i = 0; i < numSplits; i++) {
      const isLast = i === numSplits - 1;
      const splitAmount = isLast ? remaining : Math.floor(remaining * (0.2 + Math.random() * 0.3));
      remaining -= splitAmount;
      
      splits.push({
        amount: (splitAmount / 1e9).toFixed(4),
        delay: i === 0 ? 0 : Math.floor(Math.random() * 300) + 30,
      });
    }
    
    setSplitPreview(splits);
    setStep('preview');
  };

  const handleConfigure = () => {
    if (!selectedVault) {
      setError('Please select a vault');
      return;
    }
    setError(null);
    setStep('configure');
  };

  const handleClaim = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    const dest = useOwnWallet && publicKey ? publicKey.toBase58() : destination;
    if (!dest) {
      setError('Please enter a destination address');
      return;
    }

    try {
      new PublicKey(dest);
    } catch {
      setError('Invalid destination address');
      return;
    }

    setError(null);
    generatePreview();
  };

  const executeClaimProcess = async () => {
    setStep('processing');
    setProgress(0);
    setCompletedSplits(0);

    try {
      for (let i = 0; i < splitPreview.length; i++) {
        if (i > 0) {
          const delay = splitPreview[i].delay * 1000;
          const steps = 10;
          for (let j = 0; j < steps; j++) {
            await new Promise(resolve => setTimeout(resolve, delay / steps));
            setProgress(((i * steps + j) / (splitPreview.length * steps)) * 100);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        setCompletedSplits(i + 1);
        setProgress(((i + 1) / splitPreview.length) * 100);
      }

      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute claim');
      setStep('preview');
    }
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
            Connect your wallet to claim funds privately.
          </p>
          <ClientOnly fallback={<div className="h-10 w-40 bg-hx-card-bg rounded-lg animate-pulse mx-auto" />}>
            <WalletMultiButton />
          </ClientOnly>
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
          <h1 className="text-2xl font-bold mb-2 text-hx-white">
            Private Claim
          </h1>
          <p className="text-sm text-hx-text">
            Claim your vault funds through the privacy mixer.
          </p>
        </motion.div>

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

        <div className="glass rounded-xl p-6">
          <AnimatePresence mode="wait">
            {step === 'select' && (
              <motion.div
                key="select"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-lg font-semibold mb-4 text-hx-white">Select Vault</h2>
                
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => (
                      <div key={i} className="bg-hx-bg rounded-lg p-4 animate-pulse">
                        <div className="h-4 bg-vault-accent rounded w-1/3 mb-2"></div>
                        <div className="h-6 bg-vault-accent rounded w-1/2"></div>
                      </div>
                    ))}
                  </div>
                ) : vaults.length > 0 ? (
                  <div className="space-y-3">
                    {vaults.map(vault => (
                      <button
                        key={vault.domain}
                        onClick={() => setSelectedVault(vault.domain)}
                        className={`w-full text-left bg-hx-bg rounded-lg p-4 border-2 transition-all ${
                          selectedVault === vault.domain 
                            ? 'border-hx-green' 
                            : 'border-transparent hover:border-vault-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-hx-white">{vault.domain}.sol</p>
                            <p className="text-xs text-hx-text">
                              {(Number(vault.balance) / 1e9).toFixed(4)} SOL
                            </p>
                          </div>
                          {selectedVault === vault.domain && (
                            <div className="w-5 h-5 rounded-full bg-hx-green flex items-center justify-center">
                              <svg className="w-3 h-3 text-hx-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-hx-text text-sm mb-4">No vaults found</p>
                    <a href="/setup" className="text-hx-green text-sm hover:underline">
                      Create a vault first →
                    </a>
                  </div>
                )}

                {vaults.length > 0 && (
                  <button
                    onClick={handleConfigure}
                    disabled={!selectedVault}
                    className="w-full mt-6 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                )}
              </motion.div>
            )}

            {step === 'configure' && (
              <motion.div
                key="configure"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-lg font-semibold mb-4 text-hx-white">Configure Claim</h2>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs text-hx-text mb-2 uppercase tracking-wider">
                      Amount (SOL)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.0000"
                      className="w-full bg-hx-bg border border-vault-border rounded-lg px-4 py-3 focus:outline-none focus:border-hx-green"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-hx-text mb-2 uppercase tracking-wider">
                      Destination
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer p-3 bg-hx-bg rounded-lg border border-vault-border hover:border-hx-green/30 transition-colors">
                        <input
                          type="radio"
                          checked={useOwnWallet}
                          onChange={() => setUseOwnWallet(true)}
                          className="w-4 h-4 accent-hx-green"
                        />
                        <span className="text-sm text-hx-white">My connected wallet</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer p-3 bg-hx-bg rounded-lg border border-vault-border hover:border-hx-green/30 transition-colors">
                        <input
                          type="radio"
                          checked={!useOwnWallet}
                          onChange={() => setUseOwnWallet(false)}
                          className="w-4 h-4 accent-hx-green"
                        />
                        <span className="text-sm text-hx-white">Custom address</span>
                      </label>
                    </div>
                    
                    {!useOwnWallet && (
                      <input
                        type="text"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="Enter Solana address"
                        className="w-full mt-3 bg-hx-bg border border-vault-border rounded-lg px-4 py-3 font-mono text-xs focus:outline-none focus:border-hx-green"
                      />
                    )}
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setStep('select')}
                    className="flex-1 py-3 bg-vault-card border border-vault-border rounded-lg font-semibold text-hx-text hover:border-hx-green/50 transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleClaim}
                    className="flex-1 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all"
                  >
                    Preview Claim
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'preview' && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-lg font-semibold mb-4 text-hx-white">Execution Plan</h2>
                
                <div className="bg-hx-bg rounded-lg p-4 mb-4">
                  <p className="text-xs text-hx-text mb-3">
                    Your claim will be split into {splitPreview.length} transactions:
                  </p>
                  
                  <div className="space-y-2">
                    {splitPreview.map((split, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-vault-border last:border-0">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-hx-green/20 flex items-center justify-center text-xs font-semibold text-hx-green">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-hx-white">{split.amount} SOL</p>
                            {split.delay > 0 && (
                              <p className="text-[10px] text-hx-text">
                                After {split.delay}s delay
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-hx-green text-xs">→</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
                  <p className="text-xs text-yellow-400">
                    ⚠️ Gas fees will be deducted from each split via relayer.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('configure')}
                    className="flex-1 py-3 bg-vault-card border border-vault-border rounded-lg font-semibold text-hx-text hover:border-hx-green/50 transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={executeClaimProcess}
                    className="flex-1 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all"
                  >
                    Execute Claim
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-6"
              >
                <h2 className="text-lg font-semibold mb-4 text-hx-white">Executing Claim</h2>
                
                <div className="relative w-24 h-24 mx-auto mb-4">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="#1E2428"
                      strokeWidth="6"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="#97f01d"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${progress * 2.64} 264`}
                      className="transition-all duration-300"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold text-hx-white">{Math.round(progress)}%</span>
                  </div>
                </div>
                
                <p className="text-sm text-hx-text mb-4">
                  Completed {completedSplits} of {splitPreview.length} splits
                </p>
                
                <div className="space-y-1">
                  {splitPreview.map((split, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-center gap-2 text-xs ${
                        i < completedSplits ? 'text-hx-green' :
                        i === completedSplits ? 'text-hx-white' : 'text-hx-text'
                      }`}
                    >
                      {i < completedSplits ? (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : i === completedSplits ? (
                        <div className="w-3 h-3 border-2 border-hx-green border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-hx-text" />
                      )}
                      Split {i + 1}: {split.amount} SOL
                    </div>
                  ))}
                </div>
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
                <h2 className="text-lg font-semibold mb-2 text-hx-white">Claim Complete!</h2>
                <p className="text-sm text-hx-text mb-4">
                  {amount} SOL claimed privately through {splitPreview.length} splits.
                </p>
                
                <div className="mt-6">
                  <a
                    href="/"
                    className="inline-block px-6 py-3 bg-hx-green text-hx-bg rounded-lg font-semibold hover:bg-[#a8f740] transition-all"
                  >
                    Back to Dashboard
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
