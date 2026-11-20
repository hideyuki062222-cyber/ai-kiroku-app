-- Read-only verification. Run against isolated DB now; production requires approval.
begin;
set transaction read only;
do $verify$
declare r record; f text; want boolean; prior text;
begin
 prior:=current_setting('request.jwt.claim.sub',true);
 for r in
  select m.organization_id,m.user_id,m.role,o.is_active,
         coalesce(e.enabled,false) as legacy_enabled
  from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  left join public.organization_facility_editors e using(organization_id,user_id)
 loop
  perform set_config('request.jwt.claim.sub',r.user_id::text,true);
  foreach f in array array['resident_info','record_management','handoff_settings','assignment_settings','meal_settings','cashbook_management','staff_info','exports'] loop
   want:=coalesce(r.is_active,false) and (r.role='admin' or r.role='staff' and r.legacy_enabled and f in('resident_info','handoff_settings','assignment_settings','meal_settings'));
   if private.has_facility_permission(r.organization_id,f,false) is distinct from want then raise exception 'postdeploy_legacy_permission_probe_failed';end if;
   want:=coalesce(r.is_active,false) and r.role='admin';
   if private.has_facility_permission(r.organization_id,f,true) is distinct from want then raise exception 'postdeploy_full_permission_probe_failed';end if;
  end loop;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(prior,''),true);
 if exists(select 1 from public.organization_feature_permissions where scope<>'legacy' or feature not in('resident_info','handoff_settings','assignment_settings','meal_settings')) then raise exception 'postdeploy_unexpected_grant';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname,c.relname) in (('public','organization_permission_sets'),('public','organization_feature_permissions'),('public','care_record_amendments'),('public','facility_operation_history'),('private','feature_permission_history')) and not c.relrowsecurity) then raise exception 'postdeploy_rls_not_enabled';end if;
 if has_table_privilege('authenticated','private.feature_permission_history','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon','private.feature_permission_history','SELECT,INSERT,UPDATE,DELETE') then raise exception 'postdeploy_private_audit_access_allowed';end if;
 if has_table_privilege('authenticated','public.organization_permission_sets','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.organization_feature_permissions','INSERT,UPDATE,DELETE') then raise exception 'postdeploy_direct_grant_write_allowed';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('get_facility_permission_set','set_facility_permissions','amend_care_record','edit_facility_staff_profile','facility_management_export') and has_function_privilege('anon',p.oid,'EXECUTE')) then raise exception 'postdeploy_anon_rpc_allowed';end if;
end $verify$;
select jsonb_build_object(
 'permission_probe_passed',true,
 'legacy_editors',(select count(*) from public.organization_facility_editors e join public.organization_members m using(organization_id,user_id) where e.enabled and m.role='staff'),
 'legacy_grants',(select count(*) from public.organization_feature_permissions where scope='legacy'),
 'new_or_expanded_grants',(select count(*) from public.organization_feature_permissions where scope<>'legacy' or feature not in('resident_info','handoff_settings','assignment_settings','meal_settings')),
 'new_tables_rls',(select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname,c.relname) in (('public','organization_permission_sets'),('public','organization_feature_permissions'),('public','care_record_amendments'),('public','facility_operation_history'),('private','feature_permission_history')))
) as verification;
commit;
