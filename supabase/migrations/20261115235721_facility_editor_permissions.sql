-- Additive facility permissions. Existing admin/staff roles, policies and records remain intact.
begin;
set local lock_timeout='5s';
create table public.organization_facility_editors(
 organization_id uuid not null,user_id uuid not null,enabled boolean not null default false,
 updated_at timestamptz not null default now(),updated_by uuid,
 primary key(organization_id,user_id),
 foreign key(organization_id,user_id) references public.organization_members(organization_id,user_id) on delete cascade
);
alter table public.organization_facility_editors enable row level security;
revoke all on public.organization_facility_editors from public,anon,authenticated;
grant select on public.organization_facility_editors to authenticated;
create policy editor_permission_read on public.organization_facility_editors for select to authenticated
 using(private.is_org_member(organization_id) and (user_id=(select auth.uid()) or private.is_org_admin(organization_id)));
create table private.facility_permission_history(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,target_user_id uuid not null,
 actor_user_id uuid,previous_enabled boolean not null,enabled boolean not null,reason text not null,
 occurred_at timestamptz not null default clock_timestamp()
);
create table private.facility_edit_history(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,actor_user_id uuid,
 table_name text not null,operation text not null,record_id text not null,previous jsonb,next_record jsonb,
 occurred_at timestamptz not null default clock_timestamp()
);
revoke all on private.facility_permission_history,private.facility_edit_history from public,anon,authenticated;

create function private.can_edit_facility(p_org uuid,p_feature text) returns boolean
 language sql stable security definer set search_path='' as $$
 select p_feature in ('handoff_settings','resident_info','meal_settings','assignment_settings') and exists(
  select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
  where m.organization_id=p_org and m.user_id=auth.uid() and o.is_active
  and (m.role='admin' or m.role='staff' and exists(select 1 from public.organization_facility_editors e where e.organization_id=m.organization_id and e.user_id=m.user_id and e.enabled))
 );
$$;
revoke all on function private.can_edit_facility(uuid,text) from public,anon;
grant execute on function private.can_edit_facility(uuid,text) to authenticated;

-- Hold the permission/membership rows through each edit, so revocation cannot race a write.
create function private.lock_facility_editor(p_org uuid,p_feature text) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_feature is null or p_feature not in ('handoff_settings','resident_info','meal_settings','assignment_settings') then raise exception 'facility_edit_required' using errcode='42501'; end if;
 if exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.role='admin' and o.is_active) then
  perform 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.role='admin' and o.is_active for share of m,o;
  if found then return; end if;
 end if;
 perform 1 from public.organization_facility_editors e join public.organization_members m using(organization_id,user_id) join public.organizations o on o.id=e.organization_id
 where e.organization_id=p_org and e.user_id=auth.uid() and e.enabled and m.role='staff' and o.is_active for share of e,m,o;
 if not found then raise exception 'facility_edit_required' using errcode='42501'; end if;
end $$;
revoke all on function private.lock_facility_editor(uuid,text) from public,anon;
grant execute on function private.lock_facility_editor(uuid,text) to authenticated;

create function private.set_facility_editor(p_org uuid,p_user uuid,p_enabled boolean,p_expected_enabled boolean) returns boolean
 language plpgsql security definer set search_path='' as $$
declare v_role text;v_before boolean;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 perform 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.role='admin' and o.is_active for share of m,o;
 if not found then raise exception 'admin_required' using errcode='42501'; end if;
 if p_user=auth.uid() or p_enabled is null or p_expected_enabled is null then raise exception 'invalid_editor_request'; end if;
 select role into v_role from public.organization_members where organization_id=p_org and user_id=p_user for update;
 if not found or v_role<>'staff' then raise exception 'staff_member_required'; end if;
 insert into public.organization_facility_editors(organization_id,user_id,enabled,updated_by) values(p_org,p_user,false,auth.uid()) on conflict do nothing;
 select enabled into v_before from public.organization_facility_editors where organization_id=p_org and user_id=p_user for update;
 if v_before<>p_expected_enabled then raise exception 'editor_permission_conflict'; end if;
 if v_before is distinct from p_enabled then
  update public.organization_facility_editors set enabled=p_enabled,updated_at=clock_timestamp(),updated_by=auth.uid() where organization_id=p_org and user_id=p_user;
  insert into private.facility_permission_history(organization_id,target_user_id,actor_user_id,previous_enabled,enabled,reason) values(p_org,p_user,auth.uid(),v_before,p_enabled,'administrator');
 end if;
 return p_enabled;
