use anchor_lang::prelude::*;

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub sns_name: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ConfigStored {
    pub vault: Pubkey,
    pub config_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct WithdrawalRequested {
    pub vault: Pubkey,
    pub amount: u64,
    pub computation_offset: u64,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawalPlanGenerated {
    pub vault: Pubkey,
    pub plan_id: [u8; 16],
    pub total_splits: u8,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawalCompleted {
    pub vault: Pubkey,
    pub total_amount: u64,
    pub split_count: u8,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawalCancelled {
    pub vault: Pubkey,
    pub refunded_amount: u64,
    pub completed_splits: u8,
    pub timestamp: i64,
}

#[event]
pub struct VaultClosed {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultClaimed {
    pub vault: Pubkey,
    pub previous_owner: Pubkey,
    pub new_owner: Pubkey,
    pub timestamp: i64,
}
