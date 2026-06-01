import { estimateAttendanceDurationSeconds } from "@/lib/attendance/duration";
import type { Annotation, AnnotationEventType, MeetingNote, MeetingParticipant, UserRole } from "@/types/app";

export type AnnotationHistoryRow = {
  annotationId: string | null;
  meetingId: string;
  documentId: string;
  pageId: string;
  userId: string | null;
  eventType: AnnotationEventType;
  createdAt: string;
  beforePayload: string;
  afterPayload: string;
};

export type UserAnnotationReportRow = {
  userId: string | null;
  userName: string;
  designation: string | null;
  role: UserRole;
  annotationCount: number;
  deletedCount: number;
  colors: string;
};

function stringifyCsvValue(value: unknown) {
  const normalized = value == null ? "" : String(value);
  if (/[",\r\n]/.test(normalized)) return `"${normalized.replaceAll('"', '""')}"`;
  return normalized;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  return [
    headers.map(stringifyCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => stringifyCsvValue(row[header])).join(","))
  ].join("\n");
}

export function formatMeetingNotes(notes: MeetingNote[]) {
  if (notes.length === 0) return "No meeting notes recorded.";

  return notes
    .map((note, index) => {
      const visibility = note.is_shared ? "shared" : "private";
      return `#${index + 1} (${visibility}) ${new Date(note.created_at).toISOString()}\n${note.note.trim()}`;
    })
    .join("\n\n");
}

export function createAttendanceRows(participants: MeetingParticipant[]) {
  return participants.map((participant) => ({
    user_id: participant.user_id,
    name: participant.name_snapshot,
    designation: participant.designation_snapshot ?? "",
    role: participant.role_snapshot,
    joined_at: participant.joined_at,
    left_at: participant.left_at ?? "",
    last_seen_at: participant.last_seen_at ?? "",
    is_present: participant.is_present ? "true" : "false",
    duration_seconds: estimateAttendanceDurationSeconds(participant)
  }));
}

export function createUserAnnotationReportRows(annotations: Annotation[]): UserAnnotationReportRow[] {
  const grouped = new Map<string, UserAnnotationReportRow & { colorSet: Set<string> }>();

  for (const annotation of annotations) {
    const key = annotation.user_id ?? `${annotation.user_name_snapshot}-${annotation.role_snapshot}`;
    const existing =
      grouped.get(key) ??
      ({
        userId: annotation.user_id,
        userName: annotation.user_name_snapshot,
        designation: annotation.designation_snapshot,
        role: annotation.role_snapshot,
        annotationCount: 0,
        deletedCount: 0,
        colors: "",
        colorSet: new Set<string>()
      } satisfies UserAnnotationReportRow & { colorSet: Set<string> });

    existing.annotationCount += 1;
    if (annotation.is_deleted) existing.deletedCount += 1;
    existing.colorSet.add(annotation.color);
    grouped.set(key, existing);
  }

  return [...grouped.values()].map(({ colorSet, ...row }) => ({
    ...row,
    colors: [...colorSet].sort().join("|")
  }));
}
