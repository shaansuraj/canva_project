import { z } from "zod";

export const annotationToolSchema = z.enum(["pen", "highlighter", "text", "rectangle", "circle", "line", "arrow", "eraser"]);

export const pointSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const penPayloadSchema = z.object({
  points: z.array(pointSchema).min(1),
  strokeWidth: z.number().positive(),
  opacity: z.number().min(0).max(1)
});

export const textPayloadSchema = z.object({
  x: z.number(),
  y: z.number(),
  text: z.string().min(1),
  fontSize: z.number().positive()
});

export const shapePayloadSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0)
});

export const linePayloadSchema = z.object({
  points: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  strokeWidth: z.number().positive()
});

export type AnnotationTool = z.infer<typeof annotationToolSchema>;
export type PointPayload = z.infer<typeof pointSchema>;
export type PenPayload = z.infer<typeof penPayloadSchema>;
export type TextPayload = z.infer<typeof textPayloadSchema>;
export type ShapePayload = z.infer<typeof shapePayloadSchema>;
export type LinePayload = z.infer<typeof linePayloadSchema>;

export function serializePoints(points: PointPayload[]) {
  return points.map((point) => ({ x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 }));
}

export function isDrawableTool(tool: AnnotationTool) {
  return tool !== "eraser";
}
