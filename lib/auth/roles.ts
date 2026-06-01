import { redirect } from "next/navigation";

import { getRoleHomePath } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types/app";

export { canAccessSection, getRoleHomePath } from "@/lib/auth/guards";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  if (error || !data) return null;

  return data;
}

export async function requireActiveProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login?error=inactive");

  return profile;
}

export async function requireRole(role: UserRole): Promise<Profile> {
  const profile = await requireActiveProfile();

  if (profile.role !== role) redirect(getRoleHomePath(profile.role));

  return profile;
}
