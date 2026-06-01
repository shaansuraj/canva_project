import { z } from "npm:zod@3.24.1";

import { createServiceClient, createUserClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createAnnotatedPdf,
  createAnnotationHistoryCsv,
  createNotesText,
  createUserReportCsv,
  type AnnotationEventRow,
  type AnnotationRow,
  type DocumentRow,
  type MeetingRow,
  type NoteRow,
  type PageRow
} from "../_shared/export-builders.ts";

const exportTypes = ["annotated_pdf", "notes", "annotation_history", "user_report"] as const;

const schema = z.object({
  meetingId: z.string().uuid(),
  exportType: z.enum(exportTypes)
});

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function extensionFor(exportType: (typeof exportTypes)[number]) {
  if (exportType === "annotated_pdf") return "pdf";
  if (exportType === "notes") return "txt";
  return "csv";
}

function contentTypeFor(exportType: (typeof exportTypes)[number]) {
  if (exportType === "annotated_pdf") return "application/pdf";
  if (exportType === "notes") return "text/plain";
  return "text/csv";
}

async function createTextOrPdfPayload({
  exportType,
  meeting,
  documents,
  pages,
  annotations,
  events,
  notes,
  sourceFiles
}: {
  exportType: (typeof exportTypes)[number];
  meeting: MeetingRow;
  documents: DocumentRow[];
  pages: PageRow[];
  annotations: AnnotationRow[];
  events: AnnotationEventRow[];
  notes: NoteRow[];
  sourceFiles?: Record<string, Uint8Array>;
}) {
  if (exportType === "annotated_pdf") {
    return await createAnnotatedPdf({ meeting, documents, pages, annotations, sourceFiles });
  }
  if (exportType === "notes") {
    return new TextEncoder().encode(createNotesText(notes));
  }
  if (exportType === "annotation_history") {
    return new TextEncoder().encode(createAnnotationHistoryCsv(events));
  }
  return new TextEncoder().encode(createUserReportCsv(annotations));
}

async function loadSourceFiles(serviceClient: ReturnType<typeof createServiceClient>, documents: DocumentRow[]) {
  const sourceFiles: Record<string, Uint8Array> = {};

  for (const document of documents) {
    if (!document.storage_path || (document.document_type !== "pdf" && document.document_type !== "image")) continue;
    const { data, error } = await serviceClient.storage.from("meeting-documents").download(document.storage_path);
    if (error || !data) continue;
    sourceFiles[document.id] = new Uint8Array(await data.arrayBuffer());
  }

  return sourceFiles;
}

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
    return jsonResponse({ error: "Export access is not allowed for this meeting." }, 403);
  }

  const { data: job } = await serviceClient
    .from("export_jobs")
    .insert({
      meeting_id: meeting.id,
      requested_by: user.id,
      export_type: parsed.data.exportType,
      status: "processing",
      metadata: { requestedRole: profile.role }
    })
    .select("*")
    .single();

  if (!job) return jsonResponse({ error: "Could not create export job." }, 500);

  try {
    const [{ data: documents }, { data: pages }, { data: annotations }, { data: events }, { data: notes }] = await Promise.all([
      serviceClient.from("meeting_documents").select("id, title, document_type, storage_path, mime_type").eq("meeting_id", meeting.id).order("created_at", { ascending: true }),
      serviceClient.from("document_pages").select("id, document_id, page_number, width, height").eq("meeting_id", meeting.id).order("page_number", { ascending: true }),
      serviceClient.from("annotations").select("*").eq("meeting_id", meeting.id).order("created_at", { ascending: true }),
      serviceClient.from("annotation_events").select("*").eq("meeting_id", meeting.id).order("created_at", { ascending: true }),
      serviceClient.from("meeting_notes").select("note, is_shared, created_at").eq("meeting_id", meeting.id).order("created_at", { ascending: true })
    ]);

    const exportNotes = isAdmin || isPresenterOwner ? (notes ?? []) : (notes ?? []).filter((note) => note.is_shared);
    const typedDocuments = (documents ?? []) as DocumentRow[];
    const sourceFiles = parsed.data.exportType === "annotated_pdf" ? await loadSourceFiles(serviceClient, typedDocuments) : undefined;
    const payload = await createTextOrPdfPayload({
      exportType: parsed.data.exportType,
      meeting,
      documents: typedDocuments,
      pages: (pages ?? []) as PageRow[],
      annotations: (annotations ?? []) as AnnotationRow[],
      events: (events ?? []) as AnnotationEventRow[],
      notes: exportNotes as NoteRow[],
      sourceFiles
    });

    const extension = extensionFor(parsed.data.exportType);
    const path = `${meeting.id}/${parsed.data.exportType}/${parsed.data.exportType}-${timestampSlug()}.${extension}`;
    const contentType = contentTypeFor(parsed.data.exportType);
    const { error: uploadError } = await serviceClient.storage.from("meeting-exports").upload(path, new Blob([payload], { type: contentType }), {
      contentType,
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
          documentCount: documents?.length ?? 0,
          pageCount: pages?.length ?? 0,
          annotationCount: annotations?.length ?? 0,
          eventCount: events?.length ?? 0,
          noteCount: exportNotes.length
        }
      })
      .eq("id", job.id);

    const { data: signed } = await serviceClient.storage.from("meeting-exports").createSignedUrl(path, 60 * 10);
    return jsonResponse({ jobId: job.id, status: "completed", storagePath: path, signedUrl: signed?.signedUrl ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export generation failed.";
    await serviceClient.from("export_jobs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", job.id);
    return jsonResponse({ jobId: job.id, status: "failed", error: message }, 500);
  }
});
