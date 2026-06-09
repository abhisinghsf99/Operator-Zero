"use client";

/**
 * components/layout/sandbox-exit-beacon.tsx
 * Mounted only for anonymous sandbox visitors (see app/app/layout.tsx).
 *
 * Two responsibilities, both via navigator.sendBeacon (no-op if unavailable):
 *
 *   1. Teardown on leave — on `pagehide` for a real unload (event.persisted ===
 *      false, i.e. NOT going into the back/forward cache), POST /api/sandbox/exit
 *      so the visitor's throwaway data + identity are deleted. We deliberately do
 *      NOT listen to `visibilitychange`: switching tabs or backgrounding must not
 *      destroy an active sandbox — only actually leaving the page does.
 *
 *   2. Heartbeat — while the tab is open, POST /api/sandbox/heartbeat on an
 *      interval so the TTL-sweep cron treats this sandbox as alive. If the close
 *      beacon is ever missed, the absence of heartbeats lets the sweep reclaim it.
 *
 * Renders null.
 */

import { useEffect } from "react";

const HEARTBEAT_MS = 4 * 60 * 1000; // 4 min — comfortably under the sweep idle TTL

export function SandboxExitBeacon() {
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.sendBeacon !== "function"
    ) {
      return;
    }

    const beat = () => {
      // Only meaningful while visible; harmless otherwise.
      navigator.sendBeacon("/api/sandbox/heartbeat");
    };

    const handlePageHide = (e: PageTransitionEvent) => {
      // persisted === true → bfcache (page may be restored): do NOT tear down.
      if (!e.persisted) {
        navigator.sendBeacon("/api/sandbox/exit");
      }
    };

    // Fire one heartbeat on mount so last_seen is fresh immediately, then poll.
    beat();
    const interval = window.setInterval(beat, HEARTBEAT_MS);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  return null;
}
