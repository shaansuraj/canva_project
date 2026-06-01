import { describe, expect, it } from "vitest";

import { canAccessSection, getRoleHomePath } from "@/lib/auth/guards";

const roles = ["admin", "presenter", "participant"] as const;

describe("role guards", () => {
  it("routes each role to its required home", () => {
    expect(getRoleHomePath("admin")).toBe("/admin/users");
    expect(getRoleHomePath("presenter")).toBe("/presenter/meetings");
    expect(getRoleHomePath("participant")).toBe("/join");
  });

  it("allows every role to access shared sections", () => {
    for (const role of roles) {
      expect(canAccessSection(role, "shared")).toBe(true);
    }
  });

  it("keeps admin, presenter, and participant sections isolated", () => {
    expect(canAccessSection("admin", "admin")).toBe(true);
    expect(canAccessSection("admin", "presenter")).toBe(false);
    expect(canAccessSection("presenter", "presenter")).toBe(true);
    expect(canAccessSection("presenter", "admin")).toBe(false);
    expect(canAccessSection("participant", "participant")).toBe(true);
    expect(canAccessSection("participant", "admin")).toBe(false);
  });
});
