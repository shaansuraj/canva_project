import { z } from "zod";

export const ACCEPTED_DOCUMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp", "ppt", "pptx", "doc", "docx", "xls", "xlsx"] as const;
export const PPTX_FALLBACK_ERROR = "PPT/PPTX conversion provider is not configured. Please upload PDF for immediate annotation.";
export const OFFICE_FALLBACK_ERROR = "Office document conversion provider is not configured. Please upload PDF for immediate annotation.";

export const documentTypeSchema = z.enum(["pdf", "image", "pptx", "ppt", "doc", "docx", "xls", "xlsx"]);
export type ValidatedDocumentType = z.infer<typeof documentTypeSchema>;

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

export function getDocumentType(filename: string, mimeType?: string | null): ValidatedDocumentType | null {
  const extension = getDocumentExtension(filename);

  if (extension === "pdf" || mimeType === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp"].includes(extension) || mimeType?.startsWith("image/")) return "image";
  if (extension === "pptx" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (extension === "ppt" || mimeType === "application/vnd.ms-powerpoint") return "ppt";
  if (extension === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (extension === "doc" || mimeType === "application/msword") return "doc";
  if (extension === "xlsx" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (extension === "xls" || mimeType === "application/vnd.ms-excel") return "xls";

  return null;
}

export function isAcceptedDocument(filename: string, mimeType?: string | null) {
  return Boolean(getDocumentType(filename, mimeType));
}

export function isOfficeDocumentType(documentType: ValidatedDocumentType) {
  return ["ppt", "pptx", "doc", "docx", "xls", "xlsx"].includes(documentType);
}

export function getOfficeConversionFallbackError(documentType: ValidatedDocumentType) {
  return documentType === "ppt" || documentType === "pptx" ? PPTX_FALLBACK_ERROR : OFFICE_FALLBACK_ERROR;
}
