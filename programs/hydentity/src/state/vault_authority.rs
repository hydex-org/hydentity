use anchor_lang::prelude::*;

/// VaultAuthority - Token authority for SPL token operations
/// 
/// This PDA serves as the authority for associated token accounts
/// held by the vault. It allows the program to transfer SPL tokens
/// on behalf of the vault.
/// 
/// PDA Seeds: ["vault_auth", sns_name_account_pubkey]
#[account]
#[derive(Default)]
pub struct VaultAuthority {
    /// The vault this authority is associated with
    pub vault: Pubkey,
    
    /// The SNS name account (for verification)
    pub sns_name: Pubkey,
    
    /// Bump seed for PDA derivation
    pub bump: u8,
    
    /// Reserved space for future upgrades
    pub _reserved: [u8; 32],
}

impl VaultAuthority {
    /// Account size for rent calculation
    pub const LEN: usize = 8 + // discriminator
        32 + // vault
        32 + // sns_name
        1 +  // bump
        32;  // reserved
    
    /// Initialize the vault authority
    pub fn initialize(&mut self, vault: Pubkey, sns_name: Pubkey, bump: u8) {
        self.vault = vault;
        self.sns_name = sns_name;
        self.bump = bump;
        self._reserved = [0u8; 32];
    }
    
    /// Get the signer seeds for CPI calls
    pub fn signer_seeds<'a>(&'a self, sns_name_bytes: &'a [u8]) -> [&'a [u8]; 3] {
        [
            crate::constants::VAULT_AUTH_SEED,
            sns_name_bytes,
            std::slice::from_ref(&self.bump),
        ]
    }
}

