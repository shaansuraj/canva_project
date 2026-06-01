"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { FileUp, Highlighter, Image as ImageIcon, Loader2, Lock, LockOpen, MousePointer2, PenLine, PlayCircle, Presentation, RectangleHorizontal, Trash2, Type, UsersRound } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { startMeetingWorkspaceAction } from "../actions";
import type { AnnotationCanvasProps } from "./annotation-canvas";
import { type BoardSize, DocumentRenderer } from "./document-renderer";
import { ScreenSharePanel } from "./screen-share-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getImagePageDraft, getPdfPageDrafts, type PageDraft } from "@/lib/documents/page-drafts";
import { canConnectToScreenShare, canUsePresenterConsoleControls, createScreenShareRoomName, type WorkspaceMode } from "@/lib/livekit/permissions";
import { REALTIME_EVENTS } from "@/lib/meetings/realtime-events";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getDocumentType, PPTX_FALLBACK_ERROR, sanitizeFilename } from "@/lib/validation/documents";
import type { AnnotationTool } from "@/lib/validation/annotations";
import type { Annotation, DocumentPage, Meeting, MeetingDocument, MeetingParticipant, ParticipantPermission, Profile, ScreenShareSession } from "@/types/app";
import type { Json } from "@/types/database";

const AnnotationCanvas = dynamic<AnnotationCanvasProps>(() => import("./annotation-canvas").then((module) => module.AnnotationCanvas), {
  ssr: false,
  loading: () => <div className="absolute inset-0 rounded-3xl border border-dashed border-transparent" aria-label="Preparing annotation canvas" />
});

const tools: Array<{ id: AnnotationTool; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "pen", label: "Pen", icon: PenLine },
  { id: "highlighter", label: "Highlighter", icon: Highlighter },
  { id: "text", label: "Text", icon: Type },
  { id: "rectangle", label: "Rect", icon: RectangleHorizontal },
  { id: "circle", label: "Circle", icon: MousePointer2 },
  { id: "line", label: "Line", icon: MousePointer2 },
  { id: "arrow", label: "Arrow", icon: MousePointer2 },
  { id: "eraser", label: "Erase", icon: MousePointer2 }
];

const defaultBoard: BoardSize = { width: 900, height: 600, scaleX: 1, scaleY: 1 };

type PresenceUser = {
  userId: string;
  name: string;
  role: string;
  color: string | null;
  onlineAt: string;
};

function canCurrentUserAnnotate({ profile, meeting, permission }: { profile: Profile; meeting: Meeting; permission: ParticipantPermission | null }) {
  if (!profile.is_active || meeting.document_locked) return false;
  if (profile.role === "presenter" && meeting.presenter_id === profile.id) return true;
  if (profile.role === "participant") {
    const canAnnotate = permission?.can_annotate ?? true;
    const isMuted = permission?.is_muted_from_annotation ?? false;
    return meeting.status === "live" && meeting.participant_annotation_enabled && canAnnotate && !isMuted;
  }
  return false;
}

function isRenderableDocument(document: MeetingDocument | null) {
  return document?.document_type === "pdf" || document?.document_type === "image";
}

