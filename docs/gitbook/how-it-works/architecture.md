# Architecture

## System Overview

Hydentity consists of three main components working together to provide privacy-preserving payments:

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Wallet                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Hydentity Frontend                            │
│                 (Next.js + Wallet Adapter)                       │
└─────────────────────────────────────────────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
   ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐
   │   Hydentity     │  │    Arcium    │  │      SNS        │
   │   Program       │  │    MPC       │  │   Name Service  │
   │   (On-Chain)    │  │   Network    │  │                 │
   └─────────────────┘  └──────────────┘  └─────────────────┘
            │                   │
            └─────────┬─────────┘
                      ▼
           ┌─────────────────────┐
           │    Privacy Cash     │
           │    (ZK Mixer)       │
           └─────────────────────┘
```

---

## Component Breakdown

### 1. Hydentity On-Chain Program

The core smart contract deployed on Solana, written in Rust using the Anchor framework.

**Responsibilities:**
- Create and manage vaults for SNS domains
- Store privacy policy configurations
- Handle fund deposits and withdrawals
- Manage delegate permissions
- Interface with Arcium MPC

**Program ID:** `7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx`

### 2. Arcium MPC Network

A Multi-Party Computation network that handles encrypted data operations.

**Responsibilities:**
- Store encrypted destination wallet addresses
- Generate randomized withdrawal plans
- Keep sensitive data private from all parties (including Hydentity)

### 3. Solana Name Service (SNS)

Bonfida's naming service that provides human-readable `.sol` domains.

**Responsibilities:**
- Resolve domain names to addresses
- Verify domain ownership
- Handle domain transfers

### 4. Privacy Cash

A zero-knowledge mixer pool for breaking transaction links.

**Responsibilities:**
- Accept deposits into anonymous pool
- Execute private withdrawals via ZK proofs
- Break on-chain link between source and destination

---

## Data Flow

### Deposit Flow

Once the domain has been transferred to the vault:

```
1. Sender sends to "alice.sol"
           │
           ▼
2. SNS resolves domain to Vault Authority PDA
   (because domain ownership was transferred to the vault)
           │
           ▼
3. Funds arrive in vault (Vault Authority account)
           │
           ▼
4. Vault balance updated, deposit recorded
```

> **Note:** The domain must be transferred to the vault authority for this flow to work. Without the transfer, SNS resolves the domain to the original wallet, not the vault.

### Private Withdrawal Flow

```
1. User requests withdrawal
           │
           ▼
2. Arcium MPC reads encrypted config
           │
           ▼
3. MPC generates randomized withdrawal plan
   (splits, delays, destination selection)
           │
           ▼
4. Vault withdraws to user's derived keypair
           │
           ▼
5. Privacy Cash deposits funds to anonymous pool
           │
           ▼
6. User withdraws from Privacy Cash to final destination
           │
           ▼
7. Funds arrive at destination (no link to vault)
```

---

## Account Structure

Hydentity uses Program Derived Addresses (PDAs) to manage vault state:

| Account | Seed | Purpose |
|---------|------|---------|
| **NameVault** | `["vault", sns_name]` | Main vault metadata |
| **VaultAuthority** | `["vault_auth", sns_name]` | Holds funds, signs transfers |
| **PrivacyPolicy** | `["policy", sns_name]` | Privacy configuration |
| **EncryptedConfig** | `["encrypted_config", vault]` | MPC-encrypted destinations |
| **DelegateSession** | `["delegate", sns_name, delegate]` | Time-bounded permissions |

---

## Security Model

1. **Non-Custodial**: Only the vault owner can authorize withdrawals
2. **PDA Authority**: The VaultAuthority PDA signs all transfers, controlled only by the program
3. **Encrypted Storage**: Destination wallets encrypted with MPC cluster key
4. **On-Chain Verification**: All ownership and permission checks happen on-chain
