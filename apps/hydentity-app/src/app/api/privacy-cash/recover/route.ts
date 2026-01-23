/**
 * Privacy Cash Recovery API
 *
 * POST /api/privacy-cash/recover
 * Body: { secretKey: number[], lamports: number, recipient: string }
 *
 * Transfers SOL from the derived Privacy Cash keypair to any address.
 * Used to recover funds if the Privacy Cash deposit fails.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { getServerRpcEndpoint } from '@/config/server-rpc';

// Get server-side RPC (uses HELIUS_* env vars, not exposed to client)
const RPC_URL = getServerRpcEndpoint('mainnet-beta');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secretKey, lamports, recipient } = body;

    if (!secretKey || !lamports || !recipient) {
      return NextResponse.json(
        { error: 'Missing secretKey, lamports, or recipient' },
        { status: 400 }
      );
    }

    // Convert secretKey array back to Uint8Array and create Keypair
    const secretKeyBytes = new Uint8Array(secretKey);
    const keypair = Keypair.fromSecretKey(secretKeyBytes);

    // Validate recipient address
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      return NextResponse.json(
        { error: 'Invalid recipient address' },
        { status: 400 }
      );
    }

    console.log('[API/privacy-cash/recover] Recovering', lamports / 1e9, 'SOL');
    console.log('[API/privacy-cash/recover] From:', keypair.publicKey.toBase58());
    console.log('[API/privacy-cash/recover] To:', recipient);

    // Create connection
    const connection = new Connection(RPC_URL, 'confirmed');

    // Check balance
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('[API/privacy-cash/recover] Current balance:', balance / 1e9, 'SOL');

    if (balance < lamports) {
      return NextResponse.json(
        { error: `Insufficient balance: ${balance / 1e9} SOL. Requested: ${lamports / 1e9} SOL` },
        { status: 400 }
      );
    }

    // Create transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipientPubkey,
        lamports,
      })
    );

    // Send and confirm
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);

    console.log('[API/privacy-cash/recover] Success, tx:', signature);

    return NextResponse.json({
      signature,
      amount: lamports,
      from: keypair.publicKey.toBase58(),
      to: recipient,
    });
  } catch (error) {
    console.error('[API/privacy-cash/recover] Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
