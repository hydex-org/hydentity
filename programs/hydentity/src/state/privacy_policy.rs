use anchor_lang::prelude::*;
use crate::constants::MAX_DESTINATIONS;

/// Distribution strategy for splitting amounts
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum Distribution {
    /// Equal distribution across splits
    #[default]
    Uniform,
    /// Weighted random distribution (more variance)
    Weighted,
    /// Exponential decay (first splits are larger)
    ExponentialDecay,
}

/// Privacy mode for claims
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum PrivacyMode {
    /// Full privacy through Umbra mixer
    #[default]
    FullPrivacy,
    /// Partial privacy (some splits may be direct)
    PartialPrivacy,
    /// Direct transfer (no privacy, for debugging/testing)
    Direct,
}

/// Destination selection mode
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum DestinationMode {
    /// Use a single destination address
    #[default]
    Single,
    /// Rotate through destination addresses
    Rotating,
    /// Random selection from destinations
    Random,
}

/// PrivacyPolicy - User-configurable privacy settings for claims
/// 
/// Controls how funds are withdrawn from Umbra to the private wallet.
/// 
/// IMPORTANT: These settings apply to the CLAIM side (Umbra → Private Wallet),
/// NOT the deposit side (Vault → Umbra). Deposits are always full-amount
/// single transactions to avoid creating observable patterns.
/// 
/// Flow:
///   Vault ══[full amount]══► Umbra ──[splits + delays]──► Private Wallet
/// 
/// PDA Seeds: ["policy", sns_name_account_pubkey]
#[account]
pub struct PrivacyPolicy {
    /// The vault this policy is associated with
    pub vault: Pubkey,
    
    /// The SNS name account (for verification)
    pub sns_name: Pubkey,
    
    /// Whether privacy routing is enabled
    pub enabled: bool,
    
    /// Minimum number of withdrawal splits from Umbra to private wallet
    pub min_splits: u8,
    
    /// Maximum number of withdrawal splits from Umbra to private wallet
    pub max_splits: u8,
    
    /// Minimum delay in seconds between withdrawal split executions
    pub min_delay_seconds: u32,
    
    /// Maximum delay in seconds between withdrawal split executions
    pub max_delay_seconds: u32,
    
    /// Distribution strategy for amount splitting
    pub distribution: Distribution,
    
    /// Privacy mode for claims
    pub privacy_mode: PrivacyMode,
    
    /// Destination selection mode
    pub destination_mode: DestinationMode,
    
    /// List of destination addresses for claims
    pub destinations: Vec<Pubkey>,
    
    /// Policy version nonce (increments on each update)
    pub policy_nonce: u64,
    
    /// Timestamp of last policy update
    pub updated_at: i64,
    
    /// Bump seed for PDA derivation
    pub bump: u8,
    
    /// Reserved space for future upgrades
    pub _reserved: [u8; 64],
}

impl Default for PrivacyPolicy {
    fn default() -> Self {
        Self {
            vault: Pubkey::default(),
            sns_name: Pubkey::default(),
            enabled: true,
            min_splits: crate::constants::DEFAULT_MIN_SPLITS,
            max_splits: crate::constants::DEFAULT_MAX_SPLITS,
            min_delay_seconds: crate::constants::DEFAULT_MIN_DELAY_SECONDS,
            max_delay_seconds: crate::constants::DEFAULT_MAX_DELAY_SECONDS,
            distribution: Distribution::default(),
            privacy_mode: PrivacyMode::default(),
            destination_mode: DestinationMode::default(),
            destinations: Vec::new(),
            policy_nonce: 0,
            updated_at: 0,
            bump: 0,
            _reserved: [0u8; 64],
        }
    }
}

impl PrivacyPolicy {
    /// Account size for rent calculation (with max destinations)
    pub const LEN: usize = 8 + // discriminator
        32 + // vault
        32 + // sns_name
        1 +  // enabled
        1 +  // min_splits
        1 +  // max_splits
        4 +  // min_delay_seconds
        4 +  // max_delay_seconds
        1 +  // distribution
        1 +  // privacy_mode
        1 +  // destination_mode
        4 + (32 * MAX_DESTINATIONS) + // destinations vec (len + data)
        8 +  // policy_nonce
        8 +  // updated_at
        1 +  // bump
        64;  // reserved
    
    /// Initialize the policy with default values
    pub fn initialize(
        &mut self,
        vault: Pubkey,
        sns_name: Pubkey,
        owner: Pubkey,
        bump: u8,
        now: i64,
    ) {
        self.vault = vault;
        self.sns_name = sns_name;
        self.enabled = true;
        self.min_splits = crate::constants::DEFAULT_MIN_SPLITS;
        self.max_splits = crate::constants::DEFAULT_MAX_SPLITS;
        self.min_delay_seconds = crate::constants::DEFAULT_MIN_DELAY_SECONDS;
        self.max_delay_seconds = crate::constants::DEFAULT_MAX_DELAY_SECONDS;
        self.distribution = Distribution::Uniform;
        self.privacy_mode = PrivacyMode::FullPrivacy;
        self.destination_mode = DestinationMode::Single;
        self.destinations = vec![owner]; // Default to owner as destination
        self.policy_nonce = 0;
        self.updated_at = now;
        self.bump = bump;
        self._reserved = [0u8; 64];
    }
    
    /// Validate the policy configuration
    pub fn validate(&self) -> Result<()> {
        // Check split range
        if self.min_splits > self.max_splits {
            return Err(crate::errors::HydentityError::InvalidSplitRange.into());
        }
        
        // Check delay range
        if self.min_delay_seconds > self.max_delay_seconds {
            return Err(crate::errors::HydentityError::InvalidDelayRange.into());
        }
        
        // Check destinations
        if self.destinations.len() > MAX_DESTINATIONS {
            return Err(crate::errors::HydentityError::TooManyDestinations.into());
        }
        
        Ok(())
    }
    
    /// Update the policy and increment nonce
    pub fn update(&mut self, now: i64) -> Result<()> {
        self.validate()?;
        self.policy_nonce = self.policy_nonce
            .checked_add(1)
            .ok_or(crate::errors::HydentityError::ArithmeticOverflow)?;
        self.updated_at = now;
        Ok(())
    }
}

