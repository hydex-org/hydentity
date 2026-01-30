use anchor_lang::prelude::*;
#[cfg(feature = "arcium")]
use arcium_anchor::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod events;

use constants::*;
use errors::HydentityError;
#[cfg(feature = "arcium")]
use events::ConfigStored;
use state::{NameVault, VaultAuthority, PrivacyPolicy};
#[cfg(feature = "arcium")]
use state::{EncryptedVaultConfig, ENCRYPTED_CONFIG_SEED};

#[cfg(feature = "arcium")]
/// Computation definition offset for generate_withdrawal_plan
/// Using offset 2 (fixed) - must match the uploadCircuit SDK offset
const COMP_DEF_OFFSET_GENERATE_PLAN: u32 = 2;

declare_id!("7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx");

#[cfg(feature = "arcium")]
/// Computation definition offset for store_private_config
/// Using offset 1 (fixed) - must match the uploadCircuit SDK offset
const COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG: u32 = 1;

#[cfg_attr(feature = "arcium", arcium_program)]
#[cfg_attr(not(feature = "arcium"), program)]
pub mod hydentity {
    use super::*;

    // ========== Core Vault Instructions ==========

    /// Initialize a new vault for an SNS domain
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
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

    // ========== Domain Transfer Instructions ==========

    /// Mark a domain as transferred to the vault authority
    /// Call this after transferring SNS ownership to the vault authority PDA
    pub fn mark_domain_transferred(ctx: Context<MarkDomainTransferredAccounts>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let vault_authority = &ctx.accounts.vault_authority;
        let sns_name_account = &ctx.accounts.sns_name_account;

        msg!("Verifying domain transfer to vault authority");
        msg!("SNS name account: {}", sns_name_account.key());
        msg!("Expected owner (vault authority): {}", vault_authority.key());

        // Verify the SNS name account is now owned by the vault authority
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

    /// Reclaim domain ownership from the vault
    /// Transfers SNS ownership back from vault authority to a destination
    pub fn reclaim_domain(ctx: Context<ReclaimDomainAccounts>) -> Result<()> {
        use anchor_lang::solana_program::{program::invoke_signed, instruction::Instruction};

        let vault = &mut ctx.accounts.vault;
        let vault_authority = &ctx.accounts.vault_authority;
        let sns_name_account = &ctx.accounts.sns_name_account;
        let destination = &ctx.accounts.destination;

        msg!("Reclaiming domain ownership from vault");
        msg!("SNS name account: {}", sns_name_account.key());
        msg!("Destination: {}", destination.key());

        // Verify the SNS name account is currently owned by the vault authority
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
        let mut data = Vec::with_capacity(33);
        data.push(2); // Transfer instruction tag
        data.extend_from_slice(destination.key().as_ref());

        let transfer_ix = Instruction {
            program_id: SNS_NAME_PROGRAM_ID,
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(*sns_name_account.key, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(vault_authority.key(), true),
            ],
            data,
        };

        // Get signer seeds for the vault authority PDA
        let sns_name_key = vault.sns_name;
        let bump = vault_authority.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            VAULT_AUTH_SEED,
            sns_name_key.as_ref(),
            &[bump],
        ]];

        // Execute CPI to SNS Name Program
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

    // ========== Vault Lifecycle Instructions ==========

    /// Close a vault and reclaim rent
    /// Owner closes their vault. No balance checks - user is responsible for clearing funds first.
    /// Anchor's `close = owner` transfers all lamports from each PDA back to the owner.
    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        let clock = Clock::get()?;

        emit!(events::VaultClosed {
            vault: ctx.accounts.vault.key(),
            owner: ctx.accounts.owner.key(),
            timestamp: clock.unix_timestamp,
        });

        msg!("Vault closed by owner: {}", ctx.accounts.owner.key());

        Ok(())
    }

    /// Claim an existing vault after domain transfer/sale
    /// New domain owner takes over an existing vault.
    pub fn claim_vault(ctx: Context<ClaimVault>) -> Result<()> {
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

        emit!(events::VaultClaimed {
            vault: ctx.accounts.vault.key(),
            previous_owner,
            new_owner: ctx.accounts.new_owner.key(),
            timestamp: now,
        });

        msg!("Vault claimed by new owner: {}", ctx.accounts.new_owner.key());
        msg!("Previous owner: {}", previous_owner);

        Ok(())
    }

    // ========== Withdrawal Instructions ==========

    /// Direct withdrawal - bypass privacy features (owner only)
    pub fn withdraw_direct(
        ctx: Context<WithdrawDirectAccounts>,
        amount: u64,
        _mint: Option<Pubkey>,
    ) -> Result<()> {
        let vault_authority = &ctx.accounts.vault_authority;
        let destination = &ctx.accounts.destination;

        msg!("Emergency direct withdrawal initiated by owner: {}", ctx.accounts.owner.key());

        // For now, just do SOL transfer from vault authority
        let balance = vault_authority.to_account_info().lamports();
        if balance < amount {
            return Err(HydentityError::InsufficientBalance.into());
        }

        // Direct lamport transfer (required for PDAs with data - System Program transfer won't work)
        **vault_authority.to_account_info().try_borrow_mut_lamports()? -= amount;
        **destination.to_account_info().try_borrow_mut_lamports()? += amount;

        msg!("Transferred {} lamports to {}", amount, destination.key());

        Ok(())
    }
}

