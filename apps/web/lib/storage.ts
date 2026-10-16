/**
 * Safe browser storage, separated per account.
 *
 * School computers are shared: data of a signed-in account lives under its own
 * prefix ("aiatolye:u:<id>:"), guest/demo data under "aiatolye:v1:". Signing
 * out removes the account's local copy (the server keeps it). Every access is
 * wrapped so the app keeps working when storage is unavailable.
 */
export const STORAGE_PREFIX = "aiatolye:v1:";
const ACCOUNT_HINT = "aiatolye:account";

export const accountPrefix = (userId: string) => `aiatolye:u:${userId}:`;

let prefix: string | null = null;

/** Current namespace. Starts from the last signed-in account (if any) so the first render uses the right data. */
export function storagePrefix(): string {
  if (prefix === null) {
    let hint: string | null = null;
    try {
      hint = window.localStorage.getItem(ACCOUNT_HINT);
    } catch {
      /* storage unavailable */
    }
    prefix = hint ? accountPrefix(hint) : STORAGE_PREFIX;
  }
  return prefix;
}

export function currentAccountHint(): string | null {
  try {
    return window.localStorage.getItem(ACCOUNT_HINT);
  } catch {
    return null;
  }
}

/** Switch to an account's namespace (or back to guest with null). */
export function setStorageAccount(userId: string | null) {
  prefix = userId ? accountPrefix(userId) : STORAGE_PREFIX;
  try {
    if (userId) window.localStorage.setItem(ACCOUNT_HINT, userId);
    else window.localStorage.removeItem(ACCOUNT_HINT);
  } catch {
    /* ignore */
  }
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(storagePrefix() + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(storagePrefix() + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string) {
  try {
    window.localStorage.removeItem(storagePrefix() + key);
  } catch {
    /* ignore */
  }
}

/** Keys (without prefix) in the current namespace that start with `start`. */
export function keysWith(start: string): string[] {
  const out: string[] = [];
  try {
    const p = storagePrefix() + start;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(p)) out.push(key.slice(storagePrefix().length));
    }
  } catch {
    /* ignore */
  }
  return out;
}

function removeWithPrefix(p: string) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(p)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Remove one account's local copy (on sign-out). */
export function clearAccount(userId: string) {
  removeWithPrefix(accountPrefix(userId));
}

/** Remove every AI Atölye key from this browser. */
export function clearAll() {
  removeWithPrefix("aiatolye:");
  prefix = STORAGE_PREFIX;
}

/** Zustand persist storage that follows the current namespace. */
export const namespacedStorage = {
  getItem: (name: string) => {
    try {
      return window.localStorage.getItem(storagePrefix() + name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      window.localStorage.setItem(storagePrefix() + name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (name: string) => {
    try {
      window.localStorage.removeItem(storagePrefix() + name);
    } catch {
      /* ignore */
    }
  },
};

export const notebookKey = (lessonId: string) => `notebook:${lessonId}`;
