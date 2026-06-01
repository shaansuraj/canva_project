"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, RefreshCw, UserPlus, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { updateProfileStatusAction } from "./actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createUserSchema, resetPasswordSchema, type CreateUserInput, type ResetPasswordInput } from "@/lib/validation/admin";
import type { Profile } from "@/types/app";

function getFunctionErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null && "error" in data) {
    const value = (data as { error?: unknown }).error;
    if (typeof value === "string") return value;
  }

  return fallback;
}

export function AdminUsersClient({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const createForm = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      password: "",
      fullName: "",
      designation: "",
      role: "participant",
      color: "#0f4c5c"
    }
  });

  const resetForm = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      userId: profiles.find((profile) => profile.role !== "admin")?.id ?? "",
      password: "",
      mustChangePassword: true
    }
  });

  async function onCreateUser(values: CreateUserInput) {
    setNotice(null);
    const { data, error } = await supabase.functions.invoke<{ profile: Profile }>("admin-create-user", {
      body: {
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        designation: values.designation || null,
        role: values.role,
        color: values.color || null
      }
    });

    if (error || !data?.profile) {
      setNotice({ type: "error", message: getFunctionErrorMessage(data, error?.message ?? "Could not create user.") });
      return;
    }

    createForm.reset({ email: "", password: "", fullName: "", designation: "", role: "participant", color: "#0f4c5c" });
    setNotice({ type: "success", message: `${data.profile.full_name} was created as ${data.profile.role}.` });
    router.refresh();
  }

  async function onResetPassword(values: ResetPasswordInput) {
    setNotice(null);
    const { data, error } = await supabase.functions.invoke("admin-reset-password", {
      body: values
    });

    if (error) {
      setNotice({ type: "error", message: getFunctionErrorMessage(data, error.message) });
      return;
    }

    resetForm.reset({ userId: values.userId, password: "", mustChangePassword: true });
    setNotice({ type: "success", message: "Password reset successfully." });
    router.refresh();
  }

  function updateStatus(profile: Profile) {
    setPendingStatusId(profile.id);
    setNotice(null);
    startTransition(async () => {
      const result = await updateProfileStatusAction({ userId: profile.id, isActive: !profile.is_active });
      setPendingStatusId(null);
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) router.refresh();
    });
  }

  const manageableProfiles = profiles.filter((profile) => profile.role !== "admin");

  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="space-y-5">
        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>Create user</CardTitle>
                <CardDescription>Admins can create Presenter or Participant accounts only.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={createForm.handleSubmit(onCreateUser)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" {...createForm.register("fullName")} placeholder="Aarav Mehta" />
                  <p className="text-xs text-destructive">{createForm.formState.errors.fullName?.message}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...createForm.register("email")} placeholder="name@company.com" />
                  <p className="text-xs text-destructive">{createForm.formState.errors.email?.message}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Temporary password</Label>
                  <Input id="password" type="password" {...createForm.register("password")} placeholder="Minimum 8 characters" />
                  <p className="text-xs text-destructive">{createForm.formState.errors.password?.message}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="designation">Designation</Label>
                  <Input id="designation" {...createForm.register("designation")} placeholder="Project Lead" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm font-medium"
                    {...createForm.register("role")}
                  >
                    <option value="participant">Participant</option>
                    <option value="presenter">Presenter</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Annotation color</Label>
                  <Input id="color" type="color" {...createForm.register("color")} className="h-11 p-2" />
                </div>
              </div>
              <Button disabled={createForm.formState.isSubmitting} type="submit" className="w-full sm:w-auto">
                {createForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Create user
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>Sets a temporary password and flags the user for password change.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={resetForm.handleSubmit(onResetPassword)}>
              <div className="space-y-2">
                <Label htmlFor="resetUserId">User</Label>
                <select
                  id="resetUserId"
                  className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm font-medium"
                  {...resetForm.register("userId")}
                >
                  {manageableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name} - {profile.role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="resetPassword">New temporary password</Label>
                <Input id="resetPassword" type="password" {...resetForm.register("password")} />
                <p className="text-xs text-destructive">{resetForm.formState.errors.password?.message}</p>
              </div>
              <label className="flex items-center gap-3 text-sm font-medium">
                <input className="h-4 w-4 rounded border-input" type="checkbox" {...resetForm.register("mustChangePassword")} />
                Require password change on next sign-in
              </label>
              <Button disabled={resetForm.formState.isSubmitting || manageableProfiles.length === 0} type="submit" variant="secondary">
                {resetForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Reset password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/85 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="h-5 w-5" aria-hidden="true" />
                Users
              </CardTitle>
              <CardDescription>{profiles.length} account{profiles.length === 1 ? "" : "s"} in this workspace.</CardDescription>
            </div>
            <Button onClick={() => router.refresh()} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice ? (
            <Alert className={notice.type === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>
              <AlertTitle>{notice.type === "error" ? "Action failed" : "Action complete"}</AlertTitle>
              <AlertDescription>{notice.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-3">
            {profiles.map((profile) => {
              const canManage = profile.role !== "admin";
              return (
                <div key={profile.id} className="rounded-3xl border border-border/70 bg-white/75 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{profile.full_name}</p>
                        <Badge variant={profile.is_active ? "success" : "outline"}>{profile.is_active ? "active" : "inactive"}</Badge>
                        <Badge variant="secondary">{profile.role}</Badge>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{profile.email}</p>
                      {profile.designation ? <p className="text-xs text-muted-foreground">{profile.designation}</p> : null}
                    </div>
                    <Button
                      disabled={!canManage || isPending || pendingStatusId === profile.id}
                      onClick={() => updateStatus(profile)}
                      variant={profile.is_active ? "outline" : "default"}
                      size="sm"
                    >
                      {pendingStatusId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                      {profile.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
