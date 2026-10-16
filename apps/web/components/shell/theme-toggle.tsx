"use client";

import { Moon, Sun } from "lucide-react";
import { useIsDark } from "@/lib/use-media";

export function ThemeToggle({ className }: { className?: string }) {
  const dark = useIsDark();
  return (
    <button
      type="button"
      className={className ?? "inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"}
      aria-label={dark ? "Açık temaya geç" : "Koyu temaya geç"}
      title={dark ? "Açık tema" : "Koyu tema"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("aiatolye:theme", next);
        } catch {
          /* storage unavailable: theme applies for this visit only */
        }
      }}
    >
      {dark ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
    </button>
  );
}
