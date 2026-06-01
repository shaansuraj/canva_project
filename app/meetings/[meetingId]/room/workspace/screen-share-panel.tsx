"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LiveKitRoom, VideoTrack, useConnectionState, useLocalParticipant, useTracks } from "@livekit/components-react";
import { ConnectionState, Room, Track } from "livekit-client";
import { Loader2, MonitorUp, PauseCircle, Square } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientEnv } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
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
  onStarted: () => Promise<void>;
  onPaused: () => Promise<void>;
  onStopped: () => Promise<void>;
};

function ScreenShareStage({
  allowPresenterControls,
  session,
  onStarted,
  onPaused,
  onStopped
}: Omit<PanelProps, "meetingId">) {
  const tracks = useTracks([Track.Source.ScreenShare]);
  const firstScreenTrack = tracks[0];
  const connectionState = useConnectionState();
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [busyAction, setBusyAction] = useState<"start" | "pause" | "stop" | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const isConnected = connectionState === ConnectionState.Connected;
  const sessionStatus = session?.status ?? "stopped";

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
    <div className="space-y-4">
      {controlError ? (
        <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
          <AlertTitle>Screen share issue</AlertTitle>
          <AlertDescription>{controlError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="relative flex aspect-video min-h-[220px] items-center justify-center overflow-hidden rounded-3xl border border-border bg-slate-950 text-white shadow-soft">
        {firstScreenTrack ? (
          <VideoTrack trackRef={firstScreenTrack} muted className="h-full w-full object-contain" />
        ) : (
          <div className="max-w-sm p-6 text-center">
            <MonitorUp className="mx-auto mb-3 h-10 w-10 text-white/70" aria-hidden="true" />
            <p className="font-black">Presenter screen will appear here</p>
            <p className="mt-2 text-sm text-white/65">This room subscribes only to screen video. Microphone and camera tracks are never requested.</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-secondary/70 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isConnected ? "success" : "secondary"}>{connectionState}</Badge>
          <Badge variant={sessionStatus === "live" ? "success" : "outline"}>screen {sessionStatus}</Badge>
        </div>

        {allowPresenterControls ? (
          <div className="flex flex-wrap gap-2">
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
        ) : null}
      </div>
    </div>
  );
}

export function ScreenSharePanel({ meetingId, allowPresenterControls, session, onStarted, onPaused, onStopped }: PanelProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const room = useMemo(() => new Room(), []);
  const liveKitUrl = getClientEnv().NEXT_PUBLIC_LIVEKIT_URL;
  const [tokenState, setTokenState] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const handleLiveKitError = useCallback((liveKitError: Error) => setError(liveKitError.message), []);

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
    <Card className="bg-white/85 backdrop-blur">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MonitorUp className="h-5 w-5" aria-hidden="true" />
              Screen share
            </CardTitle>
            <CardDescription>LiveKit is used only for presenter screen video. No microphone, camera, mute, audio, or call controls are rendered.</CardDescription>
          </div>
          {allowPresenterControls ? <Badge variant="success">Presenter console</Badge> : <Badge variant="secondary">Viewer only</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-primary/20 bg-primary/5 text-sm text-muted-foreground">
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
            <ScreenShareStage allowPresenterControls={allowPresenterControls} session={session} onStarted={onStarted} onPaused={onPaused} onStopped={onStopped} />
          </LiveKitRoom>
        )}
      </CardContent>
    </Card>
  );
}
