# Hydentity Arcium Integration Specification

## Overview

This document details the integration of Arcium MPC (Multi-Party Computation) into Hydentity to achieve true destination privacy. The key insight is that **any data linking vault deposits to withdrawal destinations must be encrypted** so only the distributed MPC cluster collectively knows the full picture.

## Current vs. Enhanced Privacy Model

### Current Model (Umbra-style)
```
User Vault ──► Umbra Mixer ──► User Claims with Destination (VISIBLE)
                                        │
                                        └── Chain analysis can see destination
```

### Enhanced Model (Arcium MPC)
```
User Vault ──► Umbra Mixer ──► Arcium MPC ──► Destinations (HIDDEN)
                                    │
                                    └── Only MPC cluster knows destinations
                                        (distributed trust, no single point)
```

## Data to Encrypt with Arcium

| Data | Why Encrypt | Storage Location |
|------|-------------|------------------|
| Destination wallets | Primary privacy leak | MXE Account (on-chain, encrypted) |
| Split configuration | Pattern analysis prevention | MXE Account |
| Delay configuration | Timing analysis prevention | MXE Account |
| Withdrawal execution plan | Prevents prediction | MPC memory only |
| Vault balance (optional) | Reduces info leakage | MXE Account |
| Policy update history | Prevents config fingerprinting | MXE Account |

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER (Off-chain)                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. Generate x25519 keypair                                          │    │
│  │  2. Derive shared secret with MXE                                    │    │
│  │  3. Encrypt private config (destinations, splits, delays)            │    │
│  │  4. Submit encrypted config to Hydentity program                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HYDENTITY PROGRAM (On-chain)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  - Stores encrypted vault configs                                    │    │
│  │  - Queues computations to Arcium program                            │    │
│  │  - Handles callbacks from MPC cluster                                │    │
│  │  - Manages vault state (owner, SNS domain, etc.)                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARCIUM PROGRAM (On-chain)                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  - Schedules computations in mempool                                 │    │
│  │  - Coordinates MPC cluster execution                                 │    │
│  │  - Verifies computation results                                      │    │
│  │  - Invokes callbacks with results                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCIUM MPC CLUSTER (Off-chain)                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Node 1 ◄──────────────────────────────────────────────► Node 2     │    │
│  │     │                                                        │       │    │
│  │     │           Secret Sharing / MPC Protocol               │       │    │
│  │     │                                                        │       │    │
│  │  Node 3 ◄──────────────────────────────────────────────► Node 4     │    │
│  │                                                                      │    │
│  │  Collectively:                                                       │    │
│  │  - Decrypt vault configs                                             │    │
│  │  - Generate randomized withdrawal plans                              │    │
│  │  - Sign withdrawal transactions                                      │    │
│  │  - Execute with timing delays                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DESTINATION WALLETS (On-chain)                          │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐          │
│  │ Wallet A  │    │ Wallet B  │    │ Wallet C  │    │ Wallet D  │          │
│  │ (split 1) │    │ (split 2) │    │ (split 3) │    │ (split 4) │          │
│  └───────────┘    └───────────┘    └───────────┘    └───────────┘          │
│                                                                              │
│  External observers see funds arriving but cannot link to source vault       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Encrypted Instructions (Arcis)

### 1. Store Private Vault Configuration

```rust
#[instruction]
pub fn store_private_config(
    config: Enc<Mxe, PrivateVaultConfig>,
    vault_pubkey: [u8; 32],
) -> Enc<Mxe, ConfigStorageResult>
```

**Purpose**: Store encrypted destination wallets and privacy settings.

**Inputs**:
- `config`: Encrypted struct containing:
  - `destinations`: Up to 5 destination wallet pubkeys
  - `destination_count`: Number of active destinations
  - `min_splits` / `max_splits`: Split range
  - `min_delay_seconds` / `max_delay_seconds`: Delay range
  - `auto_withdraw_enabled`: Whether to auto-execute withdrawals
  - `threshold_lamports`: Minimum balance to trigger withdrawal

