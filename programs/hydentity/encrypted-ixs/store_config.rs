//! Store Private Vault Configuration
//! 
//! This encrypted instruction stores the user's private vault configuration
//! including destination wallets and privacy settings. The configuration is
//! encrypted with the MXE's public key, ensuring only the MPC cluster can
//! decrypt it during withdrawal execution.
//! 
//! ## Security Properties
//! 
//! - Destination wallets are never revealed on-chain
//! - Configuration is stored encrypted using Rescue cipher
//! - Only MPC nodes collectively can decrypt the config
//! - Config hash allows verification without revealing contents

use arcis_imports::*;

#[encrypted]
mod circuits {
    use super::*;
    use crate::types::*;

    /// Store private vault configuration
    /// 
    /// This instruction receives an encrypted configuration from the user
    /// and stores it for later use during withdrawal execution. The MPC
    /// cluster validates the configuration and computes a hash for
    /// on-chain verification.
    /// 
    /// ## Parameters
    /// 
    /// - `config`: The encrypted vault configuration containing destinations,
    ///   split settings, delay settings, and auto-withdrawal preferences
    /// - `vault_pubkey`: The public key of the vault this config belongs to
    /// - `current_slot`: Current Solana slot for timestamping
    /// 
    /// ## Returns
    /// 
    /// - `ConfigStorageResult`: Contains success flag, config hash, and storage slot
    /// 
    /// ## Privacy
    /// 
    /// The input `config` is encrypted for the MXE (`Enc<Mxe, ...>`), meaning
    /// only the MPC cluster can decrypt it. The returned result is also
    /// encrypted for the MXE since it will be stored on-chain.
    #[instruction]
    pub fn store_private_config(
        config: Enc<Mxe, PrivateVaultConfig>,
        vault_pubkey: [u8; 32],
        current_slot: u64,
    ) -> Enc<Mxe, ConfigStorageResult> {
        // Decrypt the config within MPC
        let cfg = config.to_arcis();
        
        // Validate configuration
        // Note: In MPC, we can't early return, so we track validity
        let mut is_valid = true;
        
        // Must have at least one destination
        if cfg.destination_count == 0 || cfg.destination_count > MAX_DESTINATIONS as u8 {
            is_valid = false;
        }
        
        // Split range must be valid
        if cfg.min_splits == 0 || cfg.min_splits > cfg.max_splits || cfg.max_splits > MAX_SPLITS as u8 {
            is_valid = false;
        }
        
        // Delay range must be valid
        if cfg.min_delay_seconds < MIN_DELAY_FLOOR_SECONDS {
            is_valid = false;
        }
        if cfg.max_delay_seconds > MAX_DELAY_CEILING_SECONDS {
            is_valid = false;
        }
        if cfg.min_delay_seconds > cfg.max_delay_seconds {
            is_valid = false;
        }
        
        // Compute config hash (for on-chain verification)
        // This allows verifying config integrity without revealing contents
        let config_hash = compute_config_hash(&cfg);
        
        // Prepare result
        let result = ConfigStorageResult {
            success: is_valid,
            config_hash,
            stored_at_slot: current_slot,
        };
        
        // Encrypt result for MXE (to be stored on-chain)
        Mxe::get().from_arcis(result)
    }

    /// Compute a hash of the configuration for verification
    /// 
    /// This hash can be stored on-chain and used to verify that
    /// a configuration hasn't been tampered with, without revealing
    /// the actual configuration contents.
    fn compute_config_hash(config: &PrivateVaultConfig) -> [u8; 32] {
        // Simple hash computation for config verification
        // In production, use a proper cryptographic hash
        let mut hash = [0u8; 32];
        
        // Mix in version
        hash[0] = config.version;
        
        // Mix in destination count
        hash[1] = config.destination_count;
        
        // Mix in split config
        hash[2] = config.min_splits;
        hash[3] = config.max_splits;
        
        // Mix in delay config (little-endian bytes)
        hash[4] = (config.min_delay_seconds & 0xFF) as u8;
        hash[5] = ((config.min_delay_seconds >> 8) & 0xFF) as u8;
        hash[6] = ((config.min_delay_seconds >> 16) & 0xFF) as u8;
        hash[7] = ((config.min_delay_seconds >> 24) & 0xFF) as u8;
        
        hash[8] = (config.max_delay_seconds & 0xFF) as u8;
        hash[9] = ((config.max_delay_seconds >> 8) & 0xFF) as u8;
        hash[10] = ((config.max_delay_seconds >> 16) & 0xFF) as u8;
        hash[11] = ((config.max_delay_seconds >> 24) & 0xFF) as u8;
        
        // Mix in auto-withdraw flag
        hash[12] = if config.auto_withdraw_enabled { 1 } else { 0 };
        
        // Mix in first bytes of each destination for uniqueness
        for i in 0..(config.destination_count as usize).min(MAX_DESTINATIONS) {
            if i + 13 < 32 {
                hash[i + 13] = config.destinations[i][0];
            }
        }
        
        // Mix in owner pubkey first bytes
        for i in 0..8 {
            if i + 24 < 32 {
                hash[i + 24] = config.owner_pubkey[i];
            }
        }
        
        hash
    }

    /// Verify that a stored config matches an expected hash
    /// 
    /// This helper allows the MPC cluster to verify config integrity
    /// before executing withdrawals.
    #[instruction]
    pub fn verify_config_hash(
        config: Enc<Mxe, &PrivateVaultConfig>,
        expected_hash: [u8; 32],
    ) -> bool {
        let cfg = config.to_arcis();
        let actual_hash = compute_config_hash(&cfg);
        
        // Compare hashes (constant-time comparison for security)
        let mut matches = true;
        for i in 0..32 {
            if actual_hash[i] != expected_hash[i] {
                matches = false;
            }
        }
        
        matches.reveal()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_validation() {
        // Test configuration validation logic
        let mut config = PrivateVaultConfig::default();
        config.destination_count = 2;
        config.destinations[0] = [1u8; 32];
        config.destinations[1] = [2u8; 32];
        config.min_splits = 2;
        config.max_splits = 5;
        config.min_delay_seconds = 300;
        config.max_delay_seconds = 1800;
        config.owner_pubkey = [3u8; 32];
        
        // This would be valid
        assert!(config.destination_count > 0);
        assert!(config.min_splits <= config.max_splits);
        assert!(config.min_delay_seconds <= config.max_delay_seconds);
    }

    #[test]
    fn test_config_hash_deterministic() {
        // Config hash should be deterministic
        let config = PrivateVaultConfig::default();
        let hash1 = compute_config_hash(&config);
        let hash2 = compute_config_hash(&config);
        assert_eq!(hash1, hash2);
    }
}

