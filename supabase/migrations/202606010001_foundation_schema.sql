-- Phase 1 foundation schema for Smart Collaborative Meeting & Annotation System.
-- Apply with: supabase db push or paste into the Supabase SQL editor.

create extension if not exists pgcrypto;

-- Enums ----------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'presenter', 'participant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.meeting_status as enum ('scheduled', 'live', 'paused', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_type as enum ('pdf', 'image', 'pptx', 'ppt');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.conversion_status as enum ('pending', 'processing', 'ready', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.annotation_type as enum ('pen', 'highlighter', 'text', 'rectangle', 'circle', 'line', 'arrow', 'eraser');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.annotation_event_type as enum ('created', 'updated', 'deleted', 'cleared');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.export_type as enum ('annotated_pdf', 'notes', 'annotation_history', 'user_report', 'archive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.export_status as enum ('queued', 'processing', 'completed', 'failed');
exception when duplicate_object then null; end $$;

-- Tables ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  designation text,
  role public.user_role not null,
  is_active boolean default true,
  color text,
  must_change_password boolean default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  description text,
  status public.meeting_status default 'scheduled',
  presenter_id uuid references public.profiles(id) not null,
  scheduled_start_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  participant_annotation_enabled boolean default true,
  document_locked boolean default false,
  selected_document_id uuid,
  selected_page_id uuid,
  downloads_enabled boolean default false,
  max_participants int default 35,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  user_id uuid references public.profiles(id),
  role_snapshot public.user_role not null,
  name_snapshot text not null,
  designation_snapshot text,
  color_snapshot text,
  joined_at timestamptz default now(),
  last_seen_at timestamptz,
  left_at timestamptz,
  is_present boolean default true,
  unique(meeting_id, user_id)
);

create table if not exists public.participant_permissions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  user_id uuid references public.profiles(id),
  can_annotate boolean default true,
  can_download boolean default false,
  is_muted_from_annotation boolean default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  unique(meeting_id, user_id)
);

create table if not exists public.meeting_documents (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  uploaded_by uuid references public.profiles(id),
  title text not null,
  document_type public.document_type not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  file_size_bytes bigint,
  conversion_status public.conversion_status default 'pending',
  conversion_error text,
  page_count int default 0,
  created_at timestamptz default now()
);

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.meeting_documents(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete cascade,
  page_number int not null,
  width numeric,
  height numeric,
  preview_storage_path text,
  created_at timestamptz default now(),
  unique(document_id, page_number)
);

alter table public.meetings
  drop constraint if exists meetings_selected_document_id_fkey,
  add constraint meetings_selected_document_id_fkey
    foreign key (selected_document_id) references public.meeting_documents(id) on delete set null;

alter table public.meetings
  drop constraint if exists meetings_selected_page_id_fkey,
  add constraint meetings_selected_page_id_fkey
    foreign key (selected_page_id) references public.document_pages(id) on delete set null;

