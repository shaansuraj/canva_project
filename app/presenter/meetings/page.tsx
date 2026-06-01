import { Copy, DoorOpen, FileArchive, FileBarChart, MonitorUp, PlusCircle } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Meeting } from "@/types/app";

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function PresenterMeetingsPage() {
  const profile = await requireRole("presenter");
  const supabase = await createSupabaseServerClient();

  const { data: meetings, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("presenter_id", profile.id)
    .order("created_at", { ascending: false });

  const list = (meetings ?? []) as Meeting[];

  return (
    <AppShell
      profile={profile}
      title="Presenter meetings"
      description="Create meetings, share join codes, and open the meeting room for attendance capture."
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-[2rem] border border-white/70 bg-white/70 p-4 shadow-soft backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold">Your meeting catalog</p>
            <p className="text-sm text-muted-foreground">Each meeting has exactly one presenter owner.</p>
          </div>
          <Button asChild>
            <Link href="/presenter/meetings/new">
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              New meeting
            </Link>
          </Button>
        </div>

        {error ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            Could not load meetings: {error.message}
          </div>
        ) : null}

        {list.length === 0 ? (
          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardTitle>No meetings yet</CardTitle>
              <CardDescription>Create your first meeting to generate a participant join code.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((meeting) => (
              <Card key={meeting.id} className="bg-white/85 backdrop-blur">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{meeting.title}</CardTitle>
                      <CardDescription>{formatDate(meeting.scheduled_start_at)}</CardDescription>
                    </div>
                    <Badge variant="secondary">{meeting.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {meeting.description ? <p className="text-sm text-muted-foreground">{meeting.description}</p> : null}
                  <div className="rounded-2xl bg-secondary/70 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Join code</p>
                    <div className="mt-1 flex items-center gap-2 text-3xl font-black tracking-[0.25em] text-primary">
                      <Copy className="h-5 w-5" aria-hidden="true" />
                      {meeting.code}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild className="flex-1">
                      <Link href={`/meetings/${meeting.id}/console`}>
                        <MonitorUp className="h-4 w-4" aria-hidden="true" />
                        Console
                      </Link>
                    </Button>
                    <Button asChild className="flex-1" variant="outline">
                      <Link href={`/meetings/${meeting.id}/room`}>
                        <DoorOpen className="h-4 w-4" aria-hidden="true" />
                        Open room
                      </Link>
                    </Button>
                    <Button asChild className="flex-1" variant="outline">
                      <Link href={`/meetings/${meeting.id}/reports`}>
                        <FileBarChart className="h-4 w-4" aria-hidden="true" />
                        Attendance
                      </Link>
                    </Button>
                    <Button asChild className="flex-1" variant="outline">
                      <Link href={`/meetings/${meeting.id}/exports`}>
                        <FileArchive className="h-4 w-4" aria-hidden="true" />
                        Exports
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
