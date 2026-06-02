"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { LocateFixed, ZoomIn, ZoomOut } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { DocumentPage, MeetingDocument } from "@/types/app";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export const INFINITE_WHITEBOARD_WIDTH = 12000;
export const INFINITE_WHITEBOARD_HEIGHT = 8000;

export type BoardSize = {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  infinite?: boolean;
  offsetX?: number;
  offsetY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
};

export type ViewportRequest = {
  topRatio?: number;
  leftRatio?: number;
  x?: number;
  y?: number;
  zoom?: number;
  nonce: number;
};

type WhiteboardViewport = {
  x: number;
  y: number;
  zoom: number;
};

const minWhiteboardZoom = 0.25;
const maxWhiteboardZoom = 2.5;

export function isGeneratedWhiteboardDocument(document: MeetingDocument | null | undefined) {
  return Boolean(
    document?.document_type === "image" &&
      document.mime_type === "image/svg+xml" &&
      document.original_filename.startsWith("whiteboard-")
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function clampZoom(value: number) {
  return clamp(value, minWhiteboardZoom, maxWhiteboardZoom);
}

function normalizeWhiteboardViewport(viewport: WhiteboardViewport) {
  return {
    zoom: clampZoom(viewport.zoom),
    x: Number.isFinite(viewport.x) ? viewport.x : 0,
    y: Number.isFinite(viewport.y) ? viewport.y : 0
  };
}

function whiteboardBoardSize(size: { width: number; height: number }, viewport: WhiteboardViewport, sourceWidth: number, sourceHeight: number): BoardSize {
  return {
    width: size.width,
    height: size.height,
    scaleX: viewport.zoom,
    scaleY: viewport.zoom,
    infinite: true,
    offsetX: viewport.x,
    offsetY: viewport.y,
    sourceWidth,
    sourceHeight
  };
}

function WhiteboardIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-900/10 bg-white/92 text-slate-950 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.85)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/40"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function DocumentRenderer({
  document,
  page,
  signedUrl,
  children,
  onSizeChange,
  onViewportChange,
  panEnabled,
  showWhiteboardControls = true,
  viewportRequest,
  className,
  frameClassName
}: {
  document: MeetingDocument;
  page: DocumentPage;
  signedUrl: string | null;
  children: React.ReactNode;
  onSizeChange: (size: BoardSize) => void;
  onViewportChange?: (size: BoardSize) => void;
  panEnabled?: boolean;
  showWhiteboardControls?: boolean;
  viewportRequest?: ViewportRequest | null;
  className?: string;
  frameClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isWhiteboard = isGeneratedWhiteboardDocument(document);
  const sourceWidth = isWhiteboard ? Math.max(Number(page.width ?? 0), INFINITE_WHITEBOARD_WIDTH) : page.width || 1200;
  const sourceHeight = isWhiteboard ? Math.max(Number(page.height ?? 0), INFINITE_WHITEBOARD_HEIGHT) : page.height || 800;
  const centeredWhiteboardRef = useRef<string | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; viewport: WhiteboardViewport } | null>(null);
  const [size, setSize] = useState(() => ({ width: sourceWidth, height: sourceHeight }));
  const [whiteboardViewport, setWhiteboardViewport] = useState<WhiteboardViewport>({ x: 0, y: 0, zoom: 1 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resize = () => {
      const availableWidth = Math.max(240, Math.floor(container.clientWidth));
      const availableHeight = Math.max(220, Math.floor(container.clientHeight || window.innerHeight * 0.7));
      if (isWhiteboard) {
        const nextSize = { width: availableWidth, height: availableHeight };
        setSize(nextSize);
        setWhiteboardViewport((current) => {
          const shouldCenter = centeredWhiteboardRef.current !== page.id;
          const initialZoom = clampZoom(Math.min(availableWidth / 1200, availableHeight / 780, 1));
          const next = shouldCenter
            ? {
                zoom: initialZoom,
                x: 0,
                y: 0
              }
            : current;
          centeredWhiteboardRef.current = page.id;
          return normalizeWhiteboardViewport(next);
        });
        return;
      }

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
  }, [isWhiteboard, page.id, sourceHeight, sourceWidth]);

  useEffect(() => {
    if (isWhiteboard) {
      onSizeChange(whiteboardBoardSize(size, whiteboardViewport, sourceWidth, sourceHeight));
      return;
    }

    onSizeChange({
      width: size.width,
      height: size.height,
      scaleX: size.width / sourceWidth,
      scaleY: size.height / sourceHeight,
      sourceWidth,
      sourceHeight
    });
  }, [isWhiteboard, onSizeChange, size, sourceHeight, sourceWidth, whiteboardViewport]);

  useEffect(() => {
    if (!isWhiteboard || !viewportRequest) return;

    const timeout = window.setTimeout(() => {
      setWhiteboardViewport((current) => {
        if (typeof viewportRequest.x === "number" && typeof viewportRequest.y === "number") {
          return normalizeWhiteboardViewport({
            x: viewportRequest.x,
            y: viewportRequest.y,
            zoom: typeof viewportRequest.zoom === "number" ? viewportRequest.zoom : current.zoom
          });
        }

        if (typeof viewportRequest.leftRatio === "number" && typeof viewportRequest.topRatio === "number") {
          const visibleWidth = size.width / current.zoom;
          const visibleHeight = size.height / current.zoom;
          return normalizeWhiteboardViewport({
            ...current,
            x: viewportRequest.leftRatio * Math.max(0, sourceWidth - visibleWidth),
            y: viewportRequest.topRatio * Math.max(0, sourceHeight - visibleHeight)
          });
        }

        return current;
      });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isWhiteboard, size, sourceHeight, sourceWidth, viewportRequest]);

  function commitWhiteboardViewport(next: WhiteboardViewport, options?: { broadcast?: boolean }) {
    const normalized = normalizeWhiteboardViewport(next);
    setWhiteboardViewport(normalized);
    if (options?.broadcast) onViewportChange?.(whiteboardBoardSize(size, normalized, sourceWidth, sourceHeight));
  }

  function zoomWhiteboard(nextZoom: number, center = { x: size.width / 2, y: size.height / 2 }) {
    const zoom = clampZoom(nextZoom);
    const centerX = whiteboardViewport.x + center.x / whiteboardViewport.zoom;
    const centerY = whiteboardViewport.y + center.y / whiteboardViewport.zoom;
    commitWhiteboardViewport(
      {
        zoom,
        x: centerX - center.x / zoom,
        y: centerY - center.y / zoom
      },
      { broadcast: true }
    );
  }

  function recenterWhiteboard() {
    const zoom = clampZoom(Math.min(size.width / 1200, size.height / 780, 1));
    commitWhiteboardViewport(
      {
        zoom,
        x: 0,
        y: 0
      },
      { broadcast: true }
    );
  }

  function handleWhiteboardWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!isWhiteboard) return;
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const rect = event.currentTarget.getBoundingClientRect();
      zoomWhiteboard(whiteboardViewport.zoom * (event.deltaY > 0 ? 0.88 : 1.12), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      return;
    }

    commitWhiteboardViewport(
      {
        ...whiteboardViewport,
        x: whiteboardViewport.x + event.deltaX / whiteboardViewport.zoom,
        y: whiteboardViewport.y + event.deltaY / whiteboardViewport.zoom
      },
      { broadcast: true }
    );
  }

  function handleWhiteboardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isWhiteboard || !panEnabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewport: whiteboardViewport };
  }

  function handleWhiteboardPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!isWhiteboard || !panEnabled || !pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    commitWhiteboardViewport(
      {
        ...pan.viewport,
        x: pan.viewport.x - (event.clientX - pan.x) / pan.viewport.zoom,
        y: pan.viewport.y - (event.clientY - pan.y) / pan.viewport.zoom
      },
      { broadcast: true }
    );
  }

  function handleWhiteboardPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
  }

  if (isWhiteboard) {
    const gridSize = 80 * whiteboardViewport.zoom;
    const fineGridSize = 20 * whiteboardViewport.zoom;
    const backgroundPosition = `${-whiteboardViewport.x * whiteboardViewport.zoom}px ${-whiteboardViewport.y * whiteboardViewport.zoom}px`;

    return (
      <div ref={containerRef} className={cn("flex h-full w-full items-center justify-center overflow-hidden", className)}>
        <div
          className={cn("relative h-full w-full overflow-hidden rounded-lg border border-white/70 bg-[#fffdf7] shadow-soft", panEnabled && "cursor-grab active:cursor-grabbing", frameClassName)}
          onPointerDown={handleWhiteboardPointerDown}
          onPointerMove={handleWhiteboardPointerMove}
          onPointerUp={handleWhiteboardPointerEnd}
          onPointerCancel={handleWhiteboardPointerEnd}
          onWheel={handleWhiteboardWheel}
          style={{
            backgroundImage:
              "linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(rgba(15,23,42,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.12) 1px, transparent 1px)",
            backgroundPosition,
            backgroundSize: `${fineGridSize}px ${fineGridSize}px, ${fineGridSize}px ${fineGridSize}px, ${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px`
          }}
        >
          <div className="absolute inset-0" style={{ width: size.width, height: size.height }}>
            {children}
          </div>
          {showWhiteboardControls ? (
            <div className="pointer-events-none absolute right-2 top-2 z-20 flex flex-col gap-1.5">
              <div className="pointer-events-auto flex flex-col gap-1.5 rounded-full border border-slate-900/10 bg-white/55 p-1 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.9)] backdrop-blur-xl">
                <WhiteboardIconButton label="Zoom in" onClick={() => zoomWhiteboard(whiteboardViewport.zoom * 1.16)}>
                  <ZoomIn className="h-4 w-4" aria-hidden="true" />
                </WhiteboardIconButton>
                <WhiteboardIconButton label="Zoom out" onClick={() => zoomWhiteboard(whiteboardViewport.zoom * 0.86)}>
                  <ZoomOut className="h-4 w-4" aria-hidden="true" />
                </WhiteboardIconButton>
                <WhiteboardIconButton label="Center whiteboard" onClick={recenterWhiteboard}>
                  <LocateFixed className="h-4 w-4" aria-hidden="true" />
                </WhiteboardIconButton>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

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
