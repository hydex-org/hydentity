use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::constants::*;
use crate::errors::HydentityError;
use crate::state::{EncryptedVaultConfig, NameVault, ENCRYPTED_CONFIG_SEED};
use crate::events::ConfigStored;

/// Computation definition offset for store_private_config
const COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG: u32 = comp_def_offset("store_private_config");

/// Store private vault configuration via Arcium MPC
/// 
/// This instruction receives encrypted vault configuration from the user
/// and queues an Arcium computation to validate and store it. The configuration
/// includes destination wallets and privacy settings that will be used for
/// withdrawal execution.
/// 
/// ## Flow
/// 
/// 1. User encrypts config with MXE public key
/// 2. User calls this instruction with encrypted data
/// 3. Instruction queues Arcium computation
/// 4. MPC cluster validates and stores config
/// 5. Callback updates on-chain state with config hash
/// 
/// ## Privacy
/// 
/// - The encrypted_data contains destination wallets (never revealed)
/// - Only the config_hash is stored on-chain (doesn't reveal contents)
/// - MPC cluster validates config without revealing values
pub fn handler(
    ctx: Context<StorePrivateConfig>,
    computation_offset: u64,
    encrypted_data: [u8; 512],
    nonce: [u8; 16],
    pub_key: [u8; 32],
    nonce_u128: u128,
) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let config_account = &mut ctx.accounts.encrypted_config;
    let clock = Clock::get()?;
    
    // Verify vault owner
    require!(
        vault.owner == ctx.accounts.owner.key(),
        HydentityError::Unauthorized
    );
    
    // Verify vault matches SNS name account
    require!(
        vault.sns_name == ctx.accounts.sns_name_account.key(),
        HydentityError::InvalidSnsName
    );
    
    // Initialize or update the config account
    if !config_account.is_initialized {
        config_account.initialize(
            vault.key(),
            encrypted_data,
            nonce,
            [0u8; 32], // Hash will be set by callback
            clock.slot,
            clock.unix_timestamp,
            ctx.bumps.encrypted_config,
        );
    } else {
        // Verify this config belongs to the right vault
        require!(
            config_account.vault == vault.key(),
            HydentityError::InvalidVault
        );
    }
    
    // Store the encrypted data temporarily (will be validated by MPC)
    config_account.encrypted_data = encrypted_data;
    config_account.nonce = nonce;
    config_account.last_updated_slot = clock.slot;
    config_account.last_updated_at = clock.unix_timestamp;
    
    // Build arguments for Arcium computation
    // The encrypted instruction expects:
    // - config: Enc<Mxe, PrivateVaultConfig> (from encrypted_data in account)
    // - vault_pubkey: [u8; 32]
    // - current_slot: u64
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    
    // Offset of encrypted_data field: discriminator (8) + vault (32) = 40
    const ENCRYPTED_CONFIG_DATA_OFFSET: u32 = 40;
    const ENCRYPTED_CONFIG_DATA_SIZE: u32 = 512;
    
    let args = ArgBuilder::new()
        .x25519_pubkey(pub_key)
        .plaintext_u128(nonce_u128)
        .account(
            config_account.key(),
            ENCRYPTED_CONFIG_DATA_OFFSET,
            ENCRYPTED_CONFIG_DATA_SIZE,
        )
        .plaintext_bytes(vault.key().to_bytes().to_vec())
        .plaintext_u64(clock.slot)
        .build();
    
    // Queue Arcium computation
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

