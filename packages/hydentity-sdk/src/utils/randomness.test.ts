import { describe, expect, it } from 'vitest';
import { derivePolicyMasterSeedFromSignature } from './randomness';

describe('derivePolicyMasterSeedFromSignature', () => {
  it('rejects wrong pubkey length', () => {
    expect(() =>
      derivePolicyMasterSeedFromSignature(new Uint8Array(31), new Uint8Array(64))
    ).toThrow('32 bytes');
  });

  it('rejects wrong signature length', () => {
    expect(() =>
      derivePolicyMasterSeedFromSignature(new Uint8Array(32), new Uint8Array(63))
    ).toThrow('64 bytes');
  });

  it('is deterministic for the same proof', () => {
    const pk = new Uint8Array(32).fill(7);
    const sig = new Uint8Array(64).fill(3);
    const a = derivePolicyMasterSeedFromSignature(pk, sig);
    const b = derivePolicyMasterSeedFromSignature(pk, sig);
    expect(a).toEqual(b);
    expect(a.length).toBe(32);
  });

  it('differs when signature bytes change', () => {
    const pk = new Uint8Array(32).fill(1);
    const sig1 = new Uint8Array(64).fill(2);
    const sig2 = new Uint8Array(64).fill(9);
    const s1 = derivePolicyMasterSeedFromSignature(pk, sig1);
    const s2 = derivePolicyMasterSeedFromSignature(pk, sig2);
    expect(Array.from(s1).join()).not.toBe(Array.from(s2).join());
  });
});
