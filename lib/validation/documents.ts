import { z } from "zod";

export const ACCEPTED_DOCUMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp", "ppt", "pptx"] as const;
export const PPTX_FALLBACK_ERROR = "PPT/PPTX conversion provider is not configured. Please upload PDF for immediate annotation.";

export const documentTypeSchema = z.enum(["pdf", "image", "pptx", "ppt"]);

export const uploadDocumentSchema = z.object({
  meetingId: z.string().uuid(),
  documentId: z.string().uuid(),
  filename: z.string().min(1),
  mimeType: z.string().optional().nullable(),
  fileSizeBytes: z.number().int().nonnegative(),
  documentType: documentTypeSchema,
  title: z.string().min(1),
  pageCount: z.number().int().nonnegative()
});

export function sanitizeFilename(filename: string) {
  const normalized = filename.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
  return normalized || "document";
}

export function getDocumentExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function getDocumentType(filename: string, mimeType?: string | null) {
  const extension = getDocumentExtension(filename);

  if (extension === "pdf" || mimeType === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp"].includes(extension) || mimeType?.startsWith("image/")) return "image";
  if (extension === "pptx") return "pptx";
  if (extension === "ppt") return "ppt";

  return null;
}

export function isAcceptedDocument(filename: string, mimeType?: string | null) {
  return Boolean(getDocumentType(filename, mimeType));
}