// ========== Account Structs for Domain Transfer Instructions ==========

/// Accounts for mark_domain_transferred instruction
#[derive(Accounts)]
pub struct MarkDomainTransferredAccounts<'info> {
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

/// Accounts for reclaim_domain instruction
#[derive(Accounts)]
pub struct ReclaimDomainAccounts<'info> {
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

    /// The destination address for the domain
    /// CHECK: Can be any valid pubkey - the vault owner decides where to send
    pub destination: UncheckedAccount<'info>,

    /// SNS Name Program
    /// CHECK: Validated by constraint
    #[account(
        constraint = sns_name_program.key() == SNS_NAME_PROGRAM_ID @ HydentityError::InvalidSnsName
    )]
    pub sns_name_program: UncheckedAccount<'info>,
}

/// Accounts for withdraw_direct instruction
#[derive(Accounts)]
pub struct WithdrawDirectAccounts<'info> {
    /// The vault owner (must be signer)
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The SNS name account
    /// CHECK: Validated via vault's sns_name field
    pub sns_name_account: UncheckedAccount<'info>,

    /// The vault holding the funds
    #[account(
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump = vault.bump,
        constraint = vault.sns_name == sns_name_account.key() @ HydentityError::InvalidSnsName,
        constraint = vault.owner == owner.key() @ HydentityError::Unauthorized
    )]
    pub vault: Account<'info, NameVault>,

    /// The vault authority for signing transfers
    #[account(
        mut,
        seeds = [VAULT_AUTH_SEED, sns_name_account.key().as_ref()],
        bump = vault_authority.bump,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,

    /// The destination for the withdrawal
    /// CHECK: Any valid account can receive funds
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,

    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

// ========== Vault Lifecycle Account Structs ==========

/// Accounts for close_vault instruction
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

/// Accounts for claim_vault instruction
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

// ========== Helper Functions ==========

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

// ========== Arcium Account Structs ==========

#[cfg(feature = "arcium")]
/// Local error code for Arcium macros
#[error_code]
pub enum ErrorCode {
    #[msg("The cluster is not set")]
    ClusterNotSet,
}

#[cfg(feature = "arcium")]
/// Accounts for store_private_config instruction
#[queue_computation_accounts("store_private_config", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct StorePrivateConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The vault this config is for
    #[account(
        seeds = [VAULT_SEED, vault.sns_name.as_ref()],
        bump = vault.bump,
        constraint = vault.owner == payer.key() @ HydentityError::Unauthorized
    )]
    pub vault: Account<'info, NameVault>,

    /// Encrypted config storage account
    #[account(
        init_if_needed,
        payer = payer,
        space = EncryptedVaultConfig::SPACE,
        seeds = [ENCRYPTED_CONFIG_SEED, vault.key().as_ref()],
        bump
    )]
    pub encrypted_config: Account<'info, EncryptedVaultConfig>,

    // === Arcium required accounts ===
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program
    pub mempool_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program
    pub executing_pool: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account, checked by the arcium program
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,

    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[cfg(feature = "arcium")]
/// Callback accounts for store_private_config
#[callback_accounts("store_private_config")]
#[derive(Accounts)]
pub struct StorePrivateConfigCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    /// CHECK: payer for the event
    pub payer: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    /// CHECK: computation_account, checked by arcium program via constraints
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[cfg(feature = "arcium")]
/// Accounts for initializing the store_private_config computation definition
#[init_computation_definition_accounts("store_private_config", payer)]
#[derive(Accounts)]
pub struct InitStorePrivateConfigCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program. Not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[cfg(feature = "arcium")]
/// Accounts for initializing the generate_withdrawal_plan computation definition
#[init_computation_definition_accounts("generate_withdrawal_plan", payer)]
#[derive(Accounts)]
pub struct InitGeneratePlanCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program. Not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,

    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ========== Core Vault Account Structs ==========

/// Accounts for initializing a new vault for an SNS domain
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
