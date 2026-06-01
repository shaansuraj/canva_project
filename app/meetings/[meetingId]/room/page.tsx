import { MeetingExperience } from "../meeting-experience";

export default async function MeetingRoomPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  return <MeetingExperience meetingId={meetingId} mode="room" />;
}
