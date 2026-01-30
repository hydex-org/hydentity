# Hydentity

## Privacy Layer for Solana Name Service

**Hydentity** is a privacy wrapper for Solana Name Service (SNS) domains that lets you receive payments to your `.sol` domain while keeping your actual wallet addresses completely private.

---

## The Problem

When you register a `.sol` domain like `alice.sol`, anyone who sends you funds can see your wallet address. Every transaction creates a permanent, public link between:

- Your human-readable domain name
- Your wallet address
- Your entire transaction history

This transparency makes it trivial to track someone's finances, identify their holdings, and monitor their on-chain activity.

---

## The Solution

Hydentity creates a **privacy vault** between your public domain and your private wallet(s). Here's how it works:

1. **Create a Vault** - Link your `.sol` domain to a Hydentity vault
2. **Transfer Domain to Vault** - Transfer your domain's ownership to the vault so that funds sent to your `.sol` name are received by the vault
3. **Receive Privately** - Payments to `yourdomain.sol` go to your vault, not your personal wallet
4. **Withdraw Anonymously** - Route funds through Privacy Cash's ZK mixer to break the transaction trail
5. **Stay in Control** - Full access to your funds at all times with emergency direct withdrawal. You can reclaim domain ownership at any time

---

## Built With

| Technology | Purpose |
|------------|---------|
| **Solana** | High-speed, low-cost blockchain |
| **SNS (Bonfida)** | Human-readable domain names |
| **Arcium MPC** | Multi-party computation for encrypted destinations |
| **Privacy Cash** | Zero-knowledge mixer pool |
| **Anchor** | Solana smart contract framework |

---

## Quick Links

- **Live App**: [hydentity-hydentity-app.vercel.app](https://hydentity-hydentity-app.vercel.app/)
- **Program ID**: `7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx`
- **Networks**: Devnet & Mainnet

---

## Solana Privacy Hack 2026

Hydentity is a submission to the Solana Privacy Hack, demonstrating how privacy-preserving infrastructure can be built on Solana using cutting-edge cryptographic techniques like MPC and zero-knowledge proofs.

> **Privacy is not about having something to hide. It's about having the right to choose what you reveal.**
