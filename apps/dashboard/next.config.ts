import type { NextConfig } from 'next';

const config: NextConfig = {
  // All-in-one Docker: a self-contained server bundle (traces workspace deps).
  output: 'standalone',
  // Workspace packages ship TS source; Next transpiles them.
  transpilePackages: ['@cortex/db', '@cortex/core', '@cortex/config'],
  // node-postgres is a server-only native-ish dep — keep it external, never bundled.
  serverExternalPackages: ['pg'],
  // Constraint §4: no third-party requests. Fonts are vendored locally; images are
  // not remotely optimized.
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default config;
