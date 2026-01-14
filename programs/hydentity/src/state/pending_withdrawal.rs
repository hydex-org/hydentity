use anchor_lang::prelude::*;

/// Status of a withdrawal plan
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum WithdrawalStatus {
    /// Plan created but execution not started
    #[default]
    Pending,
    /// Plan execution in progress (some splits executed)
    InProgress,
    /// All splits executed successfully
    Completed,
    /// Plan was cancelled by user
    Cancelled,
    /// Plan execution failed
    Failed,
    /// Plan expired before completion
    Expired,
}

/// Pending withdrawal account
/// 
/// This account tracks an active withdrawal plan. The plan details are
/// encrypted and only the MPC cluster can decrypt them to execute splits.
/// 
/// ## Lifecycle
/// 
/// 1. Created when user requests withdrawal
/// 2. MPC generates randomized plan (encrypted)
/// 3. MPC executes splits according to plan timing
/// 4. Account closed when all splits complete or plan cancelled
/// 
/// ## Privacy
/// 
/// - Plan details (destinations, amounts, timing) are encrypted
/// - Only progress counters are visible on-chain
/// - External observers see "X of Y splits complete" but not where funds went
#[account]
pub struct PendingWithdrawal {
    /// The vault this withdrawal is from
    pub vault: Pubkey,
    
    /// Encrypted withdrawal plan (Rescue cipher)
    /// Contains serialized WithdrawalPlan with destinations, amounts, delays
    pub encrypted_plan: [u8; 1024],
    
    /// Nonce used for plan encryption
    pub nonce: [u8; 16],
    
    /// Unique plan identifier (first 16 bytes of plan_id)
    pub plan_id: [u8; 16],
    
    /// Total number of splits in this plan
    pub total_splits: u8,
    
    /// Number of splits completed so far
    pub completed_splits: u8,
    
    /// Current plan status
    pub status: WithdrawalStatus,
    
    /// Total withdrawal amount (lamports)
    /// This is visible but not the individual split amounts
    pub total_amount: u64,
    
    /// Amount already withdrawn (lamports)
    pub withdrawn_amount: u64,
    
    /// Unix timestamp when plan was created
    pub created_at: i64,
    
    /// Unix timestamp when plan expires
    pub expires_at: i64,
    
    /// Unix timestamp of last split execution
    pub last_execution_at: i64,
    
    /// Computation offset for Arcium (for tracking callbacks)
    pub computation_offset: u64,
    
    /// PDA bump seed
    pub bump: u8,
    
    /// Reserved space for future fields
    pub _reserved: [u8; 64],
}

impl PendingWithdrawal {
    /// Account space including discriminator
    pub const SPACE: usize = 8 +    // discriminator
        32 +    // vault
        1024 +  // encrypted_plan
        16 +    // nonce
        16 +    // plan_id
        1 +     // total_splits
        1 +     // completed_splits
        1 +     // status (enum is 1 byte)
        8 +     // total_amount
        8 +     // withdrawn_amount
        8 +     // created_at
        8 +     // expires_at
        8 +     // last_execution_at
        8 +     // computation_offset
        1 +     // bump
        64;     // reserved

    /// Initialize a new pending withdrawal
    pub fn initialize(
        &mut self,
        vault: Pubkey,
        encrypted_plan: [u8; 1024],
        nonce: [u8; 16],
        plan_id: [u8; 16],
        total_splits: u8,
        total_amount: u64,
        created_at: i64,
        expires_at: i64,
        computation_offset: u64,
        bump: u8,
    ) {
        self.vault = vault;
        self.encrypted_plan = encrypted_plan;
        self.nonce = nonce;
        self.plan_id = plan_id;
        self.total_splits = total_splits;
        self.completed_splits = 0;
        self.status = WithdrawalStatus::Pending;
        self.total_amount = total_amount;
        self.withdrawn_amount = 0;
        self.created_at = created_at;
        self.expires_at = expires_at;
        self.last_execution_at = 0;
        self.computation_offset = computation_offset;
        self.bump = bump;
    }

