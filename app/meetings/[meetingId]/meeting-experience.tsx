import { redirect } from "next/navigation";
import { ClipboardList, FileArchive, UsersRound } from "lucide-react";

import { AttendanceHeartbeat } from "./room/attendance-heartbeat";
import { MeetingWorkspace } from "./room/workspace/meeting-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="space-y-5">
        {profile.role !== "admin" ? <AttendanceHeartbeat meetingId={meetingId} profile={profile} /> : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_0.75fr]">
          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{mode === "console" ? "Presenter console" : "Meeting details"}</CardTitle>
                  <CardDescription>Share the join code with active participants.</CardDescription>
                </div>
                <Badge variant="secondary">{typedMeeting.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-3xl bg-secondary/80 p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-muted-foreground">Join code</p>
                <p className="mt-2 text-4xl font-black tracking-[0.3em] text-primary">{typedMeeting.code}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-white/70 p-4">
                  <p className="text-xs text-muted-foreground">Max participants</p>
                  <p className="text-2xl font-black">{typedMeeting.max_participants}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-white/70 p-4">
                  <p className="text-xs text-muted-foreground">Annotation</p>
                  <p className="text-sm font-bold">{typedMeeting.participant_annotation_enabled ? "Enabled" : "Disabled"}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-white/70 p-4">
                  <p className="text-xs text-muted-foreground">Document</p>
                  <p className="text-sm font-bold">{typedMeeting.document_locked ? "Locked" : "Unlocked"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="h-5 w-5" aria-hidden="true" />
                Attendance
              </CardTitle>
              <CardDescription>
                {participantRows.length} attendee record{participantRows.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {participantRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attendees yet.</p>
              ) : (
                participantRows.map((participant) => (
                  <div key={participant.id} className="rounded-2xl border border-border/70 bg-white/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{participant.name_snapshot}</p>
                        <p className="text-xs text-muted-foreground">{participant.designation_snapshot ?? "No designation"}</p>
                      </div>
                      <Badge variant={participant.is_present ? "success" : "outline"}>{participant.is_present ? "present" : "left"}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

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

        <Card className="bg-white/85 backdrop-blur">
          <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
            <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="flex-1">No microphone, camera, mute, audio, or call controls are rendered. Screen-share controls are available only in the presenter console.</span>
            <Button asChild size="sm" variant="outline">
              <a href={`/meetings/${meetingId}/exports`}>
                <FileArchive className="h-4 w-4" aria-hidden="true" />
                Exports
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
