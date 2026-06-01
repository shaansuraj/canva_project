import { z } from "npm:zod@3.24.1";

import { requireAdmin } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const schema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8),
  mustChangePassword: z.boolean().default(true)
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const admin = await requireAdmin(request.headers.get("Authorization"));
  if ("error" in admin) return jsonResponse({ error: admin.error }, admin.status);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid request body.", issues: parsed.error.flatten() }, 400);
  }

  const { userId, password, mustChangePassword } = parsed.data;

  const { error: authError } = await admin.serviceClient.auth.admin.updateUserById(userId, {
    password
  });

  if (authError) return jsonResponse({ error: authError.message }, 400);

  const { data: profile, error: profileError } = await admin.serviceClient
    .from("profiles")
    .update({ must_change_password: mustChangePassword })
    .eq("id", userId)
    .select("id, email, full_name, role, must_change_password")
    .single();

  if (profileError) return jsonResponse({ error: profileError.message }, 500);

  await admin.serviceClient.from("audit_logs").insert({
    actor_id: admin.user.id,
    action: "admin_reset_password",
    entity_type: "profiles",
    entity_id: userId,
    metadata: { mustChangePassword }
  });

  return jsonResponse({ profile });
});
