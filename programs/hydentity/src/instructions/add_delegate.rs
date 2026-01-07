use anchor_lang::prelude::*;
use crate::constants::{VAULT_SEED, DELEGATE_SEED};
use crate::errors::HydentityError;
use crate::state::{NameVault, DelegateSession};

/// Add a delegate with time-bounded execution permissions
/// 
/// Only the vault owner can add delegates. Delegates can be granted
/// specific permissions to act on behalf of the owner.
#[derive(Accounts)]
pub struct AddDelegate<'info> {
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
    
    /// The delegate's public key
    /// CHECK: Any valid pubkey can be a delegate
    pub delegate: UncheckedAccount<'info>,
    
    /// The delegate session PDA to be created
    #[account(
        init,
        payer = owner,
        space = DelegateSession::LEN,
        seeds = [DELEGATE_SEED, sns_name_account.key().as_ref(), delegate.key().as_ref()],
        bump
    )]
    pub delegate_session: Account<'info, DelegateSession>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AddDelegate>,
    expires_at: i64,
    permissions: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    
    // Validate expiration is in the future
    if expires_at <= now {
        return Err(HydentityError::DelegateExpired.into());
    }
    
    let owner = ctx.accounts.owner.key();
    let vault = &ctx.accounts.vault;
    let delegate = ctx.accounts.delegate.key();
    let sns_name = ctx.accounts.sns_name_account.key();
    
    // Initialize the delegate session
    let delegate_session = &mut ctx.accounts.delegate_session;
    delegate_session.initialize(
        vault.key(),
        sns_name,
        delegate,
        owner,
        expires_at,
        permissions,
        ctx.bumps.delegate_session,
        now,
    );
    
    msg!("Delegate added: {}", delegate);
    msg!("Permissions: {:#b}", permissions);
    msg!("Expires at: {}", expires_at);
    
    Ok(())
}

