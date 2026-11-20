-- Replacement for the UNAPPLIED PR #26 migration. Never apply both versions.
-- All business/auth identity comparisons run in the same repeatable-read transaction.
begin isolation level repeatable read;
set transaction isolation level repeatable read;
set local lock_timeout='5s';
set local statement_timeout='120s';
lock table public.organization_members,public.organization_facility_editors in share mode;
do $precondition$begin
 if current_setting('transaction_isolation')<>'repeatable read' then raise exception 'permission_migration_requires_repeatable_read';end if;
 if to_regclass('public.organization_permission_sets') is not null or to_regclass('public.organization_feature_permissions') is not null then
  raise exception 'permission_migration_already_present_use_one_version';
 end if;
end $precondition$;
create temporary table nexia_permission_preflight(schema_name text,table_name text,row_count bigint,row_hash text,kind text) on commit drop;
do $snapshot$
declare r record;n bigint;h text;
begin
 for r in select ns.nspname as schema_name,c.relname as table_name from pg_catalog.pg_class c join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
  where ns.nspname in('public','private','meal_history','attendance_backup','recruitment_private','sm_history','sm_private') and c.relkind in('r','p') order by ns.nspname,c.relname
 loop
  execute pg_catalog.format('select count(*),pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by pg_catalog.to_jsonb(t)::text),''[]''::jsonb)::text) from %I.%I t',r.schema_name,r.table_name) into n,h;
  insert into pg_temp.nexia_permission_preflight values(r.schema_name,r.table_name,n,h,'business');
 end loop;
 select count(*),pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(id::text order by id),'[]'::jsonb)::text) into n,h from auth.users;
 insert into pg_temp.nexia_permission_preflight values('auth','users',n,h,'auth_ids_only');
end $snapshot$;
create table public.organization_permission_sets(
 organization_id uuid not null,user_id uuid not null,revision bigint not null default 1 check(revision>0),
 managed boolean not null default false,updated_at timestamptz not null default clock_timestamp(),updated_by uuid,
 primary key(organization_id,user_id),foreign key(organization_id,user_id) references public.organization_members on delete cascade
);
create table public.organization_feature_permissions(
 organization_id uuid not null,user_id uuid not null,feature text not null,
 scope text not null check(scope in ('legacy','full')),
 primary key(organization_id,user_id,feature),foreign key(organization_id,user_id) references public.organization_permission_sets on delete cascade,
 check(feature in ('resident_info','record_management','handoff_settings','assignment_settings','meal_settings','cashbook_management','staff_info','exports')),
 check(scope='full' or feature in ('resident_info','handoff_settings','assignment_settings','meal_settings'))
);
create table private.feature_permission_history(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,target_user_id uuid not null,
 actor_user_id uuid,previous jsonb not null,next_permissions jsonb not null,revision bigint not null,
 reason text not null,occurred_at timestamptz not null default clock_timestamp()
);
alter table private.feature_permission_history enable row level security;
alter table public.organization_permission_sets enable row level security;
alter table public.organization_feature_permissions enable row level security;
revoke all on public.organization_permission_sets,public.organization_feature_permissions from public,anon,authenticated;
revoke all on private.feature_permission_history from public,anon,authenticated;
grant select on public.organization_permission_sets,public.organization_feature_permissions to authenticated;
create policy feature_sets_read on public.organization_permission_sets for select to authenticated using(private.is_org_member(organization_id) and (user_id=(select auth.uid()) or private.is_org_admin(organization_id)));
create policy feature_grants_read on public.organization_feature_permissions for select to authenticated using(private.is_org_member(organization_id) and (user_id=(select auth.uid()) or private.is_org_admin(organization_id)));
insert into public.organization_permission_sets(organization_id,user_id,updated_by)
 select e.organization_id,e.user_id,e.updated_by from public.organization_facility_editors e join public.organization_members m using(organization_id,user_id) where e.enabled and m.role='staff';
insert into public.organization_feature_permissions(organization_id,user_id,feature,scope)
 select organization_id,user_id,f,'legacy' from public.organization_permission_sets cross join unnest(array['resident_info','handoff_settings','meal_settings','assignment_settings']) f;
insert into private.feature_permission_history(organization_id,target_user_id,previous,next_permissions,revision,reason)
 select organization_id,user_id,'{}',jsonb_build_object('resident_info','legacy','handoff_settings','legacy','meal_settings','legacy','assignment_settings','legacy'),1,'migration_preserve_legacy' from public.organization_permission_sets;
-- Abort the whole transaction if migration widens or drops any enabled legacy grant.
do $$begin
 if exists(select 1 from public.organization_facility_editors e join public.organization_members m using(organization_id,user_id) where e.enabled and m.role='staff' and (select count(*) from public.organization_feature_permissions p where p.organization_id=e.organization_id and p.user_id=e.user_id and p.scope='legacy')<>4)
 or exists(select 1 from public.organization_feature_permissions where scope<>'legacy' or feature not in ('resident_info','handoff_settings','meal_settings','assignment_settings')) then raise exception 'permission_migration_mismatch';end if;
