use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("46mwRQo4f6sLy9cigZdVJgdEpeEVc6jLRG1H241Uk9GY");

#[program]
pub mod hydentity {
    use super::*;

    /// Initialize a new vault for an SNS name
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize_vault::handler(ctx)
    }

    /// Update the privacy policy for a vault
    pub fn update_policy(ctx: Context<UpdatePolicy>, params: UpdatePolicyParams) -> Result<()> {
        instructions::update_policy::handler(ctx, params)
    }

    /// Deposit vault funds into Umbra mixer pool
    pub fn deposit_to_umbra(
        ctx: Context<DepositToUmbra>,
        amount: u64,
        mint: Option<Pubkey>,
    ) -> Result<()> {
        instructions::deposit_to_umbra::handler(ctx, amount, mint)
    }

    /// Emergency direct withdrawal (bypasses privacy)
    pub fn withdraw_direct(
        ctx: Context<WithdrawDirect>,
        amount: u64,
        mint: Option<Pubkey>,
    ) -> Result<()> {
        instructions::withdraw_direct::handler(ctx, amount, mint)
    }

    /// Add a delegate with time-bounded execution permissions
    pub fn add_delegate(
        ctx: Context<AddDelegate>,
        expires_at: i64,
        permissions: u8,
    ) -> Result<()> {
        instructions::add_delegate::handler(ctx, expires_at, permissions)
    }

    /// Revoke delegate permissions
    pub fn revoke_delegate(ctx: Context<RevokeDelegate>) -> Result<()> {
        instructions::revoke_delegate::handler(ctx)
    }

    /// Mark domain as transferred to vault authority
    /// 
    /// Called after the user transfers their SNS domain ownership to the vault authority
    /// using the Bonfida SDK. This verifies the transfer and updates vault state.
    pub fn mark_domain_transferred(ctx: Context<MarkDomainTransferred>) -> Result<()> {
        instructions::mark_domain_transferred::handler(ctx)
    }

    /// Reclaim domain ownership from the vault
    /// 
    /// Transfers SNS domain ownership from the vault authority PDA back to 
    /// a specified destination address. Only the vault owner can execute this.
    pub fn reclaim_domain(ctx: Context<ReclaimDomain>) -> Result<()> {
        instructions::reclaim_domain::handler(ctx)
    }
}

