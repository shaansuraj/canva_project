import { redirect } from "next/navigation";

import { AttendanceHeartbeat } from "./room/attendance-heartbeat";
import { MeetingWorkspace } from "./room/workspace/meeting-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { recordAttendanceJoin } from "@/lib/attendance/records";
import { getRoleHomePath, requireActiveProfile } from "@/lib/auth/roles";
import type { WorkspaceMode } from "@/lib/livekit/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Annotation, DocumentPage, Meeting, MeetingDocument, MeetingParticipant, ParticipantPermission, ScreenShareSession } from "@/types/app";

export async function MeetingExperience({ meetingId, mode }: { meetingId: string; mode: WorkspaceMode }) {
  const profile = await requireActiveProfile();
  const supabase = await createSupabaseServerClient();

  const { data: meeting } = await supabase.from("meetings").select("*").eq("id", meetingId).single();

  if (!meeting) redirect(getRoleHomePath(profile.role));

  const typedMeeting = meeting as Meeting;
  const isPresenterOwner = profile.role === "presenter" && typedMeeting.presenter_id === profile.id;

  if (mode === "console" && !isPresenterOwner) {
    redirect(getRoleHomePath(profile.role));
  }

  if (profile.role === "presenter" && typedMeeting.presenter_id !== profile.id) {
    redirect("/presenter/meetings");
  }

  if (profile.role === "participant") {
    const { data: membership } = await supabase
      .from("meeting_participants")
      .select("id")
      .eq("meeting_id", meetingId)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!membership) redirect("/join");
  }

  if (profile.role !== "admin") {
    await recordAttendanceJoin({ supabase, profile, meetingId });
  }

  const [{ data: participants }, { data: permissions }, { data: screenShareSessions }, { data: documents }, { data: pages }, { data: annotations }] =
    await Promise.all([
      supabase.from("meeting_participants").select("*").eq("meeting_id", meetingId).order("joined_at", { ascending: true }),
      supabase.from("participant_permissions").select("*").eq("meeting_id", meetingId),
      supabase
        .from("screen_share_sessions")
        .select("*")
        .eq("meeting_id", meetingId)
        .in("status", ["live", "paused"])
        .order("started_at", { ascending: false })
        .limit(1),
      supabase.from("meeting_documents").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: false }),
      supabase.from("document_pages").select("*").eq("meeting_id", meetingId).order("page_number", { ascending: true }),
      supabase
        .from("annotations")
        .select("*")
        .eq("meeting_id", meetingId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
    ]);

  const participantRows = (participants ?? []) as MeetingParticipant[];
  const shellDescription =
    mode === "console"
      ? "Presenter console for screen sharing, document controls, realtime annotations, participant permissions, and attendance capture."
      : "Shared meeting room with screen-share viewing, realtime annotations, presence, and attendance capture.";

  return (
    <AppShell profile={profile} title={typedMeeting.title} description={shellDescription}>
      {profile.role !== "admin" ? <div className="sr-only"><AttendanceHeartbeat meetingId={meetingId} profile={profile} /></div> : null}

      <MeetingWorkspace
        initialMeeting={typedMeeting}
        profile={profile}
        mode={mode}
        initialParticipants={participantRows}
        initialPermissions={(permissions ?? []) as ParticipantPermission[]}
        initialScreenShareSession={((screenShareSessions ?? [])[0] ?? null) as ScreenShareSession | null}
        initialDocuments={(documents ?? []) as MeetingDocument[]}
        initialPages={(pages ?? []) as DocumentPage[]}
        initialAnnotations={(annotations ?? []) as Annotation[]}
      />
    </AppShell>
  );
}
