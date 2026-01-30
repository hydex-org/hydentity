use anchor_lang::prelude::*;
use crate::constants::{VAULT_SEED, POLICY_SEED, SNS_NAME_PROGRAM_ID};
use crate::errors::HydentityError;
use crate::events::VaultClaimed;
use crate::state::{NameVault, PrivacyPolicy};

/// Claim an existing vault after domain transfer/sale
///
/// The new SNS domain owner takes over an existing vault.
/// Verifies the signer is the current SNS domain owner,
/// updates vault ownership, and resets the privacy policy.
#[derive(Accounts)]
pub struct ClaimVault<'info> {
    /// The new domain owner (must be signer)
    #[account(mut)]
    pub new_owner: Signer<'info>,

    /// The SNS name account
    /// CHECK: Validated by constraint and in handler via verify_sns_ownership
    #[account(
        constraint = sns_name_account.owner == &SNS_NAME_PROGRAM_ID @ HydentityError::InvalidSnsName
    )]
    pub sns_name_account: UncheckedAccount<'info>,

    /// The vault to claim
    #[account(
        mut,
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump = vault.bump,
        constraint = vault.sns_name == sns_name_account.key() @ HydentityError::InvalidSnsName,
        constraint = vault.owner != new_owner.key() @ HydentityError::VaultOwnerUnchanged,
    )]
    pub vault: Account<'info, NameVault>,

    /// The privacy policy to reset
    #[account(
        mut,
        seeds = [POLICY_SEED, sns_name_account.key().as_ref()],
        bump = policy.bump,
        constraint = policy.vault == vault.key() @ HydentityError::InvalidPolicyConfig,
    )]
    pub policy: Account<'info, PrivacyPolicy>,
}

/// Verify that the signer owns the SNS name account
fn verify_sns_ownership(sns_account: &AccountInfo, expected_owner: &Pubkey) -> Result<()> {
    let data = sns_account.try_borrow_data()?;

    if data.len() < 64 {
        return Err(HydentityError::InvalidSnsName.into());
    }

    let owner_bytes: [u8; 32] = data[32..64]
        .try_into()
        .map_err(|_| HydentityError::InvalidSnsName)?;

    let sns_owner = Pubkey::new_from_array(owner_bytes);

    require!(
        sns_owner == *expected_owner,
        HydentityError::SnsOwnershipVerificationFailed
    );

    msg!("SNS ownership verified for domain owner: {}", sns_owner);
    Ok(())
}

pub fn handler(ctx: Context<ClaimVault>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // Verify the signer is the current SNS domain owner
    verify_sns_ownership(
        &ctx.accounts.sns_name_account.to_account_info(),
        &ctx.accounts.new_owner.key(),
    )?;

    let previous_owner = ctx.accounts.vault.owner;

    // Update vault owner
    let vault = &mut ctx.accounts.vault;
    vault.owner = ctx.accounts.new_owner.key();

    // Reset policy for new owner
    let policy = &mut ctx.accounts.policy;
    policy.destinations = vec![ctx.accounts.new_owner.key()];
    policy.policy_nonce = policy.policy_nonce
        .checked_add(1)
        .ok_or(HydentityError::ArithmeticOverflow)?;
    policy.updated_at = now;

    emit!(VaultClaimed {
        vault: ctx.accounts.vault.key(),
        previous_owner,
        new_owner: ctx.accounts.new_owner.key(),
        timestamp: now,
    });

    msg!("Vault claimed by new owner: {}", ctx.accounts.new_owner.key());
    msg!("Previous owner: {}", previous_owner);

    Ok(())
}
