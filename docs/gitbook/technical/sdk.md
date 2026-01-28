# TypeScript SDK

## Overview

The Hydentity SDK provides TypeScript bindings for interacting with the Hydentity protocol from client applications.

**Package:** `@hydentity/sdk`

---

## Installation

```bash
npm install @hydentity/sdk
# or
pnpm add @hydentity/sdk
# or
yarn add @hydentity/sdk
```

---

## Quick Start

```typescript
import { HydentityClient } from '@hydentity/sdk';

// Create client
const client = HydentityClient.fromRpcUrl('https://api.devnet.solana.com');

// Set signer (wallet adapter or keypair)
client.setSigner(walletAdapter);

// Initialize a vault
await client.initializeVault('mydomain');

// Get vault info
const vault = await client.getVaultAccount('mydomain');
console.log('Balance:', vault.balance);

// Update privacy policy
await client.updatePolicy('mydomain', {
  minSplits: 3,
  maxSplits: 5,
  minDelaySeconds: 300,
  maxDelaySeconds: 3600,
});

// Direct withdrawal
await client.withdrawDirect('mydomain', destinationPubkey, amount);
```

---

## Core Classes

### HydentityClient

Main entry point for all protocol interactions.

```typescript
class HydentityClient {
  // Factory methods
  static fromRpcUrl(url: string): HydentityClient;
  static fromConnection(connection: Connection): HydentityClient;

  // Configuration
  setSigner(signer: ISigner): void;

  // Vault operations
  initializeVault(domain: string): Promise<TransactionSignature>;
  getVaultAccount(domain: string): Promise<NameVault>;
  getVaultBalance(domain: string): Promise<bigint>;

  // Withdrawals
  withdrawDirect(domain: string, destination: PublicKey, amount: bigint): Promise<TransactionSignature>;
  requestWithdrawal(domain: string, amount: bigint): Promise<TransactionSignature>;

  // Policy management
  updatePolicy(domain: string, policy: PolicyConfig): Promise<TransactionSignature>;
  getPolicy(domain: string): Promise<PrivacyPolicy>;

  // Delegates
  addDelegate(domain: string, delegate: PublicKey, expires: Date, permissions: number): Promise<TransactionSignature>;
  revokeDelegate(domain: string, delegate: PublicKey): Promise<TransactionSignature>;

  // Domain transfer
  transferDomainToVault(domain: string): Promise<TransactionSignature>;
  reclaimDomain(domain: string, destination: PublicKey): Promise<TransactionSignature>;
}
```

### PolicyEngine

Generates randomized execution plans based on policy configuration.

```typescript
class PolicyEngine {
  constructor(masterSeed: Uint8Array, policyNonce: bigint);

  generateExecutionPlan(amount: bigint, policy: PrivacyPolicy): ExecutionPlan;
}

interface ExecutionPlan {
  splits: bigint[];
  delays: number[];
}
```

### ArciumClient

Manages Arcium MPC interactions.

```typescript
class ArciumClient {
  constructor(connection: Connection, programId: PublicKey);

  storePrivateConfig(vaultPubkey: PublicKey, config: PrivateVaultConfig): Promise<TransactionSignature>;
  requestWithdrawal(vaultPubkey: PublicKey, amount: bigint, entropy: Uint8Array): Promise<TransactionSignature>;
  getConfigStatus(vaultPubkey: PublicKey): Promise<ConfigStatus>;
}
```

---

## Utility Functions

### PDA Derivation

```typescript
import {
  getNameVaultPda,
  getVaultAuthorityPda,
  getPrivacyPolicyPda,
  getDelegateSessionPda,
  getEncryptedConfigPda
} from '@hydentity/sdk';

const [vaultPda, bump] = getNameVaultPda(snsNameAccount);
const [authorityPda] = getVaultAuthorityPda(snsNameAccount);
const [policyPda] = getPrivacyPolicyPda(snsNameAccount);
```

### SNS Helpers

```typescript
import { getSnsNameAccount, verifySnsOwnership } from '@hydentity/sdk';

const snsAccount = await getSnsNameAccount('mydomain');
const isOwner = await verifySnsOwnership(connection, 'mydomain', walletPubkey);
```

### Randomness

```typescript
import { generateSecureRandomness } from '@hydentity/sdk';

const entropy = generateSecureRandomness(32); // 32 bytes of secure randomness
```

---

## Types

### Vault Types

```typescript
interface NameVault {
  owner: PublicKey;
  snsName: PublicKey;
  totalSolReceived: bigint;
  depositCount: bigint;
  createdAt: bigint;
  lastDepositAt: bigint;
  bump: number;
  domainTransferred: boolean;
}

interface VaultBalance {
  sol: bigint;
  tokens: TokenBalance[];
}
```

### Policy Types

```typescript
interface PrivacyPolicy {
  vault: PublicKey;
  enabled: boolean;
  minSplits: number;
  maxSplits: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  distribution: Distribution;
  privacyMode: PrivacyMode;
  destinationMode: DestinationMode;
  destinations: PublicKey[];
  policyNonce: bigint;
}

enum Distribution {
  Uniform = 0,
  Weighted = 1,
  ExponentialDecay = 2,
}

enum PrivacyMode {
  FullPrivacy = 0,
  PartialPrivacy = 1,
  Direct = 2,
}

enum DestinationMode {
  Single = 0,
  Rotating = 1,
  Random = 2,
}
```

### Config Types

```typescript
interface PrivateVaultConfig {
  version: number;
  destinations: PublicKey[];
  minSplits: number;
  maxSplits: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  autoWithdrawEnabled: boolean;
  autoWithdrawThreshold: bigint;
  usePrivacyCash: boolean;
}
```

---

## Privacy Presets

```typescript
import { PRIVACY_PRESETS } from '@hydentity/sdk';

PRIVACY_PRESETS.low    // { minSplits: 1, maxSplits: 3, minDelay: 60, maxDelay: 600 }
PRIVACY_PRESETS.medium // { minSplits: 2, maxSplits: 5, minDelay: 300, maxDelay: 1800 }
PRIVACY_PRESETS.high   // { minSplits: 3, maxSplits: 5, minDelay: 7200, maxDelay: 28800 }
```

---

## Error Handling

```typescript
import { HydentityError } from '@hydentity/sdk';

try {
  await client.initializeVault('mydomain');
} catch (error) {
  if (error instanceof HydentityError) {
    console.log('Error code:', error.code);
    console.log('Message:', error.message);
  }
}
```

---

## Examples

### Complete Vault Setup

```typescript
import { HydentityClient, PRIVACY_PRESETS, createDefaultConfig } from '@hydentity/sdk';

// Initialize client
const client = HydentityClient.fromRpcUrl(rpcUrl);
client.setSigner(wallet);

// Create vault
await client.initializeVault('mydomain');

// Configure policy
await client.updatePolicy('mydomain', {
  ...PRIVACY_PRESETS.medium,
  destinations: [new PublicKey('destination1'), new PublicKey('destination2')],
});

// Store encrypted config via MPC
const config = createDefaultConfig(wallet.publicKey, [destinationPubkey]);
const arcium = new ArciumClient(connection, PROGRAM_ID);
await arcium.storePrivateConfig(vaultPubkey, config);
```
