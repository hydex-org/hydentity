import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  external: [
    '@coral-xyz/anchor',
    '@solana/web3.js',
    '@solana/spl-token',
    '@noble/ed25519',
  ],
});

