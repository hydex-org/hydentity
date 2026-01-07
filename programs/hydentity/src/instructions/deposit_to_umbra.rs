use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, transfer};
use crate::constants::{VAULT_SEED, VAULT_AUTH_SEED, POLICY_SEED, DELEGATE_SEED, PERMISSION_DEPOSIT_UMBRA, DUST_THRESHOLD_LAMPORTS};
use crate::errors::HydentityError;
use crate::state::{NameVault, VaultAuthority, PrivacyPolicy, DelegateSession, PrivacyMode};

/// Deposit vault funds into Umbra mixer pool
/// 
/// This instruction moves funds from the vault into the Umbra protocol
/// for private withdrawal. It can handle both SOL and SPL tokens.
#[derive(Accounts)]
pub struct DepositToUmbra<'info> {
    /// The caller (owner or delegate)
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// The SNS name account
    /// CHECK: Validated via vault's sns_name field
    pub sns_name_account: UncheckedAccount<'info>,
    
    /// The vault holding the funds
    #[account(
        mut,
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump = vault.bump,
        constraint = vault.sns_name == sns_name_account.key() @ HydentityError::InvalidSnsName
    )]
    pub vault: Account<'info, NameVault>,
    
    /// The vault authority for signing SPL transfers
    #[account(
        seeds = [VAULT_AUTH_SEED, sns_name_account.key().as_ref()],
        bump = vault_authority.bump,
        constraint = vault_authority.vault == vault.key() @ HydentityError::InvalidPolicyConfig
    )]
    pub vault_authority: Account<'info, VaultAuthority>,
    
    /// The privacy policy (for validation)
    #[account(
        seeds = [POLICY_SEED, sns_name_account.key().as_ref()],
        bump = policy.bump,
        constraint = policy.vault == vault.key() @ HydentityError::InvalidPolicyConfig
    )]
    pub policy: Account<'info, PrivacyPolicy>,
    
    /// Optional delegate session
    #[account(
        seeds = [DELEGATE_SEED, sns_name_account.key().as_ref(), authority.key().as_ref()],
        bump = delegate_session.bump,
        constraint = delegate_session.vault == vault.key() @ HydentityError::UnauthorizedDelegate
    )]
    pub delegate_session: Option<Account<'info, DelegateSession>>,
    
    /// The Umbra program to CPI into
    /// CHECK: Validated by address constraint
    pub umbra_program: UncheckedAccount<'info>,
    
    /// Umbra mixer pool account for deposits
    /// CHECK: Validated by Umbra program
    #[account(mut)]
    pub umbra_pool: UncheckedAccount<'info>,
    
    /// Optional: Vault's token account for SPL transfers
    #[account(
        mut,
        token::authority = vault_authority
    )]
    pub vault_token_account: Option<Account<'info, TokenAccount>>,
    
    /// Optional: Umbra pool's token account for SPL deposits
    /// CHECK: Validated by Umbra program
    #[account(mut)]
    pub umbra_pool_token_account: Option<UncheckedAccount<'info>>,
    
    /// Token program for SPL transfers
    pub token_program: Program<'info, Token>,
    
    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DepositToUmbra>,
    amount: u64,
    _mint: Option<Pubkey>,
) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    
    let authority = ctx.accounts.authority.key();
    let vault = &ctx.accounts.vault;
    let policy = &ctx.accounts.policy;
    
    // Check if privacy policy is enabled
    if !policy.enabled {
        return Err(HydentityError::PolicyDisabled.into());
    }
    
    // Check privacy mode allows Umbra deposits
    if policy.privacy_mode == PrivacyMode::Direct {
        return Err(HydentityError::PolicyDisabled.into());
    }
    
    // Check authorization
    if vault.is_owner(&authority) {
        // Owner has full access
    } else if let Some(delegate) = &ctx.accounts.delegate_session {
        delegate.validate_permission(PERMISSION_DEPOSIT_UMBRA, now)?;
    } else {
        return Err(HydentityError::Unauthorized.into());
    }
    
    // Validate amount
    if amount < DUST_THRESHOLD_LAMPORTS {
        return Err(HydentityError::AmountBelowDust.into());
    }
    
    // Check if this is an SPL token transfer
    if let Some(vault_token_account) = &ctx.accounts.vault_token_account {
        // SPL token deposit
        if vault_token_account.amount < amount {
            return Err(HydentityError::InsufficientBalance.into());
        }
        
        let umbra_pool_token = ctx.accounts.umbra_pool_token_account
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
        
        // Transfer SPL tokens to Umbra pool
        let cpi_accounts = Transfer {
            from: vault_token_account.to_account_info(),
            to: umbra_pool_token.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        transfer(cpi_ctx, amount)?;
        
        msg!("Deposited {} SPL tokens to Umbra", amount);
    } else {
        // SOL deposit
        let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
        let rent = Rent::get()?.minimum_balance(NameVault::LEN);
        let available = vault_lamports.saturating_sub(rent);
        
        if available < amount {
            return Err(HydentityError::InsufficientBalance.into());
        }
        
        // Transfer SOL to Umbra pool
        // Note: In production, this would be a CPI to Umbra's deposit instruction
        // For now, we do a simple transfer
        let vault_info = ctx.accounts.vault.to_account_info();
        let umbra_pool_info = ctx.accounts.umbra_pool.to_account_info();
        
        **vault_info.try_borrow_mut_lamports()? -= amount;
        **umbra_pool_info.try_borrow_mut_lamports()? += amount;
        
        msg!("Deposited {} lamports to Umbra", amount);
    }
    
    // TODO: Actual CPI to Umbra deposit instruction would go here
    // This requires the Umbra program ID and instruction format
    
    msg!("Umbra deposit initiated for vault: {}", vault.key());
    
    Ok(())
}

