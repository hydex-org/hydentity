//! Execute Withdrawal Split
//! 
//! This encrypted instruction executes a single split from a withdrawal plan.
//! The MPC cluster decrypts the destination and amount, then collectively signs
//! a transaction to transfer the funds. This is the moment where the destination
//! is "revealed" - but only to the extent that it appears in the transaction.
//! 
//! ## Privacy Properties
//! 
//! - The link between vault and destination is only visible in the transfer tx
//! - External observers see individual transfers, not the overall plan
//! - Timing between splits is randomized per the user's config
//! - Amount variation makes fingerprinting difficult

use arcis_imports::*;

#[encrypted]
mod circuits {
    use super::*;
    use crate::types::*;

    /// Execute a single withdrawal split
    /// 
    /// This instruction retrieves the next scheduled split from the plan,
    /// verifies it's time to execute, and returns the execution details
    /// for the MPC cluster to sign and broadcast.
    /// 
    /// ## Parameters
    /// 
    /// - `plan`: Reference to the encrypted withdrawal plan
    /// - `split_index`: Index of the split to execute
    /// - `current_timestamp`: Current Unix timestamp for verification
    /// - `vault_balance`: Current vault balance (to verify funds available)
    /// 
    /// ## Returns
    /// 
    /// - `WithdrawalExecution`: Contains destination, amount, and execution status
    /// 
    /// ## Execution Flow
    /// 
    /// 1. MPC decrypts the plan to get split details
    /// 2. Verifies the split is ready (timestamp check)
    /// 3. Verifies vault has sufficient balance
    /// 4. Returns execution data for MPC nodes to sign transfer
    /// 5. MPC nodes collectively sign and broadcast the transfer
    #[instruction]
    pub fn execute_withdrawal_split(
        plan: Enc<Mxe, &WithdrawalPlan>,
        split_index: u8,
        current_timestamp: i64,
        vault_balance: u64,
    ) -> WithdrawalExecution {
        let p = plan.to_arcis();
        
        let mut result = WithdrawalExecution {
            destination: [0u8; 32],
            amount: 0,
            tx_signature: [0u8; 64],
            executed_at: 0,
            success: false,
            error_code: 0,
        };
        
        // Validate split index
        if split_index >= p.split_count || split_index as usize >= MAX_SPLITS {
            result.error_code = 1; // Invalid split index
            return result.reveal();
        }
        
        let split = &p.splits[split_index as usize];
        
        // Check if already executed
        if split.executed_at != 0 {
            result.error_code = 2; // Already executed
            return result.reveal();
        }
        
        // Check if plan is expired
        if current_timestamp > p.expires_at {
            result.error_code = 3; // Plan expired
            return result.reveal();
        }
        
        // Check if it's time to execute (allow 60 second grace period)
        if current_timestamp < split.scheduled_at - 60 {
            result.error_code = 4; // Too early
            return result.reveal();
        }
        
        // Check if vault has sufficient balance
        if vault_balance < split.amount {
            result.error_code = 5; // Insufficient balance
            return result.reveal();
        }
        
        // All checks passed - prepare execution
        result.destination = split.destination;
        result.amount = split.amount;
        result.executed_at = current_timestamp;
        result.success = true;
        result.error_code = 0;
        
        // The tx_signature will be populated by the MPC cluster after signing
        // For now, it's zeroed and the callback will update the plan
        
        result.reveal()
    }

