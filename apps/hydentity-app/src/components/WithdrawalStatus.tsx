'use client';

import { useState, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWithdrawals, WithdrawalPlan, formatWithdrawalStatus, formatSol, formatDurationRange } from '../hooks/useWithdrawals';

interface WithdrawalStatusProps {
  vaultPubkey: PublicKey;
}

/**
 * Withdrawal Status Component
 * 
 * Displays active and completed withdrawals for a vault.
 * Shows progress, status, and allows cancellation of pending withdrawals.
 */
export function WithdrawalStatus({ vaultPubkey }: WithdrawalStatusProps) {
  const {
    pendingWithdrawals,
    completedWithdrawals,
    cancelWithdrawal,
    isLoading,
    error,
  } = useWithdrawals();
  
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [cancellingPlan, setCancellingPlan] = useState<string | null>(null);

  /**
   * Handle cancel withdrawal
   */
  const handleCancel = useCallback(async (planId: string) => {
    setCancellingPlan(planId);
    try {
      await cancelWithdrawal(planId);
    } finally {
      setCancellingPlan(null);
    }
  }, [cancelWithdrawal]);

  /**
   * Toggle expanded view
   */
  const toggleExpanded = useCallback((planId: string) => {
    setExpandedPlan(prev => prev === planId ? null : planId);
  }, []);

  // Filter withdrawals for this vault
  const vaultPendingWithdrawals = pendingWithdrawals.filter(
    w => w.vaultPubkey.equals(vaultPubkey)
  );
  const vaultCompletedWithdrawals = completedWithdrawals.filter(
    w => w.vaultPubkey.equals(vaultPubkey)
  );

  if (vaultPendingWithdrawals.length === 0 && vaultCompletedWithdrawals.length === 0) {
    return (
      <div className="p-6 text-center text-white/50">
        <p>No withdrawals yet</p>
        <p className="text-sm mt-1">Request a withdrawal to see it tracked here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pending Withdrawals */}
      {vaultPendingWithdrawals.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-white/50 mb-2">Active Withdrawals</h4>
          <div className="space-y-2">
            {vaultPendingWithdrawals.map((withdrawal) => (
              <WithdrawalCard
                key={withdrawal.planId}
                withdrawal={withdrawal}
                expanded={expandedPlan === withdrawal.planId}
                onToggle={() => toggleExpanded(withdrawal.planId)}
                onCancel={() => handleCancel(withdrawal.planId)}
                isCancelling={cancellingPlan === withdrawal.planId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Withdrawals */}
      {vaultCompletedWithdrawals.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-white/50 mb-2">Completed Withdrawals</h4>
          <div className="space-y-2">
            {vaultCompletedWithdrawals.slice(0, 5).map((withdrawal) => (
              <WithdrawalCard
                key={withdrawal.planId}
                withdrawal={withdrawal}
                expanded={expandedPlan === withdrawal.planId}
                onToggle={() => toggleExpanded(withdrawal.planId)}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

interface WithdrawalCardProps {
  withdrawal: WithdrawalPlan;
  expanded: boolean;
  onToggle: () => void;
  onCancel?: () => void;
  isCancelling?: boolean;
  compact?: boolean;
}

/**
 * Individual withdrawal card
 */
function WithdrawalCard({
  withdrawal,
  expanded,
  onToggle,
  onCancel,
  isCancelling,
  compact,
}: WithdrawalCardProps) {
  const status = formatWithdrawalStatus(withdrawal.status);
  const progress = withdrawal.totalSplits > 0
    ? (withdrawal.completedSplits / withdrawal.totalSplits) * 100
    : 0;

  return (
    <div className={`bg-black/20 border border-white/5 rounded-lg overflow-hidden transition-all ${
      expanded ? 'ring-1 ring-white/10' : ''
    }`}>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div className={`w-2 h-2 rounded-full ${
            withdrawal.status === 'pending' ? 'bg-yellow-400' :
            withdrawal.status === 'in_progress' ? 'bg-blue-400 animate-pulse' :
            withdrawal.status === 'completed' ? 'bg-green-400' :
            withdrawal.status === 'cancelled' ? 'bg-gray-400' :
            'bg-red-400'
          }`} />
          
          <div>
            <div className="text-white font-medium">
              {formatSol(withdrawal.totalAmount)} SOL
            </div>
            {!compact && (
              <div className="text-xs text-white/50">
                {withdrawal.completedSplits}/{withdrawal.totalSplits} splits • {status.label}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!compact && withdrawal.status === 'in_progress' && (
            <div className="text-xs text-white/50">
              {progress.toFixed(0)}%
            </div>
          )}
          <span className={`text-xs ${status.color}`}>
            {compact && status.label}
          </span>
          <span className="text-white/30">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Progress Bar (for active withdrawals) */}
      {!compact && (withdrawal.status === 'pending' || withdrawal.status === 'in_progress') && (
        <div className="px-4 pb-3">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-hx-blue transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-3">
          {/* Plan ID */}
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Plan ID</span>
            <span className="text-white font-mono text-xs">{withdrawal.planId}</span>
          </div>

          {/* Amounts */}
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Total Amount</span>
            <span className="text-white">{formatSol(withdrawal.totalAmount)} SOL</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Withdrawn</span>
            <span className="text-hx-green">{formatSol(withdrawal.withdrawnAmount)} SOL</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Remaining</span>
            <span className="text-white">{formatSol(withdrawal.remainingAmount)} SOL</span>
          </div>

          {/* Splits */}
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Splits Progress</span>
            <span className="text-white">{withdrawal.completedSplits} / {withdrawal.totalSplits}</span>
          </div>

          {/* Dates */}
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Created</span>
            <span className="text-white/70">{withdrawal.createdAt.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Expires</span>
            <span className="text-white/70">{withdrawal.expiresAt.toLocaleString()}</span>
          </div>
          {withdrawal.lastExecutionAt && (
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Last Execution</span>
              <span className="text-white/70">{withdrawal.lastExecutionAt.toLocaleString()}</span>
            </div>
          )}

          {/* Privacy Note */}
          <div className="p-3 bg-hx-blue/10 border border-hx-blue/20 rounded-lg mt-3">
            <p className="text-xs text-white/60">
              🔒 <span className="text-hx-blue">Encrypted Destinations:</span> Split destinations 
              are encrypted. You&apos;ll see funds arrive at your configured wallets as each split executes.
            </p>
          </div>

          {/* Cancel Button */}
          {onCancel && (withdrawal.status === 'pending' || withdrawal.status === 'in_progress') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              disabled={isCancelling}
              className="w-full py-2 mt-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Withdrawal'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Withdrawal Request Modal
 */
interface WithdrawalRequestModalProps {
  vaultPubkey: PublicKey;
  vaultBalance: bigint;
  onClose: () => void;
  onSuccess: () => void;
}

export function WithdrawalRequestModal({
  vaultPubkey,
  vaultBalance,
  onClose,
  onSuccess,
}: WithdrawalRequestModalProps) {
  const { requestWithdrawal, estimateFees, isLoading, error } = useWithdrawals();
  
  const [amount, setAmount] = useState('');
  const [selectedPreset] = useState<'low' | 'medium' | 'high'>('medium');

  const amountLamports = BigInt(Math.floor((parseFloat(amount) || 0) * 1e9));
  const feeEstimate = estimateFees(amountLamports, selectedPreset);

  const handleSubmit = async () => {
    try {
      await requestWithdrawal({
        vaultPubkey,
        amount: amountLamports,
      });
      onSuccess();
    } catch (err) {
      console.error('Failed to request withdrawal:', err);
    }
  };

  const isValid = amountLamports > 0 && amountLamports <= vaultBalance;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-hx-card-bg rounded-xl border border-white/10 max-w-md w-full">
        <div className="px-6 py-4 border-b border-white/5">
          <h2 className="text-xl font-bold text-white">Request Private Withdrawal</h2>
        </div>

        <div className="p-6 space-y-4">
          {/* Amount Input */}
          <div>
            <label className="text-sm text-white/50 block mb-1">Amount (SOL)</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-hx-blue/50"
            />
            <p className="text-xs text-white/40 mt-1">
              Available: {formatSol(vaultBalance)} SOL
            </p>
          </div>

          {/* Fee Estimate */}
          {amountLamports > 0 && (
            <div className="p-4 bg-black/20 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">MPC Computation</span>
                <span className="text-white/70">~{formatSol(feeEstimate.mpcComputationFee)} SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Split Execution (~{feeEstimate.estimatedSplits})</span>
                <span className="text-white/70">~{formatSol(feeEstimate.splitExecutionFees)} SOL</span>
              </div>
              <div className="flex justify-between text-sm border-t border-white/10 pt-2">
                <span className="text-white/50">Total Fees</span>
                <span className="text-white">~{formatSol(feeEstimate.totalFees)} SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Net Amount</span>
                <span className="text-hx-green font-medium">~{formatSol(feeEstimate.netAmount)} SOL</span>
              </div>
              <div className="text-xs text-white/40 mt-2">
                Duration: {formatDurationRange(feeEstimate.estimatedDuration.min, feeEstimate.estimatedDuration.max)}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="p-3 bg-hx-blue/10 border border-hx-blue/20 rounded-lg">
            <p className="text-xs text-white/60">
              🔒 Your withdrawal will be split and sent to your encrypted destinations 
              with randomized timing. Only you know where the funds are going.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white/70 hover:text-white transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || isLoading}
            className="px-6 py-2 bg-hx-green text-black font-semibold rounded-lg hover:bg-hx-green/90 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : 'Request Withdrawal'}
          </button>
        </div>
      </div>
    </div>
  );
}

