"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/roles";
import { createUniqueMeetingCode } from "@/lib/meetings/code";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createMeetingSchema } from "@/lib/validation/meetings";

export type CreateMeetingResult = {
  ok: boolean;
  message: string;
  meetingId?: string;
  code?: string;
};

export async function createMeetingAction(input: unknown): Promise<CreateMeetingResult> {
  const presenter = await requireRole("presenter");
  const parsed = createMeetingSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid meeting details." };
  }

  const supabase = await createSupabaseServerClient();
  const code = await createUniqueMeetingCode({
    exists: async (candidate) => {
      const { data, error } = await supabase.from("meetings").select("id").eq("code", candidate).maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    }
  });

  const scheduledStartAt = parsed.data.scheduledStartAt ? new Date(parsed.data.scheduledStartAt).toISOString() : null;

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      code,
      title: parsed.data.title,
      description: parsed.data.description || null,
      presenter_id: presenter.id,
      scheduled_start_at: scheduledStartAt,
      max_participants: parsed.data.maxParticipants
    })
    .select("id, code")
    .single();

  if (error || !meeting) {
    return { ok: false, message: error?.message ?? "Could not create meeting." };
  }

  await supabase.from("audit_logs").insert({
    actor_id: presenter.id,
    meeting_id: meeting.id,
    action: "presenter_create_meeting",
    entity_type: "meetings",
    entity_id: meeting.id,
    metadata: { code: meeting.code, title: parsed.data.title }
  });

  revalidatePath("/presenter/meetings");
  return { ok: true, message: "Meeting created.", meetingId: meeting.id, code: meeting.code };
}
