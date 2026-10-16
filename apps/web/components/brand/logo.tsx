import { cn } from "@/lib/cn";

/** AI Atölye mark: three connected nodes (a tiny network) on a workbench bracket. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--brand)" />
      <path d="M9 22 L16 9 L23 22" fill="none" stroke="var(--brand-contrast)" strokeWidth="2" strokeLinecap="round" />
      <path d="M11.5 17.5 H20.5" stroke="var(--brand-contrast)" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
      <circle cx="16" cy="9" r="2.6" fill="var(--accent)" stroke="var(--brand-contrast)" strokeWidth="1.4" />
      <circle cx="9" cy="22" r="2.6" fill="var(--brand-contrast)" />
      <circle cx="23" cy="22" r="2.6" fill="var(--brand-contrast)" />
      <path d="M6 26.5 H26" stroke="var(--brand-contrast)" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[17px] font-extrabold tracking-tight text-text">
        AI <span className="text-brand">Atölye</span>
      </span>
    </span>
  );
}
