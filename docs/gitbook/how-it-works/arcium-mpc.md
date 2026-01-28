# Arcium MPC

## What is Multi-Party Computation?

Multi-Party Computation (MPC) is a cryptographic technique that allows multiple parties to jointly compute a function over their inputs while keeping those inputs private. No single party ever sees the complete data.

**Simple analogy:** Imagine three people wanting to know their average salary without revealing individual salaries. MPC lets them compute the average where each person only contributes encrypted data, and no one learns what the others earn.

---

## How Hydentity Uses Arcium

Hydentity uses Arcium's MPC network for two critical operations:

### 1. Storing Encrypted Destinations

Your withdrawal destination wallets are encrypted and stored on-chain. Only the MPC cluster can decrypt them.

```
Your Config                    On-Chain Storage
┌─────────────────┐            ┌──────────────────┐
│ Destination 1   │   ──────>  │ [encrypted blob] │
│ Destination 2   │   encrypt  │ [nonce]          │
│ Privacy settings│            │ [hash]           │
└─────────────────┘            └──────────────────┘
```

### 2. Generating Withdrawal Plans

When you request a withdrawal, the MPC cluster:
- Decrypts your configuration
- Generates randomized split amounts
- Calculates timing delays
- Selects destinations based on your settings

All of this happens inside the MPC - your destinations are never exposed.

---

## The Encryption Flow

### Client-Side Encryption

1. Your browser generates a temporary keypair
2. Fetches the MPC cluster's public key
3. Derives a shared secret using ECDH
4. Encrypts your config with Rescue Cipher
5. Sends encrypted blob + your public key to the blockchain

### MPC Processing

1. The program queues a computation request
2. MPC nodes reconstruct the shared secret
3. Decrypt your configuration inside the MPC
4. Perform the requested operation
5. Return an encrypted result

```
┌──────────────────────────────────────────────────────────┐
│                    MPC Cluster                            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│   Node 1         Node 2         Node 3        Node 4     │
│     │              │              │              │        │
│     └──────────────┼──────────────┼──────────────┘        │
│                    │              │                       │
│            Jointly Decrypt & Compute                      │
│                    │              │                       │
│            No single node sees plaintext                  │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Private Vault Configuration

What gets encrypted and stored:

| Field | Description |
|-------|-------------|
| `destinations` | Up to 5 wallet addresses |
| `min_splits` / `max_splits` | Transaction split range |
| `min_delay` / `max_delay` | Timing delay range |
| `auto_withdraw_enabled` | Automatic withdrawal trigger |
| `auto_withdraw_threshold` | Threshold for auto-withdrawal |
| `use_privacy_cash` | Route through Privacy Cash |

---

## MPC Circuits

Hydentity defines two MPC circuits:

### `store_private_config`
Stores your encrypted configuration.

**Inputs:**
- Encrypted config data
- Vault public key
- Current slot

**Output:**
- Confirmation of storage
- Config hash for verification

### `generate_withdrawal_plan`
Creates a randomized withdrawal plan.

**Inputs:**
- Encrypted config
- Withdrawal amount
- User-provided entropy (randomness)
- Current timestamp

**Output:**
- Withdrawal plan with splits and timing

---

## Security Properties

### What's Protected
- **Destination addresses**: Never appear on-chain in plaintext
- **Privacy configuration**: Split/delay settings hidden
- **Withdrawal patterns**: MPC generates plans privately

### Trust Model
- No single MPC node can decrypt your data
- Requires threshold of nodes to collude (impractical)
- On-chain data is meaningless without MPC cooperation

### Verification
- Config hash stored on-chain for integrity checking
- Client can verify their config was stored correctly
- All operations are auditable via on-chain events

---

## Technical Details

**Arcium Program:** `F3G6Q9tRicyznCqcZLydJ6RxkwDSBeHWM458J7V6aeyk`

**Encryption:**
- Key exchange: x25519 ECDH
- Cipher: Rescue (MPC-friendly)
- Authenticated encryption with nonce

**Circuit Offsets:**
| Circuit | Offset |
|---------|--------|
| `store_private_config` | 1 |
| `generate_withdrawal_plan` | 2 |
