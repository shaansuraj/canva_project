"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useConnectionState, useLocalParticipant, useTracks } from "@livekit/components-react";
import { ConnectionState, Room, Track } from "livekit-client";
import { FileText, Loader2, Maximize2, Minimize2, MonitorUp, PauseCircle, Square } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientEnv } from "@/lib/env";
import { getScreenShareErrorMessage, getScreenShareSupport, type ScreenShareSupport } from "@/lib/livekit/screen-share-support";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";
import type { ScreenShareSession } from "@/types/app";

type TokenResponse = {
  token: string;
  roomName: string;
  canPublishScreen: boolean;
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

function ScreenStatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em]",
        tone === "neutral" && "border-white/15 bg-white/12 text-white",
        tone === "success" && "border-emerald-300/40 bg-emerald-400/18 text-emerald-50",
        tone === "warning" && "border-amber-300/40 bg-amber-400/18 text-amber-50"
      )}
    >
      {children}
    </span>
  );
}

function ScreenShareStage({
  allowPresenterControls,
  session,
  minimized,
  presentation,
  screenShareSupport,
  onOpenBoard,
  onFocusScreen,
  onStarted,
  onPaused,
  onStopped
}: Omit<PanelProps, "meetingId" | "onFocusBoard"> & { minimized: boolean; presentation: "floating" | "stage"; screenShareSupport: ScreenShareSupport }) {
  const tracks = useTracks([Track.Source.ScreenShare]);
  const firstScreenTrack = tracks[0];
  const connectionState = useConnectionState();
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [busyAction, setBusyAction] = useState<"start" | "pause" | "stop" | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const isConnected = connectionState === ConnectionState.Connected;
  const sessionStatus = session?.status ?? "stopped";
  const isStage = presentation === "stage";
  const isCompact = presentation === "floating" && minimized;
  const controlsAreMinimized = isCompact && sessionStatus === "live";

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
    <div className={isCompact ? "space-y-3" : "space-y-4"}>
      {controlError ? (
        <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
          <AlertTitle>Screen share issue</AlertTitle>
          <AlertDescription>{controlError}</AlertDescription>
        </Alert>
      ) : null}

      {allowPresenterControls && !screenShareSupport.supported ? (
        <Alert className="border-amber-300/30 bg-amber-400/10 text-amber-50">
          <AlertTitle>{screenShareSupport.title}</AlertTitle>
          <AlertDescription>{screenShareSupport.message}</AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          "relative flex aspect-video items-center justify-center overflow-hidden border bg-slate-950 text-white shadow-soft",
          isCompact && "min-h-24 rounded-2xl border-white/15",
          !isCompact && !isStage && "min-h-[220px] rounded-3xl border-border",
          isStage && "min-h-[calc(100svh-18rem)] rounded-[2rem] border-white/15 sm:min-h-[58svh] lg:min-h-[62svh]"
        )}
      >
        {firstScreenTrack ? (
          <VideoTrack trackRef={firstScreenTrack} muted className="h-full w-full object-contain" />
        ) : (
          <div className={isCompact ? "max-w-xs p-3 text-center" : "max-w-sm p-6 text-center"}>
            <MonitorUp className={isCompact ? "mx-auto mb-2 h-6 w-6 text-white/70" : "mx-auto mb-3 h-10 w-10 text-white/70"} aria-hidden="true" />
            <p className={isCompact ? "text-xs font-black" : "font-black"}>Presenter screen will appear here</p>
            {!isCompact ? <p className="mt-2 text-sm text-white/65">This room subscribes to presenter screen video and shared tab/system audio only. Microphone and camera tracks are never requested.</p> : null}
          </div>
        )}
      </div>

      <div className={isCompact ? "flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-950 p-2 text-xs text-white" : "flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-slate-950 p-4 text-sm text-white"}>
        <div className="flex flex-wrap items-center gap-2">
          <ScreenStatusPill tone={isConnected ? "success" : "warning"}>{connectionState}</ScreenStatusPill>
          <ScreenStatusPill tone={sessionStatus === "live" ? "success" : "neutral"}>screen {sessionStatus}</ScreenStatusPill>
        </div>

        {controlsAreMinimized ? (
          <p className="text-xs font-bold text-slate-300">Presentation is live. Expand the tile for controls.</p>
        ) : allowPresenterControls ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={onOpenBoard} size="sm" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Board
            </Button>
            <Button
              disabled={!screenShareSupport.supported || !isConnected || busyAction !== null || isScreenShareEnabled}
              onClick={startShare}
              size="sm"
              title={screenShareSupport.supported ? undefined : screenShareSupport.message}
              className="bg-emerald-400 font-black text-emerald-950 hover:bg-emerald-300 disabled:bg-slate-700 disabled:text-slate-300"
            >
              {busyAction === "start" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MonitorUp className="h-4 w-4" aria-hidden="true" />}
              {screenShareSupport.supported ? (sessionStatus === "paused" ? "Resume screen" : "Start screen") : "Desktop needed"}
            </Button>
            <Button disabled={!isConnected || busyAction !== null || !isScreenShareEnabled} onClick={pauseShare} size="sm" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
              {busyAction === "pause" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PauseCircle className="h-4 w-4" aria-hidden="true" />}
              Pause
            </Button>
            <Button disabled={!isConnected || busyAction !== null || (!isScreenShareEnabled && sessionStatus === "stopped")} onClick={stopShare} size="sm" variant="outline" className="border-rose-300/30 bg-rose-500/15 text-rose-50 hover:bg-rose-500 hover:text-white">
              {busyAction === "stop" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Square className="h-4 w-4" aria-hidden="true" />}
              Stop
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={onOpenBoard} size="sm" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Board
            </Button>
            {presentation === "floating" ? (
              <Button onClick={onFocusScreen} size="sm" className="bg-white text-slate-950 hover:bg-white/90">
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                Screen
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function ScreenSharePanel({
  meetingId,
  allowPresenterControls,
  session,
  presentation = "floating",
  onOpenBoard,
  onFocusScreen,
  onFocusBoard,
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
  const isCompact = presentation === "floating" && minimized;
  const openBoard = onFocusBoard ?? onOpenBoard;

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
      if (invokeError || !data) {
        setError(invokeError?.message ?? "Could not create a LiveKit token.");
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

  return (
    <Card
      className={cn(
        "border-white/10 bg-slate-950 text-white shadow-[0_28px_90px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl",
        isStage
          ? "relative overflow-hidden rounded-[2rem]"
          : isCompact
            ? "fixed bottom-[calc(env(safe-area-inset-bottom)+9.25rem)] right-3 z-40 w-[min(calc(100vw-1.5rem),18rem)] xl:bottom-6 xl:right-6"
            : "fixed bottom-[calc(env(safe-area-inset-bottom)+9.25rem)] right-3 z-40 w-[min(calc(100vw-1.5rem),28rem)] xl:bottom-6 xl:right-6"
      )}
    >
      <CardHeader className={isCompact ? "p-3" : "p-4 sm:p-5"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className={isCompact ? "flex items-center gap-2 text-base" : "flex items-center gap-2"}>
              <MonitorUp className="h-5 w-5" aria-hidden="true" />
              {isStage ? "Live screen stage" : isCompact ? "Live screen" : "Screen share"}
            </CardTitle>
            {!isCompact ? <CardDescription className="text-slate-300">LiveKit carries presenter screen video plus shared tab/system audio. No microphone, camera, mute, or call controls are rendered.</CardDescription> : null}
          </div>
          <div className="flex items-center gap-2">
            {!isCompact ? (allowPresenterControls ? <Badge variant="success">Presenter</Badge> : <Badge variant="secondary">Viewer</Badge>) : null}
            {isStage ? null : (
              <Button aria-label={minimized ? "Expand screen share tile" : "Minimize screen share tile"} onClick={() => setMinimized((current) => !current)} size="sm" type="button" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                {minimized ? <Maximize2 className="h-4 w-4" aria-hidden="true" /> : <Minimize2 className="h-4 w-4" aria-hidden="true" />}
              </Button>
            )}
            {!isCompact && !isStage ? (
              <Button aria-label="Make screen share the main stage" onClick={onFocusScreen} size="sm" type="button" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
            {!isCompact ? (
              <Button aria-label="Open annotation board" onClick={openBoard} size="sm" type="button" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white hover:text-slate-950">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className={isCompact ? "p-3 pt-0" : "p-4 pt-0 sm:p-5 sm:pt-0"}>
        {loading ? (
          <div className={isCompact ? "flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.07] text-xs text-slate-300" : "flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.07] text-sm text-slate-300"}>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Connecting to screen share...
          </div>
        ) : error ? (
          <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
            <AlertTitle>LiveKit unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <LiveKitRoom
            audio={false}
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
              minimized={minimized}
              screenShareSupport={screenShareSupport}
              onOpenBoard={openBoard}
              onFocusScreen={onFocusScreen}
              session={session}
              onStarted={onStarted}
              onPaused={onPaused}
              onStopped={onStopped}
            />
          </LiveKitRoom>
        )}
      </CardContent>
    </Card>
  );
}
