/**
 * Abstract interface for fetching Merkle tree data
 * 
 * Required for ZK transactions that need Merkle proofs
 */
export abstract class IIndexer {
  /**
   * Get Merkle siblings for a given insertion index
   * @param index - The leaf index in the Merkle tree
   * @returns Array of sibling hashes (Poseidon hashes)
   */
  abstract getMerkleSiblings(index: bigint): Promise<Uint8Array[]>;

  /**
   * Get the current Merkle root
   * @returns The current root hash
   */
  abstract getMerkleRoot(): Promise<Uint8Array>;

  /**
   * Get the next available insertion index
   * @returns The next leaf index
   */
  abstract getNextInsertionIndex(): Promise<bigint>;
}

/**
 * Error class for indexer-related errors
 */
export class IndexerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IndexerError';
  }
}