create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  document_id uuid references public.meeting_documents(id) on delete cascade,
  page_id uuid references public.document_pages(id) on delete cascade,
  user_id uuid references public.profiles(id),
  user_name_snapshot text not null,
  designation_snapshot text,
  role_snapshot public.user_role not null,
  annotation_type public.annotation_type not null,
  color text not null,
  payload jsonb not null,
  version int default 1,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.annotation_events (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid references public.annotations(id) on delete set null,
  meeting_id uuid references public.meetings(id) on delete cascade,
  document_id uuid references public.meeting_documents(id) on delete cascade,
  page_id uuid references public.document_pages(id) on delete cascade,
  user_id uuid references public.profiles(id),
  event_type public.annotation_event_type not null,
  before_payload jsonb,
  after_payload jsonb,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  user_id uuid references public.profiles(id),
  note text not null,
  is_shared boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.screen_share_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  presenter_id uuid references public.profiles(id),
  livekit_room_name text not null,
  started_at timestamptz default now(),
  paused_at timestamptz,
  stopped_at timestamptz,
  status text default 'live'
);

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  requested_by uuid references public.profiles(id),
  export_type public.export_type not null,
  status public.export_status default 'queued',
  storage_path text,
  error_message text,
  metadata jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  meeting_id uuid references public.meetings(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

-- Indexes --------------------------------------------------------------------
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_active_idx on public.profiles(is_active);
create index if not exists meetings_presenter_idx on public.meetings(presenter_id);
create index if not exists meetings_code_idx on public.meetings(code);
create index if not exists meeting_participants_meeting_idx on public.meeting_participants(meeting_id);
create index if not exists meeting_participants_user_idx on public.meeting_participants(user_id);
create index if not exists participant_permissions_meeting_user_idx on public.participant_permissions(meeting_id, user_id);
create index if not exists meeting_documents_meeting_idx on public.meeting_documents(meeting_id);
create index if not exists document_pages_document_idx on public.document_pages(document_id);
create index if not exists annotations_page_idx on public.annotations(page_id, is_deleted);
create index if not exists annotations_meeting_user_idx on public.annotations(meeting_id, user_id);
create index if not exists annotation_events_meeting_idx on public.annotation_events(meeting_id, created_at);
create index if not exists export_jobs_meeting_idx on public.export_jobs(meeting_id, export_type);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id, created_at);
create index if not exists audit_logs_meeting_idx on public.audit_logs(meeting_id, created_at);

-- Updated-at triggers ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists meetings_set_updated_at on public.meetings;
create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

drop trigger if exists participant_permissions_set_updated_at on public.participant_permissions;
create trigger participant_permissions_set_updated_at
  before update on public.participant_permissions
  for each row execute function public.set_updated_at();

drop trigger if exists annotations_set_updated_at on public.annotations;
create trigger annotations_set_updated_at
  before update on public.annotations
  for each row execute function public.set_updated_at();

drop trigger if exists meeting_notes_set_updated_at on public.meeting_notes;
create trigger meeting_notes_set_updated_at
  before update on public.meeting_notes
  for each row execute function public.set_updated_at();

-- Helper functions ------------------------------------------------------------
create or replace function public.auth_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.auth_user_role() = 'admin', false)
$$;

create or replace function public.is_presenter()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.auth_user_role() = 'presenter', false)
$$;

create or replace function public.is_meeting_presenter(meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meetings m
    join public.profiles p on p.id = auth.uid()
    where m.id = meeting_id
      and m.presenter_id = auth.uid()
      and p.role = 'presenter'
      and p.is_active = true
  )
$$;

create or replace function public.is_meeting_member(meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.presenter_id = auth.uid()
  ) or exists (
    select 1 from public.meeting_participants mp
    join public.profiles p on p.id = mp.user_id
    where mp.meeting_id = meeting_id
      and mp.user_id = auth.uid()
      and p.is_active = true
  )
$$;

create or replace function public.can_user_annotate(meeting_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meetings m
    join public.profiles p on p.id = user_id
    left join public.participant_permissions pp
      on pp.meeting_id = m.id and pp.user_id = user_id
    where m.id = meeting_id
      and user_id = auth.uid()
      and p.is_active = true
      and m.status = 'live'
      and m.document_locked = false
      and (
        (m.presenter_id = user_id and p.role = 'presenter')
        or (
          p.role = 'participant'
          and m.participant_annotation_enabled = true
          and exists (
            select 1 from public.meeting_participants mp
            where mp.meeting_id = m.id and mp.user_id = user_id and mp.is_present = true
          )
          and coalesce(pp.can_annotate, true) = true
          and coalesce(pp.is_muted_from_annotation, false) = false
        )
      )
  )
$$;

