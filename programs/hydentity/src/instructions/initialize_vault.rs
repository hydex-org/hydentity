use anchor_lang::prelude::*;
use crate::constants::{VAULT_SEED, VAULT_AUTH_SEED, POLICY_SEED, SNS_NAME_PROGRAM_ID};
use crate::state::{NameVault, VaultAuthority, PrivacyPolicy};
use crate::errors::HydentityError;

/// Initialize a new vault for an SNS name
/// 
/// This instruction creates:
/// - NameVault PDA to hold funds
/// - VaultAuthority PDA for SPL token operations
/// - PrivacyPolicy PDA with default settings
/// 
/// The instruction verifies SNS ownership by:
/// 1. Checking the sns_name_account is owned by the SNS Name Program
/// 2. Parsing the owner from the SNS account data structure
/// 3. Verifying the signer matches the SNS domain owner
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    /// The owner of the SNS name (must be signer)
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// The SNS name account that this vault is for
    /// CHECK: Validated in handler by verifying:
    /// 1. Account is owned by SNS Name Program
    /// 2. Owner field in account data matches signer
    #[account(
        constraint = sns_name_account.owner == &SNS_NAME_PROGRAM_ID @ HydentityError::InvalidSnsName
    )]
    pub sns_name_account: UncheckedAccount<'info>,
    
    /// The vault PDA to be created
    #[account(
        init,
        payer = owner,
        space = NameVault::LEN,
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, NameVault>,
    
    /// The vault authority PDA to be created
    #[account(
        init,
        payer = owner,
        space = VaultAuthority::LEN,
        seeds = [VAULT_AUTH_SEED, sns_name_account.key().as_ref()],
        bump
    )]
    pub vault_authority: Account<'info, VaultAuthority>,
    
    /// The privacy policy PDA to be created
    #[account(
        init,
        payer = owner,
        space = PrivacyPolicy::LEN,
        seeds = [POLICY_SEED, sns_name_account.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, PrivacyPolicy>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
}

/// Verify that the signer owns the SNS name account
/// 
/// SNS Name Account Data Layout:
/// - bytes 0-32: parent_name (Pubkey)
/// - bytes 32-64: owner (Pubkey) <- This is what we verify
/// - bytes 64-96: class (Pubkey)
/// - bytes 96+: data (variable)
fn verify_sns_ownership(sns_account: &AccountInfo, expected_owner: &Pubkey) -> Result<()> {
    let data = sns_account.try_borrow_data()?;
    
    // Ensure account has enough data for the owner field
    if data.len() < 64 {
        return Err(HydentityError::InvalidSnsName.into());
    }
    
    // Extract the owner pubkey from offset 32
    let owner_bytes: [u8; 32] = data[32..64]
        .try_into()
        .map_err(|_| HydentityError::InvalidSnsName)?;
    
    let sns_owner = Pubkey::new_from_array(owner_bytes);
    
    // Verify the signer is the SNS domain owner
    require!(
        sns_owner == *expected_owner,
        HydentityError::SnsOwnershipVerificationFailed
    );
    
    msg!("SNS ownership verified for domain owner: {}", sns_owner);
    Ok(())
}

pub fn handler(ctx: Context<InitializeVault>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    
    let owner = ctx.accounts.owner.key();
    let sns_name = ctx.accounts.sns_name_account.key();
    
    // Verify SNS ownership - the signer must own the SNS domain
    verify_sns_ownership(
        &ctx.accounts.sns_name_account.to_account_info(),
        &owner
    )?;
    
    // Initialize the vault
    let vault = &mut ctx.accounts.vault;
    vault.initialize(
        owner,
        sns_name,
        ctx.bumps.vault,
        now,
    );
    
    // Initialize the vault authority
    let vault_authority = &mut ctx.accounts.vault_authority;
    vault_authority.initialize(
        vault.key(),
        sns_name,
        ctx.bumps.vault_authority,
    );
    
    // Initialize the privacy policy with defaults
    let policy = &mut ctx.accounts.policy;
    policy.initialize(
        vault.key(),
        sns_name,
        owner,
        ctx.bumps.policy,
        now,
    );
    
    msg!("Vault initialized for SNS name: {}", sns_name);
    msg!("Vault address: {}", vault.key());
    msg!("Vault authority: {}", vault_authority.key());
    
    Ok(())
}

