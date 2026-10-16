"use client";

import { Award, FlaskConical, FolderKanban, House, Route, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/ana-sayfa", label: "Ana Sayfa", short: "Ana Sayfa", icon: House },
  { href: "/yollar", label: "Öğrenme Yolları", short: "Yollar", icon: Route },
  { href: "/laboratuvarlar", label: "Laboratuvarlar", short: "Lab", icon: FlaskConical },
  { href: "/projelerim", label: "Projelerim", short: "Projeler", icon: FolderKanban },
  { href: "/basarilarim", label: "Başarılarım", short: "Başarılar", icon: Award },
  { href: "/profil", label: "Profil", short: "Profil", icon: User },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/") || (href === "/yollar" && pathname.startsWith("/projeler/"));
}

export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn("flex items-start gap-2 rounded-lg bg-surface-2 text-muted", compact ? "px-2 py-1 text-[11px]" : "p-3 text-xs")}
      title="Demo modunda hesap yok. İlerlemen yalnızca bu tarayıcıda saklanır."
    >
      <ShieldCheck aria-hidden className={cn("shrink-0 text-brand", compact ? "size-3.5" : "mt-0.5 size-4")} />
      <span>
        <strong className="text-text">Demo modu.</strong>
        {compact ? " Kayıt yok." : " Hesap gerekmez. İlerlemen yalnızca bu tarayıcıda saklanır, hiçbir sunucuya gönderilmez."}
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/" aria-label="AI Atölye ana sayfa">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Ana menü">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors",
                  active ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                <Icon aria-hidden className="size-[18px]" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 p-4">
          <DemoNotice />
          <div className="flex items-center justify-between text-xs text-muted">
            <Link href="/gizlilik" className="hover:text-text">
              Gizlilik
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" aria-label="AI Atölye ana sayfa">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <DemoNotice compact />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Ana menü"
      >
        {NAV.map(({ href, short, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold", active ? "text-brand" : "text-muted")}
            >
              <Icon aria-hidden className="size-5" />
              {short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
