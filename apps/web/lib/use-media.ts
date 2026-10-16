import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Effective colour theme: explicit data-theme wins, otherwise the OS preference. */
export function useIsDark(): boolean {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const explicit = useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.dataset.theme ?? null,
    () => null,
  );
  return explicit ? explicit === "dark" : prefersDark;
}
