import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AuditLog = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
};

export default async function AdminAuditPage() {
  const profile = await requireRole("admin");
  const supabase = await createSupabaseServerClient();

  const { data: logs, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <AppShell
      profile={profile}
      title="Audit log"
      description="Review trusted admin and meeting workflow events."
    >
      {error ? <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{error.message}</div> : null}
      <Card className="bg-white/85 backdrop-blur">
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Latest 50 audit entries.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(logs as AuditLog[] | null ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No audit events yet.</p> : null}
          {(logs as AuditLog[] | null ?? []).map((log) => (
            <div key={log.id} className="rounded-2xl border border-border/70 bg-white/75 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <Badge variant="secondary">{log.action}</Badge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {log.entity_type ?? "entity"} {log.entity_id ?? ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}
