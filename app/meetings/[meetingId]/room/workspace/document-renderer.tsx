"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import type { DocumentPage, MeetingDocument } from "@/types/app";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export type BoardSize = {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
};

export function DocumentRenderer({
  document,
  page,
  signedUrl,
  children,
  onSizeChange
}: {
  document: MeetingDocument;
  page: DocumentPage;
  signedUrl: string | null;
  children: React.ReactNode;
  onSizeChange: (size: BoardSize) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const sourceWidth = page.width || 1200;
  const sourceHeight = page.height || 800;
  const height = Math.max(320, Math.round((width * sourceHeight) / sourceWidth));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resize = () => setWidth(Math.max(320, Math.min(1100, Math.floor(container.clientWidth))));
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onSizeChange({
      width,
      height,
      scaleX: width / sourceWidth,
      scaleY: height / sourceHeight
    });
  }, [height, onSizeChange, sourceHeight, sourceWidth, width]);

  return (
    <div ref={containerRef} className="w-full">
      <div className="relative mx-auto overflow-hidden rounded-3xl border border-border bg-white shadow-soft" style={{ width, minHeight: height }}>
        {!signedUrl ? (
          <div className="flex h-full min-h-[320px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
            Preparing secure document preview...
          </div>
        ) : document.document_type === "pdf" ? (
          <Document
            file={signedUrl}
            loading={<div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">Loading PDF...</div>}
            error={<div className="p-6 text-sm text-destructive">Could not render PDF preview.</div>}
          >
            <Page pageNumber={page.page_number} width={width} renderAnnotationLayer={false} renderTextLayer={false} />
          </Document>
        ) : document.document_type === "image" ? (
          <img alt={document.title} className="block h-auto w-full select-none" draggable={false} src={signedUrl} />
        ) : (
          <div className="flex min-h-[320px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
            {document.conversion_status === "failed"
              ? (document.conversion_error ?? "This Office file is saved, but conversion is not configured. Upload a PDF for immediate annotation.")
              : "This Office file is saved and needs conversion before annotation. Upload a PDF for immediate annotation."}
          </div>
        )}
        <div className="absolute inset-0" style={{ width, height }}>
          {children}
        </div>
      </div>
    </div>
  );
}
