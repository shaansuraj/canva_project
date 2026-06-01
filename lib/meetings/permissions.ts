export function canParticipantJoinMeeting(status: string, isActive: boolean) {
  return isActive && ["scheduled", "live", "paused"].includes(status);
}
