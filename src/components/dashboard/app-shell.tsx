"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { LogOut, Menu, Wallet, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client";

type NavItem = { href: string; label: string; icon: LucideIcon };

/** Sidebar on desktop, slide-over plus bottom bar on mobile. */
export function AppShell({
  nav,
  mobileNav,
  user,
  variant = "user",
  unread = 0,
  children,
}: {
  nav: NavItem[];
  mobileNav?: NavItem[];
  user: { fullName: string; email: string; role: string };
  variant?: "user" | "admin";
  unread?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/dashboard" || href === "/admin" ? pathname === href : pathname.startsWith(href);

  async function signOut() {
    await api("/api/auth/logout", { method: "POST", json: {} });
    router.push("/login");
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border/70 px-5">
        <Link
          href={variant === "admin" ? "/admin" : "/dashboard"}
          className="flex items-center gap-2 font-display font-semibold tracking-tight"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            {variant === "admin" ? <ShieldCheck className="size-4" /> : <Wallet className="size-4" />}
          </span>
          TaskEarn
          {variant === "admin" ? <span className="text-xs font-medium text-muted-foreground">Admin</span> : null}
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Sections">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              isActive(item.href) &&
                "bg-primary/10 text-primary before:absolute before:inset-y-1.5 before:-left-3 before:w-0.5 before:rounded-full before:bg-primary hover:bg-primary/10 hover:text-primary",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{item.label}</span>
            {item.href.endsWith("/notifications") && unread > 0 ? (
              <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border/70 p-3">
        <div className="rounded-lg border border-border/60 bg-muted/60 px-3 py-2.5">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Button variant="ghost" className="mt-2 w-full justify-start" onClick={signOut}>
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r border-border/70 bg-card lg:sticky lg:top-0 lg:block lg:h-screen">
        {sidebar}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-[280px] bg-card shadow-lift">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-2 hover:bg-muted"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-lg border"
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </button>
          <span className="font-semibold">TaskEarn</span>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-8">{children}</main>

        {mobileNav ? (
          <nav
            className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-card lg:hidden"
            aria-label="Quick navigation"
          >
            {mobileNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground",
                  isActive(item.href) && "text-primary",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