end $$;
revoke all on function private.set_facility_editor(uuid,uuid,boolean,boolean) from public,anon;
grant execute on function private.set_facility_editor(uuid,uuid,boolean,boolean) to authenticated;
create function public.set_facility_editor(p_org uuid,p_user uuid,p_enabled boolean,p_expected_enabled boolean) returns boolean
 language sql security invoker set search_path='' as $$select private.set_facility_editor(p_org,p_user,p_enabled,p_expected_enabled)$$;
revoke all on function public.set_facility_editor(uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.set_facility_editor(uuid,uuid,boolean,boolean) to authenticated;

-- Do not resurrect an old editor grant when a person is promoted and later demoted/rejoins.
create function private.clear_facility_editor() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' or new.role is distinct from old.role then
  insert into private.facility_permission_history(organization_id,target_user_id,actor_user_id,previous_enabled,enabled,reason)
  select organization_id,user_id,auth.uid(),true,false,case when TG_OP='DELETE' then 'membership_removed' else 'role_changed' end from public.organization_facility_editors where organization_id=old.organization_id and user_id=old.user_id and enabled;
  update public.organization_facility_editors set enabled=false,updated_at=clock_timestamp(),updated_by=auth.uid() where organization_id=old.organization_id and user_id=old.user_id and enabled;
 end if;
 if TG_OP='DELETE' then return old; end if;return new;
end $$;
revoke all on function private.clear_facility_editor() from public,anon,authenticated;
create trigger facility_editor_role_changed after update of role on public.organization_members for each row execute function private.clear_facility_editor();
create trigger facility_editor_member_removed before delete on public.organization_members for each row execute function private.clear_facility_editor();

-- Validate columns as well as rows. Membership in two facilities never permits moving records.
create function private.guard_facility_edit() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_org uuid;v_feature text;v_allowed text[];
begin
 -- Preserve trusted maintenance roles; anonymous/authenticated API callers never take this path.
 if auth.uid() is null and current_user in ('postgres','service_role','supabase_admin') then if TG_OP='DELETE' then return old;end if;return new;end if;
 v_org:=case when TG_OP in ('UPDATE','DELETE') then old.organization_id else new.organization_id end;
 if TG_OP='UPDATE' and new.organization_id is distinct from old.organization_id and not(private.is_org_admin(old.organization_id) and private.is_org_admin(new.organization_id)) then raise exception 'immutable_facility_fields' using errcode='42501';end if;
 if TG_TABLE_NAME='client_service_slots' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||'/'||new.client_id::text,913));
 end if;
 if private.is_org_admin(v_org) then if TG_OP='DELETE' then return old;end if;return new;end if;
 v_feature:=case TG_TABLE_NAME when 'clients' then 'resident_info' when 'handoff_quick_inputs' then 'handoff_settings' when 'meal_profiles' then 'meal_settings' when 'client_service_slots' then 'assignment_settings' end;
 perform private.lock_facility_editor(v_org,v_feature);
 if TG_OP='DELETE' then
  if TG_TABLE_NAME<>'handoff_quick_inputs' then raise exception 'editor_delete_not_allowed' using errcode='42501'; end if;
  return old;
 end if;
 if TG_TABLE_NAME='clients' then
  v_allowed:=array['display_name','room_number','updated_at'];
  if not new.is_active or length(trim(new.display_name)) not between 1 and 80 or length(trim(new.room_number)) not between 1 and 40 then raise exception 'invalid_resident_edit';end if;
  if TG_OP='INSERT' and (coalesce(new.usual,'')<>'' or coalesce(new.trait,'')<>'' or coalesce(new.caution,'')<>'' or coalesce(new.communication,'')<>'' or coalesce(new.support_method,'')<>'' or new.care_intro_text is distinct from '指示内容確認しました。前回のサービス記録確認しました。') then raise exception 'resident_basic_fields_only' using errcode='42501';end if;
 elsif TG_TABLE_NAME='handoff_quick_inputs' then
  v_allowed:=array['label','category','sort_order'];
  if new.category not in ('体調','食事','服薬','入浴','排泄','睡眠','受診','物品','家族連絡','予定','コール','その他') then raise exception 'invalid_quick_category';end if;
 elsif TG_TABLE_NAME='client_service_slots' then
  v_allowed:=array['label','note','days_of_week','sort_order','is_active','service_contents','updated_at'];
  if TG_OP='INSERT' and (new.service_time>=time '24:00' or extract(second from new.service_time)<>0) then raise exception 'invalid_service_settings';end if;
  if not new.days_of_week <@ array[0,1,2,3,4,5,6]::smallint[] or length(new.label)>200 or length(new.note)>1000 then raise exception 'invalid_service_settings';end if;
 elsif TG_TABLE_NAME='meal_profiles' then
  v_allowed:=array['start_date','end_date','food_form','rice_morning','rice_lunch','rice_evening','morning','lunch','evening','weekdays','note','revision','updated_at','updated_by'];
 end if;
 if TG_OP='UPDATE' and (to_jsonb(new)-v_allowed) is distinct from (to_jsonb(old)-v_allowed) then raise exception 'immutable_facility_fields' using errcode='42501';end if;
 if TG_OP='INSERT' and TG_TABLE_NAME in ('clients','handoff_quick_inputs','client_service_slots') then new.created_at:=clock_timestamp();end if;
 return new;
