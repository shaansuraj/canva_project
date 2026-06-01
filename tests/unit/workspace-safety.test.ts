import { describe, expect, it } from "vitest";

import { getMeetingLeaveDestination, hasSavableAnnotations } from "@/lib/meetings/workspace-safety";

describe("workspace safety helpers", () => {
  it("prompts only when a board has active annotations", () => {
    expect(hasSavableAnnotations([])).toBe(false);
    expect(hasSavableAnnotations([{ document_id: "doc-1", is_deleted: true }])).toBe(false);
    expect(hasSavableAnnotations([{ document_id: "doc-1", is_deleted: false }])).toBe(true);
  });

  it("can scope save prompts to the selected document", () => {
    const annotations = [
      { document_id: "doc-1", is_deleted: false },
      { document_id: "doc-2", is_deleted: true }
    ];

    expect(hasSavableAnnotations(annotations, "doc-1")).toBe(true);
    expect(hasSavableAnnotations(annotations, "doc-2")).toBe(false);
  });

  it("routes users to the correct post-leave destination", () => {
    expect(getMeetingLeaveDestination("participant")).toBe("/join");
    expect(getMeetingLeaveDestination("presenter")).toBe("/presenter/meetings");
    expect(getMeetingLeaveDestination("admin")).toBe("/dashboard");
  });
});