**Outputs**:
- `ConfigStorageResult`: Success indicator + config hash for verification

### 2. Generate Withdrawal Plan

```rust
#[instruction]
pub fn generate_withdrawal_plan(
    vault_config: Enc<Mxe, &PrivateVaultConfig>,
    amount_lamports: u64,
    entropy: Enc<Shared, [u8; 32]>,
) -> Enc<Mxe, WithdrawalPlan>
```

**Purpose**: Generate a randomized withdrawal execution plan.

**Inputs**:
- `vault_config`: Reference to stored encrypted config
- `amount_lamports`: Amount to withdraw
- `entropy`: User-provided randomness for plan generation

**Outputs**:
- `WithdrawalPlan`: Encrypted plan containing:
  - Specific split amounts
  - Specific delay times
  - Destination order (randomized)

### 3. Execute Withdrawal Split

```rust
#[instruction]
pub fn execute_withdrawal_split(
    plan: Enc<Mxe, &WithdrawalPlan>,
    split_index: u8,
) -> WithdrawalExecution
```

**Purpose**: Execute a single split from the withdrawal plan.

**Outputs**:
- `WithdrawalExecution`: Contains:
  - `destination`: The target wallet (revealed only at execution)
  - `amount`: The split amount
  - `signature`: MPC cluster signature authorizing transfer

### 4. Query Encrypted Balance

```rust
#[instruction]
pub fn query_balance(
    vault_pubkey: [u8; 32],
    owner_pubkey: Enc<Shared, [u8; 32]>,
) -> Enc<Shared, BalanceInfo>
```

**Purpose**: Query vault balance with encrypted response.

**Outputs**:
- `BalanceInfo`: Encrypted balance only owner can decrypt

### 5. Update Private Config

```rust
#[instruction]
pub fn update_private_config(
    current_config: Enc<Mxe, &PrivateVaultConfig>,
    updates: Enc<Shared, ConfigUpdates>,
    owner_signature: [u8; 64],
) -> Enc<Mxe, PrivateVaultConfig>
```

**Purpose**: Update encrypted config without revealing old or new values.

## Data Structures

### PrivateVaultConfig

```rust
pub struct PrivateVaultConfig {
    /// Version for upgrade compatibility
    pub version: u8,
    
    /// Destination wallets (padded to fixed size)
    pub destinations: [[u8; 32]; 5],
    
    /// Number of active destinations (1-5)
    pub destination_count: u8,
    
    /// Split configuration
    pub min_splits: u8,
    pub max_splits: u8,
    
    /// Delay configuration (seconds)
    pub min_delay_seconds: u32,
    pub max_delay_seconds: u32,
    
    /// Auto-withdrawal settings
    pub auto_withdraw_enabled: bool,
    pub threshold_lamports: u64,
    
    /// Owner verification
    pub owner_pubkey: [u8; 32],
    
    /// Config creation timestamp
    pub created_at: i64,
    
    /// Last update timestamp
    pub updated_at: i64,
}
```

### WithdrawalPlan

```rust
pub struct WithdrawalPlan {
    /// Unique plan identifier
    pub plan_id: [u8; 16],
    
    /// Vault this plan is for
    pub vault_pubkey: [u8; 32],
    
    /// Total amount being withdrawn
    pub total_amount: u64,
    
    /// Number of splits in this plan
    pub split_count: u8,
    
    /// Individual split details
    pub splits: [SplitDetail; 10],  // Max 10 splits
    
    /// Plan creation timestamp
    pub created_at: i64,
    
    /// Plan expiry (for security)
    pub expires_at: i64,
    
    /// Execution status
    pub executed_count: u8,
}

pub struct SplitDetail {
    /// Destination wallet
    pub destination: [u8; 32],
    
    /// Amount in lamports
    pub amount: u64,
    
    /// Delay from previous split (seconds)
    pub delay_seconds: u32,
    
    /// Scheduled execution time (0 = not scheduled)
    pub scheduled_at: i64,
    
    /// Actual execution time (0 = not executed)
    pub executed_at: i64,
    
    /// Transaction signature (if executed)
    pub tx_signature: [u8; 64],
}
```

