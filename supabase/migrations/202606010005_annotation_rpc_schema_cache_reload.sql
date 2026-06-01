-- Compatibility safety net for older deployed bundles that still call the
-- create_annotation_with_event RPC directly. Also asks PostgREST to reload its
-- schema cache so newly-created functions are visible immediately.

create or replace function public.create_annotation_with_event(
  p_meeting_id uuid,
  p_document_id uuid,
  p_page_id uuid,
  p_annotation_type public.annotation_type,
  p_color text,
  p_payload jsonb
)
returns public.annotations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_annotation public.annotations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid();

  if not found or v_profile.is_active is not true then
    raise exception 'Active profile required' using errcode = '42501';
  end if;

  if public.document_page_belongs_to_meeting(p_meeting_id, p_document_id, p_page_id) is not true then
    raise exception 'Document page does not belong to meeting' using errcode = '23503';
  end if;

  if public.can_user_annotate(p_meeting_id, auth.uid()) is not true then
    raise exception 'User is not allowed to annotate this meeting' using errcode = '42501';
  end if;

  insert into public.annotations (
    meeting_id,
    document_id,
    page_id,
    user_id,
    user_name_snapshot,
    designation_snapshot,
    role_snapshot,
    annotation_type,
    color,
    payload
  ) values (
    p_meeting_id,
    p_document_id,
    p_page_id,
    auth.uid(),
    v_profile.full_name,
    v_profile.designation,
    v_profile.role,
    p_annotation_type,
    p_color,
    p_payload
  )
  returning * into v_annotation;

  insert into public.annotation_events (
    annotation_id,
    meeting_id,
    document_id,
    page_id,
    user_id,
    event_type,
    after_payload,
    metadata
  ) values (
    v_annotation.id,
    p_meeting_id,
    p_document_id,
    p_page_id,
    auth.uid(),
    'created',
    v_annotation.payload,
    jsonb_build_object(
      'userName', v_profile.full_name,
      'designation', v_profile.designation,
      'role', v_profile.role,
      'annotationType', p_annotation_type,
      'color', p_color
    )
  );

  return v_annotation;
end;
$$;

revoke all on function public.create_annotation_with_event(uuid, uuid, uuid, public.annotation_type, text, jsonb) from public;
grant execute on function public.create_annotation_with_event(uuid, uuid, uuid, public.annotation_type, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
