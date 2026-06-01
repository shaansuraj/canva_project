import { redirect } from "next/navigation";

import { getRoleHomePath, requireActiveProfile } from "@/lib/auth/roles";

export default async function DashboardPage() {
  const profile = await requireActiveProfile();
  redirect(getRoleHomePath(profile.role));
}
