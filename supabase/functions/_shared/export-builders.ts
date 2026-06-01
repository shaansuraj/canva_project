import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import JSZip from "npm:jszip@3.10.1";

type UserRole = "admin" | "presenter" | "participant";

export type MeetingRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
  presenter_id: string;
  downloads_enabled: boolean;
};

export type ParticipantRow = {
  user_id: string;
  role_snapshot: UserRole;
  name_snapshot: string;
  designation_snapshot: string | null;
  joined_at: string;
  last_seen_at: string | null;
  left_at: string | null;
  is_present: boolean;
};

export type DocumentRow = {
  id: string;
  title: string;
  document_type: string;
};

export type PageRow = {
  id: string;
  document_id: string;
  page_number: number;
  width: number | null;
  height: number | null;
};

export type AnnotationRow = {
  id: string;
  document_id: string;
  page_id: string;
  user_id: string | null;
  user_name_snapshot: string;
  designation_snapshot: string | null;
  role_snapshot: UserRole;
  annotation_type: string;
  color: string;
  payload: Record<string, unknown>;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type AnnotationEventRow = {
  annotation_id: string | null;
  meeting_id: string;
  document_id: string;
  page_id: string;
  user_id: string | null;
  event_type: string;
  before_payload: unknown;
  after_payload: unknown;
  metadata: unknown;
  created_at: string;
};

export type NoteRow = {
  note: string;
  is_shared: boolean;
  created_at: string;
};

function csvValue(value: unknown) {
  const normalized = value == null ? "" : String(value);
  if (/[",\r\n]/.test(normalized)) return `"${normalized.replaceAll('"', '""')}"`;
  return normalized;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  return [headers.map(csvValue).join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\n");
}

function durationSeconds(participant: ParticipantRow) {
  const start = Date.parse(participant.joined_at);
  const end = Date.parse(participant.left_at ?? participant.last_seen_at ?? new Date().toISOString());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 1000);
}

export function createAttendanceCsv(participants: ParticipantRow[]) {
  const rows = participants.map((participant) => ({
    user_id: participant.user_id,
    name: participant.name_snapshot,
    designation: participant.designation_snapshot ?? "",
    role: participant.role_snapshot,
    joined_at: participant.joined_at,
    left_at: participant.left_at ?? "",
    last_seen_at: participant.last_seen_at ?? "",
    is_present: participant.is_present ? "true" : "false",
    duration_seconds: durationSeconds(participant)
  }));

  return toCsv(["user_id", "name", "designation", "role", "joined_at", "left_at", "last_seen_at", "is_present", "duration_seconds"], rows);
}

export function createAnnotationHistoryCsv(events: AnnotationEventRow[]) {
  const rows = events.map((event) => ({
    annotation_id: event.annotation_id ?? "",
    meeting_id: event.meeting_id,
    document_id: event.document_id,
    page_id: event.page_id,
    user_id: event.user_id ?? "",
    event_type: event.event_type,
    before_payload: JSON.stringify(event.before_payload ?? null),
    after_payload: JSON.stringify(event.after_payload ?? null),
    metadata: JSON.stringify(event.metadata ?? null),
    created_at: event.created_at
  }));

  return toCsv(["annotation_id", "meeting_id", "document_id", "page_id", "user_id", "event_type", "before_payload", "after_payload", "metadata", "created_at"], rows);
}

export function createUserReportCsv(annotations: AnnotationRow[]) {
  const grouped = new Map<string, { row: Record<string, unknown>; colors: Set<string> }>();

  for (const annotation of annotations) {
    const key = annotation.user_id ?? `${annotation.user_name_snapshot}-${annotation.role_snapshot}`;
    const existing =
      grouped.get(key) ??
      ({
        row: {
          user_id: annotation.user_id ?? "",
          user_name: annotation.user_name_snapshot,
          designation: annotation.designation_snapshot ?? "",
          role: annotation.role_snapshot,
          annotation_count: 0,
          deleted_count: 0,
          colors: ""
        },
        colors: new Set<string>()
      });

    existing.row.annotation_count = Number(existing.row.annotation_count) + 1;
    existing.row.deleted_count = Number(existing.row.deleted_count) + (annotation.is_deleted ? 1 : 0);
    existing.colors.add(annotation.color);
    grouped.set(key, existing);
  }

  const rows = [...grouped.values()].map((entry) => ({
    ...entry.row,
    colors: [...entry.colors].sort().join("|")
  }));

  return toCsv(["user_id", "user_name", "designation", "role", "annotation_count", "deleted_count", "colors"], rows);
}

export function createNotesText(notes: NoteRow[]) {
  if (notes.length === 0) return "No meeting notes recorded.";
  return notes
    .map((note, index) => {
      const visibility = note.is_shared ? "shared" : "private";
      return `#${index + 1} (${visibility}) ${new Date(note.created_at).toISOString()}\n${note.note.trim()}`;
    })
    .join("\n\n");
}

function hexToRgb(color: string) {
  const fallback = { r: 0.06, g: 0.3, b: 0.36 };
  const match = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!match) return fallback;
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255
  };
}

function numberPayload(payload: Record<string, unknown>, key: string, fallback = 0) {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pointsPayload(payload: Record<string, unknown>) {
  const points = payload.points;
  if (!Array.isArray(points)) return [];
  return points.filter((point): point is { x: number; y: number } => {
    if (!point || typeof point !== "object") return false;
    const candidate = point as Record<string, unknown>;
    return typeof candidate.x === "number" && typeof candidate.y === "number";
  });
}

function linePointsPayload(payload: Record<string, unknown>) {
  const points = payload.points;
  if (!Array.isArray(points) || points.length < 4) return null;
  const values = points.slice(0, 4);
  return values.every((value) => typeof value === "number") ? (values as [number, number, number, number]) : null;
}

export async function createAnnotatedPdf({
  meeting,
  documents,
  pages,
  annotations
}: {
  meeting: MeetingRow;
  documents: DocumentRow[];
  pages: PageRow[];
  annotations: AnnotationRow[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const docs = new Map(documents.map((document) => [document.id, document]));
  const activeAnnotations = annotations.filter((annotation) => !annotation.is_deleted);
  const pagesToRender = pages.length > 0 ? pages : [{ id: "summary", document_id: "", page_number: 1, width: 900, height: 650 }];

  for (const pageRow of pagesToRender) {
    const width = Math.max(360, Number(pageRow.width ?? 900));
    const height = Math.max(360, Number(pageRow.height ?? 650));
    const page = pdf.addPage([width, height]);
    const documentTitle = docs.get(pageRow.document_id)?.title ?? "Meeting annotations";

    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
    page.drawText(meeting.title, { x: 24, y: height - 32, size: 16, font: bold, color: rgb(0.06, 0.3, 0.36) });
    page.drawText(`${documentTitle} - page ${pageRow.page_number}`, { x: 24, y: height - 54, size: 10, font, color: rgb(0.25, 0.28, 0.32) });

    const pageAnnotations = activeAnnotations.filter((annotation) => annotation.page_id === pageRow.id);
    for (const annotation of pageAnnotations) {
      const color = hexToRgb(annotation.color);
      const pdfColor = rgb(color.r, color.g, color.b);
      const payload = annotation.payload;

      if (annotation.annotation_type === "pen" || annotation.annotation_type === "highlighter") {
        const points = pointsPayload(payload);
        const strokeWidth = numberPayload(payload, "strokeWidth", annotation.annotation_type === "highlighter" ? 8 : 3);
        for (let index = 1; index < points.length; index += 1) {
          page.drawLine({
            start: { x: points[index - 1].x, y: height - points[index - 1].y },
            end: { x: points[index].x, y: height - points[index].y },
            thickness: strokeWidth,
            color: pdfColor,
            opacity: annotation.annotation_type === "highlighter" ? 0.35 : 0.95
          });
        }
      }

      if (annotation.annotation_type === "text") {
        const text = String(payload.text ?? "");
        page.drawText(text, {
          x: numberPayload(payload, "x", 24),
          y: height - numberPayload(payload, "y", 48),
          size: numberPayload(payload, "fontSize", 16),
          font,
          color: pdfColor
        });
      }

      if (annotation.annotation_type === "rectangle") {
        const x = numberPayload(payload, "x");
        const y = numberPayload(payload, "y");
        const shapeWidth = numberPayload(payload, "width", 100);
        const shapeHeight = numberPayload(payload, "height", 80);
        page.drawRectangle({ x, y: height - y - shapeHeight, width: shapeWidth, height: shapeHeight, borderColor: pdfColor, borderWidth: 2 });
      }

      if (annotation.annotation_type === "circle") {
        const x = numberPayload(payload, "x");
        const y = numberPayload(payload, "y");
        const shapeWidth = numberPayload(payload, "width", 100);
        const shapeHeight = numberPayload(payload, "height", 80);
        page.drawEllipse({
          x: x + shapeWidth / 2,
          y: height - y - shapeHeight / 2,
          xScale: shapeWidth / 2,
          yScale: shapeHeight / 2,
          borderColor: pdfColor,
          borderWidth: 2
        });
      }

      if (annotation.annotation_type === "line" || annotation.annotation_type === "arrow") {
        const line = linePointsPayload(payload);
        if (line) {
          page.drawLine({
            start: { x: line[0], y: height - line[1] },
            end: { x: line[2], y: height - line[3] },
            thickness: numberPayload(payload, "strokeWidth", 3),
            color: pdfColor
          });
        }
      }
    }
  }

  return pdf.save();
}

export async function createArchiveZip(files: Record<string, string | Uint8Array>) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
