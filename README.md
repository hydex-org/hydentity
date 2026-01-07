# Hydentity - SNS Privacy Wrapper

Privacy-preserving receiving for Solana Name Service (.sol) domains. Accept SOL and tokens through your SNS domain while keeping your primary wallet private.

## Overview

Hydentity creates a privacy layer between your public .sol domain and your private wallet by:

1. **Vault Creation** - Creates a vault PDA that receives funds on behalf of your SNS name
2. **Domain Transfer** - Optionally transfer domain ownership to the vault for enhanced privacy
3. **Private Withdrawals** - Route withdrawals through Arcium MPC for encrypted destination handling
4. **Umbra Integration** - Use Umbra Protocol mixer pools for additional unlinkability
5. **Split & Delay** - Randomize amounts and timing to prevent transaction graph analysis

## Key Features

- 🔒 **Encrypted Destinations** - Withdrawal destinations are encrypted with MPC, never visible on-chain
- ⏱️ **Randomized Timing** - Configurable delays between splits prevent timing analysis
- 💰 **Split Withdrawals** - Funds are split into random amounts across multiple transactions
- 🔄 **Domain Protection** - Transfer SNS domain ownership to vault with reclaim capability
- 🤖 **Auto-Withdraw** - Optional automatic withdrawals when vault reaches a threshold

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER (Off-chain)                                │
│  - Generate encrypted config with x25519 key exchange                        │
│  - Submit encrypted destinations to Hydentity program                        │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│                         HYDENTITY PROGRAM (On-chain)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ NameVault    │  │ PrivacyPolicy│  │ EncryptedCfg │  │ PendingWithdraw  │ │
│  │ (holds SOL)  │  │ (split/delay)│  │ (MPC-only)   │  │ (MPC-executed)   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│                           ARCIUM MPC CLUSTER                                 │
│  - Decrypts vault configurations (no single party has full access)          │
│  - Generates randomized withdrawal plans                                     │
│  - Executes splits with collective MPC signatures                            │
│  - Manages timing delays autonomously                                        │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│                         DESTINATION WALLETS                                  │
│  - Funds arrive at encrypted destinations                                    │
│  - External observers cannot link to source vault                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
hydentity/
├── programs/hydentity/              # Anchor program (Rust)
│   ├── src/
│   │   ├── lib.rs                   # Program entrypoint
│   │   ├── state/                   # Account structures
│   │   │   ├── name_vault.rs        # Main vault account
│   │   │   ├── privacy_policy.rs    # User privacy settings
│   │   │   ├── encrypted_config.rs  # MPC-encrypted config
│   │   │   └── pending_withdrawal.rs # Active withdrawal tracking
│   │   ├── instructions/            # Instruction handlers
│   │   │   ├── initialize_vault.rs
│   │   │   ├── store_private_config.rs  # Arcium integration
│   │   │   ├── request_withdrawal.rs    # MPC withdrawal
│   │   │   ├── mark_domain_transferred.rs
│   │   │   └── reclaim_domain.rs
│   │   ├── errors.rs
│   │   └── constants.rs
│   └── encrypted-ixs/               # Arcis MPC instructions
│       ├── store_config.rs          # Encrypted config storage
│       ├── generate_plan.rs         # Randomized plan generation
│       ├── execute_split.rs         # MPC-signed execution
│       └── query_balance.rs         # Encrypted balance query
│
├── packages/hydentity-sdk/          # TypeScript SDK
│   └── src/
│       ├── client/
│       │   ├── hydentity-client.ts  # Main SDK client
│       │   ├── arcium-client.ts     # MPC encryption helpers
│       │   ├── private-config.ts    # Config management
│       │   ├── policy-engine.ts     # Split/delay generation
│       │   └── umbra-bridge.ts      # Umbra integration
│       ├── interfaces/              # Abstract interfaces
│       ├── implementations/         # Concrete implementations
│       ├── instruction-builders/    # Transaction builders
│       └── utils/                   # Utilities (PDA, SNS, etc.)
│
├── apps/hydentity-app/              # React dApp (Next.js)
│   └── src/
│       ├── app/                     # Pages (dashboard, vault, settings)
│       ├── components/
│       │   ├── PrivateConfigSetup.tsx   # Config wizard
│       │   ├── WithdrawalStatus.tsx     # Withdrawal tracking
│       │   └── VaultCard.tsx            # Vault display
│       └── hooks/
│           ├── useHydentity.ts          # Core vault hook
│           ├── usePrivateConfig.ts      # Encrypted config
│           └── useWithdrawals.ts        # Withdrawal management
│
├── docs/
│   └── arcium-integration-spec.md   # Detailed Arcium integration spec
│
└── tests/                           # Integration tests
```

## Getting Started

### Prerequisites

- Rust 1.82+ with Solana toolchain
- Node.js 18+
- pnpm 8+
- Solana CLI

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/hydentity.git
cd hydentity

# Install dependencies
pnpm install

# Build the Anchor program
anchor build

# Build the SDK
pnpm --filter @hydentity/sdk build

# Start the dApp
pnpm --filter @hydentity/app dev
```

### Devnet Deployment

```bash
# Configure for devnet
solana config set --url devnet

# Deploy the program
anchor deploy --provider.cluster devnet

# Or upgrade existing deployment
solana program deploy target/deploy/hydentity.so --program-id <PROGRAM_ID> --url devnet
```

### Testing

