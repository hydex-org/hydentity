import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hydentity } from "../target/types/hydentity";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

describe("hydentity", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Hydentity as Program<Hydentity>;
  
  // Test keypairs
  const owner = Keypair.generate();
  const delegate = Keypair.generate();
  const snsNameAccount = Keypair.generate(); // Mock SNS name account
  
  // PDAs
  let vaultPda: PublicKey;
  let vaultBump: number;
  let vaultAuthorityPda: PublicKey;
  let vaultAuthorityBump: number;
  let policyPda: PublicKey;
  let policyBump: number;
  let delegateSessionPda: PublicKey;
  let delegateSessionBump: number;

  before(async () => {
    // Airdrop SOL to owner
    const airdropSig = await provider.connection.requestAirdrop(
      owner.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Derive PDAs
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), snsNameAccount.publicKey.toBuffer()],
      program.programId
    );

    [vaultAuthorityPda, vaultAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_auth"), snsNameAccount.publicKey.toBuffer()],
      program.programId
    );

    [policyPda, policyBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), snsNameAccount.publicKey.toBuffer()],
      program.programId
    );

    [delegateSessionPda, delegateSessionBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("delegate"),
        snsNameAccount.publicKey.toBuffer(),
        delegate.publicKey.toBuffer(),
      ],
      program.programId
    );
  });

  describe("initialize_vault", () => {
    it("should initialize a new vault", async () => {
      const tx = await program.methods
        .initializeVault()
        .accounts({
          owner: owner.publicKey,
          snsNameAccount: snsNameAccount.publicKey,
          vault: vaultPda,
          vaultAuthority: vaultAuthorityPda,
          policy: policyPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("Initialize vault tx:", tx);

      // Fetch and verify vault account
      const vaultAccount = await program.account.nameVault.fetch(vaultPda);
      expect(vaultAccount.owner.toString()).to.equal(owner.publicKey.toString());
      expect(vaultAccount.snsName.toString()).to.equal(snsNameAccount.publicKey.toString());
      expect(vaultAccount.totalSolReceived.toNumber()).to.equal(0);
      expect(vaultAccount.depositCount.toNumber()).to.equal(0);

      // Fetch and verify policy account
      const policyAccount = await program.account.privacyPolicy.fetch(policyPda);
      expect(policyAccount.enabled).to.be.true;
      expect(policyAccount.minSplits).to.equal(1);
      expect(policyAccount.maxSplits).to.equal(5);
      expect(policyAccount.destinations.length).to.equal(1);
      expect(policyAccount.destinations[0].toString()).to.equal(owner.publicKey.toString());
    });

    it("should fail if vault already initialized", async () => {
      try {
        await program.methods
          .initializeVault()
          .accounts({
            owner: owner.publicKey,
            snsNameAccount: snsNameAccount.publicKey,
            vault: vaultPda,
            vaultAuthority: vaultAuthorityPda,
            policy: policyPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Should have thrown an error");
      } catch (err) {
        // Expected to fail - account already initialized
        expect(err).to.exist;
      }
    });
  });

  describe("update_policy", () => {
    it("should update policy as owner", async () => {
      const tx = await program.methods
        .updatePolicy({
          enabled: true,
          minSplits: 2,
          maxSplits: 8,
          minDelaySeconds: 60,
          maxDelaySeconds: 7200,
          distribution: null,
          privacyMode: null,
          destinationMode: null,
          destinations: null,
        })
        .accounts({
          authority: owner.publicKey,
          snsNameAccount: snsNameAccount.publicKey,
          vault: vaultPda,
          policy: policyPda,
          delegateSession: null,
        })
        .signers([owner])
        .rpc();

      console.log("Update policy tx:", tx);

      // Verify updates
      const policyAccount = await program.account.privacyPolicy.fetch(policyPda);
      expect(policyAccount.minSplits).to.equal(2);
      expect(policyAccount.maxSplits).to.equal(8);
      expect(policyAccount.minDelaySeconds).to.equal(60);
      expect(policyAccount.maxDelaySeconds).to.equal(7200);
      expect(policyAccount.policyNonce.toNumber()).to.equal(1);
    });

    it("should fail with invalid split range", async () => {
      try {
        await program.methods
          .updatePolicy({
            enabled: null,
            minSplits: 10,
            maxSplits: 5, // Invalid: min > max
            minDelaySeconds: null,
            maxDelaySeconds: null,
            distribution: null,
            privacyMode: null,
            destinationMode: null,
            destinations: null,
          })
          .accounts({
            authority: owner.publicKey,
            snsNameAccount: snsNameAccount.publicKey,
            vault: vaultPda,
            policy: policyPda,
            delegateSession: null,
          })
          .signers([owner])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.error?.errorCode?.code).to.equal("InvalidSplitRange");
      }
    });
  });

  describe("add_delegate", () => {
    it("should add a delegate", async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
      const permissions = 0b00000011; // Both permissions

      const tx = await program.methods
        .addDelegate(new anchor.BN(expiresAt), permissions)
        .accounts({
          owner: owner.publicKey,
          snsNameAccount: snsNameAccount.publicKey,
          vault: vaultPda,
          delegate: delegate.publicKey,
          delegateSession: delegateSessionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("Add delegate tx:", tx);

      // Verify delegate session
      const delegateAccount = await program.account.delegateSession.fetch(delegateSessionPda);
      expect(delegateAccount.delegate.toString()).to.equal(delegate.publicKey.toString());
      expect(delegateAccount.permissions).to.equal(permissions);
      expect(delegateAccount.expiresAt.toNumber()).to.equal(expiresAt);
    });

    it("delegate should be able to update policy", async () => {
      // Airdrop SOL to delegate
      const airdropSig = await provider.connection.requestAirdrop(
        delegate.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      const tx = await program.methods
        .updatePolicy({
          enabled: null,
          minSplits: 3,
          maxSplits: null,
          minDelaySeconds: null,
          maxDelaySeconds: null,
          distribution: null,
          privacyMode: null,
          destinationMode: null,
          destinations: null,
        })
        .accounts({
          authority: delegate.publicKey,
          snsNameAccount: snsNameAccount.publicKey,
          vault: vaultPda,
          policy: policyPda,
          delegateSession: delegateSessionPda,
        })
        .signers([delegate])
        .rpc();

      console.log("Delegate update policy tx:", tx);

      const policyAccount = await program.account.privacyPolicy.fetch(policyPda);
      expect(policyAccount.minSplits).to.equal(3);
    });
  });

  describe("revoke_delegate", () => {
    it("should revoke a delegate", async () => {
      const tx = await program.methods
        .revokeDelegate()
        .accounts({
          owner: owner.publicKey,
          snsNameAccount: snsNameAccount.publicKey,
          vault: vaultPda,
          delegate: delegate.publicKey,
          delegateSession: delegateSessionPda,
        })
        .signers([owner])
        .rpc();

      console.log("Revoke delegate tx:", tx);

      // Verify delegate session is closed
      try {
        await program.account.delegateSession.fetch(delegateSessionPda);
        expect.fail("Account should be closed");
      } catch (err: any) {
        expect(err.message).to.include("Account does not exist");
      }
    });
  });

  describe("withdraw_direct", () => {
    it("should allow owner to withdraw directly", async () => {
      // First, fund the vault
      const fundAmount = LAMPORTS_PER_SOL;
      const fundTx = await provider.connection.requestAirdrop(vaultPda, fundAmount);
      await provider.connection.confirmTransaction(fundTx);

      const destination = Keypair.generate();
      const withdrawAmount = LAMPORTS_PER_SOL / 2;

      // Get initial balances
      const vaultBalanceBefore = await provider.connection.getBalance(vaultPda);

      const tx = await program.methods
        .withdrawDirect(new anchor.BN(withdrawAmount), null)
        .accounts({
          owner: owner.publicKey,
          snsNameAccount: snsNameAccount.publicKey,
          vault: vaultPda,
          vaultAuthority: vaultAuthorityPda,
          destination: destination.publicKey,
          vaultTokenAccount: null,
          destinationTokenAccount: null,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("Withdraw direct tx:", tx);

      // Verify withdrawal
      const vaultBalanceAfter = await provider.connection.getBalance(vaultPda);
      const destinationBalance = await provider.connection.getBalance(destination.publicKey);
      
      expect(vaultBalanceAfter).to.be.lessThan(vaultBalanceBefore);
      expect(destinationBalance).to.equal(withdrawAmount);
    });

    it("should fail if not owner", async () => {
      const destination = Keypair.generate();
      const attacker = Keypair.generate();
      
      // Airdrop to attacker
      const airdropSig = await provider.connection.requestAirdrop(
        attacker.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      try {
        await program.methods
          .withdrawDirect(new anchor.BN(1000), null)
          .accounts({
            owner: attacker.publicKey,
            snsNameAccount: snsNameAccount.publicKey,
            vault: vaultPda,
            vaultAuthority: vaultAuthorityPda,
            destination: destination.publicKey,
            vaultTokenAccount: null,
            destinationTokenAccount: null,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        // Expected - constraint violation
        expect(err).to.exist;
      }
    });
  });
});

