import { createClient } from "npm:@supabase/supabase-js@2.106.2";

export type EdgeProfile = {
  id: string;
  role: "admin" | "presenter" | "participant";
  is_active: boolean;
};

export function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

export function createUserClient(authorization: string) {
  return createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_ANON_KEY"), {
    global: {
      headers: {
        Authorization: authorization
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function createServiceClient() {
  return createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function requireAdmin(authorization: string | null) {
  if (!authorization) {
    return { error: "Missing authorization header.", status: 401 } as const;
  }

  const userClient = createUserClient(authorization);
  const serviceClient = createServiceClient();

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return { error: "Invalid or expired session.", status: 401 } as const;
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single<EdgeProfile>();

  if (profileError || !profile || profile.role !== "admin" || !profile.is_active) {
    return { error: "Admin access is required.", status: 403 } as const;
  }

  return { user, profile, serviceClient } as const;
}
