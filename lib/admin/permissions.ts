export function canManageUser(actorRole: string, targetRole: string) {
  return actorRole === "admin" && ["presenter", "participant"].includes(targetRole);
}
