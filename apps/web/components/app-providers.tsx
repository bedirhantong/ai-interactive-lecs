"use client";

import { type ReactNode, useEffect } from "react";
import { useSession } from "@/lib/session/store";
import type { LessonIndex } from "@/lib/sync/engine";
import { setLessonIndex, syncActive, useSync } from "@/lib/sync/store";

/**
 * Starts the session check and keeps signed-in work in sync:
 * on sign-in (download + upload), every 30 s, when the connection returns and when the tab is hidden.
 */
export function AppProviders({ lessonIndex, children }: { lessonIndex: LessonIndex; children: ReactNode }) {
  setLessonIndex(lessonIndex);
  const status = useSession((s) => s.status);
  const mustChange = useSession((s) => s.user?.must_change_password ?? false);
  const userId = useSession((s) => s.user?.id ?? null);

  useEffect(() => {
    void useSession.getState().bootstrap();
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || mustChange) return;
    const sync = useSync.getState();
    sync.refresh();
    void sync.syncNow({ pull: true });
    const interval = setInterval(() => void useSync.getState().syncNow(), 30_000);
    const onOnline = () => void useSync.getState().syncNow({ pull: true });
    const onHidden = () => document.visibilityState === "hidden" && syncActive() && void useSync.getState().syncNow();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [status, mustChange, userId]);

  return children;
}
