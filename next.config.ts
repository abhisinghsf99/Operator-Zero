import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // voyageai@0.2.1 ships a broken ESM build: dist/esm/extended/index.mjs uses
  // extensionless relative imports (../local, ./ExtendedClient) that Next's
  // bundler cannot resolve. It is server-only (embeddings run in route handlers
  // + Inngest, never client), so require it at runtime via its working CJS entry
  // instead of bundling the broken ESM.
  serverExternalPackages: ["voyageai"],
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project (required for source map upload)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps in CI (when SENTRY_AUTH_TOKEN is present)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress source map upload warning when token is not present (local dev)
  silent: !process.env.SENTRY_AUTH_TOKEN,

  // Disable Sentry's automatic performance instrumentation source maps
  // unless we're doing a CI production build
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors
  automaticVercelMonitors: true,
});
