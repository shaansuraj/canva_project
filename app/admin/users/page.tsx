import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/roles";
import type { Profile } from "@/types/app";
import { AdminUsersClient } from "./admin-users-client";

export default async function AdminUsersPage() {
  const profile = await requireRole("admin");
  const supabase = await createSupabaseServerClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <AppShell
      profile={profile}
      title="User management"
      description="Create Presenter and Participant accounts, reset passwords, and manage activation status."
    >
      {error ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          Could not load users: {error.message}
        </div>
      ) : (
        <AdminUsersClient profiles={(profiles ?? []) as Profile[]} />
      )}
    </AppShell>
  );
}
