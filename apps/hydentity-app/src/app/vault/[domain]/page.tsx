'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useHydentity, VaultInfo } from '@/hooks/useHydentity';
import { ClientOnly } from '@/components/ClientOnly';
import { usePrivacyCash } from '@/hooks/usePrivacyCash';
import { useNetwork, useNetworkType } from '@/contexts/NetworkContext';
import { getExplorerTxUrl } from '@/config/networks';

export default function VaultDetailPage() {
  return (
    <ClientOnly>
      <VaultDetailContent />
    </ClientOnly>
  );
}

function VaultDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { connection } = useConnection();
  const domain = params.domain as string;

  const {
    vaults,
    isLoading,
    connected,
    publicKey,
    transferDomainToVault,
    reclaimDomain,
    withdrawDirect,
    registerDomainForVault,
    fetchVaults,
    syncDomainTransferState,
    closeVault,
    claimVault,
    lookupVaultByDomain,
  } = useHydentity();

  const { config } = useNetwork();
  const networkType = useNetworkType();
  const {
    isAvailable: privacyCashAvailable,
    isInitialized: privacyCashInitialized,
    isLoading: privacyCashLoading,
    initializeWithWallet: initializePrivacyCash,
    depositAfterVaultWithdrawal,
    estimateFees,
    derivedPublicKey: privacyCashDerivedKey,
    balance: privacyCashBalance,
    withdraw: withdrawFromPrivacyCash,
    refreshBalance: refreshPrivacyCashBalance,
    refreshDerivedKeyBalance,
  } = usePrivacyCash();

  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isReclaiming, setIsReclaiming] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isInitializingPrivacyCash, setIsInitializingPrivacyCash] = useState(false);
  const [showReclaimModal, setShowReclaimModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showDomainFixModal, setShowDomainFixModal] = useState(false);
  const [reclaimDestination, setReclaimDestination] = useState('');
  const [withdrawDestination, setWithdrawDestination] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);
  const [usePrivacyRouting, setUsePrivacyRouting] = useState(false);
  const [isSyncingState, setIsSyncingState] = useState(false);

  // Close Vault state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Claim Vault state (for vault-not-found path)
  const [isCheckingVault, setIsCheckingVault] = useState(false);
  const [unclaimedVault, setUnclaimedVault] = useState<VaultInfo | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [showClaimConfirmModal, setShowClaimConfirmModal] = useState(false);

  // Privacy Cash withdrawal state
  const [showPrivacyCashWithdrawModal, setShowPrivacyCashWithdrawModal] = useState(false);
  const [privacyCashWithdrawAmount, setPrivacyCashWithdrawAmount] = useState('');
  const [privacyCashWithdrawDestination, setPrivacyCashWithdrawDestination] = useState('');
  const [isWithdrawingFromPrivacyCash, setIsWithdrawingFromPrivacyCash] = useState(false);

  // Check if this is a fallback domain name
  const isFallbackDomain = vault?.domain.startsWith('vault-') || false;

  // Find the vault by domain
  useEffect(() => {
    if (vaults.length > 0) {
      const foundVault = vaults.find(v => v.domain === domain);
      setVault(foundVault || null);
    }
  }, [vaults, domain]);

  // Default to privacy routing when Privacy Cash is initialized
  useEffect(() => {
    if (privacyCashInitialized && privacyCashAvailable) {
      setUsePrivacyRouting(true);
    }
  }, [privacyCashInitialized, privacyCashAvailable]);

  const handleTransferToVault = async () => {
    if (!vault) return;
    
    setIsTransferring(true);
    setError(null);
    setSuccess(null);
    
    try {
      const sig = await transferDomainToVault(vault.domain);
      setSuccess(`Domain ownership transferred! [TX:${sig}]`);
      await fetchVaults();
    } catch (err) {
      console.error('Transfer failed:', err);
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleReclaim = async () => {
    if (!vault || !reclaimDestination) return;

    setIsReclaiming(true);
    setError(null);
    setSuccess(null);

    try {
      const destination = new PublicKey(reclaimDestination);
      const sig = await reclaimDomain(vault.domain, destination);
      setSuccess(`Domain ownership reclaimed! [TX:${sig}]`);
      setShowReclaimModal(false);
      setReclaimDestination('');
      await fetchVaults();
    } catch (err) {
      console.error('Reclaim failed:', err);
      setError(err instanceof Error ? err.message : 'Reclaim failed');
    } finally {
      setIsReclaiming(false);
    }
  };

  const handleSyncDomainState = async () => {
    if (!vault) return;

    setIsSyncingState(true);
    setError(null);
    setSuccess(null);

    try {
      const sig = await syncDomainTransferState(vault.domain);
      setSuccess(`Domain state synced! [TX:${sig}]`);
      await fetchVaults();
    } catch (err) {
      console.error('Sync failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync domain state');
    } finally {
      setIsSyncingState(false);
    }
  };

  const handleCloseVault = async () => {
    if (!vault) return;

    setIsClosing(true);
    setError(null);
    setSuccess(null);

    try {
      const sig = await closeVault(vault.domain);
      setSuccess(`Vault closed successfully! Rent reclaimed. [TX:${sig}]`);
      setShowCloseModal(false);
      router.push('/');
    } catch (err) {
      console.error('Close vault failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to close vault');
    } finally {
      setIsClosing(false);
    }
  };

  const handleCheckForVault = async () => {
    setIsCheckingVault(true);
    setError(null);

    try {
      const found = await lookupVaultByDomain(domain);
      if (found && publicKey && found.ownerAddress !== publicKey.toBase58()) {
        setUnclaimedVault(found);
      } else if (found) {
        // Vault exists and we own it - fetchVaults should pick it up
        setUnclaimedVault(null);
      } else {
        setUnclaimedVault(null);
      }
    } catch (err) {
      console.error('Vault check failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to check for vault');
    } finally {
      setIsCheckingVault(false);
    }
  };

  const handleClaimVault = async () => {
    setIsClaiming(true);
    setError(null);
    setSuccess(null);

    try {
      const sig = await claimVault(domain);
      setSuccess(`Vault claimed successfully! [TX:${sig}]`);
      setShowClaimConfirmModal(false);
      setUnclaimedVault(null);
    } catch (err) {
      console.error('Claim vault failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to claim vault');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleInitializePrivacyCash = async () => {
    setIsInitializingPrivacyCash(true);
    setError(null);

    try {
      await initializePrivacyCash();
      setSuccess('Privacy Cash initialized! You can now use privacy routing.');
    } catch (err) {
      console.error('Privacy Cash initialization failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize Privacy Cash');
    } finally {
      setIsInitializingPrivacyCash(false);
    }
  };

  // Handle withdrawal FROM Privacy Cash pool to any address
  const handlePrivacyCashWithdraw = async () => {
    if (!privacyCashWithdrawAmount || !privacyCashWithdrawDestination) return;

    setIsWithdrawingFromPrivacyCash(true);
    setError(null);
    setSuccess(null);

    try {
      const amountLamports = Math.floor(parseFloat(privacyCashWithdrawAmount) * LAMPORTS_PER_SOL);

      if (amountLamports <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Validate destination address
      try {
        new PublicKey(privacyCashWithdrawDestination);
      } catch {
        throw new Error('Invalid destination address');
      }

      console.log('[Vault] Withdrawing from Privacy Cash pool:', amountLamports / LAMPORTS_PER_SOL, 'SOL to', privacyCashWithdrawDestination);

      const result = await withdrawFromPrivacyCash(amountLamports, privacyCashWithdrawDestination);

      console.log('[Vault] Privacy Cash withdrawal complete:', result.signature);

      const amountReceived = (result.amountReceived / LAMPORTS_PER_SOL).toFixed(4);
      const recipientShort = privacyCashWithdrawDestination.slice(0, 8);

      setSuccess(
        `Privacy withdrawal complete! ${amountReceived} SOL sent to ${recipientShort}... [TX:${result.signature}]`
      );

      // Close modal and reset form
      setShowPrivacyCashWithdrawModal(false);
      setPrivacyCashWithdrawAmount('');
      setPrivacyCashWithdrawDestination('');

      // Refresh balance
      await refreshPrivacyCashBalance();
    } catch (err) {
      console.error('Privacy Cash withdrawal failed:', err);
      setError(err instanceof Error ? err.message : 'Privacy Cash withdrawal failed');
    } finally {
      setIsWithdrawingFromPrivacyCash(false);
    }
  };

  const handleWithdraw = async () => {
    if (!vault || !withdrawAmount) return;

    // For privacy routing, destination must be connected wallet
    // For direct withdrawal, destination is required
    if (!usePrivacyRouting && !withdrawDestination) return;

    setIsWithdrawing(true);
    setError(null);
    setSuccess(null);

    try {
      const amountLamports = BigInt(Math.floor(parseFloat(withdrawAmount) * 1e9));

      if (amountLamports <= 0n) {
        throw new Error('Amount must be greater than 0');
      }

      if (amountLamports > vault.balance) {
        throw new Error('Insufficient balance');
      }

      if (usePrivacyRouting && !privacyCashDerivedKey) {
        throw new Error('Privacy Cash not initialized. Please initialize first.');
      }

      if (usePrivacyRouting && privacyCashDerivedKey) {
        // Privacy Cash routing flow:
        // 1. Withdraw from vault to Privacy Cash derived keypair address
        // 2. Deposit to Privacy Cash pool (from that address)
        console.log('[Vault] Privacy routing enabled, withdrawing to Privacy Cash derived key:', privacyCashDerivedKey.toBase58());

        const vaultSig = await withdrawDirect(vault.domain, privacyCashDerivedKey, amountLamports);
        console.log('[Vault] Vault withdrawal complete:', vaultSig);

        // Get the actual balance at the derived key (may be less than requested due to rent/fees)
        const derivedKeyBalance = await connection.getBalance(privacyCashDerivedKey);
        console.log('[Vault] Derived key actual balance:', derivedKeyBalance / LAMPORTS_PER_SOL, 'SOL');

        // Buffer for Privacy Cash internal operations:
        // - ~1.9M lamports for UTXO account rent (2 accounts created during deposit)
        // - ~890K lamports to keep derived key rent-exempt after deposit
        // - ~5K lamports for transaction fee
        // Total: ~3M lamports (0.003 SOL) to be safe
        const TX_FEE_BUFFER = 3000000;
        const depositAmount = derivedKeyBalance - TX_FEE_BUFFER;

        if (depositAmount <= 0) {
          throw new Error(`Insufficient balance at derived key for deposit. Balance: ${derivedKeyBalance / LAMPORTS_PER_SOL} SOL`);
        }

        // Now deposit to Privacy Cash using the actual available balance
        console.log('[Vault] Depositing to Privacy Cash pool:', depositAmount / LAMPORTS_PER_SOL, 'SOL');
        const depositResult = await depositAfterVaultWithdrawal(depositAmount);
        console.log('[Vault] Privacy Cash deposit complete:', depositResult.signature);

        // Refresh the derived key balance after deposit
        await refreshDerivedKeyBalance();

        setSuccess(
          `Privacy routing complete! Vault withdrawal: [TX:${vaultSig}] | ` +
          `Pool deposit: [TX:${depositResult.signature}]`
        );
      } else {
        // Direct withdrawal (no privacy routing)
        const destination = new PublicKey(withdrawDestination);
        const sig = await withdrawDirect(vault.domain, destination, amountLamports);
        setSuccess(`Withdrawal successful! [TX:${sig}]`);
      }

      setShowWithdrawModal(false);
      setWithdrawDestination('');
      setWithdrawAmount('');
      setUsePrivacyRouting(false);
      await fetchVaults();
    } catch (err) {
      console.error('Withdrawal failed:', err);
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleMaxAmount = () => {
    if (vault) {
      // Leave a small amount for rent
      const maxAmount = Number(vault.balance) / 1e9;
      setWithdrawAmount(maxAmount.toFixed(4));
    }
  };

  const handleFixDomain = () => {
    if (!vault || !domainInput.trim()) return;
    registerDomainForVault(vault.snsNameAccount, domainInput.trim());
    setShowDomainFixModal(false);
    setDomainInput('');
    // Navigate to the new domain page
    router.push(`/vault/${domainInput.trim().toLowerCase().replace(/\.sol$/, '')}`);
  };

  const formatSol = (lamports: bigint) => {
    return (Number(lamports) / 1e9).toFixed(4);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  // Copy vault authority address to clipboard (this is where funds are sent)
  const handleCopyAddress = useCallback(async () => {
    if (!vault?.vaultAuthorityAddress) return;

    try {
      await navigator.clipboard.writeText(vault.vaultAuthorityAddress);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  }, [vault?.vaultAuthorityAddress]);

  if (!connected) {
    return (
      <div className="min-h-screen bg-hx-bg flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl text-hx-white mb-4">Connect your wallet</h2>
          <p className="text-hx-text">Please connect your wallet to view vault details</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-hx-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-hx-green mx-auto mb-4"></div>
          <p className="text-hx-text">Loading vault...</p>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="min-h-screen bg-hx-bg flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <h2 className="text-xl text-hx-white mb-4">Vault not found</h2>
          <p className="text-hx-text mb-6">No vault found for domain &quot;{domain}.sol&quot;</p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-hx-green/10 border border-hx-green/30 rounded-lg text-hx-green text-sm">
              {success}
            </div>
          )}

          {!unclaimedVault ? (
            <div className="mb-6">
              <button
                onClick={handleCheckForVault}
                disabled={isCheckingVault}
                className="px-5 py-2.5 bg-hx-card-bg text-hx-white border border-hx-text/20 rounded-lg font-medium hover:border-hx-green/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingVault ? 'Checking...' : 'Check for existing vault'}
              </button>
            </div>
          ) : (
            <div className="mb-6 text-left">
              <div className="bg-hx-card-bg rounded-xl p-5 border border-hx-text/10 mb-4">
                <h3 className="text-sm font-medium text-hx-white mb-3">Existing vault found</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-hx-text">Vault</dt>
                    <dd className="text-hx-white font-mono text-xs">{unclaimedVault.vaultAddress.slice(0, 8)}...{unclaimedVault.vaultAddress.slice(-6)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-hx-text">Current Owner</dt>
                    <dd className="text-hx-white font-mono text-xs">{unclaimedVault.ownerAddress.slice(0, 8)}...{unclaimedVault.ownerAddress.slice(-6)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-hx-text">Balance</dt>
                    <dd className="text-hx-white">{(Number(unclaimedVault.balance) / 1e9).toFixed(4)} SOL</dd>
                  </div>
                </dl>
              </div>

              <p className="text-xs text-hx-text mb-4">
                This vault is owned by a different wallet. If you are the current SNS domain owner, you can claim it.
              </p>

              <button
                onClick={() => setShowClaimConfirmModal(true)}
                disabled={isClaiming}
                className="w-full px-5 py-2.5 bg-hx-green text-hx-bg rounded-lg font-medium hover:bg-hx-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClaiming ? 'Claiming...' : 'Claim Vault'}
              </button>
            </div>
          )}

          <Link href="/" className="text-hx-green hover:underline">
            ← Back to dashboard
          </Link>

          {/* Claim Confirm Modal */}
          {showClaimConfirmModal && unclaimedVault && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-hx-bg rounded-xl p-6 max-w-md w-full border border-hx-text/20 shadow-2xl text-left"
              >
                <h3 className="text-xl font-semibold text-hx-white mb-4">
                  Claim Vault Ownership
                </h3>

                <p className="text-hx-text text-sm mb-4">
                  You are about to claim ownership of this vault. The on-chain program will verify that your wallet is the current SNS domain owner.
                </p>

                <div className="p-3 bg-hx-bg/50 rounded-lg border border-hx-text/10 mb-6">
                  <p className="text-xs text-hx-text mb-1">Current Owner:</p>
                  <p className="text-xs text-hx-white font-mono break-all">{unclaimedVault.ownerAddress}</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowClaimConfirmModal(false)}
                    className="flex-1 px-4 py-2.5 bg-hx-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClaimVault}
                    disabled={isClaiming}
                    className="flex-1 px-4 py-2.5 bg-hx-green text-hx-bg rounded-lg font-medium hover:bg-hx-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isClaiming ? 'Claiming...' : 'Confirm Claim'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-hx-bg">
      {/* Header */}
      <header className="border-b border-hx-text/10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link href="/" className="text-hx-text hover:text-hx-green transition-colors text-sm">
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Vault Header */}
        <div className="mb-8">
          {isFallbackDomain ? (
            <>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-yellow-400">
                  Unknown Domain
                </h1>
                <button
                  onClick={() => setShowDomainFixModal(true)}
                  className="px-3 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded text-sm font-medium hover:bg-yellow-500/20 transition-colors"
                >
                  Fix Domain Name
                </button>
              </div>
              <p className="text-hx-text font-mono text-sm mb-1">
                SNS Account: {vault.snsNameAccount}
              </p>
            </>
          ) : (
            <h1 className="text-3xl font-bold text-hx-white mb-2">
              {vault.domain}<span className="text-hx-green">.sol</span>
            </h1>
          )}
          <button
            onClick={handleCopyAddress}
            className="text-hx-text font-mono text-sm hover:text-hx-green transition-colors flex items-center gap-2"
            title="Click to copy receiving address"
          >
            {formatAddress(vault.vaultAuthorityAddress)}
            {addressCopied ? (
              <span className="text-hx-green text-xs">Copied!</span>
            ) : (
              <span className="text-xs opacity-50">📋</span>
            )}
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400"
          >
            {error}
          </motion.div>
        )}
        
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-hx-green/10 border border-hx-green/30 rounded-lg text-hx-green"
          >
            {(() => {
              // Parse [TX:signature] markers into clickable explorer links
              const parts = success.split(/\[TX:([^\]]+)\]/g);
              if (parts.length === 1) return success;
              return (
                <span>
                  {parts.map((part, i) =>
                    i % 2 === 0 ? (
                      <span key={i}>{part}</span>
                    ) : (
                      <a
                        key={i}
                        href={getExplorerTxUrl(networkType, part)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-hx-white transition-colors"
                      >
                        Tx: {part.slice(0, 8)}...
                      </a>
                    )
                  )}
                </span>
              );
            })()}
          </motion.div>
        )}

        {/* Domain Ownership Banner */}
        <div className={`rounded-xl p-4 border mb-4 flex items-center justify-between ${
          vault.domainTransferred
            ? 'bg-hx-blue/5 border-hx-blue/30'
            : 'bg-orange-500/5 border-orange-500/30'
        }`}>
          <div className="flex items-center gap-3">
            <span className={`text-sm ${vault.domainTransferred ? 'text-hx-blue' : 'text-orange-400'}`}>
              {vault.domainTransferred ? '🔒' : '⚠️'}
            </span>
            <p className={`text-sm font-medium ${vault.domainTransferred ? 'text-hx-blue' : 'text-orange-400'}`}>
              {vault.domainTransferred
                ? 'Domain is in vault'
                : 'You must transfer ownership to the vault'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {vault.domainTransferred ? (
              <>
                <button
                  onClick={() => setShowReclaimModal(true)}
                  disabled={isReclaiming || isSyncingState}
                  className="px-3 py-1.5 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg hover:bg-orange-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isReclaiming ? 'Reclaiming...' : 'Reclaim Domain'}
                </button>
                <button
                  onClick={handleSyncDomainState}
                  disabled={isSyncingState || isReclaiming}
                  className="px-3 py-1.5 text-xs text-hx-text bg-hx-text/10 rounded-lg hover:bg-hx-text/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Sync the on-chain vault state with actual domain ownership"
                >
                  {isSyncingState ? 'Syncing...' : 'Sync'}
                </button>
              </>
            ) : (
              <button
                onClick={handleTransferToVault}
                disabled={isTransferring}
                className="px-4 py-1.5 text-sm bg-hx-green text-hx-bg rounded-lg font-medium hover:bg-hx-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isTransferring ? (
                  <>
                    <span className="animate-spin text-xs">⏳</span>
                    Transferring...
                  </>
                ) : (
                  'Transfer Domain'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Balance Card with Withdraw */}
        <div className="bg-hx-card-bg rounded-xl p-6 border border-hx-text/10 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-hx-text uppercase tracking-wider mb-1">Vault Balance</p>
              <p className="text-3xl font-bold text-hx-white">{formatSol(vault.balance)} <span className="text-lg text-hx-text">SOL</span></p>
            </div>
            {vault.balance > 0n && (
              <button
                onClick={() => setShowWithdrawModal(true)}
                className="px-5 py-2.5 bg-hx-green text-hx-bg rounded-lg font-medium hover:bg-hx-green/90 transition-colors"
              >
                Withdraw
              </button>
            )}
          </div>
        </div>

        {/* Privacy Cash Balance Card - Only show if available and initialized */}
        {config.features.privacyCashRouting && privacyCashAvailable && (
          <div className="bg-gradient-to-r from-hx-purple/10 to-hx-purple/5 rounded-xl p-6 border border-hx-purple/20 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-hx-purple">🔒</span>
                  <p className="text-xs text-hx-purple uppercase tracking-wider">Private Balance</p>
                </div>
                {privacyCashInitialized ? (
                  <p className="text-3xl font-bold text-hx-white">
                    {privacyCashBalance?.sol.toFixed(4) ?? '0.0000'} <span className="text-lg text-hx-text">SOL</span>
                  </p>
                ) : (
                  <p className="text-lg text-hx-text">Not initialized</p>
                )}
              </div>
              <div className="flex gap-2">
                {privacyCashInitialized ? (
                  <>
                    <button
                      onClick={() => refreshPrivacyCashBalance()}
                      disabled={privacyCashLoading}
                      className="px-3 py-2 bg-hx-purple/10 text-hx-purple rounded-lg text-sm hover:bg-hx-purple/20 transition-colors disabled:opacity-50"
                    >
                      Refresh
                    </button>
                    {(privacyCashBalance?.sol ?? 0) > 0 && (
                      <button
                        onClick={() => setShowPrivacyCashWithdrawModal(true)}
                        className="px-5 py-2.5 bg-hx-purple text-white rounded-lg font-medium hover:bg-hx-purple/90 transition-colors"
                      >
                        Withdraw Privately
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={handleInitializePrivacyCash}
                    disabled={isInitializingPrivacyCash || privacyCashLoading}
                    className="px-5 py-2.5 bg-hx-purple text-white rounded-lg font-medium hover:bg-hx-purple/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isInitializingPrivacyCash ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Initializing...
                      </>
                    ) : (
                      <>
                        <span>🔐</span>
                        Initialize
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            {privacyCashInitialized && (
              <p className="text-xs text-hx-text mt-3">
                Funds in your private balance can be withdrawn to any address, breaking the on-chain link to this vault.
              </p>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <StatCard label="Received" value={vault.totalDeposits.toString()} />
          <StatCard label="Claim Splits" value={`${vault.minSplits}-${vault.maxSplits}`} />
          <StatCard label="Claim Delay" value={`${vault.maxDelaySeconds / 60}m max`} />
        </div>

        {/* Vault Info Section */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-hx-white mb-4">Vault Details</h2>
          
          <div className="bg-hx-card-bg rounded-xl p-6 border border-hx-text/10">
            <dl className="space-y-4">
              <InfoRow label="Vault Address" value={vault.vaultAuthorityAddress} mono />
              <InfoRow label="Vault Account" value={vault.vaultAddress} mono />
              <InfoRow label="Owner Address" value={vault.ownerAddress} mono />
              <InfoRow label="SNS Name Account" value={vault.snsNameAccount} mono />
              <InfoRow label="Policy Status" value={vault.policyEnabled ? 'Active' : 'Paused'} />
              <InfoRow 
                label="Created" 
                value={vault.createdAt > 0 
                  ? new Date(vault.createdAt * 1000).toLocaleString() 
                  : 'Unknown'
                } 
              />
              <InfoRow 
                label="Last Deposit" 
                value={vault.lastDepositAt > 0 
                  ? new Date(vault.lastDepositAt * 1000).toLocaleString() 
                  : 'No deposits yet'
                } 
              />
            </dl>
          </div>
        </section>

        {/* Actions Section */}
        <section>
          <h2 className="text-xl font-semibold text-hx-white mb-4">Actions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div
              className="p-5 bg-hx-card-bg rounded-xl border border-hx-text/10 hover:border-hx-purple/30 transition-all cursor-pointer"
              whileHover={{ y: -2 }}
              onClick={() => {
                if (privacyCashInitialized) {
                  setShowPrivacyCashWithdrawModal(true);
                } else {
                  handleInitializePrivacyCash();
                }
              }}
            >
              <h3 className="text-lg font-medium text-hx-white mb-2">💸 Claim Funds</h3>
              <p className="text-sm text-hx-text">
                {privacyCashInitialized
                  ? 'Privately withdraw funds via Privacy Cash'
                  : 'Initialize Privacy Cash to claim privately'}
              </p>
            </motion.div>
            
            <Link href="/settings">
              <motion.div
                className="p-5 bg-hx-card-bg rounded-xl border border-hx-text/10 hover:border-hx-green/30 transition-all cursor-pointer"
                whileHover={{ y: -2 }}
              >
                <h3 className="text-lg font-medium text-hx-white mb-2">⚙️ Settings</h3>
                <p className="text-sm text-hx-text">Configure privacy policy and destinations</p>
              </motion.div>
            </Link>

            <motion.div
              className="p-5 bg-hx-card-bg rounded-xl border border-red-500/20 hover:border-red-500/40 transition-all cursor-pointer"
              whileHover={{ y: -2 }}
              onClick={() => setShowCloseModal(true)}
            >
              <h3 className="text-lg font-medium text-red-400 mb-2">🗑️ Close Vault</h3>
              <p className="text-sm text-hx-text">Close all vault PDAs and reclaim rent</p>
            </motion.div>
          </div>
        </section>
      </div>

      {/* Reclaim Modal */}
      {showReclaimModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-hx-bg rounded-xl p-6 max-w-md w-full border border-hx-text/20 shadow-2xl"
          >
            <h3 className="text-xl font-semibold text-hx-white mb-4">
              Reclaim Domain Ownership
            </h3>

            <p className="text-hx-text text-sm mb-6">
              Transfer the domain ownership from the vault back to a wallet address of your choice.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-hx-white mb-2">
                Destination Wallet Address
              </label>
              <input
                type="text"
                value={reclaimDestination}
                onChange={(e) => setReclaimDestination(e.target.value)}
                placeholder="Enter Solana wallet address..."
                className="w-full px-4 py-3 bg-hx-bg border border-hx-text/20 rounded-lg text-hx-white font-mono text-sm focus:outline-none focus:border-hx-green"
              />

              {publicKey && (
                <button
                  onClick={() => setReclaimDestination(publicKey.toBase58())}
                  className="mt-2 text-xs text-hx-blue hover:underline"
                >
                  Use connected wallet ({formatAddress(publicKey.toBase58())})
                </button>
              )}
            </div>

            <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20 mb-6">
              <p className="text-xs text-orange-400">
                <strong>Warning:</strong> This will make the domain ownership publicly linked to the destination wallet again.
                For maximum privacy, use a fresh wallet.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowReclaimModal(false)}
                className="flex-1 px-4 py-2.5 bg-hx-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReclaim}
                disabled={!reclaimDestination || isReclaiming}
                className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isReclaiming ? 'Reclaiming...' : 'Reclaim Domain'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && vault && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-hx-bg rounded-xl p-6 max-w-md w-full border border-hx-text/20 shadow-2xl"
          >
            <h3 className="text-xl font-semibold text-hx-white mb-4">
              Withdraw SOL
            </h3>

            <p className="text-hx-text text-sm mb-6">
              Withdraw SOL from your vault to any wallet address.
            </p>

            {/* Privacy Cash Toggle - Only show if available on this network */}
            {config.features.privacyCashRouting && privacyCashAvailable && (
              <div className="mb-6 p-4 bg-hx-purple/10 rounded-lg border border-hx-purple/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-hx-purple">🔒</span>
                    <span className="text-sm font-medium text-hx-white">Privacy Routing</span>
                  </div>
                  <button
                    onClick={() => setUsePrivacyRouting(!usePrivacyRouting)}
                    disabled={!privacyCashInitialized}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      usePrivacyRouting
                        ? 'bg-hx-purple'
                        : 'bg-hx-text/20'
                    } ${!privacyCashInitialized ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        usePrivacyRouting ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-hx-text">
                  {privacyCashInitialized
                    ? 'Route through Privacy Cash to break on-chain link between vault and destination.'
                    : 'Privacy Cash not initialized. Sign a message to derive your encryption key.'}
                </p>

                {/* Initialize Privacy Cash button */}
                {!privacyCashInitialized && (
                  <button
                    onClick={handleInitializePrivacyCash}
                    disabled={isInitializingPrivacyCash || privacyCashLoading}
                    className="mt-3 w-full px-4 py-2 bg-hx-purple text-white rounded-lg text-sm font-medium hover:bg-hx-purple/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isInitializingPrivacyCash ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Initializing...
                      </>
                    ) : (
                      <>
                        <span>🔐</span>
                        Initialize Privacy Cash
                      </>
                    )}
                  </button>
                )}

                {/* Fee Estimation when Privacy Routing enabled */}
                {usePrivacyRouting && withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                  <div className="mt-3 pt-3 border-t border-hx-text/10">
                    <p className="text-xs text-hx-text mb-2">Estimated Fees:</p>
                    {(() => {
                      const lamports = Math.floor(parseFloat(withdrawAmount) * LAMPORTS_PER_SOL);
                      const fees = estimateFees(lamports);
                      // Minimum 0.005 SOL for privacy routing (UTXO rent + fees)
                      const MINIMUM_PRIVACY_ROUTING_SOL = 0.005;
                      const amountSol = parseFloat(withdrawAmount);
                      const isBelowMinimum = amountSol < MINIMUM_PRIVACY_ROUTING_SOL;

                      return (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-hx-text">Deposit fee:</span>
                            <span className="text-hx-white">{(fees.depositFee / LAMPORTS_PER_SOL).toFixed(6)} SOL</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-hx-text">UTXO rent (refundable):</span>
                            <span className="text-hx-white">~0.003 SOL</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-hx-text">Withdrawal fee (0.35% + rent):</span>
                            <span className="text-hx-white">{(fees.withdrawFee / LAMPORTS_PER_SOL).toFixed(6)} SOL</span>
                          </div>
                          <div className="flex justify-between text-xs font-medium pt-1 border-t border-hx-text/10">
                            <span className="text-hx-text">Net amount:</span>
                            <span className="text-hx-green">{(fees.netAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL</span>
                          </div>

                          {/* Warning for amounts below minimum */}
                          {isBelowMinimum && (
                            <div className="mt-2 p-2 bg-red-500/10 rounded border border-red-500/20">
                              <p className="text-xs text-red-400">
                                ⚠️ Minimum {MINIMUM_PRIVACY_ROUTING_SOL} SOL required for privacy routing due to UTXO rent costs.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-hx-white mb-2">
                Amount (SOL)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.0001"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.0000"
                  className="w-full px-4 py-3 bg-hx-bg border border-hx-text/20 rounded-lg text-hx-white font-mono text-sm focus:outline-none focus:border-hx-green pr-16"
                />
                <button
                  onClick={handleMaxAmount}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-hx-green bg-hx-green/10 rounded hover:bg-hx-green/20 transition-colors"
                >
                  MAX
                </button>
              </div>
              <p className="mt-1 text-xs text-hx-text">
                Available: {formatSol(vault.balance)} SOL
              </p>
            </div>

            {/* Destination - only show for direct withdrawal */}
            {!usePrivacyRouting && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-hx-white mb-2">
                  Destination Wallet Address
                </label>
                <input
                  type="text"
                  value={withdrawDestination}
                  onChange={(e) => setWithdrawDestination(e.target.value)}
                  placeholder="Enter Solana wallet address..."
                  className="w-full px-4 py-3 bg-hx-bg border border-hx-text/20 rounded-lg text-hx-white font-mono text-sm focus:outline-none focus:border-hx-green"
                />

                {publicKey && (
                  <button
                    onClick={() => setWithdrawDestination(publicKey.toBase58())}
                    className="mt-2 text-xs text-hx-blue hover:underline"
                  >
                    Use connected wallet ({formatAddress(publicKey.toBase58())})
                  </button>
                )}
              </div>
            )}

            {/* Privacy Routing Info */}
            {usePrivacyRouting ? (
              <div className="p-3 bg-hx-purple/10 rounded-lg border border-hx-purple/20 mb-6">
                <p className="text-xs text-hx-purple">
                  <strong>Privacy Flow:</strong> First top-up your private balance, then you can withdraw to your fresh wallet, breaking the on-chain link.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20 mb-6">
                <p className="text-xs text-yellow-400">
                  <strong>Note:</strong> This is a direct withdrawal that bypasses privacy features.
                  {config.features.privacyCashRouting
                    ? ' Enable Privacy Routing above for enhanced privacy.'
                    : ' For maximum privacy, use the Arcium MPC withdrawal flow instead.'}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowWithdrawModal(false);
                  setWithdrawAmount('');
                  setWithdrawDestination('');
                  setUsePrivacyRouting(false);
                }}
                className="flex-1 px-4 py-2.5 bg-hx-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={
                  (!usePrivacyRouting && !withdrawDestination) ||
                  !withdrawAmount ||
                  isWithdrawing ||
                  privacyCashLoading ||
                  (usePrivacyRouting && !privacyCashInitialized) ||
                  (usePrivacyRouting && parseFloat(withdrawAmount || '0') < 0.005)
                }
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  usePrivacyRouting
                    ? 'bg-hx-purple text-white hover:bg-hx-purple/90'
                    : 'bg-hx-green text-hx-bg hover:bg-hx-green/90'
                }`}
              >
                {isWithdrawing
                  ? usePrivacyRouting
                    ? 'Topping up...'
                    : 'Withdrawing...'
                  : usePrivacyRouting
                    ? 'Top up Private Balance'
                    : 'Withdraw'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Fix Domain Name Modal */}
      {showDomainFixModal && vault && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-hx-bg rounded-xl p-6 max-w-md w-full border border-hx-text/20 shadow-2xl"
          >
            <h3 className="text-xl font-semibold text-hx-white mb-4">
              Fix Domain Name
            </h3>

            <p className="text-hx-text text-sm mb-4">
              The domain name for this vault could not be automatically detected.
              Enter the correct domain name to restore full functionality.
            </p>

            <div className="p-3 bg-hx-bg/50 rounded-lg border border-hx-text/10 mb-4">
              <p className="text-xs text-hx-text mb-1">SNS Name Account:</p>
              <p className="text-xs text-hx-white font-mono break-all">{vault.snsNameAccount}</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-hx-white mb-2">
                Domain Name
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="mydomain"
                  className="flex-1 px-4 py-3 bg-hx-bg border border-hx-text/20 rounded-lg text-hx-white font-mono text-sm focus:outline-none focus:border-hx-green"
                />
                <span className="text-hx-green font-medium">.sol</span>
              </div>
              <p className="mt-2 text-xs text-hx-text">
                Enter the domain name without the .sol extension
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDomainFixModal(false);
                  setDomainInput('');
                }}
                className="flex-1 px-4 py-2.5 bg-hx-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFixDomain}
                disabled={!domainInput.trim()}
                className="flex-1 px-4 py-2.5 bg-hx-green text-hx-bg rounded-lg font-medium hover:bg-hx-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Domain
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Close Vault Modal */}
      {showCloseModal && vault && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-hx-bg rounded-xl p-6 max-w-md w-full border border-red-500/30 shadow-2xl"
          >
            <h3 className="text-xl font-semibold text-red-400 mb-4">
              Close Vault
            </h3>

            <p className="text-hx-text text-sm mb-4">
              This will close all vault PDAs (vault, vault authority, and policy) and return the rent-exempt SOL to your wallet.
            </p>

            {vault.balance > 0n && (
              <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20 mb-4">
                <p className="text-xs text-yellow-400">
                  <strong>Note:</strong> The vault authority still holds {(Number(vault.balance) / 1e9).toFixed(4)} SOL.
                  This balance will be returned along with rent when the vault is closed.
                </p>
              </div>
            )}

            {vault.domainTransferred && (
              <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 mb-4">
                <p className="text-xs text-red-400">
                  <strong>Warning:</strong> The domain is still transferred to the vault authority.
                  Please reclaim your domain before closing the vault.
                </p>
              </div>
            )}

            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 mb-6">
              <p className="text-xs text-red-400">
                <strong>This action is irreversible.</strong> You will need to create a new vault if you want to use Hydentity for this domain again.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex-1 px-4 py-2.5 bg-hx-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseVault}
                disabled={isClosing || vault.domainTransferred}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClosing ? 'Closing...' : 'Close Vault'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Privacy Cash Withdrawal Modal */}
      {showPrivacyCashWithdrawModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-hx-bg rounded-xl p-6 max-w-md w-full border border-hx-purple/30 shadow-2xl"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-hx-purple text-2xl">🔒</span>
              <h3 className="text-xl font-semibold text-hx-white">
                Private Withdrawal
              </h3>
            </div>

            <p className="text-hx-text text-sm mb-6">
              Withdraw from your private balance to any wallet address. This transaction cannot be linked back to your domain.
            </p>

            <div className="p-3 bg-hx-purple/10 rounded-lg border border-hx-purple/20 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-sm text-hx-text">Private Balance:</span>
                <span className="text-lg font-bold text-hx-white">
                  {privacyCashBalance?.sol.toFixed(4) ?? '0.0000'} SOL
                </span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-hx-white mb-2">
                Amount (SOL)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  max={privacyCashBalance?.sol ?? 0}
                  value={privacyCashWithdrawAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    const maxBalance = privacyCashBalance?.sol ?? 0;
                    // Allow empty input or valid numbers up to max balance
                    if (value === '' || parseFloat(value) <= maxBalance) {
                      setPrivacyCashWithdrawAmount(value);
                    } else {
                      // Cap at max balance
                      setPrivacyCashWithdrawAmount(maxBalance.toString());
                    }
                  }}
                  placeholder="0.0000"
                  className="w-full px-4 py-3 bg-hx-bg border border-hx-text/20 rounded-lg text-hx-white font-mono text-sm focus:outline-none focus:border-hx-purple pr-16"
                />
                <button
                  onClick={() => setPrivacyCashWithdrawAmount((privacyCashBalance?.sol ?? 0).toString())}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-hx-purple bg-hx-purple/10 rounded hover:bg-hx-purple/20 transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-hx-white mb-2">
                Destination Wallet Address
              </label>
              <input
                type="text"
                value={privacyCashWithdrawDestination}
                onChange={(e) => setPrivacyCashWithdrawDestination(e.target.value)}
                placeholder="Enter any Solana wallet address..."
                className="w-full px-4 py-3 bg-hx-bg border border-hx-text/20 rounded-lg text-hx-white font-mono text-sm focus:outline-none focus:border-hx-purple"
              />
              <p className="mt-2 text-xs text-hx-text">
                This address will receive the funds with no on-chain link to your domain.
              </p>
            </div>

            {/* Fee Estimation and Warnings */}
            {privacyCashWithdrawAmount && parseFloat(privacyCashWithdrawAmount) > 0 && (
              <div className="p-3 bg-hx-bg/50 rounded-lg border border-hx-text/10 mb-6">
                <p className="text-xs text-hx-text mb-2">Estimated:</p>
                {(() => {
                  const amountSol = parseFloat(privacyCashWithdrawAmount);
                  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
                  const fees = estimateFees(lamports);
                  const percentageFee = Math.floor(lamports * 0.0035); // 0.35%
                  const rentFee = 6000000; // 0.006 SOL

                  return (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-hx-text">Withdrawal fee (0.35%):</span>
                        <span className="text-hx-white">{(percentageFee / LAMPORTS_PER_SOL).toFixed(6)} SOL</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-hx-text">Rent fee:</span>
                        <span className="text-hx-white">{(rentFee / LAMPORTS_PER_SOL).toFixed(4)} SOL</span>
                      </div>
                      <div className="flex justify-between text-xs font-medium pt-1 border-t border-hx-text/10">
                        <span className="text-hx-text">You&apos;ll receive:</span>
                        <span className="text-hx-green">~{(fees.netAmount / LAMPORTS_PER_SOL).toFixed(4)} SOL</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPrivacyCashWithdrawModal(false);
                  setPrivacyCashWithdrawAmount('');
                  setPrivacyCashWithdrawDestination('');
                }}
                className="flex-1 px-4 py-2.5 bg-hx-bg border border-hx-text/20 text-hx-text rounded-lg hover:bg-hx-text/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePrivacyCashWithdraw}
                disabled={
                  !privacyCashWithdrawAmount ||
                  !privacyCashWithdrawDestination ||
                  isWithdrawingFromPrivacyCash ||
                  privacyCashLoading
                }
                className="flex-1 px-4 py-2.5 bg-hx-purple text-white rounded-lg font-medium hover:bg-hx-purple/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isWithdrawingFromPrivacyCash ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    Processing...
                  </span>
                ) : 'Withdraw Privately'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-hx-card-bg rounded-xl p-4 border border-hx-text/10">
      <p className="text-xs text-hx-text uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-semibold text-hx-white">{value}</p>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
      <dt className="text-sm text-hx-text">{label}</dt>
      <dd className={`text-sm text-hx-white ${mono ? 'font-mono' : ''} break-all`}>
        {value}
      </dd>
    </div>
  );
}

