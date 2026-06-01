import { redirect } from "next/navigation";
import { ClipboardList, FileArchive, UsersRound } from "lucide-react";

import { AttendanceHeartbeat } from "./room/attendance-heartbeat";
import { MeetingWorkspace } from "./room/workspace/meeting-workspace";
import { AppShell } from "@/components/layout/app-shell";
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="overflow-hidden border-white/10 bg-slate-950 text-white shadow-[0_28px_90px_-48px_rgba(0,0,0,0.95)]">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl font-black tracking-tight">{mode === "console" ? "Presenter console" : "Meeting room"}</CardTitle>
                  <CardDescription className="text-slate-300">One-screen board, screen share, shared audio, annotations, and attendance.</CardDescription>
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white">{typedMeeting.status}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.07] p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-300">Join code</p>
                <p className="mt-2 break-all text-4xl font-black tracking-[0.26em] text-emerald-300 sm:text-5xl">{typedMeeting.code}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                  <p className="text-xs font-bold text-slate-300">Max participants</p>
                  <p className="text-2xl font-black">{typedMeeting.max_participants}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                  <p className="text-xs font-bold text-slate-300">Annotation</p>
                  <p className="text-sm font-black">{typedMeeting.participant_annotation_enabled ? "Enabled" : "Disabled"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                  <p className="text-xs font-bold text-slate-300">Document</p>
                  <p className="text-sm font-black">{typedMeeting.document_locked ? "Locked" : "Unlocked"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-900 text-white shadow-[0_28px_90px_-55px_rgba(0,0,0,0.9)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="h-5 w-5" aria-hidden="true" />
                Attendance
              </CardTitle>
              <CardDescription className="text-slate-300">
                {participantRows.length} attendee record{participantRows.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {participantRows.length === 0 ? (
                <p className="text-sm text-slate-300">No attendees yet.</p>
              ) : (
                participantRows.map((participant) => (
                  <div key={participant.id} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{participant.name_snapshot}</p>
                        <p className="text-xs text-slate-300">{participant.designation_snapshot ?? "No designation"}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] ${participant.is_present ? "border-emerald-300/40 bg-emerald-400/18 text-emerald-50" : "border-white/15 bg-white/10 text-slate-200"}`}>
                        {participant.is_present ? "present" : "left"}
                      </span>
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

        <Card className="border-white/10 bg-slate-950 text-white shadow-[0_28px_90px_-55px_rgba(0,0,0,0.9)]">
          <CardContent className="flex flex-col gap-3 p-5 text-sm text-slate-300 sm:flex-row sm:items-center">
            <ClipboardList className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            <span className="flex-1">Screen share can include presenter-selected tab/system audio. Microphone, camera, mute, and call controls are still not rendered.</span>
            <Button asChild size="sm" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
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
