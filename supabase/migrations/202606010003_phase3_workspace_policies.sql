-- Phase 3 collaboration helpers and RLS adjustments.
-- Presenter can annotate an owned, unlocked document even before participant access goes live.
-- Participants remain limited to live meetings with participant annotation enabled.

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
      and m.document_locked = false
      and (
        (m.presenter_id = user_id and p.role = 'presenter')
        or (
          p.role = 'participant'
          and m.status = 'live'
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

-- Clients may soft-delete annotations with updates. Hard deletes remain owner/presenter limited by existing policy.
-- No update/delete policy exists for annotation_events, preserving append-only audit history.