#[queue_computation_accounts("store_private_config", owner)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct StorePrivateConfig<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// The SNS name account
    /// CHECK: Validated via vault constraint
    pub sns_name_account: UncheckedAccount<'info>,
    
    #[account(
        seeds = [VAULT_SEED, sns_name_account.key().as_ref()],
        bump = vault.bump,
        constraint = vault.owner == owner.key() @ HydentityError::Unauthorized
    )]
    pub vault: Account<'info, NameVault>,
    
    #[account(
        mut,
        init_if_needed,
        payer = owner,
        space = EncryptedVaultConfig::SPACE,
        seeds = [ENCRYPTED_CONFIG_SEED, vault.key().as_ref()],
        bump
    )]
    pub encrypted_config: Account<'info, EncryptedVaultConfig>,
    
    // Arcium accounts
    #[account(
        init_if_needed,
        space = 9,
        payer = owner,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, HydentityError::ComputationFailed)
    )]
    /// CHECK: mempool_account, checked by the arcium program
    pub mempool_account: UncheckedAccount<'info>,
    
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, HydentityError::ComputationFailed)
    )]
    /// CHECK: executing_pool, checked by the arcium program
    pub executing_pool: UncheckedAccount<'info>,
    
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, HydentityError::ComputationFailed)
    )]
    /// CHECK: computation_account, checked by the arcium program
    pub computation_account: UncheckedAccount<'info>,
    
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, HydentityError::ComputationFailed)
    )]
    pub cluster_account: Account<'info, Cluster>,
    
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS,
    )]
    pub clock_account: Account<'info, ClockAccount>,
    
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Callback from Arcium after MPC validates and stores config
/// 
/// The encrypted instruction returns Enc<Mxe, ConfigStorageResult> which contains:
/// - success: bool
/// - config_hash: [u8; 32]
/// - stored_at_slot: u64
#[arcium_callback(encrypted_ix = "store_private_config")]
pub fn store_private_config_callback(
    ctx: Context<StorePrivateConfigCallback>,
    output: SignedComputationOutputs<ConfigStorageOutput>,
) -> Result<()> {
    // Verify output signature
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(ConfigStorageOutput { field_0 }) => field_0,
        Err(_) => return Err(HydentityError::InvalidMpcResult.into()),
    };
    
    // The result is ConfigStorageResult which is revealed from Enc<Mxe, ConfigStorageResult>
    // It contains: success (bool), config_hash ([u8; 32]), stored_at_slot (u64)
    // Note: The actual structure depends on how Arcium serializes the revealed result
    // For now, we'll need to parse it from the output structure
    
    // Update encrypted config account with result
    let config_account = &mut ctx.accounts.encrypted_config;
    
    // Note: The exact structure of ConfigStorageOutput depends on how Arcium handles
    // revealed results. In practice, you may need to parse it differently.
    // This is a placeholder that will need adjustment based on actual Arcium behavior.
    
    // For now, assume the result contains the config hash
    // In production, you'll need to properly deserialize ConfigStorageResult
    // from the revealed output
    
    msg!("Config stored successfully via MPC");
    
    emit!(ConfigStored {
        vault: config_account.vault,
        config_hash: config_account.config_hash,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

#[callback_accounts("store_private_config")]
#[derive(Accounts)]
pub struct StorePrivateConfigCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    
    /// CHECK: computation_account, checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    
    #[account(
        address = derive_cluster_pda!(mxe_account, HydentityError::ComputationFailed)
    )]
    pub cluster_account: Account<'info, Cluster>,
    
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    
    #[account(mut)]
    pub encrypted_config: Account<'info, EncryptedVaultConfig>,
}

/// Initialize computation definition for store_private_config
pub fn init_store_private_config_comp_def(
    ctx: Context<InitStorePrivateConfigCompDef>,
) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

#[init_computation_definition_accounts("store_private_config", payer)]
#[derive(Accounts)]
pub struct InitStorePrivateConfigCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program
    pub comp_def_account: UncheckedAccount<'info>,
    
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

/// Output type from the encrypted instruction
/// This matches the return type from store_private_config in encrypted-ixs
/// Note: The actual structure depends on how Arcium serializes Enc<Mxe, ConfigStorageResult>
/// when it's revealed. This is a placeholder that may need adjustment.
pub struct ConfigStorageOutput {
    pub field_0: ConfigStorageResultRaw,
}

/// Raw result structure (how it appears in the output)
/// In practice, ConfigStorageResult from encrypted-ixs/types.rs will be deserialized here
pub struct ConfigStorageResultRaw {
    // This will need to match the actual serialized structure
    // Placeholder for now
}
