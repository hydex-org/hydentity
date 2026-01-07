//! Hydentity Encrypted Instructions (Arcis)
//! 
//! This module contains the MPC-executed encrypted instructions that provide
//! true destination privacy for Hydentity vaults. These instructions are
//! compiled to MPC circuits and executed by the Arcium network.
//! 
//! ## Key Instructions
//! 
//! - `store_private_config`: Store encrypted vault configuration
//! - `generate_withdrawal_plan`: Create randomized withdrawal plan
//! - `execute_withdrawal_split`: Execute a single split from the plan
//! - `query_encrypted_balance`: Query balance with encrypted response
//! - `update_private_config`: Update config without revealing values
//! 
//! ## Privacy Guarantees
//! 
//! - Destination wallets are NEVER revealed on-chain
//! - Split amounts and timing are MPC-randomized
//! - Only the distributed MPC cluster collectively knows the full config
//! - No single party can extract private configuration

pub mod store_config;
pub mod generate_plan;
pub mod execute_split;
pub mod query_balance;
pub mod update_config;
pub mod types;

pub use store_config::*;
pub use generate_plan::*;
pub use execute_split::*;
pub use query_balance::*;
pub use update_config::*;
pub use types::*;

