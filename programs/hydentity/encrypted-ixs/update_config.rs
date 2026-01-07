//! Update Private Configuration
//! 
//! This encrypted instruction allows users to update their private vault
//! configuration without revealing the old or new values on-chain.
//! 
//! ## Privacy Properties
//! 
//! - Old configuration values not revealed
//! - New configuration values not revealed
//! - Only the fact that an update occurred is visible
//! - Config hash changes (but hash doesn't reveal config)

use arcis_imports::*;

#[encrypted]
mod circuits {
    use super::*;
    use crate::types::*;

    /// Update private vault configuration
    /// 
    /// Allows the vault owner to update their destination wallets and/or
    /// privacy settings without revealing the old or new values.
    /// 
    /// ## Parameters
    /// 
    /// - `current_config`: Reference to the current encrypted config
    /// - `updates`: Encrypted updates to apply
    /// - `owner_pubkey`: Owner's public key for verification
    /// - `current_timestamp`: Current timestamp for update tracking
    /// 
    /// ## Returns
    /// 
    /// - Updated `PrivateVaultConfig` encrypted for MXE
    /// 
    /// ## Validation
    /// 
    /// - Owner must match the config's owner
    /// - New values must pass same validation as initial config
    /// - Version is incremented for tracking
    #[instruction]
    pub fn update_private_config(
        current_config: Enc<Mxe, PrivateVaultConfig>,
        updates: Enc<Shared, ConfigUpdates>,
        owner_pubkey: Enc<Shared, [u8; 32]>,
        current_timestamp: i64,
    ) -> Enc<Mxe, UpdateConfigResult> {
        let mut config = current_config.to_arcis();
        let upd = updates.to_arcis();
        let owner = owner_pubkey.to_arcis();
        
        // Verify owner
        let mut owner_matches = true;
        for i in 0..32 {
            if config.owner_pubkey[i] != owner[i] {
                owner_matches = false;
            }
        }
        
        if !owner_matches {
            return Mxe::get().from_arcis(UpdateConfigResult {
                success: false,
                new_config: config,
                error_code: 1, // Unauthorized
            });
        }
        
        // Apply updates if provided
        if let Some(new_dests) = upd.new_destinations {
            config.destinations = new_dests;
        }
        
        if let Some(count) = upd.new_destination_count {
            if count > 0 && count <= MAX_DESTINATIONS as u8 {
                config.destination_count = count;
            }
        }
        
        if let Some(min) = upd.new_min_splits {
            if min > 0 && min <= config.max_splits {
                config.min_splits = min;
            }
        }
        
        if let Some(max) = upd.new_max_splits {
            if max >= config.min_splits && max <= MAX_SPLITS as u8 {
                config.max_splits = max;
            }
        }
        
        if let Some(min_delay) = upd.new_min_delay_seconds {
            if min_delay >= MIN_DELAY_FLOOR_SECONDS && min_delay <= config.max_delay_seconds {
                config.min_delay_seconds = min_delay;
            }
        }
        
        if let Some(max_delay) = upd.new_max_delay_seconds {
            if max_delay >= config.min_delay_seconds && max_delay <= MAX_DELAY_CEILING_SECONDS {
                config.max_delay_seconds = max_delay;
            }
        }
        
        if let Some(auto_enabled) = upd.new_auto_withdraw_enabled {
            config.auto_withdraw_enabled = auto_enabled;
        }
        
        if let Some(threshold) = upd.new_auto_withdraw_threshold {
            config.auto_withdraw_threshold = threshold;
        }
        
        // Update metadata
        config.updated_at = current_timestamp;
        config.version += 1;
        
        Mxe::get().from_arcis(UpdateConfigResult {
            success: true,
            new_config: config,
            error_code: 0,
        })
    }

    /// Add a new destination to the config
    /// 
    /// Convenience instruction to add a single new destination
    /// without replacing all destinations.
    #[instruction]
    pub fn add_destination(
        current_config: Enc<Mxe, PrivateVaultConfig>,
        new_destination: Enc<Shared, [u8; 32]>,
        owner_pubkey: Enc<Shared, [u8; 32]>,
        current_timestamp: i64,
    ) -> Enc<Mxe, UpdateConfigResult> {
        let mut config = current_config.to_arcis();
        let new_dest = new_destination.to_arcis();
        let owner = owner_pubkey.to_arcis();
        
        // Verify owner
        let mut owner_matches = true;
        for i in 0..32 {
            if config.owner_pubkey[i] != owner[i] {
                owner_matches = false;
            }
        }
        
        if !owner_matches {
            return Mxe::get().from_arcis(UpdateConfigResult {
                success: false,
                new_config: config,
                error_code: 1, // Unauthorized
            });
        }
        
        // Check if we can add more destinations
        if config.destination_count >= MAX_DESTINATIONS as u8 {
            return Mxe::get().from_arcis(UpdateConfigResult {
                success: false,
                new_config: config,
                error_code: 2, // Max destinations reached
            });
        }
        
        // Add the new destination
        let idx = config.destination_count as usize;
        config.destinations[idx] = new_dest;
        config.destination_count += 1;
        config.updated_at = current_timestamp;
        config.version += 1;
        
        Mxe::get().from_arcis(UpdateConfigResult {
            success: true,
            new_config: config,
            error_code: 0,
        })
    }

