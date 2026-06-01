import { NextResponse, type NextRequest } from "next/server";

import { recordAttendanceLeft } from "@/lib/attendance/records";
import { getCurrentProfile } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const profile = await getCurrentProfile();

  if (!profile || !profile.is_active) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  await recordAttendanceLeft({ supabase, profile, meetingId });

  return NextResponse.json({ ok: true });
}
