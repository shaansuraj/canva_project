import Link from "next/link";
import { LogOut, ShieldCheck, UsersRound, CalendarDays, ClipboardList, FileBarChart, UserRoundPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Profile } from "@/types/app";

const navItems = {
  admin: [
    { href: "/admin/users", label: "Users", icon: UsersRound },
    { href: "/admin/meetings", label: "Meetings", icon: CalendarDays },
    { href: "/admin/reports", label: "Reports", icon: FileBarChart },
    { href: "/admin/audit", label: "Audit", icon: ClipboardList }
  ],
  presenter: [
    { href: "/presenter/meetings", label: "Meetings", icon: CalendarDays }
  ],
  participant: [{ href: "/join", label: "Join", icon: UserRoundPlus }]
};

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
  const items = navItems[profile.role];

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl gap-5 lg:py-4">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-72 shrink-0 rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-soft backdrop-blur lg:block">
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
              {items.map((item) => (
                <Button key={item.href} asChild className="w-full justify-start" variant="ghost">
                  <Link href={item.href}>
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                </Button>
              ))}
            </nav>

            <div className="mt-auto rounded-3xl border border-border/80 bg-white/70 p-4">
              <p className="font-semibold">{profile.full_name}</p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary">{profile.role}</Badge>
                {profile.designation ? <Badge variant="outline">{profile.designation}</Badge> : null}
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          <header className="mb-5 rounded-[2rem] border border-white/70 bg-white/65 p-5 shadow-soft backdrop-blur md:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge className="mb-3" variant="success">
                  {profile.role}
                </Badge>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
              </div>
              <form action="/auth/sign-out" className="hidden sm:block" method="post">
                <Button variant="outline" type="submit">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </Button>
              </form>
            </div>
          </header>

          {children}
        </main>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-white/90 px-3 pt-2 shadow-[0_-18px_48px_-30px_rgba(15,23,42,0.55)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md justify-around gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-14 flex-1 flex-col items-center justify-center rounded-2xl px-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <item.icon className="mb-1 h-5 w-5" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
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
