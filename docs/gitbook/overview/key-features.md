# Key Features

## Core Privacy Features

### Private Receiving
Accept payments to your `.sol` domain without exposing your main wallet. Senders see your domain name; your actual wallet remains hidden.

### MPC-Encrypted Destinations
Your withdrawal destination wallets are stored encrypted using Arcium's Multi-Party Computation network. No single party - including Hydentity - can access your destination addresses in plaintext.

### Privacy Cash Integration
Route withdrawals through Privacy Cash's zero-knowledge mixer pool. This breaks the on-chain link between your vault and your final destination, providing strong unlinkability.

### Configurable Privacy Policy
Customize your privacy settings:
- **Split transactions** into multiple smaller amounts
- **Add timing delays** between transactions
- **Choose distribution patterns** (uniform, weighted, exponential decay)

---

## Control & Security Features

### Full Custody
You maintain complete control of your funds at all times. Hydentity is non-custodial - only you can authorize withdrawals.

### Emergency Recovery
Direct withdrawal option bypasses all privacy features for immediate fund recovery. Your funds are never locked.

### Delegate System
Grant time-bounded permissions to other accounts. Useful for:
- Automated withdrawal services
- Trusted third-party management
- Multi-signature-like setups

### Domain Transfer
Transfer your SNS domain ownership to the vault for enhanced privacy. This hides your original wallet even from the domain registry.

---

## Privacy Levels

Choose your level of privacy with preset configurations:

| Level | Splits | Delay Range | Use Case |
|-------|--------|-------------|----------|
| **Low** | 1-3 | 1-10 minutes | Quick access, basic privacy |
| **Medium** | 2-5 | 5-30 minutes | Balanced privacy and speed |
| **High** | 3-5 | 2-8 hours | Maximum privacy, can wait |

---

## Technical Highlights

| Feature | Technology |
|---------|------------|
| On-chain program | Anchor (Rust) |
| Encrypted storage | Arcium MPC with Rescue Cipher |
| Transaction mixing | Privacy Cash ZK pool |
| Domain resolution | Solana Name Service (Bonfida) |
| Frontend | Next.js 14 with Wallet Adapter |

---

## What Makes Hydentity Different

1. **True Privacy, Not Obscurity** - Uses proven cryptographic techniques (MPC, ZK proofs) rather than just shuffling funds

2. **Domain-Native** - Works seamlessly with SNS domains you already own

3. **Non-Custodial** - You control your keys; we control nothing

4. **Emergency Access** - Privacy features never lock you out of your funds

5. **Composable** - TypeScript SDK for developers to integrate Hydentity into their applications
