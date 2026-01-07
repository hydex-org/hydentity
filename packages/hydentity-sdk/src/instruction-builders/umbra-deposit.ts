import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { HYDENTITY_PROGRAM_ID } from '../constants';
import { getNameVaultPda, getVaultAuthorityPda, getPrivacyPolicyPda, getDelegateSessionPda } from '../utils/pda';

// Token program ID
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * Build instruction to deposit SOL from vault into Umbra mixer pool
 * 
 * @param authority - The caller (owner or delegate)
 * @param snsNameAccount - The SNS name account public key
 * @param umbraProgram - The Umbra program ID
 * @param umbraPool - The Umbra mixer pool account
 * @param amount - Amount to deposit in lamports
 * @param delegateSession - Optional delegate session PDA (if caller is delegate)
 * @returns TransactionInstruction
 */
export function buildDepositToUmbraSolInstruction(
  authority: PublicKey,
  snsNameAccount: PublicKey,
  umbraProgram: PublicKey,
  umbraPool: PublicKey,
  amount: bigint,
  delegateSession?: PublicKey
): TransactionInstruction {
  const [vault] = getNameVaultPda(snsNameAccount);
  const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount);
  const [policy] = getPrivacyPolicyPda(snsNameAccount);

  // Instruction discriminator for "deposit_to_umbra"
  const discriminator = Buffer.from([
    0x4a, 0x89, 0x12, 0xf5, 0xc6, 0x3b, 0x7e, 0xa2
  ]);

  // Encode amount as u64 little-endian
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amount);

  // Encode mint as Option<Pubkey> (None = 0)
  const mintBuffer = Buffer.from([0]); // None for SOL

  const data = Buffer.concat([discriminator, amountBuffer, mintBuffer]);

  const keys = [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: snsNameAccount, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: policy, isSigner: false, isWritable: false },
  ];

  // Add optional delegate session
  if (delegateSession) {
    keys.push({ pubkey: delegateSession, isSigner: false, isWritable: false });
  } else {
    // Placeholder for optional account
    keys.push({ pubkey: HYDENTITY_PROGRAM_ID, isSigner: false, isWritable: false });
  }

  keys.push(
    { pubkey: umbraProgram, isSigner: false, isWritable: false },
    { pubkey: umbraPool, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  );

  return new TransactionInstruction({
    keys,
    programId: HYDENTITY_PROGRAM_ID,
    data,
  });
}

/**
 * Build instruction to deposit SPL tokens from vault into Umbra mixer pool
 * 
 * @param authority - The caller (owner or delegate)
 * @param snsNameAccount - The SNS name account public key
 * @param umbraProgram - The Umbra program ID
 * @param umbraPool - The Umbra mixer pool account
 * @param umbraPoolTokenAccount - The Umbra pool's token account
 * @param vaultTokenAccount - The vault's token account
 * @param mint - The token mint
 * @param amount - Amount to deposit
 * @param delegateSession - Optional delegate session PDA (if caller is delegate)
 * @returns TransactionInstruction
 */
export function buildDepositToUmbraSplInstruction(
  authority: PublicKey,
  snsNameAccount: PublicKey,
  umbraProgram: PublicKey,
  umbraPool: PublicKey,
  umbraPoolTokenAccount: PublicKey,
  vaultTokenAccount: PublicKey,
  mint: PublicKey,
  amount: bigint,
  delegateSession?: PublicKey
): TransactionInstruction {
  const [vault] = getNameVaultPda(snsNameAccount);
  const [vaultAuthority] = getVaultAuthorityPda(snsNameAccount);
  const [policy] = getPrivacyPolicyPda(snsNameAccount);

  // Instruction discriminator for "deposit_to_umbra"
  const discriminator = Buffer.from([
    0x4a, 0x89, 0x12, 0xf5, 0xc6, 0x3b, 0x7e, 0xa2
  ]);

  // Encode amount as u64 little-endian
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amount);

  // Encode mint as Option<Pubkey> (Some = 1 + pubkey)
  const mintBuffer = Buffer.concat([
    Buffer.from([1]), // Some
    mint.toBuffer(),
  ]);

  const data = Buffer.concat([discriminator, amountBuffer, mintBuffer]);

  const keys = [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: snsNameAccount, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: policy, isSigner: false, isWritable: false },
  ];

  // Add optional delegate session
  if (delegateSession) {
    keys.push({ pubkey: delegateSession, isSigner: false, isWritable: false });
  } else {
    // Placeholder for optional account
    keys.push({ pubkey: HYDENTITY_PROGRAM_ID, isSigner: false, isWritable: false });
  }

  keys.push(
    { pubkey: umbraProgram, isSigner: false, isWritable: false },
    { pubkey: umbraPool, isSigner: false, isWritable: true },
    { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
    { pubkey: umbraPoolTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  );

  return new TransactionInstruction({
    keys,
    programId: HYDENTITY_PROGRAM_ID,
    data,
  });
}