    /// Record a completed split
    pub fn record_split_execution(
        &mut self,
        amount: u64,
        executed_at: i64,
    ) {
        self.completed_splits = self.completed_splits.saturating_add(1);
        self.withdrawn_amount = self.withdrawn_amount.saturating_add(amount);
        self.last_execution_at = executed_at;
        
        if self.completed_splits >= self.total_splits {
            self.status = WithdrawalStatus::Completed;
        } else {
            self.status = WithdrawalStatus::InProgress;
        }
    }

    /// Mark the plan as cancelled
    pub fn cancel(&mut self) {
        self.status = WithdrawalStatus::Cancelled;
    }

    /// Mark the plan as failed
    pub fn fail(&mut self) {
        self.status = WithdrawalStatus::Failed;
    }

    /// Check if the plan has expired
    pub fn is_expired(&self, current_timestamp: i64) -> bool {
        current_timestamp > self.expires_at
    }

    /// Check if the plan is still active
    pub fn is_active(&self) -> bool {
        matches!(self.status, WithdrawalStatus::Pending | WithdrawalStatus::InProgress)
    }

    /// Get remaining amount to withdraw
    pub fn remaining_amount(&self) -> u64 {
        self.total_amount.saturating_sub(self.withdrawn_amount)
    }
}

/// Seeds for PendingWithdrawal PDA derivation
pub const PENDING_WITHDRAWAL_SEED: &[u8] = b"pending_withdrawal";

impl Default for PendingWithdrawal {
    fn default() -> Self {
        Self {
            vault: Pubkey::default(),
            encrypted_plan: [0u8; 1024],
            nonce: [0u8; 16],
            plan_id: [0u8; 16],
            total_splits: 0,
            completed_splits: 0,
            status: WithdrawalStatus::Pending,
            total_amount: 0,
            withdrawn_amount: 0,
            created_at: 0,
            expires_at: 0,
            last_execution_at: 0,
            computation_offset: 0,
            bump: 0,
            _reserved: [0u8; 64],
        }
    }
}

/// Withdrawal request queue entry
/// 
/// Used to track withdrawal requests before plan generation
#[account]
pub struct WithdrawalRequest {
    /// The vault requesting withdrawal
    pub vault: Pubkey,
    
    /// Amount to withdraw (lamports)
    pub amount: u64,
    
    /// User-provided entropy for randomization
    pub user_entropy: [u8; 32],
    
    /// Entropy timestamp
    pub entropy_timestamp: i64,
    
    /// User's signature on the entropy
    pub entropy_signature: [u8; 64],
    
    /// Request timestamp
    pub requested_at: i64,
    
    /// Computation offset for Arcium
    pub computation_offset: u64,
    
    /// Whether plan has been generated
    pub plan_generated: bool,
    
    /// PDA bump seed
    pub bump: u8,
}

impl WithdrawalRequest {
    /// Account space including discriminator
    pub const SPACE: usize = 8 +  // discriminator
        32 +  // vault
        8 +   // amount
        32 +  // user_entropy
        8 +   // entropy_timestamp
        64 +  // entropy_signature
        8 +   // requested_at
        8 +   // computation_offset
        1 +   // plan_generated
        1;    // bump
}

/// Seeds for WithdrawalRequest PDA derivation
pub const WITHDRAWAL_REQUEST_SEED: &[u8] = b"withdrawal_request";

impl Default for WithdrawalRequest {
    fn default() -> Self {
        Self {
            vault: Pubkey::default(),
            amount: 0,
            user_entropy: [0u8; 32],
            entropy_timestamp: 0,
            entropy_signature: [0u8; 64],
            requested_at: 0,
            computation_offset: 0,
            plan_generated: false,
            bump: 0,
        }
    }
}
