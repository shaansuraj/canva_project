import { z } from "npm:zod@3.24.1";

import { createServiceClient, createUserClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const annotationTypeSchema = z.enum(["pen", "highlighter", "text", "rectangle", "circle", "line", "arrow", "eraser"]);

const listSchema = z.object({
  action: z.literal("list"),
  meetingId: z.string().uuid()
});

const createSchema = z.object({
  action: z.literal("create"),
  meetingId: z.string().uuid(),
  documentId: z.string().uuid(),
  pageId: z.string().uuid(),
  annotationType: annotationTypeSchema,
  color: z.string().min(1).max(32),
  payload: z.record(z.string(), z.unknown())
});

const updateSchema = z.object({
  action: z.literal("update"),
  annotationId: z.string().uuid(),
  color: z.string().min(1).max(32).optional(),
  payload: z.record(z.string(), z.unknown()).optional()
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  annotationId: z.string().uuid()
});

const clearSchema = z.object({
  action: z.literal("clear"),
  meetingId: z.string().uuid(),
  documentId: z.string().uuid(),
  pageId: z.string().uuid()
});

const schema = z.discriminatedUnion("action", [listSchema, createSchema, updateSchema, deleteSchema, clearSchema]);

type Profile = {
  id: string;
  role: "admin" | "presenter" | "participant";
  is_active: boolean;
  full_name: string;
  designation: string | null;
};

type Meeting = {
  id: string;
  presenter_id: string;
  status: string;
  participant_annotation_enabled: boolean;
  document_locked: boolean;
};

async function getSessionProfile(authorization: string) {
  const userClient = createUserClient(authorization);
  const serviceClient = createServiceClient();
  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) return { error: "Invalid or expired session.", status: 401 } as const;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, role, is_active, full_name, designation")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile?.is_active) return { error: "Active profile is required.", status: 403 } as const;

  return { user, profile, serviceClient } as const;
}

async function getMeeting(serviceClient: ReturnType<typeof createServiceClient>, meetingId: string) {
  const { data: meeting } = await serviceClient
    .from("meetings")
    .select("id, presenter_id, status, participant_annotation_enabled, document_locked")
    .eq("id", meetingId)
    .single<Meeting>();

  return meeting ?? null;
}

async function getMembership(serviceClient: ReturnType<typeof createServiceClient>, meetingId: string, userId: string) {
  const { data } = await serviceClient
    .from("meeting_participants")
    .select("id, is_present")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .maybeSingle();

  return data ?? null;
}

async function canReadMeeting(serviceClient: ReturnType<typeof createServiceClient>, profile: Profile, meeting: Meeting) {
  if (profile.role === "admin") return true;
  if (profile.role === "presenter" && meeting.presenter_id === profile.id) return true;
  return Boolean(await getMembership(serviceClient, meeting.id, profile.id));
}

async function documentPageBelongsToMeeting(serviceClient: ReturnType<typeof createServiceClient>, meetingId: string, documentId: string, pageId: string) {
  const { data } = await serviceClient
    .from("document_pages")
    .select("id, meeting_id, document_id")
    .eq("id", pageId)
    .eq("meeting_id", meetingId)
    .eq("document_id", documentId)
    .maybeSingle();

  return Boolean(data);
}

async function canAnnotate(serviceClient: ReturnType<typeof createServiceClient>, profile: Profile, meeting: Meeting) {
  if (meeting.document_locked) return false;
  if (profile.role === "presenter" && meeting.presenter_id === profile.id) return true;
  if (profile.role !== "participant" || meeting.status !== "live" || !meeting.participant_annotation_enabled) return false;

  const membership = await getMembership(serviceClient, meeting.id, profile.id);
  if (!membership?.is_present) return false;

  const { data: permission } = await serviceClient
    .from("participant_permissions")
    .select("can_annotate, is_muted_from_annotation")
    .eq("meeting_id", meeting.id)
    .eq("user_id", profile.id)
    .maybeSingle();

  return (permission?.can_annotate ?? true) && !(permission?.is_muted_from_annotation ?? false);
}

