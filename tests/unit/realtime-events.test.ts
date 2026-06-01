import { describe, expect, it } from "vitest";

import { REALTIME_EVENTS } from "@/lib/meetings/realtime-events";

describe("realtime event contract", () => {
  it("includes presenter-led board viewport sync", () => {
    expect(REALTIME_EVENTS.boardViewportChanged).toBe("board.viewport.changed");
  });
});
