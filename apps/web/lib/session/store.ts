"use client";

/**
 * Who is using the app.
 *
 * - "guest":    no account. Demo mode: everything stays in this browser (as before v1).
 * - "authenticated": signed in; work is saved locally first and synced to the server.
 * - "expired":  this browser belongs to an account whose session ended. Local work is kept and
 *               syncs again after signing in.
 * - "offline":  an account is remembered but the server cannot be reached. Work continues locally.
 */
import { create } from "zustand";
import { ApiError, api } from "@/lib/api/client";
import { reloadProgressForCurrentAccount } from "@/lib/progress/store";
import { clearAccount, currentAccountHint, setStorageAccount } from "@/lib/storage";
import type { SessionOut, SessionUser } from "./types";

export type SessionStatus = "unknown" | "guest" | "authenticated" | "expired" | "offline";

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /** null until known: is there an API behind /api at all? */
  apiAvailable: boolean | null;
  demoMode: boolean;
  bootstrap: () => Promise<void>;
  login: (login: string, password: string) => Promise<SessionUser>;
  startDemo: (role: "student" | "teacher") => Promise<SessionUser>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<SessionUser>;
  setUser: (user: SessionUser) => void;
  logout: (opts?: { beforeLogout?: () => Promise<void> }) => Promise<void>;
  /** Called when the API answers 401 for the current session. */
  markExpired: () => void;
}

async function switchAccountStorage(userId: string | null) {
  setStorageAccount(userId);
  await reloadProgressForCurrentAccount();
}

let bootstrapping: Promise<void> | null = null;

export const useSession = create<SessionState>()((set, get) => {
  const signedIn = async (user: SessionUser) => {
    const previous = currentAccountHint();
    if (previous && previous !== user.id) clearAccount(previous); // shared computer: don't leave the last person's copy behind
    await switchAccountStorage(user.id);
    set({ status: "authenticated", user, apiAvailable: true });
    return user;
  };

  return {
    status: "unknown",
    user: null,
    apiAvailable: null,
    demoMode: false,

    bootstrap: () => {
      bootstrapping ??= (async () => {
        const hint = currentAccountHint();
        try {
          // Short timeout: without a reachable API the app must still start quickly (guest mode).
          const health = await api<{ status: string; demo_mode: boolean }>("/health", { signal: AbortSignal.timeout(4000) });
          set({ apiAvailable: true, demoMode: health.data.demo_mode });
        } catch {
          set({ apiAvailable: false, status: hint ? "offline" : "guest" });
          return;
        }
        try {
          const { data: user } = await api<SessionUser>("/auth/me");
          if (hint !== user.id) await signedIn(user);
          else set({ status: "authenticated", user });
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) set({ status: hint ? "expired" : "guest" });
          else set({ status: hint ? "offline" : "guest" });
        }
      })();
      return bootstrapping;
    },

    login: async (login, password) => {
      const { data } = await api<SessionOut>("/auth/login", { method: "POST", body: { login, password } });
      return signedIn(data.user);
    },

    startDemo: async (role) => {
      const { data } = await api<SessionOut>("/auth/demo", { method: "POST", body: { role } });
      return signedIn(data.user);
    },

    changePassword: async (currentPassword, newPassword) => {
      const { data } = await api<SessionOut>("/auth/password", { method: "POST", body: { current_password: currentPassword, new_password: newPassword } });
      set({ user: data.user });
      return data.user;
    },

    setUser: (user) => set({ user }),

    logout: async ({ beforeLogout } = {}) => {
      const user = get().user;
      try {
        await beforeLogout?.();
      } catch {
        /* sync is best effort; the server keeps what it has */
      }
      try {
        await api("/auth/logout", { method: "POST" });
      } catch {
        /* already signed out or offline */
      }
      if (user) clearAccount(user.id);
      await switchAccountStorage(null);
      set({ status: "guest", user: null });
    },

    markExpired: () => {
      if (get().status === "authenticated") set({ status: "expired" });
    },
  };
});
