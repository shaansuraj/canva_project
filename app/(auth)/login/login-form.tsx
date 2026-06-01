"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, Loader2, LockKeyhole } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { loginSchema } from "@/lib/validation/auth";

export function LoginForm({
  appName,
  inactive,
  nextPath
}: {
  appName: string;
  inactive: boolean;
  nextPath?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("admin@hexmon.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(inactive ? "Your account is inactive. Contact an admin." : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inactive) return;

    const supabase = createSupabaseBrowserClient();
    void supabase.auth.signOut();
  }, [inactive]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your login details.");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);

    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user?.id ?? "")
      .single();

    if (profileError || !profile?.is_active) {
      await supabase.auth.signOut();
      setLoading(false);
      setError(profileError?.message ?? "Your account is inactive. Contact an admin.");
      return;
    }

    router.replace(nextPath && nextPath.startsWith("/") ? nextPath : "/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full border-white/70 bg-white/85 backdrop-blur">
      <CardHeader className="space-y-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <LockKeyhole className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>{appName}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={onSubmit}>
          {error ? (
            <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
              <AlertCircle className="mb-2 h-4 w-4" aria-hidden="true" />
              <AlertTitle>Unable to sign in</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              type="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              type="password"
            />
          </div>

          <Button className="h-12 w-full" disabled={loading} type="submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Continue
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Seed admin: <span className="font-semibold text-foreground">admin@hexmon.com</span>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