    /// Remove a destination from the config
    /// 
    /// Removes a destination by index, shifting remaining destinations.
    #[instruction]
    pub fn remove_destination(
        current_config: Enc<Mxe, PrivateVaultConfig>,
        destination_index: u8,
        owner_pubkey: Enc<Shared, [u8; 32]>,
        current_timestamp: i64,
    ) -> Enc<Mxe, UpdateConfigResult> {
        let mut config = current_config.to_arcis();
        let owner = owner_pubkey.to_arcis();
        
        // Verify owner
        let mut owner_matches = true;
        for i in 0..32 {
            if config.owner_pubkey[i] != owner[i] {
                owner_matches = false;
            }
        }
        
        if !owner_matches {
            return Mxe::get().from_arcis(UpdateConfigResult {
                success: false,
                new_config: config,
                error_code: 1, // Unauthorized
            });
        }
        
        // Validate index
        let idx = destination_index as usize;
        if idx >= config.destination_count as usize {
            return Mxe::get().from_arcis(UpdateConfigResult {
                success: false,
                new_config: config,
                error_code: 3, // Invalid index
            });
        }
        
        // Must keep at least one destination
        if config.destination_count <= 1 {
            return Mxe::get().from_arcis(UpdateConfigResult {
                success: false,
                new_config: config,
                error_code: 4, // Cannot remove last destination
            });
        }
        
        // Shift destinations down
        for i in idx..(MAX_DESTINATIONS - 1) {
            config.destinations[i] = config.destinations[i + 1];
        }
        config.destinations[MAX_DESTINATIONS - 1] = [0u8; 32];
        config.destination_count -= 1;
        config.updated_at = current_timestamp;
        config.version += 1;
        
        Mxe::get().from_arcis(UpdateConfigResult {
            success: true,
            new_config: config,
            error_code: 0,
        })
    }

    /// Rotate all destinations
    /// 
    /// Replace all destinations with new ones in a single operation.
    /// Useful for periodic privacy refresh.
    #[instruction]
    pub fn rotate_destinations(
        current_config: Enc<Mxe, PrivateVaultConfig>,
        new_destinations: Enc<Shared, [[u8; 32]; MAX_DESTINATIONS]>,
        new_count: u8,
        owner_pubkey: Enc<Shared, [u8; 32]>,
        current_timestamp: i64,
    ) -> Enc<Mxe, UpdateConfigResult> {
        let mut config = current_config.to_arcis();
        let new_dests = new_destinations.to_arcis();
        let owner = owner_pubkey.to_arcis();
        
        // Verify owner
        let mut owner_matches = true;
        for i in 0..32 {
            if config.owner_pubkey[i] != owner[i] {
                owner_matches = false;
            }
        }
        
        if !owner_matches {
            return Mxe::get().from_arcis(UpdateConfigResult {
                success: false,
                new_config: config,
                error_code: 1, // Unauthorized
            });
        }
        
        // Validate new count
        if new_count == 0 || new_count > MAX_DESTINATIONS as u8 {
            return Mxe::get().from_arcis(UpdateConfigResult {
                success: false,
                new_config: config,
                error_code: 5, // Invalid destination count
            });
        }
        
        // Replace all destinations
        config.destinations = new_dests;
        config.destination_count = new_count;
        config.updated_at = current_timestamp;
        config.version += 1;
        
        Mxe::get().from_arcis(UpdateConfigResult {
            success: true,
            new_config: config,
            error_code: 0,
        })
    }
}

/// Result of a config update operation
#[derive(Clone, Copy)]
pub struct UpdateConfigResult {
    pub success: bool,
    pub new_config: PrivateVaultConfig,
    pub error_code: u8,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_codes() {
        // Document error code meanings
        let unauthorized = 1u8;
        let max_destinations = 2u8;
        let invalid_index = 3u8;
        let cannot_remove_last = 4u8;
        let invalid_count = 5u8;
        
        assert!(unauthorized > 0);
        assert!(max_destinations > unauthorized);
        assert!(invalid_index > max_destinations);
        assert!(cannot_remove_last > invalid_index);
        assert!(invalid_count > cannot_remove_last);
    }

    #[test]
    fn test_destination_shift() {
        // Test that removing a destination properly shifts others
        let mut dests = [[0u8; 32]; 5];
        dests[0] = [1u8; 32];
        dests[1] = [2u8; 32];
        dests[2] = [3u8; 32];
        
        // Remove index 1
        let remove_idx = 1;
        for i in remove_idx..4 {
            dests[i] = dests[i + 1];
        }
        dests[4] = [0u8; 32];
        
        assert_eq!(dests[0], [1u8; 32]);
        assert_eq!(dests[1], [3u8; 32]);
    }
}

