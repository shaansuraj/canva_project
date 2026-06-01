import type { UserRole } from "@/types/app";

export type AppNavItem = {
  id: string;
  href: string;
  label: string;
};

const roleNavItems: Record<UserRole, AppNavItem[]> = {
  admin: [
    { id: "users", href: "/admin/users", label: "Users" },
    { id: "meetings", href: "/admin/meetings", label: "Meetings" },
    { id: "reports", href: "/admin/reports", label: "Reports" },
    { id: "audit", href: "/admin/audit", label: "Audit" }
  ],
  presenter: [
    { id: "meetings", href: "/presenter/meetings", label: "Meetings" },
    { id: "new-meeting", href: "/presenter/meetings/new", label: "New" }
  ],
  participant: [{ id: "join", href: "/join", label: "Join" }]
};

function getMeetingIdFromPath(pathname: string) {
  return pathname.match(/^\/meetings\/([^/]+)/)?.[1] ?? null;
}

export function getMeetingContextNavItems(pathname: string, role: UserRole): AppNavItem[] {
  const meetingId = getMeetingIdFromPath(pathname);
  if (!meetingId) return [];

  const room = { id: "room", href: `/meetings/${meetingId}/room`, label: "Room" };
  const reports = { id: "meeting-reports", href: `/meetings/${meetingId}/reports`, label: "Reports" };
  const exports = { id: "exports", href: `/meetings/${meetingId}/exports`, label: "Exports" };

  if (role === "presenter") {
    return [{ id: "console", href: `/meetings/${meetingId}/console`, label: "Console" }, room, exports];
  }

  if (role === "admin") {
    return [room, reports, exports];
  }

  return [room, exports];
}

export function getAppNavItems(role: UserRole, pathname: string) {
  const seen = new Set<string>();

  return [...getMeetingContextNavItems(pathname, role), ...roleNavItems[role]].filter((item) => {
    const key = `${item.id}:${item.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isNavItemActive(pathname: string, item: AppNavItem) {
  if (pathname === item.href) return true;
  if (item.href === "/presenter/meetings") return pathname === item.href;
  if (item.href === "/join") return pathname === item.href;
  if (item.href.includes("/meetings/")) return pathname.startsWith(`${item.href}/`);
  return pathname.startsWith(`${item.href}/`);
}
