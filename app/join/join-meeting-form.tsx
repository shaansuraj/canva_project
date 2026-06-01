"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { joinMeetingAction } from "./actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinMeetingSchema, type JoinMeetingInput } from "@/lib/validation/meetings";

export function JoinMeetingForm() {
  const router = useRouter();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const form = useForm<JoinMeetingInput>({
    resolver: zodResolver(joinMeetingSchema),
    defaultValues: { code: "" }
  });

  async function onSubmit(values: JoinMeetingInput) {
    setMessage(null);
    const result = await joinMeetingAction(values);

    if (!result.ok || !result.meetingId) {
      setMessage({ type: "error", text: result.message });
      return;
    }

    setMessage({ type: "success", text: "Opening meeting room." });
    router.push(`/meetings/${result.meetingId}/room`);
    router.refresh();
  }

  return (
    <Card className="mx-auto max-w-2xl overflow-hidden bg-white/85 backdrop-blur">
      <div className="h-2 bg-gradient-to-r from-primary via-accent to-secondary" />
      <CardHeader>
        <CardTitle>Enter meeting code</CardTitle>
        <CardDescription>Active participants can join any scheduled, live, or paused meeting by code.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
          {message ? (
            <Alert className={message.type === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>
              <AlertTitle>{message.type === "error" ? "Join failed" : "Joined"}</AlertTitle>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="code">Meeting code</Label>
            <Input
              id="code"
              autoCapitalize="characters"
              className="h-16 text-center text-3xl font-black uppercase tracking-[0.35em]"
              maxLength={16}
              placeholder="ABC123"
              {...form.register("code")}
            />
            <p className="text-xs text-destructive">{form.formState.errors.code?.message}</p>
          </div>

          <Button className="h-12 w-full" disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Join meeting
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
