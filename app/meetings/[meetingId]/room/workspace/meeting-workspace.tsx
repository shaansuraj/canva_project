"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
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
  MonitorUp,
  MousePointer2,
  PenLine,
  PlayCircle,
  Plus,
  Presentation,
  RectangleHorizontal,
  StopCircle,
  Trash2,
  Type,
  UsersRound
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { endMeetingAction, startMeetingWorkspaceAction } from "../actions";
import type { AnnotationCanvasProps } from "./annotation-canvas";
import { type BoardSize, DocumentRenderer } from "./document-renderer";
import { ScreenSharePanel } from "./screen-share-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type BoardViewportPayload = {
  documentId: string | null;
  pageId: string | null;
  topRatio: number;
  leftRatio: number;
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

function createWhiteboardSvg(title: string) {
  return new Blob(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-label="${title}">
  <rect width="1600" height="1000" fill="#fffdf7"/>
  <path d="M0 80H1600M0 160H1600M0 240H1600M0 320H1600M0 400H1600M0 480H1600M0 560H1600M0 640H1600M0 720H1600M0 800H1600M0 880H1600M0 960H1600" stroke="#e9e2d2" stroke-width="2"/>
  <path d="M80 0V1000M160 0V1000M240 0V1000M320 0V1000M400 0V1000M480 0V1000M560 0V1000M640 0V1000M720 0V1000M800 0V1000M880 0V1000M960 0V1000M1040 0V1000M1120 0V1000M1200 0V1000M1280 0V1000M1360 0V1000M1440 0V1000M1520 0V1000" stroke="#f1eadc" stroke-width="2"/>
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

function StageToggleButton({
  active,
  children,
  onClick
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-black transition",
        active ? "border-white bg-white text-slate-950 shadow-lg shadow-black/20" : "border-white/15 bg-white/10 text-white hover:bg-white/18"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
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
      className={cn(
        "group flex min-w-[4.75rem] shrink-0 flex-col items-center gap-1 rounded-3xl px-2 py-1.5 text-[0.7rem] font-black text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-45",
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
          "flex h-12 w-12 items-center justify-center rounded-full border text-white shadow-[0_14px_34px_-24px_rgba(0,0,0,0.9)] transition",
          active && "border-white bg-white text-slate-950",
          danger && "border-rose-300/35 bg-rose-500 text-white group-hover:bg-rose-400",
          !active && !danger && "border-white/12 bg-white/12 group-hover:bg-white/20"
        )}
      >
        {icon}
      </span>
      <span className="max-w-[4.75rem] truncate">{label}</span>
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
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string; signedUrl?: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [leavingMeeting, setLeavingMeeting] = useState(false);
  const [stageMode, setStageMode] = useState<MeetingStageMode>("board");
  const [isWorkspaceFullscreen, setIsWorkspaceFullscreen] = useState(false);
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<AnnotationSaveStatus>("idle");
  const [lastAnnotationSavedAt, setLastAnnotationSavedAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;
  const selectedDocumentPages = selectedDocument ? pages.filter((page) => page.document_id === selectedDocument.id).sort((a, b) => a.page_number - b.page_number) : [];
  const pageAnnotations = selectedPageId ? annotations.filter((annotation) => annotation.page_id === selectedPageId && !annotation.is_deleted) : [];
  const canUsePresenterControls = canUsePresenterConsoleControls({ profile, meeting, mode });
  const currentPermission = profile.role === "participant" ? permissions.find((permission) => permission.user_id === profile.id) ?? null : null;
  const canUpload = canUsePresenterControls;
  const canUseScreenShare = canConnectToScreenShare(profile.role);
  const boardIsMainStage = stageMode === "board";
  const screenIsMainStage = stageMode === "screen";
  const canAnnotateByPermission = Boolean(selectedDocument && selectedPage && isRenderableDocument(selectedDocument) && canCurrentUserAnnotate({ profile, meeting, permission: currentPermission }));
  const canAnnotate = canAnnotateInStage(canAnnotateByPermission, stageMode);
  const participantControlRows = participants.filter((participant) => participant.role_snapshot === "participant");
  const selectedDocumentHasAnnotations = hasSavableAnnotations(annotations, selectedDocumentId);
  const isPresentationLive = screenShareSession?.status === "live";
  const useCompactMeetingDock = isPresentationLive || isWorkspaceFullscreen;

  const onSizeChange = useCallback((size: BoardSize) => setBoard(size), []);

  const scrollToBoard = useCallback(() => {
    boardSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const focusBoardStage = useCallback(() => {
    setStageMode("board");
    window.setTimeout(() => scrollToBoard(), 50);
  }, [scrollToBoard]);

  const focusScreenStage = useCallback(() => {
    setStageMode("screen");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    window.setTimeout(() => {
      const container = boardScrollRef.current;
      if (container) applyScrollRatio(container, payload.topRatio, payload.leftRatio);
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
        if (
          (payload?.documentId === null || typeof payload?.documentId === "string") &&
          (payload?.pageId === null || typeof payload?.pageId === "string") &&
          typeof payload?.topRatio === "number" &&
          typeof payload?.leftRatio === "number" &&
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
      .on("broadcast", { event: REALTIME_EVENTS.annotationCreated }, () => void refetchAnnotations())
      .on("broadcast", { event: REALTIME_EVENTS.annotationUpdated }, () => void refetchAnnotations())
      .on("broadcast", { event: REALTIME_EVENTS.annotationDeleted }, () => void refetchAnnotations())
      .on("broadcast", { event: REALTIME_EVENTS.annotationsCleared }, () => void refetchAnnotations())
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
  }, [applyRemoteBoardViewport, canUsePresenterControls, meeting.id, profile.id, profile.role, refetchAnnotations, refetchDocuments, refetchParticipants, refetchPermissions, refetchScreenShareSession, scrollToBoard, supabase]);

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
          width: 1600,
          height: 1000
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
    setAnnotations((current) => [...current, annotation]);
    await sendMeetingBroadcast(REALTIME_EVENTS.annotationCreated, { annotationId: annotation.id, pageId: selectedPage.id });
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

    setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
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

    setAnnotations((current) => current.map((item) => (item.id === annotation.id ? updated : item)));
    await sendMeetingBroadcast(REALTIME_EVENTS.annotationUpdated, { annotationId: annotation.id, pageId: annotation.page_id });
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
    setStageMode("screen");
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
    await sendMeetingBroadcast(REALTIME_EVENTS.screenStopped, { sessionId: stoppedSessionId });
  }

  function broadcastBoardViewport() {
    const container = boardScrollRef.current;
    if (!container || !canUsePresenterControls || suppressScrollBroadcastRef.current) return;

    const now = Date.now();
    if (now - lastScrollBroadcastRef.current < 260) return;
    lastScrollBroadcastRef.current = now;

    const topRatio = getScrollRatio({ value: container.scrollTop, max: container.scrollHeight - container.clientHeight });
    const leftRatio = getScrollRatio({ value: container.scrollLeft, max: container.scrollWidth - container.clientWidth });

    void sendMeetingBroadcast(REALTIME_EVENTS.boardViewportChanged, {
      documentId: selectedDocumentId,
      pageId: selectedPageId,
      topRatio,
      leftRatio,
      sourceUserId: profile.id
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

  return (
    <div
      ref={workspaceRootRef}
      className="-mx-3 -mb-28 -mt-4 min-h-[calc(100svh-5rem)] space-y-4 overflow-auto rounded-[2rem] bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.25),transparent_32%),linear-gradient(135deg,#020617,#111827_55%,#0f172a)] p-3 shadow-[0_32px_120px_-54px_rgba(15,23,42,0.9)] sm:-mx-5 sm:p-4 lg:-mx-8 lg:-mt-5 lg:p-5"
    >
      <input
        ref={quickUploadInputRef}
        disabled={uploading || savingSnapshot}
        className="sr-only"
        type="file"
        accept=".pdf,image/png,image/jpeg,image/webp,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
        onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
      />

      {message ? (
        <Alert className={message.type === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-primary/20 bg-primary/5 text-primary"}>
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
        </Alert>
      ) : null}

      <div className="rounded-[2rem] border border-white/10 bg-white/10 p-3 text-white shadow-soft backdrop-blur-xl sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StagePill tone={meetingStatusTone}>{meeting.status}</StagePill>
              <StagePill tone={annotationStatusTone}>{annotationStatusText}</StagePill>
              <StagePill tone={meeting.document_locked ? "danger" : "success"}>{meeting.document_locked ? "Board locked" : "Board open"}</StagePill>
            </div>
            <p className="truncate text-lg font-black sm:text-2xl">{getStageModeLabel(stageMode)}</p>
            <p className="truncate text-xs text-white/65 sm:text-sm">
              {selectedDocument ? selectedDocument.title : "No board selected"} · {presenceUsers.length} online · Code {meeting.code}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <StageToggleButton active={boardIsMainStage} onClick={focusBoardStage}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              Board
            </StageToggleButton>
            {canUseScreenShare ? (
              <StageToggleButton active={screenIsMainStage} onClick={focusScreenStage}>
                <MonitorUp className="h-4 w-4" aria-hidden="true" />
                Screen
              </StageToggleButton>
            ) : null}
            <StageToggleButton active={isWorkspaceFullscreen} onClick={toggleWorkspaceFullscreen}>
              {isWorkspaceFullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
              {isWorkspaceFullscreen ? "Exit full" : "Full screen"}
            </StageToggleButton>
            {canUsePresenterControls && meeting.status !== "live" && meeting.status !== "completed" && meeting.status !== "cancelled" ? (
              <Button onClick={startWorkspace} disabled={isPending} size="sm" type="button" className="min-h-10 rounded-full bg-emerald-400 px-4 font-black text-emerald-950 hover:bg-emerald-300">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />}
                Start
              </Button>
            ) : null}
            {profile.role === "participant" ? (
              <Button onClick={leaveMeeting} disabled={leavingMeeting} size="sm" type="button" className="min-h-10 rounded-full bg-rose-500 px-4 font-black text-white hover:bg-rose-400">
                {leavingMeeting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                Leave
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {canUseScreenShare && screenIsMainStage ? (
        <ScreenSharePanel
          allowPresenterControls={canUsePresenterControls}
          meetingId={meeting.id}
          onOpenBoard={focusBoardStage}
          onFocusBoard={focusBoardStage}
          onFocusScreen={focusScreenStage}
          presentation="stage"
          session={screenShareSession}
          onStarted={markScreenShareStarted}
          onPaused={markScreenSharePaused}
          onStopped={markScreenShareStopped}
        />
      ) : null}

      {screenIsMainStage ? (
        <button
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+9.25rem)] right-3 z-40 w-[min(calc(100vw-1.5rem),18rem)] rounded-[1.5rem] border border-white/70 bg-white/94 p-3 text-left shadow-[0_28px_90px_-30px_rgba(15,23,42,0.65)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white xl:bottom-6 xl:right-6"
          onClick={focusBoardStage}
          type="button"
        >
          <span className="flex items-center gap-2 text-sm font-black">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            Annotation board
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">Parked while live screen is full. Tap to annotate.</span>
        </button>
      ) : null}

      {canUseScreenShare && boardIsMainStage ? (
        <ScreenSharePanel
          allowPresenterControls={canUsePresenterControls}
          meetingId={meeting.id}
          onOpenBoard={focusBoardStage}
          onFocusBoard={focusBoardStage}
          onFocusScreen={focusScreenStage}
          presentation="floating"
          session={screenShareSession}
          onStarted={markScreenShareStarted}
          onPaused={markScreenSharePaused}
          onStopped={markScreenShareStopped}
        />
      ) : null}

      <div className={cn("grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]")}>
        {boardIsMainStage ? (
        <Card ref={boardSectionRef} id="annotation-board" className="min-h-[calc(100svh-14rem)] overflow-hidden scroll-mt-4 border-white/70 bg-white/96 shadow-[0_30px_90px_-42px_rgba(15,23,42,0.75)] backdrop-blur">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Shared annotation workspace</CardTitle>
                <CardDescription>
                  Presenter uploads documents, selects the shared page, and participants annotate in realtime when the meeting is live.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={meeting.status === "live" ? "success" : "secondary"}>{meeting.status}</Badge>
                {canUsePresenterControls && meeting.status !== "live" && meeting.status !== "completed" && meeting.status !== "cancelled" ? (
                  <Button onClick={startWorkspace} disabled={isPending} size="sm">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />}
                    Start workspace
                  </Button>
                ) : null}
                {canUsePresenterControls && meeting.status !== "completed" ? (
                  <Button onClick={endMeeting} disabled={isPending || savingSnapshot} size="sm" variant="outline">
                    {isPending || savingSnapshot ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <StopCircle className="h-4 w-4" aria-hidden="true" />}
                    End meeting
                  </Button>
                ) : null}
                {profile.role === "participant" ? (
                  <Button onClick={leaveMeeting} disabled={leavingMeeting} size="sm" variant="outline">
                    {leavingMeeting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                    Leave meeting
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-white/75 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                {tools.map((item) => (
                  <Button
                    key={item.id}
                    onClick={() => setTool(item.id)}
                    size="sm"
                    type="button"
                    variant={tool === item.id ? "default" : "outline"}
                    className="min-h-12 shrink-0 rounded-2xl px-3"
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
                  <p className="text-sm text-muted-foreground">Presenter uploads a PDF or image to open the annotation board. Office files are saved and routed through conversion before annotation.</p>
                </div>
              </div>
            ) : (
              <div
                ref={boardScrollRef}
                onScroll={broadcastBoardViewport}
                className="h-[calc(100svh-27rem)] min-h-[360px] overflow-auto rounded-3xl border border-border/60 bg-white/40 p-2 shadow-inner overscroll-contain sm:h-[calc(100svh-25rem)] lg:h-[calc(100svh-23rem)] xl:h-[calc(100svh-22rem)]"
              >
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
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-3xl bg-secondary/60 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                {canAnnotate
                  ? "Annotation is enabled for you. Draw with touch, stylus, or mouse."
                  : canAnnotateByPermission && !boardIsMainStage
                    ? "Annotation is paused while live screen is the main stage. Switch to Board to annotate."
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
        ) : (
          <Card ref={boardSectionRef} id="annotation-board" className="scroll-mt-4 border-white/70 bg-white/88 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
                Annotation board parked
              </CardTitle>
              <CardDescription>
                Live screen is the main stage. The board is intentionally read-only while parked so touch gestures do not create accidental annotations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full rounded-2xl" onClick={focusBoardStage} type="button">
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                Open board full screen
              </Button>
              <p className="rounded-2xl bg-secondary/70 p-3 text-sm text-muted-foreground">
                Switch back to the board to annotate with touch, stylus, or mouse. Presenter page/scroll broadcasts are still remembered while you watch the screen.
              </p>
            </CardContent>
          </Card>
        )}

        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          {canUsePresenterControls ? (
            <Card className="border-white/10 bg-slate-950 text-white shadow-[0_28px_90px_-55px_rgba(0,0,0,0.9)]">
              <CardHeader>
                <CardTitle>Presenter controls</CardTitle>
                <CardDescription className="text-slate-300">Control annotation access, document lock state, page cleanup, and participant permissions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Button onClick={() => setParticipantAnnotationEnabled(!meeting.participant_annotation_enabled)} type="button" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                    {meeting.participant_annotation_enabled ? "Disable participant annotation" : "Enable participant annotation"}
                  </Button>
                  <Button onClick={() => setDocumentLocked(!meeting.document_locked)} type="button" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                    {meeting.document_locked ? <LockOpen className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                    {meeting.document_locked ? "Unlock document" : "Lock document"}
                  </Button>
                  <Button disabled={!selectedPage || pageAnnotations.length === 0} onClick={clearCurrentPageAnnotations} type="button" variant="outline" className="border-rose-300/30 bg-rose-500/15 text-rose-50 hover:bg-rose-500 hover:text-white">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Clear current page
                  </Button>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-4 text-sm">
                  <p className="font-bold">Current page annotations</p>
                  <p className="mt-1 text-xs text-slate-300">Presenter can recolor, edit text annotations, or remove any annotation on the selected page.</p>
                  <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                    {pageAnnotations.length === 0 ? <p className="text-xs text-slate-300">No annotations on this page yet.</p> : null}
                    {pageAnnotations.map((annotation) => (
                      <div key={annotation.id} className="rounded-2xl border border-white/10 bg-slate-900 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{annotation.user_name_snapshot}</p>
                            <p className="text-xs text-slate-300">
                              {annotation.annotation_type} · {annotation.role_snapshot}
                            </p>
                          </div>
                          <span className="h-5 w-5 shrink-0 rounded-full border border-border" style={{ backgroundColor: annotation.color }} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button onClick={() => updateAnnotation(annotation, { color })} size="sm" type="button" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                            Use active color
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
                              className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950"
                            >
                              Edit text
                            </Button>
                          ) : (
                            <Button disabled size="sm" type="button" variant="outline" className="border-white/15 bg-white/10 text-white">
                              Edit shape
                            </Button>
                          )}
                          <Button className="col-span-2 border-rose-300/30 bg-rose-500/15 text-rose-50 hover:bg-rose-500 hover:text-white" onClick={() => deleteAnnotation(annotation)} size="sm" type="button" variant="outline">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Remove annotation
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-4 text-sm">
                  <p className="font-bold">Participant permissions</p>
                  <p className="mt-1 text-xs text-slate-300">Defaults allow annotation. Rows here override annotation, mute, and future download access.</p>
                </div>

                <div className="space-y-3">
                  {participantControlRows.length === 0 ? <p className="text-sm text-slate-300">No participant attendance records yet.</p> : null}
                  {participantControlRows.map((participant) => {
                    const permission = permissions.find((item) => item.user_id === participant.user_id);
                    const canAnnotateParticipant = permission?.can_annotate ?? true;
                    const isMuted = permission?.is_muted_from_annotation ?? false;
                    const canDownload = permission?.can_download ?? false;

                    return (
                      <div key={participant.id} className="rounded-3xl border border-white/10 bg-white/[0.07] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-bold">{participant.name_snapshot}</p>
                            <p className="text-xs text-slate-300">{participant.designation_snapshot ?? "No designation"}</p>
                          </div>
                          <Badge variant={participant.is_present ? "success" : "outline"}>{participant.is_present ? "present" : "left"}</Badge>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <Button onClick={() => updateParticipantPermission(participant, { can_annotate: !canAnnotateParticipant })} size="sm" type="button" variant={canAnnotateParticipant ? "default" : "outline"} className={canAnnotateParticipant ? "bg-emerald-400 font-black text-emerald-950 hover:bg-emerald-300" : "border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950"}>
                            {canAnnotateParticipant ? "Can annotate" : "Annotation off"}
                          </Button>
                          <Button onClick={() => updateParticipantPermission(participant, { is_muted_from_annotation: !isMuted })} size="sm" type="button" variant={isMuted ? "default" : "outline"} className={isMuted ? "bg-rose-500 font-black text-white hover:bg-rose-400" : "border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950"}>
                            {isMuted ? "Muted from annotation" : "Not muted"}
                          </Button>
                          <Button onClick={() => updateParticipantPermission(participant, { can_download: !canDownload })} size="sm" type="button" variant={canDownload ? "default" : "outline"} className={canDownload ? "bg-emerald-400 font-black text-emerald-950 hover:bg-emerald-300" : "border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950"}>
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

          <Card className="border-white/10 bg-slate-950 text-white shadow-[0_28px_90px_-55px_rgba(0,0,0,0.9)]">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription className="text-slate-300">PDF and images annotate immediately. PowerPoint, Word, and Excel files are saved with conversion fallback.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canUpload ? (
                <div className="grid gap-3">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-emerald-300/35 bg-emerald-400/10 p-5 text-center text-sm font-black text-emerald-100">
                    {uploading || savingSnapshot ? <Loader2 className="mb-2 h-6 w-6 animate-spin" aria-hidden="true" /> : <FileUp className="mb-2 h-6 w-6" aria-hidden="true" />}
                    Upload PDF, image, PowerPoint, Word, or Excel
                    {selectedDocumentHasAnnotations ? <span className="mt-1 text-xs font-medium text-slate-300">You will be asked to save the current annotations first.</span> : null}
                    <input
                      disabled={uploading || savingSnapshot}
                      className="sr-only"
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/webp,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
                      onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <Button disabled={uploading || savingSnapshot} onClick={createWhiteboard} type="button" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                    {uploading || savingSnapshot ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                    New whiteboard
                  </Button>
                </div>
              ) : null}

              <div className="space-y-3">
                {documents.length === 0 ? <p className="text-sm text-slate-300">No documents uploaded yet.</p> : null}
                {documents.map((document) => {
                  const docPages = pages.filter((page) => page.document_id === document.id).sort((a, b) => a.page_number - b.page_number);
                  const firstPage = docPages[0];
                  const Icon = document.document_type === "image" ? ImageIcon : document.document_type === "pdf" ? FileUp : Presentation;
                  return (
                    <div key={document.id} className="rounded-3xl border border-white/10 bg-white/[0.07] p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-200">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">{document.title}</p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant="secondary">{document.document_type}</Badge>
                            <Badge variant={document.conversion_status === "ready" ? "success" : "outline"}>{document.conversion_status}</Badge>
                          </div>
                          {document.conversion_error ? <p className="mt-2 text-xs text-rose-200">{document.conversion_error}</p> : null}
                        </div>
                      </div>
                      {firstPage ? (
                        <Button className={cn("mt-3 w-full", selectedDocumentId === document.id ? "bg-emerald-400 font-black text-emerald-950 hover:bg-emerald-300" : "border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950")} disabled={!canUsePresenterControls} onClick={() => selectDocumentPage(document, firstPage)} size="sm" variant={selectedDocumentId === document.id ? "default" : "outline"}>
                          {selectedDocumentId === document.id ? "Selected" : "Broadcast document"}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950 text-white shadow-[0_28px_90px_-55px_rgba(0,0,0,0.9)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="h-5 w-5" aria-hidden="true" />
                Presence
              </CardTitle>
              <CardDescription className="text-slate-300">{presenceUsers.length} online in this meeting room.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {presenceUsers.length === 0 ? <p className="text-sm text-slate-300">Presence is connecting...</p> : null}
              {presenceUsers.map((user) => (
                <div key={`${user.userId}-${user.onlineAt}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: user.color ?? "#0f4c5c" }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{user.name}</p>
                      <p className="text-xs text-slate-300">{user.role}</p>
                    </div>
                  </div>
                  <Badge variant="success">online</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.85rem)] z-30 xl:hidden">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto rounded-[2rem] border border-white/15 bg-slate-950/96 p-2 text-white shadow-[0_24px_90px_-34px_rgba(0,0,0,0.9)] backdrop-blur-2xl [scrollbar-width:none]">
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
            active={isWorkspaceFullscreen}
            icon={isWorkspaceFullscreen ? <Minimize2 className="h-5 w-5" aria-hidden="true" /> : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
            label={isWorkspaceFullscreen ? "Exit" : "Full"}
            onClick={toggleWorkspaceFullscreen}
          />
          {!useCompactMeetingDock && selectedDocumentPages.length > 0 ? (
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
          {canUsePresenterControls && !useCompactMeetingDock ? (
            <>
              <MeetDockButton
                active={meeting.participant_annotation_enabled}
                icon={<Highlighter className="h-5 w-5" aria-hidden="true" />}
                label={meeting.participant_annotation_enabled ? "Annotate" : "Paused"}
                onClick={() => setParticipantAnnotationEnabled(!meeting.participant_annotation_enabled)}
              />
              <MeetDockButton
                danger={meeting.document_locked}
                icon={meeting.document_locked ? <Lock className="h-5 w-5" aria-hidden="true" /> : <LockOpen className="h-5 w-5" aria-hidden="true" />}
                label={meeting.document_locked ? "Locked" : "Open"}
                onClick={() => setDocumentLocked(!meeting.document_locked)}
              />
              <MeetDockButton
                disabled={uploading || savingSnapshot}
                icon={<FileUp className="h-5 w-5" aria-hidden="true" />}
                label="Upload"
                onClick={() => quickUploadInputRef.current?.click()}
              />
              <MeetDockButton
                disabled={uploading || savingSnapshot}
                icon={<Plus className="h-5 w-5" aria-hidden="true" />}
                label="Board+"
                onClick={createWhiteboard}
              />
            </>
          ) : null}
          {canUsePresenterControls && meeting.status !== "completed" ? (
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
    </div>
  );
}
