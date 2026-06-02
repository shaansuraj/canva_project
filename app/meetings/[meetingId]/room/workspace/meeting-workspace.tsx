"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  Eraser,
  FileText,
  FileUp,
  Highlighter,
  Image as ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  LogOut,
  Maximize2,
  Minimize2,
  Minus,
  MonitorUp,
  MoreHorizontal,
  Move,
  Palette,
  PenLine,
  PlayCircle,
  Plus,
  Presentation,
  RectangleHorizontal,
  StopCircle,
  Trash2,
  Type,
  X
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { endMeetingAction, startMeetingWorkspaceAction } from "../actions";
import type { AnnotationCanvasProps, AnnotationDraftPreview } from "./annotation-canvas";
import { INFINITE_WHITEBOARD_HEIGHT, INFINITE_WHITEBOARD_WIDTH, type BoardSize, DocumentRenderer, type ViewportRequest, isGeneratedWhiteboardDocument } from "./document-renderer";
import { ScreenSharePanel } from "./screen-share-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getImagePageDraft, getPdfPageDrafts, type PageDraft } from "@/lib/documents/page-drafts";
import { canConnectToScreenShare, canUsePresenterConsoleControls, createScreenShareRoomName, type WorkspaceMode } from "@/lib/livekit/permissions";
import { canAnnotateInStage, getStageModeLabel, type MeetingStageMode } from "@/lib/meetings/meeting-stage";
import { REALTIME_EVENTS } from "@/lib/meetings/realtime-events";
import { getMeetingLeaveDestination, hasSavableAnnotations } from "@/lib/meetings/workspace-safety";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";
import { getDocumentType, getOfficeConversionFallbackError, isOfficeDocumentType, sanitizeFilename } from "@/lib/validation/documents";
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
  { id: "circle", label: "Circle", icon: Circle },
  { id: "line", label: "Line", icon: Minus },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "eraser", label: "Erase", icon: Eraser }
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

type BoardViewportPayload = {
  documentId: string | null;
  pageId: string | null;
  topRatio?: number;
  leftRatio?: number;
  viewportX?: number;
  viewportY?: number;
  viewportZoom?: number;
  sourceUserId: string;
};

type WorkspaceExportResult = {
  status: "completed" | "failed";
  signedUrl?: string | null;
  storagePath?: string;
  error?: string;
};

type WorkspaceAnnotationsResult = {
  annotation?: Annotation;
  annotations?: Annotation[];
  clearCount?: number;
  error?: string;
};

type AnnotationSaveStatus = "idle" | "saving" | "saved" | "error";
type MorePanel = "meeting" | "documents" | "people" | "annotations" | null;

