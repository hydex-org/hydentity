use anchor_lang::prelude::*;
use crate::constants::{VAULT_SEED, VAULT_AUTH_SEED, SNS_NAME_PROGRAM_ID};
use crate::state::{NameVault, VaultAuthority};
use crate::errors::HydentityError;

/// Mark domain as transferred to the vault authority
/// 
/// This instruction should be called AFTER the user has transferred their SNS domain
/// ownership to the vault authority PDA using the Bonfida SDK. It verifies the transfer
/// actually happened and updates the vault state.
/// 
/// The verification checks that the SNS name account's owner field matches the vault authority.
#[derive(Accounts)]
pub struct MarkDomainTransferred<'info> {
    /// The vault owner (must be signer)
    pub owner: Signer<'info>,
    
    /// The SNS name account that was transferred
    /// CHECK: Validated manually - must be owned by SNS Name Program
    #[account(
        constraint = sns_name_account.owner == &SNS_NAME_PROGRAM_ID @ HydentityError::InvalidSnsName
    )]
    pub sns_name_account: UncheckedAccount<'info>,
    
    /// The vault account (to verify ownership and update domain_transferred flag)
    #[account(
        mut,
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump = vault.bump,
        constraint = vault.owner == owner.key() @ HydentityError::Unauthorized,
        constraint = !vault.domain_transferred @ HydentityError::DomainAlreadyTransferred,
    )]
    pub vault: Account<'info, NameVault>,
    
    /// The vault authority PDA (should now be the owner of the SNS domain)
    #[account(
        seeds = [VAULT_AUTH_SEED, sns_name_account.key().as_ref()],
        bump = vault_authority.bump,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,
}

pub fn handler(ctx: Context<MarkDomainTransferred>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let vault_authority = &ctx.accounts.vault_authority;
    let sns_name_account = &ctx.accounts.sns_name_account;
    
    msg!("Verifying domain transfer to vault authority");
    msg!("SNS name account: {}", sns_name_account.key());
    msg!("Expected owner (vault authority): {}", vault_authority.key());
    
    // Verify the SNS name account is now owned by the vault authority
    // by checking the owner field in the name registry state
    let name_data = sns_name_account.try_borrow_data()?;
    let current_owner_bytes: [u8; 32] = name_data[32..64].try_into()
        .map_err(|_| HydentityError::InvalidSnsName)?;
    let current_owner = Pubkey::new_from_array(current_owner_bytes);
    
    msg!("Current SNS owner: {}", current_owner);
    
    require!(
        current_owner == vault_authority.key(),
        HydentityError::SnsOwnershipVerificationFailed
    );
    
    // Update vault state to mark domain as transferred
    vault.set_domain_transferred(true);
    
    msg!("Domain ownership verified and marked as transferred to vault");
    
    Ok(())
}

