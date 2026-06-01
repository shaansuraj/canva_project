import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth/roles";
import { CreateMeetingForm } from "./create-meeting-form";

export default async function NewMeetingPage() {
  const profile = await requireRole("presenter");

  return (
    <AppShell
      profile={profile}
      title="Create meeting"
      description="Presenter-only meeting creation with automatic unique meeting code generation."
    >
      <CreateMeetingForm />
    </AppShell>
  );
}
