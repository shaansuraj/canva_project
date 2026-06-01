import { PDFDocument } from "pdf-lib";

export type PageDraft = {
  pageNumber: number;
  width: number;
  height: number;
};

export async function getPdfPageDrafts(file: File): Promise<PageDraft[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });

  return pdf.getPages().map((page, index) => {
    const size = page.getSize();
    return {
      pageNumber: index + 1,
      width: Math.round(size.width),
      height: Math.round(size.height)
    };
  });
}

export async function getImagePageDraft(file: File): Promise<PageDraft> {
  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = url;
    });

    return {
      pageNumber: 1,
      width: image.naturalWidth || 1200,
      height: image.naturalHeight || 800
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
