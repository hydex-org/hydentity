# Hydentity - SNS Privacy Wrapper

Privacy-preserving receiving for Solana Name Service (.sol) domains. Accept SOL and tokens through your SNS domain while keeping your primary wallet private.

## Overview

Hydentity creates a privacy layer between your public .sol domain and your private wallet by:

1. **Vault Creation** - Creates a vault PDA that receives funds on behalf of your SNS name
2. **Domain Transfer** - Optionally transfer domain ownership to the vault for enhanced privacy
3. **Private Withdrawals** - Route withdrawals through Arcium MPC for encrypted destination handling
4. **Privacy Cash Integration** - Use Privacy Cash ZK mixer pool to break on-chain transaction links
5. **Split & Delay** - Randomize amounts and timing to prevent transaction graph analysis

## Key Features

- **Encrypted Destinations** - Withdrawal destinations are encrypted with MPC, never visible on-chain
- **Privacy Cash Routing** - ZK mixer pool breaks the link between vault deposits and final destinations
- **Randomized Timing** - Configurable delays between splits prevent timing analysis
- **Split Withdrawals** - Funds are split into random amounts across multiple transactions
- **Domain Protection** - Transfer SNS domain ownership to vault with reclaim capability

## Architecture

```
+-----------------------------------------------------------------------------+
|                              USER (Off-chain)                                |
|  - Generate encrypted config with x25519 key exchange                        |
|  - Submit encrypted destinations to Hydentity program                        |
+-------------------------------------+---------------------------------------+
                                      |
+-------------------------------------v---------------------------------------+
|                         HYDENTITY PROGRAM (On-chain)                         |
|  +---------------+  +---------------+  +---------------+  +---------------+  |
|  | NameVault     |  | VaultAuthority|  | PrivacyPolicy |  | EncryptedCfg  |  |
|  | (metadata)    |  | (holds SOL)   |  | (split/delay) |  | (MPC-only)    |  |
|  +---------------+  +---------------+  +---------------+  +---------------+  |
+-------------------------------------+---------------------------------------+
                                      |
          +---------------------------+---------------------------+
          |                                                       |
+---------v---------+                                   +---------v---------+
|   ARCIUM MPC      |                                   |   PRIVACY CASH    |
|   CLUSTER         |                                   |   ZK MIXER        |
| - Decrypts config |                                   | - Breaks tx links |
| - Generates plans |                                   | - Anonymity set   |
| - MPC signatures  |                                   | - Relayer service |
+-------------------+                                   +-------------------+
          |                                                       |
          +---------------------------+---------------------------+
                                      |
+-------------------------------------v---------------------------------------+
|                         DESTINATION WALLETS                                  |
|  - Funds arrive at destinations with no on-chain link to source vault        |
+-----------------------------------------------------------------------------+
```

## Project Structure

```
hydentity/
├── programs/hydentity/              # Anchor program (Rust)
│   └── src/
│       ├── lib.rs                   # Program entrypoint
│       ├── state/                   # Account structures
│       │   ├── name_vault.rs        # Main vault account
│       │   ├── vault_authority.rs   # SOL holder & token authority
│       │   ├── privacy_policy.rs    # User privacy settings
│       │   └── encrypted_config.rs  # MPC-encrypted config
│       ├── instructions/            # Instruction handlers
│       │   ├── initialize_vault.rs
│       │   ├── withdraw_direct.rs
│       │   ├── store_private_config.rs
│       │   ├── mark_domain_transferred.rs
│       │   └── reclaim_domain.rs
│       ├── errors.rs
│       └── constants.rs
│
├── encrypted-ixs/                   # Arcium MPC instructions
│   └── src/lib.rs                   # MPC circuit definitions
│
├── apps/hydentity-app/              # Next.js frontend
│   └── src/
│       ├── app/                     # Pages (dashboard, vault, settings, setup)
│       │   └── api/privacy-cash/    # Privacy Cash API routes
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── VaultCard.tsx
│       │   └── NetworkSwitcher.tsx
│       ├── hooks/
│       │   ├── useHydentity.ts      # Core vault hook
│       │   ├── usePrivateConfig.ts  # Arcium MPC config
│       │   ├── usePrivacyCash.ts    # Privacy Cash integration
│       │   └── useSnsDomains.ts     # SNS domain discovery
│       └── contexts/
│           └── NetworkContext.tsx   # Network switching
│
├── scripts/                         # Deployment scripts
│   └── init-arcium-devnet.ts
│
└── tests/                           # Integration tests
```

## Getting Started

### Prerequisites

- Rust 1.82+ with Solana toolchain
- Node.js 18+
- pnpm 8+
- Solana CLI
- Anchor CLI 0.32+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/hydentity.git
cd hydentity

# Install dependencies
pnpm install

# Build the Anchor program
anchor build

