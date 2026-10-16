"use client";

/** App-wide sync state and the single SyncEngine instance (only active for signed-in accounts). */
import { create } from "zustand";
import { api } from "@/lib/api/client";
import type { SavedNotebook } from "@/lib/notebook/types";
import { useProgress } from "@/lib/progress/store";
import { useSession } from "@/lib/session/store";
import { currentAccountHint, keysWith, readJson, removeKey, writeJson } from "@/lib/storage";
import type { EvidenceEvent } from "@/lib/notebook/types";
import { type Conflict, type LessonIndex, SyncEngine, type SyncStatus, completionsFromNotebook } from "./engine";

let lessonIndex: LessonIndex = {};

export function setLessonIndex(index: LessonIndex) {
  lessonIndex = index;
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const syncEngine = new SyncEngine({
  api,
  read: readJson,
  write: writeJson,
  remove: removeKey,
  keys: keysWith,
  now: () => new Date().toISOString(),
  newId,
  onNotebookDownloaded: (lessonId, state: SavedNotebook) => {
    const entry = lessonIndex[lessonId];
    if (!entry) return;
    useProgress.getState().mergeNotebook({
      lessonId,
      lessonVersion: state.lessonVersion,
      requiredIds: entry.requiredIds,
      completions: completionsFromNotebook(state, entry),
    });
  },
  onUnauthorized: (err) => {
    if (err.status === 401) useSession.getState().markExpired();
  },
});

/** This browser is working for an account (signed in, or temporarily offline/expired): record changes for later upload. */
export function accountMode(): boolean {
  return currentAccountHint() !== null && useSession.getState().status !== "guest";
}

export function queueEvent(event: EvidenceEvent) {
  if (accountMode()) syncEngine.enqueueEvent(event);
}

export function queueReport(lessonId: string, report: unknown) {
  if (!accountMode()) return;
  syncEngine.enqueueReport(lessonId, JSON.stringify(report));
  void useSync.getState().syncNow();
}

export function syncActive(): boolean {
  const { status, user } = useSession.getState();
  return status === "authenticated" && !!user && !user.must_change_password;
}

interface SyncState {
  status: SyncStatus;
  conflicts: Record<string, Conflict>;
  pendingEvents: number;
  lastSyncedAt: string | null;
  syncNow: (opts?: { pull?: boolean }) => Promise<void>;
  /** Debounced upload of one notebook after a local autosave. */
  notebookChanged: (lessonId: string) => void;
  resolve: (lessonId: string, keep: "local" | "server") => Promise<void>;
  refresh: () => void;
}

const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
let running: Promise<void> | null = null;
/** A sync was requested while one was running: run once more afterwards, so no change waits for the next interval. */
let again: { pull: boolean } | null = null;

export const useSync = create<SyncState>()((set, get) => ({
  status: "idle",
  conflicts: {},
  pendingEvents: 0,
  lastSyncedAt: null,

  refresh: () => {
    const conflicts = syncEngine.conflicts();
    set({ conflicts, pendingEvents: syncEngine.pendingEvents(), ...(Object.keys(conflicts).length ? { status: "conflict" as const } : {}) });
  },

  syncNow: async ({ pull = false } = {}) => {
    if (!syncActive()) return;
    if (running) {
      again = { pull: pull || (again?.pull ?? false) };
      return running;
    }
    running = (async () => {
      set({ status: "syncing" });
      try {
        if (pull) await syncEngine.pullAll();
        await syncEngine.syncAll();
        const conflicts = syncEngine.conflicts();
        set({
          status: Object.keys(conflicts).length ? "conflict" : syncEngine.dirtyLessons().length || syncEngine.pendingEvents() ? "offline" : "synced",
          conflicts,
          pendingEvents: syncEngine.pendingEvents(),
          lastSyncedAt: new Date().toISOString(),
        });
      } catch {
        set({ status: "offline", pendingEvents: syncEngine.pendingEvents() });
      } finally {
        running = null;
      }
      if (again) {
        const next = again;
        again = null;
        await get().syncNow(next);
      }
    })();
    return running;
  },

  notebookChanged: (lessonId) => {
    if (!accountMode()) return;
    syncEngine.noteLocalChange(lessonId);
    if (!syncActive()) return;
    // Never show "saved to your account" while a change is still waiting to be uploaded.
    if (get().status !== "conflict") set({ status: "syncing" });
    clearTimeout(pushTimers.get(lessonId));
    pushTimers.set(
      lessonId,
      setTimeout(() => {
        pushTimers.delete(lessonId);
        void get().syncNow();
      }, 2000),
    );
  },

  resolve: async (lessonId, keep) => {
    await syncEngine.resolveConflict(lessonId, keep);
    get().refresh();
    if (!Object.keys(syncEngine.conflicts()).length) set({ status: "synced" });
  },
}));
