export const APP_NAME = "Smart Collaborative Meeting & Annotation System";

export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/admin",
  "/presenter",
  "/join",
  "/meetings"
] as const;

export const ROLE_HOME_PATH = {
  admin: "/admin/users",
  presenter: "/presenter/meetings",
  participant: "/join"
} as const;
