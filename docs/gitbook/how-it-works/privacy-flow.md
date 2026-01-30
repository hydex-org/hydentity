# Privacy Flow

## Understanding the Privacy Layers

Hydentity uses multiple layers of privacy protection to ensure your funds remain untraceable. Each layer adds a different type of protection.

---

## Layer 1: Domain Transfer & Vault Separation

The first layer of privacy comes from transferring your domain ownership to the vault, separating your public domain from your private wallet.

```
Before Hydentity:
alice.sol ────────────────────────────> Alice's Wallet
                                        (Publicly linked)

After Hydentity (domain transferred to vault):
alice.sol ──────> Hydentity Vault ────> ???
                  (Public)               (Hidden)
```

**What this achieves:**
- Your `.sol` domain is owned by the vault authority, not your wallet
- Senders see your domain resolving to a vault address, not your wallet
- Your wallet address is never exposed during deposits
- No direct on-chain link between your domain and your personal wallet

> **Note:** Domain transfer is required for the vault to receive funds sent to your `.sol` name. You can reclaim ownership at any time.

---

## Layer 2: Encrypted Destinations

Your withdrawal destination wallets are stored encrypted using Arcium's Multi-Party Computation network.

```
┌─────────────────────────────────────────────────────────┐
│                 Destination Encryption                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Your Wallet: 7xK9...4mN2                               │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────────────────────────┐               │
│  │  Client-Side Encryption               │               │
│  │  • Generate ephemeral keypair         │               │
│  │  • ECDH with MPC cluster key          │               │
│  │  • Encrypt with Rescue Cipher         │               │
│  └──────────────────────────────────────┘               │
│           │                                              │
│           ▼                                              │
│  Stored On-Chain: [encrypted blob]                      │
│                                                          │
│  Only MPC cluster can decrypt                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**What this achieves:**
- Destination addresses never appear in plaintext on-chain
- Even if someone reads the blockchain, they see encrypted data
- The MPC cluster decrypts only during withdrawal execution

---

## Layer 3: Privacy Cash Mixing

The final and strongest layer breaks the on-chain transaction link entirely.

```
┌─────────────────────────────────────────────────────────┐
│                   Privacy Cash Flow                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Vault ──────────────────────> Derived Keypair          │
│         Direct transfer              │                   │
│         (visible link)               │                   │
│                                      ▼                   │
│                            ┌─────────────────┐          │
│                            │  Privacy Cash   │          │
│                            │   Anonymous     │          │
│                            │     Pool        │          │
│                            └─────────────────┘          │
│                                      │                   │
│                                      ▼                   │
│  Final Destination <─────── ZK Proof Withdrawal         │
│                      (NO visible link to vault)         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**What this achieves:**
- Funds enter a shared anonymous pool
- Withdrawals use zero-knowledge proofs
- No on-chain connection between deposit and withdrawal
- Even with full chain analysis, the link is broken

---

## Layer 4: Transaction Patterns

Optional randomization makes analysis even harder.

### Split Transactions
Instead of one large transfer, split into multiple smaller ones:
```
10 SOL → [3.2 SOL, 2.8 SOL, 2.1 SOL, 1.9 SOL]
```

### Timing Delays
Add random delays between transactions:
```
Split 1: Immediate
Split 2: +12 minutes
Split 3: +47 minutes
Split 4: +2 hours
```

### Distribution Patterns
Choose how amounts are distributed:
- **Uniform**: Equal splits
- **Weighted**: Custom percentages
- **Exponential Decay**: Larger amounts first, smaller later

---

## Complete Privacy Flow Example

```
1. Alice owns alice.sol
   └── Creates Hydentity vault

2. Bob sends 5 SOL to alice.sol
   └── Funds arrive in vault (Bob sees vault address, not Alice's wallet)

3. Alice initiates private withdrawal
   └── MPC decrypts her destination config
   └── Generates randomized withdrawal plan

4. Vault → Alice's derived keypair
   └── Direct transfer (intermediate step)

5. Derived keypair → Privacy Cash pool
   └── Funds enter anonymous pool

6. Privacy Cash → Alice's final wallet
   └── ZK proof withdrawal (no link to vault)

Result: No on-chain connection between alice.sol and Alice's wallet
```

---

## Privacy Guarantees

| Threat | Protection |
|--------|------------|
| Sender sees recipient wallet | Vault separation |
| Chain observer reads destinations | MPC encryption |
| Transaction graph analysis | Privacy Cash mixing |
| Timing analysis | Random delays |
| Amount correlation | Split transactions |
