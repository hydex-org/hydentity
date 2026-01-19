/**
 * Initialize Arcium Computation Definitions on Devnet
 *
 * This script:
 * 1. Uploads the .arcis circuit file (initializes MXE account)
 * 2. Finalizes the computation definition
 *
 * Usage:
 *   export ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=...
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   npx ts-node scripts/init-arcium-devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getCompDefAccOffset,
  buildFinalizeCompDefTx,
  getMXEAccAddress,
  getMXEPublicKey,
  uploadCircuit,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Program ID for Hydentity
const HYDENTITY_PROGRAM_ID = new PublicKey("7uBSpWjqTfoSNc45JRFTAiJ6agfNDZPPM48Scy987LDx");

// Circuit files location
const BUILD_DIR = path.join(__dirname, "..", "build");

async function main() {
  console.log("\n========================================");
  console.log("  Hydentity Arcium Initialization");
  console.log("========================================\n");

  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

  console.log("Network:", provider.connection.rpcEndpoint);
  console.log("Program ID:", HYDENTITY_PROGRAM_ID.toBase58());
  console.log("Payer:", owner.publicKey.toBase58());

  // Check balance
  const balance = await provider.connection.getBalance(owner.publicKey);
  console.log("Balance:", (balance / anchor.web3.LAMPORTS_PER_SOL).toFixed(4), "SOL");

  if (balance < 0.5 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("\nWARNING: Low balance. Consider requesting an airdrop.");
  }

  // Check if program is deployed
  const programInfo = await provider.connection.getAccountInfo(HYDENTITY_PROGRAM_ID);
  if (!programInfo) {
    throw new Error(`Program not deployed at ${HYDENTITY_PROGRAM_ID.toBase58()}. Run 'anchor deploy' first.`);
  }
  console.log("Program deployed: Yes");

  // Get MXE account address
  const mxeAccount = getMXEAccAddress(HYDENTITY_PROGRAM_ID);
  console.log("MXE Account:", mxeAccount.toBase58());

  // Check if MXE already exists
  const mxeInfo = await provider.connection.getAccountInfo(mxeAccount);
  if (mxeInfo) {
    console.log("MXE Account: Already initialized\n");
  } else {
    console.log("MXE Account: Not yet initialized\n");
  }

  // Initialize computation definitions
  console.log("=== Uploading Circuits & Initializing Comp Defs ===\n");

  // 1. Upload store_private_config circuit
  const circuitName = "store_private_config";
  const circuitPath = path.join(BUILD_DIR, `${circuitName}.arcis`);

  if (!fs.existsSync(circuitPath)) {
    throw new Error(`Circuit file not found: ${circuitPath}\nRun 'arcium build' first.`);
  }

  console.log(`1. Uploading ${circuitName} circuit...`);
  console.log(`   File: ${circuitPath}`);

  try {
    const circuitData = fs.readFileSync(circuitPath);
    console.log(`   Size: ${(circuitData.length / 1024).toFixed(1)} KB`);

    // Upload circuit - this also initializes the MXE account if needed
    const uploadSigs = await uploadCircuit(
      provider,
      circuitName,
      HYDENTITY_PROGRAM_ID,
      new Uint8Array(circuitData),
      true, // logging
      900   // chunk size (default is 900 bytes per tx)
    );

    console.log(`   Upload complete. Transactions: ${uploadSigs.length}`);
    if (uploadSigs.length > 0) {
      console.log(`   Last tx: ${uploadSigs[uploadSigs.length - 1]}`);
    }

    // Finalize computation definition
    console.log(`   Finalizing comp def...`);
    const offset = getCompDefAccOffset(circuitName);
    const finalizeTx = await buildFinalizeCompDefTx(
      provider,
      Buffer.from(offset).readUInt32LE(),
      HYDENTITY_PROGRAM_ID
    );

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    finalizeTx.recentBlockhash = latestBlockhash.blockhash;
    finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
    finalizeTx.sign(owner);

    const finalizeSig = await provider.sendAndConfirm(finalizeTx, [], { skipPreflight: true });
    console.log(`   Finalize tx: ${finalizeSig}`);
    console.log("   SUCCESS\n");

  } catch (error: any) {
    if (error.message?.includes("already uploaded") ||
        error.message?.includes("already initialized") ||
        error.logs?.some((l: string) => l.includes("already"))) {
      console.log("   Already initialized (skipping)\n");
    } else {
      console.log("   ERROR:", error.message || error);
      if (error.logs) {
        console.log("   Logs:", error.logs.slice(-5));
      }
      throw error;
    }
  }

  // 2. Upload generate_withdrawal_plan circuit
  const circuitName2 = "generate_withdrawal_plan";
  const circuitPath2 = path.join(BUILD_DIR, `${circuitName2}.arcis`);

  if (fs.existsSync(circuitPath2)) {
    console.log(`2. Uploading ${circuitName2} circuit...`);
    console.log(`   File: ${circuitPath2}`);

    try {
      const circuitData2 = fs.readFileSync(circuitPath2);
      console.log(`   Size: ${(circuitData2.length / 1024).toFixed(1)} KB`);

      // Upload circuit with fixed offset 2
      const uploadSigs2 = await uploadCircuit(
        provider,
        circuitName2,
        HYDENTITY_PROGRAM_ID,
        new Uint8Array(circuitData2),
        true, // logging
        900   // chunk size
      );

      console.log(`   Upload complete. Transactions: ${uploadSigs2.length}`);
      if (uploadSigs2.length > 0) {
        console.log(`   Last tx: ${uploadSigs2[uploadSigs2.length - 1]}`);
      }

      // Finalize computation definition with fixed offset 2
      console.log(`   Finalizing comp def at offset 2...`);
      const finalizeTx2 = await buildFinalizeCompDefTx(
        provider,
        2, // Fixed offset 2 for generate_withdrawal_plan
        HYDENTITY_PROGRAM_ID
      );

      const latestBlockhash2 = await provider.connection.getLatestBlockhash();
      finalizeTx2.recentBlockhash = latestBlockhash2.blockhash;
      finalizeTx2.lastValidBlockHeight = latestBlockhash2.lastValidBlockHeight;
      finalizeTx2.sign(owner);

      const finalizeSig2 = await provider.sendAndConfirm(finalizeTx2, [], { skipPreflight: true });
      console.log(`   Finalize tx: ${finalizeSig2}`);
      console.log("   SUCCESS\n");

    } catch (error: any) {
      if (error.message?.includes("already uploaded") ||
          error.message?.includes("already initialized") ||
          error.logs?.some((l: string) => l.includes("already"))) {
        console.log("   Already initialized (skipping)\n");
      } else {
        console.log("   ERROR:", error.message || error);
        if (error.logs) {
          console.log("   Logs:", error.logs.slice(-5));
        }
        // Don't throw - allow other circuits to complete
        console.log("   Continuing...\n");
      }
    }
  } else {
    console.log(`2. ${circuitName2} circuit not found (skipping)\n`);
  }

  // Verify MXE public key is available
  console.log("=== Verifying MXE Setup ===\n");

  try {
    const mxePublicKey = await getMXEPublicKeyWithRetry(provider, HYDENTITY_PROGRAM_ID);
    console.log("MXE x25519 Public Key:", Buffer.from(mxePublicKey).toString('hex'));
    console.log("");
  } catch (error: any) {
    console.log("WARNING: Could not fetch MXE public key.");
    console.log("The MXE may not be fully initialized yet.");
    console.log("The Arcium cluster needs to set up the x25519 keys.");
    console.log("Error:", error.message);
    console.log("");
  }

  // Summary
  console.log("========================================");
  console.log("  Initialization Complete!");
  console.log("========================================\n");
  console.log("Program ID:", HYDENTITY_PROGRAM_ID.toBase58());
  console.log("MXE Account:", mxeAccount.toBase58());
  console.log("");
  console.log("Next steps:");
  console.log("  - Wait for Arcium cluster to set up MXE keys (may take a few minutes)");
  console.log("  - Run tests: npx ts-mocha -p ./tsconfig.json -t 300000 tests/arcium-devnet.ts");
  console.log("");
}

/**
 * Get MXE public key with retry logic
 */
async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 10,
  retryDelayMs: number = 2000
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`   Attempt ${attempt}/${maxRetries} - waiting for MXE keys...`);
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(`Failed to fetch MXE public key after ${maxRetries} attempts`);
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

// Run main
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nFATAL ERROR:", error);
    process.exit(1);
  });
