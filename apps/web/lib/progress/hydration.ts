"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useProgress } from "./store";

let hydrationStarted = false;

/**
 * Progress lives in localStorage, which the server cannot read. Components
 * render a neutral placeholder until the client store has hydrated, which
 * avoids hydration mismatches.
 */
export function useProgressHydrated(): boolean {
  useEffect(() => {
    if (!hydrationStarted) {
      hydrationStarted = true;
      void useProgress.persist.rehydrate();
    }
  }, []);
  return useSyncExternalStore(
    (cb) => useProgress.persist.onFinishHydration(cb),
    () => useProgress.persist.hasHydrated(),
    () => false,
  );
}
