"use client";

import { useMemo, useState } from "react";
import { Archive, Download, FileArchive, FileClock, FileText, Loader2, NotebookPen } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { REALTIME_EVENTS } from "@/lib/meetings/realtime-events";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ExportJob, ExportType, Meeting, MeetingNote, Profile } from "@/types/app";

const exportOptions: Array<{ type: Exclude<ExportType, "archive">; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  {
    type: "annotated_pdf",
    label: "Annotated PDF",
    description: "PDF pages with persisted annotation overlays.",
    icon: FileText
  },
  {
    type: "notes",
    label: "Meeting notes",
    description: "Shared and owner-visible meeting notes as text.",
    icon: NotebookPen
  },
  {
    type: "annotation_history",
    label: "Annotation history",
    description: "Append-only annotation event history as CSV.",
    icon: FileClock
  },
  {
    type: "user_report",
    label: "User-wise report",
    description: "Annotation totals grouped by user as CSV.",
    icon: Download
  }
];

type ExportResult = {
  status: "completed" | "failed";
  signedUrl?: string | null;
  storagePath?: string;
  error?: string;
};

export function ExportsClient({
  meeting,
  profile,
  canRequestExports,
  canWriteNotes,
  initialJobs,
  initialNotes
}: {
  meeting: Meeting;
  profile: Profile;
  canRequestExports: boolean;
  canWriteNotes: boolean;
  initialJobs: ExportJob[];
  initialNotes: MeetingNote[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [jobs] = useState(initialJobs);
  const [notes, setNotes] = useState(initialNotes);
  const [noteText, setNoteText] = useState("");
  const [busyExport, setBusyExport] = useState<ExportType | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string; signedUrl?: string | null } | null>(null);

  async function saveNote() {
    const note = noteText.trim();
    if (!note || !canWriteNotes) return;
    setSavingNote(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("meeting_notes")
      .insert({
        meeting_id: meeting.id,
        user_id: profile.id,
        note,
        is_shared: true
      })
      .select("*")
      .single();

    setSavingNote(false);

    if (error || !data) {
      setMessage({ type: "error", text: error?.message ?? "Meeting note could not be saved." });
      return;
    }

    setNotes((current) => [data as MeetingNote, ...current]);
    setNoteText("");
    setMessage({ type: "success", text: "Meeting note saved." });
    router.refresh();
  }

  async function generateExport(exportType: ExportType) {
    if (!canRequestExports) return;
    setBusyExport(exportType);
    setMessage(null);

    const functionName = exportType === "archive" ? "meeting-archive" : "generate-export";
    const body = exportType === "archive" ? { meetingId: meeting.id } : { meetingId: meeting.id, exportType };
    const { data, error } = await supabase.functions.invoke<ExportResult>(functionName, { body });

    setBusyExport(null);

    if (error || !data || data.status === "failed") {
      setMessage({ type: "error", text: error?.message ?? data?.error ?? "Export generation failed." });
      await supabase.channel(`meeting:${meeting.id}`).send({
        type: "broadcast",
        event: REALTIME_EVENTS.exportFailed,
        payload: { exportType }
      });
      router.refresh();
      return;
    }

    setMessage({
      type: "success",
      text: "Export is ready. The signed link is valid for 10 minutes.",
      signedUrl: data.signedUrl
    });
    await supabase.channel(`meeting:${meeting.id}`).send({
      type: "broadcast",
      event: REALTIME_EVENTS.exportReady,
      payload: { exportType, storagePath: data.storagePath }
    });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {message ? (
        <Alert className={message.type === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>
          <AlertTitle>{message.type === "error" ? "Export issue" : "Export updated"}</AlertTitle>
          <AlertDescription className="space-y-3">
            <span className="block">{message.text}</span>
            {message.signedUrl ? (
              <Button asChild size="sm">
                <a href={message.signedUrl} rel="noreferrer" target="_blank">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download signed file
                </a>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {!canRequestExports ? (
        <Alert>
          <AlertTitle>Downloads are not enabled yet</AlertTitle>
          <AlertDescription>Participants can download exports after meeting completion or when the presenter enables downloads for them.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {exportOptions.map((option) => (
          <Card key={option.type} className="bg-white/85 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <option.icon className="h-5 w-5" aria-hidden="true" />
                {option.label}
              </CardTitle>
              <CardDescription>{option.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled={!canRequestExports || busyExport !== null} onClick={() => generateExport(option.type)} className="w-full">
                {busyExport === option.type ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                Generate and download
              </Button>
            </CardContent>
          </Card>
        ))}

        <Card className="bg-white/85 backdrop-blur lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" aria-hidden="true" />
              Meeting archive package
            </CardTitle>
            <CardDescription>ZIP containing annotated PDF, notes, annotation history CSV/JSON, user-wise report, attendance CSV, and manifest.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled={!canRequestExports || busyExport !== null} onClick={() => generateExport("archive")} className="w-full">
              {busyExport === "archive" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileArchive className="h-4 w-4" aria-hidden="true" />}
              Generate archive ZIP
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle>Meeting notes</CardTitle>
            <CardDescription>Shared notes are included in the notes export and archive.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canWriteNotes ? (
              <div className="space-y-3">
                <Textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} rows={4} placeholder="Capture decision, action item, or context..." />
                <Button disabled={savingNote || noteText.trim().length === 0} onClick={saveNote}>
                  {savingNote ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <NotebookPen className="h-4 w-4" aria-hidden="true" />}
                  Save shared note
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Admins can review notes but only meeting members add them.</p>
            )}

            <div className="space-y-3">
              {notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes recorded yet.</p> : null}
              {notes.map((note) => (
                <div key={note.id} className="rounded-3xl border border-border/70 bg-white/75 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Badge variant={note.is_shared ? "success" : "outline"}>{note.is_shared ? "shared" : "private"}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{note.note}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle>Export jobs</CardTitle>
            <CardDescription>Latest generated files and failed attempts for this meeting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.length === 0 ? <p className="text-sm text-muted-foreground">No export jobs yet.</p> : null}
            {jobs.map((job) => (
              <div key={job.id} className="rounded-3xl border border-border/70 bg-white/75 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{job.export_type.replaceAll("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant={job.status === "completed" ? "success" : job.status === "failed" ? "outline" : "secondary"}>{job.status}</Badge>
                </div>
                {job.storage_path ? <p className="mt-2 break-all text-xs text-muted-foreground">{job.storage_path}</p> : null}
                {job.error_message ? <p className="mt-2 text-xs text-destructive">{job.error_message}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
