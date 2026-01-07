use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, instruction::Instruction};
use crate::constants::{VAULT_SEED, VAULT_AUTH_SEED, SNS_NAME_PROGRAM_ID};
use crate::state::{NameVault, VaultAuthority};
use crate::errors::HydentityError;

/// Reclaim domain ownership from the vault authority
/// 
/// This instruction transfers SNS domain ownership from the vault authority PDA
/// back to a specified destination address. Only the vault owner can execute this.
/// 
/// The vault authority PDA signs the SNS transfer instruction via CPI.
#[derive(Accounts)]
pub struct ReclaimDomain<'info> {
    /// The vault owner (must be signer)
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// The SNS name account to transfer
    /// CHECK: Validated by the SNS Name Program during CPI
    #[account(mut)]
    pub sns_name_account: UncheckedAccount<'info>,
    
    /// The vault account (to verify ownership and update domain_transferred flag)
    #[account(
        mut,
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump = vault.bump,
        constraint = vault.owner == owner.key() @ HydentityError::Unauthorized,
        constraint = vault.domain_transferred @ HydentityError::DomainNotTransferred,
    )]
    pub vault: Account<'info, NameVault>,
    
    /// The vault authority PDA (current owner of the SNS domain)
    #[account(
        seeds = [VAULT_AUTH_SEED, sns_name_account.key().as_ref()],
        bump = vault_authority.bump,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,
    
    /// The destination address for the domain (where ownership will be transferred)
    /// CHECK: Can be any valid pubkey - the vault owner decides where to send
    pub destination: UncheckedAccount<'info>,
    
    /// SNS Name Program
    /// CHECK: Validated by constraint
    #[account(
        constraint = sns_name_program.key() == SNS_NAME_PROGRAM_ID @ HydentityError::InvalidSnsName
    )]
    pub sns_name_program: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ReclaimDomain>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let vault_authority = &ctx.accounts.vault_authority;
    let sns_name_account = &ctx.accounts.sns_name_account;
    let destination = &ctx.accounts.destination;
    
    msg!("Reclaiming domain ownership from vault");
    msg!("SNS name account: {}", sns_name_account.key());
    msg!("Destination: {}", destination.key());
    
    // Verify the SNS name account is currently owned by the vault authority
    // by checking the owner field in the name registry state
    let name_data = sns_name_account.try_borrow_data()?;
    let current_owner_bytes: [u8; 32] = name_data[32..64].try_into()
        .map_err(|_| HydentityError::InvalidSnsName)?;
    let current_owner = Pubkey::new_from_array(current_owner_bytes);
    
    require!(
        current_owner == vault_authority.key(),
        HydentityError::DomainNotTransferred
    );
    drop(name_data);
    
    // Build the SNS transfer instruction
    // SPL Name Service Transfer instruction format:
    // - Instruction tag: 2 (Transfer)
    // - Accounts: [name_account (writable), current_owner (signer), new_owner]
    let transfer_ix = build_sns_transfer_instruction(
        sns_name_account.key(),
        vault_authority.key(),
        destination.key(),
    );
    
    // Get signer seeds for the vault authority PDA
    let sns_name_key = vault.sns_name;
    let bump = vault_authority.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        VAULT_AUTH_SEED,
        sns_name_key.as_ref(),
        &[bump],
    ]];
    
    // Execute CPI to SNS Name Program
    // Note: destination is not passed as account - it's in instruction data
    invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.sns_name_account.to_account_info(),
            ctx.accounts.vault_authority.to_account_info(),
        ],
        signer_seeds,
    ).map_err(|_| HydentityError::SnsTransferFailed)?;
    
    // Update vault state
    vault.set_domain_transferred(false);
    
    msg!("Domain ownership successfully reclaimed");
    msg!("New owner: {}", destination.key());
    
    Ok(())
}

/// Build the SNS Name Service transfer instruction
/// 
/// Instruction format:
/// - Data: [2 (tag), ...new_owner_pubkey (32 bytes)]
/// - Accounts:
///   0. Name account (writable)
///   1. Current owner (signer)
/// 
/// Note: The new owner is passed in instruction data, NOT as an account
fn build_sns_transfer_instruction(
    name_account: Pubkey,
    current_owner: Pubkey,
    new_owner: Pubkey,
) -> Instruction {
    // Build instruction data: 1 byte tag + 32 byte new owner pubkey
    let mut data = Vec::with_capacity(33);
    data.push(2); // Transfer instruction tag
    data.extend_from_slice(new_owner.as_ref()); // New owner pubkey (32 bytes)
    
    Instruction {
        program_id: SNS_NAME_PROGRAM_ID,
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(name_account, false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(current_owner, true),
        ],
        data,
    }
}

