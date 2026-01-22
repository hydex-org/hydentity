const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  experimental: {
    instrumentationHook: true,
    // Exclude packages with native/WASM dependencies from bundling
    serverComponentsExternalPackages: [
      '@lightprotocol/hasher.rs',
    ],
  },

  webpack: (config, { isServer }) => {
    // Handle node modules that don't work in browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };

    // On Vercel (server-side), replace node-localstorage with our in-memory mock
    // This prevents the privacycash SDK from trying to write to the read-only filesystem
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
    if (isServer && isVercel) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'node-localstorage': path.resolve(__dirname, 'src/lib/memory-localstorage.js'),
      };
      console.log('[next.config.js] Aliased node-localstorage to memory mock for Vercel');
    }

    // Enable WASM support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Handle .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    return config;
  },
};

module.exports = nextConfig;
