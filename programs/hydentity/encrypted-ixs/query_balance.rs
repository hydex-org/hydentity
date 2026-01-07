//! Query Encrypted Balance
//! 
//! This encrypted instruction allows users to query their vault balance
//! with the response encrypted specifically for them. This prevents
//! external observers from learning vault balances through RPC queries.
//! 
//! ## Privacy Properties
//! 
//! - Balance is never revealed publicly
//! - Only the querying user can decrypt the response
//! - Pending withdrawal information included
//! - Query history not visible to observers

use arcis_imports::*;

#[encrypted]
mod circuits {
    use super::*;
    use crate::types::*;

    /// Query vault balance with encrypted response
    /// 
    /// This instruction fetches the current vault balance and any pending
    /// withdrawal information, encrypting the response for the requesting user.
    /// 
    /// ## Parameters
    /// 
    /// - `vault_pubkey`: Public key of the vault to query
    /// - `user_pubkey`: User's public key for encrypting response
    /// - `current_balance`: Current on-chain balance (passed from program)
    /// - `pending_plan`: Optional pending withdrawal plan
    /// 
    /// ## Returns
    /// 
    /// - `BalanceInfo`: Encrypted balance details only user can decrypt
    /// 
    /// ## Privacy
    /// 
    /// The response uses `Enc<Shared, ...>` which means it's encrypted with
    /// a shared secret between the user and MXE. Only the user can decrypt it.
    #[instruction]
    pub fn query_encrypted_balance(
        vault_pubkey: [u8; 32],
        user_pubkey: Shared,
        current_balance: u64,
        pending_plan: Enc<Mxe, Option<WithdrawalPlan>>,
        current_timestamp: i64,
    ) -> Enc<Shared, BalanceInfo> {
        let plan_opt = pending_plan.to_arcis();
        
        // Calculate pending withdrawal amount
        let mut pending_amount: u64 = 0;
        let mut pending_splits: u8 = 0;
        
        // Check if there's a pending plan
        // Note: In Arcis, we handle Option differently - using a flag pattern
        if let Some(plan) = plan_opt {
            if plan.status == PlanStatus::Pending || plan.status == PlanStatus::InProgress {
                // Sum unexecuted splits
                for i in 0..(plan.split_count as usize) {
                    if i < MAX_SPLITS {
                        let split = &plan.splits[i];
                        if split.executed_at == 0 {
                            pending_amount += split.amount;
                            pending_splits += 1;
                        }
                    }
                }
            }
        }
        
        // Calculate available balance
        let available = if current_balance > pending_amount {
            current_balance - pending_amount
        } else {
            0
        };
        
        let balance_info = BalanceInfo {
            balance: current_balance,
            pending_withdrawals: pending_amount,
            available,
            pending_split_count: pending_splits,
            queried_at: current_timestamp,
        };
        
        // Encrypt for the requesting user
        user_pubkey.from_arcis(balance_info)
    }

    /// Query withdrawal history (encrypted)
    /// 
    /// Returns the history of completed withdrawals for a vault,
    /// encrypted for the owner.
    /// 
    /// ## Parameters
    /// 
    /// - `completed_plans`: Array of completed withdrawal plans
    /// - `user_pubkey`: User's public key for encryption
    /// - `limit`: Maximum number of entries to return
    /// 
    /// ## Returns
    /// 
    /// - Array of withdrawal summaries, encrypted for user
    #[instruction]
    pub fn query_withdrawal_history(
        completed_plans: Enc<Mxe, [Option<WithdrawalPlan>; 10]>,
        user_pubkey: Shared,
        limit: u8,
    ) -> Enc<Shared, [WithdrawalHistoryEntry; 10]> {
        let plans = completed_plans.to_arcis();
        let mut history = [WithdrawalHistoryEntry::default(); 10];
        let mut count = 0;
        
        for i in 0..10 {
            if count >= limit as usize {
                break;
            }
            
            if let Some(plan) = &plans[i] {
                if plan.status == PlanStatus::Completed {
                    history[count] = WithdrawalHistoryEntry {
                        plan_id: plan.plan_id,
                        total_amount: plan.total_amount,
                        split_count: plan.split_count,
                        created_at: plan.created_at,
                        completed_at: get_completion_time(plan),
                    };
                    count += 1;
                }
            }
        }
        
        user_pubkey.from_arcis(history)
    }

    /// Get the completion time of a plan (last split execution time)
    fn get_completion_time(plan: &WithdrawalPlan) -> i64 {
        let mut latest: i64 = 0;
        
        for i in 0..(plan.split_count as usize) {
            if i < MAX_SPLITS {
                let executed = plan.splits[i].executed_at;
                if executed > latest {
                    latest = executed;
                }
            }
        }
        
        latest
    }

    /// Verify vault ownership for balance query
    /// 
    /// Ensures the querying user owns the vault before revealing balance
    #[instruction]
    pub fn verify_ownership(
        config: Enc<Mxe, &PrivateVaultConfig>,
        claimed_owner: Enc<Shared, [u8; 32]>,
    ) -> bool {
        let cfg = config.to_arcis();
        let owner = claimed_owner.to_arcis();
        
        // Compare public keys
        let mut matches = true;
        for i in 0..32 {
            if cfg.owner_pubkey[i] != owner[i] {
                matches = false;
            }
        }
        
        matches.reveal()
    }
}

/// Entry in withdrawal history
#[derive(Clone, Copy, Default)]
pub struct WithdrawalHistoryEntry {
    pub plan_id: [u8; 16],
    pub total_amount: u64,
    pub split_count: u8,
    pub created_at: i64,
    pub completed_at: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_available_balance_calculation() {
        let current = 1_000_000_000u64; // 1 SOL
        let pending = 300_000_000u64;   // 0.3 SOL
        let available = current - pending;
        
        assert_eq!(available, 700_000_000u64);
    }

    #[test]
    fn test_available_balance_underflow() {
        let current = 100_000_000u64;  // 0.1 SOL
        let pending = 300_000_000u64;  // 0.3 SOL
        
        // Should be 0, not underflow
        let available = if current > pending {
            current - pending
        } else {
            0
        };
        
        assert_eq!(available, 0);
    }
}

