import type { NextConfig } from 'next';

const config: NextConfig = {
  // The Docker image ships the full build + node_modules and runs `next start`.
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
