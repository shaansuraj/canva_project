import type { Meeting, Profile, UserRole } from "@/types/app";

export type WorkspaceMode = "room" | "console";

export type LiveKitVideoGrant = {
  roomJoin: true;
  room: string;
  canPublish: boolean;
  canSubscribe: true;
  canPublishData: false;
  canPublishSources?: ["screen_share"];
};

export function createScreenShareRoomName(meetingId: string) {
  return `meeting-${meetingId}`;
}

export function createLiveKitVideoGrant({ roomName, isPresenterOwner }: { roomName: string; isPresenterOwner: boolean }): LiveKitVideoGrant {
  if (isPresenterOwner) {
    return {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ["screen_share"]
    };
  }

  return {
    roomJoin: true,
    room: roomName,
    canPublish: false,
    canSubscribe: true,
    canPublishData: false
  };
}

export function canUsePresenterConsoleControls({ profile, meeting, mode }: { profile: Profile; meeting: Meeting; mode: WorkspaceMode }) {
  return mode === "console" && profile.role === "presenter" && profile.id === meeting.presenter_id && profile.is_active;
}

export function canConnectToScreenShare(role: UserRole) {
  return role === "presenter" || role === "participant";
}