## On-Chain Account Structure

### EncryptedVaultConfig Account

```rust
#[account]
pub struct EncryptedVaultConfig {
    /// Account discriminator (8 bytes, auto)
    
    /// Vault this config belongs to
    pub vault: Pubkey,
    
    /// Encrypted config data (Rescue cipher)
    /// Size: ~500 bytes for full config
    pub encrypted_data: [u8; 512],
    
    /// Nonce used for encryption
    pub nonce: [u8; 16],
    
    /// Config version for upgrades
    pub version: u8,
    
    /// Hash of plaintext config (for verification)
    pub config_hash: [u8; 32],
    
    /// Last update slot
    pub last_updated_slot: u64,
    
    /// Bump seed
    pub bump: u8,
}
```

### PendingWithdrawal Account

```rust
#[account]
pub struct PendingWithdrawal {
    /// Account discriminator (8 bytes, auto)
    
    /// Vault this withdrawal is from
    pub vault: Pubkey,
    
    /// Encrypted withdrawal plan
    pub encrypted_plan: [u8; 1024],
    
    /// Plan nonce
    pub nonce: [u8; 16],
    
    /// Total splits
    pub total_splits: u8,
    
    /// Completed splits
    pub completed_splits: u8,
    
    /// Plan status
    pub status: WithdrawalStatus,
    
    /// Creation timestamp
    pub created_at: i64,
    
    /// Bump seed
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum WithdrawalStatus {
    Pending,
    InProgress,
    Completed,
    Cancelled,
    Failed,
}
```

## User Flow

### Initial Setup (One-time)

```
1. User connects wallet
2. User creates vault for their .sol domain
3. User configures private destinations:
   a. Generate ephemeral x25519 keypair
   b. Fetch MXE public key
   c. Derive shared secret
   d. Encrypt config with Rescue cipher
   e. Submit encrypted config to Hydentity program
   f. Hydentity queues Arcium computation
   g. MPC cluster stores encrypted config
4. User can now receive payments to their .sol address
```

### Receiving Payments

```
1. Sender resolves recipient.sol to vault address
2. Sender transfers SOL to vault
3. Vault receives deposit (publicly visible, by design)
4. (Optional) Auto-withdrawal triggers if enabled and above threshold
```

### Withdrawal Execution (Automatic)

```
1. Withdrawal trigger (manual or auto-threshold)
2. Hydentity program queues "generate_withdrawal_plan" computation
3. MPC cluster:
   a. Decrypts vault config
   b. Generates randomized split amounts
   c. Generates randomized delays
   d. Shuffles destination order
   e. Creates execution plan
4. For each split:
   a. MPC waits for scheduled delay
   b. MPC signs withdrawal transaction
   c. Transaction submitted to Solana
   d. Destination receives funds
5. User sees funds arrive at configured wallets (no action needed)
```

### Manual Withdrawal Request

```
1. User initiates withdrawal via app
2. User provides entropy for randomization
3. Same flow as automatic, but triggered manually
4. User can optionally specify urgency (affects delay ranges)
```

## Security Considerations

### Trust Model

1. **MPC Cluster (Distributed Trust)**
   - No single node can decrypt configs
   - Threshold of nodes required for decryption
   - Dishonest majority assumption (most nodes must be honest)

2. **On-chain Data**
   - Encrypted configs stored on-chain
   - Computation results verified by Arcium program
   - Cannot be tampered without detection

3. **User Responsibility**
   - Secure storage of recovery data
   - Fresh destination wallets (not linked to identity)

### Attack Vectors & Mitigations

| Attack | Mitigation |
|--------|------------|
| MPC node collusion | Requires majority collusion; economic penalties |
| Timing analysis | Randomized delays within user-specified range |
| Amount fingerprinting | Randomized splits with configurable ranges |
| Destination reuse | Support for multiple rotating destinations |
| Config extraction | Rescue cipher encryption; MXE-only decryption |

