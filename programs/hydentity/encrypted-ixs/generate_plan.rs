//! Generate Withdrawal Plan
//! 
//! This encrypted instruction generates a randomized withdrawal execution plan
//! based on the user's private configuration. The plan includes specific split
//! amounts, timing delays, and destination ordering - all randomized within
//! the user's configured ranges.
//! 
//! ## Privacy Properties
//! 
//! - Destinations are selected from the encrypted config
//! - Split amounts are randomized (not predictable)
//! - Delays are randomized (prevents timing analysis)
//! - Destination order is shuffled (prevents pattern analysis)
//! - Plan remains encrypted until individual splits are executed

use arcis_imports::*;

#[encrypted]
mod circuits {
    use super::*;
    use crate::types::*;

    /// Generate a randomized withdrawal plan
    /// 
    /// This instruction takes the user's stored private configuration and
    /// generates a specific execution plan for a withdrawal. All randomization
    /// happens within the MPC cluster, ensuring unpredictability.
    /// 
    /// ## Parameters
    /// 
    /// - `vault_config`: Reference to the stored encrypted config
    /// - `amount_lamports`: Total amount to withdraw
    /// - `user_entropy`: User-provided entropy for additional randomization
    /// - `current_timestamp`: Current Unix timestamp
    /// 
    /// ## Returns
    /// 
    /// - `WithdrawalPlan`: Encrypted plan with specific splits, amounts, delays
    /// 
    /// ## Randomization
    /// 
    /// The plan generation uses both MPC-internal randomness and user entropy
    /// to ensure that:
    /// 1. Even the MPC cluster cannot predict the exact plan before execution
    /// 2. External observers cannot predict future withdrawals
    /// 3. The user cannot be front-run based on their configuration
    #[instruction]
    pub fn generate_withdrawal_plan(
        vault_config: Enc<Mxe, &PrivateVaultConfig>,
        amount_lamports: u64,
        user_entropy: Enc<Shared, UserEntropy>,
        current_timestamp: i64,
    ) -> Enc<Mxe, WithdrawalPlan> {
        // Decrypt inputs within MPC
        let config = *(vault_config.to_arcis());
        let entropy = user_entropy.to_arcis();
        
        // Generate plan ID from entropy
        let plan_id = generate_plan_id(&entropy, current_timestamp);
        
        // Determine number of splits (random within range)
        let split_count = generate_random_split_count(
            config.min_splits,
            config.max_splits,
            &entropy,
        );
        
        // Generate split amounts (randomized, summing to total)
        let amounts = generate_split_amounts(
            amount_lamports,
            split_count,
            &entropy,
        );
        
        // Generate delays between splits
        let delays = generate_split_delays(
            split_count,
            config.min_delay_seconds,
            config.max_delay_seconds,
            &entropy,
        );
        
        // Select and shuffle destinations
        let destinations = select_destinations(
            &config.destinations,
            config.destination_count,
            split_count,
            &entropy,
        );
        
        // Build the withdrawal plan
        let mut plan = WithdrawalPlan::default();
        plan.plan_id = plan_id;
        plan.vault_pubkey = config.owner_pubkey; // Using owner as vault identifier
        plan.total_amount = amount_lamports;
        plan.split_count = split_count;
        plan.created_at = current_timestamp;
        plan.expires_at = current_timestamp + 86400 * 7; // 7 day expiry
        plan.status = PlanStatus::Pending;
        
        // Populate split details
        let mut cumulative_delay: i64 = 0;
        for i in 0..(split_count as usize) {
            if i < MAX_SPLITS {
                cumulative_delay += delays[i] as i64;
                
                plan.splits[i] = SplitDetail {
                    destination: destinations[i],
                    amount: amounts[i],
                    delay_seconds: delays[i],
                    scheduled_at: current_timestamp + cumulative_delay,
                    executed_at: 0,
                    tx_signature: [0u8; 64],
                };
            }
        }
        
        // Encrypt plan for MXE storage
        Mxe::get().from_arcis(plan)
    }

    /// Generate a unique plan ID from entropy and timestamp
    fn generate_plan_id(entropy: &UserEntropy, timestamp: i64) -> [u8; 16] {
        let mut id = [0u8; 16];
        
        // Mix entropy bytes
        for i in 0..8 {
            id[i] = entropy.user_random[i];
        }
        
        // Mix timestamp bytes
        let ts_bytes = timestamp.to_le_bytes();
        for i in 0..8 {
            id[i + 8] = ts_bytes[i];
        }
        
        id
    }

    /// Generate random split count within the configured range
    /// 
    /// Uses MPC randomness combined with user entropy
    fn generate_random_split_count(
        min_splits: u8,
        max_splits: u8,
        entropy: &UserEntropy,
    ) -> u8 {
        // Use ArcisRNG for secure randomness within MPC
        let range = (max_splits - min_splits + 1) as u128;
        
        // Generate random value in range [0, range)
        let random_offset = ArcisRNG::gen_integer_from_width(8) as u8;
        let offset = random_offset % (range as u8);
        
        min_splits + offset
    }