end $$;
-- A definer's current_user alone is never sufficient to identify a maintenance call.
-- This predicate does not give any grant, change a role, or disable RLS.
create function private.is_trusted_facility_maintenance() returns boolean language plpgsql stable security invoker set search_path='' as $$
declare active_role text:=coalesce(current_setting('role',true),'none');jwt_role text;
begin
 if auth.uid() is not null or current_user not in('postgres','supabase_admin','service_role') or active_role not in('none','postgres','supabase_admin','service_role') then return false;end if;
 if session_user in('postgres','supabase_admin','service_role') then return true;end if;
 if session_user='authenticator' and active_role='service_role' then
  jwt_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role');
  return coalesce(jwt_role='service_role',false);
 end if;
 return false;
end $$;
revoke all on function private.is_trusted_facility_maintenance() from public,anon;
grant execute on function private.is_trusted_facility_maintenance() to authenticated,service_role;
create function private.has_facility_permission(p_org uuid,p_feature text,p_full boolean default true) returns boolean
 language sql stable security definer set search_path='' as $$
 select p_feature in ('resident_info','record_management','handoff_settings','assignment_settings','meal_settings','cashbook_management','staff_info','exports') and exists(
 select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and o.is_active and
 (m.role='admin' or m.role='staff' and exists(select 1 from public.organization_feature_permissions p where p.organization_id=p_org and p.user_id=m.user_id and p.feature=p_feature and (not p_full or p.scope='full'))));
$$;
revoke all on function private.has_facility_permission(uuid,text,boolean) from public,anon;
grant execute on function private.has_facility_permission(uuid,text,boolean) to authenticated;
create or replace function private.can_edit_facility(p_org uuid,p_feature text) returns boolean language sql stable security definer set search_path='' as $$select private.has_facility_permission(p_org,p_feature,false)$$;
create function private.lock_facility_feature(p_org uuid,p_feature text,p_full boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.has_facility_permission(p_org,p_feature,p_full),false) then raise exception 'facility_edit_required' using errcode='42501';end if;
 perform 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and o.is_active for share of m;
 if not found then raise exception 'facility_edit_required' using errcode='42501';end if;
 if private.is_org_admin(p_org) then return;end if;
 perform 1 from public.organization_permission_sets s join public.organization_feature_permissions p using(organization_id,user_id) where s.organization_id=p_org and s.user_id=auth.uid() and p.feature=p_feature and (not p_full or p.scope='full') for share of s,p;
 if not found then raise exception 'facility_edit_required' using errcode='42501';end if;
