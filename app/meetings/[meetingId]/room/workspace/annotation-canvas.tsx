"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import type { BoardSize } from "./document-renderer";
import { serializePoints, type AnnotationTool, type PointPayload } from "@/lib/validation/annotations";
import type { Annotation } from "@/types/app";

type Draft = {
  id: string;
  type: AnnotationTool;
  color: string;
  payload: Record<string, unknown>;
};

export type AnnotationDraftPreview = {
  id: string;
  sourceUserId: string;
  pageId: string;
  type: AnnotationTool;
  color: string;
  payload: Record<string, unknown>;
  updatedAt: string;
};

export type AnnotationCanvasProps = {
  annotations: Annotation[];
  remoteDrafts?: AnnotationDraftPreview[];
  board: BoardSize;
  tool: AnnotationTool;
  color: string;
  canAnnotate: boolean;
  onCreate: (type: AnnotationTool, payload: Record<string, unknown>, color: string) => Promise<void>;
  onDelete: (annotation: Annotation) => Promise<void>;
  onDraftChange?: (draft: Omit<AnnotationDraftPreview, "sourceUserId" | "pageId" | "updatedAt"> | null) => void;
};

function safeScale(value: number) {
  return Math.max(value, 0.0001);
}

function sourceWidth(board: BoardSize) {
  return board.sourceWidth ?? board.width / safeScale(board.scaleX);
}

function sourceHeight(board: BoardSize) {
  return board.sourceHeight ?? board.height / safeScale(board.scaleY);
}

function offsetX(board: BoardSize) {
  return board.offsetX ?? 0;
}

function offsetY(board: BoardSize) {
  return board.offsetY ?? 0;
}

function isInfiniteBoard(board: BoardSize) {
  return board.infinite ?? false;
}

function scalePoint(point: PointPayload, board: BoardSize) {
  return { x: (point.x - offsetX(board)) * board.scaleX, y: (point.y - offsetY(board)) * board.scaleY };
}

function pointerToSourcePoint(event: ReactPointerEvent<SVGSVGElement>, board: BoardSize) {
  const rect = event.currentTarget.getBoundingClientRect();
  const displayX = ((event.clientX - rect.left) / safeScale(rect.width)) * board.width;
  const displayY = ((event.clientY - rect.top) / safeScale(rect.height)) * board.height;

  const x = offsetX(board) + displayX / safeScale(board.scaleX);
  const y = offsetY(board) + displayY / safeScale(board.scaleY);

  if (isInfiniteBoard(board)) return { x, y };

  return {
    x: Math.max(0, Math.min(x, sourceWidth(board))),
    y: Math.max(0, Math.min(y, sourceHeight(board)))
  };
}

function normalizeBox(start: PointPayload, end: PointPayload) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    rotation: 0
  };
}

