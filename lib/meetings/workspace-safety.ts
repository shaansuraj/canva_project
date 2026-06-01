import type { Annotation, UserRole } from "@/types/app";

export function hasSavableAnnotations(annotations: Pick<Annotation, "document_id" | "is_deleted">[], documentId?: string | null) {
  return annotations.some((annotation) => !annotation.is_deleted && (!documentId || annotation.document_id === documentId));
}

export function getMeetingLeaveDestination(role: UserRole) {
  if (role === "participant") return "/join";
  if (role === "presenter") return "/presenter/meetings";
  return "/dashboard";
}
