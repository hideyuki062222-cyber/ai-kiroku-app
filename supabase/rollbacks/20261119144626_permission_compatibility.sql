-- Manual containment only, requires separate approval. Never run automatically.
-- Retain all grants, amendments, business records and audit rows. Preserve per-feature
-- old-four access; NEVER restore the old enabled-flag predicate (it would broaden rights).
begin;
set local lock_timeout='5s';
create or replace function private.has_facility_permission(p_org uuid,p_feature text,p_full boolean default true) returns boolean
 language sql stable security definer set search_path='' as $$
 select p_feature in ('resident_info','record_management','handoff_settings','assignment_settings','meal_settings','cashbook_management','staff_info','exports') and exists(
 select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and o.is_active and
 (m.role='admin' or m.role='staff' and not p_full and p_feature in ('resident_info','handoff_settings','assignment_settings','meal_settings') and exists(select 1 from public.organization_feature_permissions p where p.organization_id=p_org and p.user_id=m.user_id and p.feature=p_feature)));
$$;
create or replace function private.set_facility_permissions(p_org uuid,p_user uuid,p_revision bigint,p_permissions jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin raise exception 'permission_maintenance' using errcode='42501';end $$;
create or replace function private.set_facility_editor(p_org uuid,p_user uuid,p_enabled boolean,p_expected_enabled boolean) returns boolean language plpgsql security definer set search_path='' as $$begin raise exception 'permission_maintenance' using errcode='42501';end $$;
commit;
