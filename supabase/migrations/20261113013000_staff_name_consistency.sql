-- Approval required. Additive schema only: no backfill, deletion or bulk UPDATE.
-- Linked accounts use organization_members.staff_name as the single source of truth.
begin;

create view public.organization_staff_directory with (security_invoker = true) as
select s.id, s.organization_id,
       case when s.linked_user_id is null then s.staff_name else m.staff_name end as staff_name,
       s.linked_user_id, s.is_active, s.sort_order, s.created_by, s.created_at,
       s.updated_at, s.office_label, s.employment_type,
       m.user_id as name_user_id
from public.organization_staff s
left join public.organization_members m
  on m.organization_id = s.organization_id and m.user_id = s.linked_user_id;
revoke all on public.organization_staff_directory from public, anon, authenticated;
grant select on public.organization_staff_directory to authenticated;

create function private.staff_name_registered(p_name text)
returns boolean language sql immutable set search_path = '' as $$
  select p_name is not null and pg_catalog.char_length(pg_catalog.btrim(p_name)) between 1 and 80
    and pg_catalog.btrim(p_name) not in ('氏名未設定','職員名未登録','名前未登録','未登録','未設定');
$$;
revoke all on function private.staff_name_registered(text) from public, anon, authenticated;

-- Internal trigger, never an exposed RPC. RLS/RPC authorization protects the parent write.
create function private.sync_member_staff_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_user uuid; v_name text; v_actor uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    v_org := old.organization_id; v_user := old.user_id; v_name := old.staff_name;
  else
    if new.staff_name is not distinct from old.staff_name then return new; end if;
    v_org := new.organization_id; v_user := new.user_id; v_name := new.staff_name;
  end if;
  -- NULL is possible for trusted DB maintenance; unauthenticated API writes remain denied by RLS.
  if v_actor is not null and v_actor <> v_user and not private.is_org_admin(v_org) then
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
$$;
revoke all on function private.sync_member_staff_name() from public, anon, authenticated;
create trigger member_staff_name_updated after update of staff_name on public.organization_members
for each row execute function private.sync_member_staff_name();
-- Preserve the last verified name before the existing FK detaches the login.
create trigger member_staff_name_before_unlink before delete on public.organization_members
for each row execute function private.sync_member_staff_name();

create function private.canonicalize_linked_staff_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text; v_actor uuid := auth.uid();
begin
  if new.linked_user_id is not null then
    select m.staff_name into v_name from public.organization_members m
     where m.organization_id = new.organization_id and m.user_id = new.linked_user_id;
    if not found then raise exception 'linked_member_missing'; end if;
    if v_actor is not null and v_actor <> new.linked_user_id and not private.is_org_admin(new.organization_id) then
      raise exception 'admin_required';
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
$$;
revoke all on function private.canonicalize_linked_staff_name() from public, anon, authenticated;
create trigger staff_canonical_name before insert or update of staff_name, linked_user_id on public.organization_staff
for each row execute function private.canonicalize_linked_staff_name();

-- Explicit, narrow admin operation. Member lock precedes staff lock, matching self-name updates.
create function private.rename_staff_canonical(
  p_org uuid, p_staff uuid, p_name text, p_expected_user uuid, p_expected_name text
) returns table(id uuid, organization_id uuid, linked_user_id uuid, staff_name text)
language plpgsql security definer set search_path = '' as $$
declare v_staff public.organization_staff%rowtype; v_current text; v_name text; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_org is null or not private.is_org_admin(p_org) then raise exception 'admin_required'; end if;
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
$$;
revoke all on function private.rename_staff_canonical(uuid,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function private.rename_staff_canonical(uuid,uuid,text,uuid,text) to authenticated;

-- The exposed entrypoint remains SECURITY INVOKER; privileged code stays in the private schema.
create function public.rename_organization_staff(
  p_org uuid, p_staff uuid, p_name text, p_expected_user uuid, p_expected_name text
) returns table(id uuid, organization_id uuid, linked_user_id uuid, staff_name text)
language sql security invoker set search_path = '' as $$
  select * from private.rename_staff_canonical(p_org,p_staff,p_name,p_expected_user,p_expected_name);
$$;
revoke all on function public.rename_organization_staff(uuid,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.rename_organization_staff(uuid,uuid,text,uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