end $$;
revoke all on function private.guard_facility_edit() from public,anon,authenticated;
create trigger facility_edit_guard before insert or update on public.clients for each row execute function private.guard_facility_edit();
create trigger facility_edit_guard before insert or update or delete on public.handoff_quick_inputs for each row execute function private.guard_facility_edit();
create trigger facility_edit_guard before insert or update on public.client_service_slots for each row execute function private.guard_facility_edit();
create trigger facility_edit_guard before insert or update on public.meal_profiles for each row execute function private.guard_facility_edit();

create function private.audit_facility_edit() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;v_org uuid;
begin
 v_org:=case when TG_OP='DELETE' then old.organization_id else new.organization_id end;
 if private.is_org_admin(v_org) then return null;end if;
 if TG_OP<>'INSERT' then before_row:=to_jsonb(old);end if;
 if TG_OP<>'DELETE' then after_row:=to_jsonb(new);end if;
 if TG_TABLE_NAME='clients' then
  if before_row is not null then before_row:=jsonb_build_object('id',old.id,'room_number',old.room_number,'display_name',old.display_name);end if;
  if after_row is not null then after_row:=jsonb_build_object('id',new.id,'room_number',new.room_number,'display_name',new.display_name);end if;
 end if;
 insert into private.facility_edit_history(organization_id,actor_user_id,table_name,operation,record_id,previous,next_record)
 values(v_org,auth.uid(),TG_TABLE_NAME,TG_OP,coalesce(after_row->>'id',before_row->>'id',after_row->>'client_id',before_row->>'client_id'),before_row,after_row);
 return null;
end $$;
revoke all on function private.audit_facility_edit() from public,anon,authenticated;
create trigger facility_edit_audit after insert or update on public.clients for each row execute function private.audit_facility_edit();
create trigger facility_edit_audit after insert or update or delete on public.handoff_quick_inputs for each row execute function private.audit_facility_edit();
create trigger facility_edit_audit after insert or update on public.client_service_slots for each row execute function private.audit_facility_edit();
create trigger facility_edit_audit after insert or update on public.meal_profiles for each row execute function private.audit_facility_edit();

