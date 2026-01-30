import { Connection } from '@solana/web3.js';

/**
 * Poll-based transaction confirmation.
 *
 * The default `connection.confirmTransaction` opens a WebSocket subscription,
 * which fails on public RPCs (e.g. api.mainnet-beta.solana.com) that reject
 * browser WebSocket connections.  This helper polls `getSignatureStatuses`
 * instead.
 */
export async function pollForConfirmation(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  commitment: 'confirmed' | 'finalized' = 'confirmed',
): Promise<void> {
  const POLL_INTERVAL_MS = 2000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [statuses, blockHeight] = await Promise.all([
      connection.getSignatureStatuses([signature]),
      connection.getBlockHeight(),
    ]);

    const status = statuses.value[0];

    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }

    if (status?.confirmationStatus === commitment || status?.confirmationStatus === 'finalized') {
      return;
    }

    if (blockHeight > lastValidBlockHeight) {
      throw new Error('Transaction expired: block height exceeded');
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}
