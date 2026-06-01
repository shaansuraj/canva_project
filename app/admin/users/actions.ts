"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/roles";
import { canManageUser } from "@/lib/admin/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileStatusSchema } from "@/lib/validation/admin";

export type AdminActionResult = {
  ok: boolean;
  message: string;
};

export async function updateProfileStatusAction(input: unknown): Promise<AdminActionResult> {
  const admin = await requireRole("admin");
  const parsed = profileStatusSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Invalid status update request." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id, role, email")
    .eq("id", parsed.data.userId)
    .single();

  if (targetError || !target) {
    return { ok: false, message: "User was not found." };
  }

  if (!canManageUser(admin.role, target.role)) {
    return { ok: false, message: "Only Presenter and Participant accounts can be changed here." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.userId);

  if (error) return { ok: false, message: error.message };

  await supabase.from("audit_logs").insert({
    actor_id: admin.id,
    action: parsed.data.isActive ? "admin_activate_user" : "admin_deactivate_user",
    entity_type: "profiles",
    entity_id: parsed.data.userId,
    metadata: { email: target.email }
  });

  revalidatePath("/admin/users");
  return { ok: true, message: parsed.data.isActive ? "User activated." : "User deactivated." };
}
