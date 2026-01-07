use anchor_lang::prelude::*;

/// NameVault - Holds received funds for an SNS name
/// 
/// This is the main vault account that receives SOL and SPL tokens
/// when someone sends to the user's .sol domain. The vault is program-controlled
/// and can only be accessed by the owner or authorized delegates.
/// 
/// PDA Seeds: ["vault", sns_name_account_pubkey]
#[account]
#[derive(Default)]
pub struct NameVault {
    /// The owner of this vault (SNS name owner at initialization time)
    pub owner: Pubkey,
    
    /// The SNS name account public key this vault is associated with
    pub sns_name: Pubkey,
    
    /// Total SOL received (for tracking/analytics)
    pub total_sol_received: u64,
    
    /// Total number of deposits received
    pub deposit_count: u64,
    
    /// Timestamp of vault creation
    pub created_at: i64,
    
    /// Timestamp of last deposit
    pub last_deposit_at: i64,
    
    /// Bump seed for PDA derivation
    pub bump: u8,
    
    /// Whether the SNS domain ownership has been transferred to the vault authority
    /// When true, the vault authority PDA owns the domain for enhanced privacy
    pub domain_transferred: bool,
    
    /// Reserved space for future upgrades (split for Default trait)
    pub _reserved1: [u8; 31],  // Reduced by 1 to accommodate domain_transferred
    pub _reserved2: [u8; 32],
}

impl NameVault {
    /// Account size for rent calculation
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        32 + // sns_name
        8 +  // total_sol_received
        8 +  // deposit_count
        8 +  // created_at
        8 +  // last_deposit_at
        1 +  // bump
        1 +  // domain_transferred
        31 + // reserved1
        32;  // reserved2
    
    /// Initialize the vault with owner and SNS name
    pub fn initialize(&mut self, owner: Pubkey, sns_name: Pubkey, bump: u8, now: i64) {
        self.owner = owner;
        self.sns_name = sns_name;
        self.total_sol_received = 0;
        self.deposit_count = 0;
        self.created_at = now;
        self.last_deposit_at = 0;
        self.bump = bump;
        self.domain_transferred = false;
        self._reserved1 = [0u8; 31];
        self._reserved2 = [0u8; 32];
    }
    
    /// Record a new deposit
    pub fn record_deposit(&mut self, amount: u64, now: i64) -> Result<()> {
        self.total_sol_received = self.total_sol_received
            .checked_add(amount)
            .ok_or(crate::errors::HydentityError::ArithmeticOverflow)?;
        self.deposit_count = self.deposit_count
            .checked_add(1)
            .ok_or(crate::errors::HydentityError::ArithmeticOverflow)?;
        self.last_deposit_at = now;
        Ok(())
    }
    
    /// Check if caller is the vault owner
    pub fn is_owner(&self, caller: &Pubkey) -> bool {
        self.owner == *caller
    }
    
    /// Mark domain as transferred to vault
    pub fn set_domain_transferred(&mut self, transferred: bool) {
        self.domain_transferred = transferred;
    }
}
