import { describe, expect, it } from "vitest";

import { createUserSchema, resetPasswordSchema } from "@/lib/validation/admin";
import { createMeetingSchema, joinMeetingSchema } from "@/lib/validation/meetings";

const validPassword = "TempPass2026";

describe("phase 2 validation", () => {
  it("allows admins to create presenter or participant accounts only", () => {
    expect(
      createUserSchema.safeParse({
        email: "presenter@example.com",
        password: validPassword,
        fullName: "Presenter One",
        role: "presenter",
        designation: "Lead",
        color: "#0f4c5c"
      }).success
    ).toBe(true);

    expect(
      createUserSchema.safeParse({
        email: "admin2@example.com",
        password: validPassword,
        fullName: "Admin Two",
        role: "admin"
      }).success
    ).toBe(false);
  });

  it("validates reset password requests", () => {
    expect(resetPasswordSchema.safeParse({ userId: crypto.randomUUID(), password: validPassword, mustChangePassword: true }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ userId: "bad", password: "short" }).success).toBe(false);
  });

  it("validates meeting create and join inputs", () => {
    expect(createMeetingSchema.safeParse({ title: "Design Review", maxParticipants: 35 }).success).toBe(true);
    expect(createMeetingSchema.safeParse({ title: "No", maxParticipants: 35 }).success).toBe(false);
    expect(joinMeetingSchema.safeParse({ code: "ABCD12" }).success).toBe(true);
  });
});