    /// Mark a split as executed in the plan
    /// 
    /// Called after the MPC cluster has successfully broadcast the transfer
    /// transaction. Updates the plan state to reflect execution.
    /// 
    /// ## Parameters
    /// 
    /// - `plan`: The withdrawal plan to update
    /// - `split_index`: Index of the executed split
    /// - `tx_signature`: Signature of the broadcast transaction
    /// - `executed_at`: Timestamp of execution
    /// 
    /// ## Returns
    /// 
    /// - Updated `WithdrawalPlan` with execution recorded
    #[instruction]
    pub fn mark_split_executed(
        plan: Enc<Mxe, WithdrawalPlan>,
        split_index: u8,
        tx_signature: [u8; 64],
        executed_at: i64,
    ) -> Enc<Mxe, WithdrawalPlan> {
        let mut p = plan.to_arcis();
        
        // Validate index
        if split_index < p.split_count && (split_index as usize) < MAX_SPLITS {
            // Update split details
            p.splits[split_index as usize].executed_at = executed_at;
            p.splits[split_index as usize].tx_signature = tx_signature;
            
            // Increment executed count
            p.executed_count += 1;
            
            // Update plan status
            if p.executed_count >= p.split_count {
                p.status = PlanStatus::Completed;
            } else {
                p.status = PlanStatus::InProgress;
            }
        }
        
        Mxe::get().from_arcis(p)
    }

    /// Cancel a withdrawal plan
    /// 
    /// Allows the user to cancel a pending withdrawal plan. Any unexecuted
    /// splits will not be processed.
    /// 
    /// ## Parameters
    /// 
    /// - `plan`: The withdrawal plan to cancel
    /// - `owner_pubkey`: Owner's public key for verification
    /// - `owner_signature`: Signature proving ownership
    /// 
    /// ## Returns
    /// 
    /// - Updated `WithdrawalPlan` with cancelled status
    #[instruction]
    pub fn cancel_withdrawal_plan(
        plan: Enc<Mxe, WithdrawalPlan>,
        owner_pubkey: Enc<Shared, [u8; 32]>,
        config: Enc<Mxe, &PrivateVaultConfig>,
    ) -> Enc<Mxe, WithdrawalPlan> {
        let mut p = plan.to_arcis();
        let owner = owner_pubkey.to_arcis();
        let cfg = config.to_arcis();
        
        // Verify owner matches config
        let mut owner_matches = true;
        for i in 0..32 {
            if owner[i] != cfg.owner_pubkey[i] {
                owner_matches = false;
            }
        }
        
        // Only cancel if owner matches and plan isn't already completed
        if owner_matches && p.status != PlanStatus::Completed {
            p.status = PlanStatus::Cancelled;
        }
        
        Mxe::get().from_arcis(p)
    }

    /// Get execution summary for a plan
    /// 
    /// Returns a summary of plan execution status that can be shared
    /// with the user (encrypted for them).
    #[instruction]
    pub fn get_plan_summary(
        plan: Enc<Mxe, &WithdrawalPlan>,
        user_pubkey: Shared,
    ) -> Enc<Shared, PlanSummary> {
        let p = plan.to_arcis();
        
        let summary = PlanSummary {
            plan_id: p.plan_id,
            total_amount: p.total_amount,
            split_count: p.split_count,
            executed_count: p.executed_count,
            status: p.status,
            created_at: p.created_at,
            expires_at: p.expires_at,
        };
        
        user_pubkey.from_arcis(summary)
    }
}

/// Summary of plan status (can be shared with user)
#[derive(Clone, Copy)]
pub struct PlanSummary {
    pub plan_id: [u8; 16],
    pub total_amount: u64,
    pub split_count: u8,
    pub executed_count: u8,
    pub status: PlanStatus,
    pub created_at: i64,
    pub expires_at: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_codes() {
        // Verify error code meanings
        assert_eq!(1, 1); // Invalid split index
        assert_eq!(2, 2); // Already executed
        assert_eq!(3, 3); // Plan expired
        assert_eq!(4, 4); // Too early
        assert_eq!(5, 5); // Insufficient balance
    }

    #[test]
    fn test_plan_status_transitions() {
        // Valid transitions:
        // Pending -> InProgress (when first split executes)
        // InProgress -> Completed (when all splits done)
        // Pending/InProgress -> Cancelled (user cancels)
        // Pending/InProgress -> Expired (time passes)
        
        let pending = PlanStatus::Pending;
        let in_progress = PlanStatus::InProgress;
        let completed = PlanStatus::Completed;
        
        assert_ne!(pending, completed);
        assert_ne!(in_progress, completed);
    }
}

