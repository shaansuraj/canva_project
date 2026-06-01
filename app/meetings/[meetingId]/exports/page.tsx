import { redirect } from "next/navigation";

import { ExportsClient } from "./exports-client";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRoleHomePath, requireActiveProfile } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExportJob, Meeting, MeetingNote, ParticipantPermission } from "@/types/app";

export default async function MeetingExportsPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const profile = await requireActiveProfile();
  const supabase = await createSupabaseServerClient();

  const { data: meeting } = await supabase.from("meetings").select("*").eq("id", meetingId).single();
  if (!meeting) redirect(getRoleHomePath(profile.role));

  const typedMeeting = meeting as Meeting;
  const isPresenterOwner = profile.role === "presenter" && typedMeeting.presenter_id === profile.id;

  if (profile.role === "presenter" && !isPresenterOwner) redirect("/presenter/meetings");

  let participantPermission: ParticipantPermission | null = null;
  let isMember = isPresenterOwner;

  if (profile.role === "participant") {
    const [{ data: membership }, { data: permission }] = await Promise.all([
      supabase.from("meeting_participants").select("id").eq("meeting_id", meetingId).eq("user_id", profile.id).maybeSingle(),
      supabase.from("participant_permissions").select("*").eq("meeting_id", meetingId).eq("user_id", profile.id).maybeSingle()
    ]);

    if (!membership) redirect("/join");
    isMember = true;
    participantPermission = permission as ParticipantPermission | null;
  }

  const canRequestExports =
    profile.role === "admin" ||
    isPresenterOwner ||
    (profile.role === "participant" && isMember && (typedMeeting.status === "completed" || typedMeeting.downloads_enabled || participantPermission?.can_download === true));
  const canWriteNotes = profile.role !== "admin" && isMember;

  const [{ data: jobs }, { data: notes }] = await Promise.all([
    supabase.from("export_jobs").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: false }).limit(20),
    supabase.from("meeting_notes").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: false })
  ]);

  return (
    <AppShell
      profile={profile}
      title="Exports and archive"
      description="Generate annotated PDFs, meeting notes, annotation reports, user-wise reports, and the complete meeting archive."
    >
      <div className="space-y-5">
        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle>{typedMeeting.title}</CardTitle>
            <CardDescription>
              Code {typedMeeting.code} · Status {typedMeeting.status}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`/meetings/${meetingId}/reports`}>Open reports</a>
            </Button>
            {isPresenterOwner ? (
              <Button asChild variant="outline">
                <a href={`/meetings/${meetingId}/console`}>Presenter console</a>
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <ExportsClient
          meeting={typedMeeting}
          profile={profile}
          canRequestExports={canRequestExports}
          canWriteNotes={canWriteNotes}
          initialJobs={(jobs ?? []) as ExportJob[]}
          initialNotes={(notes ?? []) as MeetingNote[]}
        />
      </div>
    </AppShell>
  );
}