## Gas & Fee Model

### Computation Costs

| Operation | Estimated Cost | Payer |
|-----------|---------------|-------|
| Store private config | ~0.01 SOL | User |
| Generate withdrawal plan | ~0.005 SOL | Deducted from withdrawal |
| Execute withdrawal split | ~0.002 SOL per split | Deducted from withdrawal |
| Update config | ~0.008 SOL | User |
| Query balance | ~0.001 SOL | User |

### Fee Deduction Flow

```
User requests withdrawal of 1 SOL
├── MPC computation fee: 0.005 SOL
├── 3 splits × 0.002 SOL = 0.006 SOL
├── Total fees: 0.011 SOL
└── Net to destinations: 0.989 SOL (distributed across splits)
```

## Implementation Phases

### Phase 1: Core Encrypted Config (MVP)
- [ ] Encrypted destination storage
- [ ] Encrypted split/delay config
- [ ] Manual withdrawal with MPC execution
- [ ] Basic Arcium integration

### Phase 2: Automatic Execution
- [ ] Auto-withdrawal on threshold
- [ ] Scheduled execution with delays
- [ ] Multiple destination rotation

### Phase 3: Enhanced Privacy
- [ ] Encrypted balance queries
- [ ] Encrypted policy updates
- [ ] Withdrawal history encryption

### Phase 4: Advanced Features
- [ ] Multi-sig vault support
- [ ] Time-locked withdrawals
- [ ] Emergency recovery via MPC

## File Structure

```
programs/hydentity/
├── src/
│   ├── lib.rs                    # Program entrypoint
│   ├── constants.rs              # Constants + Arcium config
│   ├── errors.rs                 # Error codes
│   ├── state/
│   │   ├── mod.rs
│   │   ├── name_vault.rs         # Vault state
│   │   ├── encrypted_config.rs   # NEW: Encrypted config account
│   │   ├── pending_withdrawal.rs # NEW: Pending withdrawal account
│   │   └── ...
│   └── instructions/
│       ├── mod.rs
│       ├── initialize_vault.rs
│       ├── store_private_config.rs      # NEW: Queue Arcium computation
│       ├── request_withdrawal.rs        # NEW: Queue withdrawal plan
│       ├── execute_withdrawal_split.rs  # NEW: Execute single split
│       ├── private_config_callback.rs   # NEW: Arcium callback
│       ├── withdrawal_callback.rs       # NEW: Arcium callback
│       └── ...
│
├── encrypted-ixs/                # NEW: Arcis encrypted instructions
│   ├── store_config.rs
│   ├── generate_plan.rs
│   ├── execute_split.rs
│   └── query_balance.rs

packages/hydentity-sdk/
├── src/
│   ├── client/
│   │   ├── hydentity-client.ts
│   │   ├── arcium-client.ts      # NEW: Arcium encryption helpers
│   │   ├── private-config.ts     # NEW: Config encryption/submission
│   │   └── ...
│   └── types/
│       ├── private-config.ts     # NEW: TypeScript types
│       └── ...

apps/hydentity-app/
├── src/
│   ├── hooks/
│   │   ├── useHydentity.ts
│   │   ├── usePrivateConfig.ts   # NEW: Private config management
│   │   └── useWithdrawals.ts     # NEW: Withdrawal management
│   └── components/
│       ├── PrivateConfigSetup.tsx  # NEW: Config wizard
│       ├── WithdrawalStatus.tsx    # NEW: Withdrawal tracking
│       └── ...
```

## Testing Strategy

### Unit Tests
- Encryption/decryption round-trip
- Config serialization
- Split amount generation
- Delay randomization

### Integration Tests
- Full config storage flow
- Withdrawal plan generation
- Split execution sequence
- Callback handling

### Local Testing
- Use Arcium local node (`arcium test`)
- Mock MPC cluster responses
- Verify encryption integrity

### Devnet Testing
- Deploy to Solana devnet
- Use Arcium devnet cluster
- End-to-end withdrawal flow

