import { describe, expect, it } from "vitest";

import { canAnnotateInStage, getStageModeLabel } from "@/lib/meetings/meeting-stage";

describe("meeting stage helpers", () => {
  it("allows annotation only when the board owns the main stage", () => {
    expect(canAnnotateInStage(true, "board")).toBe(true);
    expect(canAnnotateInStage(true, "screen")).toBe(false);
    expect(canAnnotateInStage(false, "board")).toBe(false);
  });

  it("labels the active meeting stage", () => {
    expect(getStageModeLabel("board")).toBe("Annotation board");
    expect(getStageModeLabel("screen")).toBe("Live screen");
  });
});