-- Keep all old policies. These policies add exactly the four requested feature surfaces.
create policy facility_editor_insert on public.clients for insert to authenticated with check(private.can_edit_facility(organization_id,'resident_info') and is_active);
create policy facility_editor_update on public.clients for update to authenticated using(private.can_edit_facility(organization_id,'resident_info') and is_active) with check(private.can_edit_facility(organization_id,'resident_info') and is_active);
grant update(label,category,sort_order) on public.handoff_quick_inputs to authenticated;
create policy facility_editor_insert on public.handoff_quick_inputs for insert to authenticated with check(private.can_edit_facility(organization_id,'handoff_settings'));
create policy facility_editor_update on public.handoff_quick_inputs for update to authenticated using(private.can_edit_facility(organization_id,'handoff_settings')) with check(private.can_edit_facility(organization_id,'handoff_settings'));
create policy facility_editor_delete on public.handoff_quick_inputs for delete to authenticated using(private.can_edit_facility(organization_id,'handoff_settings'));
create policy facility_editor_insert on public.meal_profiles for insert to authenticated with check(private.can_edit_facility(organization_id,'meal_settings') and exists(select 1 from public.clients c where c.id=client_id and c.organization_id=meal_profiles.organization_id and c.is_active));
create policy facility_editor_update on public.meal_profiles for update to authenticated using(private.can_edit_facility(organization_id,'meal_settings')) with check(private.can_edit_facility(organization_id,'meal_settings') and exists(select 1 from public.clients c where c.id=client_id and c.organization_id=meal_profiles.organization_id and c.is_active));
create policy facility_editor_insert on public.client_service_slots for insert to authenticated with check(private.can_edit_facility(organization_id,'assignment_settings') and exists(select 1 from public.clients c where c.id=client_id and c.organization_id=client_service_slots.organization_id and c.is_active));
create policy facility_editor_update on public.client_service_slots for update to authenticated using(private.can_edit_facility(organization_id,'assignment_settings')) with check(private.can_edit_facility(organization_id,'assignment_settings') and exists(select 1 from public.clients c where c.id=client_id and c.organization_id=client_service_slots.organization_id and c.is_active));

-- The editor's time-list operation is atomic and deactivates old slots; it never deletes assignments/records.
create function public.save_facility_service_times(p_org uuid,p_client uuid,p_times time[],p_expected_times time[]) returns integer
 language plpgsql security invoker set search_path='' as $$
declare actual time[];wanted time[];n integer;
begin
 perform private.lock_facility_editor(p_org,'assignment_settings');
 if p_times is null or p_expected_times is null or array_position(p_times,null) is not null or cardinality(p_times)>1440 or exists(select 1 from unnest(p_times) t where t>=time '24:00' or extract(second from t)<>0) then raise exception 'invalid_service_times';end if;
 if not exists(select 1 from public.clients c where c.id=p_client and c.organization_id=p_org and c.is_active) then raise exception 'active_client_required';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text||'/'||p_client::text,913));
 select coalesce(array_agg(service_time order by service_time),'{}') into actual from public.client_service_slots where organization_id=p_org and client_id=p_client and is_active;
 if actual is distinct from p_expected_times then raise exception 'service_times_conflict';end if;
 select coalesce(array_agg(distinct t order by t),'{}') into wanted from unnest(p_times) t;
 update public.client_service_slots set is_active=false,updated_at=clock_timestamp() where organization_id=p_org and client_id=p_client and is_active and not(service_time=any(wanted));
 insert into public.client_service_slots(organization_id,client_id,service_time,sort_order,is_active)
 select p_org,p_client,t,(extract(hour from t)::integer*60+extract(minute from t)::integer)+case when extract(hour from t)>=17 then 0 when extract(hour from t)<4 then 1440 else 2880 end,true from unnest(wanted) t
 on conflict(organization_id,client_id,service_time) do update set is_active=true,updated_at=clock_timestamp();
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.save_facility_service_times(uuid,uuid,time[],time[]) from public,anon;
grant execute on function public.save_facility_service_times(uuid,uuid,time[],time[]) to authenticated;
commit;
