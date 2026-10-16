"use client";

import { Award, FlaskConical, FolderKanban, House, LogIn, LogOut, Route, School, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, Suspense, useEffect } from "react";
import { Logo } from "@/components/brand/logo";
import { SyncStatus } from "@/components/sync/sync-status";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session/store";
import { syncActive, useSync } from "@/lib/sync/store";
import { ThemeToggle } from "./theme-toggle";

const TEACHER_NAV = [
  { href: "/ogretmen", label: "Sınıflarım", short: "Sınıflar", icon: School },
  { href: "/yollar", label: "Öğrenme Yolları", short: "Yollar", icon: Route },
  { href: "/laboratuvarlar", label: "Laboratuvarlar", short: "Lab", icon: FlaskConical },
  { href: "/profil", label: "Profil", short: "Profil", icon: User },
];

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
  const status = useSession((s) => s.status);
  if (status !== "guest" && status !== "unknown") return null;
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

function AccountBox() {
  const router = useRouter();
  const { status, user, logout } = useSession();
  if (status === "unknown") return null;
  if (!user || status === "guest") {
    return (
      <Link href="/giris" className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border-strong text-sm font-semibold hover:bg-surface-2">
        <LogIn aria-hidden className="size-4" /> Giriş yap
      </Link>
    );
  }
  return (
    <div className="space-y-2 rounded-lg bg-surface-2 p-3 text-xs">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text" data-testid="account-name">
          {user.display_name}
        </div>
        <div className="truncate text-muted">{user.username ?? user.email}</div>
      </div>
      <SyncStatus />
      <button
        type="button"
        className="flex items-center gap-1.5 font-semibold text-muted hover:text-text"
        onClick={async () => {
          await logout({ beforeLogout: () => (syncActive() ? useSync.getState().syncNow() : Promise.resolve()) });
          router.push("/giris");
        }}
      >
        <LogOut aria-hidden className="size-3.5" /> Çıkış yap
      </button>
    </div>
  );
}

type NavItem = (typeof NAV)[number];

/** Side menu links. `pathname` is null while the URL is not known yet (static shell): nothing is highlighted. */
function SideLinks({ nav, pathname }: { nav: NavItem[]; pathname: string | null }) {
  return nav.map(({ href, label, icon: Icon }) => {
    const active = pathname !== null && isActive(pathname, href);
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
  });
}

function BottomLinks({ nav, pathname }: { nav: NavItem[]; pathname: string | null }) {
  return nav.map(({ href, short, icon: Icon }) => {
    const active = pathname !== null && isActive(pathname, href);
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
  });
}

// The URL is request data for dynamic routes (e.g. /ogretmen/[classroomId]); with Cache Components
// it must be read inside <Suspense>. The fallback renders the same links without highlighting.
function ActiveSideLinks({ nav }: { nav: NavItem[] }) {
  return <SideLinks nav={nav} pathname={usePathname()} />;
}

function ActiveBottomLinks({ nav }: { nav: NavItem[] }) {
  return <BottomLinks nav={nav} pathname={usePathname()} />;
}

/** One-time passwords must be replaced before anything else. */
function PasswordChangeRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSession((s) => s.user);
  useEffect(() => {
    if (user?.must_change_password && pathname !== "/sifre") router.replace("/sifre");
  }, [user, pathname, router]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useSession((s) => s.user);
  const nav: NavItem[] = user && user.role !== "student" ? TEACHER_NAV : NAV;

  return (
    <div className="min-h-dvh lg:pl-64">
      <Suspense>
        <PasswordChangeRedirect />
      </Suspense>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/" aria-label="AI Atölye ana sayfa">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Ana menü">
          <Suspense fallback={<SideLinks nav={nav} pathname={null} />}>
            <ActiveSideLinks nav={nav} />
          </Suspense>
        </nav>
        <div className="space-y-3 p-4">
          <AccountBox />
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
          <SyncStatus className="max-w-40 truncate" />
          {!user && (
            <Link href="/giris" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label="Giriş yap">
              <LogIn aria-hidden className="size-4" />
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>

      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden",
          nav.length === 6 ? "grid-cols-6" : "grid-cols-4",
        )}
        aria-label="Ana menü"
      >
        <Suspense fallback={<BottomLinks nav={nav} pathname={null} />}>
          <ActiveBottomLinks nav={nav} />
        </Suspense>
      </nav>
    </div>
  );
}
