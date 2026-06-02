"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { cn } from "@/lib/utils/cn";
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
  onSizeChange,
  className,
  frameClassName
}: {
  document: MeetingDocument;
  page: DocumentPage;
  signedUrl: string | null;
  children: React.ReactNode;
  onSizeChange: (size: BoardSize) => void;
  className?: string;
  frameClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceWidth = page.width || 1200;
  const sourceHeight = page.height || 800;
  const [size, setSize] = useState(() => ({ width: sourceWidth, height: sourceHeight }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resize = () => {
      const availableWidth = Math.max(240, Math.floor(container.clientWidth));
      const availableHeight = Math.max(220, Math.floor(container.clientHeight || window.innerHeight * 0.7));
      const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight, 1.6);
      setSize({
        width: Math.max(240, Math.floor(sourceWidth * scale)),
        height: Math.max(160, Math.floor(sourceHeight * scale))
      });
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onSizeChange({
      width: size.width,
      height: size.height,
      scaleX: size.width / sourceWidth,
      scaleY: size.height / sourceHeight
    });
  }, [onSizeChange, size.height, size.width, sourceHeight, sourceWidth]);

  return (
    <div ref={containerRef} className={cn("flex h-full w-full items-center justify-center overflow-hidden", className)}>
      <div
        className={cn("relative overflow-hidden rounded-lg border border-white/70 bg-white shadow-soft", frameClassName)}
        style={{ width: size.width, height: size.height }}
      >
        {!signedUrl ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            Preparing secure document preview...
          </div>
        ) : document.document_type === "pdf" ? (
          <Document
            file={signedUrl}
            loading={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading PDF...</div>}
            error={<div className="p-6 text-sm text-destructive">Could not render PDF preview.</div>}
          >
            <Page pageNumber={page.page_number} width={size.width} renderAnnotationLayer={false} renderTextLayer={false} />
          </Document>
        ) : document.document_type === "image" ? (
          <img alt={document.title} className="block h-full w-full select-none object-fill" draggable={false} src={signedUrl} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            {document.conversion_status === "failed"
              ? (document.conversion_error ?? "This Office file is saved, but conversion is not configured. Upload a PDF for immediate annotation.")
              : "This Office file is saved and needs conversion before annotation. Upload a PDF for immediate annotation."}
          </div>
        )}
        <div className="absolute inset-0" style={{ width: size.width, height: size.height }}>
          {children}
        </div>
      </div>
    </div>
  );
}
