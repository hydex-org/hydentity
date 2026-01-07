import { PublicKey } from '@solana/web3.js';
import {
  HYDENTITY_PROGRAM_ID,
  VAULT_SEED,
  VAULT_AUTH_SEED,
  POLICY_SEED,
  DELEGATE_SEED,
} from '../constants';
import type { ProgramDerivedAddress } from '../types/solana';

/**
 * Derive the NameVault PDA for an SNS name account
 * @param snsNameAccount - The SNS name account public key
 * @returns [PDA, bump]
 */
export function getNameVaultPda(
  snsNameAccount: PublicKey
): [ProgramDerivedAddress, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, snsNameAccount.toBuffer()],
    HYDENTITY_PROGRAM_ID
  );
  return [pda as ProgramDerivedAddress, bump];
}

/**
 * Derive the VaultAuthority PDA for an SNS name account
 * @param snsNameAccount - The SNS name account public key
 * @returns [PDA, bump]
 */
export function getVaultAuthorityPda(
  snsNameAccount: PublicKey
): [ProgramDerivedAddress, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [VAULT_AUTH_SEED, snsNameAccount.toBuffer()],
    HYDENTITY_PROGRAM_ID
  );
  return [pda as ProgramDerivedAddress, bump];
}

/**
 * Derive the PrivacyPolicy PDA for an SNS name account
 * @param snsNameAccount - The SNS name account public key
 * @returns [PDA, bump]
 */
export function getPrivacyPolicyPda(
  snsNameAccount: PublicKey
): [ProgramDerivedAddress, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [POLICY_SEED, snsNameAccount.toBuffer()],
    HYDENTITY_PROGRAM_ID
  );
  return [pda as ProgramDerivedAddress, bump];
}

/**
 * Derive the DelegateSession PDA for an SNS name account and delegate
 * @param snsNameAccount - The SNS name account public key
 * @param delegate - The delegate's public key
 * @returns [PDA, bump]
 */
export function getDelegateSessionPda(
  snsNameAccount: PublicKey,
  delegate: PublicKey
): [ProgramDerivedAddress, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [DELEGATE_SEED, snsNameAccount.toBuffer(), delegate.toBuffer()],
    HYDENTITY_PROGRAM_ID
  );
  return [pda as ProgramDerivedAddress, bump];
}

/**
 * Get all PDAs related to a vault
 * @param snsNameAccount - The SNS name account public key
 * @returns Object containing all relevant PDAs
 */
export function getAllVaultPdas(snsNameAccount: PublicKey): {
  vault: { pda: ProgramDerivedAddress; bump: number };
  vaultAuthority: { pda: ProgramDerivedAddress; bump: number };
  policy: { pda: ProgramDerivedAddress; bump: number };
} {
  const [vault, vaultBump] = getNameVaultPda(snsNameAccount);
  const [vaultAuthority, vaultAuthBump] = getVaultAuthorityPda(snsNameAccount);
  const [policy, policyBump] = getPrivacyPolicyPda(snsNameAccount);

  return {
    vault: { pda: vault, bump: vaultBump },
    vaultAuthority: { pda: vaultAuthority, bump: vaultAuthBump },
    policy: { pda: policy, bump: policyBump },
  };
}