-- RLS ------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.participant_permissions enable row level security;
alter table public.meeting_documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.annotations enable row level security;
alter table public.annotation_events enable row level security;
alter table public.meeting_notes enable row level security;
alter table public.screen_share_sessions enable row level security;
alter table public.export_jobs enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles
DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
CREATE POLICY profiles_insert_admin ON public.profiles
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Meetings
DROP POLICY IF EXISTS meetings_select_allowed ON public.meetings;
CREATE POLICY meetings_select_allowed ON public.meetings
  FOR SELECT USING (
    public.is_admin()
    OR presenter_id = auth.uid()
    OR public.is_meeting_member(id)
    OR (
      status in ('scheduled', 'live', 'paused')
      AND exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true)
    )
  );

DROP POLICY IF EXISTS meetings_insert_presenter ON public.meetings;
CREATE POLICY meetings_insert_presenter ON public.meetings
  FOR INSERT WITH CHECK (public.is_presenter() AND presenter_id = auth.uid());

DROP POLICY IF EXISTS meetings_update_presenter ON public.meetings;
CREATE POLICY meetings_update_presenter ON public.meetings
  FOR UPDATE USING (public.is_meeting_presenter(id)) WITH CHECK (presenter_id = auth.uid());

-- Meeting participants / attendance
DROP POLICY IF EXISTS meeting_participants_select_allowed ON public.meeting_participants;
CREATE POLICY meeting_participants_select_allowed ON public.meeting_participants
  FOR SELECT USING (public.is_admin() OR public.is_meeting_presenter(meeting_id) OR user_id = auth.uid() OR public.is_meeting_member(meeting_id));

DROP POLICY IF EXISTS meeting_participants_insert_self_active ON public.meeting_participants;
CREATE POLICY meeting_participants_insert_self_active ON public.meeting_participants
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true)
    AND role_snapshot = public.auth_user_role()
  );

DROP POLICY IF EXISTS meeting_participants_update_self_or_presenter ON public.meeting_participants;
CREATE POLICY meeting_participants_update_self_or_presenter ON public.meeting_participants
  FOR UPDATE USING (user_id = auth.uid() OR public.is_meeting_presenter(meeting_id))
  WITH CHECK (user_id = auth.uid() OR public.is_meeting_presenter(meeting_id));