function polylinePoints(points: PointPayload[], board: BoardSize) {
  return points
    .map((point) => scalePoint(point, board))
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

function scaledStrokeWidth(payload: Record<string, unknown>, board: BoardSize, fallback = 3) {
  return Number(payload.strokeWidth ?? fallback) * Math.max(board.scaleX, board.scaleY);
}

function getArrowHead(rawPoints: number[], board: BoardSize) {
  const [x1, y1, x2, y2] = rawPoints;
  const start = scalePoint({ x: x1, y: y1 }, board);
  const end = scalePoint({ x: x2, y: y2 }, board);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = 14;
  const wing = Math.PI / 7;

  return [
    end,
    { x: end.x - size * Math.cos(angle - wing), y: end.y - size * Math.sin(angle - wing) },
    { x: end.x - size * Math.cos(angle + wing), y: end.y - size * Math.sin(angle + wing) }
  ];
}

function arrowHeadPoints(rawPoints: number[], board: BoardSize) {
  return getArrowHead(rawPoints, board)
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

function createDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AnnotationCanvas({ annotations, remoteDrafts = [], board, tool, color, canAnnotate, onCreate, onDelete, onDraftChange }: AnnotationCanvasProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [startPoint, setStartPoint] = useState<PointPayload | null>(null);
  const [activePointerId, setActivePointerId] = useState<number | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const drawableAnnotations = useMemo(() => annotations.filter((annotation) => !annotation.is_deleted), [annotations]);
  const svgClassName = canAnnotate ? "block touch-none cursor-crosshair select-none" : "block touch-none cursor-default select-none";

  function setActiveDraft(nextDraft: Draft | null) {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    onDraftChange?.(
      nextDraft
        ? {
            id: nextDraft.id,
            type: nextDraft.type,
            color: nextDraft.color,
            payload: nextDraft.payload
          }
        : null
    );
  }

  function handleStart(event: ReactPointerEvent<SVGSVGElement>) {
    if (!canAnnotate) return;
    event.preventDefault();

    const point = pointerToSourcePoint(event, board);
    const id = createDraftId();

    if (tool === "eraser") return;

    if (tool === "text") {
      const text = window.prompt("Add annotation text");
      if (text?.trim()) {
        void onCreate("text", { x: point.x, y: point.y, text: text.trim(), fontSize: 16 }, color);
      }
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setActivePointerId(event.pointerId);
    setStartPoint(point);

    if (tool === "pen" || tool === "highlighter") {
      setActiveDraft({
        id,
        type: tool,
        color,
        payload: {
          points: [point],
          strokeWidth: tool === "highlighter" ? 12 : 3,
          opacity: tool === "highlighter" ? 0.35 : 1
        }
      });
      return;
    }

    if (tool === "line" || tool === "arrow") {
      setActiveDraft({ id, type: tool, color, payload: { points: [point.x, point.y, point.x, point.y], strokeWidth: 3 } });
      return;
    }

    setActiveDraft({ id, type: tool, color, payload: { x: point.x, y: point.y, width: 0, height: 0, rotation: 0 } });
  }

  function handleMove(event: ReactPointerEvent<SVGSVGElement>) {
    const currentDraft = draftRef.current ?? draft;
    if (!canAnnotate || !currentDraft || !startPoint || activePointerId !== event.pointerId) return;
    event.preventDefault();

    const point = pointerToSourcePoint(event, board);

    if (currentDraft.type === "pen" || currentDraft.type === "highlighter") {
      const points = (currentDraft.payload.points as PointPayload[]) ?? [];
      setActiveDraft({ ...currentDraft, payload: { ...currentDraft.payload, points: [...points, point] } });
      return;
    }

    if (currentDraft.type === "line" || currentDraft.type === "arrow") {
      setActiveDraft({ ...currentDraft, payload: { ...currentDraft.payload, points: [startPoint.x, startPoint.y, point.x, point.y] } });
      return;
    }

    setActiveDraft({ ...currentDraft, payload: normalizeBox(startPoint, point) });
  }

  async function finishDraft() {
    const currentDraft = draftRef.current ?? draft;
    if (!currentDraft) return;

    const payload = currentDraft.payload;
    const draftType = currentDraft.type;
    const draftColor = currentDraft.color;
    setActiveDraft(null);
    setStartPoint(null);
    setActivePointerId(null);

    if ((draftType === "pen" || draftType === "highlighter") && Array.isArray(payload.points) && payload.points.length < 2) return;
    if ((draftType === "rectangle" || draftType === "circle") && (Number(payload.width) < 4 || Number(payload.height) < 4)) return;

    const normalizedPayload =
      draftType === "pen" || draftType === "highlighter"
        ? { ...payload, points: serializePoints(payload.points as PointPayload[]) }
        : payload;

    await onCreate(draftType, normalizedPayload, draftColor);
  }

  function handleEnd(event: ReactPointerEvent<SVGSVGElement>) {
    if (activePointerId !== null && activePointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    void finishDraft();
  }

  function deleteWithEraser(annotation: Annotation) {
    if (tool === "eraser" && canAnnotate) void onDelete(annotation);
  }

  function handleEraserKey(event: KeyboardEvent<SVGElement>, annotation: Annotation) {
    if ((event.key === "Enter" || event.key === " ") && tool === "eraser" && canAnnotate) {
      event.preventDefault();
      void onDelete(annotation);
    }
  }

  function erasableProps(annotation: Annotation, transient: boolean) {
    const erasable = !transient && tool === "eraser" && canAnnotate;

    return {
      role: erasable ? "button" : undefined,
      tabIndex: erasable ? 0 : undefined,
      pointerEvents: erasable ? "visiblePainted" : "none",
      onPointerDown: (event: ReactPointerEvent<SVGElement>) => {
        if (!erasable) return;
        event.preventDefault();
        event.stopPropagation();
        deleteWithEraser(annotation);
      },
      onKeyDown: (event: KeyboardEvent<SVGElement>) => handleEraserKey(event, annotation)
    };
  }

  function renderAnnotation(annotation: Annotation, transient = false): ReactNode {
    const payload = annotation.payload;
    const annotationColor = annotation.color;
    const key = annotation.id;
    const commonProps = erasableProps(annotation, transient);

    if (annotation.annotation_type === "pen" || annotation.annotation_type === "highlighter") {
      const points = polylinePoints((payload.points as PointPayload[]) ?? [], board);

      return (
        <polyline
          key={key}
          points={points}
          fill="none"
          stroke={annotationColor}
          strokeWidth={scaledStrokeWidth(payload, board)}
          opacity={Number(payload.opacity ?? 1)}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...commonProps}
        />
      );
    }

    if (annotation.annotation_type === "text") {
      const point = scalePoint({ x: Number(payload.x ?? 0), y: Number(payload.y ?? 0) }, board);
      return (
        <text
          key={key}
          x={point.x}
          y={point.y}
          fill={annotationColor}
          fontSize={Number(payload.fontSize ?? 16) * board.scaleX}
          fontWeight={800}
          dominantBaseline="hanging"
          {...commonProps}
        >
          {String(payload.text ?? "")}
        </text>
      );
    }

    if (annotation.annotation_type === "line" || annotation.annotation_type === "arrow") {
      const rawPoints = (payload.points as number[]) ?? [0, 0, 0, 0];
      const start = scalePoint({ x: rawPoints[0], y: rawPoints[1] }, board);
      const end = scalePoint({ x: rawPoints[2], y: rawPoints[3] }, board);

      return (
        <g key={key} {...commonProps}>
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={annotationColor}
            strokeWidth={scaledStrokeWidth(payload, board)}
            strokeLinecap="round"
          />
          {annotation.annotation_type === "arrow" ? <polygon points={arrowHeadPoints(rawPoints, board)} fill={annotationColor} /> : null}
        </g>
      );
    }

    const point = scalePoint({ x: Number(payload.x ?? 0), y: Number(payload.y ?? 0) }, board);
    const x = point.x;
    const y = point.y;
    const width = Number(payload.width ?? 0) * board.scaleX;
    const height = Number(payload.height ?? 0) * board.scaleY;
    const erasableFill = tool === "eraser" && canAnnotate ? "rgba(255,255,255,0.001)" : "none";

    if (annotation.annotation_type === "circle") {
      return (
        <ellipse
          key={key}
          cx={x + width / 2}
          cy={y + height / 2}
          rx={Math.abs(width / 2)}
          ry={Math.abs(height / 2)}
          stroke={annotationColor}
          strokeWidth={3}
          fill={erasableFill}
          {...commonProps}
        />
      );
    }

    return (
      <rect
        key={key}
        x={x}
        y={y}
        width={width}
        height={height}
        stroke={annotationColor}
        strokeWidth={3}
        fill={erasableFill}
        {...commonProps}
      />
    );
  }

  const draftAnnotations: Annotation[] = [
    ...(draft
      ? [
          {
            id: draft.id,
            meeting_id: "draft",
            document_id: "draft",
            page_id: "draft",
            user_id: null,
            user_name_snapshot: "draft",
            designation_snapshot: null,
            role_snapshot: "participant" as const,
            annotation_type: draft.type,
            color: draft.color,
            payload: draft.payload,
            version: 1,
            is_deleted: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      : []),
    ...remoteDrafts.map((remoteDraft) => ({
      id: remoteDraft.id,
      meeting_id: "draft",
      document_id: "draft",
      page_id: remoteDraft.pageId,
      user_id: remoteDraft.sourceUserId,
      user_name_snapshot: "remote draft",
      designation_snapshot: null,
      role_snapshot: "participant" as const,
      annotation_type: remoteDraft.type,
      color: remoteDraft.color,
      payload: remoteDraft.payload,
      version: 1,
      is_deleted: false,
      created_at: remoteDraft.updatedAt,
      updated_at: remoteDraft.updatedAt
    }))
  ];

  return (
    <svg
      width={board.width}
      height={board.height}
      viewBox={`0 0 ${board.width} ${board.height}`}
      className={svgClassName}
      aria-label="Annotation canvas"
      onPointerDown={handleStart}
      onPointerMove={handleMove}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
      style={{ touchAction: "none" }}
    >
      {drawableAnnotations.map((annotation) => renderAnnotation(annotation))}
      {draftAnnotations.map((annotation) => renderAnnotation(annotation, true))}
      {!canAnnotate ? <rect x={0} y={0} width={board.width} height={board.height} fill="rgba(255,255,255,0.02)" pointerEvents="none" /> : null}
    </svg>
  );
}
