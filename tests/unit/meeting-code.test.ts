import { describe, expect, it } from "vitest";

import { createUniqueMeetingCode, generateMeetingCode, normalizeMeetingCode } from "@/lib/meetings/code";

describe("meeting code generation", () => {
  it("generates uppercase human-friendly codes", () => {
    const code = generateMeetingCode(6, () => 0.1);

    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z2-9]+$/);
    expect(code).not.toMatch(/[IO01]/);
  });

  it("normalizes user-entered meeting codes", () => {
    expect(normalizeMeetingCode(" ab-c 123 ")).toBe("ABC123");
  });

  it("rejects unsafe code lengths", () => {
    expect(() => generateMeetingCode(3)).toThrow(/between 4 and 12/);
    expect(() => generateMeetingCode(13)).toThrow(/between 4 and 12/);
  });

  it("retries until a unique meeting code is found", async () => {
    const seen = new Set<string>();
    let calls = 0;

    const code = await createUniqueMeetingCode({
      length: 4,
      exists: async (candidate) => {
        calls += 1;
        if (calls === 1) {
          seen.add(candidate);
          return true;
        }

        return seen.has(candidate);
      }
    });

    expect(code).toMatch(/^[A-Z2-9]{4}$/);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
