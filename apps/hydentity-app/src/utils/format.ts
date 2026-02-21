import BN from 'bn.js';
import { D_BASE_SOL, D_BASE_USDC } from 'sdk/src/utils/const';
import { SYSTEM_PROGRAM_ID } from 'sdk/src/utils/spl';
import { PublicKey } from '@solana/web3.js';

/**
 * Convert k-units to lamports using the pool's dBase.
 */
export function kToLamports(k: BN | number, dBase: BN | number): number {
  const kBn = BN.isBN(k) ? k : new BN(k);
  const dBn = BN.isBN(dBase) ? dBase : new BN(dBase);
  return kBn.mul(dBn).toNumber();
}

/**
 * Format k-unit balance as a human-readable string with asset ticker.
 */
export function formatVaultBalance(
  balanceK: BN | number,
  dBase: BN | number,
  assetMint?: PublicKey,
  decimals?: number
): string {
  const lamports = kToLamports(balanceK, dBase);
  const dec = decimals ?? (assetMint && !assetMint.equals(SYSTEM_PROGRAM_ID) ? 6 : 9);
  const ticker = assetMint && !assetMint.equals(SYSTEM_PROGRAM_ID) ? 'USDC' : 'SOL';
  const value = lamports / Math.pow(10, dec);
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${ticker}`;
}

/**
 * Format lamports as SOL string.
 */
export function formatSol(lamports: BN | number): string {
  const n = BN.isBN(lamports) ? lamports.toNumber() : lamports;
  const sol = n / 1e9;
  return `${sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} SOL`;
}

/**
 * Withdrawal mode label.
 * 0 = Minimal, 1 = Recommended, 2 = High Privacy, 3 = Manual
 */
export function modeLabel(mode: number): string {
  switch (mode) {
    case 0: return 'Minimal';
    case 1: return 'Recommended';
    case 2: return 'High Privacy';
    case 3: return 'Manual';
    default: return `Mode ${mode}`;
  }
}

/**
 * Withdrawal mode description.
 */
export function modeDescription(mode: number): string {
  switch (mode) {
    case 0: return 'Fastest withdrawal processing with minimal residence time';
    case 1: return 'Balanced privacy and speed (recommended for most users)';
    case 2: return 'Maximum privacy with longer residence times';
    case 3: return 'Full manual control over withdrawal timing';
    default: return '';
  }
}

/**
 * Pool regime label.
 */
export function regimeLabel(regime: number): string {
  switch (regime) {
    case 0: return 'Bootstrap';
    case 1: return 'Low Volume';
    case 2: return 'Medium Volume';
    case 3: return 'High Volume';
    default: return `Regime ${regime}`;
  }
}

/**
 * Truncate a base58 address for display.
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * D_BASE constant for a given asset mint.
 */
export function getDBase(assetMint: PublicKey): number {
  if (assetMint.equals(SYSTEM_PROGRAM_ID)) return D_BASE_SOL;
  return D_BASE_USDC;
}