export function MeetingWorkspace({
  initialMeeting,
  profile,
  mode = "room",
  initialParticipants,
  initialPermissions,
  initialScreenShareSession,
  initialDocuments,
  initialPages,
  initialAnnotations
}: {
  initialMeeting: Meeting;
  profile: Profile;
  mode?: WorkspaceMode;
  initialParticipants: MeetingParticipant[];
  initialPermissions: ParticipantPermission[];
  initialScreenShareSession: ScreenShareSession | null;
  initialDocuments: MeetingDocument[];
  initialPages: DocumentPage[];
  initialAnnotations: Annotation[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [meeting, setMeeting] = useState(initialMeeting);
  const [documents, setDocuments] = useState(initialDocuments);
  const [pages, setPages] = useState(initialPages);
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [screenShareSession, setScreenShareSession] = useState(initialScreenShareSession);
  const [selectedDocumentId, setSelectedDocumentId] = useState(initialMeeting.selected_document_id ?? initialDocuments[0]?.id ?? null);
  const [selectedPageId, setSelectedPageId] = useState(initialMeeting.selected_page_id ?? initialPages[0]?.id ?? null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("pen");
  const [color, setColor] = useState(profile.color ?? "#0f4c5c");
  const [board, setBoard] = useState<BoardSize>(defaultBoard);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;
  const selectedDocumentPages = selectedDocument ? pages.filter((page) => page.document_id === selectedDocument.id).sort((a, b) => a.page_number - b.page_number) : [];
  const pageAnnotations = selectedPageId ? annotations.filter((annotation) => annotation.page_id === selectedPageId && !annotation.is_deleted) : [];
  const canUsePresenterControls = canUsePresenterConsoleControls({ profile, meeting, mode });
  const currentPermission = profile.role === "participant" ? permissions.find((permission) => permission.user_id === profile.id) ?? null : null;
  const canUpload = canUsePresenterControls;
  const canAnnotate = Boolean(selectedDocument && selectedPage && isRenderableDocument(selectedDocument) && canCurrentUserAnnotate({ profile, meeting, permission: currentPermission }));
  const participantControlRows = initialParticipants.filter((participant) => participant.role_snapshot === "participant");

  const onSizeChange = useCallback((size: BoardSize) => setBoard(size), []);

  const refetchDocuments = useCallback(async () => {
    const [{ data: docs }, { data: pageRows }] = await Promise.all([
      supabase.from("meeting_documents").select("*").eq("meeting_id", meeting.id).order("created_at", { ascending: false }),
      supabase.from("document_pages").select("*").eq("meeting_id", meeting.id).order("page_number", { ascending: true })
    ]);

    setDocuments((docs ?? []) as MeetingDocument[]);
    setPages((pageRows ?? []) as DocumentPage[]);
  }, [meeting.id, supabase]);

  const refetchAnnotations = useCallback(async () => {
    const { data } = await supabase
      .from("annotations")
      .select("*")
      .eq("meeting_id", meeting.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    setAnnotations((data ?? []) as Annotation[]);
  }, [meeting.id, supabase]);

  const refetchPermissions = useCallback(async () => {
    const { data } = await supabase.from("participant_permissions").select("*").eq("meeting_id", meeting.id);
    setPermissions((data ?? []) as ParticipantPermission[]);
  }, [meeting.id, supabase]);

  const refetchScreenShareSession = useCallback(async () => {
    const { data } = await supabase
      .from("screen_share_sessions")
      .select("*")
      .eq("meeting_id", meeting.id)
      .in("status", ["live", "paused"])
      .order("started_at", { ascending: false })
      .limit(1);

    setScreenShareSession(((data ?? [])[0] ?? null) as ScreenShareSession | null);
  }, [meeting.id, supabase]);

  useEffect(() => {
    let active = true;

    async function loadSignedUrl() {
      if (!selectedDocument) {
        if (active) setSignedUrl(null);
        return;
      }

      const { data, error } = await supabase.storage.from("meeting-documents").createSignedUrl(selectedDocument.storage_path, 60 * 60);

      if (!active) return;
      if (error) {
        setSignedUrl(null);
        setMessage({ type: "error", text: error.message });
        return;
      }

      setSignedUrl(data.signedUrl);
    }

    void loadSignedUrl();

    return () => {
      active = false;
    };
  }, [selectedDocument, supabase]);

  useEffect(() => {
    const channel = supabase.channel(`meeting:${meeting.id}`);

    channel
      .on("broadcast", { event: REALTIME_EVENTS.documentUploaded }, () => void refetchDocuments())
      .on("broadcast", { event: REALTIME_EVENTS.documentSelected }, ({ payload }) => {
        const nextDocumentId = typeof payload?.documentId === "string" ? payload.documentId : null;
        const nextPageId = typeof payload?.pageId === "string" ? payload.pageId : null;
        if (nextDocumentId) setSelectedDocumentId(nextDocumentId);
        if (nextPageId) setSelectedPageId(nextPageId);
      })
      .on("broadcast", { event: REALTIME_EVENTS.pageChanged }, ({ payload }) => {
        if (typeof payload?.pageId === "string") setSelectedPageId(payload.pageId);
      })
      .on("broadcast", { event: REALTIME_EVENTS.meetingStatusChanged }, ({ payload }) => {
        if (payload?.status === "live" || payload?.status === "scheduled" || payload?.status === "paused") {
          setMeeting((current) => ({ ...current, status: payload.status }));
        }
      })
      .on("broadcast", { event: REALTIME_EVENTS.permissionsChanged }, ({ payload }) => {
        setMeeting((current) => ({
          ...current,
          participant_annotation_enabled:
            typeof payload?.participantAnnotationEnabled === "boolean" ? payload.participantAnnotationEnabled : current.participant_annotation_enabled,
          document_locked: typeof payload?.documentLocked === "boolean" ? payload.documentLocked : current.document_locked
        }));
        void refetchPermissions();
      })
      .on("broadcast", { event: REALTIME_EVENTS.documentLocked }, () => setMeeting((current) => ({ ...current, document_locked: true })))
      .on("broadcast", { event: REALTIME_EVENTS.documentUnlocked }, () => setMeeting((current) => ({ ...current, document_locked: false })))
      .on("broadcast", { event: REALTIME_EVENTS.screenStarted }, () => void refetchScreenShareSession())
      .on("broadcast", { event: REALTIME_EVENTS.screenPaused }, () => void refetchScreenShareSession())
      .on("broadcast", { event: REALTIME_EVENTS.screenStopped }, () => void refetchScreenShareSession())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [meeting.id, refetchDocuments, refetchPermissions, refetchScreenShareSession, supabase]);

  useEffect(() => {
    if (!selectedPageId) return;

    const channel = supabase.channel(`meeting:${meeting.id}:page:${selectedPageId}`);

    channel
      .on("broadcast", { event: REALTIME_EVENTS.annotationCreated }, () => void refetchAnnotations())
      .on("broadcast", { event: REALTIME_EVENTS.annotationUpdated }, () => void refetchAnnotations())
      .on("broadcast", { event: REALTIME_EVENTS.annotationDeleted }, () => void refetchAnnotations())
      .on("broadcast", { event: REALTIME_EVENTS.annotationsCleared }, () => void refetchAnnotations())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [meeting.id, refetchAnnotations, selectedPageId, supabase]);

  useEffect(() => {
    const presenceChannel = supabase.channel(`presence:meeting:${meeting.id}`, {
      config: { presence: { key: profile.id } }
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState<PresenceUser>();
        const users = Object.values(state).flat();
        setPresenceUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            userId: profile.id,
            name: profile.full_name,
            role: profile.role,
            color: profile.color,
            onlineAt: new Date().toISOString()
          });
        }
      });

    return () => {
      void presenceChannel.untrack();
      void supabase.removeChannel(presenceChannel);
    };
  }, [meeting.id, profile.color, profile.full_name, profile.id, profile.role, supabase]);

  async function preparePages(file: File, documentType: MeetingDocument["document_type"]): Promise<PageDraft[]> {
    if (documentType === "pdf") return getPdfPageDrafts(file);
    if (documentType === "image") return [await getImagePageDraft(file)];
    return [];
  }

  async function handleUpload(file: File | null) {
    if (!file || !canUpload) return;
    setUploading(true);
    setMessage(null);

    try {
      const documentType = getDocumentType(file.name, file.type);
      if (!documentType) throw new Error("Upload PDF, image, PPT, or PPTX files only.");

      const documentId = crypto.randomUUID();
      const filename = sanitizeFilename(file.name);
      const storagePath = `${meeting.id}/${documentId}/original/${filename}`;
      const pageDrafts = await preparePages(file, documentType);
      const conversionStatus = documentType === "ppt" || documentType === "pptx" ? "pending" : "ready";

      const upload = await supabase.storage.from("meeting-documents").upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });

      if (upload.error) throw upload.error;

      const { data: documentRow, error: documentError } = await supabase
        .from("meeting_documents")
        .insert({
          id: documentId,
          meeting_id: meeting.id,
          uploaded_by: profile.id,
          title: filename,
          document_type: documentType,
          storage_path: storagePath,
          original_filename: filename,
          mime_type: file.type || null,
          file_size_bytes: file.size,
          conversion_status: conversionStatus,
          page_count: pageDrafts.length
        })
        .select("*")
        .single();

      if (documentError || !documentRow) throw documentError ?? new Error("Document metadata could not be created.");

      let insertedPages: DocumentPage[] = [];
      if (pageDrafts.length > 0) {
        const { data: pageRows, error: pageError } = await supabase
          .from("document_pages")
          .insert(
            pageDrafts.map((pageDraft) => ({
              document_id: documentId,
              meeting_id: meeting.id,
              page_number: pageDraft.pageNumber,
              width: pageDraft.width,
              height: pageDraft.height
            }))
          )
          .select("*");

        if (pageError) throw pageError;
        insertedPages = (pageRows ?? []) as DocumentPage[];
      }

      if (documentType === "ppt" || documentType === "pptx") {
        const { error: conversionInvokeError } = await supabase.functions.invoke("pptx-convert", { body: { documentId } });
        if (conversionInvokeError) {
          await supabase
            .from("meeting_documents")
            .update({ conversion_status: "failed", conversion_error: PPTX_FALLBACK_ERROR })
            .eq("id", documentId);
        }
      }

      const nextDocuments = [documentRow as MeetingDocument, ...documents];
      const nextPages = [...pages, ...insertedPages];
      setDocuments(nextDocuments);
      setPages(nextPages);

      const firstPage = insertedPages[0];
      if (firstPage) {
        await selectDocumentPage(documentRow as MeetingDocument, firstPage, { silent: true });
      }

      await supabase.channel(`meeting:${meeting.id}`).send({
        type: "broadcast",
        event: REALTIME_EVENTS.documentUploaded,
        payload: { documentId, pageId: firstPage?.id ?? null }
      });

      setMessage({
        type: documentType === "ppt" || documentType === "pptx" ? "info" : "success",
        text:
          documentType === "ppt" || documentType === "pptx"
            ? "PPT/PPTX uploaded. Conversion status will show after the Edge Function runs."
            : "Document uploaded and ready for annotation."
      });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function selectDocumentPage(document: MeetingDocument, page: DocumentPage, options?: { silent?: boolean }) {
    if (!canUsePresenterControls) return;

    setSelectedDocumentId(document.id);
    setSelectedPageId(page.id);
    setMeeting((current) => ({ ...current, selected_document_id: document.id, selected_page_id: page.id }));

    const { error } = await supabase
      .from("meetings")
      .update({ selected_document_id: document.id, selected_page_id: page.id })
      .eq("id", meeting.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    if (!options?.silent) {
      await supabase.channel(`meeting:${meeting.id}`).send({
        type: "broadcast",
        event: REALTIME_EVENTS.documentSelected,
        payload: { documentId: document.id, pageId: page.id }
      });
    }
  }

  async function changePage(nextPage: DocumentPage) {
    if (!selectedDocument || !canUsePresenterControls) return;
    setSelectedPageId(nextPage.id);

    const { error } = await supabase.from("meetings").update({ selected_page_id: nextPage.id }).eq("id", meeting.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    await supabase.channel(`meeting:${meeting.id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.pageChanged,
      payload: { pageId: nextPage.id }
    });
  }

  async function createAnnotation(type: AnnotationTool, payload: Record<string, unknown>, annotationColor: string) {
    if (!selectedDocument || !selectedPage) return;
    setMessage(null);

    const { data: annotation, error } = await supabase
      .from("annotations")
      .insert({
        meeting_id: meeting.id,
        document_id: selectedDocument.id,
        page_id: selectedPage.id,
        user_id: profile.id,
        user_name_snapshot: profile.full_name,
        designation_snapshot: profile.designation,
        role_snapshot: profile.role,
        annotation_type: type,
        color: annotationColor,
        payload: payload as Json
      })
      .select("*")
      .single();

    if (error || !annotation) {
      setMessage({ type: "error", text: error?.message ?? "Annotation could not be saved." });
      return;
    }

    await supabase.from("annotation_events").insert({
      annotation_id: annotation.id,
      meeting_id: meeting.id,
      document_id: selectedDocument.id,
      page_id: selectedPage.id,
      user_id: profile.id,
      event_type: "created",
      after_payload: annotation.payload as Json,
      metadata: {
        userName: profile.full_name,
        designation: profile.designation,
        role: profile.role,
        annotationType: type,
        color: annotationColor
      }
    });

    setAnnotations((current) => [...current, annotation as Annotation]);
    await supabase.channel(`meeting:${meeting.id}:page:${selectedPage.id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.annotationCreated,
      payload: { annotationId: annotation.id }
    });
  }

  async function deleteAnnotation(annotation: Annotation) {
    const { data: updated, error } = await supabase
      .from("annotations")
      .update({ is_deleted: true, version: annotation.version + 1 })
      .eq("id", annotation.id)
      .select("*")
      .single();

    if (error || !updated) {
      setMessage({ type: "error", text: error?.message ?? "Annotation could not be deleted." });
      return;
    }

    await supabase.from("annotation_events").insert({
      annotation_id: annotation.id,
      meeting_id: annotation.meeting_id,
      document_id: annotation.document_id,
      page_id: annotation.page_id,
      user_id: profile.id,
      event_type: "deleted",
      before_payload: annotation.payload as Json,
      after_payload: updated.payload as Json,
      metadata: {
        userName: profile.full_name,
        designation: profile.designation,
        role: profile.role,
        annotationType: annotation.annotation_type,
        color: annotation.color
      }
    });

    setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
    await supabase.channel(`meeting:${meeting.id}:page:${annotation.page_id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.annotationDeleted,
      payload: { annotationId: annotation.id }
    });
  }

  function startWorkspace() {
    if (!canUsePresenterControls) return;
    startTransition(async () => {
      const result = await startMeetingWorkspaceAction(meeting.id);
      if (!result.ok) {
        setMessage({ type: "error", text: result.message });
        return;
      }

      setMeeting((current) => ({ ...current, status: "live", started_at: current.started_at ?? new Date().toISOString() }));
      setMessage({ type: "success", text: result.message });
      await supabase.channel(`meeting:${meeting.id}`).send({
        type: "broadcast",
        event: REALTIME_EVENTS.meetingStatusChanged,
        payload: { status: "live" }
      });
    });
  }

  async function setParticipantAnnotationEnabled(enabled: boolean) {
    if (!canUsePresenterControls) return;

    const { error } = await supabase.from("meetings").update({ participant_annotation_enabled: enabled }).eq("id", meeting.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    setMeeting((current) => ({ ...current, participant_annotation_enabled: enabled }));
    await supabase.channel(`meeting:${meeting.id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.permissionsChanged,
      payload: { participantAnnotationEnabled: enabled }
    });
  }

  async function setDocumentLocked(locked: boolean) {
    if (!canUsePresenterControls) return;

    const { error } = await supabase.from("meetings").update({ document_locked: locked }).eq("id", meeting.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    setMeeting((current) => ({ ...current, document_locked: locked }));
    await supabase.channel(`meeting:${meeting.id}`).send({
      type: "broadcast",
      event: locked ? REALTIME_EVENTS.documentLocked : REALTIME_EVENTS.documentUnlocked,
      payload: { documentLocked: locked }
    });
    await supabase.channel(`meeting:${meeting.id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.permissionsChanged,
      payload: { documentLocked: locked }
    });
  }

  async function clearCurrentPageAnnotations() {
    if (!canUsePresenterControls || !selectedDocument || !selectedPage) return;

    const clearCount = pageAnnotations.length;
    if (clearCount === 0) {
      setMessage({ type: "info", text: "There are no annotations on the selected page to clear." });
      return;
    }

    const { error } = await supabase
      .from("annotations")
      .update({ is_deleted: true })
      .eq("meeting_id", meeting.id)
      .eq("page_id", selectedPage.id)
      .eq("is_deleted", false);

    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    await supabase.from("annotation_events").insert({
      annotation_id: null,
      meeting_id: meeting.id,
      document_id: selectedDocument.id,
      page_id: selectedPage.id,
      user_id: profile.id,
      event_type: "cleared",
      metadata: {
        clearCount,
        userName: profile.full_name,
        designation: profile.designation,
        role: profile.role
      }
    });

    setAnnotations((current) => current.filter((annotation) => annotation.page_id !== selectedPage.id));
    await supabase.channel(`meeting:${meeting.id}:page:${selectedPage.id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.annotationsCleared,
      payload: { pageId: selectedPage.id, clearCount }
    });
    setMessage({ type: "success", text: `Cleared ${clearCount} annotation${clearCount === 1 ? "" : "s"} from the selected page.` });
  }

  async function updateParticipantPermission(participant: MeetingParticipant, patch: Partial<Pick<ParticipantPermission, "can_annotate" | "can_download" | "is_muted_from_annotation">>) {
    if (!canUsePresenterControls) return;

    const existing = permissions.find((permission) => permission.user_id === participant.user_id);
    const nextPermission = {
      meeting_id: meeting.id,
      user_id: participant.user_id,
      can_annotate: existing?.can_annotate ?? true,
      can_download: existing?.can_download ?? false,
      is_muted_from_annotation: existing?.is_muted_from_annotation ?? false,
      updated_by: profile.id,
      ...patch
    };

    const { data, error } = await supabase
      .from("participant_permissions")
      .upsert(nextPermission, { onConflict: "meeting_id,user_id" })
      .select("*")
      .single();

    if (error || !data) {
      setMessage({ type: "error", text: error?.message ?? "Participant permission could not be updated." });
      return;
    }

    setPermissions((current) => {
      const withoutExisting = current.filter((permission) => permission.user_id !== participant.user_id);
      return [...withoutExisting, data as ParticipantPermission];
    });
    await supabase.channel(`meeting:${meeting.id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.permissionsChanged,
      payload: { userId: participant.user_id }
    });
  }

  async function markScreenShareStarted() {
    if (!canUsePresenterControls) return;

    const now = new Date().toISOString();
    await supabase
      .from("screen_share_sessions")
      .update({ status: "stopped", stopped_at: now })
      .eq("meeting_id", meeting.id)
      .in("status", ["live", "paused"]);

    const { data, error } = await supabase
      .from("screen_share_sessions")
      .insert({
        meeting_id: meeting.id,
        presenter_id: profile.id,
        livekit_room_name: createScreenShareRoomName(meeting.id),
        status: "live"
      })
      .select("*")
      .single();

    if (error || !data) {
      const messageText = error?.message ?? "Screen share session could not be started.";
      setMessage({ type: "error", text: messageText });
      throw new Error(messageText);
    }

    setScreenShareSession(data as ScreenShareSession);
    await supabase.channel(`meeting:${meeting.id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.screenStarted,
      payload: { sessionId: data.id }
    });
  }

  async function markScreenSharePaused() {
    if (!canUsePresenterControls || !screenShareSession) return;

    const { data, error } = await supabase
      .from("screen_share_sessions")
      .update({ status: "paused", paused_at: new Date().toISOString() })
      .eq("id", screenShareSession.id)
      .select("*")
      .single();

    if (error || !data) {
      const messageText = error?.message ?? "Screen share session could not be paused.";
      setMessage({ type: "error", text: messageText });
      throw new Error(messageText);
    }

    setScreenShareSession(data as ScreenShareSession);
    await supabase.channel(`meeting:${meeting.id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.screenPaused,
      payload: { sessionId: data.id }
    });
  }

  async function markScreenShareStopped() {
    if (!canUsePresenterControls || !screenShareSession) return;

    const { error } = await supabase
      .from("screen_share_sessions")
      .update({ status: "stopped", stopped_at: new Date().toISOString() })
      .eq("id", screenShareSession.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
      throw new Error(error.message);
    }

    const stoppedSessionId = screenShareSession.id;
    setScreenShareSession(null);
    await supabase.channel(`meeting:${meeting.id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.screenStopped,
      payload: { sessionId: stoppedSessionId }
    });
  }

  const selectedPageIndex = selectedDocumentPages.findIndex((page) => page.id === selectedPage?.id);

  return (
    <div className="space-y-5">
      {message ? (
        <Alert className={message.type === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-primary/20 bg-primary/5 text-primary"}>
          <AlertTitle>{message.type === "error" ? "Workspace issue" : message.type === "success" ? "Workspace updated" : "Workspace notice"}</AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      {canConnectToScreenShare(profile.role) ? (
        <ScreenSharePanel
          allowPresenterControls={canUsePresenterControls}
          meetingId={meeting.id}
          session={screenShareSession}
          onStarted={markScreenShareStarted}
          onPaused={markScreenSharePaused}
          onStopped={markScreenShareStopped}
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Shared annotation workspace</CardTitle>
                <CardDescription>
                  Presenter uploads documents, selects the shared page, and participants annotate in realtime when the meeting is live.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={meeting.status === "live" ? "success" : "secondary"}>{meeting.status}</Badge>
                {canUsePresenterControls && meeting.status !== "live" ? (
                  <Button onClick={startWorkspace} disabled={isPending} size="sm">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />}
                    Start workspace
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-white/75 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {tools.map((item) => (
                  <Button
                    key={item.id}
                    onClick={() => setTool(item.id)}
                    size="sm"
                    type="button"
                    variant={tool === item.id ? "default" : "outline"}
                    className="min-h-11"
                  >
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </Button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold">
                Color
                <input value={color} onChange={(event) => setColor(event.target.value)} type="color" className="h-11 w-14 rounded-xl border border-border bg-white p-1" />
              </label>
            </div>

            {!selectedDocument || !selectedPage ? (
              <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-primary/25 bg-primary/5 p-8 text-center">
                <div className="max-w-md space-y-3">
                  <FileUp className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
                  <p className="text-xl font-black">No shared page selected</p>
                  <p className="text-sm text-muted-foreground">Presenter uploads a PDF or image to open the annotation board. PPT/PPTX files are stored and routed through the conversion abstraction.</p>
                </div>
              </div>
            ) : (
              <DocumentRenderer document={selectedDocument} page={selectedPage} signedUrl={signedUrl} onSizeChange={onSizeChange}>
                <AnnotationCanvas
                  annotations={pageAnnotations}
                  board={board}
                  tool={tool}
                  color={color}
                  canAnnotate={canAnnotate}
                  onCreate={createAnnotation}
                  onDelete={deleteAnnotation}
                />
              </DocumentRenderer>
            )}

            <div className="flex flex-col gap-3 rounded-3xl bg-secondary/60 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                {canAnnotate
                  ? "Annotation is enabled for you. Draw with touch, stylus, or mouse."
                  : "Annotation is currently unavailable for your role, meeting status, selected document, or lock state."}
              </p>
              {selectedDocumentPages.length > 0 ? (
                <div className="flex items-center gap-2">
                  <Button disabled={!canUsePresenterControls || selectedPageIndex <= 0} onClick={() => changePage(selectedDocumentPages[selectedPageIndex - 1])} size="sm" variant="outline">
                    Prev
                  </Button>
                  <span className="font-bold text-foreground">Page {selectedPage?.page_number ?? 1} / {selectedDocumentPages.length}</span>
                  <Button disabled={!canUsePresenterControls || selectedPageIndex < 0 || selectedPageIndex >= selectedDocumentPages.length - 1} onClick={() => changePage(selectedDocumentPages[selectedPageIndex + 1])} size="sm" variant="outline">
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <aside className="space-y-5">
          {canUsePresenterControls ? (
            <Card className="bg-white/85 backdrop-blur">
              <CardHeader>
                <CardTitle>Presenter controls</CardTitle>
                <CardDescription>Control annotation access, document lock state, page cleanup, and participant permissions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Button onClick={() => setParticipantAnnotationEnabled(!meeting.participant_annotation_enabled)} type="button" variant="outline">
                    {meeting.participant_annotation_enabled ? "Disable participant annotation" : "Enable participant annotation"}
                  </Button>
                  <Button onClick={() => setDocumentLocked(!meeting.document_locked)} type="button" variant="outline">
                    {meeting.document_locked ? <LockOpen className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                    {meeting.document_locked ? "Unlock document" : "Lock document"}
                  </Button>
                  <Button disabled={!selectedPage || pageAnnotations.length === 0} onClick={clearCurrentPageAnnotations} type="button" variant="outline">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Clear current page
                  </Button>
                </div>

                <div className="rounded-3xl bg-secondary/60 p-4 text-sm">
                  <p className="font-bold">Participant permissions</p>
                  <p className="mt-1 text-xs text-muted-foreground">Defaults allow annotation. Rows here override annotation, mute, and future download access.</p>
                </div>

                <div className="space-y-3">
                  {participantControlRows.length === 0 ? <p className="text-sm text-muted-foreground">No participant attendance records yet.</p> : null}
                  {participantControlRows.map((participant) => {
                    const permission = permissions.find((item) => item.user_id === participant.user_id);
                    const canAnnotateParticipant = permission?.can_annotate ?? true;
                    const isMuted = permission?.is_muted_from_annotation ?? false;
                    const canDownload = permission?.can_download ?? false;

                    return (
                      <div key={participant.id} className="rounded-3xl border border-border/70 bg-white/75 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-bold">{participant.name_snapshot}</p>
                            <p className="text-xs text-muted-foreground">{participant.designation_snapshot ?? "No designation"}</p>
                          </div>
                          <Badge variant={participant.is_present ? "success" : "outline"}>{participant.is_present ? "present" : "left"}</Badge>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <Button onClick={() => updateParticipantPermission(participant, { can_annotate: !canAnnotateParticipant })} size="sm" type="button" variant={canAnnotateParticipant ? "default" : "outline"}>
                            {canAnnotateParticipant ? "Can annotate" : "Annotation off"}
                          </Button>
                          <Button onClick={() => updateParticipantPermission(participant, { is_muted_from_annotation: !isMuted })} size="sm" type="button" variant={isMuted ? "default" : "outline"}>
                            {isMuted ? "Muted from annotation" : "Not muted"}
                          </Button>
                          <Button onClick={() => updateParticipantPermission(participant, { can_download: !canDownload })} size="sm" type="button" variant={canDownload ? "default" : "outline"}>
                            {canDownload ? "Download allowed" : "Download blocked"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>PDF and images annotate immediately. PPT/PPTX is accepted with conversion fallback.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canUpload ? (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-primary/30 bg-primary/5 p-5 text-center text-sm font-semibold text-primary">
                  {uploading ? <Loader2 className="mb-2 h-6 w-6 animate-spin" aria-hidden="true" /> : <FileUp className="mb-2 h-6 w-6" aria-hidden="true" />}
                  Upload PDF, image, PPT, or PPTX
                  <input
                    disabled={uploading}
                    className="sr-only"
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/webp,.ppt,.pptx"
                    onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
                  />
                </label>
              ) : null}

              <div className="space-y-3">
                {documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents uploaded yet.</p> : null}
                {documents.map((document) => {
                  const docPages = pages.filter((page) => page.document_id === document.id).sort((a, b) => a.page_number - b.page_number);
                  const firstPage = docPages[0];
                  const Icon = document.document_type === "image" ? ImageIcon : document.document_type === "pdf" ? FileUp : Presentation;
                  return (
                    <div key={document.id} className="rounded-3xl border border-border/70 bg-white/75 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">{document.title}</p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant="secondary">{document.document_type}</Badge>
                            <Badge variant={document.conversion_status === "ready" ? "success" : "outline"}>{document.conversion_status}</Badge>
                          </div>
                          {document.conversion_error ? <p className="mt-2 text-xs text-destructive">{document.conversion_error}</p> : null}
                        </div>
                      </div>
                      {firstPage ? (
                        <Button className="mt-3 w-full" disabled={!canUsePresenterControls} onClick={() => selectDocumentPage(document, firstPage)} size="sm" variant={selectedDocumentId === document.id ? "default" : "outline"}>
                          {selectedDocumentId === document.id ? "Selected" : "Broadcast document"}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="h-5 w-5" aria-hidden="true" />
                Presence
              </CardTitle>
              <CardDescription>{presenceUsers.length} online in this meeting room.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {presenceUsers.length === 0 ? <p className="text-sm text-muted-foreground">Presence is connecting...</p> : null}
              {presenceUsers.map((user) => (
                <div key={`${user.userId}-${user.onlineAt}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-white/70 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: user.color ?? "#0f4c5c" }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.role}</p>
                    </div>
                  </div>
                  <Badge variant="success">online</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
