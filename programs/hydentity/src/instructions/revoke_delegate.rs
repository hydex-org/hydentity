use anchor_lang::prelude::*;
use crate::constants::{VAULT_SEED, DELEGATE_SEED};
use crate::errors::HydentityError;
use crate::state::{NameVault, DelegateSession};

/// Revoke delegate permissions
/// 
/// Only the vault owner can revoke delegates. This closes the
/// delegate session account and returns rent to the owner.
#[derive(Accounts)]
pub struct RevokeDelegate<'info> {
    /// The vault owner (must be signer)
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// The SNS name account
    /// CHECK: Validated via vault's sns_name field
    pub sns_name_account: UncheckedAccount<'info>,
    
    /// The vault (for ownership verification)
    #[account(
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump = vault.bump,
        constraint = vault.sns_name == sns_name_account.key() @ HydentityError::InvalidSnsName,
        constraint = vault.owner == owner.key() @ HydentityError::Unauthorized
    )]
    pub vault: Account<'info, NameVault>,
    
    /// The delegate whose permissions are being revoked
    /// CHECK: Validated by delegate_session constraint
    pub delegate: UncheckedAccount<'info>,
    
    /// The delegate session to close
    #[account(
        mut,
        close = owner,
        seeds = [DELEGATE_SEED, sns_name_account.key().as_ref(), delegate.key().as_ref()],
        bump = delegate_session.bump,
        constraint = delegate_session.vault == vault.key() @ HydentityError::DelegateNotFound
    )]
    pub delegate_session: Account<'info, DelegateSession>,
}

pub fn handler(ctx: Context<RevokeDelegate>) -> Result<()> {
    let delegate = ctx.accounts.delegate.key();
    
    msg!("Delegate revoked: {}", delegate);
    msg!("Session closed, rent returned to owner");
    
    Ok(())
}

