"use client";
import { useEffect, useRef } from "react";

// Refresh queues and expiring private photo URLs while a portal is open.
// Background tabs pause polling; returning to a tab refreshes immediately.
export function useLiveRefresh(refresh: () => Promise<void>, enabled = true) {
  const callback = useRef(refresh);
  callback.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let running = false;
    let lastRefresh = 0;
    const run = () => {
      if (!active || running || document.visibilityState !== "visible" || Date.now() - lastRefresh < 5000) return;
      running = true;
      lastRefresh = Date.now();
      void callback.current().catch(() => {}).finally(() => { running = false; });
    };
    const timer = window.setInterval(run, 45000);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [enabled]);
}
