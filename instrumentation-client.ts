import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,

  // Performance monitoring — capture 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay — 10% of sessions in production, 100% on errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Debug mode only in development
  debug: false,
});

// Required by @sentry/nextjs to instrument client-side router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
