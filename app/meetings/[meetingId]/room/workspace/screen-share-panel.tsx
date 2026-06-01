"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LiveKitRoom, VideoTrack, useConnectionState, useLocalParticipant, useTracks } from "@livekit/components-react";
import { ConnectionState, Room, Track } from "livekit-client";
import { FileText, Loader2, Maximize2, Minimize2, MonitorUp, PauseCircle, Square } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientEnv } from "@/lib/env";
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

function ScreenShareStage({
  allowPresenterControls,
  session,
  minimized,
  presentation,
  onOpenBoard,
  onFocusScreen,
  onStarted,
  onPaused,
  onStopped
}: Omit<PanelProps, "meetingId" | "onFocusBoard"> & { minimized: boolean; presentation: "floating" | "stage" }) {
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

  async function startShare() {
    setBusyAction("start");
    setControlError(null);
    try {
      await localParticipant.setScreenShareEnabled(true, { audio: false, video: true }, { source: Track.Source.ScreenShare });
      try {
        await onStarted();
      } catch (error) {
        await localParticipant.setScreenShareEnabled(false);
        throw error;
      }
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Screen sharing could not be started.");
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
            {!isCompact ? <p className="mt-2 text-sm text-white/65">This room subscribes only to screen video. Microphone and camera tracks are never requested.</p> : null}
          </div>
        )}
      </div>

      <div className={isCompact ? "flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-secondary/70 p-2 text-xs" : "flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-secondary/70 p-4 text-sm"}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isConnected ? "success" : "secondary"}>{connectionState}</Badge>
          <Badge variant={sessionStatus === "live" ? "success" : "outline"}>screen {sessionStatus}</Badge>
        </div>

        {allowPresenterControls ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={onOpenBoard} size="sm" variant="outline">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Board
            </Button>
            <Button disabled={!isConnected || busyAction !== null || isScreenShareEnabled} onClick={startShare} size="sm">
              {busyAction === "start" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MonitorUp className="h-4 w-4" aria-hidden="true" />}
              {sessionStatus === "paused" ? "Resume screen" : "Start screen"}
            </Button>
            <Button disabled={!isConnected || busyAction !== null || !isScreenShareEnabled} onClick={pauseShare} size="sm" variant="outline">
              {busyAction === "pause" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PauseCircle className="h-4 w-4" aria-hidden="true" />}
              Pause
            </Button>
            <Button disabled={!isConnected || busyAction !== null || (!isScreenShareEnabled && sessionStatus === "stopped")} onClick={stopShare} size="sm" variant="outline">
              {busyAction === "stop" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Square className="h-4 w-4" aria-hidden="true" />}
              Stop
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={onOpenBoard} size="sm" variant="outline">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Board
            </Button>
            {presentation === "floating" ? (
              <Button onClick={onFocusScreen} size="sm">
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
  const handleLiveKitError = useCallback((liveKitError: Error) => setError(liveKitError.message), []);
  const isStage = presentation === "stage";
  const isCompact = presentation === "floating" && minimized;
  const openBoard = onFocusBoard ?? onOpenBoard;

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
        "border-white/70 bg-white/92 shadow-[0_28px_90px_-30px_rgba(15,23,42,0.65)] backdrop-blur-xl",
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
            {!isCompact ? <CardDescription>LiveKit is used only for presenter screen video. No microphone, camera, mute, audio, or call controls are rendered.</CardDescription> : null}
          </div>
          <div className="flex items-center gap-2">
            {allowPresenterControls ? <Badge variant="success">Presenter</Badge> : <Badge variant="secondary">Viewer</Badge>}
            {isStage ? null : (
              <Button aria-label={minimized ? "Expand screen share tile" : "Minimize screen share tile"} onClick={() => setMinimized((current) => !current)} size="sm" type="button" variant="outline">
                {minimized ? <Maximize2 className="h-4 w-4" aria-hidden="true" /> : <Minimize2 className="h-4 w-4" aria-hidden="true" />}
              </Button>
            )}
            {isStage ? null : (
              <Button aria-label="Make screen share the main stage" onClick={onFocusScreen} size="sm" type="button" variant="outline">
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            <Button aria-label="Open annotation board" onClick={openBoard} size="sm" type="button" variant="outline">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className={isCompact ? "p-3 pt-0" : "p-4 pt-0 sm:p-5 sm:pt-0"}>
        {loading ? (
          <div className={isCompact ? "flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-primary/5 text-xs text-muted-foreground" : "flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-primary/20 bg-primary/5 text-sm text-muted-foreground"}>
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
            <ScreenShareStage
              allowPresenterControls={allowPresenterControls}
              presentation={presentation}
              minimized={minimized}
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
