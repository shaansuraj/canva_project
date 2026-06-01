import { describe, expect, it } from "vitest";

import { annotationToolSchema, isDrawableTool, linePayloadSchema, penPayloadSchema, serializePoints, shapePayloadSchema, textPayloadSchema } from "@/lib/validation/annotations";

describe("phase 3 annotation serialization", () => {
  it("rounds pointer coordinates for compact persisted payloads", () => {
    expect(
      serializePoints([
        { x: 10.1234, y: 20.9876 },
        { x: 42.005, y: 99.994 }
      ])
    ).toEqual([
      { x: 10.12, y: 20.99 },
      { x: 42.01, y: 99.99 }
    ]);
  });

  it("validates pen and highlighter payload shape", () => {
    expect(penPayloadSchema.safeParse({ points: [{ x: 1, y: 2 }], strokeWidth: 3, opacity: 0.7 }).success).toBe(true);
    expect(penPayloadSchema.safeParse({ points: [], strokeWidth: 3, opacity: 0.7 }).success).toBe(false);
    expect(penPayloadSchema.safeParse({ points: [{ x: 1, y: 2 }], strokeWidth: 0, opacity: 1.2 }).success).toBe(false);
  });

  it("validates text, shape, line, and arrow payloads", () => {
    expect(textPayloadSchema.safeParse({ x: 10, y: 20, text: "Decision", fontSize: 16 }).success).toBe(true);
    expect(shapePayloadSchema.safeParse({ x: 10, y: 20, width: 100, height: 80, rotation: 0 }).success).toBe(true);
    expect(linePayloadSchema.safeParse({ points: [10, 20, 200, 250], strokeWidth: 3 }).success).toBe(true);
    expect(linePayloadSchema.safeParse({ points: [10, 20, 200], strokeWidth: 3 }).success).toBe(false);
  });

  it("keeps eraser out of persisted drawable annotation tools", () => {
    const tools = annotationToolSchema.options;

    expect(tools).toContain("eraser");
    expect(isDrawableTool("pen")).toBe(true);
    expect(isDrawableTool("arrow")).toBe(true);
    expect(isDrawableTool("eraser")).toBe(false);
  });
});
