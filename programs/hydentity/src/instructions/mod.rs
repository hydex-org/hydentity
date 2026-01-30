pub mod initialize_vault;
pub mod update_policy;
pub mod deposit_to_umbra;
pub mod withdraw_direct;
pub mod add_delegate;
pub mod revoke_delegate;
pub mod mark_domain_transferred;
pub mod reclaim_domain;
#[cfg(feature = "arcium")]
pub mod store_private_config;
pub mod close_vault;
pub mod claim_vault;
// pub mod request_withdrawal; // TODO: Fix callback resolution for Arcium macros

pub use initialize_vault::{InitializeVault, handler as init_vault_handler};
pub use update_policy::{UpdatePolicy, UpdatePolicyParams, handler as update_policy_handler};
pub use deposit_to_umbra::{DepositToUmbra, handler as deposit_handler};
pub use withdraw_direct::{WithdrawDirect, handler as withdraw_handler};
pub use add_delegate::{AddDelegate, handler as add_delegate_handler};
pub use revoke_delegate::{RevokeDelegate, handler as revoke_delegate_handler};
pub use mark_domain_transferred::{MarkDomainTransferred, handler as mark_domain_handler};
pub use reclaim_domain::{ReclaimDomain, handler as reclaim_domain_handler};
pub use close_vault::{CloseVault, handler as close_vault_handler};
pub use claim_vault::{ClaimVault, handler as claim_vault_handler};

