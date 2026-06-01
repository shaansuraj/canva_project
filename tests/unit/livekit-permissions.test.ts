import { describe, expect, it } from "vitest";

import { canConnectToScreenShare, canUsePresenterConsoleControls, createLiveKitVideoGrant, createScreenShareRoomName } from "@/lib/livekit/permissions";
import type { Meeting, Profile } from "@/types/app";

const presenterId = crypto.randomUUID();
const meeting: Meeting = {
  id: crypto.randomUUID(),
  code: "ABCD12",
  title: "Design Review",
  description: null,
  status: "live",
  presenter_id: presenterId,
  scheduled_start_at: null,
  started_at: new Date().toISOString(),
  ended_at: null,
  participant_annotation_enabled: true,
  document_locked: false,
  selected_document_id: null,
  selected_page_id: null,
  downloads_enabled: false,
  max_participants: 35,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

function profile(role: Profile["role"], id = crypto.randomUUID()): Profile {
  return {
    id,
    email: `${role}@example.com`,
    full_name: `${role} user`,
    designation: "Reviewer",
    role,
    is_active: true,
    color: "#0f4c5c",
    must_change_password: false,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

describe("phase 4 LiveKit permissions", () => {
  it("creates presenter grants that can publish only screen share video and shared screen audio", () => {
    const grant = createLiveKitVideoGrant({ roomName: "meeting-123", isPresenterOwner: true });

    expect(grant).toMatchObject({
      roomJoin: true,
      room: "meeting-123",
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ["screen_share", "screen_share_audio"]
    });
  });

  it("creates participant grants that can subscribe but never publish", () => {
    const grant = createLiveKitVideoGrant({ roomName: "meeting-123", isPresenterOwner: false });

    expect(grant.canPublish).toBe(false);
    expect(grant.canSubscribe).toBe(true);
    expect(grant.canPublishSources).toBeUndefined();
  });

  it("keeps screen-share controls restricted to the presenter console", () => {
    const owner = profile("presenter", presenterId);
    const participant = profile("participant");
    const admin = profile("admin");

    expect(canUsePresenterConsoleControls({ profile: owner, meeting, mode: "console" })).toBe(true);
    expect(canUsePresenterConsoleControls({ profile: owner, meeting, mode: "room" })).toBe(false);
    expect(canUsePresenterConsoleControls({ profile: participant, meeting, mode: "console" })).toBe(false);
    expect(canUsePresenterConsoleControls({ profile: admin, meeting, mode: "console" })).toBe(false);
  });

  it("allows only presenter and participant roles to connect to LiveKit screen view", () => {
    expect(canConnectToScreenShare("presenter")).toBe(true);
    expect(canConnectToScreenShare("participant")).toBe(true);
    expect(canConnectToScreenShare("admin")).toBe(false);
  });

  it("uses deterministic room names per meeting", () => {
    expect(createScreenShareRoomName("abc-123")).toBe("meeting-abc-123");
  });
});
