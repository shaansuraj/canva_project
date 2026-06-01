"use client";

import { useMemo, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import type { BoardSize } from "./document-renderer";
import { serializePoints, type AnnotationTool, type PointPayload } from "@/lib/validation/annotations";
import type { Annotation } from "@/types/app";

type Draft = {
  type: AnnotationTool;
  color: string;
  payload: Record<string, unknown>;
};

export type AnnotationCanvasProps = {
  annotations: Annotation[];
  board: BoardSize;
  tool: AnnotationTool;
  color: string;
  canAnnotate: boolean;
  onCreate: (type: AnnotationTool, payload: Record<string, unknown>, color: string) => Promise<void>;
  onDelete: (annotation: Annotation) => Promise<void>;
};

function safeScale(value: number) {
  return Math.max(value, 0.0001);
}

function sourceWidth(board: BoardSize) {
  return board.width / safeScale(board.scaleX);
}

function sourceHeight(board: BoardSize) {
  return board.height / safeScale(board.scaleY);
}

function scalePoint(point: PointPayload, board: BoardSize) {
  return { x: point.x * board.scaleX, y: point.y * board.scaleY };
}

function pointerToSourcePoint(event: ReactPointerEvent<SVGSVGElement>, board: BoardSize) {
  const rect = event.currentTarget.getBoundingClientRect();
  const displayX = ((event.clientX - rect.left) / safeScale(rect.width)) * board.width;
  const displayY = ((event.clientY - rect.top) / safeScale(rect.height)) * board.height;

  return {
    x: Math.max(0, Math.min(displayX / safeScale(board.scaleX), sourceWidth(board))),
    y: Math.max(0, Math.min(displayY / safeScale(board.scaleY), sourceHeight(board)))
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
  const start = { x: x1 * board.scaleX, y: y1 * board.scaleY };
  const end = { x: x2 * board.scaleX, y: y2 * board.scaleY };
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

export function AnnotationCanvas({ annotations, board, tool, color, canAnnotate, onCreate, onDelete }: AnnotationCanvasProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [startPoint, setStartPoint] = useState<PointPayload | null>(null);
  const [activePointerId, setActivePointerId] = useState<number | null>(null);
  const drawableAnnotations = useMemo(() => annotations.filter((annotation) => !annotation.is_deleted), [annotations]);
  const svgClassName = canAnnotate ? "block touch-none cursor-crosshair select-none" : "block cursor-not-allowed select-none";

  function handleStart(event: ReactPointerEvent<SVGSVGElement>) {
    if (!canAnnotate) return;
    event.preventDefault();

    const point = pointerToSourcePoint(event, board);

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
      setDraft({
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
      setDraft({ type: tool, color, payload: { points: [point.x, point.y, point.x, point.y], strokeWidth: 3 } });
      return;
    }

    setDraft({ type: tool, color, payload: { x: point.x, y: point.y, width: 0, height: 0, rotation: 0 } });
  }

  function handleMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!canAnnotate || !draft || !startPoint || activePointerId !== event.pointerId) return;
    event.preventDefault();

    const point = pointerToSourcePoint(event, board);

    if (draft.type === "pen" || draft.type === "highlighter") {
      const points = (draft.payload.points as PointPayload[]) ?? [];
      setDraft({ ...draft, payload: { ...draft.payload, points: [...points, point] } });
      return;
    }

    if (draft.type === "line" || draft.type === "arrow") {
      setDraft({ ...draft, payload: { ...draft.payload, points: [startPoint.x, startPoint.y, point.x, point.y] } });
      return;
    }

    setDraft({ ...draft, payload: normalizeBox(startPoint, point) });
  }

  async function finishDraft() {
    if (!draft) return;

    const payload = draft.payload;
    const draftType = draft.type;
    const draftColor = draft.color;
    setDraft(null);
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
    const annotationColor = transient ? color : annotation.color;
    const key = transient ? "draft" : annotation.id;
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
      const x1 = rawPoints[0] * board.scaleX;
      const y1 = rawPoints[1] * board.scaleY;
      const x2 = rawPoints[2] * board.scaleX;
      const y2 = rawPoints[3] * board.scaleY;

      return (
        <g key={key} {...commonProps}>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={annotationColor}
            strokeWidth={scaledStrokeWidth(payload, board)}
            strokeLinecap="round"
          />
          {annotation.annotation_type === "arrow" ? <polygon points={arrowHeadPoints(rawPoints, board)} fill={annotationColor} /> : null}
        </g>
      );
    }

    const x = Number(payload.x ?? 0) * board.scaleX;
    const y = Number(payload.y ?? 0) * board.scaleY;
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

  const draftAnnotation: Annotation | null = draft
    ? {
        id: "draft",
        meeting_id: "draft",
        document_id: "draft",
        page_id: "draft",
        user_id: null,
        user_name_snapshot: "draft",
        designation_snapshot: null,
        role_snapshot: "participant",
        annotation_type: draft.type,
        color: draft.color,
        payload: draft.payload,
        version: 1,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    : null;

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
    >
      {drawableAnnotations.map((annotation) => renderAnnotation(annotation))}
      {draftAnnotation ? renderAnnotation(draftAnnotation, true) : null}
      {!canAnnotate ? <rect x={0} y={0} width={board.width} height={board.height} fill="rgba(255,255,255,0.02)" pointerEvents="none" /> : null}
    </svg>
  );
}
