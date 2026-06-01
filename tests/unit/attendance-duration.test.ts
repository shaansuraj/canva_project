import { describe, expect, it } from "vitest";

import { estimateAttendanceDurationSeconds, formatDuration } from "@/lib/attendance/duration";

describe("attendance duration", () => {
  it("uses snake_case attendance fields from database rows", () => {
    expect(
      estimateAttendanceDurationSeconds({
        joined_at: "2026-06-01T10:00:00.000Z",
        left_at: "2026-06-01T10:42:10.000Z"
      })
    ).toBe(2530);
  });

  it("falls back to last seen for active attendees", () => {
    expect(
      estimateAttendanceDurationSeconds({
        joinedAt: "2026-06-01T10:00:00.000Z",
        lastSeenAt: "2026-06-01T10:01:30.000Z"
      })
    ).toBe(90);
  });

  it("formats duration for reports", () => {
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(125)).toBe("2m 5s");
    expect(formatDuration(7261)).toBe("2h 1m");
  });
});
