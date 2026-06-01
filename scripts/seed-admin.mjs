import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadDotEnv() {
  if (!existsSync(".env")) return;

  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^['\"]|['\"]$/g, "");
    }
  }
}

loadDotEnv();

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.ADMIN_EMAIL ?? "admin@hexmon.com";
const adminPassword = process.env.ADMIN_PASSWORD ?? "@Hexmon2026";
const adminFullName = process.env.ADMIN_FULL_NAME ?? "Hexmon Admin";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function findUserByEmail(email) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  let user = await findUserByEmail(adminEmail);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminFullName,
        role: "admin"
      }
    });

    if (error) throw error;
    user = data.user;
    console.log(`Created admin auth user: ${adminEmail}`);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: adminFullName,
        role: "admin"
      }
    });

    if (error) throw error;
    console.log(`Updated existing admin auth user: ${adminEmail}`);
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: adminEmail,
      full_name: adminFullName,
      designation: "System Administrator",
      role: "admin",
      is_active: true,
      color: "#0f4c5c",
      must_change_password: false,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (profileError) throw profileError;

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: "seed_admin",
    entity_type: "profiles",
    entity_id: user.id,
    metadata: { email: adminEmail, source: "scripts/seed-admin.mjs" }
  });

  if (auditError) {
    console.warn(`Admin profile seeded, but audit log insert failed: ${auditError.message}`);
  }

  console.log("Seed admin is ready.");
  console.log(`Email: ${adminEmail}`);
  console.log("Password: configured via ADMIN_PASSWORD or default @Hexmon2026");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
