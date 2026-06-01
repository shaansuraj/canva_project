import { describe, expect, it } from "vitest";

import { DESKTOP_SCREEN_SHARE_MESSAGE, getScreenShareErrorMessage, getScreenShareSupport } from "@/lib/livekit/screen-share-support";

describe("screen share browser support", () => {
  it("allows secure browsers with getDisplayMedia", () => {
    expect(getScreenShareSupport({ hasMediaDevices: true, hasGetDisplayMedia: true, isSecureContext: true }).supported).toBe(true);
  });

  it("blocks browsers without getDisplayMedia before LiveKit throws", () => {
    const support = getScreenShareSupport({ hasMediaDevices: true, hasGetDisplayMedia: false, isSecureContext: true });

    expect(support.supported).toBe(false);
    expect(support.message).toBe(DESKTOP_SCREEN_SHARE_MESSAGE);
  });

  it("explains HTTPS requirements", () => {
    const support = getScreenShareSupport({ hasMediaDevices: true, hasGetDisplayMedia: true, isSecureContext: false });

    expect(support.supported).toBe(false);
    expect(support.message).toContain("HTTPS");
  });

  it("normalizes raw getDisplayMedia errors into a presenter-friendly message", () => {
    expect(getScreenShareErrorMessage(new Error("getDisplayMedia not supported"))).toBe(DESKTOP_SCREEN_SHARE_MESSAGE);
  });
});