-- Participant permissions
DROP POLICY IF EXISTS participant_permissions_select_allowed ON public.participant_permissions;
CREATE POLICY participant_permissions_select_allowed ON public.participant_permissions
  FOR SELECT USING (public.is_admin() OR public.is_meeting_presenter(meeting_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS participant_permissions_manage_presenter ON public.participant_permissions;
CREATE POLICY participant_permissions_manage_presenter ON public.participant_permissions
  FOR ALL USING (public.is_meeting_presenter(meeting_id)) WITH CHECK (public.is_meeting_presenter(meeting_id));

-- Documents and pages
DROP POLICY IF EXISTS meeting_documents_select_members ON public.meeting_documents;
CREATE POLICY meeting_documents_select_members ON public.meeting_documents
  FOR SELECT USING (public.is_admin() OR public.is_meeting_member(meeting_id));

DROP POLICY IF EXISTS meeting_documents_insert_presenter ON public.meeting_documents;
CREATE POLICY meeting_documents_insert_presenter ON public.meeting_documents
  FOR INSERT WITH CHECK (public.is_meeting_presenter(meeting_id) AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS meeting_documents_update_presenter ON public.meeting_documents;
CREATE POLICY meeting_documents_update_presenter ON public.meeting_documents
  FOR UPDATE USING (public.is_meeting_presenter(meeting_id)) WITH CHECK (public.is_meeting_presenter(meeting_id));

DROP POLICY IF EXISTS document_pages_select_members ON public.document_pages;
CREATE POLICY document_pages_select_members ON public.document_pages
  FOR SELECT USING (public.is_admin() OR public.is_meeting_member(meeting_id));

DROP POLICY IF EXISTS document_pages_manage_presenter ON public.document_pages;
CREATE POLICY document_pages_manage_presenter ON public.document_pages
  FOR ALL USING (public.is_meeting_presenter(meeting_id)) WITH CHECK (public.is_meeting_presenter(meeting_id));

-- Annotations
DROP POLICY IF EXISTS annotations_select_members ON public.annotations;
CREATE POLICY annotations_select_members ON public.annotations
  FOR SELECT USING (public.is_admin() OR public.is_meeting_member(meeting_id));

DROP POLICY IF EXISTS annotations_insert_allowed ON public.annotations;
CREATE POLICY annotations_insert_allowed ON public.annotations
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND public.can_user_annotate(meeting_id, user_id)
    AND role_snapshot = public.auth_user_role()
  );

DROP POLICY IF EXISTS annotations_update_owner_or_presenter ON public.annotations;
CREATE POLICY annotations_update_owner_or_presenter ON public.annotations
  FOR UPDATE USING (user_id = auth.uid() OR public.is_meeting_presenter(meeting_id))
  WITH CHECK (user_id = auth.uid() OR public.is_meeting_presenter(meeting_id));

DROP POLICY IF EXISTS annotations_delete_owner_or_presenter ON public.annotations;
CREATE POLICY annotations_delete_owner_or_presenter ON public.annotations
  FOR DELETE USING (user_id = auth.uid() OR public.is_meeting_presenter(meeting_id));

-- Annotation events are append-only from the client perspective.
DROP POLICY IF EXISTS annotation_events_select_allowed ON public.annotation_events;
CREATE POLICY annotation_events_select_allowed ON public.annotation_events
  FOR SELECT USING (
    public.is_admin()
    OR public.is_meeting_presenter(meeting_id)
    OR (user_id = auth.uid() AND public.is_meeting_member(meeting_id))
  );

DROP POLICY IF EXISTS annotation_events_insert_members ON public.annotation_events;
CREATE POLICY annotation_events_insert_members ON public.annotation_events
  FOR INSERT WITH CHECK (user_id = auth.uid() AND public.is_meeting_member(meeting_id));

-- Notes
DROP POLICY IF EXISTS meeting_notes_select_allowed ON public.meeting_notes;
CREATE POLICY meeting_notes_select_allowed ON public.meeting_notes
  FOR SELECT USING (public.is_admin() OR public.is_meeting_presenter(meeting_id) OR (is_shared = true AND public.is_meeting_member(meeting_id)) OR user_id = auth.uid());

DROP POLICY IF EXISTS meeting_notes_insert_members ON public.meeting_notes;
CREATE POLICY meeting_notes_insert_members ON public.meeting_notes
  FOR INSERT WITH CHECK (user_id = auth.uid() AND public.is_meeting_member(meeting_id));

DROP POLICY IF EXISTS meeting_notes_update_owner_or_presenter ON public.meeting_notes;
CREATE POLICY meeting_notes_update_owner_or_presenter ON public.meeting_notes
  FOR UPDATE USING (user_id = auth.uid() OR public.is_meeting_presenter(meeting_id))
  WITH CHECK (user_id = auth.uid() OR public.is_meeting_presenter(meeting_id));

-- Screen-share sessions are presenter-controlled and member-readable.
DROP POLICY IF EXISTS screen_share_sessions_select_members ON public.screen_share_sessions;
CREATE POLICY screen_share_sessions_select_members ON public.screen_share_sessions
  FOR SELECT USING (public.is_admin() OR public.is_meeting_member(meeting_id));

DROP POLICY IF EXISTS screen_share_sessions_manage_presenter ON public.screen_share_sessions;
CREATE POLICY screen_share_sessions_manage_presenter ON public.screen_share_sessions
  FOR ALL USING (public.is_meeting_presenter(meeting_id)) WITH CHECK (public.is_meeting_presenter(meeting_id) AND presenter_id = auth.uid());

-- Exports
DROP POLICY IF EXISTS export_jobs_select_allowed ON public.export_jobs;
CREATE POLICY export_jobs_select_allowed ON public.export_jobs
  FOR SELECT USING (public.is_admin() OR public.is_meeting_presenter(meeting_id) OR requested_by = auth.uid());

DROP POLICY IF EXISTS export_jobs_insert_allowed ON public.export_jobs;
CREATE POLICY export_jobs_insert_allowed ON public.export_jobs
  FOR INSERT WITH CHECK (requested_by = auth.uid() AND (public.is_admin() OR public.is_meeting_presenter(meeting_id) OR public.is_meeting_member(meeting_id)));

DROP POLICY IF EXISTS export_jobs_update_admin_presenter ON public.export_jobs;
CREATE POLICY export_jobs_update_admin_presenter ON public.export_jobs
  FOR UPDATE USING (public.is_admin() OR public.is_meeting_presenter(meeting_id))
  WITH CHECK (public.is_admin() OR public.is_meeting_presenter(meeting_id));

-- Audit logs
DROP POLICY IF EXISTS audit_logs_select_allowed ON public.audit_logs;
CREATE POLICY audit_logs_select_allowed ON public.audit_logs
  FOR SELECT USING (public.is_admin() OR (meeting_id is not null AND public.is_meeting_presenter(meeting_id)) OR actor_id = auth.uid());

DROP POLICY IF EXISTS audit_logs_insert_authenticated ON public.audit_logs;
CREATE POLICY audit_logs_insert_authenticated ON public.audit_logs
  FOR INSERT WITH CHECK (actor_id = auth.uid() OR public.is_admin());

-- Storage buckets -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('meeting-documents', 'meeting-documents', false, 52428800, null),
  ('meeting-page-previews', 'meeting-page-previews', false, 10485760, array['image/png', 'image/jpeg', 'image/webp']),
  ('meeting-exports', 'meeting-exports', false, 52428800, null),
  ('meeting-archives', 'meeting-archives', false, 104857600, array['application/zip', 'application/x-zip-compressed'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies assume first path segment is meetingId.
DROP POLICY IF EXISTS storage_meeting_documents_read ON storage.objects;
CREATE POLICY storage_meeting_documents_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'meeting-documents'
    AND (public.is_admin() OR public.is_meeting_member((storage.foldername(name))[1]::uuid))
  );

DROP POLICY IF EXISTS storage_meeting_documents_presenter_write ON storage.objects;
CREATE POLICY storage_meeting_documents_presenter_write ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'meeting-documents'
    AND public.is_meeting_presenter((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS storage_page_previews_read ON storage.objects;
CREATE POLICY storage_page_previews_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'meeting-page-previews'
    AND (public.is_admin() OR public.is_meeting_member((storage.foldername(name))[1]::uuid))
  );

DROP POLICY IF EXISTS storage_page_previews_presenter_write ON storage.objects;
CREATE POLICY storage_page_previews_presenter_write ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'meeting-page-previews'
    AND public.is_meeting_presenter((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS storage_exports_read ON storage.objects;
CREATE POLICY storage_exports_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'meeting-exports'
    AND (public.is_admin() OR public.is_meeting_member((storage.foldername(name))[1]::uuid))
  );

DROP POLICY IF EXISTS storage_exports_admin_presenter_write ON storage.objects;
CREATE POLICY storage_exports_admin_presenter_write ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'meeting-exports'
    AND (public.is_admin() OR public.is_meeting_presenter((storage.foldername(name))[1]::uuid))
  );

DROP POLICY IF EXISTS storage_archives_read ON storage.objects;
CREATE POLICY storage_archives_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'meeting-archives'
    AND (public.is_admin() OR public.is_meeting_presenter((storage.foldername(name))[1]::uuid))
  );

DROP POLICY IF EXISTS storage_archives_admin_presenter_write ON storage.objects;
CREATE POLICY storage_archives_admin_presenter_write ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'meeting-archives'
    AND (public.is_admin() OR public.is_meeting_presenter((storage.foldername(name))[1]::uuid))
  );
