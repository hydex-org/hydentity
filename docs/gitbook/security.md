# Security

## Security Model

Hydentity is designed with security as a core principle. Here's how the protocol protects users and their funds.

---

## Non-Custodial Design

Hydentity is fully non-custodial. At no point does Hydentity or any third party have the ability to:

- Access your funds
- Move your funds without authorization
- Block withdrawals
- See your private destination addresses

**Your keys, your funds.** The vault owner (SNS domain owner at creation) is the only party that can authorize withdrawals.

---

## On-Chain Security

### SNS Ownership Verification

When you create a vault or perform sensitive operations, the program verifies you own the SNS domain by reading the owner field from the SNS account data structure.

```
User claims domain → Program reads SNS account → Verifies owner matches signer
```

### PDA Authority Model

The VaultAuthority PDA acts as the authority for all fund movements:

- Only the program can sign on behalf of this PDA
- Transfers require valid instruction context
- No external party can access vault funds

### Permission Checks

All authorization happens on-chain:
- Owner verification for sensitive operations
- Delegate expiration checked on each call
- Permission bitmap validated for delegate actions

---

## MPC Security

### Encrypted Destination Storage

Your withdrawal destination wallets are encrypted using Arcium's MPC network:

1. **Client-side encryption** - Data encrypted before leaving your device
2. **MPC cluster key** - Only the distributed cluster can decrypt
3. **Never plaintext on-chain** - Encrypted blob stored, not addresses

### Trust Model

- **No single point of failure** - MPC requires threshold of nodes
- **Collusion resistant** - Impractical for enough nodes to collude
- **Transparent computation** - Operations auditable via on-chain events

---

## Emergency Access

Privacy features never lock you out of your funds.

### Direct Withdrawal

The `withdraw_direct` instruction bypasses all privacy features:
- Transfers directly to specified address
- Available to vault owner at any time
- No MPC or Privacy Cash required

**Trade-off:** Direct withdrawals create a public on-chain link between vault and destination.

### Fund Recovery

In any situation, you can:
1. Connect your wallet (vault owner)
2. Use direct withdrawal
3. Receive funds immediately

---

## Privacy Cash Security

### Derived Keypair

Your Privacy Cash operations use a derived keypair:
- Deterministic from your wallet signature
- Session-cached only (not persistent)
- Separates Privacy Cash identity from main wallet

### ZK Proof Security

Privacy Cash uses zero-knowledge proofs:
- Mathematically proven privacy guarantees
- Withdrawals verified without revealing source
- No trust in relayer required for privacy

---

## Security Considerations

### What's Protected

| Aspect | Protection |
|--------|------------|
| Destination addresses | MPC encryption |
| Withdrawal patterns | Split randomization |
| Transaction links | Privacy Cash mixing |
| Fund access | Owner-only authorization |

### What's Public

| Aspect | Visibility |
|--------|------------|
| Vault balance | On-chain, visible |
| Deposits | Transaction history visible |
| Vault existence | Anyone can see vault for domain |
| Policy settings (non-destination) | On-chain, visible |

### Recommended Practices

1. **Use fresh destination wallets** - Don't use wallets linked to your identity
2. **Enable Privacy Cash** - Break transaction links when withdrawing
3. **Transfer domain ownership** - Hide original wallet from registry
4. **Use appropriate delays** - Higher delays = better privacy

---

## Transaction Limits

### Privacy Cash Limits

| Limit | Value | Reason |
|-------|-------|--------|
| Minimum deposit | ~0.005 SOL | UTXO rent costs |

Small deposits may fail because Privacy Cash creates internal accounts that require rent.

### Validation

The UI validates amounts before submission:
- Warns when deposits are too small
- Prevents transactions likely to fail
- Displays fee estimates

---

## Audit Status

The Hydentity protocol is currently unaudited. Users should understand:

- Smart contracts may contain bugs
- MPC integration is relatively new technology
- Privacy Cash is a third-party dependency

**Use at your own risk.** Start with small amounts until you're comfortable.

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** disclose publicly
2. Contact the team privately
3. Provide detailed reproduction steps
4. Allow time for fix before disclosure

---

## Best Practices

### For Maximum Security

1. **Hardware wallet** - Use for vault operations
2. **Fresh destinations** - New wallets with no history
3. **Privacy Cash** - Always route through mixer
4. **Domain transfer** - Hide original wallet
5. **Regular rotation** - Update destinations periodically

### For Normal Use

1. **Enable Privacy Cash** - Default on
2. **Medium privacy preset** - Good balance
3. **Monitor vault** - Check deposits regularly
4. **Backup access** - Remember you own the SNS domain
