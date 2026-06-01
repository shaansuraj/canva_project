"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { MeetingParticipant, Profile } from "@/types/app";

const HEARTBEAT_MS = 30_000;

export function AttendanceHeartbeat({ meetingId, profile }: { meetingId: string; profile: Profile }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [lastBeat, setLastBeat] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function beat() {
      const now = new Date();
      const update: Partial<MeetingParticipant> = {
        last_seen_at: now.toISOString(),
        is_present: true,
        left_at: null
      };

      const { error } = await supabase
        .from("meeting_participants")
        .update(update)
        .eq("meeting_id", meetingId)
        .eq("user_id", profile.id);

      if (!error && active) setLastBeat(now);
    }

    void beat();
    const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);

    const markLeft = () => {
      navigator.sendBeacon(`/meetings/${meetingId}/attendance/leave`, new Blob([], { type: "application/json" }));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") markLeft();
      if (document.visibilityState === "visible") void beat();
    };

    window.addEventListener("pagehide", markLeft);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", markLeft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      markLeft();
    };
  }, [meetingId, profile.id, supabase]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-white/75 px-4 py-3 text-sm">
      <Badge variant="success">
        <Activity className="mr-1 h-3 w-3" aria-hidden="true" />
        Attendance active
      </Badge>
      <span className="flex items-center gap-2 text-muted-foreground">
        <Clock className="h-4 w-4" aria-hidden="true" />
        {lastBeat ? `Last heartbeat ${lastBeat.toLocaleTimeString()}` : "Heartbeat starting"}
      </span>
    </div>
  );
}