end $$;
revoke all on function private.lock_facility_feature(uuid,text,boolean) from public,anon;
grant execute on function private.lock_facility_feature(uuid,text,boolean) to authenticated;
create or replace function private.lock_facility_editor(p_org uuid,p_feature text) returns void language plpgsql security definer set search_path='' as $$begin perform private.lock_facility_feature(p_org,p_feature,false);end $$;
create function private.permission_map(p_org uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_object_agg(feature,scope),'{}') from public.organization_feature_permissions where organization_id=p_org and user_id=p_user$$;
revoke all on function private.permission_map(uuid,uuid) from public,anon,authenticated;
-- p_changes is a PATCH: omitted features stay untouched; JSON null explicitly revokes.
create function private.set_facility_permissions(p_org uuid,p_user uuid,p_revision bigint,p_changes jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_role text;s public.organization_permission_sets;before_map jsonb;next_map jsonb;f record;v_scope text;next_revision bigint;
begin
 perform 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.role='admin' and o.is_active for share of m;
 if not found then raise exception 'admin_required' using errcode='42501';end if;
 if p_user is null or p_user=auth.uid() then raise exception 'self_permission_change_forbidden' using errcode='42501';end if;
 select role into target_role from public.organization_members where organization_id=p_org and user_id=p_user for update;
 if not found or target_role<>'staff' then raise exception 'staff_member_required';end if;
 select * into s from public.organization_permission_sets where organization_id=p_org and user_id=p_user for update;
 if p_revision is null or coalesce(s.revision,0)<>p_revision then raise exception 'permission_conflict_reload';end if;
 if jsonb_typeof(p_changes) is distinct from 'object' or octet_length(p_changes::text)>2000 then raise exception 'invalid_feature_permissions';end if;
 before_map:=private.permission_map(p_org,p_user);next_map:=before_map;
 for f in select * from jsonb_each(p_changes) loop
  if f.key not in('resident_info','record_management','handoff_settings','assignment_settings','meal_settings','cashbook_management','staff_info','exports') then raise exception 'invalid_feature_permissions';end if;
  if f.value='null'::jsonb then next_map:=next_map-f.key;
  else
   if jsonb_typeof(f.value)<>'string' then raise exception 'invalid_feature_permissions';end if;
   v_scope:=f.value#>>'{}';
   if v_scope not in('legacy','full') then raise exception 'invalid_feature_permissions';end if;
   if v_scope='legacy' and before_map->>f.key is distinct from 'legacy' then raise exception 'legacy_scope_cannot_be_created';end if;
   next_map:=next_map||jsonb_build_object(f.key,v_scope);
  end if;
 end loop;
 next_revision:=coalesce(s.revision,0)+1;
 insert into public.organization_permission_sets(organization_id,user_id,revision,managed,updated_by) values(p_org,p_user,next_revision,true,auth.uid()) on conflict(organization_id,user_id) do update set revision=excluded.revision,managed=true,updated_at=clock_timestamp(),updated_by=auth.uid();
 delete from public.organization_feature_permissions p where p.organization_id=p_org and p.user_id=p_user and p_changes ? p.feature and p_changes->p.feature='null'::jsonb;
 insert into public.organization_feature_permissions as existing(organization_id,user_id,feature,scope)
  select p_org,p_user,key,value from jsonb_each_text(p_changes) where value is not null
  on conflict(organization_id,user_id,feature) do update set scope=excluded.scope where existing.scope is distinct from excluded.scope;
 insert into public.organization_facility_editors(organization_id,user_id,enabled,updated_by) values(p_org,p_user,next_map<>'{}',auth.uid()) on conflict(organization_id,user_id) do update set enabled=excluded.enabled,updated_by=auth.uid(),updated_at=clock_timestamp();
 insert into private.feature_permission_history(organization_id,target_user_id,actor_user_id,previous,next_permissions,revision,reason) values(p_org,p_user,auth.uid(),before_map,next_map,next_revision,'administrator_feature_patch');
 return jsonb_build_object('organization_id',p_org,'user_id',p_user,'revision',next_revision,'permissions',next_map);
end $$;
create function public.set_facility_permissions(p_org uuid,p_user uuid,p_revision bigint,p_changes jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.set_facility_permissions(p_org,p_user,p_revision,p_changes)$$;
revoke all on function private.set_facility_permissions(uuid,uuid,bigint,jsonb),public.set_facility_permissions(uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function private.set_facility_permissions(uuid,uuid,bigint,jsonb),public.set_facility_permissions(uuid,uuid,bigint,jsonb) to authenticated;
-- Old clients may only manage untouched legacy bundles. A new selection requires the new UI.
create or replace function private.set_facility_editor(p_org uuid,p_user uuid,p_enabled boolean,p_expected_enabled boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare r text;s public.organization_permission_sets;b boolean;before_map jsonb;v_next jsonb;rev bigint;
begin
 perform 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.role='admin' and o.is_active for share of m;
 if not found then raise exception 'admin_required' using errcode='42501';end if;
 if p_user=auth.uid() or p_user is null or p_enabled is null or p_expected_enabled is null then raise exception 'invalid_editor_request';end if;
 select role into r from public.organization_members where organization_id=p_org and user_id=p_user for update;
 if not found or r<>'staff' then raise exception 'staff_member_required';end if;
 select * into s from public.organization_permission_sets where organization_id=p_org and user_id=p_user for update;
 if s.managed then raise exception 'permission_ui_upgrade_required';end if;
 select coalesce(bool_or(enabled),false) into b from public.organization_facility_editors where organization_id=p_org and user_id=p_user;
 if b<>p_expected_enabled then raise exception 'editor_permission_conflict';end if;
 if b=p_enabled then return b;end if;
 before_map:=private.permission_map(p_org,p_user);rev:=coalesce(s.revision,0)+1;
 v_next:=case when p_enabled then '{"resident_info":"legacy","handoff_settings":"legacy","meal_settings":"legacy","assignment_settings":"legacy"}'::jsonb else '{}'::jsonb end;
 insert into public.organization_permission_sets(organization_id,user_id,revision,updated_by) values(p_org,p_user,rev,auth.uid()) on conflict(organization_id,user_id) do update set revision=excluded.revision,updated_by=auth.uid(),updated_at=clock_timestamp();
 delete from public.organization_feature_permissions p where p.organization_id=p_org and p.user_id=p_user and not(v_next ? p.feature);
 insert into public.organization_feature_permissions as existing select p_org,p_user,key,value from jsonb_each_text(v_next) on conflict(organization_id,user_id,feature) do update set scope=excluded.scope where existing.scope is distinct from excluded.scope;
 insert into public.organization_facility_editors(organization_id,user_id,enabled,updated_by) values(p_org,p_user,p_enabled,auth.uid()) on conflict(organization_id,user_id) do update set enabled=excluded.enabled,updated_by=auth.uid(),updated_at=clock_timestamp();
 insert into private.feature_permission_history(organization_id,target_user_id,actor_user_id,previous,next_permissions,revision,reason) values(p_org,p_user,auth.uid(),before_map,v_next,rev,'legacy_rpc');
 insert into private.facility_permission_history(organization_id,target_user_id,actor_user_id,previous_enabled,enabled,reason) values(p_org,p_user,auth.uid(),b,p_enabled,'legacy_rpc');
 return p_enabled;
end $$;
create or replace function private.clear_facility_editor() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb;s public.organization_permission_sets;
begin
 if TG_OP='DELETE' or new.role is distinct from old.role then
  b:=private.permission_map(old.organization_id,old.user_id);
  select * into s from public.organization_permission_sets where organization_id=old.organization_id and user_id=old.user_id for update;
  if b<>'{}' then
   insert into private.feature_permission_history(organization_id,target_user_id,actor_user_id,previous,next_permissions,revision,reason) values(old.organization_id,old.user_id,auth.uid(),b,'{}',s.revision+1,case when TG_OP='DELETE' then 'membership_removed' else 'role_changed' end);
   delete from public.organization_feature_permissions where organization_id=old.organization_id and user_id=old.user_id;
  end if;
  update public.organization_permission_sets set revision=revision+1,managed=true,updated_at=clock_timestamp(),updated_by=auth.uid() where organization_id=old.organization_id and user_id=old.user_id;
  update public.organization_facility_editors set enabled=false,updated_at=clock_timestamp(),updated_by=auth.uid() where organization_id=old.organization_id and user_id=old.user_id;
 end if;
 if TG_OP='DELETE' then return old;end if;return new;
end $$;

-- Existing RPC contracts remain; each expansion checks exactly one full-scope feature.
CREATE OR REPLACE FUNCTION private.save_record_profile(p_org uuid, p_client uuid, p_revision bigint, p_data jsonb, p_expected_legacy jsonb, p_legacy jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.clients;x public.client_record_profiles;v_old jsonb;entry record;ch jsonb;k text;v_previous jsonb;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501';end if;
 perform private.lock_facility_feature(p_org,'resident_info',true);
 select * into c from public.clients where id=p_client and organization_id=p_org and is_active for update;
 if c.id is null then raise exception 'profile_client_not_found';end if;
 v_old:=jsonb_build_object('usual',c.usual,'trait',c.trait,'caution',c.caution,'communication',c.communication,'support_method',c.support_method);
 if p_expected_legacy is distinct from v_old then raise exception 'profile_legacy_conflict';end if;
 if jsonb_typeof(p_legacy) is distinct from 'object' or p_legacy-array['usual','trait','caution','communication','support_method']<>'{}'::jsonb or not p_legacy ?& array['usual','trait','caution','communication','support_method'] then raise exception 'invalid_legacy_profile';end if;
 foreach k in array array['usual','trait','caution','communication','support_method'] loop
  if jsonb_typeof(p_legacy->k) is distinct from 'string' or (p_legacy->k is distinct from v_old->k and length(p_legacy->>k)>10000) then raise exception 'invalid_legacy_text';end if;
 end loop;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>20000 or p_data-array['usual','communication','expression','independent','assistance','mobility','personalCare','traits','cautions','support','other']<>'{}'::jsonb then raise exception 'invalid_profile_fields';end if;
 for entry in select * from jsonb_each(p_data) loop
  if jsonb_typeof(entry.value) is distinct from 'object' or entry.value-array['choices','note']<>'{}'::jsonb or jsonb_typeof(entry.value->'choices') is distinct from 'array' or jsonb_typeof(entry.value->'note') is distinct from 'string' then raise exception 'invalid_profile_section';end if;
  if length(entry.value->>'note')>1000 or jsonb_array_length(entry.value->'choices')>8 then raise exception 'profile_section_too_long';end if;
  for ch in select value from jsonb_array_elements(entry.value->'choices') loop if jsonb_typeof(ch)<>'string' or length(ch#>>'{}')>80 then raise exception 'invalid_profile_choice';end if;end loop;
 end loop;
 select * into x from public.client_record_profiles where organization_id=p_org and client_id=p_client for update;
 if coalesce(x.revision,0) is distinct from p_revision then raise exception 'profile_revision_conflict';end if;
 v_previous:=jsonb_build_object('legacy',v_old,'profile',to_jsonb(x));
 if p_legacy is distinct from v_old then
  update public.clients set usual=p_legacy->>'usual',trait=p_legacy->>'trait',caution=p_legacy->>'caution',communication=p_legacy->>'communication',support_method=p_legacy->>'support_method' where id=p_client and organization_id=p_org;
 end if;
 insert into public.client_record_profiles(organization_id,client_id,data,updated_by) values(p_org,p_client,p_data,auth.uid())
 on conflict(organization_id,client_id) do update set data=excluded.data,revision=client_record_profiles.revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() returning * into x;
 insert into private.record_profile_history(organization_id,client_id,actor,previous,next_record) values(p_org,p_client,auth.uid(),v_previous,jsonb_build_object('legacy',p_legacy,'profile',to_jsonb(x)));
 return to_jsonb(x);
end $function$;

CREATE OR REPLACE FUNCTION private.guard_facility_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_org uuid;v_feature text;v_allowed text[];
begin
 -- Preserve trusted maintenance roles; anonymous/authenticated API callers never take this path.
 if private.is_trusted_facility_maintenance() then if TG_OP='DELETE' then return old;end if;return new;end if;
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
  if private.has_facility_permission(v_org,'resident_info',true) then v_allowed:=v_allowed||array['usual','trait','caution','communication','support_method'];end if;
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
end $function$;

CREATE OR REPLACE FUNCTION private.save_meal_extra_price(p_org uuid, p_expected uuid, p_date date, p_enabled boolean, p_free integer, p_bands jsonb, p_rice integer, p_soup integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare latest uuid;result uuid;
begin
 perform private.lock_facility_feature(p_org,'meal_settings',true);
 perform private.meal_extra_access(p_org,false);
 select id into latest from public.meal_extra_prices where organization_id=p_org order by created_at desc,id desc limit 1;
 if latest is distinct from p_expected then raise exception 'price_conflict_reload';end if;
 if p_date is null or p_date<(now() at time zone 'Asia/Tokyo')::date or p_date>date '2100-12-31' or p_enabled is null or p_rice is null or p_soup is null then raise exception 'invalid_effective_date_or_price';end if;
 perform private.validate_meal_extra_price(p_free,p_bands,p_enabled);
 insert into public.meal_extra_prices(organization_id,effective_date,enabled,free_limit,bands,rice_refill_price,soup_refill_price,created_by)
 values(p_org,p_date,p_enabled,p_free,p_bands,p_rice,p_soup,auth.uid()) returning id into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.handoff_transition(p_org uuid, p_entry uuid, p_action text, p_expected_revision bigint, p_request_id uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if p_action in ('archived','restored') and v_entry.created_by<>v_uid and not private.is_org_admin(p_org) then perform private.lock_facility_feature(p_org,'handoff_settings',true);end if;
 if p_action in ('archived','restored') and v_entry.created_by<>v_uid and not private.has_facility_permission(p_org,'handoff_settings',true) then raise exception 'author_or_admin_required'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION private.rename_staff_canonical(p_org uuid, p_staff uuid, p_name text, p_expected_user uuid, p_expected_name text)
 RETURNS TABLE(id uuid, organization_id uuid, linked_user_id uuid, staff_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_staff public.organization_staff%rowtype; v_current text; v_name text; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform private.lock_facility_feature(p_org,'staff_info',true);
  if not exists(select 1 from public.organizations o where o.id = p_org and o.is_active) then
    raise exception 'organization_inactive';
  end if;
  v_name := pg_catalog.btrim(pg_catalog.translate(coalesce(p_name,''),
    pg_catalog.chr(8203)||pg_catalog.chr(8204)||pg_catalog.chr(8205)||pg_catalog.chr(8288)||pg_catalog.chr(65279),''),
    E' \t\n\r'||pg_catalog.chr(12288));
  if not private.staff_name_registered(v_name) then raise exception 'invalid_staff_name'; end if;
  select s.* into v_staff from public.organization_staff s where s.id = p_staff and s.organization_id = p_org;
  if not found then raise exception 'staff_not_found'; end if;
  if v_staff.linked_user_id is distinct from p_expected_user then raise exception 'staff_identity_changed'; end if;
  if p_expected_user is not null then
    select m.staff_name into v_current from public.organization_members m
     where m.organization_id = p_org and m.user_id = p_expected_user for update;
    if not found then raise exception 'linked_member_missing'; end if;
  end if;
  select s.* into v_staff from public.organization_staff s
   where s.id = p_staff and s.organization_id = p_org for update;
  if not found then raise exception 'staff_not_found'; end if;
  if v_staff.linked_user_id is distinct from p_expected_user then raise exception 'staff_identity_changed'; end if;
  if p_expected_user is null then v_current := v_staff.staff_name; end if;
  if v_current is distinct from p_expected_name then raise exception 'staff_name_changed'; end if;
  if p_expected_user is null then
    update public.organization_staff s set staff_name = v_name, updated_at = pg_catalog.clock_timestamp()
     where s.id = p_staff and s.organization_id = p_org;
  else
    update public.organization_members m set staff_name = v_name
     where m.organization_id = p_org and m.user_id = p_expected_user;
  end if;
  return query select d.id, d.organization_id, d.linked_user_id, d.staff_name
    from public.organization_staff_directory d where d.id = p_staff and d.organization_id = p_org;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sync_member_staff_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_user uuid; v_name text; v_actor uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    v_org := old.organization_id; v_user := old.user_id; v_name := old.staff_name;
  else
    if new.staff_name is not distinct from old.staff_name then return new; end if;
    v_org := new.organization_id; v_user := new.user_id; v_name := new.staff_name;
  end if;
  -- NULL is possible for trusted DB maintenance; unauthenticated API writes remain denied by RLS.
  if v_actor is not null and v_actor <> v_user and not private.has_facility_permission(v_org,'staff_info',true) then
    raise exception 'admin_required';
  end if;
  if private.staff_name_registered(v_name) then
    update public.organization_staff s
       set staff_name = v_name, updated_at = pg_catalog.clock_timestamp()
     where s.organization_id = v_org and s.linked_user_id = v_user
       and s.staff_name is distinct from v_name;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.canonicalize_linked_staff_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_name text; v_actor uuid := auth.uid();
begin
  if new.linked_user_id is not null then
    select m.staff_name into v_name from public.organization_members m
     where m.organization_id = new.organization_id and m.user_id = new.linked_user_id;
    if not found then raise exception 'linked_member_missing'; end if;
    -- Keep existing facility-admin INSERT/link/relink operations. The staff_info
    -- delegation only edits display fields of an unchanged identity. RLS still
    -- checks the source and destination facilities for every direct write.
    if v_actor is not null and v_actor <> new.linked_user_id
       and not private.is_org_admin(new.organization_id) then
      if tg_op <> 'UPDATE' then raise exception 'admin_required'; end if;
      if new.linked_user_id is distinct from old.linked_user_id
         or new.organization_id is distinct from old.organization_id
         or not private.has_facility_permission(new.organization_id,'staff_info',true) then
        raise exception 'admin_required';
      end if;
    end if;
    if tg_op = 'UPDATE' and old.linked_user_id is not distinct from new.linked_user_id
       and new.staff_name is distinct from old.staff_name and new.staff_name is distinct from v_name then
      raise exception 'use_canonical_staff_name_update';
    end if;
    if private.staff_name_registered(v_name) then new.staff_name := v_name; end if;
  elsif tg_op = 'UPDATE' and old.linked_user_id is not null then
    select m.staff_name into v_name from public.organization_members m
     where m.organization_id = old.organization_id and m.user_id = old.linked_user_id;
    if found and private.staff_name_registered(v_name) then new.staff_name := v_name; end if;
  end if;
  return new;
end;
$function$;

-- Append-only operation history. No browser can insert, change or delete audit rows.
create table public.facility_operation_history(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,feature text not null,
 table_name text not null,record_id text not null,operation text not null,actor uuid not null,
 previous jsonb,next_record jsonb,occurred_at timestamptz not null default clock_timestamp()
);
create index facility_operation_history_facility_feature_time on public.facility_operation_history(organization_id,feature,occurred_at desc);
alter table public.facility_operation_history enable row level security;
revoke all on public.facility_operation_history from public,anon,authenticated;
grant select on public.facility_operation_history to authenticated;
create policy operation_history_read on public.facility_operation_history for select to authenticated using(private.has_facility_permission(organization_id,feature,true));
create function private.capture_facility_operation() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb;a jsonb;o uuid;f text;
begin
 if auth.uid() is null then return null;end if;
 if TG_OP<>'INSERT' then b:=to_jsonb(old);end if;if TG_OP<>'DELETE' then a:=to_jsonb(new);end if;
 o:=coalesce(a->>'organization_id',b->>'organization_id')::uuid;
 f:=case when TG_TABLE_NAME like 'cashbook_%' then 'cashbook_management' when TG_TABLE_NAME='meal_prices' then 'meal_settings' when TG_TABLE_NAME='handoff_entries' then 'handoff_settings' when TG_TABLE_NAME='clients' then 'resident_info' else 'staff_info' end;
 if TG_TABLE_NAME='organization_members' then b:=jsonb_build_object('user_id',old.user_id,'staff_name',old.staff_name);a:=jsonb_build_object('user_id',new.user_id,'staff_name',new.staff_name);end if;
 insert into public.facility_operation_history(organization_id,feature,table_name,record_id,operation,actor,previous,next_record)
 values(o,f,TG_TABLE_NAME,coalesce(a->>'id',b->>'id',a->>'user_id',b->>'user_id',a->>'client_id',b->>'client_id',a->>'effective_date',b->>'effective_date'),TG_OP,auth.uid(),b,a);
 return null;
end $$;
revoke all on function private.capture_facility_operation() from public,anon,authenticated;
create trigger feature_audit after update on public.clients for each row execute function private.capture_facility_operation();
create trigger feature_audit after insert or update or delete on public.cashbook_entries for each row execute function private.capture_facility_operation();
create trigger feature_audit after insert or update or delete on public.cashbook_choices for each row execute function private.capture_facility_operation();
create trigger feature_audit after insert or update on public.cashbook_accounts for each row execute function private.capture_facility_operation();
create trigger feature_audit after insert or update on public.meal_prices for each row execute function private.capture_facility_operation();
create trigger feature_audit after update on public.organization_staff for each row execute function private.capture_facility_operation();
create trigger feature_audit after update of staff_name on public.organization_members for each row when(old.staff_name is distinct from new.staff_name) execute function private.capture_facility_operation();
create trigger feature_audit after update of body on public.handoff_entries for each row when(old.body is distinct from new.body) execute function private.capture_facility_operation();
-- Cashbook has no finalized/closed state in the current schema. Delegates gain correction,
-- never deletion of other staff's entries or a balance reset. Existing owner/admin operations remain.
create policy feature_cashbook_update on public.cashbook_entries for update to authenticated using(private.has_facility_permission(organization_id,'cashbook_management',true)) with check(private.has_facility_permission(organization_id,'cashbook_management',true) and updated_by=(select auth.uid()) and exists(select 1 from public.clients c where c.id=client_id and c.organization_id=cashbook_entries.organization_id));
grant update(label,sort_order) on public.cashbook_choices to authenticated;
create policy feature_cashbook_choice_update on public.cashbook_choices for update to authenticated using(private.has_facility_permission(organization_id,'cashbook_management',true)) with check(private.has_facility_permission(organization_id,'cashbook_management',true));
create function private.guard_delegated_cashbook() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if private.is_trusted_facility_maintenance() then return new;end if;
 if TG_TABLE_NAME='cashbook_entries' and old.created_by=(select auth.uid()) or private.is_org_admin(old.organization_id) then return new;end if;
 perform private.lock_facility_feature(old.organization_id,'cashbook_management',true);
 if TG_TABLE_NAME='cashbook_entries' and (to_jsonb(new)-array['tx_date','kind','amount','item','store','memo','updated_by','updated_at']) is distinct from (to_jsonb(old)-array['tx_date','kind','amount','item','store','memo','updated_by','updated_at']) then raise exception 'immutable_cashbook_identity' using errcode='42501';end if;
 if TG_TABLE_NAME='cashbook_choices' and (to_jsonb(new)-array['label','sort_order']) is distinct from (to_jsonb(old)-array['label','sort_order']) then raise exception 'immutable_cashbook_master' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.guard_delegated_cashbook() from public,anon,authenticated;
create trigger feature_cash_guard before update on public.cashbook_entries for each row execute function private.guard_delegated_cashbook();
create trigger feature_cash_guard before update on public.cashbook_choices for each row execute function private.guard_delegated_cashbook();
-- Price settings remain effective-date based. No delegate receives bill finalize/reopen rights.
create policy feature_meal_price_insert on public.meal_prices for insert to authenticated with check(private.has_facility_permission(organization_id,'meal_settings',true));
create policy feature_meal_price_update on public.meal_prices for update to authenticated using(private.has_facility_permission(organization_id,'meal_settings',true)) with check(private.has_facility_permission(organization_id,'meal_settings',true));
create function private.guard_delegated_meal_price() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if private.is_trusted_facility_maintenance() then return new;end if;
 perform private.lock_facility_feature(new.organization_id,'meal_settings',true);
 if TG_OP='UPDATE' and new.organization_id<>old.organization_id then raise exception 'immutable_price_facility';end if;
 return new;
end $$;
revoke all on function private.guard_delegated_meal_price() from public,anon,authenticated;
create trigger feature_price_guard before insert or update on public.meal_prices for each row execute function private.guard_delegated_meal_price();
-- Corrections retain the original saved record and each before/after version.
create table public.care_record_amendments(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,record_id uuid not null references public.care_records(id),revision bigint not null check(revision>0),
 visit_note text not null,care_note text not null,previous_visit text not null,previous_care text not null,
 reason text not null check(length(btrim(reason)) between 1 and 500),actor uuid not null,occurred_at timestamptz not null default clock_timestamp(),unique(record_id,revision)
);
create index care_record_amendments_facility_record_revision on public.care_record_amendments(organization_id,record_id,revision desc);
alter table public.care_record_amendments enable row level security;
revoke all on public.care_record_amendments from public,anon,authenticated;
grant select on public.care_record_amendments to authenticated;
create policy record_amendment_read on public.care_record_amendments for select to authenticated using(private.is_org_member(organization_id) and exists(select 1 from public.care_records r where r.id=record_id and r.organization_id=care_record_amendments.organization_id));
create function private.amend_care_record(p_org uuid,p_record uuid,p_revision bigint,p_visit text,p_care text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.care_records;x public.care_record_amendments;v public.care_record_amendments;
begin
 perform private.lock_facility_feature(p_org,'record_management',true);
 select * into r from public.care_records where id=p_record and organization_id=p_org for update;
 if not found then raise exception 'record_not_found';end if;
 select * into x from public.care_record_amendments where record_id=p_record order by revision desc limit 1;
 if p_revision is null or p_revision<>coalesce(x.revision,0) then raise exception 'record_revision_conflict';end if;
 if p_visit is null or p_care is null or length(btrim(p_visit)) not between 1 and 20000 or length(btrim(p_care)) not between 1 and 20000 or p_care not like '指示内容確認しました。前回のサービス記録確認しました。%' then raise exception 'invalid_record_correction';end if;
 insert into public.care_record_amendments(organization_id,record_id,revision,visit_note,care_note,previous_visit,previous_care,reason,actor)
 values(p_org,p_record,p_revision+1,p_visit,p_care,coalesce(x.visit_note,r.visit_note),coalesce(x.care_note,r.care_note),p_reason,auth.uid()) returning * into v;
 return to_jsonb(v);
end $$;
create function public.amend_care_record(p_org uuid,p_record uuid,p_revision bigint,p_visit text,p_care text,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.amend_care_record(p_org,p_record,p_revision,p_visit,p_care,p_reason)$$;
revoke all on function private.amend_care_record(uuid,uuid,bigint,text,text,text),public.amend_care_record(uuid,uuid,bigint,text,text,text) from public,anon;
grant execute on function private.amend_care_record(uuid,uuid,bigint,text,text,text),public.amend_care_record(uuid,uuid,bigint,text,text,text) to authenticated;
-- Scoped display-profile editing; no identity, login, email, role or membership parameters.
create function private.edit_facility_staff_profile(p_org uuid,p_staff uuid,p_expected jsonb,p_name text,p_office text,p_employment text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.organization_staff;d public.organization_staff_directory;
begin
 perform private.lock_facility_feature(p_org,'staff_info',true);
 select * into s from public.organization_staff where id=p_staff and organization_id=p_org;
 if not found then raise exception 'staff_not_found';end if;
 -- Canonical rename locks linked membership before staff row, preserving the established lock order.
 perform private.rename_staff_canonical(p_org,p_staff,p_name,(p_expected->>'linked_user_id')::uuid,p_expected->>'staff_name');
 select * into s from public.organization_staff where id=p_staff and organization_id=p_org for update;
 if p_expected->>'office_label' is distinct from s.office_label or p_expected->>'employment_type' is distinct from s.employment_type then raise exception 'staff_profile_conflict';end if;
 if p_office is null or p_employment is null or length(p_office)>120 or length(p_employment)>40 then raise exception 'invalid_staff_profile';end if;
 update public.organization_staff set office_label=p_office,employment_type=p_employment,updated_at=clock_timestamp() where id=p_staff and organization_id=p_org;
 select * into d from public.organization_staff_directory where id=p_staff and organization_id=p_org;
 return jsonb_build_object('id',d.id,'organization_id',d.organization_id,'staff_name',d.staff_name,'linked_user_id',d.linked_user_id,'office_label',d.office_label,'employment_type',d.employment_type);
end $$;
create function public.edit_facility_staff_profile(p_org uuid,p_staff uuid,p_expected jsonb,p_name text,p_office text,p_employment text) returns jsonb language sql security invoker set search_path='' as $$select private.edit_facility_staff_profile(p_org,p_staff,p_expected,p_name,p_office,p_employment)$$;
revoke all on function private.edit_facility_staff_profile(uuid,uuid,jsonb,text,text,text),public.edit_facility_staff_profile(uuid,uuid,jsonb,text,text,text) from public,anon;
grant execute on function private.edit_facility_staff_profile(uuid,uuid,jsonb,text,text,text),public.edit_facility_staff_profile(uuid,uuid,jsonb,text,text,text) to authenticated;
-- Management exports need both the export grant and source-specific full permission.
create function private.facility_management_export(p_org uuid,p_feature text,p_since date,p_until date) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.lock_facility_feature(p_org,'exports',true);
 perform private.lock_facility_feature(p_org,p_feature,true);
 if p_since is null or p_until is null or p_until<p_since or p_until-p_since>366 then raise exception 'invalid_export_period';end if;
 if p_feature='record_management' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.service_date,q.id),'[]') into result from (
   select r.id,r.client_id,r.service_date,r.service_time,r.created_by,r.created_at,coalesce(a.visit_note,r.visit_note) visit_note,coalesce(a.care_note,r.care_note) care_note,coalesce(a.revision,0) revision,a.actor modified_by,a.occurred_at modified_at
   from public.care_records r left join lateral(select * from public.care_record_amendments x where x.record_id=r.id and x.organization_id=p_org order by revision desc limit 1) a on true where r.organization_id=p_org and r.service_date between p_since and p_until order by r.service_date,r.id limit 10001) q;
 elsif p_feature='cashbook_management' then select coalesce(jsonb_agg(to_jsonb(e) order by tx_date,id),'[]') into result from (select * from public.cashbook_entries where organization_id=p_org and tx_date between p_since and p_until order by tx_date,id limit 10001) e;
 elsif p_feature='staff_info' then select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'staff_name',d.staff_name,'office_label',d.office_label,'employment_type',d.employment_type) order by d.staff_name,d.id),'[]') into result from (select * from public.organization_staff_directory where organization_id=p_org order by staff_name,id limit 10001) d;
 else raise exception 'unsupported_management_export';end if;
 if jsonb_array_length(result)>10000 then raise exception 'export_too_large_reduce_period';end if;
 return result;
end $$;
create function public.facility_management_export(p_org uuid,p_feature text,p_since date,p_until date) returns jsonb language sql security invoker set search_path='' as $$select private.facility_management_export(p_org,p_feature,p_since,p_until)$$;
revoke all on function private.facility_management_export(uuid,text,date,date),public.facility_management_export(uuid,text,date,date) from public,anon;
grant execute on function private.facility_management_export(uuid,text,date,date),public.facility_management_export(uuid,text,date,date) to authenticated;
-- One MVCC snapshot for the checkbox map and its CAS revision (never two reads).
create function private.get_facility_permission_set(p_org uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when private.is_org_admin(p_org) or p_user=auth.uid() and private.is_org_member(p_org) then
 jsonb_build_object('organization_id',p_org,'user_id',p_user,'revision',coalesce((select revision from public.organization_permission_sets where organization_id=p_org and user_id=p_user),0),'permissions',private.permission_map(p_org,p_user)) else null end;
$$;
create function public.get_facility_permission_set(p_org uuid,p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.get_facility_permission_set(p_org,p_user)$$;
revoke all on function private.get_facility_permission_set(uuid,uuid),public.get_facility_permission_set(uuid,uuid) from public,anon;
grant execute on function private.get_facility_permission_set(uuid,uuid),public.get_facility_permission_set(uuid,uuid) to authenticated;
-- Same MVCC snapshot: concurrent business work is preserved, our own writes would be detected.
do $verify_existing$
declare r record;n bigint;h text;
begin
 for r in select * from pg_temp.nexia_permission_preflight loop
  if r.kind='auth_ids_only' then
   select count(*),pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(id::text order by id),'[]'::jsonb)::text) into n,h from auth.users;
  else
   execute pg_catalog.format('select count(*),pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by pg_catalog.to_jsonb(t)::text),''[]''::jsonb)::text) from %I.%I t',r.schema_name,r.table_name) into n,h;
  end if;
  if n is distinct from r.row_count or h is distinct from r.row_hash then raise exception 'permission_migration_existing_data_mismatch:%',r.schema_name||'.'||r.table_name;end if;
 end loop;
 if exists(select 1 from public.organization_permission_sets s left join public.organization_facility_editors e using(organization_id,user_id) left join public.organization_members m using(organization_id,user_id) where not coalesce(e.enabled,false) or m.role is distinct from 'staff') then raise exception 'permission_migration_unexpected_target';end if;
 if exists(select 1 from public.organization_facility_editors e join public.organization_members m using(organization_id,user_id) where e.enabled and m.role='staff' and ((select count(*) from public.organization_feature_permissions p where p.organization_id=e.organization_id and p.user_id=e.user_id and p.scope='legacy')<>4 or not exists(select 1 from public.organization_permission_sets s where s.organization_id=e.organization_id and s.user_id=e.user_id))) then raise exception 'permission_migration_missing_legacy';end if;
 if exists(select 1 from public.organization_feature_permissions where scope<>'legacy' or feature not in('resident_info','handoff_settings','meal_settings','assignment_settings')) then raise exception 'permission_migration_unexpected_expansion';end if;
end $verify_existing$;
commit;
