import { describe, expect, it } from "vitest";

import { createAttendanceRows, createUserAnnotationReportRows, formatMeetingNotes, toCsv } from "@/lib/exports/formatters";
import type { Annotation, MeetingNote, MeetingParticipant } from "@/types/app";

describe("phase 5 export formatting", () => {
  it("escapes CSV values safely", () => {
    const csv = toCsv(["name", "note"], [{ name: "Alex", note: 'Needs "review", today' }]);

    expect(csv).toBe('name,note\nAlex,"Needs ""review"", today"');
  });

  it("formats meeting notes with visibility and timestamp", () => {
    const notes: MeetingNote[] = [
      {
        id: crypto.randomUUID(),
        meeting_id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        note: "Approve layout",
        is_shared: true,
        created_at: "2026-06-01T10:00:00.000Z",
        updated_at: "2026-06-01T10:00:00.000Z"
      }
    ];

    expect(formatMeetingNotes(notes)).toContain("#1 (shared) 2026-06-01T10:00:00.000Z");
    expect(formatMeetingNotes(notes)).toContain("Approve layout");
    expect(formatMeetingNotes([])).toBe("No meeting notes recorded.");
  });

  it("creates user-wise annotation report rows", () => {
    const userId = crypto.randomUUID();
    const baseAnnotation = {
      id: crypto.randomUUID(),
      meeting_id: crypto.randomUUID(),
      document_id: crypto.randomUUID(),
      page_id: crypto.randomUUID(),
      user_id: userId,
      user_name_snapshot: "Priya Rao",
      designation_snapshot: "Reviewer",
      role_snapshot: "participant" as const,
      annotation_type: "pen" as const,
      color: "#0f4c5c",
      payload: { points: [{ x: 1, y: 2 }] },
      version: 1,
      is_deleted: false,
      created_at: "2026-06-01T10:00:00.000Z",
      updated_at: "2026-06-01T10:00:00.000Z"
    } satisfies Annotation;

    const rows = createUserAnnotationReportRows([{ ...baseAnnotation }, { ...baseAnnotation, id: crypto.randomUUID(), color: "#ff0000", is_deleted: true }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId,
      userName: "Priya Rao",
      annotationCount: 2,
      deletedCount: 1,
      colors: "#0f4c5c|#ff0000"
    });
  });

  it("creates attendance rows with duration estimates", () => {
    const participant: MeetingParticipant = {
      id: crypto.randomUUID(),
      meeting_id: crypto.randomUUID(),
      user_id: crypto.randomUUID(),
      role_snapshot: "participant",
      name_snapshot: "Jordan Lee",
      designation_snapshot: "Designer",
      color_snapshot: "#0f4c5c",
      joined_at: "2026-06-01T10:00:00.000Z",
      last_seen_at: "2026-06-01T10:10:00.000Z",
      left_at: "2026-06-01T10:15:00.000Z",
      is_present: false
    };

    expect(createAttendanceRows([participant])[0]).toMatchObject({
      name: "Jordan Lee",
      duration_seconds: 900,
      is_present: "false"
    });
  });
});
