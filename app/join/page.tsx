import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth/roles";
import { JoinMeetingForm } from "./join-meeting-form";

export default async function JoinPage() {
  const profile = await requireRole("participant");

  return (
    <AppShell
      profile={profile}
      title="Join meeting"
      description="Use the meeting code shared by your presenter. Attendance starts as soon as you enter the room."
    >
      <JoinMeetingForm />
    </AppShell>
  );
}
