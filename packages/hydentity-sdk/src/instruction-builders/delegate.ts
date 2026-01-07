import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { HYDENTITY_PROGRAM_ID } from '../constants';
import { getNameVaultPda, getDelegateSessionPda } from '../utils/pda';

/**
 * Build instruction to add a delegate with time-bounded permissions
 * 
 * @param owner - The vault owner (signer)
 * @param snsNameAccount - The SNS name account public key
 * @param delegate - The delegate's public key
 * @param expiresAt - Unix timestamp when delegation expires
 * @param permissions - Permission flags bitmap
 * @returns TransactionInstruction
 */
export function buildAddDelegateInstruction(
  owner: PublicKey,
  snsNameAccount: PublicKey,
  delegate: PublicKey,
  expiresAt: number,
  permissions: number
): TransactionInstruction {
  const [vault] = getNameVaultPda(snsNameAccount);
  const [delegateSession] = getDelegateSessionPda(snsNameAccount, delegate);

  // Instruction discriminator for "add_delegate"
  const discriminator = Buffer.from([
    0x8c, 0x3e, 0x5a, 0x1f, 0xb2, 0x94, 0x76, 0x0d
  ]);

  // Encode expires_at as i64 little-endian
  const expiresAtBuffer = Buffer.alloc(8);
  expiresAtBuffer.writeBigInt64LE(BigInt(expiresAt));

  // Encode permissions as u8
  const permissionsBuffer = Buffer.from([permissions]);

  const data = Buffer.concat([discriminator, expiresAtBuffer, permissionsBuffer]);

  const keys = [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: snsNameAccount, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: false },
    { pubkey: delegate, isSigner: false, isWritable: false },
    { pubkey: delegateSession, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: HYDENTITY_PROGRAM_ID,
    data,
  });
}

/**
 * Build instruction to revoke a delegate
 * 
 * @param owner - The vault owner (signer)
 * @param snsNameAccount - The SNS name account public key
 * @param delegate - The delegate's public key
 * @returns TransactionInstruction
 */
export function buildRevokeDelegateInstruction(
  owner: PublicKey,
  snsNameAccount: PublicKey,
  delegate: PublicKey
): TransactionInstruction {
  const [vault] = getNameVaultPda(snsNameAccount);
  const [delegateSession] = getDelegateSessionPda(snsNameAccount, delegate);

  // Instruction discriminator for "revoke_delegate"
  const discriminator = Buffer.from([
    0xa9, 0x42, 0x8b, 0x5f, 0x3c, 0xe1, 0x90, 0x7d
  ]);

  const data = discriminator;

  const keys = [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: snsNameAccount, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: false },
    { pubkey: delegate, isSigner: false, isWritable: false },
    { pubkey: delegateSession, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({
    keys,
    programId: HYDENTITY_PROGRAM_ID,
    data,
  });
}

/**
 * Permission flags for delegates
 */
export const DelegatePermissions = {
  /** Can update privacy policy */
  UPDATE_POLICY: 1 << 0,
  /** Can deposit to Umbra */
  DEPOSIT_UMBRA: 1 << 1,
  /** All permissions */
  ALL: (1 << 0) | (1 << 1),
} as const;

/**
 * Helper to check if a permission flag includes a specific permission
 */
export function hasPermission(flags: number, permission: number): boolean {
  return (flags & permission) !== 0;
}

/**
 * Helper to create permission flags from an array of permissions
 */
export function createPermissionFlags(permissions: number[]): number {
  return permissions.reduce((flags, perm) => flags | perm, 0);
}

