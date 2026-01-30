use anchor_lang::prelude::*;
use crate::constants::{VAULT_SEED, VAULT_AUTH_SEED, POLICY_SEED};
use crate::errors::HydentityError;
use crate::events::VaultClosed;
use crate::state::{NameVault, VaultAuthority, PrivacyPolicy};

/// Close a vault and reclaim rent
///
/// The owner closes their vault. No balance checks - user is responsible
/// for clearing funds first. Anchor's `close = owner` transfers all lamports
/// (rent + any deposited SOL) from each PDA back to the owner.
/// SPL token ATAs associated with the vault authority will become orphaned.
#[derive(Accounts)]
pub struct CloseVault<'info> {
    /// The vault owner (must be signer, receives closed account lamports)
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The SNS name account
    /// CHECK: Validated via vault's sns_name field
    pub sns_name_account: UncheckedAccount<'info>,

    /// The vault to close
    #[account(
        mut,
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump = vault.bump,
        constraint = vault.owner == owner.key() @ HydentityError::Unauthorized,
        constraint = vault.sns_name == sns_name_account.key() @ HydentityError::InvalidSnsName,
        constraint = !vault.domain_transferred @ HydentityError::DomainAlreadyTransferred,
        close = owner,
    )]
    pub vault: Account<'info, NameVault>,

    /// The vault authority to close
    #[account(
        mut,
        seeds = [VAULT_AUTH_SEED, sns_name_account.key().as_ref()],
        bump = vault_authority.bump,
        close = owner,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,

    /// The privacy policy to close
    #[account(
        mut,
        seeds = [POLICY_SEED, sns_name_account.key().as_ref()],
        bump = policy.bump,
        close = owner,
    )]
    pub policy: Account<'info, PrivacyPolicy>,
}

pub fn handler(ctx: Context<CloseVault>) -> Result<()> {
    let clock = Clock::get()?;

    emit!(VaultClosed {
        vault: ctx.accounts.vault.key(),
        owner: ctx.accounts.owner.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Vault closed by owner: {}", ctx.accounts.owner.key());

    Ok(())
}
