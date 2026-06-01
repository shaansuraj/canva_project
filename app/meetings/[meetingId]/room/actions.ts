"use server";

import { revalidatePath } from "next/cache";

import { requireActiveProfile } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function startMeetingWorkspaceAction(meetingId: string) {
  const profile = await requireActiveProfile();

  if (profile.role !== "presenter") {
    return { ok: false, message: "Only presenters can start the collaborative workspace." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, presenter_id, status")
    .eq("id", meetingId)
    .single();

  if (meetingError || !meeting) return { ok: false, message: "Meeting not found." };
  if (meeting.presenter_id !== profile.id) return { ok: false, message: "Only the presenter owner can start this workspace." };
  if (meeting.status === "completed" || meeting.status === "cancelled") {
    return { ok: false, message: "Completed or cancelled meetings cannot be started." };
  }

  const { error } = await supabase
    .from("meetings")
    .update({ status: "live", started_at: new Date().toISOString() })
    .eq("id", meetingId);

  if (error) return { ok: false, message: error.message };

  await supabase.from("audit_logs").insert({
    actor_id: profile.id,
    meeting_id: meetingId,
    action: "presenter_start_workspace",
    entity_type: "meetings",
    entity_id: meetingId,
    metadata: { status: "live" }
  });

  revalidatePath(`/meetings/${meetingId}/room`);
  return { ok: true, message: "Workspace is live." };
}

export async function endMeetingAction(meetingId: string) {
  const profile = await requireActiveProfile();

  if (profile.role !== "presenter") {
    return { ok: false, message: "Only presenters can end the meeting." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, presenter_id, status")
    .eq("id", meetingId)
    .single();

  if (meetingError || !meeting) return { ok: false, message: "Meeting not found." };
  if (meeting.presenter_id !== profile.id) return { ok: false, message: "Only the presenter owner can end this meeting." };
  if (meeting.status === "completed") return { ok: true, message: "Meeting is already completed." };
  if (meeting.status === "cancelled") return { ok: false, message: "Cancelled meetings cannot be completed." };

  const endedAt = new Date().toISOString();
  const { error } = await supabase
    .from("meetings")
    .update({
      status: "completed",
      ended_at: endedAt,
      downloads_enabled: true
    })
    .eq("id", meetingId);

  if (error) return { ok: false, message: error.message };

  await supabase
    .from("screen_share_sessions")
    .update({ status: "stopped", stopped_at: endedAt })
    .eq("meeting_id", meetingId)
    .in("status", ["live", "paused"]);

  await supabase
    .from("meeting_participants")
    .update({ last_seen_at: endedAt, left_at: endedAt, is_present: false })
    .eq("meeting_id", meetingId)
    .eq("is_present", true);

  await supabase.from("audit_logs").insert({
    actor_id: profile.id,
    meeting_id: meetingId,
    action: "presenter_end_meeting",
    entity_type: "meetings",
    entity_id: meetingId,
    metadata: { status: "completed", downloadsEnabled: true }
  });

  revalidatePath(`/meetings/${meetingId}/room`);
  revalidatePath(`/meetings/${meetingId}/exports`);
  revalidatePath(`/meetings/${meetingId}/reports`);
  return { ok: true, message: "Meeting ended. Downloads are now enabled." };
}
