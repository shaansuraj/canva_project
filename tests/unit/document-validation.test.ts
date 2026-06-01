import { describe, expect, it } from "vitest";

import { getDocumentType, getOfficeConversionFallbackError, isAcceptedDocument, OFFICE_FALLBACK_ERROR, PPTX_FALLBACK_ERROR, sanitizeFilename, uploadDocumentSchema } from "@/lib/validation/documents";

describe("phase 3 document validation", () => {
  it("classifies supported MVP document types", () => {
    expect(getDocumentType("meeting-pack.pdf", "application/pdf")).toBe("pdf");
    expect(getDocumentType("whiteboard.PNG", "image/png")).toBe("image");
    expect(getDocumentType("strategy.pptx")).toBe("pptx");
    expect(getDocumentType("legacy-deck.ppt")).toBe("ppt");
    expect(getDocumentType("minutes.docx")).toBe("docx");
    expect(getDocumentType("budget.xlsx")).toBe("xlsx");
    expect(getDocumentType("notes.txt")).toBeNull();
  });

  it("accepts PDF, image, presentation, Word, and Excel uploads only", () => {
    expect(isAcceptedDocument("diagram.webp", "image/webp")).toBe(true);
    expect(isAcceptedDocument("briefing.pptx")).toBe(true);
    expect(isAcceptedDocument("report.doc", "application/msword")).toBe(true);
    expect(isAcceptedDocument("sheet.xlsx")).toBe(true);
    expect(isAcceptedDocument("archive.zip", "application/zip")).toBe(false);
  });

  it("sanitizes storage-safe filenames", () => {
    expect(sanitizeFilename(" Q2 review deck (final).pdf ")).toBe("Q2-review-deck--final-.pdf");
    expect(sanitizeFilename("")).toBe("document");
  });

  it("keeps the required graceful PPT/PPTX fallback message stable", () => {
    expect(PPTX_FALLBACK_ERROR).toBe("PPT/PPTX conversion provider is not configured. Please upload PDF for immediate annotation.");
    expect(OFFICE_FALLBACK_ERROR).toBe("Office document conversion provider is not configured. Please upload PDF for immediate annotation.");
    expect(getOfficeConversionFallbackError("pptx")).toBe(PPTX_FALLBACK_ERROR);
    expect(getOfficeConversionFallbackError("docx")).toBe(OFFICE_FALLBACK_ERROR);
  });

  it("validates upload metadata before persistence", () => {
    expect(
      uploadDocumentSchema.safeParse({
        meetingId: crypto.randomUUID(),
        documentId: crypto.randomUUID(),
        filename: "source.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
        documentType: "pdf",
        title: "Source",
        pageCount: 3
      }).success
    ).toBe(true);

    expect(
      uploadDocumentSchema.safeParse({
        meetingId: "bad",
        documentId: crypto.randomUUID(),
        filename: "",
        fileSizeBytes: -1,
        documentType: "zip",
        title: "",
        pageCount: -2
      }).success
    ).toBe(false);
  });
});
