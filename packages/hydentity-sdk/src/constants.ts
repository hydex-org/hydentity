import { PublicKey } from '@solana/web3.js';

/**
 * Hydentity program ID - Deployed on devnet
 */
export const HYDENTITY_PROGRAM_ID = new PublicKey('46mwRQo4f6sLy9cigZdVJgdEpeEVc6jLRG1H241Uk9GY');

/**
 * PDA seed prefixes
 */
export const VAULT_SEED = Buffer.from('vault');
export const VAULT_AUTH_SEED = Buffer.from('vault_auth');
export const POLICY_SEED = Buffer.from('policy');
export const DELEGATE_SEED = Buffer.from('delegate');

/**
 * Default policy values (Medium privacy preset)
 * Low:    1-3 splits, 1-10 mins
 * Medium: 2-5 splits, 5-30 mins
 * High:   3-6 splits, 2-8 hours
 */
export const DEFAULT_MIN_SPLITS = 2;
export const DEFAULT_MAX_SPLITS = 5;
export const DEFAULT_MIN_DELAY_SECONDS = 300;  // 5 minutes
export const DEFAULT_MAX_DELAY_SECONDS = 1800; // 30 minutes

/**
 * Delegate permission flags
 */
export const PERMISSION_UPDATE_POLICY = 1 << 0;
export const PERMISSION_DEPOSIT_UMBRA = 1 << 1;
export const PERMISSION_ALL = PERMISSION_UPDATE_POLICY | PERMISSION_DEPOSIT_UMBRA;

/**
 * Minimum dust threshold in lamports
 */
export const DUST_THRESHOLD_LAMPORTS = 10_000n; // 0.00001 SOL

/**
 * KMAC domain separators (matching Umbra SDK pattern)
 */
export const KMAC_DOMAIN_RANDOM_SEED = 'Hydentity - Random Seed';
export const KMAC_DOMAIN_SPLIT_SEED = 'Hydentity - Split Seed';
export const KMAC_DOMAIN_DELAY_SEED = 'Hydentity - Delay Seed';

/**
 * SNS TLD key for .sol domains
 */
export const SOL_TLD_AUTHORITY = new PublicKey('58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx');

/**
 * Relayer service configuration
 */
export const RELAYER_BASE_URL = 'https://relayer.umbraprivacy.com/';
export const DEFAULT_RELAYER_TIMEOUT_MS = 30_000;

/**
 * Maximum destinations in privacy policy
 */
export const MAX_DESTINATIONS = 10;

