use anchor_lang::prelude::*;
use crate::constants::{VAULT_SEED, POLICY_SEED, DELEGATE_SEED, PERMISSION_UPDATE_POLICY};
use crate::errors::HydentityError;
use crate::state::{NameVault, PrivacyPolicy, DelegateSession, Distribution, PrivacyMode, DestinationMode};

/// Parameters for updating the privacy policy
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdatePolicyParams {
    /// Whether privacy routing is enabled
    pub enabled: Option<bool>,
    
    /// Minimum number of splits per claim
    pub min_splits: Option<u8>,
    
    /// Maximum number of splits per claim
    pub max_splits: Option<u8>,
    
    /// Minimum delay in seconds between split executions
    pub min_delay_seconds: Option<u32>,
    
    /// Maximum delay in seconds between split executions
    pub max_delay_seconds: Option<u32>,
    
    /// Distribution strategy for amount splitting
    pub distribution: Option<Distribution>,
    
    /// Privacy mode for claims
    pub privacy_mode: Option<PrivacyMode>,
    
    /// Destination selection mode
    pub destination_mode: Option<DestinationMode>,
    
    /// List of destination addresses for claims
    pub destinations: Option<Vec<Pubkey>>,
}

/// Update the privacy policy for a vault
#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    /// The caller (owner or delegate)
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// The SNS name account
    /// CHECK: Validated via vault's sns_name field
    pub sns_name_account: UncheckedAccount<'info>,
    
    /// The vault (for ownership verification)
    #[account(
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump = vault.bump,
        constraint = vault.sns_name == sns_name_account.key() @ HydentityError::InvalidSnsName
    )]
    pub vault: Account<'info, NameVault>,
    
    /// The privacy policy to update
    #[account(
        mut,
        seeds = [POLICY_SEED, sns_name_account.key().as_ref()],
        bump = policy.bump,
        constraint = policy.vault == vault.key() @ HydentityError::InvalidPolicyConfig
    )]
    pub policy: Account<'info, PrivacyPolicy>,
    
    /// Optional delegate session (if caller is not the owner)
    #[account(
        seeds = [DELEGATE_SEED, sns_name_account.key().as_ref(), authority.key().as_ref()],
        bump = delegate_session.bump,
        constraint = delegate_session.vault == vault.key() @ HydentityError::UnauthorizedDelegate
    )]
    pub delegate_session: Option<Account<'info, DelegateSession>>,
}

pub fn handler(ctx: Context<UpdatePolicy>, params: UpdatePolicyParams) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    
    let authority = ctx.accounts.authority.key();
    let vault = &ctx.accounts.vault;
    
    // Check authorization
    if vault.is_owner(&authority) {
        // Owner has full access
    } else if let Some(delegate) = &ctx.accounts.delegate_session {
        // Validate delegate permission
        delegate.validate_permission(PERMISSION_UPDATE_POLICY, now)?;
    } else {
        return Err(HydentityError::Unauthorized.into());
    }
    
    let policy = &mut ctx.accounts.policy;
    
    // Apply updates
    if let Some(enabled) = params.enabled {
        policy.enabled = enabled;
    }
    if let Some(min_splits) = params.min_splits {
        policy.min_splits = min_splits;
    }
    if let Some(max_splits) = params.max_splits {
        policy.max_splits = max_splits;
    }
    if let Some(min_delay) = params.min_delay_seconds {
        policy.min_delay_seconds = min_delay;
    }
    if let Some(max_delay) = params.max_delay_seconds {
        policy.max_delay_seconds = max_delay;
    }
    if let Some(distribution) = params.distribution {
        policy.distribution = distribution;
    }
    if let Some(privacy_mode) = params.privacy_mode {
        policy.privacy_mode = privacy_mode;
    }
    if let Some(destination_mode) = params.destination_mode {
        policy.destination_mode = destination_mode;
    }
    if let Some(destinations) = params.destinations {
        policy.destinations = destinations;
    }
    
    // Validate and update nonce
    policy.update(now)?;
    
    msg!("Policy updated. New nonce: {}", policy.policy_nonce);
    
    Ok(())
}

