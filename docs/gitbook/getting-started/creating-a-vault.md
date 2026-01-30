# Creating a Vault

## Prerequisites

Before creating a Hydentity vault, you need:

1. **A Solana wallet** (Phantom, Solflare, Backpack, etc.)
2. **A `.sol` domain** registered through [SNS](https://sns.id)
3. **Some SOL** for transaction fees (~0.01 SOL)

---

## Step-by-Step Guide

### Step 1: Connect Your Wallet

1. Visit [hydentity-hydentity-app.vercel.app](https://hydentity-hydentity-app.vercel.app/)
2. Click "Connect Wallet"
3. Select your wallet provider
4. Approve the connection

### Step 2: Select Your Domain

After connecting, Hydentity will display your `.sol` domains:

```
┌─────────────────────────────────────┐
│   Your Domains                      │
├─────────────────────────────────────┤
│   ○ alice.sol                       │
│   ○ mycompany.sol                   │
│   ○ anon.sol                        │
└─────────────────────────────────────┘
```

Select the domain you want to create a vault for.

**Don't see your domain?** Enter it manually using the search field.

### Step 3: Configure Destinations

Add one or more destination wallets. These are where your funds will ultimately go when you withdraw.

```
┌─────────────────────────────────────┐
│   Destination Wallets               │
├─────────────────────────────────────┤
│   Wallet 1: [paste address]         │
│   Wallet 2: [paste address]         │
│   + Add another destination         │
└─────────────────────────────────────┘
```

**Privacy tip:** Use a fresh wallet that has no connection to your main identity.

### Step 4: Choose Privacy Settings

Select a privacy preset or configure custom settings:

| Preset | Description |
|--------|-------------|
| **Low** | Quick access, basic privacy (1-3 splits, 1-10 min delays) |
| **Medium** | Balanced privacy (2-5 splits, 5-30 min delays) |
| **High** | Maximum privacy (3-5 splits, 2-8 hour delays) |
| **Custom** | Configure your own split and delay ranges |

### Step 5: Review and Create

Review your configuration:

```
┌─────────────────────────────────────┐
│   Review Your Vault                 │
├─────────────────────────────────────┤
│   Domain: alice.sol                 │
│   Destinations: 2 wallets           │
│   Privacy Level: Medium             │
│   Splits: 2-5                       │
│   Delays: 5-30 minutes              │
└─────────────────────────────────────┘
│                                     │
│   [Create Vault]                    │
└─────────────────────────────────────┘
```

Click **Create Vault** and approve the transaction in your wallet.

---

## What Happens On-Chain

When you create a vault, the program:

1. **Creates NameVault PDA** - Stores vault metadata
2. **Creates VaultAuthority PDA** - Will hold your funds
3. **Creates PrivacyPolicy PDA** - Stores your privacy settings
4. **Creates EncryptedConfig** - Stores MPC-encrypted destinations

---

## After Creation

Once your vault is created, you need to transfer your domain to the vault for it to start receiving funds.

### Step 6: Transfer Domain to Vault

This step is **required** for the vault to work. Until the domain is transferred, sending to your `.sol` name will not route to the vault.

1. On the vault detail page, find the "Domain Ownership" section
2. Click **"Transfer Domain to Vault"**
3. Approve the SNS transfer transaction in your wallet

**What this does:**
- The vault authority PDA becomes the owner of the `.sol` domain
- Funds sent to `yourdomain.sol` are now received by the vault
- Your original wallet is no longer listed as the domain owner

**Reversible:** You can reclaim domain ownership at any time using the "Reclaim Domain" option on the vault page.

---

Once the domain is transferred:

- **Share your domain**: Anyone can now send funds to `yourdomain.sol` and they arrive in the vault
- **Check your dashboard**: See your vault balance anytime
- **Withdraw privately**: Use Privacy Cash to claim funds anonymously

---

## Troubleshooting

### "Domain not found"
- Ensure you own the domain
- Check you're connected with the correct wallet
- Try entering the domain manually

### "Transaction failed"
- Ensure you have enough SOL for fees (~0.01 SOL)
- Check your wallet is connected to the correct network (Devnet/Mainnet)

### "Vault already exists"
- A vault already exists for this domain
- Go to your dashboard to view and manage it
