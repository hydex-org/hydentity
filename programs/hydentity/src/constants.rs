use anchor_lang::prelude::*;

/// Seed prefixes for PDA derivation
pub const VAULT_SEED: &[u8] = b"vault";
pub const VAULT_AUTH_SEED: &[u8] = b"vault_auth";
pub const POLICY_SEED: &[u8] = b"policy";
pub const DELEGATE_SEED: &[u8] = b"delegate";

/// SNS Name Service Program ID (same on mainnet and devnet)
pub const SNS_NAME_PROGRAM_ID: Pubkey = pubkey!("namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX");

/// Maximum number of destination addresses in privacy policy
pub const MAX_DESTINATIONS: usize = 10;

/// Default policy values (Medium preset)
pub const DEFAULT_MIN_SPLITS: u8 = 2;
pub const DEFAULT_MAX_SPLITS: u8 = 5;
pub const DEFAULT_MIN_DELAY_SECONDS: u32 = 300;  // 5 minutes
pub const DEFAULT_MAX_DELAY_SECONDS: u32 = 1800; // 30 minutes

/// Delegate permission flags
pub const PERMISSION_UPDATE_POLICY: u8 = 1 << 0;
pub const PERMISSION_DEPOSIT_UMBRA: u8 = 1 << 1;
pub const PERMISSION_ALL: u8 = PERMISSION_UPDATE_POLICY | PERMISSION_DEPOSIT_UMBRA;

/// Minimum dust threshold in lamports (to prevent spam splits)
pub const DUST_THRESHOLD_LAMPORTS: u64 = 10_000; // 0.00001 SOL