async function canMutateAnnotation(serviceClient: ReturnType<typeof createServiceClient>, profile: Profile, annotation: { user_id: string | null; meeting_id: string }) {
  if (annotation.user_id === profile.id) return true;
  const meeting = await getMeeting(serviceClient, annotation.meeting_id);
  return Boolean(meeting && profile.role === "presenter" && meeting.presenter_id === profile.id);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return jsonResponse({ error: "Missing authorization header." }, 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ error: "Invalid request body.", issues: parsed.error.flatten() }, 400);

  const session = await getSessionProfile(authorization);
  if ("error" in session) return jsonResponse({ error: session.error }, session.status);

  const { profile, serviceClient } = session;

  try {
    if (parsed.data.action === "list") {
      const meeting = await getMeeting(serviceClient, parsed.data.meetingId);
      if (!meeting) return jsonResponse({ error: "Meeting not found." }, 404);
      if (!(await canReadMeeting(serviceClient, profile, meeting))) return jsonResponse({ error: "Meeting access is not allowed." }, 403);

      const { data, error } = await serviceClient
        .from("annotations")
        .select("*")
        .eq("meeting_id", meeting.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return jsonResponse({ annotations: data ?? [] });
    }

    if (parsed.data.action === "create") {
      const meeting = await getMeeting(serviceClient, parsed.data.meetingId);
      if (!meeting) return jsonResponse({ error: "Meeting not found." }, 404);
      if (!(await documentPageBelongsToMeeting(serviceClient, meeting.id, parsed.data.documentId, parsed.data.pageId))) {
        return jsonResponse({ error: "Document page does not belong to this meeting." }, 400);
      }
      if (!(await canAnnotate(serviceClient, profile, meeting))) return jsonResponse({ error: "You are not allowed to annotate right now." }, 403);

      const { data: annotation, error } = await serviceClient
        .from("annotations")
        .insert({
          meeting_id: meeting.id,
          document_id: parsed.data.documentId,
          page_id: parsed.data.pageId,
          user_id: profile.id,
          user_name_snapshot: profile.full_name,
          designation_snapshot: profile.designation,
          role_snapshot: profile.role,
          annotation_type: parsed.data.annotationType,
          color: parsed.data.color,
          payload: parsed.data.payload
        })
        .select("*")
        .single();

      if (error || !annotation) throw error ?? new Error("Annotation could not be created.");

      const { error: eventError } = await serviceClient.from("annotation_events").insert({
        annotation_id: annotation.id,
        meeting_id: meeting.id,
        document_id: parsed.data.documentId,
        page_id: parsed.data.pageId,
        user_id: profile.id,
        event_type: "created",
        after_payload: annotation.payload,
        metadata: {
          userName: profile.full_name,
          designation: profile.designation,
          role: profile.role,
          annotationType: parsed.data.annotationType,
          color: parsed.data.color
        }
      });
      if (eventError) throw eventError;

      return jsonResponse({ annotation });
    }

    if (parsed.data.action === "update") {
      const { data: existing } = await serviceClient.from("annotations").select("*").eq("id", parsed.data.annotationId).single();
      if (!existing) return jsonResponse({ error: "Annotation not found." }, 404);
      if (!(await canMutateAnnotation(serviceClient, profile, existing))) return jsonResponse({ error: "Annotation update is not allowed." }, 403);

      const patch = {
        color: parsed.data.color ?? existing.color,
        payload: parsed.data.payload ?? existing.payload,
        version: Number(existing.version ?? 1) + 1
      };

      const { data: updated, error } = await serviceClient.from("annotations").update(patch).eq("id", existing.id).select("*").single();
      if (error || !updated) throw error ?? new Error("Annotation could not be updated.");

      const { error: eventError } = await serviceClient.from("annotation_events").insert({
        annotation_id: existing.id,
        meeting_id: existing.meeting_id,
        document_id: existing.document_id,
        page_id: existing.page_id,
        user_id: profile.id,
        event_type: "updated",
        before_payload: existing.payload,
        after_payload: updated.payload,
        metadata: {
          editedBy: profile.full_name,
          editedRole: profile.role,
          originalUserName: existing.user_name_snapshot,
          annotationType: existing.annotation_type,
          previousColor: existing.color,
          nextColor: updated.color
        }
      });
      if (eventError) throw eventError;

      return jsonResponse({ annotation: updated });
    }

    if (parsed.data.action === "delete") {
      const { data: existing } = await serviceClient.from("annotations").select("*").eq("id", parsed.data.annotationId).single();
      if (!existing) return jsonResponse({ error: "Annotation not found." }, 404);
      if (!(await canMutateAnnotation(serviceClient, profile, existing))) return jsonResponse({ error: "Annotation delete is not allowed." }, 403);

      const { data: updated, error } = await serviceClient
        .from("annotations")
        .update({ is_deleted: true, version: Number(existing.version ?? 1) + 1 })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error || !updated) throw error ?? new Error("Annotation could not be deleted.");

      const { error: eventError } = await serviceClient.from("annotation_events").insert({
        annotation_id: existing.id,
        meeting_id: existing.meeting_id,
        document_id: existing.document_id,
        page_id: existing.page_id,
        user_id: profile.id,
        event_type: "deleted",
        before_payload: existing.payload,
        after_payload: updated.payload,
        metadata: {
          userName: profile.full_name,
          designation: profile.designation,
          role: profile.role,
          annotationType: existing.annotation_type,
          color: existing.color
        }
      });
      if (eventError) throw eventError;

      return jsonResponse({ annotation: updated });
    }

    const meeting = await getMeeting(serviceClient, parsed.data.meetingId);
    if (!meeting) return jsonResponse({ error: "Meeting not found." }, 404);
    if (profile.role !== "presenter" || meeting.presenter_id !== profile.id) return jsonResponse({ error: "Only the presenter can clear annotations." }, 403);
    if (!(await documentPageBelongsToMeeting(serviceClient, meeting.id, parsed.data.documentId, parsed.data.pageId))) {
      return jsonResponse({ error: "Document page does not belong to this meeting." }, 400);
    }

    const { data: cleared, error: clearError } = await serviceClient
      .from("annotations")
      .update({ is_deleted: true })
      .eq("meeting_id", meeting.id)
      .eq("page_id", parsed.data.pageId)
      .eq("is_deleted", false)
      .select("id");

    if (clearError) throw clearError;
    const clearCount = cleared?.length ?? 0;

    const { error: eventError } = await serviceClient.from("annotation_events").insert({
      annotation_id: null,
      meeting_id: meeting.id,
      document_id: parsed.data.documentId,
      page_id: parsed.data.pageId,
      user_id: profile.id,
      event_type: "cleared",
      metadata: {
        clearCount,
        userName: profile.full_name,
        designation: profile.designation,
        role: profile.role
      }
    });
    if (eventError) throw eventError;

    return jsonResponse({ clearCount });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Annotation operation failed." }, 500);
  }
});