# Start the dApp
cd apps/hydentity-app
pnpm dev
```

### Deployment

Program ID (Devnet & Mainnet): `7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx`

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet
anchor deploy --provider.cluster mainnet

# Upgrade existing deployment
anchor upgrade target/deploy/hydentity.so --program-id 7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx
```

### Testing

```bash
# Run Anchor tests
anchor test

# Run app in dev mode
cd apps/hydentity-app && pnpm dev
```

## Usage

### Creating a Vault

1. Connect your wallet containing an SNS domain
2. Navigate to Setup and select your domain
3. Configure destination wallets (use fresh wallets for privacy)
4. Set privacy level (Low/Medium/High)
5. Confirm and sign the transaction

### Privacy Cash Withdrawal Flow

1. **Initialize Privacy Cash** - Sign a message to derive your encryption keypair
2. **Withdraw to Pool** - Funds move from vault to Privacy Cash mixer pool
3. **Private Withdrawal** - Withdraw from pool to any destination with no on-chain link

```typescript
// Example: Withdraw privately via Privacy Cash
const { withdraw } = usePrivacyCash();

// Withdraw from private balance to fresh wallet
await withdraw(amountLamports, 'FreshWalletAddress...');
```

### Direct Withdrawal (Non-Private)

For emergency access, funds can be withdrawn directly:

```typescript
const { withdrawDirect } = useHydentity();
await withdrawDirect('mydomain', destinationPubkey, amount);
```

Note: Direct withdrawals create a public on-chain link between vault and destination.

### Privacy Presets

| Preset | Splits | Delay Range | Use Case |
|--------|--------|-------------|----------|
| Low | 1-3 | 1-10 minutes | Quick access, minimal obfuscation |
| Medium | 2-5 | 5-30 minutes | Balanced privacy and convenience |
| High | 3-5 | 2-8 hours | Maximum privacy, longer wait |

## On-Chain Accounts

| Account | Seeds | Purpose |
|---------|-------|---------|
| NameVault | `["vault", sns_name_account]` | Vault metadata and stats |
| VaultAuthority | `["vault_auth", sns_name_account]` | Holds SOL, token authority |
| PrivacyPolicy | `["policy", sns_name_account]` | Public privacy settings |
| EncryptedConfig | `["encrypted_config", vault]` | MPC-encrypted destinations |

## Privacy Model

### What's Public (On-Chain)

- Vault address and balance
- Domain association (unless transferred)
- Direct withdrawal destinations (if used)

### What's Private

- Destinations configured via Arcium MPC
- Privacy Cash withdrawal destinations
- Individual split amounts and timing
- Link between vault deposits and final destinations (via Privacy Cash)

### Trust Model

- **Arcium MPC**: Distributed trust - no single node can decrypt configurations
- **Privacy Cash**: ZK proofs ensure withdrawal validity without revealing source

## Domain Transfer

Transfer SNS domain ownership to your vault for enhanced privacy:

```typescript
// Transfer domain to vault authority (hides original owner)
await transferDomainToVault('mydomain');

// Reclaim domain when needed
await reclaimDomain('mydomain', newOwnerPubkey);
```

**Before Transfer:** `mydomain.sol -> Owned by: YourWallet (visible)`

**After Transfer:** `mydomain.sol -> Owned by: VaultAuthority PDA`

## Security Considerations

1. **Fresh Wallets** - Use destination wallets not linked to your identity
2. **Privacy Cash** - Always use Privacy Cash routing for maximum privacy
3. **Timing Variation** - Higher delays make transaction correlation harder
4. **Domain History** - Previous owners may still be visible in historical data
5. **Direct Withdrawals** - Avoid unless necessary; they expose vault-to-destination links

## Environment Variables

```bash
# apps/hydentity-app/.env.local
# RPC endpoints (server-side only, not exposed to browser)
DEVNET_RPC=https://api.devnet.solana.com
MAINNET_RPC=https://your-rpc-endpoint.com

# WebSocket endpoints (can be public, no API keys)
NEXT_PUBLIC_DEVNET_WS=wss://api.devnet.solana.com
NEXT_PUBLIC_MAINNET_WS=wss://api.mainnet-beta.solana.com
```

## Current Status

### Completed

- Vault creation and management
- Privacy policy configuration
- Domain transfer and reclaim
- Privacy Cash ZK mixer integration
- Mainnet deployment
- Full React frontend with withdrawal UI

### In Progress

- Arcium MPC integration (encrypted config storage)
- SPL token support

### Planned

- Auto-withdrawal triggers
- Multi-domain vault management
- Mobile UI improvements

## License

MIT License - see LICENSE for details.

## Related Projects

- [Bonfida SNS SDK](https://github.com/Bonfida/sns-sdk) - Solana Name Service SDK
- [Arcium Network](https://arcium.com) - MPC infrastructure for confidential computing
- [Privacy Cash](https://privacycash.org) - ZK mixer for Solana
