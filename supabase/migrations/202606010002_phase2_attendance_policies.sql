-- Phase 2 tightening for attendance joins.
-- Active users may create their own attendance row for scheduled/live/paused meetings.
-- Presenters may also create an attendance row for their own meeting room entry.

DROP POLICY IF EXISTS meeting_participants_insert_self_active ON public.meeting_participants;
CREATE POLICY meeting_participants_insert_self_active ON public.meeting_participants
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true)
    AND role_snapshot = public.auth_user_role()
    AND exists (
      select 1
      from public.meetings m
      where m.id = meeting_id
        and (
          (m.presenter_id = auth.uid())
          or (m.status in ('scheduled', 'live', 'paused'))
        )
    )
  );
