"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/roles";
import { recordAttendanceJoin } from "@/lib/attendance/records";
import { canParticipantJoinMeeting } from "@/lib/meetings/permissions";
import { normalizeMeetingCode } from "@/lib/meetings/code";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { joinMeetingSchema } from "@/lib/validation/meetings";

export type JoinMeetingResult = {
  ok: boolean;
  message: string;
  meetingId?: string;
};

export async function joinMeetingAction(input: unknown): Promise<JoinMeetingResult> {
  const participant = await requireRole("participant");
  const parsed = joinMeetingSchema.safeParse(input);

  if (!parsed.success) return { ok: false, message: "Enter a valid meeting code." };

  const code = normalizeMeetingCode(parsed.data.code);
  const supabase = await createSupabaseServerClient();
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("id, code, status, max_participants")
    .eq("code", code)
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!meeting) return { ok: false, message: "No meeting was found for that code." };

  if (!canParticipantJoinMeeting(meeting.status, participant.is_active)) {
    return { ok: false, message: "This meeting is not open for joining." };
  }

  const { count, error: countError } = await supabase
    .from("meeting_participants")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", meeting.id)
    .eq("is_present", true);

  if (countError) return { ok: false, message: countError.message };
  if ((count ?? 0) >= meeting.max_participants) {
    return { ok: false, message: "This meeting is currently full." };
  }

  const attendance = await recordAttendanceJoin({ supabase, profile: participant, meetingId: meeting.id });
  if (attendance.error) return { ok: false, message: attendance.error.message };

  await supabase.from("audit_logs").insert({
    actor_id: participant.id,
    meeting_id: meeting.id,
    action: "participant_join_meeting",
    entity_type: "meetings",
    entity_id: meeting.id,
    metadata: { code }
  });

  revalidatePath("/join");
  revalidatePath(`/meetings/${meeting.id}/room`);
  return { ok: true, message: "Joined meeting.", meetingId: meeting.id };
}
