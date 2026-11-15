-- Approval required: prepare/test locally; never auto-apply to production.
-- Existing entry states and existing confirmation timestamps remain unchanged.
begin;
set local lock_timeout = '5s';

alter table public.handoff_entries
  add column workflow_revision bigint not null default 0 check (workflow_revision >= 0),
  add column archived boolean not null default false;
alter table public.handoff_entries add constraint handoff_entries_id_org_unique unique (id, organization_id);
alter table public.handoff_confirmations
  add column confirmation_revision bigint not null default 0 check (confirmation_revision >= 0),
  add column revoked_at timestamptz,
  add column staff_name text check (char_length(staff_name) <= 80),
  add column staff_id uuid;

create table public.handoff_activity (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 entry_id uuid not null,
 action text not null check (action in ('confirmed','confirmation_cancelled','completed','reopened','carry','archived','restored','legacy_completed')),
 -- Keep identities even if the login account or staff master is later removed.
 actor_user_id uuid,
 actor_staff_id uuid,
 actor_name text check (char_length(actor_name) <= 80),
 occurred_at timestamptz default clock_timestamp(),
 note text not null default '' check (char_length(note) <= 300),
 workflow_revision bigint,
 confirmation_revision bigint,
 request_id uuid,
 legacy boolean not null default false,
 check ((legacy and action='legacy_completed' and actor_user_id is null and occurred_at is null)
    or (action<>'legacy_completed' and actor_user_id is not null and occurred_at is not null)),
 foreign key (entry_id, organization_id) references public.handoff_entries(id, organization_id) on delete restrict,
 unique (organization_id, request_id)
);
create index handoff_activity_entry_time on public.handoff_activity(organization_id, entry_id, occurred_at, id);
create index handoff_activity_actor_time on public.handoff_activity(organization_id, actor_user_id, occurred_at desc);
alter table public.handoff_activity enable row level security;
revoke all on public.handoff_activity from public, anon, authenticated;
grant select on public.handoff_activity to authenticated;
create policy handoff_activity_read_member on public.handoff_activity for select to authenticated
 using (private.is_org_member(organization_id));

-- Copy only facts already recorded: no inferred completion actor/time or historical name.
insert into public.handoff_activity(organization_id,entry_id,action,actor_user_id,occurred_at,confirmation_revision,legacy)
select e.organization_id,c.entry_id,'confirmed',c.user_id,c.confirmed_at,0,true
from public.handoff_confirmations c join public.handoff_entries e on e.id=c.entry_id;
-- Preserve the known pre-migration completed state even after a later reopen.
-- Unknown historical actors and times remain SQL NULL, never the migration operator/time.
insert into public.handoff_activity(organization_id,entry_id,action,actor_user_id,occurred_at,legacy)
select e.organization_id,e.id,'legacy_completed',null,null,true
from public.handoff_entries e where e.resolved;

-- Old cached clients must reload; workflow and confirmation writes use atomic RPCs.
revoke update,delete on public.handoff_entries from authenticated;
revoke update (carry_over,resolved) on public.handoff_entries from authenticated;
revoke insert,update,delete on public.handoff_confirmations from authenticated;

create function private.handoff_initialize_entry()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.created_by is distinct from auth.uid() or not private.is_org_member(new.organization_id) then
  raise exception 'organization_membership_required';
 end if;
 if not exists(select 1 from public.organizations o where o.id=new.organization_id and o.is_active) then raise exception 'organization_inactive'; end if;
 new.workflow_revision:=0;new.archived:=false;new.resolved:=false;
 new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
 if new.due_date is not null then new.carry_over:=true; end if;
 return new;
end $$;
revoke all on function private.handoff_initialize_entry() from public,anon,authenticated;
create trigger handoff_initialize_entry before insert on public.handoff_entries
for each row execute function private.handoff_initialize_entry();

