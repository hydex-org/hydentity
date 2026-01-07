import { PublicKey } from '@solana/web3.js';

/**
 * Distribution strategy for splitting amounts
 */
export enum Distribution {
  /** Equal distribution across splits */
  Uniform = 'uniform',
  /** Weighted random distribution (more variance) */
  Weighted = 'weighted',
  /** Exponential decay (first splits are larger) */
  ExponentialDecay = 'exponentialDecay',
}

/**
 * Privacy mode for claims
 */
export enum PrivacyMode {
  /** Full privacy through Umbra mixer */
  FullPrivacy = 'fullPrivacy',
  /** Partial privacy (some splits may be direct) */
  PartialPrivacy = 'partialPrivacy',
  /** Direct transfer (no privacy, for debugging/testing) */
  Direct = 'direct',
}

/**
 * Destination selection mode
 */
export enum DestinationMode {
  /** Use a single destination address */
  Single = 'single',
  /** Rotate through destination addresses */
  Rotating = 'rotating',
  /** Random selection from destinations */
  Random = 'random',
}

/**
 * Privacy policy configuration
 */
export interface PrivacyPolicyConfig {
  /** Whether privacy routing is enabled */
  enabled?: boolean;
  /** Minimum number of splits per claim */
  minSplits?: number;
  /** Maximum number of splits per claim */
  maxSplits?: number;
  /** Minimum delay in seconds between split executions */
  minDelaySeconds?: number;
  /** Maximum delay in seconds between split executions */
  maxDelaySeconds?: number;
  /** Distribution strategy for amount splitting */
  distribution?: Distribution;
  /** Privacy mode for claims */
  privacyMode?: PrivacyMode;
  /** Destination selection mode */
  destinationMode?: DestinationMode;
  /** List of destination addresses for claims */
  destinations?: PublicKey[];
}

/**
 * Full privacy policy state (from on-chain account)
 */
export interface PrivacyPolicy extends Required<PrivacyPolicyConfig> {
  /** The vault this policy is associated with */
  vault: PublicKey;
  /** The SNS name account */
  snsName: PublicKey;
  /** Policy version nonce */
  policyNonce: bigint;
  /** Timestamp of last update */
  updatedAt: number;
}

/**
 * Delegate session information
 */
export interface DelegateSession {
  /** The vault this delegate is associated with */
  vault: PublicKey;
  /** The SNS name account */
  snsName: PublicKey;
  /** The delegate's public key */
  delegate: PublicKey;
  /** The vault owner who granted this delegation */
  grantedBy: PublicKey;
  /** Unix timestamp when this delegation expires */
  expiresAt: number;
  /** Permission flags */
  permissions: number;
  /** Timestamp when this delegation was created */
  createdAt: number;
}

/**
 * Parameters for updating policy
 */
export interface UpdatePolicyParams {
  enabled?: boolean | null;
  minSplits?: number | null;
  maxSplits?: number | null;
  minDelaySeconds?: number | null;
  maxDelaySeconds?: number | null;
  distribution?: Distribution | null;
  privacyMode?: PrivacyMode | null;
  destinationMode?: DestinationMode | null;
  destinations?: PublicKey[] | null;
}

/**
 * Convert SDK enum to on-chain representation
 */
export function distributionToAnchor(distribution: Distribution): object {
  switch (distribution) {
    case Distribution.Uniform:
      return { uniform: {} };
    case Distribution.Weighted:
      return { weighted: {} };
    case Distribution.ExponentialDecay:
      return { exponentialDecay: {} };
  }
}

/**
 * Convert SDK enum to on-chain representation
 */
export function privacyModeToAnchor(mode: PrivacyMode): object {
  switch (mode) {
    case PrivacyMode.FullPrivacy:
      return { fullPrivacy: {} };
    case PrivacyMode.PartialPrivacy:
      return { partialPrivacy: {} };
    case PrivacyMode.Direct:
      return { direct: {} };
  }
}

/**
 * Convert SDK enum to on-chain representation
 */
export function destinationModeToAnchor(mode: DestinationMode): object {
  switch (mode) {
    case DestinationMode.Single:
      return { single: {} };
    case DestinationMode.Rotating:
      return { rotating: {} };
    case DestinationMode.Random:
      return { random: {} };
  }
}

