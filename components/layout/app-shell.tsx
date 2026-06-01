"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  FileArchive,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorUp,
  PlusCircle,
  Radio,
  ShieldCheck,
  UserCircle2,
  UserRoundPlus,
  UsersRound,
  X
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAppNavItems, isNavItemActive, type AppNavItem } from "@/lib/navigation/app-nav";
import { cn } from "@/lib/utils/cn";
import type { Profile } from "@/types/app";

const navIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  audit: ClipboardList,
  console: MonitorUp,
  exports: FileArchive,
  join: UserRoundPlus,
  meetings: CalendarDays,
  "meeting-reports": FileBarChart,
  "new-meeting": PlusCircle,
  reports: FileBarChart,
  room: Radio,
  users: UsersRound
};

function NavIcon({ item, className }: { item: AppNavItem; className?: string }) {
  const Icon = navIcons[item.id] ?? LayoutDashboard;
  return <Icon className={className} aria-hidden="true" />;
}

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/auth/sign-out" method="post">
      <Button className={compact ? "w-full justify-start rounded-2xl" : undefined} variant="outline" type="submit">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </Button>
    </form>
  );
}

function BottomTab({
  item,
  pathname,
  onNavigate
}: {
  item: AppNavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isNavItemActive(pathname, item);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "relative flex min-h-[3.65rem] flex-1 flex-col items-center justify-center rounded-[1.35rem] px-2 text-[0.68rem] font-black transition",
        active ? "bg-white text-slate-950 shadow-[0_14px_34px_-24px_rgba(0,0,0,0.9)]" : "text-slate-200 hover:bg-white/10 hover:text-white"
      )}
    >
      <NavIcon item={item} className="mb-1 h-5 w-5" />
      <span className="max-w-full truncate">{item.label}</span>
      {active ? <span className="absolute -top-1 h-1.5 w-8 rounded-full bg-emerald-400" /> : null}
    </Link>
  );
}

function MoreSheet({
  items,
  pathname,
  profile,
  open,
  onClose
}: {
  items: AppNavItem[];
  pathname: string;
  profile: Profile;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button aria-label="Close navigation menu" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" onClick={onClose} type="button" />
      <div className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-[2rem] border border-white/70 bg-white/95 p-4 shadow-[0_-28px_90px_-35px_rgba(15,23,42,0.8)] backdrop-blur-xl">
        <div className="mx-auto max-w-md">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <UserCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-black">{profile.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
              </div>
            </div>
            <Button aria-label="Close menu" onClick={onClose} size="sm" type="button" variant="outline">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Badge variant="secondary">{profile.role}</Badge>
            {profile.designation ? <Badge variant="outline">{profile.designation}</Badge> : null}
          </div>

          <nav className="grid gap-2">
            {items.map((item) => {
              const active = isNavItemActive(pathname, item);
              return (
                <Link
                  key={`${item.id}-${item.href}`}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-black transition",
                    active ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-900 hover:bg-slate-200"
                  )}
                >
                  <NavIcon item={item} className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4">
            <SignOutButton compact />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  profile,
  title,
  description,
  children
}: {
  profile: Profile;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = useMemo(() => getAppNavItems(profile.role, pathname), [pathname, profile.role]);
  const primaryMobileItems = items.slice(0, 4);

  return (
    <div className="min-h-screen px-3 pb-28 pt-3 sm:px-5 lg:px-8 lg:py-4">
      <header className="sticky top-2 z-30 mb-4 rounded-[1.75rem] border border-white/70 bg-white/88 p-3 shadow-soft backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="success" className="px-2 py-0 text-[0.62rem]">
                {profile.role}
              </Badge>
              <p className="truncate text-xs font-bold text-muted-foreground">Hexmon Meeting OS</p>
            </div>
            <h1 className="truncate text-lg font-black tracking-tight">{title}</h1>
          </div>
          <Button aria-label="Open navigation menu" onClick={() => setMenuOpen(true)} size="sm" type="button" variant="outline" className="h-11 w-11 rounded-2xl p-0">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-5 lg:py-4">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-72 shrink-0 rounded-[2rem] border border-white/70 bg-white/88 p-4 shadow-soft backdrop-blur lg:block">
          <div className="flex h-full flex-col">
            <Link href="/dashboard" className="rounded-3xl bg-primary p-5 text-primary-foreground">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-black leading-tight">Hexmon</p>
                  <p className="text-xs opacity-75">Meeting OS</p>
                </div>
              </div>
            </Link>

            <nav className="mt-5 space-y-2">
              {items.map((item) => {
                const active = isNavItemActive(pathname, item);
                return (
                  <Button
                    key={`${item.id}-${item.href}`}
                    asChild
                    className={cn(
                      "w-full justify-start rounded-2xl font-black",
                      active ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-slate-800 hover:bg-secondary/80 hover:text-slate-950"
                    )}
                    variant={active ? "default" : "ghost"}
                  >
                    <Link href={item.href}>
                      <NavIcon item={item} className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </Button>
                );
              })}
            </nav>

            <div className="mt-auto rounded-3xl border border-border/80 bg-white/70 p-4">
              <p className="font-semibold">{profile.full_name}</p>
              <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{profile.role}</Badge>
                {profile.designation ? <Badge variant="outline">{profile.designation}</Badge> : null}
              </div>
              <div className="mt-4">
                <SignOutButton compact />
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="mb-5 hidden rounded-[2rem] border border-white/70 bg-white/65 p-5 shadow-soft backdrop-blur md:p-7 lg:block">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge className="mb-3" variant="success">
                  {profile.role}
                </Badge>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
              </div>
              <SignOutButton />
            </div>
          </header>

          <section className="mb-4 rounded-[1.5rem] border border-white/70 bg-white/62 p-4 shadow-soft backdrop-blur lg:hidden">
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </section>

          {children}
        </main>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/96 px-3 pt-2 text-white shadow-[0_-18px_58px_-28px_rgba(0,0,0,0.85)] backdrop-blur-2xl lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around gap-1">
          {primaryMobileItems.map((item) => (
            <BottomTab key={`${item.id}-${item.href}`} item={item} pathname={pathname} />
          ))}
          <button
            aria-label="Open more navigation options"
            onClick={() => setMenuOpen(true)}
            className="flex min-h-[3.65rem] flex-1 flex-col items-center justify-center rounded-[1.35rem] px-2 text-[0.68rem] font-black text-slate-200 transition hover:bg-white/10 hover:text-white"
            type="button"
          >
            <Menu className="mb-1 h-5 w-5" aria-hidden="true" />
            More
          </button>
        </div>
      </nav>

      <MoreSheet items={items} pathname={pathname} profile={profile} open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

export function PlaceholderPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-white/82 p-6 backdrop-blur md:p-8">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </Card>
  );
}
