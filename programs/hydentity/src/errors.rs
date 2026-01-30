use anchor_lang::prelude::*;

#[error_code]
pub enum HydentityError {
    #[msg("Unauthorized: caller is not the vault owner")]
    Unauthorized,

    #[msg("Unauthorized: caller is not a valid delegate")]
    UnauthorizedDelegate,

    #[msg("Delegate session has expired")]
    DelegateExpired,

    #[msg("Delegate lacks required permission for this operation")]
    InsufficientPermissions,

    #[msg("Invalid SNS name account")]
    InvalidSnsName,

    #[msg("SNS name ownership verification failed")]
    SnsOwnershipVerificationFailed,

    #[msg("Privacy policy is disabled")]
    PolicyDisabled,

    #[msg("Invalid policy configuration")]
    InvalidPolicyConfig,

    #[msg("Too many destinations specified (max 10)")]
    TooManyDestinations,

    #[msg("Invalid split range: min_splits must be <= max_splits")]
    InvalidSplitRange,

    #[msg("Invalid delay range: min_delay must be <= max_delay")]
    InvalidDelayRange,

    #[msg("Insufficient vault balance for operation")]
    InsufficientBalance,

    #[msg("Amount is below dust threshold")]
    AmountBelowDust,

    #[msg("Umbra deposit failed")]
    UmbraDepositFailed,

    #[msg("Invalid mint address")]
    InvalidMint,

    #[msg("Vault is already initialized")]
    VaultAlreadyInitialized,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Delegate already exists")]
    DelegateAlreadyExists,

    #[msg("Delegate not found")]
    DelegateNotFound,

    #[msg("Domain is not transferred to vault")]
    DomainNotTransferred,

    #[msg("Domain is already transferred to vault")]
    DomainAlreadyTransferred,

    #[msg("SNS transfer instruction failed")]
    SnsTransferFailed,

    #[msg("Invalid destination address for domain reclaim")]
    InvalidReclaimDestination,

    // ===== Arcium Integration Errors =====
    
    #[msg("Private vault configuration not initialized")]
    ConfigNotInitialized,

    #[msg("Private vault configuration validation failed")]
    ConfigValidationFailed,

    #[msg("Invalid vault reference")]
    InvalidVault,

    #[msg("Invalid withdrawal amount (must be > 0)")]
    InvalidAmount,

    #[msg("Withdrawal is not active")]
    WithdrawalNotActive,

    #[msg("Withdrawal plan has expired")]
    WithdrawalExpired,

    #[msg("Invalid split index")]
    InvalidSplitIndex,

    #[msg("Arcium computation failed")]
    ComputationFailed,

    #[msg("Arcium computation was aborted")]
    ComputationAborted,

    #[msg("MPC cluster is not set")]
    ClusterNotSet,

    #[msg("MPC cluster returned invalid result")]
    InvalidMpcResult,

    #[msg("Withdrawal already in progress for this vault")]
    WithdrawalAlreadyPending,

    #[msg("Maximum destinations reached (5)")]
    MaxDestinationsReached,

    #[msg("Cannot remove last destination")]
    CannotRemoveLastDestination,

    #[msg("Invalid config update")]
    InvalidConfigUpdate,

    #[msg("New owner is the same as current vault owner")]
    VaultOwnerUnchanged,
}