function createWhiteboardSvg(title: string) {
  return new Blob(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${INFINITE_WHITEBOARD_WIDTH}" height="${INFINITE_WHITEBOARD_HEIGHT}" viewBox="0 0 ${INFINITE_WHITEBOARD_WIDTH} ${INFINITE_WHITEBOARD_HEIGHT}" role="img" aria-label="${title}">
  <defs>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M80 0H0V80" fill="none" stroke="#e9e2d2" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="${INFINITE_WHITEBOARD_WIDTH}" height="${INFINITE_WHITEBOARD_HEIGHT}" fill="#fffdf7"/>
  <rect width="${INFINITE_WHITEBOARD_WIDTH}" height="${INFINITE_WHITEBOARD_HEIGHT}" fill="url(#grid)" opacity="0.85"/>
</svg>`
    ],
    { type: "image/svg+xml" }
  );
}

function getScrollRatio({ value, max }: { value: number; max: number }) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

function applyScrollRatio(container: HTMLDivElement, topRatio: number, leftRatio: number) {
  container.scrollTo({
    top: topRatio * Math.max(0, container.scrollHeight - container.clientHeight),
    left: leftRatio * Math.max(0, container.scrollWidth - container.clientWidth),
    behavior: "smooth"
  });
}

function StagePill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em]",
        tone === "neutral" && "border-white/15 bg-white/12 text-white",
        tone === "success" && "border-emerald-300/40 bg-emerald-400/18 text-emerald-50",
        tone === "warning" && "border-amber-300/40 bg-amber-400/18 text-amber-50",
        tone === "danger" && "border-rose-300/45 bg-rose-500/22 text-rose-50"
      )}
    >
      {children}
    </span>
  );
}

function MeetDockButton({
  active,
  danger,
  disabled,
  icon,
  label,
  onClick
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "group flex w-11 shrink-0 flex-col items-center gap-1 rounded-2xl py-1 text-[0.65rem] font-black text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-45 sm:w-[4.25rem]",
        !active && !danger && "hover:bg-white/8",
        active && "text-slate-950",
        danger && "text-rose-50 hover:bg-rose-500/10"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full border text-white shadow-[0_14px_34px_-24px_rgba(0,0,0,0.9)] transition sm:h-11 sm:w-11",
          active && "border-white bg-white text-slate-950",
          danger && "border-rose-300/35 bg-rose-500 text-white group-hover:bg-rose-400",
          !active && !danger && "border-white/12 bg-white/12 group-hover:bg-white/20"
        )}
      >
        {icon}
      </span>
      <span className="hidden max-w-[4.25rem] truncate sm:block">{label}</span>
    </button>
  );
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
  const workspaceRootRef = useRef<HTMLDivElement>(null);
  const boardSectionRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const quickUploadInputRef = useRef<HTMLInputElement>(null);
  const meetingChannelRef = useRef<RealtimeChannel | null>(null);
  const suppressScrollBroadcastRef = useRef(false);
  const lastScrollBroadcastRef = useRef(0);
  const lastDraftBroadcastRef = useRef(0);
  const activeDraftIdRef = useRef<string | null>(null);
  const [meeting, setMeeting] = useState(initialMeeting);
  const [participants, setParticipants] = useState(initialParticipants);
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
  const [floatingBoard, setFloatingBoard] = useState<BoardSize>(defaultBoard);
  const [floatingBoardMinimized, setFloatingBoardMinimized] = useState(true);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [remoteDrafts, setRemoteDrafts] = useState<AnnotationDraftPreview[]>([]);
  const [morePanel, setMorePanel] = useState<MorePanel>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string; signedUrl?: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [leavingMeeting, setLeavingMeeting] = useState(false);
  const [stageMode, setStageMode] = useState<MeetingStageMode>("board");
  const [isWorkspaceFullscreen, setIsWorkspaceFullscreen] = useState(false);
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<AnnotationSaveStatus>("idle");
  const [lastAnnotationSavedAt, setLastAnnotationSavedAt] = useState<Date | null>(null);
  const [boardPanEnabled, setBoardPanEnabled] = useState(false);
  const [boardViewportRequest, setBoardViewportRequest] = useState<ViewportRequest | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;
  const selectedDocumentIsWhiteboard = isGeneratedWhiteboardDocument(selectedDocument);
  const selectedDocumentPages = selectedDocument ? pages.filter((page) => page.document_id === selectedDocument.id).sort((a, b) => a.page_number - b.page_number) : [];
  const pageAnnotations = selectedPageId ? annotations.filter((annotation) => annotation.page_id === selectedPageId && !annotation.is_deleted) : [];
  const canUsePresenterControls = canUsePresenterConsoleControls({ profile, meeting, mode });
  const currentPermission = profile.role === "participant" ? permissions.find((permission) => permission.user_id === profile.id) ?? null : null;
  const canUpload = canUsePresenterControls;
  const canUseScreenShare = canConnectToScreenShare(profile.role);
  const boardIsMainStage = stageMode === "board";
  const screenIsMainStage = stageMode === "screen";
  const canAnnotateByPermission = Boolean(selectedDocument && selectedPage && isRenderableDocument(selectedDocument) && canCurrentUserAnnotate({ profile, meeting, permission: currentPermission }));
  const canAnnotate = canAnnotateInStage(canAnnotateByPermission, stageMode) && !(selectedDocumentIsWhiteboard && boardPanEnabled);
  const participantControlRows = participants.filter((participant) => participant.role_snapshot === "participant");
  const selectedDocumentHasAnnotations = hasSavableAnnotations(annotations, selectedDocumentId);
  const isPresentationLive = screenShareSession?.status === "live";

  const onSizeChange = useCallback((size: BoardSize) => setBoard(size), []);
  const onFloatingSizeChange = useCallback((size: BoardSize) => setFloatingBoard(size), []);

  useEffect(() => {
    if (selectedDocumentIsWhiteboard) return;
    const timeout = window.setTimeout(() => setBoardPanEnabled(false), 0);
    return () => window.clearTimeout(timeout);
  }, [selectedDocumentIsWhiteboard]);

  const scrollToBoard = useCallback(() => {
    boardSectionRef.current?.focus({ preventScroll: true });
  }, []);

  const focusBoardStage = useCallback(() => {
    setStageMode("board");
    window.setTimeout(() => scrollToBoard(), 50);
  }, [scrollToBoard]);

  const focusScreenStage = useCallback(() => {
    setStageMode("screen");
  }, []);

  const toggleWorkspaceFullscreen = useCallback(async () => {
    const root = workspaceRootRef.current;
    if (!root) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (!root.requestFullscreen) {
        setMessage({ type: "info", text: "Fullscreen is not supported by this browser. Use the browser full-screen option if available." });
        return;
      }

      await root.requestFullscreen();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Fullscreen could not be opened." });
    }
  }, []);

  useEffect(() => {
    const updateFullscreenState = () => setIsWorkspaceFullscreen(document.fullscreenElement === workspaceRootRef.current);
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  const sendMeetingBroadcast = useCallback(
    async (event: string, payload: Record<string, unknown>) => {
      const channel = meetingChannelRef.current ?? supabase.channel(`meeting:${meeting.id}`);
      await channel.send({ type: "broadcast", event, payload });
    },
    [meeting.id, supabase]
  );

  const applyRemoteBoardViewport = useCallback((payload: BoardViewportPayload) => {
    if (payload.sourceUserId === profile.id) return;
    if (payload.documentId) setSelectedDocumentId(payload.documentId);
    if (payload.pageId) setSelectedPageId(payload.pageId);

    suppressScrollBroadcastRef.current = true;
    setBoardViewportRequest({
      topRatio: payload.topRatio,
      leftRatio: payload.leftRatio,
      x: typeof payload.viewportX === "number" ? payload.viewportX : undefined,
      y: typeof payload.viewportY === "number" ? payload.viewportY : undefined,
      zoom: typeof payload.viewportZoom === "number" ? payload.viewportZoom : undefined,
      nonce: Date.now()
    });
    window.setTimeout(() => {
      const container = boardScrollRef.current;
      if (container && typeof payload.topRatio === "number" && typeof payload.leftRatio === "number") applyScrollRatio(container, payload.topRatio, payload.leftRatio);
      if (stageMode === "board") scrollToBoard();
      window.setTimeout(() => {
        suppressScrollBroadcastRef.current = false;
      }, 350);
    }, 80);
  }, [profile.id, scrollToBoard, stageMode]);

  const refetchDocuments = useCallback(async () => {
    const [{ data: docs }, { data: pageRows }] = await Promise.all([
      supabase.from("meeting_documents").select("*").eq("meeting_id", meeting.id).order("created_at", { ascending: false }),
      supabase.from("document_pages").select("*").eq("meeting_id", meeting.id).order("page_number", { ascending: true })
    ]);

    setDocuments((docs ?? []) as MeetingDocument[]);
    setPages((pageRows ?? []) as DocumentPage[]);
  }, [meeting.id, supabase]);

  const refetchAnnotations = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<WorkspaceAnnotationsResult>("workspace-annotations", {
      body: { action: "list", meetingId: meeting.id }
    });

    if (error || data?.error) {
      setMessage({ type: "error", text: error?.message ?? data?.error ?? "Annotations could not be loaded." });
      return;
    }

    setAnnotations(data?.annotations ?? []);
  }, [meeting.id, supabase]);

  const upsertAnnotation = useCallback((annotation: Annotation) => {
    setAnnotations((current) => {
      const existingIndex = current.findIndex((item) => item.id === annotation.id);
      if (annotation.is_deleted) return current.filter((item) => item.id !== annotation.id);
      if (existingIndex === -1) return [...current, annotation];
      return current.map((item) => (item.id === annotation.id ? annotation : item));
    });
  }, []);

  const removeAnnotation = useCallback((annotationId: string) => {
    setAnnotations((current) => current.filter((item) => item.id !== annotationId));
  }, []);

  const applyAnnotationCreatedPayload = useCallback(
    (payload: Record<string, unknown> | null | undefined) => {
      const annotation = payload?.annotation as Annotation | undefined;
      if (annotation?.id && annotation.meeting_id === meeting.id) {
        upsertAnnotation(annotation);
        return;
      }
      void refetchAnnotations();
    },
    [meeting.id, refetchAnnotations, upsertAnnotation]
  );

  const applyAnnotationUpdatedPayload = useCallback(
    (payload: Record<string, unknown> | null | undefined) => {
      const annotation = payload?.annotation as Annotation | undefined;
      if (annotation?.id && annotation.meeting_id === meeting.id) {
        upsertAnnotation(annotation);
        return;
      }
      void refetchAnnotations();
    },
    [meeting.id, refetchAnnotations, upsertAnnotation]
  );

  const applyAnnotationDeletedPayload = useCallback(
    (payload: Record<string, unknown> | null | undefined) => {
      const annotationId = typeof payload?.annotationId === "string" ? payload.annotationId : null;
      if (annotationId) {
        removeAnnotation(annotationId);
        return;
      }
      void refetchAnnotations();
    },
    [refetchAnnotations, removeAnnotation]
  );

  const applyAnnotationsClearedPayload = useCallback(
    (payload: Record<string, unknown> | null | undefined) => {
      const pageId = typeof payload?.pageId === "string" ? payload.pageId : null;
      if (pageId) {
        setAnnotations((current) => current.filter((annotation) => annotation.page_id !== pageId));
        return;
      }
      void refetchAnnotations();
    },
    [refetchAnnotations]
  );

  const applyAnnotationDraftPayload = useCallback(
    (payload: Record<string, unknown> | null | undefined) => {
      if (!payload) return;

      const sourceUserId = typeof payload?.sourceUserId === "string" ? payload.sourceUserId : null;
      const id = typeof payload?.id === "string" ? payload.id : null;
      if (!sourceUserId || !id || sourceUserId === profile.id) return;

      if (payload?.active === false) {
        setRemoteDrafts((current) => current.filter((draft) => draft.id !== id));
        return;
      }

      const pageId = typeof payload.pageId === "string" ? payload.pageId : null;
      const type = tools.some((item) => item.id === payload.type) ? (payload.type as AnnotationTool) : null;
      const draftColor = typeof payload.color === "string" ? payload.color : null;
      const draftPayload = payload.payload && typeof payload.payload === "object" ? (payload.payload as Record<string, unknown>) : null;
      if (!pageId || !type || !draftColor || !draftPayload) return;

      setRemoteDrafts((current) => {
        const nextDraft: AnnotationDraftPreview = {
          id,
          sourceUserId,
          pageId,
          type,
          color: draftColor,
          payload: draftPayload,
          updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : new Date().toISOString()
        };
        return [...current.filter((draft) => draft.id !== id), nextDraft];
      });
    },
    [profile.id]
  );

  const refetchPermissions = useCallback(async () => {
    const { data } = await supabase.from("participant_permissions").select("*").eq("meeting_id", meeting.id);
    setPermissions((data ?? []) as ParticipantPermission[]);
  }, [meeting.id, supabase]);

  const refetchParticipants = useCallback(async () => {
    const { data } = await supabase.from("meeting_participants").select("*").eq("meeting_id", meeting.id).order("joined_at", { ascending: true });
    setParticipants((data ?? []) as MeetingParticipant[]);
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
    const timer = window.setTimeout(() => void refetchAnnotations(), 0);
    return () => window.clearTimeout(timer);
  }, [refetchAnnotations]);

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
    meetingChannelRef.current = channel;

    channel
      .on("broadcast", { event: REALTIME_EVENTS.documentUploaded }, ({ payload }) => {
        void refetchDocuments();
        const nextDocumentId = typeof payload?.documentId === "string" ? payload.documentId : null;
        const nextPageId = typeof payload?.pageId === "string" ? payload.pageId : null;
        if (nextDocumentId) setSelectedDocumentId(nextDocumentId);
        if (nextPageId) setSelectedPageId(nextPageId);
        if (!canUsePresenterControls) scrollToBoard();
      })
      .on("broadcast", { event: REALTIME_EVENTS.documentSelected }, ({ payload }) => {
        const nextDocumentId = typeof payload?.documentId === "string" ? payload.documentId : null;
        const nextPageId = typeof payload?.pageId === "string" ? payload.pageId : null;
        if (nextDocumentId) setSelectedDocumentId(nextDocumentId);
        if (nextPageId) setSelectedPageId(nextPageId);
        if (!canUsePresenterControls) scrollToBoard();
      })
      .on("broadcast", { event: REALTIME_EVENTS.pageChanged }, ({ payload }) => {
        if (typeof payload?.pageId === "string") setSelectedPageId(payload.pageId);
        if (!canUsePresenterControls) scrollToBoard();
      })
      .on("broadcast", { event: REALTIME_EVENTS.boardViewportChanged }, ({ payload }) => {
        const hasRatioViewport = typeof payload?.topRatio === "number" && typeof payload?.leftRatio === "number";
        const hasAbsoluteViewport = typeof payload?.viewportX === "number" && typeof payload?.viewportY === "number";
        if (
          (payload?.documentId === null || typeof payload?.documentId === "string") &&
          (payload?.pageId === null || typeof payload?.pageId === "string") &&
          (hasRatioViewport || hasAbsoluteViewport) &&
          typeof payload?.sourceUserId === "string"
        ) {
          applyRemoteBoardViewport(payload as BoardViewportPayload);
        }
      })
      .on("broadcast", { event: REALTIME_EVENTS.meetingStatusChanged }, ({ payload }) => {
        if (payload?.status === "live" || payload?.status === "scheduled" || payload?.status === "paused" || payload?.status === "completed" || payload?.status === "cancelled") {
          setMeeting((current) => ({ ...current, status: payload.status }));
          if (payload.status === "completed") {
            setScreenShareSession(null);
            void refetchParticipants();
          }
        }
      })
      .on("broadcast", { event: REALTIME_EVENTS.participantJoined }, () => void refetchParticipants())
      .on("broadcast", { event: REALTIME_EVENTS.participantLeft }, () => void refetchParticipants())
      .on("broadcast", { event: REALTIME_EVENTS.annotationDraftChanged }, ({ payload }) => applyAnnotationDraftPayload(payload as Record<string, unknown> | null | undefined))
      .on("broadcast", { event: REALTIME_EVENTS.annotationCreated }, ({ payload }) => applyAnnotationCreatedPayload(payload as Record<string, unknown> | null | undefined))
      .on("broadcast", { event: REALTIME_EVENTS.annotationUpdated }, ({ payload }) => applyAnnotationUpdatedPayload(payload as Record<string, unknown> | null | undefined))
      .on("broadcast", { event: REALTIME_EVENTS.annotationDeleted }, ({ payload }) => applyAnnotationDeletedPayload(payload as Record<string, unknown> | null | undefined))
      .on("broadcast", { event: REALTIME_EVENTS.annotationsCleared }, ({ payload }) => applyAnnotationsClearedPayload(payload as Record<string, unknown> | null | undefined))
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
      .on("broadcast", { event: REALTIME_EVENTS.screenStopped }, () => {
        setStageMode("board");
        void refetchScreenShareSession();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && profile.role === "participant") {
          void channel.send({
            type: "broadcast",
            event: REALTIME_EVENTS.participantJoined,
            payload: { userId: profile.id }
          });
        }
      });

    return () => {
      meetingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [
    applyAnnotationCreatedPayload,
    applyAnnotationDeletedPayload,
    applyAnnotationDraftPayload,
    applyAnnotationUpdatedPayload,
    applyAnnotationsClearedPayload,
    applyRemoteBoardViewport,
    canUsePresenterControls,
    meeting.id,
    profile.id,
    profile.role,
    refetchDocuments,
    refetchParticipants,
    refetchPermissions,
    refetchScreenShareSession,
    scrollToBoard,
    supabase
  ]);

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 5000;
      setRemoteDrafts((current) => current.filter((draft) => draft.pageId === selectedPageId && new Date(draft.updatedAt).getTime() > cutoff));
    }, 2500);

    return () => window.clearInterval(timer);
  }, [selectedPageId]);

  async function preparePages(file: File, documentType: MeetingDocument["document_type"]): Promise<PageDraft[]> {
    if (documentType === "pdf") return getPdfPageDrafts(file);
    if (documentType === "image") return [await getImagePageDraft(file)];
    if (isOfficeDocumentType(documentType)) return [{ pageNumber: 1, width: 1200, height: 800 }];
    return [];
  }

  async function saveAnnotatedSnapshot(reason: string) {
    setSavingSnapshot(true);
    setMessage(null);

    const { data, error } = await supabase.functions.invoke<WorkspaceExportResult>("generate-export", {
      body: { meetingId: meeting.id, exportType: "annotated_pdf" }
    });

    setSavingSnapshot(false);

    if (error || !data || data.status === "failed") {
      setMessage({ type: "error", text: error?.message ?? data?.error ?? "Annotated PDF could not be saved." });
      return false;
    }

    setMessage({
      type: "success",
      text: `Annotated PDF saved before ${reason}. The signed link is valid for 10 minutes.`,
      signedUrl: data.signedUrl
    });
    await sendMeetingBroadcast(REALTIME_EVENTS.exportReady, { exportType: "annotated_pdf", storagePath: data.storagePath ?? null });
    return true;
  }

  async function confirmSaveBeforeContinuing(reason: string) {
    if (!selectedDocumentHasAnnotations) return true;

    const shouldSave = window.confirm(
      `This board already has annotations. Save an annotated PDF before ${reason}?\n\nOK: save first and continue.\nCancel: choose whether to continue without saving.`
    );

    if (shouldSave) return saveAnnotatedSnapshot(reason);

    return window.confirm(`Continue ${reason} without saving an annotated PDF first?`);
  }

  async function handleUpload(file: File | null) {
    if (!file || !canUpload) return;
    const canContinue = await confirmSaveBeforeContinuing("uploading a new document");
    if (!canContinue) return;

    setUploading(true);
    setMessage(null);

    try {
      const documentType = getDocumentType(file.name, file.type);
      if (!documentType) throw new Error("Upload PDF, image, PowerPoint, Word, or Excel files only.");

      const documentId = crypto.randomUUID();
      const filename = sanitizeFilename(file.name);
      const storagePath = `${meeting.id}/${documentId}/original/${filename}`;
      const pageDrafts = await preparePages(file, documentType);
      const needsConversion = isOfficeDocumentType(documentType);
      const conversionStatus = needsConversion ? "pending" : "ready";

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
      let savedDocument = documentRow as MeetingDocument;

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

      if (needsConversion) {
        const fallbackError = getOfficeConversionFallbackError(documentType);
        const { data: conversionResult, error: conversionInvokeError } = await supabase.functions.invoke<{ status?: string; message?: string }>("pptx-convert", { body: { documentId } });
        if (conversionInvokeError) {
          await supabase
            .from("meeting_documents")
            .update({ conversion_status: "failed", conversion_error: fallbackError })
            .eq("id", documentId);
        }

        const { data: refreshedDocument } = await supabase.from("meeting_documents").select("*").eq("id", documentId).maybeSingle();
        savedDocument = (refreshedDocument as MeetingDocument | null) ?? {
          ...savedDocument,
          conversion_status: conversionInvokeError || conversionResult?.status === "failed" ? "failed" : savedDocument.conversion_status,
          conversion_error: conversionInvokeError ? fallbackError : conversionResult?.message ?? savedDocument.conversion_error
        };
      }

      const nextDocuments = [savedDocument, ...documents];
      const nextPages = [...pages, ...insertedPages];
      setDocuments(nextDocuments);
      setPages(nextPages);

      const firstPage = insertedPages[0];
      if (firstPage) {
        await selectDocumentPage(savedDocument, firstPage, { silent: true });
      }

      await sendMeetingBroadcast(REALTIME_EVENTS.documentUploaded, { documentId, pageId: firstPage?.id ?? null });

      setMessage({
        type: needsConversion ? (savedDocument.conversion_status === "failed" ? "info" : "success") : "success",
        text:
          needsConversion
            ? savedDocument.conversion_status === "failed"
              ? `${filename} is saved to the meeting. ${savedDocument.conversion_error ?? getOfficeConversionFallbackError(documentType)}`
              : `${filename} is saved to the meeting and conversion has started.`
            : "Document uploaded and ready for annotation."
      });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function createWhiteboard() {
    if (!canUpload) return;
    const canContinue = await confirmSaveBeforeContinuing("creating a new whiteboard");
    if (!canContinue) return;

    setUploading(true);
    setMessage(null);

    try {
      const documentId = crypto.randomUUID();
      const title = `Whiteboard ${new Date().toLocaleString()}`;
      const filename = `whiteboard-${Date.now()}.svg`;
      const whiteboard = createWhiteboardSvg(title);
      const storagePath = `${meeting.id}/${documentId}/original/${filename}`;

      const upload = await supabase.storage.from("meeting-documents").upload(storagePath, whiteboard, {
        contentType: "image/svg+xml",
        upsert: false
      });

      if (upload.error) throw upload.error;

      const { data: documentRow, error: documentError } = await supabase
        .from("meeting_documents")
        .insert({
          id: documentId,
          meeting_id: meeting.id,
          uploaded_by: profile.id,
          title,
          document_type: "image",
          storage_path: storagePath,
          original_filename: filename,
          mime_type: "image/svg+xml",
          file_size_bytes: whiteboard.size,
          conversion_status: "ready",
          page_count: 1
        })
        .select("*")
        .single();

      if (documentError || !documentRow) throw documentError ?? new Error("Whiteboard metadata could not be created.");

      const { data: pageRow, error: pageError } = await supabase
        .from("document_pages")
        .insert({
          document_id: documentId,
          meeting_id: meeting.id,
          page_number: 1,
          width: INFINITE_WHITEBOARD_WIDTH,
          height: INFINITE_WHITEBOARD_HEIGHT
        })
        .select("*")
        .single();

      if (pageError || !pageRow) throw pageError ?? new Error("Whiteboard page could not be created.");

      setDocuments((current) => [documentRow as MeetingDocument, ...current]);
      setPages((current) => [...current, pageRow as DocumentPage]);
      await selectDocumentPage(documentRow as MeetingDocument, pageRow as DocumentPage, { silent: true });
      await sendMeetingBroadcast(REALTIME_EVENTS.documentUploaded, { documentId, pageId: pageRow.id });
      setMessage({ type: "success", text: "Whiteboard created and broadcast to participants." });
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Whiteboard could not be created." });
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
      await sendMeetingBroadcast(REALTIME_EVENTS.documentSelected, { documentId: document.id, pageId: page.id });
    }

    scrollToBoard();
    await sendMeetingBroadcast(REALTIME_EVENTS.boardViewportChanged, {
      documentId: document.id,
      pageId: page.id,
      topRatio: 0,
      leftRatio: 0,
      sourceUserId: profile.id
    });
  }

  async function changePage(nextPage: DocumentPage) {
    if (!selectedDocument || !canUsePresenterControls) return;
    setSelectedPageId(nextPage.id);

    const { error } = await supabase.from("meetings").update({ selected_page_id: nextPage.id }).eq("id", meeting.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    await sendMeetingBroadcast(REALTIME_EVENTS.pageChanged, { pageId: nextPage.id });
    scrollToBoard();
    await sendMeetingBroadcast(REALTIME_EVENTS.boardViewportChanged, {
      documentId: selectedDocument.id,
      pageId: nextPage.id,
      topRatio: 0,
      leftRatio: 0,
      sourceUserId: profile.id
    });
  }

  async function createAnnotation(type: AnnotationTool, payload: Record<string, unknown>, annotationColor: string) {
    if (!selectedDocument || !selectedPage) return;
    setMessage(null);
    setAnnotationSaveStatus("saving");
    const now = new Date().toISOString();
    const pendingAnnotation: Annotation = {
      id: `pending-${crypto.randomUUID()}`,
      meeting_id: meeting.id,
      document_id: selectedDocument.id,
      page_id: selectedPage.id,
      user_id: profile.id,
      user_name_snapshot: profile.full_name,
      designation_snapshot: profile.designation,
      role_snapshot: profile.role,
      annotation_type: type,
      color: annotationColor,
      payload,
      version: 1,
      is_deleted: false,
      created_at: now,
      updated_at: now
    };
    setAnnotations((current) => [...current, pendingAnnotation]);

    const { data, error } = await supabase.functions.invoke<WorkspaceAnnotationsResult>("workspace-annotations", {
      body: {
        action: "create",
        meetingId: meeting.id,
        documentId: selectedDocument.id,
        pageId: selectedPage.id,
        annotationType: type,
        color: annotationColor,
        payload
      }
    });
    let annotation = data?.annotation;
    let fallbackMessage: string | null = null;

    if (error || data?.error || !annotation) {
      const fallback = await supabase.rpc("create_annotation_with_event", {
        p_meeting_id: meeting.id,
        p_document_id: selectedDocument.id,
        p_page_id: selectedPage.id,
        p_annotation_type: type,
        p_color: annotationColor,
        p_payload: payload as Json
      });

      if (!fallback.error && fallback.data) {
        annotation = fallback.data as Annotation;
      } else {
        fallbackMessage = fallback.error?.message ?? null;
      }
    }

    if (!annotation) {
      setAnnotationSaveStatus("error");
      removeAnnotation(pendingAnnotation.id);
      setMessage({
        type: "error",
        text:
          data?.error ??
          fallbackMessage ??
          error?.message ??
          "Annotation could not be saved. Deploy `workspace-annotations` and push the latest migrations, then refresh this room."
      });
      return;
    }

    setAnnotationSaveStatus("saved");
    setLastAnnotationSavedAt(new Date());
    setAnnotations((current) => current.map((item) => (item.id === pendingAnnotation.id ? annotation : item)));
    await sendMeetingBroadcast(REALTIME_EVENTS.annotationCreated, { annotation, annotationId: annotation.id, pageId: selectedPage.id });
  }

  async function deleteAnnotation(annotation: Annotation) {
    const { data, error } = await supabase.functions.invoke<WorkspaceAnnotationsResult>("workspace-annotations", {
      body: { action: "delete", annotationId: annotation.id }
    });
    const updated = data?.annotation;

    if (error || !updated) {
      setMessage({ type: "error", text: error?.message ?? data?.error ?? "Annotation could not be deleted." });
      return;
    }

    removeAnnotation(annotation.id);
    await sendMeetingBroadcast(REALTIME_EVENTS.annotationDeleted, { annotationId: annotation.id, pageId: annotation.page_id });
  }

  async function updateAnnotation(
    annotation: Annotation,
    patch: Partial<Pick<Annotation, "color" | "payload">>
  ) {
    if (!canUsePresenterControls) return;

    const nextColor = patch.color ?? annotation.color;
    const nextPayload = patch.payload ?? annotation.payload;
    const { data, error } = await supabase.functions.invoke<WorkspaceAnnotationsResult>("workspace-annotations", {
      body: {
        action: "update",
        annotationId: annotation.id,
        color: nextColor,
        payload: nextPayload
      }
    });
    const updated = data?.annotation;

    if (error || !updated) {
      setMessage({ type: "error", text: error?.message ?? data?.error ?? "Annotation could not be updated." });
      return;
    }

    upsertAnnotation(updated);
    await sendMeetingBroadcast(REALTIME_EVENTS.annotationUpdated, { annotation: updated, annotationId: annotation.id, pageId: annotation.page_id });
    setMessage({ type: "success", text: "Annotation updated for everyone." });
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
      await sendMeetingBroadcast(REALTIME_EVENTS.meetingStatusChanged, { status: "live" });
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
    await sendMeetingBroadcast(REALTIME_EVENTS.permissionsChanged, { participantAnnotationEnabled: enabled });
  }

  async function setDocumentLocked(locked: boolean) {
    if (!canUsePresenterControls) return;

    const { error } = await supabase.from("meetings").update({ document_locked: locked }).eq("id", meeting.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    setMeeting((current) => ({ ...current, document_locked: locked }));
    await sendMeetingBroadcast(locked ? REALTIME_EVENTS.documentLocked : REALTIME_EVENTS.documentUnlocked, { documentLocked: locked });
    await sendMeetingBroadcast(REALTIME_EVENTS.permissionsChanged, { documentLocked: locked });
  }

  async function clearCurrentPageAnnotations() {
    if (!canUsePresenterControls || !selectedDocument || !selectedPage) return;

    const clearCount = pageAnnotations.length;
    if (clearCount === 0) {
      setMessage({ type: "info", text: "There are no annotations on the selected page to clear." });
      return;
    }

    const { data, error } = await supabase.functions.invoke<WorkspaceAnnotationsResult>("workspace-annotations", {
      body: {
        action: "clear",
        meetingId: meeting.id,
        documentId: selectedDocument.id,
        pageId: selectedPage.id
      }
    });

    if (error || data?.error) {
      setMessage({ type: "error", text: error?.message ?? data?.error ?? "Annotations could not be cleared." });
      return;
    }

    setAnnotations((current) => current.filter((annotation) => annotation.page_id !== selectedPage.id));
    await sendMeetingBroadcast(REALTIME_EVENTS.annotationsCleared, { pageId: selectedPage.id, clearCount });
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
    await sendMeetingBroadcast(REALTIME_EVENTS.permissionsChanged, { userId: participant.user_id });
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
    setStageMode("board");
    await sendMeetingBroadcast(REALTIME_EVENTS.screenStarted, { sessionId: data.id });
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
    await sendMeetingBroadcast(REALTIME_EVENTS.screenPaused, { sessionId: data.id });
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
    setStageMode("board");
    await sendMeetingBroadcast(REALTIME_EVENTS.screenStopped, { sessionId: stoppedSessionId });
  }

  function canBroadcastBoardViewport() {
    if (!canUsePresenterControls || suppressScrollBroadcastRef.current) return false;
    const now = Date.now();
    if (now - lastScrollBroadcastRef.current < 260) return false;
    lastScrollBroadcastRef.current = now;
    return true;
  }

  function sendBoardViewport(payload: Omit<BoardViewportPayload, "documentId" | "pageId" | "sourceUserId">) {
    void sendMeetingBroadcast(REALTIME_EVENTS.boardViewportChanged, {
      documentId: selectedDocumentId,
      pageId: selectedPageId,
      ...payload,
      sourceUserId: profile.id
    });
  }

  function broadcastBoardViewportFromSize(size: BoardSize) {
    if (!canBroadcastBoardViewport()) return;

    if (size.infinite) {
      sendBoardViewport({
        viewportX: size.offsetX ?? 0,
        viewportY: size.offsetY ?? 0,
        viewportZoom: size.scaleX
      });
      return;
    }

    const maxX = Math.max(0, (size.sourceWidth ?? size.width / Math.max(size.scaleX, 0.0001)) - size.width / Math.max(size.scaleX, 0.0001));
    const maxY = Math.max(0, (size.sourceHeight ?? size.height / Math.max(size.scaleY, 0.0001)) - size.height / Math.max(size.scaleY, 0.0001));
    sendBoardViewport({
      topRatio: getScrollRatio({ value: size.offsetY ?? 0, max: maxY }),
      leftRatio: getScrollRatio({ value: size.offsetX ?? 0, max: maxX })
    });
  }

  function broadcastBoardViewport() {
    const container = boardScrollRef.current;
    if (!container || !canBroadcastBoardViewport()) return;

    sendBoardViewport({
      topRatio: getScrollRatio({ value: container.scrollTop, max: container.scrollHeight - container.clientHeight }),
      leftRatio: getScrollRatio({ value: container.scrollLeft, max: container.scrollWidth - container.clientWidth })
    });
  }

  function broadcastAnnotationDraft(draft: Omit<AnnotationDraftPreview, "sourceUserId" | "pageId" | "updatedAt"> | null) {
    if (!selectedPageId) return;

    if (!draft) {
      const draftId = activeDraftIdRef.current;
      activeDraftIdRef.current = null;
      lastDraftBroadcastRef.current = 0;
      if (!draftId) return;
      void sendMeetingBroadcast(REALTIME_EVENTS.annotationDraftChanged, {
        id: draftId,
        sourceUserId: profile.id,
        pageId: selectedPageId,
        active: false
      });
      return;
    }

    activeDraftIdRef.current = draft.id;
    const now = Date.now();
    if (now - lastDraftBroadcastRef.current < 36) return;
    lastDraftBroadcastRef.current = now;

    void sendMeetingBroadcast(REALTIME_EVENTS.annotationDraftChanged, {
      ...draft,
      sourceUserId: profile.id,
      pageId: selectedPageId,
      active: true,
      updatedAt: new Date().toISOString()
    });
  }

  async function leaveMeeting() {
    if (leavingMeeting) return;
    setLeavingMeeting(true);
    await fetch(`/meetings/${meeting.id}/attendance/leave`, { method: "POST" });
    await sendMeetingBroadcast(REALTIME_EVENTS.participantLeft, { userId: profile.id });
    router.push(getMeetingLeaveDestination(profile.role));
  }

  function endMeeting() {
    if (!canUsePresenterControls) return;
    startTransition(async () => {
      const canContinue = await confirmSaveBeforeContinuing("ending the meeting");
      if (!canContinue) return;

      const result = await endMeetingAction(meeting.id);
      if (!result.ok) {
        setMessage({ type: "error", text: result.message });
        return;
      }

      setMeeting((current) => ({ ...current, status: "completed", ended_at: new Date().toISOString(), downloads_enabled: true }));
      setScreenShareSession(null);
      setParticipants((current) => current.map((participant) => ({ ...participant, is_present: false, left_at: participant.left_at ?? new Date().toISOString() })));
      setMessage({ type: "success", text: result.message });
      await sendMeetingBroadcast(REALTIME_EVENTS.meetingStatusChanged, { status: "completed" });
      await sendMeetingBroadcast(REALTIME_EVENTS.screenStopped, { sessionId: screenShareSession?.id ?? null });
      router.refresh();
    });
  }

  const selectedPageIndex = selectedDocumentPages.findIndex((page) => page.id === selectedPage?.id);

  const annotationStatusText =
    annotationSaveStatus === "saving"
      ? "Saving annotation..."
      : annotationSaveStatus === "saved"
        ? `Saved${lastAnnotationSavedAt ? ` ${lastAnnotationSavedAt.toLocaleTimeString()}` : ""}`
        : annotationSaveStatus === "error"
          ? "Save failed"
          : "Ready";
  const meetingStatusTone = meeting.status === "live" ? "success" : meeting.status === "completed" || meeting.status === "cancelled" ? "danger" : "warning";
  const annotationStatusTone = annotationSaveStatus === "error" ? "danger" : annotationSaveStatus === "saved" ? "success" : annotationSaveStatus === "saving" ? "warning" : "neutral";
  const visibleRemoteDrafts = selectedPageId ? remoteDrafts.filter((draft) => draft.pageId === selectedPageId) : [];
  const shouldShowFloatingScreen = canUseScreenShare && boardIsMainStage && (canUsePresenterControls || isPresentationLive || screenShareSession?.status === "paused");
  const shouldShowScreenPanel = canUseScreenShare && (screenIsMainStage || shouldShowFloatingScreen);
  const shouldShowFloatingBoard = screenIsMainStage;
  const boardAvailabilityText =
    selectedDocumentIsWhiteboard && boardPanEnabled
      ? "Move board"
      : canAnnotate
        ? "Annotation enabled"
        : canAnnotateByPermission && !boardIsMainStage
          ? "Board parked"
          : meeting.document_locked
            ? "Board locked"
            : "Annotation unavailable";
  const activeTool = tools.find((item) => item.id === tool) ?? tools[0];
  const activeToolLabel = selectedDocumentIsWhiteboard && boardPanEnabled ? "Move" : activeTool.label;
  const boardToolColumnCount = selectedDocumentIsWhiteboard ? tools.length + 2 : tools.length + 1;

  return (
    <div ref={workspaceRootRef} className="fixed inset-0 z-50 h-[100svh] w-screen overflow-hidden bg-slate-950 text-white">
      <input
        ref={quickUploadInputRef}
        disabled={uploading || savingSnapshot}
        className="sr-only"
        type="file"
        accept=".pdf,image/png,image/jpeg,image/webp,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
        onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
      />

      <div className="absolute inset-0 bg-[linear-gradient(135deg,#04111f,#0f172a_48%,#101827)]" />

      {message ? (
        <Alert className={cn("absolute left-3 right-3 top-[calc(env(safe-area-inset-top)+4.8rem)] z-50 mx-auto max-w-3xl border bg-white/95 pr-12 text-slate-950 shadow-[0_18px_60px_-28px_rgba(0,0,0,0.75)] backdrop-blur-xl", message.type === "error" && "border-rose-300 text-rose-700", message.type === "success" && "border-emerald-200 text-emerald-800")}>
          <AlertTitle>{message.type === "error" ? "Workspace issue" : message.type === "success" ? "Workspace updated" : "Workspace notice"}</AlertTitle>
          <AlertDescription className="space-y-3">
            <span className="block">{message.text}</span>
            {message.signedUrl ? (
              <Button asChild size="sm">
                <a href={message.signedUrl} rel="noreferrer" target="_blank">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download saved PDF
                </a>
              </Button>
            ) : null}
          </AlertDescription>
          <button aria-label="Dismiss notice" className="absolute right-3 top-3 rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-950" onClick={() => setMessage(null)} type="button">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </Alert>
      ) : null}

      <header className="safe-top pointer-events-none absolute inset-x-0 top-0 z-40 px-2 sm:px-4">
        <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/78 px-3 py-2 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StagePill tone={meetingStatusTone}>{meeting.status}</StagePill>
              <span className="truncate text-sm font-black sm:text-base">{getStageModeLabel(stageMode)}</span>
            </div>
            <p className="mt-1 max-w-[52vw] truncate text-xs text-white/60 sm:max-w-2xl">
              {selectedDocument ? selectedDocument.title : "No board selected"} | {presenceUsers.length} online | Code {meeting.code}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StagePill tone={annotationStatusTone}>{annotationStatusText}</StagePill>
            <button aria-label="Open meeting menu" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/18" onClick={() => setMorePanel("meeting")} type="button">
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 h-full w-full overflow-hidden px-2 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pt-[calc(env(safe-area-inset-top)+5rem)]">
        {boardIsMainStage ? (
          <section ref={boardSectionRef} id="annotation-board" tabIndex={-1} className="h-full min-h-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] shadow-[0_30px_90px_-48px_rgba(0,0,0,0.92)] outline-none backdrop-blur">
            {!selectedDocument || !selectedPage ? (
              <div className="flex h-full items-center justify-center p-5 text-center">
                <div className="max-w-sm">
                  <FileUp className="mx-auto mb-3 h-10 w-10 text-emerald-300" aria-hidden="true" />
                  <p className="text-xl font-black">No board selected</p>
                  <p className="mt-2 text-sm leading-6 text-white/65">Upload a PDF/image or create a whiteboard to start the shared canvas.</p>
                  {canUsePresenterControls ? (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button disabled={uploading || savingSnapshot} onClick={() => quickUploadInputRef.current?.click()} type="button" className="rounded-2xl bg-emerald-400 font-black text-emerald-950 hover:bg-emerald-300">
                        <FileUp className="h-4 w-4" aria-hidden="true" />
                        Upload
                      </Button>
                      <Button disabled={uploading || savingSnapshot} onClick={createWhiteboard} type="button" variant="outline" className="rounded-2xl border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Board
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div
                ref={boardScrollRef}
                onScroll={broadcastBoardViewport}
                className="h-full w-full overflow-hidden p-1 sm:p-2"
              >
                <DocumentRenderer
                  document={selectedDocument}
                  page={selectedPage}
                  signedUrl={signedUrl}
                  onSizeChange={onSizeChange}
                  onViewportChange={broadcastBoardViewportFromSize}
                  panEnabled={selectedDocumentIsWhiteboard && boardPanEnabled}
                  viewportRequest={boardViewportRequest}
                  frameClassName="border-white/80 shadow-[0_22px_70px_-38px_rgba(0,0,0,0.7)]"
                >
                  <AnnotationCanvas
                    annotations={pageAnnotations}
                    remoteDrafts={visibleRemoteDrafts}
                    board={board}
                    tool={tool}
                    color={color}
                    canAnnotate={canAnnotate}
                    onCreate={createAnnotation}
                    onDelete={deleteAnnotation}
                    onDraftChange={broadcastAnnotationDraft}
                  />
                </DocumentRenderer>
              </div>
            )}
            <div className="pointer-events-none absolute left-3 top-[calc(env(safe-area-inset-top)+4.65rem)] z-20 hidden rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs font-black text-white/80 backdrop-blur-xl sm:block">
              {boardAvailabilityText} | {activeToolLabel}
            </div>
          </section>
        ) : (
          <section className="h-full min-h-0 overflow-hidden rounded-lg border border-white/10 bg-black shadow-[0_30px_90px_-48px_rgba(0,0,0,0.92)]" aria-label="Live screen stage" />
        )}
      </main>

      {shouldShowScreenPanel ? (
        <ScreenSharePanel
          allowPresenterControls={canUsePresenterControls}
          meetingId={meeting.id}
          onOpenBoard={focusBoardStage}
          onFocusBoard={focusBoardStage}
          onFocusScreen={focusScreenStage}
          presentation={screenIsMainStage ? "stage" : "floating"}
          session={screenShareSession}
          onStarted={markScreenShareStarted}
          onPaused={markScreenSharePaused}
          onStopped={markScreenShareStopped}
        />
      ) : null}

      {boardIsMainStage && selectedDocument && selectedPage ? (
        <div className="pointer-events-none absolute inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+4.9rem)] z-40 flex justify-center sm:bottom-[calc(env(safe-area-inset-bottom)+5.35rem)]">
          <div
            className="pointer-events-auto grid w-full max-w-[min(calc(100vw-1rem),28rem)] gap-1 rounded-2xl border border-white/10 bg-slate-950/86 p-1.5 shadow-[0_22px_70px_-36px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
            style={{ gridTemplateColumns: `repeat(${boardToolColumnCount}, minmax(0, 1fr))` }}
          >
            {selectedDocumentIsWhiteboard ? (
              <button
                aria-label={boardPanEnabled ? "Disable whiteboard pan" : "Enable whiteboard pan"}
                title={boardPanEnabled ? "Disable whiteboard pan" : "Enable whiteboard pan"}
                className={cn("flex h-9 min-w-0 items-center justify-center rounded-xl border text-white transition", boardPanEnabled ? "border-white bg-white text-slate-950" : "border-white/10 bg-white/10 hover:bg-white/18")}
                onClick={() => setBoardPanEnabled((current) => !current)}
                type="button"
              >
                <Move className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {tools.map((item) => (
              <button
                key={item.id}
                aria-label={item.label}
                title={item.label}
                className={cn("flex h-9 min-w-0 items-center justify-center rounded-xl border text-white transition", !boardPanEnabled && tool === item.id ? "border-white bg-white text-slate-950" : "border-white/10 bg-white/10 hover:bg-white/18")}
                onClick={() => {
                  setTool(item.id);
                  setBoardPanEnabled(false);
                }}
                type="button"
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
            <label className="relative flex h-9 min-w-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/10" title="Color">
              <input aria-label="Annotation color" value={color} onChange={(event) => setColor(event.target.value)} type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25" style={{ backgroundColor: color }}>
                <Palette className="h-3.5 w-3.5 text-white drop-shadow" aria-hidden="true" />
              </span>
            </label>
          </div>
        </div>
      ) : null}

      {shouldShowFloatingBoard ? (
        floatingBoardMinimized ? (
          <button
            aria-label="Open Annotation"
            className="fixed right-3 top-[calc(env(safe-area-inset-top)+4.9rem)] z-40 inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-slate-950/92 px-3 text-xs font-black text-white shadow-[0_18px_60px_-28px_rgba(0,0,0,0.9)] backdrop-blur-2xl transition hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:right-4"
            onClick={() => setFloatingBoardMinimized(false)}
            type="button"
          >
            <FileText className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <span>Annotation</span>
          </button>
        ) : (
          <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+4.9rem)] z-40 w-[min(56vw,20rem)] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/92 text-white shadow-[0_28px_90px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:right-4">
            <div className="relative aspect-video min-h-28 overflow-hidden rounded-2xl bg-white/8">
              {selectedDocument && selectedPage ? (
                <DocumentRenderer
                  document={selectedDocument}
                  page={selectedPage}
                  signedUrl={signedUrl}
                  onSizeChange={onFloatingSizeChange}
                  showWhiteboardControls={false}
                  frameClassName="rounded-2xl border-white/40"
                >
                  <AnnotationCanvas
                    annotations={pageAnnotations}
                    remoteDrafts={visibleRemoteDrafts}
                    board={floatingBoard}
                    tool={tool}
                    color={color}
                    canAnnotate={false}
                    onCreate={async () => undefined}
                    onDelete={async () => undefined}
                  />
                </DocumentRenderer>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <FileText className="h-8 w-8 text-white/45" aria-hidden="true" />
                </div>
              )}
              <div className="absolute right-2 top-2 z-10 flex gap-1.5 rounded-full border border-white/10 bg-slate-950/70 p-1.5 backdrop-blur-xl">
                <button
                  aria-label="Make annotation board full screen"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-slate-950/72 text-white transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  onClick={focusBoardStage}
                  title="Make annotation board full screen"
                  type="button"
                >
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  aria-label="Minimize annotation board"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-slate-950/72 text-white transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  onClick={() => setFloatingBoardMinimized(true)}
                  title="Minimize annotation board"
                  type="button"
                >
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )
      ) : null}

      <div className="pointer-events-none fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.45rem)] z-40">
        <div className="pointer-events-auto mx-auto flex w-fit max-w-[calc(100vw-1rem)] items-center gap-1 rounded-[1.6rem] border border-white/15 bg-slate-950/95 px-2 py-1.5 text-white shadow-[0_24px_90px_-34px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
          <MeetDockButton
            active={boardIsMainStage}
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            label="Board"
            onClick={focusBoardStage}
          />
          {canUseScreenShare ? (
            <MeetDockButton
              active={screenIsMainStage}
              icon={<MonitorUp className="h-5 w-5" aria-hidden="true" />}
              label="Screen"
              onClick={focusScreenStage}
            />
          ) : null}
          <MeetDockButton
            active={false}
            icon={isWorkspaceFullscreen ? <Minimize2 className="h-5 w-5" aria-hidden="true" /> : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
            label={isWorkspaceFullscreen ? "Exit" : "Full"}
            onClick={toggleWorkspaceFullscreen}
          />
          {canUsePresenterControls && selectedDocumentPages.length > 0 ? (
            <>
              <MeetDockButton
                disabled={!canUsePresenterControls || selectedPageIndex <= 0}
                icon={<ChevronLeft className="h-5 w-5" aria-hidden="true" />}
                label="Prev"
                onClick={() => changePage(selectedDocumentPages[selectedPageIndex - 1])}
              />
              <MeetDockButton
                disabled={!canUsePresenterControls || selectedPageIndex < 0 || selectedPageIndex >= selectedDocumentPages.length - 1}
                icon={<ChevronRight className="h-5 w-5" aria-hidden="true" />}
                label="Next"
                onClick={() => changePage(selectedDocumentPages[selectedPageIndex + 1])}
              />
            </>
          ) : null}
          {canUsePresenterControls && meeting.status !== "live" && meeting.status !== "completed" && meeting.status !== "cancelled" ? (
            <MeetDockButton
              active
              disabled={isPending}
              icon={isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <PlayCircle className="h-5 w-5" aria-hidden="true" />}
              label="Start"
              onClick={startWorkspace}
            />
          ) : null}
          <MeetDockButton
            icon={<MoreHorizontal className="h-5 w-5" aria-hidden="true" />}
            label="More"
            onClick={() => setMorePanel("meeting")}
          />
          {canUsePresenterControls && meeting.status === "live" ? (
            <MeetDockButton
              danger
              disabled={isPending || savingSnapshot}
              icon={<StopCircle className="h-5 w-5" aria-hidden="true" />}
              label="End"
              onClick={endMeeting}
            />
          ) : null}
          {profile.role === "participant" ? (
            <MeetDockButton
              danger
              disabled={leavingMeeting}
              icon={<LogOut className="h-5 w-5" aria-hidden="true" />}
              label="Leave"
              onClick={leaveMeeting}
            />
          ) : null}
        </div>
      </div>

      {morePanel ? (
        <div className="fixed inset-0 z-50">
          <button aria-label="Close meeting menu" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setMorePanel(null)} type="button" />
          <div className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-2xl border border-white/12 bg-slate-950/98 p-3 text-white shadow-[0_-28px_90px_-35px_rgba(0,0,0,0.92)] backdrop-blur-2xl sm:left-auto sm:right-4 sm:w-[28rem] sm:rounded-2xl sm:bottom-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-black">Meeting controls</p>
                <p className="text-xs text-white/55">{boardAvailabilityText} | {presenceUsers.length} online</p>
              </div>
              <button aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 hover:bg-white/18" onClick={() => setMorePanel(null)} type="button">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-white/8 p-1">
              {[
                { id: "meeting" as const, label: "Meet" },
                { id: "documents" as const, label: "Docs" },
                { id: "people" as const, label: "People" },
                { id: "annotations" as const, label: "Ink" }
              ].map((item) => (
                <button key={item.id} className={cn("min-h-10 rounded-lg text-xs font-black", morePanel === item.id ? "bg-white text-slate-950" : "text-white/72 hover:bg-white/10")} onClick={() => setMorePanel(item.id)} type="button">
                  {item.label}
                </button>
              ))}
            </div>

            <div className="max-h-[min(68svh,34rem)] overflow-y-auto pr-1 [scrollbar-width:thin]">
              {morePanel === "meeting" ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg border border-white/10 bg-white/8 p-3">
                      <p className="text-xs text-white/55">Code</p>
                      <p className="mt-1 break-all text-xl font-black tracking-[0.2em] text-emerald-300">{meeting.code}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/8 p-3">
                      <p className="text-xs text-white/55">Page</p>
                      <p className="mt-1 text-xl font-black">{selectedPage ? `${selectedPage.page_number}/${Math.max(selectedDocumentPages.length, 1)}` : "--"}</p>
                    </div>
                  </div>
                  {canUsePresenterControls ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={() => setParticipantAnnotationEnabled(!meeting.participant_annotation_enabled)} type="button" variant="outline" className="rounded-xl border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                        <Highlighter className="h-4 w-4" aria-hidden="true" />
                        {meeting.participant_annotation_enabled ? "Annotation on" : "Annotation off"}
                      </Button>
                      <Button onClick={() => setDocumentLocked(!meeting.document_locked)} type="button" variant="outline" className="rounded-xl border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                        {meeting.document_locked ? <Lock className="h-4 w-4" aria-hidden="true" /> : <LockOpen className="h-4 w-4" aria-hidden="true" />}
                        {meeting.document_locked ? "Locked" : "Unlocked"}
                      </Button>
                      <Button disabled={!selectedPage || pageAnnotations.length === 0} onClick={clearCurrentPageAnnotations} type="button" variant="outline" className="rounded-xl border-rose-300/30 bg-rose-500/15 text-rose-50 hover:bg-rose-500 hover:text-white">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Clear page
                      </Button>
                      <Button asChild variant="outline" className="rounded-xl border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                        <a href={`/meetings/${meeting.id}/exports`}>
                          <Download className="h-4 w-4" aria-hidden="true" />
                          Exports
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {morePanel === "documents" ? (
                <div className="space-y-3">
                  {canUpload ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button disabled={uploading || savingSnapshot} onClick={() => quickUploadInputRef.current?.click()} type="button" className="rounded-xl bg-emerald-400 font-black text-emerald-950 hover:bg-emerald-300">
                        {uploading || savingSnapshot ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
                        Upload
                      </Button>
                      <Button disabled={uploading || savingSnapshot} onClick={createWhiteboard} type="button" variant="outline" className="rounded-xl border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Whiteboard
                      </Button>
                    </div>
                  ) : null}
                  {selectedDocumentHasAnnotations ? <p className="rounded-lg bg-amber-400/10 p-3 text-xs text-amber-100">Saving will be requested before replacing a board that has annotations.</p> : null}
                  <div className="grid gap-2">
                    {documents.length === 0 ? <p className="text-sm text-white/60">No documents uploaded yet.</p> : null}
                    {documents.map((document) => {
                      const docPages = pages.filter((page) => page.document_id === document.id).sort((a, b) => a.page_number - b.page_number);
                      const firstPage = docPages[0];
                      const Icon = document.document_type === "image" ? ImageIcon : document.document_type === "pdf" ? FileUp : Presentation;
                      return (
                        <div key={document.id} className="rounded-lg border border-white/10 bg-white/8 p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-emerald-200">
                              <Icon className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black">{document.title}</p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                <Badge variant="secondary">{document.document_type}</Badge>
                                <Badge variant={document.conversion_status === "ready" ? "success" : "outline"}>{document.conversion_status}</Badge>
                              </div>
                              {document.conversion_error ? <p className="mt-2 text-xs text-rose-200">{document.conversion_error}</p> : null}
                            </div>
                          </div>
                          {firstPage ? (
                            <Button className={cn("mt-3 w-full rounded-xl", selectedDocumentId === document.id ? "bg-emerald-400 font-black text-emerald-950 hover:bg-emerald-300" : "border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950")} disabled={!canUsePresenterControls} onClick={() => selectDocumentPage(document, firstPage)} size="sm" variant={selectedDocumentId === document.id ? "default" : "outline"}>
                              {selectedDocumentId === document.id ? "Selected" : "Broadcast"}
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {morePanel === "people" ? (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    {presenceUsers.length === 0 ? <p className="text-sm text-white/60">Presence is connecting...</p> : null}
                    {presenceUsers.map((user) => (
                      <div key={`${user.userId}-${user.onlineAt}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/8 p-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: user.color ?? "#0f4c5c" }} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black">{user.name}</p>
                            <p className="text-xs text-white/55">{user.role}</p>
                          </div>
                        </div>
                        <Badge variant="success">online</Badge>
                      </div>
                    ))}
                  </div>
                  {canUsePresenterControls ? (
                    <div className="grid gap-2">
                      {participantControlRows.length === 0 ? <p className="text-sm text-white/60">No participant attendance records yet.</p> : null}
                      {participantControlRows.map((participant) => {
                        const permission = permissions.find((item) => item.user_id === participant.user_id);
                        const canAnnotateParticipant = permission?.can_annotate ?? true;
                        const isMuted = permission?.is_muted_from_annotation ?? false;
                        const canDownload = permission?.can_download ?? false;

                        return (
                          <div key={participant.id} className="rounded-lg border border-white/10 bg-white/8 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black">{participant.name_snapshot}</p>
                                <p className="text-xs text-white/55">{participant.designation_snapshot ?? "No designation"}</p>
                              </div>
                              <Badge variant={participant.is_present ? "success" : "outline"}>{participant.is_present ? "present" : "left"}</Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              <Button onClick={() => updateParticipantPermission(participant, { can_annotate: !canAnnotateParticipant })} size="sm" type="button" variant="outline" className={cn("rounded-xl border-white/15 bg-white/10 text-xs text-white hover:bg-white hover:text-slate-950", canAnnotateParticipant && "bg-emerald-400 text-emerald-950 hover:bg-emerald-300")}>
                                Ink
                              </Button>
                              <Button onClick={() => updateParticipantPermission(participant, { is_muted_from_annotation: !isMuted })} size="sm" type="button" variant="outline" className={cn("rounded-xl border-white/15 bg-white/10 text-xs text-white hover:bg-white hover:text-slate-950", isMuted && "bg-rose-500 text-white hover:bg-rose-400")}>
                                Mute
                              </Button>
                              <Button onClick={() => updateParticipantPermission(participant, { can_download: !canDownload })} size="sm" type="button" variant="outline" className={cn("rounded-xl border-white/15 bg-white/10 text-xs text-white hover:bg-white hover:text-slate-950", canDownload && "bg-emerald-400 text-emerald-950 hover:bg-emerald-300")}>
                                Files
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {morePanel === "annotations" ? (
                <div className="space-y-2">
                  {pageAnnotations.length === 0 ? <p className="text-sm text-white/60">No annotations on this page yet.</p> : null}
                  {pageAnnotations.map((annotation) => (
                    <div key={annotation.id} className="rounded-lg border border-white/10 bg-white/8 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">{annotation.user_name_snapshot}</p>
                          <p className="text-xs text-white/55">{annotation.annotation_type} | {annotation.role_snapshot}</p>
                        </div>
                        <span className="h-5 w-5 shrink-0 rounded-full border border-white/40" style={{ backgroundColor: annotation.color }} />
                      </div>
                      {canUsePresenterControls ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button onClick={() => updateAnnotation(annotation, { color })} size="sm" type="button" variant="outline" className="rounded-xl border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                            Color
                          </Button>
                          {annotation.annotation_type === "text" ? (
                            <Button
                              onClick={() => {
                                const nextText = window.prompt("Edit annotation text", String(annotation.payload.text ?? ""));
                                if (nextText?.trim()) {
                                  void updateAnnotation(annotation, {
                                    payload: { ...annotation.payload, text: nextText.trim() }
                                  });
                                }
                              }}
                              size="sm"
                              type="button"
                              variant="outline"
                              className="rounded-xl border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950"
                            >
                              Text
                            </Button>
                          ) : (
                            <Button disabled size="sm" type="button" variant="outline" className="rounded-xl border-white/15 bg-white/10 text-white">
                              Shape
                            </Button>
                          )}
                          <Button className="col-span-2 rounded-xl border-rose-300/30 bg-rose-500/15 text-rose-50 hover:bg-rose-500 hover:text-white" onClick={() => deleteAnnotation(annotation)} size="sm" type="button" variant="outline">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Remove
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