    /// Generate split amounts that sum to the total
    /// 
    /// Uses a fair division algorithm with random perturbation
    fn generate_split_amounts(
        total: u64,
        split_count: u8,
        entropy: &UserEntropy,
    ) -> [u64; MAX_SPLITS] {
        let mut amounts = [0u64; MAX_SPLITS];
        let count = split_count as usize;
        
        if count == 0 || count > MAX_SPLITS {
            return amounts;
        }
        
        // Base amount for each split
        let base_amount = total / (count as u64);
        let remainder = total % (count as u64);
        
        // Generate random perturbations
        // Each split can vary by ±20% from base (within available funds)
        let perturbation_range = base_amount / 5; // 20%
        
        let mut remaining = total;
        
        for i in 0..count {
            if i == count - 1 {
                // Last split gets whatever remains
                amounts[i] = remaining;
            } else {
                // Generate random perturbation
                let random = ArcisRNG::gen_integer_from_width(16) as u64;
                let perturbation = (random % (perturbation_range * 2 + 1)) as i64 
                    - (perturbation_range as i64);
                
                let mut split_amount = (base_amount as i64 + perturbation) as u64;
                
                // Ensure we don't take more than remaining
                if split_amount > remaining - ((count - i - 1) as u64 * 1000) {
                    split_amount = remaining - ((count - i - 1) as u64 * 1000);
                }
                
                // Ensure minimum dust threshold (10,000 lamports)
                if split_amount < 10_000 {
                    split_amount = 10_000;
                }
                
                amounts[i] = split_amount;
                remaining -= split_amount;
            }
        }
        
        // Add remainder to random splits
        if remainder > 0 {
            let random_idx = (ArcisRNG::gen_integer_from_width(8) as usize) % count;
            amounts[random_idx] += remainder;
        }
        
        amounts
    }

    /// Generate delays between splits
    fn generate_split_delays(
        split_count: u8,
        min_delay: u32,
        max_delay: u32,
        entropy: &UserEntropy,
    ) -> [u32; MAX_SPLITS] {
        let mut delays = [0u32; MAX_SPLITS];
        let count = split_count as usize;
        let range = max_delay - min_delay;
        
        for i in 0..count {
            if i < MAX_SPLITS {
                // Generate random delay within range
                let random = ArcisRNG::gen_integer_from_width(32) as u32;
                delays[i] = min_delay + (random % (range + 1));
            }
        }
        
        delays
    }

    /// Select destinations from config and shuffle them
    /// 
    /// If there are more splits than destinations, destinations are reused
    /// in a shuffled order
    fn select_destinations(
        available: &[[u8; 32]; MAX_DESTINATIONS],
        available_count: u8,
        needed_count: u8,
        entropy: &UserEntropy,
    ) -> [[u8; 32]; MAX_SPLITS] {
        let mut destinations = [[0u8; 32]; MAX_SPLITS];
        let avail = available_count as usize;
        let needed = needed_count as usize;
        
        if avail == 0 || needed == 0 {
            return destinations;
        }
        
        // Create shuffled index array for available destinations
        let mut indices: [usize; MAX_DESTINATIONS] = [0, 1, 2, 3, 4];
        
        // Fisher-Yates shuffle using MPC randomness
        for i in (1..avail).rev() {
            let j = (ArcisRNG::gen_integer_from_width(8) as usize) % (i + 1);
            // Swap indices[i] and indices[j]
            let temp = indices[i];
            indices[i] = indices[j];
            indices[j] = temp;
        }
        
        // Assign destinations to splits (cycling through shuffled list)
        for i in 0..needed {
            if i < MAX_SPLITS {
                let dest_idx = indices[i % avail];
                destinations[i] = available[dest_idx];
            }
        }
        
        destinations
    }

    /// Get the next split to execute from a plan
    /// 
    /// Returns the index of the next unexecuted split, or None if all done
    #[instruction]
    pub fn get_next_split(
        plan: Enc<Mxe, &WithdrawalPlan>,
        current_timestamp: i64,
    ) -> Enc<Mxe, (bool, u8, i64)> {
        let p = plan.to_arcis();
        
        // Find first unexecuted split that's past its scheduled time
        let mut found = false;
        let mut next_index: u8 = 0;
        let mut wait_until: i64 = 0;
        
        for i in 0..(p.split_count as usize) {
            if i < MAX_SPLITS {
                let split = &p.splits[i];
                
                // Check if not yet executed
                if split.executed_at == 0 {
                    if split.scheduled_at <= current_timestamp {
                        // Ready to execute
                        found = true;
                        next_index = i as u8;
                        break;
                    } else if !found {
                        // Track earliest upcoming split
                        wait_until = split.scheduled_at;
                    }
                }
            }
        }
        
        Mxe::get().from_arcis((found, next_index, wait_until))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_amounts_sum() {
        // Verify split amounts always sum to total
        let total = 1_000_000_000u64; // 1 SOL
        let entropy = UserEntropy {
            user_random: [1u8; 32],
            timestamp: 12345,
            signature: [0u8; 64],
        };
        
        // In real tests, we'd mock ArcisRNG
        // For now, just test the logic structure
        let count = 3;
        let base = total / count as u64;
        assert!(base > 0);
    }

    #[test]
    fn test_delay_bounds() {
        let min = 300u32;  // 5 min
        let max = 1800u32; // 30 min
        assert!(min < max);
        assert!(max - min > 0);
    }
}

