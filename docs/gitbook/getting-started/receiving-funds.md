# Receiving Funds

## How It Works

Once your Hydentity vault is created and you've transferred your domain to the vault, receiving funds is simple. Anyone can send SOL or SPL tokens to your `.sol` domain, and the funds will arrive in your vault.

```
Sender                          Your Vault
   │                                │
   │  Sends to "alice.sol"          │
   │ ──────────────────────────────>│
   │                                │
   │        Funds in vault          │
   │                                │
```

> **Important:** Your domain must be transferred to the vault for this to work. Until the transfer, sending to your `.sol` name routes to your personal wallet, not the vault. See [Creating a Vault](creating-a-vault.md) for setup instructions.

---

## For Senders

Senders don't need to do anything special. They simply:

1. Open their wallet
2. Enter your `.sol` domain (e.g., `alice.sol`)
3. Send SOL or tokens

The wallet resolves your domain through SNS and sends to your vault address.

**What senders see:**
- Your domain name (`alice.sol`)
- The vault address (not your personal wallet)

**What senders DON'T see:**
- Your actual wallet address
- Where you'll eventually withdraw to
- Any of your other transactions

---

## Checking Your Balance

### Dashboard View

Your Hydentity dashboard shows all your vaults and balances:

```
┌─────────────────────────────────────┐
│   alice.sol                         │
├─────────────────────────────────────┤
│   Vault Balance:    5.25 SOL        │
│   Private Balance:  2.10 SOL        │
│   Total Received:   12.50 SOL       │
│   Deposits:         8               │
│                                     │
│   [View Details]  [Withdraw]        │
└─────────────────────────────────────┘
```

### Balance Types

| Balance | Description |
|---------|-------------|
| **Vault Balance** | Funds sitting in your vault, ready to withdraw |
| **Private Balance** | Funds already in Privacy Cash pool |
| **Total Received** | All-time deposits to this vault |

---

## Receiving Different Assets

### SOL
SOL is held directly in the VaultAuthority PDA account.

### SPL Tokens
SPL tokens require an Associated Token Account (ATA) for the vault. Hydentity creates these automatically when needed.

---

## Notifications

Hydentity doesn't currently send push notifications. To monitor deposits:

1. Check your dashboard periodically
2. Use Solana block explorers to watch your vault address
3. Set up wallet alerts using third-party services

---

## Transaction History

View all deposits to your vault in the vault details page:

```
┌─────────────────────────────────────────────────────────┐
│   Deposit History                                        │
├─────────────────────────────────────────────────────────┤
│   Jan 15  │  +2.5 SOL   │  From: 7xK9...  │  View Tx   │
│   Jan 12  │  +1.0 SOL   │  From: 3mN4...  │  View Tx   │
│   Jan 10  │  +0.75 SOL  │  From: 9pQ2...  │  View Tx   │
└─────────────────────────────────────────────────────────┘
```

---

## Privacy Considerations

### What's Public
- Transactions to your vault are visible on-chain
- Senders can see other deposits to the same vault
- Vault balance is publicly visible

### What's Private
- Your withdrawal destinations
- Where funds go after leaving the vault
- Your real wallet address

### Maximizing Privacy

For maximum privacy when receiving:

1. **Don't share vault address directly** - Always share your `.sol` domain instead
2. **Withdraw through Privacy Cash** - Break the link when claiming funds
