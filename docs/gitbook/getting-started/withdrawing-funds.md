# Withdrawing Funds

## Withdrawal Options

Hydentity offers two withdrawal methods:

| Method | Privacy | Speed | Use Case |
|--------|---------|-------|----------|
| **Private Withdrawal** | High | Slower | Normal use, privacy matters |
| **Direct Withdrawal** | None | Instant | Emergency, time-sensitive |

---

## Private Withdrawal (Recommended)

Private withdrawals route funds through Privacy Cash, breaking the on-chain link between your vault and final destination.

### Step 1: Initialize Privacy Cash (One-Time)

If you haven't used Privacy Cash before:

1. Go to your vault page
2. Click "Initialize Privacy Cash"
3. Sign the message in your wallet
4. Your derived keypair is created and cached

### Step 2: Withdraw from Vault

1. Enter the amount to withdraw
2. Ensure "Privacy Routing" is enabled (default when Privacy Cash is initialized)
3. Click "Withdraw"
4. Approve the transaction

**What happens:**
```
Vault → Derived Keypair → Privacy Cash Pool
```

Your funds are now in the Privacy Cash anonymous pool.

### Step 3: Claim from Privacy Cash

1. Go to the "Claim" page or vault details
2. Enter your final destination address
3. Enter the amount to withdraw
4. Click "Claim"
5. Privacy Cash relayer executes the transfer

**What happens:**
```
Privacy Cash Pool → Your Final Destination
```

**Result:** No on-chain link between your vault and final destination.

---

## Direct Withdrawal (Emergency)

Direct withdrawals skip Privacy Cash for immediate access. Use only when necessary.

### When to Use
- Emergency fund recovery
- Time-sensitive needs
- Privacy is not a concern

### How to Withdraw Directly

1. Go to your vault page
2. Toggle OFF "Privacy Routing"
3. Enter destination address and amount
4. Click "Withdraw Direct"
5. Approve the transaction

**Warning:** Direct withdrawals create a public, permanent link between your vault and destination wallet.

---

## Fees

### Private Withdrawal Fees

| Fee Type | Amount |
|----------|--------|
| Vault withdrawal | Standard Solana tx (~5,000 lamports) |
| Privacy Cash deposit | UTXO rent (~0.003 SOL) |
| Privacy Cash withdrawal | 0.25% of amount |

### Direct Withdrawal Fees

| Fee Type | Amount |
|----------|--------|
| Transaction fee | Standard Solana tx (~5,000 lamports) |

---

## Minimum Amounts

### Privacy Cash Route
- **Minimum:** ~0.005 SOL
- Smaller amounts may fail due to UTXO rent costs

### Direct Route
- **Minimum:** 0.00001 SOL (dust threshold)

---

## Withdrawal Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  Start Withdrawal                        │
└─────────────────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
    ┌─────────────────┐     ┌─────────────────┐
    │ Privacy Routing │     │  Direct Route   │
    │    (Default)    │     │  (Emergency)    │
    └─────────────────┘     └─────────────────┘
              │                       │
              ▼                       │
    ┌─────────────────┐               │
    │ Vault → Derived │               │
    │    Keypair      │               │
    └─────────────────┘               │
              │                       │
              ▼                       │
    ┌─────────────────┐               │
    │ Derived Keypair │               │
    │ → Privacy Cash  │               │
    └─────────────────┘               │
              │                       │
              ▼                       ▼
    ┌─────────────────┐     ┌─────────────────┐
    │ Privacy Cash →  │     │   Vault →       │
    │ Final Wallet    │     │ Final Wallet    │
    │  (No link!)     │     │ (Public link!)  │
    └─────────────────┘     └─────────────────┘
```

---

## Troubleshooting

### "Insufficient balance"
- Check vault balance on dashboard
- Account for fees (especially Privacy Cash UTXO rent)

### "Amount too small"
- Privacy Cash requires minimum ~0.005 SOL
- Increase withdrawal amount or use direct withdrawal

### "Privacy Cash not initialized"
- Click "Initialize Privacy Cash" on vault page
- Sign the derivation message

### "Transaction failed"
- Ensure wallet is connected
- Check network (Devnet vs Mainnet)
- Try again with smaller amount

---

## Best Practices

1. **Use private withdrawal by default** - Only use direct when necessary
2. **Batch smaller amounts** - Combine small balances before withdrawing through Privacy Cash
3. **Check fees** - Privacy Cash has a 0.25% withdrawal fee
4. **Be patient** - Private withdrawals take longer but provide real privacy
