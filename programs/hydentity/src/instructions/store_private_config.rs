use anchor_lang::prelude::*;
// TODO: Uncomment when arcium-anchor crate is available
// use arcium_anchor::prelude::*;

use crate::constants::*;
use crate::errors::HydentityError;
use crate::state::{EncryptedVaultConfig, NameVault, ENCRYPTED_CONFIG_SEED};

/// Computation definition offset for store_private_config
/// Computed as: sha256("store_private_config")[0..4] as u32 (little-endian)
pub const COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG: u32 = 0; // TODO: Calculate actual value

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
    arcis_pubkey: [u8; 32],
    encryption_nonce: u128,
) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let config_account = &mut ctx.accounts.encrypted_config;
    let clock = Clock::get()?;
    
    // Verify vault owner
    require!(
        vault.owner == ctx.accounts.owner.key(),
        HydentityError::Unauthorized
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
    
    // TODO: Queue Arcium computation when arcium-anchor is available
    // The computation will:
    // 1. Decrypt the config using MPC
    // 2. Validate configuration values
    // 3. Compute config hash
    // 4. Return result via callback
    //
    // Example (uncomment when arcium-anchor available):
    // ```
    // let args = vec![
    //     Argument::ArcisPubkey(arcis_pubkey),
    //     Argument::PlaintextU128(encryption_nonce),
    //     Argument::EncryptedBytes(encrypted_data.to_vec()),
    //     Argument::PlaintextBytes(vault.key().to_bytes().to_vec()),
    //     Argument::PlaintextU64(clock.slot),
    // ];
    //
    // ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    //
    // queue_computation(
    //     ctx.accounts,
    //     computation_offset,
    //     args,
    //     None, // No callback server needed
    //     vec![StorePrivateConfigCallback::callback_ix(&[
    //         CallbackAccount {
    //             pubkey: config_account.key(),
    //             is_writable: true,
    //         }
    //     ])],
    //     1,
    // )?;
    // ```
    
    msg!("Private config stored for vault: {}", vault.key());
    msg!("Config version: {}", config_account.version);
    msg!("Awaiting MPC validation (computation_offset: {})", computation_offset);
    
    Ok(())
}

/// Accounts for storing private vault configuration
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct StorePrivateConfig<'info> {
    /// Vault owner (must sign)
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// The vault to configure
    #[account(
        seeds = [VAULT_SEED, vault.sns_name_account.as_ref()],
        bump = vault.bump,
        constraint = vault.owner == owner.key() @ HydentityError::Unauthorized,
    )]
    pub vault: Account<'info, NameVault>,
    
    /// Encrypted configuration account
    #[account(
        init_if_needed,
        payer = owner,
        space = EncryptedVaultConfig::SPACE,
        seeds = [ENCRYPTED_CONFIG_SEED, vault.key().as_ref()],
        bump,
    )]
    pub encrypted_config: Account<'info, EncryptedVaultConfig>,
    
    // ===== Arcium Accounts (TODO: uncomment when arcium-anchor available) =====
    //
    // /// Signer PDA for Arcium CPI
    // #[account(
    //     init_if_needed,
    //     space = 9,
    //     payer = owner,
    //     seeds = [&SIGN_PDA_SEED],
    //     bump,
    //     address = derive_sign_pda!(),
    // )]
    // pub sign_pda_account: Account<'info, SignerAccount>,
    //
    // /// MXE account
    // #[account(address = derive_mxe_pda!())]
    // pub mxe_account: Account<'info, MXEAccount>,
    //
    // /// Mempool account
    // #[account(mut, address = derive_mempool_pda!())]
    // pub mempool_account: UncheckedAccount<'info>,
    //
    // /// Executing pool
    // #[account(mut, address = derive_execpool_pda!())]
    // pub executing_pool: UncheckedAccount<'info>,
    //
    // /// Computation account
    // #[account(mut, address = derive_comp_pda!(computation_offset))]
    // pub computation_account: UncheckedAccount<'info>,
    //
    // /// Computation definition account
    // #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG))]
    // pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    //
    // /// Cluster account
    // #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    // pub cluster_account: Account<'info, Cluster>,
    //
    // /// Fee pool account
    // #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    // pub pool_account: Account<'info, FeePool>,
    //
    // /// Clock account
    // #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    // pub clock_account: Account<'info, ClockAccount>,
    //
    // /// Arcium program
    // pub arcium_program: Program<'info, Arcium>,
    
    pub system_program: Program<'info, System>,
}

// ===== Callback Handler (TODO: uncomment when arcium-anchor available) =====
//
// /// Callback from Arcium after MPC validates and stores config
// #[arcium_callback(encrypted_ix = "store_private_config")]
// pub fn store_private_config_callback(
//     ctx: Context<StorePrivateConfigCallback>,
//     output: ComputationOutputs<StorePrivateConfigOutput>,
// ) -> Result<()> {
//     let result = match output {
//         ComputationOutputs::Success(StorePrivateConfigOutput { field_0 }) => field_0,
//         _ => return Err(HydentityError::ComputationFailed.into()),
//     };
//     
//     // Decrypt the result (contains success flag and config hash)
//     let config_account = &mut ctx.accounts.encrypted_config;
//     
//     // The result contains:
//     // - success: bool (byte 0)
//     // - config_hash: [u8; 32] (bytes 1-32)
//     // - stored_at_slot: u64 (bytes 33-40)
//     
//     let success = result.ciphertexts[0][0] != 0;
//     require!(success, HydentityError::ConfigValidationFailed);
//     
//     // Update config hash
//     let mut config_hash = [0u8; 32];
//     config_hash.copy_from_slice(&result.ciphertexts[0][1..33]);
//     config_account.config_hash = config_hash;
//     
//     msg!("Private config validated and stored");
//     msg!("Config hash: {:?}", config_hash);
//     
//     Ok(())
// }
//
// #[callback_accounts("store_private_config")]
// #[derive(Accounts)]
// pub struct StorePrivateConfigCallback<'info> {
//     pub arcium_program: Program<'info, Arcium>,
//     
//     #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_PRIVATE_CONFIG))]
//     pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
//     
//     #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
//     pub instructions_sysvar: AccountInfo<'info>,
//     
//     #[account(mut)]
//     pub encrypted_config: Account<'info, EncryptedVaultConfig>,
// }

