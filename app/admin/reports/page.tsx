import Link from "next/link";
import { FileArchive, FileBarChart } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { estimateAttendanceDurationSeconds, formatDuration } from "@/lib/attendance/duration";
import { requireRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Meeting, MeetingParticipant } from "@/types/app";

export default async function AdminReportsPage() {
  const profile = await requireRole("admin");
  const supabase = await createSupabaseServerClient();

  const [{ data: meetings }, { data: participants }, { data: exportJobs }] = await Promise.all([
    supabase.from("meetings").select("*").order("created_at", { ascending: false }),
    supabase.from("meeting_participants").select("*").order("joined_at", { ascending: false }),
    supabase.from("export_jobs").select("id, meeting_id, status").order("created_at", { ascending: false })
  ]);

  const meetingRows = (meetings ?? []) as Meeting[];
  const participantRows = (participants ?? []) as MeetingParticipant[];
  const participantsByMeeting = new Map<string, MeetingParticipant[]>();

  for (const row of participantRows) {
    participantsByMeeting.set(row.meeting_id, [...(participantsByMeeting.get(row.meeting_id) ?? []), row]);
  }

  return (
    <AppShell
      profile={profile}
      title="Reports"
      description="Attendance, annotation export, and archive reporting for all meetings."
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardDescription>Total meetings</CardDescription>
            <CardTitle>{meetingRows.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardDescription>Attendance records</CardDescription>
            <CardTitle>{participantRows.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardDescription>Present now</CardDescription>
            <CardTitle>{participantRows.filter((row) => row.is_present).length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardDescription>Export jobs</CardDescription>
            <CardTitle>{exportJobs?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {meetingRows.map((meeting) => {
          const rows = participantsByMeeting.get(meeting.id) ?? [];
          const totalSeconds = rows.reduce((sum, row) => sum + estimateAttendanceDurationSeconds(row), 0);
          return (
            <Card key={meeting.id} className="bg-white/85 backdrop-blur">
              <CardHeader>
                <CardTitle>{meeting.title}</CardTitle>
                <CardDescription>Code {meeting.code}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/70 p-3">
                    <p className="text-xs text-muted-foreground">Attendees</p>
                    <p className="text-xl font-black">{rows.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-3">
                    <p className="text-xs text-muted-foreground">Present</p>
                    <p className="text-xl font-black">{rows.filter((row) => row.is_present).length}</p>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-3">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-xl font-black">{formatDuration(totalSeconds)}</p>
                  </div>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/meetings/${meeting.id}/reports`}>
                    <FileBarChart className="h-4 w-4" aria-hidden="true" />
                    Open attendance report
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/meetings/${meeting.id}/exports`}>
                    <FileArchive className="h-4 w-4" aria-hidden="true" />
                    Open exports
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
