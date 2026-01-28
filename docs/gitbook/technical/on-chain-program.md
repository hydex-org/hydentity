# On-Chain Program

## Overview

The Hydentity on-chain program is written in Rust using the Anchor framework and deployed on both Solana Devnet and Mainnet.

**Program ID:** `7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx`

---

## Instructions

### Core Vault Instructions

| Instruction | Description | Access |
|-------------|-------------|--------|
| `initialize_vault` | Create a new vault for an SNS domain | Domain owner |
| `withdraw_direct` | Direct withdrawal to a specified address | Vault owner only |
| `request_withdrawal` | Request an MPC-computed withdrawal plan | Owner or delegate |

### Policy Management

| Instruction | Description | Access |
|-------------|-------------|--------|
| `update_policy` | Update privacy settings | Owner or delegate |

### Delegate Management

| Instruction | Description | Access |
|-------------|-------------|--------|
| `add_delegate` | Grant time-bounded permissions | Owner only |
| `revoke_delegate` | Remove delegate access | Owner only |

### Domain Transfer

| Instruction | Description | Access |
|-------------|-------------|--------|
| `mark_domain_transferred` | Verify and record domain transfer to vault | Owner |
| `reclaim_domain` | Transfer domain back from vault | Owner |

### Arcium MPC

| Instruction | Description | Access |
|-------------|-------------|--------|
| `init_store_private_config_comp_def` | Initialize MPC circuit definition | Any (once) |
| `store_private_config` | Queue encrypted config storage | Vault owner |
| `store_private_config_callback` | MPC callback after computation | Arcium MPC |

---

## Error Codes

### Authorization Errors (6000-6003)
| Code | Name | Description |
|------|------|-------------|
| 6000 | `Unauthorized` | Caller is not authorized |
| 6001 | `UnauthorizedDelegate` | Delegate not authorized for this action |
| 6002 | `DelegateExpired` | Delegate session has expired |
| 6003 | `InsufficientPermissions` | Missing required permissions |

### SNS Errors (6004-6005)
| Code | Name | Description |
|------|------|-------------|
| 6004 | `InvalidSnsName` | SNS name account is invalid |
| 6005 | `SnsOwnershipVerificationFailed` | Failed to verify SNS ownership |

### Policy Errors (6006-6010)
| Code | Name | Description |
|------|------|-------------|
| 6006 | `PolicyDisabled` | Privacy policy is disabled |
| 6007 | `InvalidPolicyConfig` | Invalid policy configuration |
| 6008 | `TooManyDestinations` | Exceeds maximum destinations |
| 6009 | `InvalidSplitRange` | Invalid split min/max values |
| 6010 | `InvalidDelayRange` | Invalid delay min/max values |

### Fund Errors (6011-6014)
| Code | Name | Description |
|------|------|-------------|
| 6011 | `InsufficientBalance` | Not enough funds in vault |
| 6012 | `AmountBelowDust` | Amount below dust threshold |
| 6013 | `UmbraDepositFailed` | Privacy deposit failed |
| 6014 | `InvalidMint` | Invalid token mint |

### State Errors (6015-6018)
| Code | Name | Description |
|------|------|-------------|
| 6015 | `VaultAlreadyInitialized` | Vault already exists |
| 6016 | `ArithmeticOverflow` | Math overflow |
| 6017 | `DelegateAlreadyExists` | Delegate already added |
| 6018 | `DelegateNotFound` | Delegate not found |

### Domain Errors (6019-6022)
| Code | Name | Description |
|------|------|-------------|
| 6019 | `DomainNotTransferred` | Domain not yet transferred |
| 6020 | `DomainAlreadyTransferred` | Domain already transferred |
| 6021 | `SnsTransferFailed` | SNS transfer failed |
| 6022 | `InvalidReclaimDestination` | Invalid reclaim destination |

### MPC Errors (6023-6037)
| Code | Name | Description |
|------|------|-------------|
| 6023 | `ConfigNotInitialized` | Config not yet initialized |
| 6024 | `ConfigValidationFailed` | Config validation failed |
| 6030 | `ComputationFailed` | MPC computation failed |
| 6031 | `ComputationAborted` | MPC computation aborted |

---

## Events

The program emits events for key operations:

```rust
VaultInitialized    { vault, owner, sns_name, timestamp }
ConfigStored        { vault, config_hash, timestamp }
WithdrawalRequested { vault, amount, computation_offset, timestamp }
WithdrawalPlanGenerated { vault, plan_id, total_splits, timestamp }
WithdrawalCompleted { vault, total_amount, split_count, timestamp }
WithdrawalCancelled { vault, refunded_amount, completed_splits, timestamp }
```

---

## Constants

```rust
// PDA Seeds
VAULT_SEED = "vault"
VAULT_AUTH_SEED = "vault_auth"
POLICY_SEED = "policy"
DELEGATE_SEED = "delegate"

// SNS Program
SNS_NAME_PROGRAM_ID = "namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX"

// Limits
MAX_DESTINATIONS = 10
DUST_THRESHOLD_LAMPORTS = 10,000

// Default Policy
DEFAULT_MIN_SPLITS = 2
DEFAULT_MAX_SPLITS = 5
DEFAULT_MIN_DELAY_SECONDS = 300    // 5 minutes
DEFAULT_MAX_DELAY_SECONDS = 1800   // 30 minutes

// Delegate Permissions
PERMISSION_UPDATE_POLICY = 0x01
PERMISSION_REQUEST_WITHDRAWAL = 0x02
PERMISSION_ALL = 0x03
```

---

## Security Model

1. **SNS Ownership Verification** - Program reads SNS account data to verify caller owns the domain

2. **PDA Authority** - VaultAuthority PDA acts as the authority for all fund movements

3. **On-Chain Permission Checks** - All authorization happens on-chain, not in the client

4. **Delegate Expiration** - Time-bounded access with explicit expiration timestamps
