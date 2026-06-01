import { z } from "npm:zod@3.24.1";

import { createServiceClient, createUserClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createAnnotatedPdf,
  createAnnotationHistoryCsv,
  createArchiveZip,
  createAttendanceCsv,
  createNotesText,
  createUserReportCsv,
  type AnnotationEventRow,
  type AnnotationRow,
  type DocumentRow,
  type MeetingRow,
  type NoteRow,
  type PageRow,
  type ParticipantRow
} from "../_shared/export-builders.ts";

const schema = z.object({
  meetingId: z.string().uuid()
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return jsonResponse({ error: "Missing authorization header." }, 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ error: "Invalid request body.", issues: parsed.error.flatten() }, 400);

  const userClient = createUserClient(authorization);
  const serviceClient = createServiceClient();

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) return jsonResponse({ error: "Invalid or expired session." }, 401);

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile?.is_active) return jsonResponse({ error: "Active profile is required." }, 403);

  const { data: meeting } = await serviceClient
    .from("meetings")
    .select("id, code, title, description, status, presenter_id, downloads_enabled")
    .eq("id", parsed.data.meetingId)
    .single<MeetingRow>();

  if (!meeting) return jsonResponse({ error: "Meeting not found." }, 404);

  const { data: membership } = await serviceClient
    .from("meeting_participants")
    .select("id")
    .eq("meeting_id", meeting.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: participantPermission } = await serviceClient
    .from("participant_permissions")
    .select("can_download")
    .eq("meeting_id", meeting.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = profile.role === "admin";
  const isPresenterOwner = profile.role === "presenter" && meeting.presenter_id === user.id;
  const participantCanDownload =
    profile.role === "participant" && Boolean(membership) && (meeting.status === "completed" || meeting.downloads_enabled || participantPermission?.can_download === true);

  if (!isAdmin && !isPresenterOwner && !participantCanDownload) {
    return jsonResponse({ error: "Archive access is not allowed for this meeting." }, 403);
  }

  const { data: job } = await serviceClient
    .from("export_jobs")
    .insert({
      meeting_id: meeting.id,
      requested_by: user.id,
      export_type: "archive",
      status: "processing",
      metadata: { requestedRole: profile.role }
    })
    .select("*")
    .single();

  if (!job) return jsonResponse({ error: "Could not create archive job." }, 500);

  try {
    const [{ data: participants }, { data: documents }, { data: pages }, { data: annotations }, { data: events }, { data: notes }] = await Promise.all([
      serviceClient.from("meeting_participants").select("*").eq("meeting_id", meeting.id).order("joined_at", { ascending: true }),
      serviceClient.from("meeting_documents").select("id, title, document_type").eq("meeting_id", meeting.id).order("created_at", { ascending: true }),
      serviceClient.from("document_pages").select("id, document_id, page_number, width, height").eq("meeting_id", meeting.id).order("page_number", { ascending: true }),
      serviceClient.from("annotations").select("*").eq("meeting_id", meeting.id).order("created_at", { ascending: true }),
      serviceClient.from("annotation_events").select("*").eq("meeting_id", meeting.id).order("created_at", { ascending: true }),
      serviceClient.from("meeting_notes").select("note, is_shared, created_at").eq("meeting_id", meeting.id).order("created_at", { ascending: true })
    ]);

    const exportNotes = isAdmin || isPresenterOwner ? (notes ?? []) : (notes ?? []).filter((note) => note.is_shared);
    const typedDocuments = (documents ?? []) as DocumentRow[];
    const typedPages = (pages ?? []) as PageRow[];
    const typedAnnotations = (annotations ?? []) as AnnotationRow[];
    const typedEvents = (events ?? []) as AnnotationEventRow[];
    const typedParticipants = (participants ?? []) as ParticipantRow[];

    const annotatedPdf = await createAnnotatedPdf({
      meeting,
      documents: typedDocuments,
      pages: typedPages,
      annotations: typedAnnotations
    });
    const notesText = createNotesText(exportNotes as NoteRow[]);
    const annotationHistoryCsv = createAnnotationHistoryCsv(typedEvents);
    const annotationHistoryJson = JSON.stringify(typedEvents, null, 2);
    const userReportCsv = createUserReportCsv(typedAnnotations);
    const attendanceCsv = createAttendanceCsv(typedParticipants);
    const manifest = JSON.stringify(
      {
        meeting,
        generatedAt: new Date().toISOString(),
        requestedBy: user.id,
        requestedRole: profile.role,
        files: [
          "annotated.pdf",
          "meeting-notes.txt",
          "annotation-history.csv",
          "annotation-history.json",
          "user-wise-annotation-report.csv",
          "attendance.csv",
          "manifest.json"
        ]
      },
      null,
      2
    );

    const zipBytes = await createArchiveZip({
      "annotated.pdf": annotatedPdf,
      "meeting-notes.txt": notesText,
      "annotation-history.csv": annotationHistoryCsv,
      "annotation-history.json": annotationHistoryJson,
      "user-wise-annotation-report.csv": userReportCsv,
      "attendance.csv": attendanceCsv,
      "manifest.json": manifest
    });

    const path = `${meeting.id}/archive.zip`;
    const { error: uploadError } = await serviceClient.storage.from("meeting-archives").upload(path, new Blob([zipBytes], { type: "application/zip" }), {
      contentType: "application/zip",
      upsert: true
    });

    if (uploadError) throw uploadError;

    await serviceClient
      .from("export_jobs")
      .update({
        status: "completed",
        storage_path: path,
        completed_at: new Date().toISOString(),
        metadata: {
          requestedRole: profile.role,
          documentCount: typedDocuments.length,
          pageCount: typedPages.length,
          annotationCount: typedAnnotations.length,
          eventCount: typedEvents.length,
          attendanceCount: typedParticipants.length,
          noteCount: exportNotes.length
        }
      })
      .eq("id", job.id);

    const { data: signed } = await serviceClient.storage.from("meeting-archives").createSignedUrl(path, 60 * 10);
    return jsonResponse({ jobId: job.id, status: "completed", storagePath: path, signedUrl: signed?.signedUrl ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Archive generation failed.";
    await serviceClient.from("export_jobs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", job.id);
    return jsonResponse({ jobId: job.id, status: "failed", error: message }, 500);
  }
});
