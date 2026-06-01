import { redirect } from "next/navigation";
import Link from "next/link";
import { FileArchive, MessageSquareText, PenLine, UsersRound } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { estimateAttendanceDurationSeconds, formatDuration } from "@/lib/attendance/duration";
import { getRoleHomePath, requireActiveProfile } from "@/lib/auth/roles";
import { createUserAnnotationReportRows } from "@/lib/exports/formatters";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Annotation, Meeting, MeetingNote, MeetingParticipant } from "@/types/app";

export default async function MeetingReportsPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const profile = await requireActiveProfile();
  const supabase = await createSupabaseServerClient();

  const { data: meeting } = await supabase.from("meetings").select("*").eq("id", meetingId).single();
  if (!meeting) redirect(getRoleHomePath(profile.role));

  const typedMeeting = meeting as Meeting;
  const canReadReport = profile.role === "admin" || (profile.role === "presenter" && typedMeeting.presenter_id === profile.id);
  if (!canReadReport) redirect(getRoleHomePath(profile.role));

  const [{ data: participants }, { data: annotations }, { data: notes }] = await Promise.all([
    supabase.from("meeting_participants").select("*").eq("meeting_id", meetingId).order("joined_at", { ascending: true }),
    supabase.from("annotations").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: true }),
    supabase.from("meeting_notes").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: false })
  ]);

  const rows = (participants ?? []) as MeetingParticipant[];
  const annotationRows = (annotations ?? []) as Annotation[];
  const noteRows = (notes ?? []) as MeetingNote[];
  const userAnnotationRows = createUserAnnotationReportRows(annotationRows);
  const totalSeconds = rows.reduce((sum, row) => sum + estimateAttendanceDurationSeconds(row), 0);

  return (
    <AppShell
      profile={profile}
      title="Attendance report"
      description={`Attendance summary for ${typedMeeting.title}.`}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-5">
          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardDescription>Attendees</CardDescription>
              <CardTitle>{rows.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardDescription>Present now</CardDescription>
              <CardTitle>{rows.filter((row) => row.is_present).length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardDescription>Total duration estimate</CardDescription>
              <CardTitle>{formatDuration(totalSeconds)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardDescription>Annotations</CardDescription>
              <CardTitle>{annotationRows.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardDescription>Notes</CardDescription>
              <CardTitle>{noteRows.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenLine className="h-5 w-5" aria-hidden="true" />
              Annotation report
            </CardTitle>
            <CardDescription>User-wise annotation totals and export access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {userAnnotationRows.length === 0 ? <p className="text-sm text-muted-foreground">No annotations captured yet.</p> : null}
              {userAnnotationRows.map((row) => (
                <div key={`${row.userId ?? row.userName}-${row.role}`} className="rounded-3xl border border-border/70 bg-white/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{row.userName}</p>
                      <p className="text-xs text-muted-foreground">{row.designation ?? "No designation"}</p>
                    </div>
                    <Badge variant="secondary">{row.role}</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <p><span className="font-bold">{row.annotationCount}</span> total</p>
                    <p><span className="font-bold">{row.deletedCount}</span> deleted</p>
                    <p className="truncate"><span className="font-bold">Colors:</span> {row.colors || "none"}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button asChild>
              <Link href={`/meetings/${meetingId}/exports`}>
                <FileArchive className="h-4 w-4" aria-hidden="true" />
                Generate export files
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareText className="h-5 w-5" aria-hidden="true" />
              Meeting notes
            </CardTitle>
            <CardDescription>Shared notes captured for this meeting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {noteRows.length === 0 ? <p className="text-sm text-muted-foreground">No meeting notes yet.</p> : null}
            {noteRows.slice(0, 5).map((note) => (
              <div key={note.id} className="rounded-3xl border border-border/70 bg-white/75 p-4">
                <p className="whitespace-pre-wrap text-sm">{note.note}</p>
                <p className="mt-2 text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5" aria-hidden="true" />
              Attendance log
            </CardTitle>
            <CardDescription>Joined time, last seen, leave time, role, name, designation, and duration estimate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.length === 0 ? <p className="text-sm text-muted-foreground">No attendance records yet.</p> : null}
            {rows.map((row) => (
              <div key={row.id} className="rounded-3xl border border-border/70 bg-white/75 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{row.name_snapshot}</p>
                      <Badge variant="secondary">{row.role_snapshot}</Badge>
                      <Badge variant={row.is_present ? "success" : "outline"}>{row.is_present ? "present" : "left"}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{row.designation_snapshot ?? "No designation"}</p>
                  </div>
                  <p className="text-lg font-black text-primary">{formatDuration(estimateAttendanceDurationSeconds(row))}</p>
                </div>
                <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                  <p>Joined: {new Date(row.joined_at).toLocaleString()}</p>
                  <p>Last seen: {row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : "Not seen"}</p>
                  <p>Left: {row.left_at ? new Date(row.left_at).toLocaleString() : "Not left"}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