create function private.handoff_set_confirmation(
 p_org uuid,p_entry uuid,p_confirmed boolean,p_expected_revision bigint,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid();v_name text;v_staff uuid;v_entry public.handoff_entries%rowtype;
 v_row public.handoff_confirmations%rowtype;v_event public.handoff_activity%rowtype;
 v_revision bigint;v_is_confirmed boolean;v_action text;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 select m.staff_name,s.id into v_name,v_staff from public.organization_members m
 left join public.organization_staff s on s.organization_id=m.organization_id and s.linked_user_id=m.user_id
 where m.organization_id=p_org and m.user_id=v_uid;
 if not found then raise exception 'organization_membership_required'; end if;
 if not exists(select 1 from public.organizations o where o.id=p_org and o.is_active) then raise exception 'organization_inactive'; end if;
 if p_request_id is null or p_confirmed is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_request'; end if;
 select e.* into v_entry from public.handoff_entries e where e.id=p_entry and e.organization_id=p_org for update;
 if not found then raise exception 'entry_not_found'; end if;
 v_action:=case when p_confirmed then 'confirmed' else 'confirmation_cancelled' end;
 select a.* into v_event from public.handoff_activity a where a.organization_id=p_org and a.request_id=p_request_id;
 if found then
  if v_event.entry_id<>p_entry or v_event.actor_user_id<>v_uid or v_event.action<>v_action then raise exception 'request_conflict'; end if;
  select c.* into v_row from public.handoff_confirmations c where c.entry_id=p_entry and c.user_id=v_uid;
  return jsonb_build_object('organization_id',p_org,'entry_id',p_entry,'user_id',v_uid,'confirmation',to_jsonb(v_row),'event_id',v_event.id,'already_applied',true);
 end if;
 if v_entry.archived then raise exception 'entry_archived'; end if;
 select c.* into v_row from public.handoff_confirmations c where c.entry_id=p_entry and c.user_id=v_uid for update;
 v_revision:=coalesce(v_row.confirmation_revision,0);
 v_is_confirmed:=v_row.entry_id is not null and v_row.revoked_at is null;
 if v_revision<>p_expected_revision then raise exception 'confirmation_conflict'; end if;
 if v_is_confirmed=p_confirmed then
  return jsonb_build_object('organization_id',p_org,'entry_id',p_entry,'user_id',v_uid,'confirmation',to_jsonb(v_row),'event_id',null,'already_applied',true);
 end if;
 if p_confirmed then
  insert into public.handoff_confirmations(entry_id,user_id,confirmed_at,revoked_at,confirmation_revision,staff_id,staff_name)
  values(p_entry,v_uid,clock_timestamp(),null,v_revision+1,v_staff,v_name)
  on conflict(entry_id,user_id) do update set confirmed_at=excluded.confirmed_at,revoked_at=null,
   confirmation_revision=excluded.confirmation_revision,staff_id=excluded.staff_id,staff_name=excluded.staff_name
  returning * into v_row;
 else
  update public.handoff_confirmations c set revoked_at=clock_timestamp(),confirmation_revision=v_revision+1
  where c.entry_id=p_entry and c.user_id=v_uid returning * into v_row;
 end if;
 insert into public.handoff_activity(organization_id,entry_id,action,actor_user_id,actor_staff_id,actor_name,confirmation_revision,request_id)
 values(p_org,p_entry,v_action,v_uid,v_staff,v_name,v_revision+1,p_request_id) returning * into v_event;
 return jsonb_build_object('organization_id',p_org,'entry_id',p_entry,'user_id',v_uid,'confirmation',to_jsonb(v_row),'event_id',v_event.id,'already_applied',false);
end $$;
revoke all on function private.handoff_set_confirmation(uuid,uuid,boolean,bigint,uuid) from public,anon,authenticated;
grant execute on function private.handoff_set_confirmation(uuid,uuid,boolean,bigint,uuid) to authenticated;
create function public.handoff_set_confirmation(p_org uuid,p_entry uuid,p_confirmed boolean,p_expected_revision bigint,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.handoff_set_confirmation(p_org,p_entry,p_confirmed,p_expected_revision,p_request_id);
$$;
revoke all on function public.handoff_set_confirmation(uuid,uuid,boolean,bigint,uuid) from public,anon,authenticated;
grant execute on function public.handoff_set_confirmation(uuid,uuid,boolean,bigint,uuid) to authenticated;

create function private.handoff_transition(
 p_org uuid,p_entry uuid,p_action text,p_expected_revision bigint,p_request_id uuid,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid();v_name text;v_staff uuid;v_entry public.handoff_entries%rowtype;
 v_event public.handoff_activity%rowtype;v_note text:=btrim(coalesce(p_note,''));v_change boolean;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 select m.staff_name,s.id into v_name,v_staff from public.organization_members m
 left join public.organization_staff s on s.organization_id=m.organization_id and s.linked_user_id=m.user_id
 where m.organization_id=p_org and m.user_id=v_uid;
 if not found then raise exception 'organization_membership_required'; end if;
 if not exists(select 1 from public.organizations o where o.id=p_org and o.is_active) then raise exception 'organization_inactive'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_action is null
  or p_action not in ('completed','reopened','carry','archived','restored') or char_length(v_note)>300 then raise exception 'invalid_request'; end if;
 select e.* into v_entry from public.handoff_entries e where e.id=p_entry and e.organization_id=p_org for update;
 if not found then raise exception 'entry_not_found'; end if;
 if p_action in ('archived','restored') and v_entry.created_by<>v_uid and not private.is_org_admin(p_org) then raise exception 'author_or_admin_required'; end if;
 select a.* into v_event from public.handoff_activity a where a.organization_id=p_org and a.request_id=p_request_id;
 if found then
  if v_event.entry_id<>p_entry or v_event.actor_user_id<>v_uid or v_event.action<>p_action or v_event.note<>v_note then raise exception 'request_conflict'; end if;
  return jsonb_build_object('entry',to_jsonb(v_entry),'event_id',v_event.id,'already_applied',true);
 end if;
 if v_entry.archived and p_action<>'restored' then raise exception 'entry_archived'; end if;
 if v_entry.workflow_revision<>p_expected_revision then raise exception 'workflow_conflict'; end if;
 if p_action='carry' and v_entry.resolved then raise exception 'entry_resolved'; end if;
 v_change:=case p_action when 'completed' then not v_entry.resolved when 'reopened' then v_entry.resolved
  when 'carry' then not v_entry.carry_over when 'archived' then not v_entry.archived when 'restored' then v_entry.archived end;
 if not v_change then return jsonb_build_object('entry',to_jsonb(v_entry),'event_id',null,'already_applied',true); end if;
 update public.handoff_entries e set
  resolved=case p_action when 'completed' then true when 'reopened' then false else e.resolved end,
  carry_over=case when p_action='carry' then true else e.carry_over end,
  archived=case p_action when 'archived' then true when 'restored' then false else e.archived end,
  workflow_revision=e.workflow_revision+1
 where e.id=p_entry and e.organization_id=p_org returning * into v_entry;
 insert into public.handoff_activity(organization_id,entry_id,action,actor_user_id,actor_staff_id,actor_name,note,workflow_revision,request_id)
 values(p_org,p_entry,p_action,v_uid,v_staff,v_name,v_note,v_entry.workflow_revision,p_request_id) returning * into v_event;
 return jsonb_build_object('entry',to_jsonb(v_entry),'event_id',v_event.id,'already_applied',false);
end $$;
revoke all on function private.handoff_transition(uuid,uuid,text,bigint,uuid,text) from public,anon,authenticated;
grant execute on function private.handoff_transition(uuid,uuid,text,bigint,uuid,text) to authenticated;
create function public.handoff_transition(p_org uuid,p_entry uuid,p_action text,p_expected_revision bigint,p_request_id uuid,p_note text default '')
returns jsonb language sql security invoker set search_path='' as $$
 select private.handoff_transition(p_org,p_entry,p_action,p_expected_revision,p_request_id,p_note);
$$;
revoke all on function public.handoff_transition(uuid,uuid,text,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.handoff_transition(uuid,uuid,text,bigint,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
