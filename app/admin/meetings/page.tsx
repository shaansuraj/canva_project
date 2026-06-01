import Link from "next/link";
import { DoorOpen, FileArchive, FileBarChart } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Meeting, Profile } from "@/types/app";

export default async function AdminMeetingsPage() {
  const profile = await requireRole("admin");
  const supabase = await createSupabaseServerClient();

  const [{ data: meetings, error }, { data: profiles }] = await Promise.all([
    supabase.from("meetings").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, role, is_active")
  ]);

  const presenterById = new Map((profiles ?? []).map((item) => [item.id, item as Pick<Profile, "id" | "full_name" | "email">]));
  const list = (meetings ?? []) as Meeting[];

  return (
    <AppShell
      profile={profile}
      title="Meeting oversight"
      description="Review presenter-created meetings and open attendance reports."
    >
      {error ? <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{error.message}</div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {list.length === 0 ? (
          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardTitle>No meetings yet</CardTitle>
              <CardDescription>Presenter-created meetings will appear here.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
        {list.map((meeting) => {
          const presenter = presenterById.get(meeting.presenter_id);
          return (
            <Card key={meeting.id} className="bg-white/85 backdrop-blur">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{meeting.title}</CardTitle>
                    <CardDescription>{presenter?.full_name ?? "Unknown presenter"}</CardDescription>
                  </div>
                  <Badge variant="secondary">{meeting.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl bg-secondary/75 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Code</p>
                  <p className="text-2xl font-black tracking-[0.25em] text-primary">{meeting.code}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild className="flex-1" variant="outline">
                    <Link href={`/meetings/${meeting.id}/room`}>
                      <DoorOpen className="h-4 w-4" aria-hidden="true" />
                      Room
                    </Link>
                  </Button>
                  <Button asChild className="flex-1">
                    <Link href={`/meetings/${meeting.id}/reports`}>
                      <FileBarChart className="h-4 w-4" aria-hidden="true" />
                      Report
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
          );
        })}
      </div>
    </AppShell>
  );
}
