# Account Structure

## Overview

Hydentity uses Program Derived Addresses (PDAs) to manage vault state. Each SNS domain vault consists of multiple related accounts.

---

## Account Hierarchy

```
SNS Name Account (Bonfida)
        │
        ▼
┌───────────────────────────────────────────────────────┐
│                    PDA Derivations                     │
├───────────────────────────────────────────────────────┤
│                                                        │
│  NameVault                                            │
│  └── Seeds: ["vault", sns_name_account]               │
│                                                        │
│  VaultAuthority                                       │
│  └── Seeds: ["vault_auth", sns_name_account]          │
│                                                        │
│  PrivacyPolicy                                        │
│  └── Seeds: ["policy", sns_name_account]              │
│                                                        │
│  DelegateSession (per delegate)                       │
│  └── Seeds: ["delegate", sns_name_account, delegate]  │
│                                                        │
│  EncryptedVaultConfig                                 │
│  └── Seeds: ["encrypted_config", vault_pubkey]        │
│                                                        │
└───────────────────────────────────────────────────────┘
```

---

## Account Details

### NameVault

The main vault account storing metadata about the vault.

| Field | Type | Description |
|-------|------|-------------|
| `owner` | Pubkey | Current vault owner |
| `sns_name` | Pubkey | Associated SNS name account |
| `total_sol_received` | u64 | Total SOL ever received |
| `deposit_count` | u64 | Number of deposits |
| `created_at` | i64 | Creation timestamp |
| `last_deposit_at` | i64 | Last deposit timestamp |
| `bump` | u8 | PDA bump seed |
| `domain_transferred` | bool | Whether domain is owned by vault |

**Size:** 169 bytes

---

### VaultAuthority

The authority account that holds funds and signs transfers.

| Field | Type | Description |
|-------|------|-------------|
| `vault` | Pubkey | Associated vault |
| `sns_name` | Pubkey | SNS name account |
| `bump` | u8 | PDA bump seed |

**Size:** 105 bytes

**Purpose:**
- Holds SOL deposits
- Acts as authority for SPL token accounts
- Signs transfers (only program can invoke)

---

### PrivacyPolicy

User-configurable privacy settings stored on-chain.

| Field | Type | Description |
|-------|------|-------------|
| `vault` | Pubkey | Associated vault |
| `sns_name` | Pubkey | SNS name account |
| `enabled` | bool | Policy active/inactive |
| `min_splits` | u8 | Minimum transaction splits |
| `max_splits` | u8 | Maximum transaction splits |
| `min_delay_seconds` | u32 | Minimum delay between splits |
| `max_delay_seconds` | u32 | Maximum delay between splits |
| `distribution` | enum | Uniform / Weighted / ExponentialDecay |
| `privacy_mode` | enum | FullPrivacy / PartialPrivacy / Direct |
| `destination_mode` | enum | Single / Rotating / Random |
| `destinations` | Vec<Pubkey> | Withdrawal destinations (max 10) |
| `policy_nonce` | u64 | Version counter |
| `updated_at` | i64 | Last update timestamp |
| `bump` | u8 | PDA bump seed |

---

### DelegateSession

Time-bounded permissions for delegate accounts.

| Field | Type | Description |
|-------|------|-------------|
| `vault` | Pubkey | Associated vault |
| `sns_name` | Pubkey | SNS name account |
| `delegate` | Pubkey | Delegate public key |
| `granted_by` | Pubkey | Who granted the delegation |
| `expires_at` | i64 | Expiration timestamp |
| `permissions` | u8 | Permission bitmap |
| `created_at` | i64 | Creation timestamp |
| `bump` | u8 | PDA bump seed |

**Permission Flags:**
```
PERMISSION_UPDATE_POLICY     = 0x01
PERMISSION_REQUEST_WITHDRAWAL = 0x02
PERMISSION_ALL               = 0x03
```

---

### EncryptedVaultConfig

MPC-encrypted private configuration.

| Field | Type | Description |
|-------|------|-------------|
| `vault` | Pubkey | Associated vault |
| `encrypted_data` | [u8; 512] | Rescue cipher encrypted blob |
| `nonce` | [u8; 16] | Encryption nonce |
| `version` | u8 | Config version |
| `config_hash` | [u8; 32] | Hash for verification |
| `last_updated_slot` | u64 | Slot of last update |
| `last_updated_at` | i64 | Timestamp of last update |
| `is_initialized` | bool | Whether config is set |
| `bump` | u8 | PDA bump seed |

**Size:** 683 bytes

**Note:** The encrypted data contains destination addresses and settings that only the MPC cluster can decrypt.

---

## PDA Derivation

### Rust

```rust
// NameVault
let (vault_pda, bump) = Pubkey::find_program_address(
    &[b"vault", sns_name_account.as_ref()],
    &program_id
);

// VaultAuthority
let (auth_pda, bump) = Pubkey::find_program_address(
    &[b"vault_auth", sns_name_account.as_ref()],
    &program_id
);

// PrivacyPolicy
let (policy_pda, bump) = Pubkey::find_program_address(
    &[b"policy", sns_name_account.as_ref()],
    &program_id
);
```

### TypeScript

```typescript
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx');

// NameVault
const [vaultPda, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault'), snsNameAccount.toBuffer()],
  PROGRAM_ID
);

// VaultAuthority
const [authPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault_auth'), snsNameAccount.toBuffer()],
  PROGRAM_ID
);
```

---

## Account Sizes and Rent

| Account | Size | Approximate Rent |
|---------|------|------------------|
| NameVault | 169 bytes | ~0.002 SOL |
| VaultAuthority | 105 bytes | ~0.001 SOL |
| PrivacyPolicy | ~400 bytes | ~0.003 SOL |
| DelegateSession | ~200 bytes | ~0.002 SOL |
| EncryptedVaultConfig | 683 bytes | ~0.005 SOL |

Total rent for a basic vault: ~0.011 SOL
