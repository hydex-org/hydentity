// Core client
export { HydentityClient } from './client/hydentity-client';
export type { HydentityClientConfig } from './client/hydentity-client';

// Policy engine
export { PolicyEngine } from './client/policy-engine';
export type { ExecutionPlan, SplitPlan, DelayPlan } from './client/policy-engine';

// Umbra bridge
export { UmbraBridge } from './client/umbra-bridge';
export type { DepositResult, WithdrawalResult } from './client/umbra-bridge';

// Arcium MPC integration (Private Withdrawals)
export { ArciumClient, createDefaultConfig, validateConfig } from './client/arcium-client';
export type {
  PrivateVaultConfig,
  EncryptedConfig,
  WithdrawalPlanSummary,
  BalanceInfo,
} from './client/arcium-client';
export {
  PrivateConfigManager,
  PRIVACY_PRESETS,
  formatDelay,
  parseDelay,
} from './client/private-config';
export type {
  PrivacyPreset,
  WithdrawalRequest,
  ConfigUpdate,
} from './client/private-config';

// Privacy Cash integration (optional)
export { PrivacyCashClient, createPrivacyCashClient } from './client/privacy-cash-client';

// Interfaces
export { ISigner } from './interfaces/signer';
export { ITransactionForwarder, TransactionForwarderError } from './interfaces/transaction-forwarder';
export { IIndexer } from './interfaces/indexer';

// Implementations
export { ConnectionForwarder } from './implementations/connection-forwarder';
export { RelayerForwarder } from './implementations/relayer-forwarder';

// Instruction builders
export * from './instruction-builders/vault';
export * from './instruction-builders/policy';
export * from './instruction-builders/delegate';
export * from './instruction-builders/umbra-deposit';

// Types
export * from './types/common';
export * from './types/policy';
export * from './types/solana';

// Utilities
export * from './utils/pda';
export * from './utils/randomness';
export * from './utils/sns';

// Constants (exported after utils to avoid duplicate SOL_TLD_AUTHORITY)
export * from './constants';

