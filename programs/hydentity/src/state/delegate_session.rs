use anchor_lang::prelude::*;
use crate::constants::{PERMISSION_UPDATE_POLICY, PERMISSION_DEPOSIT_UMBRA};

/// DelegateSession - Time-bounded execution permissions
/// 
/// Allows vault owners to grant temporary permissions to other
/// accounts for executing specific operations on their behalf.
/// 
/// PDA Seeds: ["delegate", sns_name_account_pubkey, delegate_pubkey]
#[account]
#[derive(Default)]
pub struct DelegateSession {
    /// The vault this delegate is associated with
    pub vault: Pubkey,
    
    /// The SNS name account (for verification)
    pub sns_name: Pubkey,
    
    /// The delegate's public key
    pub delegate: Pubkey,
    
    /// The vault owner who granted this delegation
    pub granted_by: Pubkey,
    
    /// Unix timestamp when this delegation expires
    pub expires_at: i64,
    
    /// Permission flags (bitmap)
    /// Bit 0: Can update policy
    /// Bit 1: Can deposit to Umbra
    pub permissions: u8,
    
    /// Timestamp when this delegation was created
    pub created_at: i64,
    
    /// Bump seed for PDA derivation
    pub bump: u8,
    
    /// Reserved space for future upgrades
    pub _reserved: [u8; 32],
}

impl DelegateSession {
    /// Account size for rent calculation
    pub const LEN: usize = 8 + // discriminator
        32 + // vault
        32 + // sns_name
        32 + // delegate
        32 + // granted_by
        8 +  // expires_at
        1 +  // permissions
        8 +  // created_at
        1 +  // bump
        32;  // reserved
    
    /// Initialize the delegate session
    pub fn initialize(
        &mut self,
        vault: Pubkey,
        sns_name: Pubkey,
        delegate: Pubkey,
        granted_by: Pubkey,
        expires_at: i64,
        permissions: u8,
        bump: u8,
        now: i64,
    ) {
        self.vault = vault;
        self.sns_name = sns_name;
        self.delegate = delegate;
        self.granted_by = granted_by;
        self.expires_at = expires_at;
        self.permissions = permissions;
        self.created_at = now;
        self.bump = bump;
        self._reserved = [0u8; 32];
    }
    
    /// Check if the delegate session is still valid
    pub fn is_valid(&self, now: i64) -> bool {
        now < self.expires_at
    }
    
    /// Check if delegate has permission to update policy
    pub fn can_update_policy(&self) -> bool {
        self.permissions & PERMISSION_UPDATE_POLICY != 0
    }
    
    /// Check if delegate has permission to deposit to Umbra
    pub fn can_deposit_umbra(&self) -> bool {
        self.permissions & PERMISSION_DEPOSIT_UMBRA != 0
    }
    
    /// Validate delegate for a specific permission
    pub fn validate_permission(&self, permission: u8, now: i64) -> Result<()> {
        // Check if session is expired
        if !self.is_valid(now) {
            return Err(crate::errors::HydentityError::DelegateExpired.into());
        }
        
        // Check if delegate has the required permission
        if self.permissions & permission == 0 {
            return Err(crate::errors::HydentityError::InsufficientPermissions.into());
        }
        
        Ok(())
    }
}

