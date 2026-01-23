/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Use standalone output to include all files (not serverless)
  // This fixes the circuit file loading issue on Vercel
  output: 'standalone',

  experimental: {
    instrumentationHook: true,
    // Exclude packages with native/WASM dependencies from bundling
    serverComponentsExternalPackages: [
      'privacycash',
      '@lightprotocol/hasher.rs',
    ],
  },

  // Include circuit files in serverless function bundles
  // These are copied from node_modules during prebuild
  outputFileTracingIncludes: {
    '/api/privacy-cash/*': ['./circuit2/**/*'],
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
