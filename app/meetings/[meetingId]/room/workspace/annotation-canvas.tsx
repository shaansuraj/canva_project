"use client";

import { useMemo, useState } from "react";
import { Arrow, Ellipse, Layer, Line, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";

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

function scalePoint(point: PointPayload, board: BoardSize) {
  return { x: point.x * board.scaleX, y: point.y * board.scaleY };
}

function getPointer(stage: Konva.Stage, board: BoardSize) {
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  return {
    x: Math.max(0, Math.min(pointer.x / board.scaleX, board.width / board.scaleX)),
    y: Math.max(0, Math.min(pointer.y / board.scaleY, board.height / board.scaleY))
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

export function AnnotationCanvas({
  annotations,
  board,
  tool,
  color,
  canAnnotate,
  onCreate,
  onDelete
}: AnnotationCanvasProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [startPoint, setStartPoint] = useState<PointPayload | null>(null);
  const drawableAnnotations = useMemo(() => annotations.filter((annotation) => !annotation.is_deleted), [annotations]);

  function handleStart(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!canAnnotate) return;
    const stage = event.target.getStage();
    if (!stage) return;
    const point = getPointer(stage, board);
    if (!point) return;

    if (tool === "eraser") return;

    if (tool === "text") {
      const text = window.prompt("Add annotation text");
      if (text?.trim()) {
        void onCreate("text", { x: point.x, y: point.y, text: text.trim(), fontSize: 16 }, color);
      }
      return;
    }

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

  function handleMove(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!canAnnotate || !draft || !startPoint) return;
    const stage = event.target.getStage();
    if (!stage) return;
    const point = getPointer(stage, board);
    if (!point) return;

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

  async function handleEnd() {
    if (!draft) return;

    const payload = draft.payload;
    setDraft(null);
    setStartPoint(null);

    if ((draft.type === "pen" || draft.type === "highlighter") && Array.isArray(payload.points) && payload.points.length < 2) return;
    if ((draft.type === "rectangle" || draft.type === "circle") && (Number(payload.width) < 4 || Number(payload.height) < 4)) return;

    const normalizedPayload =
      draft.type === "pen" || draft.type === "highlighter"
        ? { ...payload, points: serializePoints(payload.points as PointPayload[]) }
        : payload;

    await onCreate(draft.type, normalizedPayload, draft.color);
  }

  function commonProps(annotation: Annotation) {
    return {
      onClick: () => {
        if (tool === "eraser" && canAnnotate) void onDelete(annotation);
      },
      onTap: () => {
        if (tool === "eraser" && canAnnotate) void onDelete(annotation);
      }
    };
  }

  function renderAnnotation(annotation: Annotation, transient = false) {
    const payload = annotation.payload;
    const annotationColor = transient ? color : annotation.color;
    const key = transient ? "draft" : annotation.id;

    if (annotation.annotation_type === "pen" || annotation.annotation_type === "highlighter") {
      const points = ((payload.points as PointPayload[]) ?? []).flatMap((point) => {
        const scaled = scalePoint(point, board);
        return [scaled.x, scaled.y];
      });

      return (
        <Line
          key={key}
          points={points}
          stroke={annotationColor}
          strokeWidth={Number(payload.strokeWidth ?? 3) * Math.max(board.scaleX, board.scaleY)}
          opacity={Number(payload.opacity ?? 1)}
          lineCap="round"
          lineJoin="round"
          tension={0.35}
          hitStrokeWidth={18}
          {...commonProps(annotation)}
        />
      );
    }

    if (annotation.annotation_type === "text") {
      const point = scalePoint({ x: Number(payload.x ?? 0), y: Number(payload.y ?? 0) }, board);
      return (
        <Text
          key={key}
          x={point.x}
          y={point.y}
          text={String(payload.text ?? "")}
          fontSize={Number(payload.fontSize ?? 16) * board.scaleX}
          fill={annotationColor}
          fontStyle="bold"
          {...commonProps(annotation)}
        />
      );
    }

    if (annotation.annotation_type === "line" || annotation.annotation_type === "arrow") {
      const rawPoints = (payload.points as number[]) ?? [0, 0, 0, 0];
      const points = [rawPoints[0] * board.scaleX, rawPoints[1] * board.scaleY, rawPoints[2] * board.scaleX, rawPoints[3] * board.scaleY];
      const Comp = annotation.annotation_type === "arrow" ? Arrow : Line;
      return (
        <Comp
          key={key}
          points={points}
          stroke={annotationColor}
          fill={annotationColor}
          strokeWidth={Number(payload.strokeWidth ?? 3) * Math.max(board.scaleX, board.scaleY)}
          pointerLength={12}
          pointerWidth={12}
          hitStrokeWidth={18}
          {...commonProps(annotation)}
        />
      );
    }

    const x = Number(payload.x ?? 0) * board.scaleX;
    const y = Number(payload.y ?? 0) * board.scaleY;
    const width = Number(payload.width ?? 0) * board.scaleX;
    const height = Number(payload.height ?? 0) * board.scaleY;

    if (annotation.annotation_type === "circle") {
      return (
        <Ellipse
          key={key}
          x={x + width / 2}
          y={y + height / 2}
          radiusX={Math.abs(width / 2)}
          radiusY={Math.abs(height / 2)}
          stroke={annotationColor}
          strokeWidth={3}
          fill="transparent"
          {...commonProps(annotation)}
        />
      );
    }

    return (
      <Rect
        key={key}
        x={x}
        y={y}
        width={width}
        height={height}
        stroke={annotationColor}
        strokeWidth={3}
        fill="transparent"
        {...commonProps(annotation)}
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
    <Stage
      width={board.width}
      height={board.height}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={() => void handleEnd()}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={() => void handleEnd()}
      className={canAnnotate ? "cursor-crosshair" : "cursor-not-allowed"}
    >
      <Layer>
        {drawableAnnotations.map((annotation) => renderAnnotation(annotation))}
        {draftAnnotation ? renderAnnotation(draftAnnotation, true) : null}
        {!canAnnotate ? <Rect x={0} y={0} width={board.width} height={board.height} fill="rgba(255,255,255,0.02)" listening={false} /> : null}
      </Layer>
    </Stage>
  );
}
