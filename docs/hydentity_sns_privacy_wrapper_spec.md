
# Solana SNS (.sol) Privacy Wrapper — Technical Specification

## 1. Objectives and Non-Objectives

### Objectives
1. Frictionless receive: Anyone can send SOL/SPL to `user.sol` using standard wallet flows; sender never learns the user’s primary wallet.
2. Private claim path (default): Funds received into the wrapper can be routed through Umbra and withdrawn privately using ZK proofs.
3. Gas abstraction: Users can claim without holding SOL by using relayers.
4. Configurable privacy: Users define split ranges, delay ranges, and destination strategies.
5. Recoverability: Users retain the ability to reclaim funds even if off-chain services fail.

### Non-Objectives
- Absolute privacy against a global adversary. The goal is materially improved on-chain unlinkability.

---

## 2. System Architecture

### Components
- SNS Resolver → Wrapper Vault
- Privacy Wrapper Program (Anchor)
- Umbra Protocol (ZK + MPC)
- Client / dApp
- Relayer / Forwarder
- Indexer

### Trust Model
- Wrapper vault is program-controlled.
- Umbra provides unlinkability between deposit and withdrawal.
- ZK proofs and Merkle data are generated off-chain.

---

## 3. Core Data Model

### PDAs and Accounts

#### NameVault
- PDA: ["vault", sns_name_account_pubkey]
- Holds SOL and SPL tokens.

#### VaultAuthority
- PDA: ["vault_auth", sns_name_account_pubkey]
- Token authority.

#### PrivacyPolicy
- PDA: ["policy", sns_name_account_pubkey]
- Fields:
  - enabled
  - min_splits / max_splits
  - min_delay_seconds / max_delay_seconds
  - distribution
  - privacy_mode
  - destination_mode
  - destinations
  - policy_nonce

#### DelegateSession (optional)
- PDA: ["delegate", sns_name_account_pubkey, delegate_pubkey]
- Time-bounded execution permissions.

---

## 4. Umbra Integration

### Account Registration
- User registers a confidential Umbra account using ZK proofs.

### Deposits (Vault → Umbra)
- **Full amount** is deposited in a single transaction.
- No splits or delays on the deposit side to avoid creating observable patterns.
- Deposit appears identical to any other Umbra deposit.

### Claims (Umbra → Private Wallet)
- Withdrawals use relayers for gas abstraction.
- **Splits and delays are applied here** to obfuscate the final destination.
- This ensures unlinkability is established BEFORE any splitting occurs.

### Privacy Rationale
Applying splits/delays on the claim side (after Umbra) rather than the deposit side:
1. Prevents vault fingerprinting (no observable deposit pattern)
2. Breaks the link before splitting, so splits appear from anonymous mixer
3. Eliminates timing/amount correlation between vault and claims

---

## 5. End-to-End Flows

### Setup
1. Verify SNS ownership.
2. Set resolver to NameVault PDA.
3. Configure privacy policy.
4. Register Umbra account.

### Receive
- Sender sends to `user.sol` → funds land in NameVault.

### Private Claim
1. **Deposit**: Move full vault balance into Umbra (single transaction).
2. **Plan**: Generate split + delay plan for the claim side.
3. **Execute**: Private withdrawals via relayer with configured splits/delays.

```
┌─────────┐    full amount    ┌───────┐    split 1    ┌──────────────┐
│  Vault  │ ═════════════════►│ Umbra │ ─────────────►│              │
└─────────┘                   │ Mixer │    split 2    │   Private    │
                              │       │ ─────────────►│   Wallet     │
                              │       │    split 3    │              │
                              └───────┘ ─────────────►└──────────────┘
                                          (delays)
```

---

## 6. Privacy Policy Engine

The privacy policy controls how funds are **claimed from Umbra to the private wallet**.
It does NOT control the vault-to-Umbra deposit (which is always a single full-amount transfer).

### Randomness
- Deterministic randomness derived from user seed + claim nonce.

### Amount Splitting (Claim Side)
- Random partitioning of Umbra balance into multiple withdrawals.
- Respects dust thresholds to avoid micro-transactions.
- Each split appears as an independent, unlinked withdrawal.

### Delay Scheduling (Claim Side)
- Randomized delays between withdrawal splits.
- Spreads claims over configured time window.
- Makes timing correlation attacks more difficult.

---

## 7. Responsibilities

### On-Chain
- Vault custody
- Policy storage
- Authorization enforcement

### Off-Chain
- ZK proof generation
- Merkle proof retrieval
- Relayer submission

---

## 8. Transaction Modes
- Default: Relayer-based execution
- Fallbacks: Direct RPC, signed export

---

## 9. Failure & Recovery

- Relayer fallback
- Indexer fallback
- User self-execution
- Nullifier-based double-spend protection

---

## 10. Security Considerations

- Delegate revocation
- Policy versioning
- Key handling hygiene
- Destination reuse warnings

---

## 11. Implementation Roadmap

### Phase 1
- Wrapper vault + SNS integration
- Umbra private claims
- Relayer gas abstraction
- Split + delay policy engine

### Phase 2
- Arcium-based encrypted policy automation

---

## 12. Open Design Decisions

- Delegate execution vs user-only
- On-chain vs deterministic schedules
- Umbra-only enforcement mode
