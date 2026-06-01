import { NextResponse, type NextRequest } from "next/server";

import { createSignOutRedirectUrl, SIGN_OUT_REDIRECT_STATUS } from "@/lib/auth/sign-out";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signOutAndRedirect(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(createSignOutRedirectUrl(request.url), SIGN_OUT_REDIRECT_STATUS);
}

export async function GET(request: NextRequest) {
  return signOutAndRedirect(request);
}

export async function POST(request: NextRequest) {
  return signOutAndRedirect(request);
}
