# What is Hydentity?

Hydentity is a **Solana Name Service (SNS) Privacy Wrapper** that enables users to receive SOL and SPL tokens through their `.sol` domain while keeping their primary wallet addresses completely private.

## The Core Concept

Think of Hydentity as a privacy-preserving mailbox for your crypto:

```
Without Hydentity:
alice.sol → Alice's Wallet (publicly visible)

With Hydentity:
alice.sol → Hydentity Vault → [Privacy Layer] → Alice's Wallet (hidden)
```

When someone sends funds to your `.sol` domain, the funds go to a Hydentity vault instead of directly to your wallet. You can then withdraw those funds through privacy-preserving channels that break the on-chain link between the sender and your final destination.

## How It Achieves Privacy

Hydentity uses a layered privacy approach:

### 1. Domain Transfer & Vault Separation
When you create a vault, you transfer your SNS domain ownership to the vault authority. Your `.sol` domain then resolves to the vault address instead of your personal wallet, separating your public identity from your private holdings.

### 2. Encrypted Destinations
Your withdrawal destination wallets are encrypted using Arcium's Multi-Party Computation (MPC) network. The destination addresses are never exposed on-chain in plaintext.

### 3. Transaction Link Breaking
When you withdraw, funds are routed through Privacy Cash - a zero-knowledge mixer pool. This breaks the on-chain transaction trail between your vault and your final destination.

### 4. Randomized Patterns
Withdrawals can be split into multiple smaller transactions with randomized amounts and timing delays, making transaction analysis significantly harder.

## Who Is It For?

- **Privacy-conscious users** who want to receive payments without exposing their wallet
- **Businesses** accepting crypto payments who need to separate public-facing addresses from treasury
- **DAOs and organizations** managing funds with privacy requirements
- **Anyone** who believes financial privacy is a fundamental right

## Key Differentiator

Unlike simple forwarding services, Hydentity doesn't just move funds from A to B. It uses cryptographic techniques (MPC + ZK proofs) to ensure that even sophisticated on-chain analysis cannot link your public domain to your private wallet.
