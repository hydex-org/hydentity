# Privacy Cash Integration

## What is Privacy Cash?

Privacy Cash is a zero-knowledge mixer pool on Solana that enables private transactions by breaking the on-chain link between transaction inputs and outputs.

When you deposit funds into Privacy Cash, they enter a shared pool. When you withdraw, you use a zero-knowledge proof to demonstrate you have the right to withdraw - without revealing which deposit was yours.

---

## How Hydentity Uses Privacy Cash

Privacy Cash is the final step in Hydentity's privacy flow, providing the strongest transaction unlinkability:

```
Vault → Derived Keypair → Privacy Cash Pool → Final Destination
         (Step 1)           (Step 2)            (Step 3)
```

### Step 1: Vault to Derived Keypair
A direct withdrawal from the vault to a derived keypair (intermediate address).

### Step 2: Deposit to Pool
The derived keypair deposits funds into Privacy Cash's anonymous pool.

### Step 3: Private Withdrawal
You withdraw from the pool to your final destination using a ZK proof.

---

## The Derived Keypair

To use Privacy Cash, Hydentity derives a deterministic keypair from your wallet:

1. You sign a specific message with your wallet
2. The signature is hashed to create a 32-byte seed
3. An Ed25519 keypair is derived from this seed
4. This keypair is used for Privacy Cash operations

**Why a derived keypair?**
- Privacy Cash requires signing transactions
- Using a derived keypair prevents direct wallet exposure
- The derivation is deterministic - same wallet always gets the same keypair
- The seed is cached in your browser session for convenience

---

## Using Privacy Cash

### Initialization (One-Time)
```
1. Connect wallet
2. Sign derivation message
3. Keypair is derived and cached
```

### Depositing to Pool
```
1. Withdraw from vault to derived keypair address
2. Deposit from derived keypair to Privacy Cash pool
3. Funds now in private balance
```

### Withdrawing from Pool
```
1. Specify amount and destination
2. Privacy Cash generates ZK proof
3. Relayer executes withdrawal
4. Funds arrive at destination (no vault link)
```

---

## Fees and Limits

| Item | Amount |
|------|--------|
| Minimum deposit | ~0.005 SOL |
| UTXO rent costs | ~0.003 SOL |
| Withdrawal fee | 0.25% |
| Transaction fees | ~5,000 lamports |

**UTXO Rent Costs Explained:**
Privacy Cash creates internal accounts (UTXOs) during deposits. These accounts require rent, which is subtracted from your deposit:
- ~1.9M lamports for UTXO accounts
- ~890K lamports for derived key rent-exemption
- Small amounts may fail if they don't cover these costs

---

## Privacy Cash Balance

When using Hydentity with Privacy Cash, you'll see two balances:

1. **Vault Balance**: Funds in your Hydentity vault
2. **Private Balance**: Funds in Privacy Cash pool (anonymous)

```
┌──────────────────────────────────────┐
│         alice.sol Vault              │
├──────────────────────────────────────┤
│  Vault Balance:     2.5 SOL          │
│  Private Balance:   1.2 SOL          │
│                                      │
│  [Withdraw to Pool]  [Claim Private] │
└──────────────────────────────────────┘
```

---

## Security Considerations

### What Privacy Cash Provides
- **Unlinkability**: No on-chain connection between deposits and withdrawals
- **Anonymity Set**: Your funds mix with all other pool users
- **ZK Proofs**: Withdrawals are cryptographically verified without revealing source

### What to Keep in Mind
- **Minimum amounts**: Very small deposits may fail due to rent costs
- **Relayer fees**: 0.25% fee on withdrawals
- **Pool liquidity**: Withdrawals depend on pool having sufficient funds

---

## Default Behavior

When Privacy Cash is initialized in Hydentity:

- **Privacy routing is enabled by default** on the withdrawal page
- Funds automatically route through Privacy Cash when withdrawing
- You can toggle off privacy routing for direct withdrawals if preferred
- Direct withdrawals are faster but do not break the transaction link
