import { z } from "npm:zod@3.24.1";

import { requireAdmin } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(2),
  designation: z.string().trim().max(80).optional().nullable(),
  role: z.enum(["presenter", "participant"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable()
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

  const input = parsed.data;
  const email = input.email.toLowerCase();

  const { data: created, error: createError } = await admin.serviceClient.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      designation: input.designation ?? null,
      role: input.role
    }
  });

  if (createError || !created.user) {
    return jsonResponse({ error: createError?.message ?? "Could not create user." }, 409);
  }

  const profilePayload = {
    id: created.user.id,
    email,
    full_name: input.fullName,
    designation: input.designation || null,
    role: input.role,
    is_active: true,
    color: input.color || null,
    must_change_password: true,
    created_by: admin.user.id
  };

  const { data: profile, error: profileError } = await admin.serviceClient
    .from("profiles")
    .insert(profilePayload)
    .select()
    .single();

  if (profileError) {
    await admin.serviceClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: profileError.message }, 500);
  }

  await admin.serviceClient.from("audit_logs").insert({
    actor_id: admin.user.id,
    action: "admin_create_user",
    entity_type: "profiles",
    entity_id: created.user.id,
    metadata: { email, role: input.role }
  });

  return jsonResponse({ profile }, 201);
});
