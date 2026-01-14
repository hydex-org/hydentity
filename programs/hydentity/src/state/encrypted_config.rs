use anchor_lang::prelude::*;

/// Encrypted vault configuration account
/// 
/// This account stores the user's private vault configuration encrypted
/// using the Rescue cipher with a shared secret between the user and MXE.
/// Only the Arcium MPC cluster can decrypt this configuration during
/// withdrawal execution.
/// 
/// ## Storage Layout
/// 
/// The encrypted_data field contains a serialized PrivateVaultConfig struct
/// which includes destination wallets, split settings, delay settings, and
/// auto-withdrawal preferences - all encrypted.
/// 
/// ## Privacy Guarantees
/// 
/// - Destination wallets are never visible on-chain
/// - Configuration changes don't reveal old or new values
/// - Only the config_hash changes on updates (hash doesn't reveal contents)
#[account]
pub struct EncryptedVaultConfig {
    /// The vault this config belongs to
    pub vault: Pubkey,
    
    /// Encrypted configuration data (Rescue cipher)
    /// Contains serialized PrivateVaultConfig
    /// Size is fixed to accommodate maximum config size with padding
    pub encrypted_data: [u8; 512],
    
    /// Nonce used for Rescue cipher encryption
    /// Must be unique per encryption operation
    pub nonce: [u8; 16],
    
    /// Configuration version for upgrade compatibility
    /// Incremented on each update
    pub version: u8,
    
    /// Hash of the plaintext config (computed by MPC)
    /// Allows verification without revealing contents
    pub config_hash: [u8; 32],
    
    /// Solana slot when config was last updated
    pub last_updated_slot: u64,
    
    /// Unix timestamp of last update
    pub last_updated_at: i64,
    
    /// Whether this config has been initialized
    pub is_initialized: bool,
    
    /// PDA bump seed
    pub bump: u8,
    
    /// Reserved space for future fields
    pub _reserved: [u8; 64],
}

impl EncryptedVaultConfig {
    /// Account space including discriminator
    pub const SPACE: usize = 8 +  // discriminator
        32 +   // vault
        512 +  // encrypted_data
        16 +   // nonce
        1 +    // version
        32 +   // config_hash
        8 +    // last_updated_slot
        8 +    // last_updated_at
        1 +    // is_initialized
        1 +    // bump
        64;    // reserved

    /// Initialize with encrypted data from user
    pub fn initialize(
        &mut self,
        vault: Pubkey,
        encrypted_data: [u8; 512],
        nonce: [u8; 16],
        config_hash: [u8; 32],
        current_slot: u64,
        current_timestamp: i64,
        bump: u8,
    ) {
        self.vault = vault;
        self.encrypted_data = encrypted_data;
        self.nonce = nonce;
        self.version = 1;
        self.config_hash = config_hash;
        self.last_updated_slot = current_slot;
        self.last_updated_at = current_timestamp;
        self.is_initialized = true;
        self.bump = bump;
    }

    /// Update with new encrypted config
    pub fn update(
        &mut self,
        encrypted_data: [u8; 512],
        nonce: [u8; 16],
        config_hash: [u8; 32],
        current_slot: u64,
        current_timestamp: i64,
    ) {
        self.encrypted_data = encrypted_data;
        self.nonce = nonce;
        self.config_hash = config_hash;
        self.version = self.version.saturating_add(1);
        self.last_updated_slot = current_slot;
        self.last_updated_at = current_timestamp;
    }
}

/// Seeds for EncryptedVaultConfig PDA derivation
pub const ENCRYPTED_CONFIG_SEED: &[u8] = b"encrypted_config";

impl Default for EncryptedVaultConfig {
    fn default() -> Self {
        Self {
            vault: Pubkey::default(),
            encrypted_data: [0u8; 512],
            nonce: [0u8; 16],
            version: 0,
            config_hash: [0u8; 32],
            last_updated_slot: 0,
            last_updated_at: 0,
            is_initialized: false,
            bump: 0,
            _reserved: [0u8; 64],
        }
    }
}
