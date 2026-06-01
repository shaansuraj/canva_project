"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { createMeetingAction } from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createMeetingSchema, type CreateMeetingInput } from "@/lib/validation/meetings";

export function CreateMeetingForm() {
  const router = useRouter();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const form = useForm<CreateMeetingInput>({
    resolver: zodResolver(createMeetingSchema),
    defaultValues: {
      title: "",
      description: "",
      scheduledStartAt: "",
      maxParticipants: 35
    }
  });

  async function onSubmit(values: CreateMeetingInput) {
    setMessage(null);
    const result = await createMeetingAction(values);

    if (!result.ok || !result.meetingId) {
      setMessage({ type: "error", text: result.message });
      return;
    }

    setMessage({ type: "success", text: `Meeting code ${result.code} created.` });
    router.push(`/meetings/${result.meetingId}/room`);
    router.refresh();
  }

  return (
    <Card className="mx-auto max-w-3xl bg-white/85 backdrop-blur">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <CalendarPlus className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Create meeting</CardTitle>
            <CardDescription>A unique join code is generated when the meeting is saved.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
          {message ? (
            <Alert className={message.type === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>
              <AlertTitle>{message.type === "error" ? "Could not create meeting" : "Meeting ready"}</AlertTitle>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...form.register("title")} placeholder="Quarterly design review" />
            <p className="text-xs text-destructive">{form.formState.errors.title?.message}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register("description")} placeholder="Purpose, agenda, or participant guidance" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="scheduledStartAt">Scheduled start</Label>
              <Input id="scheduledStartAt" type="datetime-local" {...form.register("scheduledStartAt")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxParticipants">Max participants</Label>
              <Input id="maxParticipants" min={1} max={250} type="number" {...form.register("maxParticipants", { valueAsNumber: true })} />
              <p className="text-xs text-destructive">{form.formState.errors.maxParticipants?.message}</p>
            </div>
          </div>

          <Button disabled={form.formState.isSubmitting} type="submit" className="w-full sm:w-auto">
            {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Create meeting
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
