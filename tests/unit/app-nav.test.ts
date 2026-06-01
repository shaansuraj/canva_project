import { describe, expect, it } from "vitest";

import { getAppNavItems, isNavItemActive } from "@/lib/navigation/app-nav";

describe("mobile app navigation", () => {
  it("adds meeting context tabs while preserving role navigation", () => {
    const items = getAppNavItems("presenter", "/meetings/meeting-123/console");

    expect(items.map((item) => item.label)).toEqual(["Console", "Room", "Exports", "Meetings", "New"]);
  });

  it("keeps participant navigation focused on join, room, and exports", () => {
    const items = getAppNavItems("participant", "/meetings/meeting-123/room");

    expect(items.map((item) => item.href)).toEqual(["/meetings/meeting-123/room", "/meetings/meeting-123/exports", "/join"]);
  });

  it("detects active routes without activating presenter meeting list on the new page", () => {
    expect(isNavItemActive("/presenter/meetings/new", { id: "meetings", href: "/presenter/meetings", label: "Meetings" })).toBe(false);
    expect(isNavItemActive("/presenter/meetings/new", { id: "new-meeting", href: "/presenter/meetings/new", label: "New" })).toBe(true);
  });
});
