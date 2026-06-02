"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useConnectionState, useLocalParticipant, useTracks } from "@livekit/components-react";
import { ConnectionState, Room, Track } from "livekit-client";
import { Loader2, Maximize2, Minimize2, MonitorUp, PauseCircle, PlayCircle, Square } from "lucide-react";

import { getClientEnv } from "@/lib/env";
import { getScreenShareErrorMessage, getScreenShareSupport, type ScreenShareSupport } from "@/lib/livekit/screen-share-support";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";
import type { ScreenShareSession } from "@/types/app";

type TokenResponse = {
  token: string;
  roomName: string;
  canPublishScreen: boolean;
  error?: string;
};

type PanelProps = {
  meetingId: string;
  allowPresenterControls: boolean;
  session: ScreenShareSession | null;
  presentation?: "floating" | "stage";
  onOpenBoard: () => void;
  onFocusScreen?: () => void;
  onFocusBoard?: () => void;
  onStarted: () => Promise<void>;
  onPaused: () => Promise<void>;
  onStopped: () => Promise<void>;
};

function MiniDockButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={`Open ${label}`}
      className="fixed right-3 top-[calc(env(safe-area-inset-top)+4.9rem)] z-40 inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-slate-950/92 px-3 text-xs font-black text-white shadow-[0_18px_60px_-28px_rgba(0,0,0,0.9)] backdrop-blur-2xl transition hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:right-4"
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ScreenIconButton({
  danger,
  disabled,
  icon,
  label,
  onClick
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40",
        danger ? "border-rose-300/35 bg-rose-500/90 hover:bg-rose-400" : "border-white/15 bg-slate-950/72 hover:bg-white hover:text-slate-950"
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}

async function getFunctionErrorMessage(error: unknown, fallback: string) {
  const response = (error as { context?: unknown } | null)?.context;
  if (response instanceof Response) {
    try {
      const body = (await response.clone().json()) as { error?: unknown; message?: unknown };
      if (typeof body.error === "string") return body.error;
      if (typeof body.message === "string") return body.message;
    } catch {
      // Fall back to the SDK message below.
    }
  }

  return error instanceof Error ? error.message : fallback;
}

function ScreenShareStage({
  allowPresenterControls,
  session,
  presentation,
  screenShareSupport,
  onFocusScreen,
  onMinimize,
  onStarted,
  onPaused,
  onStopped
}: Omit<PanelProps, "meetingId" | "onFocusBoard" | "onOpenBoard"> & {
  onMinimize: () => void;
  presentation: "floating" | "stage";
  screenShareSupport: ScreenShareSupport;
}) {
  const tracks = useTracks([Track.Source.ScreenShare]);
  const firstScreenTrack = tracks[0];
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const connectionState = useConnectionState();
  const [busyAction, setBusyAction] = useState<"start" | "pause" | "stop" | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const sessionStatus = session?.status ?? "stopped";
  const isStage = presentation === "stage";
  const isFloating = presentation === "floating";
  const isConnected = connectionState === ConnectionState.Connected;
  const canStartShare = screenShareSupport.supported && isConnected && busyAction === null && !isScreenShareEnabled;
  const canPauseShare = isConnected && busyAction === null && isScreenShareEnabled;
  const canStopShare = isConnected && busyAction === null && (isScreenShareEnabled || sessionStatus !== "stopped");

  async function startShare() {
    if (!screenShareSupport.supported) {
      setControlError(screenShareSupport.message);
      return;
    }

    setBusyAction("start");
    setControlError(null);
    try {
      await localParticipant.setScreenShareEnabled(true, { audio: true, video: true }, { source: Track.Source.ScreenShare });
      try {
        await onStarted();
      } catch (error) {
        await localParticipant.setScreenShareEnabled(false);
        throw error;
      }
    } catch (error) {
      setControlError(getScreenShareErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function pauseShare() {
    setBusyAction("pause");
    setControlError(null);
    try {
      await localParticipant.setScreenShareEnabled(false);
      await onPaused();
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Screen sharing could not be paused.");
    } finally {
      setBusyAction(null);
    }
  }

  async function stopShare() {
    setBusyAction("stop");
    setControlError(null);
    try {
      await localParticipant.setScreenShareEnabled(false);
      await onStopped();
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Screen sharing could not be stopped.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white">
      {firstScreenTrack ? (
        <VideoTrack trackRef={firstScreenTrack} muted className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full min-h-28 items-center justify-center">
          {busyAction ? <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-hidden="true" /> : <MonitorUp className="h-8 w-8 text-white/55" aria-hidden="true" />}
          {controlError ? <span className="sr-only">{controlError}</span> : null}
        </div>
      )}

      {allowPresenterControls ? (
        <div className={cn("absolute z-10 flex gap-1.5 rounded-full border border-white/10 bg-slate-950/70 p-1.5 backdrop-blur-xl", isStage ? "bottom-3 left-1/2 -translate-x-1/2" : "right-2 top-2")}>
          <ScreenIconButton icon={<Maximize2 className="h-4 w-4" aria-hidden="true" />} label="Make screen share full screen" onClick={onFocusScreen} />
          {isFloating ? <ScreenIconButton icon={<Minimize2 className="h-4 w-4" aria-hidden="true" />} label="Minimize live stream" onClick={onMinimize} /> : null}
          <ScreenIconButton danger disabled={!canStopShare} icon={busyAction === "stop" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Square className="h-4 w-4" aria-hidden="true" />} label="End screen share" onClick={stopShare} />
          <ScreenIconButton disabled={!canPauseShare} icon={busyAction === "pause" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PauseCircle className="h-4 w-4" aria-hidden="true" />} label="Pause screen share" onClick={pauseShare} />
          <ScreenIconButton disabled={!canStartShare} icon={busyAction === "start" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />} label={sessionStatus === "paused" ? "Resume screen share" : "Start screen share"} onClick={startShare} />
        </div>
      ) : isFloating ? (
        <div className="absolute right-2 top-2 z-10 flex gap-1.5 rounded-full border border-white/10 bg-slate-950/70 p-1.5 backdrop-blur-xl">
          <ScreenIconButton icon={<Maximize2 className="h-4 w-4" aria-hidden="true" />} label="Make live stream full screen" onClick={onFocusScreen} />
          <ScreenIconButton icon={<Minimize2 className="h-4 w-4" aria-hidden="true" />} label="Minimize live stream" onClick={onMinimize} />
        </div>
      ) : null}
    </div>
  );
}

export function ScreenSharePanel({
  meetingId,
  allowPresenterControls,
  session,
  presentation = "floating",
  onFocusScreen,
  onStarted,
  onPaused,
  onStopped
}: PanelProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const room = useMemo(() => new Room(), []);
  const liveKitUrl = getClientEnv().NEXT_PUBLIC_LIVEKIT_URL;
  const [tokenState, setTokenState] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [screenShareSupport, setScreenShareSupport] = useState<ScreenShareSupport>(() =>
    getScreenShareSupport({ hasMediaDevices: true, hasGetDisplayMedia: true, isSecureContext: true })
  );
  const handleLiveKitError = useCallback((liveKitError: Error) => setError(liveKitError.message), []);
  const isStage = presentation === "stage";
  const isFloating = presentation === "floating";

  useEffect(() => {
    if (presentation !== "floating" || session?.status !== "live") return;
    const timeout = window.setTimeout(() => setMinimized(true), 0);
    return () => window.clearTimeout(timeout);
  }, [presentation, session?.status]);

  useEffect(() => {
    const nextSupport = getScreenShareSupport({
      hasMediaDevices: Boolean(navigator.mediaDevices),
      hasGetDisplayMedia: typeof navigator.mediaDevices?.getDisplayMedia === "function",
      isSecureContext: window.isSecureContext
    });
    const timeout = window.setTimeout(() => setScreenShareSupport(nextSupport), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadToken() {
      if (!liveKitUrl) {
        setError("NEXT_PUBLIC_LIVEKIT_URL is not configured.");
        return;
      }

      setLoading(true);
      setError(null);
      const { data, error: invokeError } = await supabase.functions.invoke<TokenResponse>("livekit-token", {
        body: { meetingId }
      });

      if (!active) return;
      if (invokeError || !data?.token || data.error) {
        setError(data?.error ?? (await getFunctionErrorMessage(invokeError, "Could not create a LiveKit token.")));
        setLoading(false);
        return;
      }

      setTokenState(data);
      setLoading(false);
    }

    void loadToken();

    return () => {
      active = false;
    };
  }, [liveKitUrl, meetingId, supabase]);

  const roomContent =
    loading || error ? (
      <div className="flex h-full min-h-28 items-center justify-center bg-black text-white">
        {loading ? <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-hidden="true" /> : <MonitorUp className="h-8 w-8 text-white/55" aria-hidden="true" />}
        {error ? <span className="sr-only">{error}</span> : null}
      </div>
    ) : (
      <LiveKitRoom
        audio={false}
        className="block h-full"
        connect={Boolean(tokenState?.token && liveKitUrl)}
        room={room}
        serverUrl={liveKitUrl}
        token={tokenState?.token}
        video={false}
        screen={false}
        onError={handleLiveKitError}
      >
        <RoomAudioRenderer />
        <ScreenShareStage
          allowPresenterControls={allowPresenterControls}
          presentation={presentation}
          screenShareSupport={screenShareSupport}
          onMinimize={() => setMinimized(true)}
          onFocusScreen={onFocusScreen}
          session={session}
          onStarted={onStarted}
          onPaused={onPaused}
          onStopped={onStopped}
        />
      </LiveKitRoom>
    );

  return (
    <>
      {isFloating && minimized ? (
        <MiniDockButton icon={<MonitorUp className="h-4 w-4 text-emerald-300" aria-hidden="true" />} label="Live stream" onClick={() => setMinimized(false)} />
      ) : null}
      <div
        className={cn(
          "fixed z-40 overflow-hidden rounded-2xl border border-white/10 bg-black text-white shadow-[0_28px_90px_-30px_rgba(0,0,0,0.9)]",
          isStage && "bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-2 right-2 top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 sm:bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:left-4 sm:right-4 sm:top-[calc(env(safe-area-inset-top)+5rem)]",
          isFloating && !minimized && "right-3 top-[calc(env(safe-area-inset-top)+4.9rem)] w-[min(56vw,20rem)] sm:right-4",
          isFloating && minimized && "pointer-events-none h-px w-px opacity-0"
        )}
        aria-hidden={isFloating && minimized}
      >
        <div className={cn("h-full w-full", isFloating && "aspect-video min-h-28")}>{roomContent}</div>
      </div>
    </>
  );
}
