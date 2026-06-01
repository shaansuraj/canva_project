import { describe, expect, it } from "vitest";

import { canManageUser } from "@/lib/admin/permissions";
import { canParticipantJoinMeeting } from "@/lib/meetings/permissions";

describe("phase 2 permissions", () => {
  it("allows active participants to join scheduled, live, or paused meetings", () => {
    expect(canParticipantJoinMeeting("scheduled", true)).toBe(true);
    expect(canParticipantJoinMeeting("live", true)).toBe(true);
    expect(canParticipantJoinMeeting("paused", true)).toBe(true);
  });

  it("blocks inactive users and closed meeting statuses", () => {
    expect(canParticipantJoinMeeting("live", false)).toBe(false);
    expect(canParticipantJoinMeeting("completed", true)).toBe(false);
    expect(canParticipantJoinMeeting("cancelled", true)).toBe(false);
  });

  it("limits admin user management targets to presenter and participant accounts", () => {
    expect(canManageUser("admin", "presenter")).toBe(true);
    expect(canManageUser("admin", "participant")).toBe(true);
    expect(canManageUser("admin", "admin")).toBe(false);
    expect(canManageUser("presenter", "participant")).toBe(false);
  });
});
