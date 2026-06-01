import { LoginForm } from "./login-form";
import { APP_NAME } from "@/lib/constants";

export default function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string; next?: string };
}) {
  const inactive = searchParams?.error === "inactive";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
      <section className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
        <div className="space-y-6 rounded-[2rem] border border-white/60 bg-white/45 p-6 shadow-soft backdrop-blur md:p-10">
          <div className="inline-flex rounded-full border border-primary/15 bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Hexmon Meeting OS
          </div>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-black leading-[0.95] tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Collaborative meetings with auditable annotation built in.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              One secure login for admins, presenters, and participants. Presenter-led meetings, shared documents,
              attendance, and export-ready audit trails start here.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            <div className="rounded-2xl bg-white/65 p-4">
              <strong className="block text-foreground">Admin</strong>
              Manage users and reports.
            </div>
            <div className="rounded-2xl bg-white/65 p-4">
              <strong className="block text-foreground">Presenter</strong>
              Create and lead sessions.
            </div>
            <div className="rounded-2xl bg-white/65 p-4">
              <strong className="block text-foreground">Participant</strong>
              Join by meeting code.
            </div>
          </div>
        </div>
        <LoginForm appName={APP_NAME} inactive={inactive} nextPath={searchParams?.next} />
      </section>
    </main>
  );
}
