use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, transfer};
use crate::constants::{VAULT_SEED, VAULT_AUTH_SEED};
use crate::errors::HydentityError;
use crate::state::{NameVault, VaultAuthority};

/// Emergency direct withdrawal (bypasses privacy)
/// 
/// This instruction allows the vault owner to directly withdraw funds
/// without going through Umbra. This is a fallback mechanism for
/// recovering funds if off-chain services fail.
/// 
/// ONLY the vault owner can execute this - delegates cannot.
#[derive(Accounts)]
pub struct WithdrawDirect<'info> {
    /// The vault owner (must be signer)
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// The SNS name account
    /// CHECK: Validated via vault's sns_name field
    pub sns_name_account: UncheckedAccount<'info>,
    
    /// The vault holding the funds
    #[account(
        mut,
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump = vault.bump,
        constraint = vault.sns_name == sns_name_account.key() @ HydentityError::InvalidSnsName,
        constraint = vault.owner == owner.key() @ HydentityError::Unauthorized
    )]
    pub vault: Account<'info, NameVault>,
    
    /// The vault authority for signing SPL transfers and holding SOL deposits
    #[account(
        mut,
        seeds = [VAULT_AUTH_SEED, sns_name_account.key().as_ref()],
        bump = vault_authority.bump,
        constraint = vault_authority.vault == vault.key() @ HydentityError::InvalidPolicyConfig
    )]
    pub vault_authority: Account<'info, VaultAuthority>,
    
    /// The destination for the withdrawal
    /// CHECK: Any valid account can receive funds
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
    
    /// Optional: Vault's token account for SPL transfers
    #[account(
        mut,
        token::authority = vault_authority
    )]
    pub vault_token_account: Option<Account<'info, TokenAccount>>,
    
    /// Optional: Destination's token account for SPL transfers
    #[account(mut)]
    pub destination_token_account: Option<Account<'info, TokenAccount>>,
    
    /// Token program for SPL transfers
    pub token_program: Program<'info, Token>,
    
    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<WithdrawDirect>,
    amount: u64,
    _mint: Option<Pubkey>,
) -> Result<()> {
    let vault = &ctx.accounts.vault;
    
    msg!("Emergency direct withdrawal initiated by owner: {}", ctx.accounts.owner.key());
    
    // Check if this is an SPL token transfer
    if let Some(vault_token_account) = &ctx.accounts.vault_token_account {
        // SPL token withdrawal
        if vault_token_account.amount < amount {
            return Err(HydentityError::InsufficientBalance.into());
        }
        
        let destination_token = ctx.accounts.destination_token_account
            .as_ref()
            .ok_or(HydentityError::InvalidMint)?;
        
        // Build signer seeds for vault authority
        let sns_name_key = ctx.accounts.sns_name_account.key();
        let vault_auth_bump = ctx.accounts.vault_authority.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            crate::constants::VAULT_AUTH_SEED,
            sns_name_key.as_ref(),
            &[vault_auth_bump],
        ]];
        
        // Transfer SPL tokens to destination
        let cpi_accounts = Transfer {
            from: vault_token_account.to_account_info(),
            to: destination_token.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        transfer(cpi_ctx, amount)?;
        
        msg!("Direct withdrawal: {} SPL tokens to {}", amount, ctx.accounts.destination.key());
    } else {
        // SOL withdrawal from vault authority (where deposits are held)
        let vault_auth_info = ctx.accounts.vault_authority.to_account_info();
        let vault_auth_lamports = vault_auth_info.lamports();
        let rent = Rent::get()?.minimum_balance(VaultAuthority::LEN);
        let available = vault_auth_lamports.saturating_sub(rent);

        if available < amount {
            return Err(HydentityError::InsufficientBalance.into());
        }

        // Transfer SOL from vault authority to destination
        let destination_info = ctx.accounts.destination.to_account_info();

        **vault_auth_info.try_borrow_mut_lamports()? -= amount;
        **destination_info.try_borrow_mut_lamports()? += amount;

        msg!("Direct withdrawal: {} lamports to {}", amount, ctx.accounts.destination.key());
    }
    
    msg!("WARNING: This withdrawal bypasses privacy protections");
    msg!("Vault: {}", vault.key());
    
    Ok(())
}

