import { ROLE_HOME_PATH } from "@/lib/constants";
import type { RouteSection, UserRole } from "@/types/app";

export function getRoleHomePath(role: UserRole) {
  return ROLE_HOME_PATH[role];
}

export function canAccessSection(role: UserRole, section: RouteSection) {
  if (section === "shared") return true;
  if (section === "admin") return role === "admin";
  if (section === "presenter") return role === "presenter";
  return role === "participant";
}
