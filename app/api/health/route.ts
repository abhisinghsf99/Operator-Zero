import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const testError = searchParams.get("testError");

  if (testError === "1") {
    // Only honour testError in non-production environments.
    // In production, skip the Sentry capture and structured log to prevent
    // unauthenticated actors from exhausting Sentry quotas or flooding the log drain.
    if (process.env.NODE_ENV !== "production") {
      const error = new Error("phase-1 sentry smoke");

      // Capture to Sentry for INFRA-08 end-to-end verification
      Sentry.captureException(error);

      // Emit one structured JSON log line so the Axiom Vercel log drain captures it.
      // Future: replace console.log with an Axiom drain sink when the integration is set up.
      console.log(
        JSON.stringify({
          level: "info",
          event: "health.test_error",
          message: "phase-1 sentry smoke triggered",
          timestamp: new Date().toISOString(),
          env: process.env.NODE_ENV,
        })
      );
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
