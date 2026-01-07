import { kmac128, kmac256 } from '@noble/hashes/sha3-addons';
import {
  KMAC_DOMAIN_RANDOM_SEED,
  KMAC_DOMAIN_SPLIT_SEED,
  KMAC_DOMAIN_DELAY_SEED,
  DUST_THRESHOLD_LAMPORTS,
} from '../constants';
import type { Amount, U128 } from '../types/common';

/**
 * Convert bigint to bytes (little-endian)
 */
function bigintToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let temp = value;
  for (let i = 0; i < length; i++) {
    bytes[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return bytes;
}

/**
 * Convert bytes to bigint (little-endian)
 */
function bytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * Derive a deterministic random seed from master seed and nonce
 * Uses KMAC256 following Umbra SDK pattern
 * 
 * @param masterSeed - User's master seed (derived from wallet signature)
 * @param nonce - Deposit or operation nonce
 * @returns 32-byte derived seed
 */
export function deriveRandomSeed(masterSeed: Uint8Array, nonce: bigint): Uint8Array {
  const nonceBytes = bigintToBytes(nonce, 8);
  const input = new Uint8Array([...masterSeed, ...nonceBytes]);
  return kmac256(
    new TextEncoder().encode(KMAC_DOMAIN_RANDOM_SEED),
    input,
    { dkLen: 32 }
  );
}

/**
 * Generate a deterministic random value from seed and index
 * 
 * @param seed - Random seed
 * @param index - Index for this random value
 * @returns 128-bit random value
 */
export function generateDeterministicRandom(seed: Uint8Array, index: number): U128 {
  const indexBytes = bigintToBytes(BigInt(index), 4);
  const input = new Uint8Array([...seed, ...indexBytes]);
  const hash = kmac128(
    new TextEncoder().encode(KMAC_DOMAIN_RANDOM_SEED),
    input,
    { dkLen: 16 }
  );
  return bytesToBigint(hash) as U128;
}

/**
 * Generate deterministic split amounts
 * 
 * @param totalAmount - Total amount to split
 * @param seed - Random seed for determinism
 * @param minSplits - Minimum number of splits
 * @param maxSplits - Maximum number of splits
 * @param dustThreshold - Minimum amount per split (default: DUST_THRESHOLD_LAMPORTS)
 * @returns Array of split amounts
 */
export function generateSplitAmounts(
  totalAmount: Amount,
  seed: Uint8Array,
  minSplits: number,
  maxSplits: number,
  dustThreshold: Amount = DUST_THRESHOLD_LAMPORTS
): Amount[] {
  // Derive split-specific seed
  const splitSeed = kmac128(
    new TextEncoder().encode(KMAC_DOMAIN_SPLIT_SEED),
    seed,
    { dkLen: 32 }
  );

  // Determine number of splits
  const splitRange = maxSplits - minSplits + 1;
  const randomValue = generateDeterministicRandom(splitSeed, 0);
  const numSplits = minSplits + Number(randomValue % BigInt(splitRange));

  // Check if amount can be split without going below dust threshold
  const maxPossibleSplits = Number(totalAmount / dustThreshold);
  const actualSplits = Math.min(numSplits, maxPossibleSplits);

  if (actualSplits <= 1) {
    return [totalAmount];
  }

  // Generate split ratios
  const ratios: bigint[] = [];
  let totalRatio = 0n;

  for (let i = 0; i < actualSplits; i++) {
    const ratio = generateDeterministicRandom(splitSeed, i + 1);
    // Normalize to prevent overflow
    const normalizedRatio = (ratio % 1000n) + 1n;
    ratios.push(normalizedRatio);
    totalRatio += normalizedRatio;
  }

  // Calculate amounts based on ratios
  const amounts: Amount[] = [];
  let remaining = totalAmount;

  for (let i = 0; i < actualSplits - 1; i++) {
    // Calculate proportional amount
    let amount = (totalAmount * ratios[i]) / totalRatio;
    
    // Ensure above dust threshold
    if (amount < dustThreshold) {
      amount = dustThreshold;
    }
    
    // Ensure we don't exceed remaining
    if (amount > remaining - dustThreshold * BigInt(actualSplits - i - 1)) {
      amount = remaining - dustThreshold * BigInt(actualSplits - i - 1);
    }

    amounts.push(amount);
    remaining -= amount;
  }

  // Last split gets the remainder
  amounts.push(remaining);

  return amounts;
}

/**
 * Generate deterministic delays between splits
 * 
 * @param seed - Random seed for determinism
 * @param splitCount - Number of splits
 * @param minDelaySeconds - Minimum delay in seconds
 * @param maxDelaySeconds - Maximum delay in seconds
 * @returns Array of delays in milliseconds (length = splitCount - 1)
 */
export function generateDelays(
  seed: Uint8Array,
  splitCount: number,
  minDelaySeconds: number,
  maxDelaySeconds: number
): number[] {
  if (splitCount <= 1) {
    return [];
  }

  // Derive delay-specific seed
  const delaySeed = kmac128(
    new TextEncoder().encode(KMAC_DOMAIN_DELAY_SEED),
    seed,
    { dkLen: 32 }
  );

  const delays: number[] = [];
  const delayRange = maxDelaySeconds - minDelaySeconds;

  for (let i = 0; i < splitCount - 1; i++) {
    const randomValue = generateDeterministicRandom(delaySeed, i);
    const delaySeconds = minDelaySeconds + Number(randomValue % BigInt(delayRange + 1));
    delays.push(delaySeconds * 1000); // Convert to milliseconds
  }

  return delays;
}

/**
 * Generate a random 256-bit value
 * Uses crypto.getRandomValues for true randomness
 */
export function generateRandomU256(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBigint(bytes);
}

/**
 * Generate a random 128-bit blinding factor
 */
export function generateRandomBlindingFactor(): U128 {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBigint(bytes) as U128;
}

