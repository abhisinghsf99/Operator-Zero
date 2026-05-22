import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Tag all server-side exceptions with context for TECH-SPEC §7.2
  // user_id, workflow_id, run_id are added at call sites via Sentry.setUser / setTag
  debug: false,
});
