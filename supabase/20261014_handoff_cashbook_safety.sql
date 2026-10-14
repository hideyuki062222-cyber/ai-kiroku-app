-- System safety hardening for handoff and cashbook.
-- This file is prepared for review/testing and is not applied automatically.

begin;

-- Handoff: members may change workflow state only. The body, target client,
-- author, date, importance and other content cannot be edited directly.
revoke update on table public.handoff_entries from authenticated;
grant update (carry_over, resolved, updated_at) on table public.handoff_entries to authenticated;

-- Cashbook: audit identity must come from the authenticated session, not the browser payload.
create or replace function private.cashbook_entry_audit_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if tg_op = 'INSERT' then
    select nullif(trim(m.staff_name),'')
      into v_name
    from public.organization_members m
    where m.organization_id = new.organization_id
      and m.user_id = v_uid;

    if not found then
      raise exception 'organization_membership_required';
    end if;

    new.created_by := v_uid;
    new.updated_by := v_uid;
    new.created_by_name := coalesce(v_name,'職員名未登録');
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
  else
    -- Keep the original owner and client/organization immutable.
    new.organization_id := old.organization_id;
    new.client_id := old.client_id;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    new.updated_by := v_uid;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists cashbook_entry_audit_stamp on public.cashbook_entries;
create trigger cashbook_entry_audit_stamp
before insert or update on public.cashbook_entries
for each row execute function private.cashbook_entry_audit_stamp();

create or replace function private.cashbook_account_audit_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cashbook_account_audit_stamp on public.cashbook_accounts;
create trigger cashbook_account_audit_stamp
before insert or update on public.cashbook_accounts
for each row execute function private.cashbook_account_audit_stamp();

-- Re-state cashbook entry policies with explicit same-organization client checks.
drop policy if exists cashbook_entries_insert_member on public.cashbook_entries;
create policy cashbook_entries_insert_member
on public.cashbook_entries
for insert
to authenticated
with check (
  private.is_org_member(cashbook_entries.organization_id)
  and cashbook_entries.created_by = (select auth.uid())
  and cashbook_entries.updated_by = (select auth.uid())
  and exists (
    select 1 from public.clients c
    where c.id = cashbook_entries.client_id
      and c.organization_id = cashbook_entries.organization_id
      and c.is_active = true
  )
);

drop policy if exists cashbook_entries_update_owner_or_admin on public.cashbook_entries;
create policy cashbook_entries_update_owner_or_admin
on public.cashbook_entries
for update
to authenticated
using (
  private.is_org_member(cashbook_entries.organization_id)
  and (cashbook_entries.created_by = (select auth.uid()) or private.is_org_admin(cashbook_entries.organization_id))
)
with check (
  private.is_org_member(cashbook_entries.organization_id)
  and (cashbook_entries.created_by = (select auth.uid()) or private.is_org_admin(cashbook_entries.organization_id))
  and cashbook_entries.updated_by = (select auth.uid())
  and exists (
    select 1 from public.clients c
    where c.id = cashbook_entries.client_id
      and c.organization_id = cashbook_entries.organization_id
  )
);

-- Small performance cleanup reported by the Supabase advisor.
drop policy if exists organization_staff_insert_admin on public.organization_staff;
create policy organization_staff_insert_admin
on public.organization_staff
for insert
to authenticated
with check (
  private.is_org_admin(organization_staff.organization_id)
  and organization_staff.created_by = (select auth.uid())
);

commit;