```bash
# Run Anchor tests
anchor test

# Run SDK tests
pnpm --filter @hydentity/sdk test

# Run app in dev mode
pnpm --filter @hydentity/app dev
```

## Usage

### SDK Quick Start

```typescript
import { HydentityClient } from '@hydentity/sdk';
import { Connection } from '@solana/web3.js';

// Create client
const client = HydentityClient.fromRpcUrl('https://api.devnet.solana.com');
client.setSigner(yourSigner);

// Initialize a vault for your SNS domain
await client.initializeVault('myname'); // myname.sol

// Configure privacy policy (on-chain, public settings)
await client.updatePolicy('myname', {
  minSplits: 2,
  maxSplits: 5,
  minDelaySeconds: 300,   // 5 minutes
  maxDelaySeconds: 1800,  // 30 minutes
});
```

### Private Config Setup (Arcium)

```typescript
import { PrivateConfigManager, PRIVACY_PRESETS } from '@hydentity/sdk';

// Initialize MPC client
const configManager = new PrivateConfigManager(connection, programId);
await configManager.initialize();

// Create encrypted config with preset
const config = configManager.createConfig(
  ownerPubkey,
  [destinationWallet1, destinationWallet2], // These are encrypted!
  'medium' // 'low' | 'medium' | 'high'
);

// Store encrypted config (only MPC can decrypt)
const { transaction } = await configManager.buildStoreConfigTransaction(
  vaultPubkey,
  config,
  payer
);
```

### Privacy Presets

| Preset | Splits | Delay Range | Use Case |
|--------|--------|-------------|----------|
| **Low** | 1-3 | 1-10 minutes | Quick access, minimal obfuscation |
| **Medium** | 2-5 | 5-30 minutes | Balanced privacy and convenience |
| **High** | 3-6 | 2-8 hours | Maximum privacy, longer wait |

### On-Chain Accounts

| Account | Seeds | Purpose |
|---------|-------|---------|
| NameVault | `["vault", sns_name_account]` | Holds received funds |
| VaultAuthority | `["vault_auth", sns_name_account]` | Token authority & domain owner |
| PrivacyPolicy | `["policy", sns_name_account]` | Public privacy settings |
| EncryptedConfig | `["encrypted_config", vault]` | MPC-encrypted destinations |
| PendingWithdrawal | `["pending_withdrawal", vault, offset]` | Active withdrawal plans |

## Privacy Model

### What's Public (On-Chain)

- Vault address and balance
- Total withdrawal amount
- Split count progress (X of Y complete)
- Timing of split executions

### What's Private (Encrypted)

- Destination wallet addresses
- Individual split amounts
- Exact timing delays
- Which destination receives which split

### Trust Model

Hydentity uses **distributed trust** via Arcium MPC:

- No single MPC node can decrypt your configuration
- Threshold of nodes required for decryption (e.g., 3-of-5)
- Cryptographic verification of all computations
- Economic penalties for malicious behavior

## Domain Transfer

Transfer SNS domain ownership to your vault for enhanced privacy:

```typescript
// Transfer domain to vault authority (hides original owner)
await client.transferDomainToVault('myname');

// Reclaim domain when needed
await client.reclaimDomain('myname', newOwnerPubkey);
```

**Before Transfer:**
```
myname.sol → Owned by: YourWallet (VISIBLE)
```

**After Transfer:**
```
myname.sol → Owned by: VaultAuthority PDA (anonymous)
```

## Security Considerations

1. **Destination Privacy** - Never reveal destinations on-chain or in logs
2. **Fresh Wallets** - Use fresh destination wallets not linked to your identity
3. **Timing Variation** - Higher delays = harder to correlate transactions
4. **Split Distribution** - More splits = more noise in transaction graph
5. **Domain History** - Previous owners/resolvers may still be visible in historical data

## Current Status

### Implemented ✅

- Vault creation and management
- Privacy policy configuration
- Domain transfer to vault
- Domain reclaim from vault
- Arcium integration structure (stubs)
- SDK encryption helpers
- React app with full UI

### In Progress 🔄

- Arcium MPC integration (awaiting `arcium-anchor` crate release)
- Umbra mixer integration
- Relayer service for gas abstraction

### Planned 📋

- Multi-sig vault support
- Time-locked withdrawals
- Emergency recovery via MPC
- SPL token support

## Development

### Environment Variables

```bash
# .env.local (for dApp)
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=46mwRQo4f6sLy9cigZdVJgdEpeEVc6jLRG1H241Uk9GY
```

### Key Files

| File | Purpose |
|------|---------|
| `Anchor.toml` | Anchor configuration |
| `pnpm-workspace.yaml` | Monorepo workspace config |
| `turbo.json` | Turborepo build config |
| `programs/hydentity/src/lib.rs` | Program entrypoint |
| `packages/hydentity-sdk/src/index.ts` | SDK exports |
| `apps/hydentity-app/src/app/page.tsx` | Dashboard page |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read our contributing guidelines first.

### Development Flow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`anchor test && pnpm test`)
5. Commit with conventional commits (`git commit -m 'feat: add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Related Projects

- [Bonfida SNS SDK](https://github.com/Bonfida/sns-sdk) - Solana Name Service SDK
- [Arcium Network](https://arcium.com) - MPC infrastructure for confidential computing
- [Umbra Protocol](https://umbra.cash) - Stealth address protocol

---

Built with ❤️ for privacy on Solana
