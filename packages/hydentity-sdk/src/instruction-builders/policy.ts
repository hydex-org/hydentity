import {
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import { HYDENTITY_PROGRAM_ID } from '../constants';
import { getNameVaultPda, getPrivacyPolicyPda, getDelegateSessionPda } from '../utils/pda';
import {
  UpdatePolicyParams,
  Distribution,
  PrivacyMode,
  DestinationMode,
  distributionToAnchor,
  privacyModeToAnchor,
  destinationModeToAnchor,
} from '../types/policy';

/**
 * Serialize update policy params to buffer
 */
function serializeUpdatePolicyParams(params: UpdatePolicyParams): Buffer {
  const parts: Buffer[] = [];

  // enabled: Option<bool>
  if (params.enabled !== undefined && params.enabled !== null) {
    parts.push(Buffer.from([1, params.enabled ? 1 : 0]));
  } else {
    parts.push(Buffer.from([0]));
  }

  // minSplits: Option<u8>
  if (params.minSplits !== undefined && params.minSplits !== null) {
    parts.push(Buffer.from([1, params.minSplits]));
  } else {
    parts.push(Buffer.from([0]));
  }

  // maxSplits: Option<u8>
  if (params.maxSplits !== undefined && params.maxSplits !== null) {
    parts.push(Buffer.from([1, params.maxSplits]));
  } else {
    parts.push(Buffer.from([0]));
  }

  // minDelaySeconds: Option<u32>
  if (params.minDelaySeconds !== undefined && params.minDelaySeconds !== null) {
    const buf = Buffer.alloc(5);
    buf[0] = 1;
    buf.writeUInt32LE(params.minDelaySeconds, 1);
    parts.push(buf);
  } else {
    parts.push(Buffer.from([0]));
  }

  // maxDelaySeconds: Option<u32>
  if (params.maxDelaySeconds !== undefined && params.maxDelaySeconds !== null) {
    const buf = Buffer.alloc(5);
    buf[0] = 1;
    buf.writeUInt32LE(params.maxDelaySeconds, 1);
    parts.push(buf);
  } else {
    parts.push(Buffer.from([0]));
  }

  // distribution: Option<Distribution>
  if (params.distribution !== undefined && params.distribution !== null) {
    let enumValue = 0;
    switch (params.distribution) {
      case Distribution.Uniform: enumValue = 0; break;
      case Distribution.Weighted: enumValue = 1; break;
      case Distribution.ExponentialDecay: enumValue = 2; break;
    }
    parts.push(Buffer.from([1, enumValue]));
  } else {
    parts.push(Buffer.from([0]));
  }

  // privacyMode: Option<PrivacyMode>
  if (params.privacyMode !== undefined && params.privacyMode !== null) {
    let enumValue = 0;
    switch (params.privacyMode) {
      case PrivacyMode.FullPrivacy: enumValue = 0; break;
      case PrivacyMode.PartialPrivacy: enumValue = 1; break;
      case PrivacyMode.Direct: enumValue = 2; break;
    }
    parts.push(Buffer.from([1, enumValue]));
  } else {
    parts.push(Buffer.from([0]));
  }

  // destinationMode: Option<DestinationMode>
  if (params.destinationMode !== undefined && params.destinationMode !== null) {
    let enumValue = 0;
    switch (params.destinationMode) {
      case DestinationMode.Single: enumValue = 0; break;
      case DestinationMode.Rotating: enumValue = 1; break;
      case DestinationMode.Random: enumValue = 2; break;
    }
    parts.push(Buffer.from([1, enumValue]));
  } else {
    parts.push(Buffer.from([0]));
  }

  // destinations: Option<Vec<Pubkey>>
  if (params.destinations !== undefined && params.destinations !== null) {
    const lenBuf = Buffer.alloc(5);
    lenBuf[0] = 1; // Some
    lenBuf.writeUInt32LE(params.destinations.length, 1);
    parts.push(lenBuf);
    for (const dest of params.destinations) {
      parts.push(dest.toBuffer());
    }
  } else {
    parts.push(Buffer.from([0]));
  }

  return Buffer.concat(parts);
}

/**
 * Build instruction to update privacy policy
 * 
 * @param authority - The caller (owner or delegate)
 * @param snsNameAccount - The SNS name account public key
 * @param params - Policy update parameters
 * @param delegateSession - Optional delegate session PDA (if caller is delegate)
 * @returns TransactionInstruction
 */
export function buildUpdatePolicyInstruction(
  authority: PublicKey,
  snsNameAccount: PublicKey,
  params: UpdatePolicyParams,
  delegateSession?: PublicKey
): TransactionInstruction {
  const [vault] = getNameVaultPda(snsNameAccount);
  const [policy] = getPrivacyPolicyPda(snsNameAccount);

  // Instruction discriminator for "update_policy"
  const discriminator = Buffer.from([
    0xd8, 0x79, 0x87, 0x2a, 0xae, 0x1c, 0x8d, 0x0e
  ]);

  const paramsBuffer = serializeUpdatePolicyParams(params);
  const data = Buffer.concat([discriminator, paramsBuffer]);

  const keys = [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: snsNameAccount, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: false },
    { pubkey: policy, isSigner: false, isWritable: true },
  ];

  // Add optional delegate session
  if (delegateSession) {
    keys.push({ pubkey: delegateSession, isSigner: false, isWritable: false });
  }

  return new TransactionInstruction({
    keys,
    programId: HYDENTITY_PROGRAM_ID,
    data,
  });
}

/**
 * Helper to create update policy params with only specified fields
 */
export function createUpdatePolicyParams(
  updates: Partial<{
    enabled: boolean;
    minSplits: number;
    maxSplits: number;
    minDelaySeconds: number;
    maxDelaySeconds: number;
    distribution: Distribution;
    privacyMode: PrivacyMode;
    destinationMode: DestinationMode;
    destinations: PublicKey[];
  }>
): UpdatePolicyParams {
  return {
    enabled: updates.enabled ?? null,
    minSplits: updates.minSplits ?? null,
    maxSplits: updates.maxSplits ?? null,
    minDelaySeconds: updates.minDelaySeconds ?? null,
    maxDelaySeconds: updates.maxDelaySeconds ?? null,
    distribution: updates.distribution ?? null,
    privacyMode: updates.privacyMode ?? null,
    destinationMode: updates.destinationMode ?? null,
    destinations: updates.destinations ?? null,
  };
}

