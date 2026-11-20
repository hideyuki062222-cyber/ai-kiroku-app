-- Resume only after separate approval. No grant or business row is rewritten.
begin;
set local lock_timeout='5s';
create or replace function private.has_facility_permission(p_org uuid,p_feature text,p_full boolean default true) returns boolean
 language sql stable security definer set search_path='' as $$
 select p_feature in ('resident_info','record_management','handoff_settings','assignment_settings','meal_settings','cashbook_management','staff_info','exports') and exists(
 select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and o.is_active and
 (m.role='admin' or m.role='staff' and exists(select 1 from public.organization_feature_permissions p where p.organization_id=p_org and p.user_id=m.user_id and p.feature=p_feature and (not p_full or p.scope='full'))));
$$;
create or replace function private.set_facility_permissions(p_org uuid,p_user uuid,p_revision bigint,p_changes jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
commit;
