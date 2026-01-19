/**
 * Hydentity Arcium Integration Tests (Devnet)
 *
 * Verifies the Arcium MPC setup is correctly configured.
 * Note: Full store_private_config test requires an SNS domain.
 *
 * Usage:
 *   export ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=...
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   npx ts-mocha -p ./tsconfig.json -t 300000 tests/arcium-devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getCompDefAccOffset,
  getArciumProgramId,
  getMXEPublicKey,
  getMXEAccAddress,
  getCompDefAccAddress,
  getClusterAccAddress,
  x25519,
  RescueCipher,
} from "@arcium-hq/client";
import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";

// Constants
const HYDENTITY_PROGRAM_ID = new PublicKey("7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx");
const ARCIUM_CLUSTER_OFFSET = 123; // Devnet cluster

describe("Hydentity Arcium Integration (Devnet)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  let owner: anchor.web3.Keypair;
  let mxePublicKey: Uint8Array;

  before(async () => {
    console.log("\n========================================");
    console.log("  Hydentity Arcium Verification Tests");
    console.log("========================================\n");

    owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    console.log("Program ID:", HYDENTITY_PROGRAM_ID.toBase58());
    console.log("Owner:", owner.publicKey.toBase58());

    const balance = await provider.connection.getBalance(owner.publicKey);
    console.log("Balance:", (balance / anchor.web3.LAMPORTS_PER_SOL).toFixed(4), "SOL\n");
  });

  describe("MXE Setup Verification", () => {
    it("should have MXE account initialized", async () => {
      const mxeAddress = getMXEAccAddress(HYDENTITY_PROGRAM_ID);
      console.log("MXE Account:", mxeAddress.toBase58());

      const accountInfo = await provider.connection.getAccountInfo(mxeAddress);
      expect(accountInfo).to.not.be.null;
      expect(accountInfo!.data.length).to.be.greaterThan(0);

      console.log("  Account size:", accountInfo!.data.length, "bytes");
      console.log("  Account owner:", accountInfo!.owner.toBase58());
      console.log("  PASS: MXE account exists\n");
    });

    it("should have MXE x25519 public key available", async () => {
      console.log("Fetching MXE public key...");

      mxePublicKey = await getMXEPublicKeyWithRetry(provider, HYDENTITY_PROGRAM_ID);

      expect(mxePublicKey).to.not.be.null;
      expect(mxePublicKey.length).to.equal(32);

      console.log("  MXE x25519 pubkey:", Buffer.from(mxePublicKey).toString('hex'));
      console.log("  PASS: MXE keys are ready\n");
    });
  });

  describe("Computation Definition Verification", () => {
    it("should have store_private_config comp def registered", async () => {
      // Using offset 1 which was created by uploadCircuit SDK function
      const compDefOffset = 1;
      const compDefAddress = getCompDefAccAddress(HYDENTITY_PROGRAM_ID, compDefOffset);

      console.log("Comp Def Account:", compDefAddress.toBase58());
      console.log("  Offset:", compDefOffset);

      const accountInfo = await provider.connection.getAccountInfo(compDefAddress);
      expect(accountInfo).to.not.be.null;
      expect(accountInfo!.data.length).to.be.greaterThan(0);

      console.log("  Account size:", accountInfo!.data.length, "bytes");
      console.log("  PASS: Computation definition is registered\n");
    });
  });

  describe("Cluster Verification", () => {
    it("should be connected to active cluster", async () => {
      const clusterAddress = getClusterAccAddress(ARCIUM_CLUSTER_OFFSET);
      console.log("Cluster Account:", clusterAddress.toBase58());
      console.log("  Cluster offset:", ARCIUM_CLUSTER_OFFSET);

      const accountInfo = await provider.connection.getAccountInfo(clusterAddress);
      expect(accountInfo).to.not.be.null;
      expect(accountInfo!.data.length).to.be.greaterThan(0);

      console.log("  Account size:", accountInfo!.data.length, "bytes");
      console.log("  PASS: Cluster is accessible\n");
    });
  });

  describe("Encryption Verification", () => {
    it("should be able to create shared secret with MXE", async () => {
      // Generate client keypair
      const clientPrivateKey = x25519.utils.randomSecretKey();
      const clientPublicKey = x25519.getPublicKey(clientPrivateKey);

      console.log("Client x25519 pubkey:", Buffer.from(clientPublicKey).toString('hex').slice(0, 32) + "...");

      // Create shared secret
      const sharedSecret = x25519.getSharedSecret(clientPrivateKey, mxePublicKey);

      expect(sharedSecret).to.not.be.null;
      expect(sharedSecret.length).to.equal(32);

      console.log("  Shared secret:", Buffer.from(sharedSecret).toString('hex').slice(0, 32) + "...");

      // Create cipher
      const cipher = new RescueCipher(sharedSecret);

      console.log("  RescueCipher initialized successfully");
      console.log("  PASS: Encryption setup works\n");
    });
  });

  describe("Summary", () => {
    it("should print deployment summary", async () => {
      console.log("\n========================================");
      console.log("  Arcium Integration Status: READY");
      console.log("========================================\n");

      console.log("Program ID:", HYDENTITY_PROGRAM_ID.toBase58());
      console.log("MXE Account:", getMXEAccAddress(HYDENTITY_PROGRAM_ID).toBase58());
      console.log("MXE Public Key:", Buffer.from(mxePublicKey).toString('hex'));
      console.log("Cluster Offset:", ARCIUM_CLUSTER_OFFSET);
      console.log("");

      console.log("Next steps to test full flow:");
      console.log("  1. Register an SNS domain on devnet");
      console.log("  2. Initialize a vault with initialize_vault instruction");
      console.log("  3. Call store_private_config to test MPC computation");
      console.log("");
    });
  });
});

/**
 * Get MXE public key with retry
 */
async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 10,
  retryDelayMs: number = 1000
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw new Error(`Failed to fetch MXE public key: ${error.message}`);
      }
      console.log(`  Attempt ${attempt}/${maxRetries} - waiting...`);
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error("Failed to fetch MXE public key");
}

/**
 * Read keypair from JSON file
 */
function readKpJson(path: string): anchor.web3.Keypair {
  const expandedPath = path.replace("~", os.homedir());
  const file = fs.readFileSync(expandedPath);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString()))
  );
}
