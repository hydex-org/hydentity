/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Exclude problematic packages from server-side bundling
  // These packages have Node.js-specific code or WASM that webpack can't handle
  experimental: {
    serverComponentsExternalPackages: [
      'privacycash',
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

