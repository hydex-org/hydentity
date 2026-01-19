use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::errors::HydentityError;
use crate::state::{EncryptedVaultConfig, NameVault, ENCRYPTED_CONFIG_SEED};
use crate::constants::*;
use crate::{ID, ID_CONST, SignerAccount}; // Required for Arcium macros

/// Computation definition offset for store_private_config
/// Using offset 1 which was created by uploadCircuit SDK function
pub const COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG: u32 = 1;

/// Local error code for Arcium macros (required by derive_*_pda macros)
#[error_code]
pub enum ErrorCode {
    #[msg("The cluster is not set")]
    ClusterNotSet,
}

/// Initialize computation definition for store_private_config
/// Must be called once before using store_private_config
pub fn init_comp_def_handler(ctx: Context<InitStorePrivateConfigCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

/// Store private vault configuration via Arcium MPC
pub fn handler(
    ctx: Context<StorePrivateConfig>,
    computation_offset: u64,
    encrypted_data: [u8; 512],
    _nonce: [u8; 16],
    pub_key: [u8; 32],
    nonce_u128: u128,
) -> Result<()> {
    // Build arguments for Arcium computation
    // The encrypted instruction expects:
    // - config: Enc<Mxe, PrivateVaultConfig> (encrypted_data)
    // - vault_pubkey: [u8; 32]
    // - current_slot: u64

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let clock = Clock::get()?;
    let vault_pubkey = ctx.accounts.vault.key().to_bytes();

    let args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(nonce_u128)
        .encrypted_u8(encrypted_data[0..32].try_into().unwrap()) // First 32 bytes as encrypted config chunk
        .plaintext_point(vault_pubkey)
        .plaintext_u64(clock.slot)
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![StorePrivateConfigCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1,
        0,
    )?;

    msg!("Queued Arcium computation for config storage");
    msg!("Computation offset: {}", computation_offset);

    Ok(())
}

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
        address = derive_mempool_pda!(mxe_account, HydentityError::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program
    pub mempool_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, HydentityError::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program
    pub executing_pool: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, HydentityError::ClusterNotSet)
    )]
    /// CHECK: computation_account, checked by the arcium program
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, HydentityError::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,

    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Callback accounts for store_private_config
#[callback_accounts("store_private_config")]
#[derive(Accounts)]
pub struct StorePrivateConfigCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    /// The vault this config is for
    /// CHECK: We just need to read the key for the event
    pub vault: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    /// CHECK: computation_account, checked by arcium program via constraints
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_cluster_pda!(mxe_account, HydentityError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

/// Accounts for initializing the computation definition
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
