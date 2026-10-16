/**
 * Safe browser storage. Storage can be unavailable (private mode, blocked
 * site data, quota): every access is wrapped so the app keeps working.
 */
export const STORAGE_PREFIX = "aiatolye:v1:";

export function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string) {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Remove every AI Atölye key from this browser. */
export function clearAll() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("aiatolye:")) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const notebookKey = (lessonId: string) => `notebook:${lessonId}`;
