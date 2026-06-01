import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { Profile } from "@/types/app";

export async function recordAttendanceJoin({
  supabase,
  profile,
  meetingId
}: {
  supabase: SupabaseClient<Database>;
  profile: Profile;
  meetingId: string;
}) {
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("meeting_participants")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (existingError) return { error: existingError };

  if (existing) {
    return supabase
      .from("meeting_participants")
      .update({ last_seen_at: now, left_at: null, is_present: true })
      .eq("id", existing.id);
  }

  return supabase.from("meeting_participants").insert({
    meeting_id: meetingId,
    user_id: profile.id,
    role_snapshot: profile.role,
    name_snapshot: profile.full_name,
    designation_snapshot: profile.designation,
    color_snapshot: profile.color,
    joined_at: now,
    last_seen_at: now,
    is_present: true
  });
}

export async function recordAttendanceLeft({
  supabase,
  profile,
  meetingId
}: {
  supabase: SupabaseClient<Database>;
  profile: Profile;
  meetingId: string;
}) {
  const now = new Date().toISOString();
  return supabase
    .from("meeting_participants")
    .update({ last_seen_at: now, left_at: now, is_present: false })
    .eq("meeting_id", meetingId)
    .eq("user_id", profile.id);
}
