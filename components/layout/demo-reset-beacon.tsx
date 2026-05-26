"use client";

/**
 * components/layout/demo-reset-beacon.tsx
 * Client component that fires a best-effort reset beacon when the demo tab
 * is closed or hidden.
 *
 * Uses navigator.sendBeacon (no-op if unavailable) to POST to /api/demo/reset
 * on pagehide and when visibilityState transitions to "hidden". Both events
 * cover different browser close/tab-switch patterns.
 *
 * Renders null — no visible output.
 */

import { useEffect } from "react";

export function DemoResetBeacon() {
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.sendBeacon !== "function"
    ) {
      return;
    }

    const fire = () => {
      navigator.sendBeacon("/api/demo/reset");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        fire();
      }
    };

    window.addEventListener("pagehide", fire);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", fire);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
