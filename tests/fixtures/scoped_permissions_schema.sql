-- Current cashbook schema and canonical directory, metadata only.
create table public.cashbook_accounts(
 organization_id uuid not null,
 client_id uuid not null,
 opening_balance bigint default 0 not null,
 updated_by uuid,
 updated_at timestamp with time zone default now() not null,
 constraint cashbook_accounts_client_org_fk FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id) ON DELETE CASCADE,
 constraint cashbook_accounts_opening_balance_check CHECK ((opening_balance >= 0)),
 constraint cashbook_accounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 constraint cashbook_accounts_pkey PRIMARY KEY (organization_id, client_id),
 constraint cashbook_accounts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id));
alter table public.cashbook_accounts enable row level security;
grant select,insert,update on public.cashbook_accounts to authenticated;
create policy cashbook_accounts_insert_admin on public.cashbook_accounts for INSERT to authenticated with check(private.is_org_admin(organization_id));
create policy cashbook_accounts_select_member on public.cashbook_accounts for SELECT to authenticated using(private.is_org_member(organization_id));
create policy cashbook_accounts_update_admin on public.cashbook_accounts for UPDATE to authenticated using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
CREATE TRIGGER cashbook_account_audit_stamp BEFORE INSERT OR UPDATE ON public.cashbook_accounts FOR EACH ROW EXECUTE FUNCTION private.cashbook_account_audit_stamp();
create table public.cashbook_entries(
 id uuid default gen_random_uuid() not null,
 organization_id uuid not null,
 client_id uuid not null,
 tx_date date default CURRENT_DATE not null,
 kind text not null,
 amount bigint not null,
 item text default ''::text not null,
 store text default ''::text not null,
 memo text default ''::text not null,
 created_by uuid not null,
 updated_by uuid,
 created_at timestamp with time zone default now() not null,
 updated_at timestamp with time zone default now() not null,
 created_by_name text default ''::text not null,
 constraint cashbook_entries_amount_check CHECK ((amount > 0)),
 constraint cashbook_entries_client_org_fk FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id) ON DELETE CASCADE,
 constraint cashbook_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
 constraint cashbook_entries_created_by_name_len CHECK ((char_length(created_by_name) <= 160)),
 constraint cashbook_entries_item_len CHECK ((char_length(item) <= 120)),
 constraint cashbook_entries_kind_check CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text]))),
 constraint cashbook_entries_memo_len CHECK ((char_length(memo) <= 300)),
 constraint cashbook_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 constraint cashbook_entries_pkey PRIMARY KEY (id),
 constraint cashbook_entries_store_len CHECK ((char_length(store) <= 120)),
 constraint cashbook_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id));
alter table public.cashbook_entries enable row level security;
grant select,insert,update,delete on public.cashbook_entries to authenticated;
create policy cashbook_entries_delete_owner_or_admin on public.cashbook_entries for DELETE to authenticated using((private.is_org_member(organization_id) AND ((created_by = ( SELECT auth.uid() AS uid)) OR private.is_org_admin(organization_id))));
create policy cashbook_entries_insert_member on public.cashbook_entries for INSERT to authenticated with check((private.is_org_member(organization_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND (updated_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = cashbook_entries.client_id) AND (c.organization_id = cashbook_entries.organization_id) AND (c.is_active = true))))));
create policy cashbook_entries_select_member on public.cashbook_entries for SELECT to authenticated using(private.is_org_member(organization_id));
create policy cashbook_entries_update_owner_or_admin on public.cashbook_entries for UPDATE to authenticated using((private.is_org_member(organization_id) AND ((created_by = ( SELECT auth.uid() AS uid)) OR private.is_org_admin(organization_id)))) with check((private.is_org_member(organization_id) AND ((created_by = ( SELECT auth.uid() AS uid)) OR private.is_org_admin(organization_id)) AND (updated_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = cashbook_entries.client_id) AND (c.organization_id = cashbook_entries.organization_id))))));
CREATE TRIGGER cashbook_entry_audit_stamp BEFORE INSERT OR UPDATE ON public.cashbook_entries FOR EACH ROW EXECUTE FUNCTION private.cashbook_entry_audit_stamp();
create table public.cashbook_choices(
 id uuid default gen_random_uuid() not null,
 organization_id uuid not null,
 kind text not null,
 label text not null,
 sort_order integer default 0 not null,
 created_by uuid,
 created_at timestamp with time zone default now() not null,
 constraint cashbook_choices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
 constraint cashbook_choices_kind_check CHECK ((kind = ANY (ARRAY['item'::text, 'store'::text]))),
 constraint cashbook_choices_label_len CHECK (((char_length(TRIM(BOTH FROM label)) >= 1) AND (char_length(TRIM(BOTH FROM label)) <= 120))),
 constraint cashbook_choices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 constraint cashbook_choices_pkey PRIMARY KEY (id),
 constraint cashbook_choices_unique UNIQUE (organization_id, kind, label));
alter table public.cashbook_choices enable row level security;
grant select,insert,delete on public.cashbook_choices to authenticated;
create policy cashbook_choices_delete_admin on public.cashbook_choices for DELETE to authenticated using(private.is_org_admin(organization_id));
create policy cashbook_choices_insert_member on public.cashbook_choices for INSERT to authenticated with check((private.is_org_member(organization_id) AND (created_by = ( SELECT auth.uid() AS uid))));
create policy cashbook_choices_select_member on public.cashbook_choices for SELECT to authenticated using(private.is_org_member(organization_id));
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
-- Existing public forwarding RPC omitted from the earlier metadata fixture.
-- Match the staff-name migration so browser tests use the real API entrypoint.
create function public.rename_organization_staff(
 p_org uuid,p_staff uuid,p_name text,p_expected_user uuid,p_expected_name text
) returns table(id uuid,organization_id uuid,linked_user_id uuid,staff_name text)
language sql security invoker set search_path='' as $$
 select * from private.rename_staff_canonical(p_org,p_staff,p_name,p_expected_user,p_expected_name);
$$;
revoke all on function public.rename_organization_staff(uuid,uuid,text,uuid,text) from public,anon;
grant execute on function public.rename_organization_staff(uuid,uuid,text,uuid,text) to authenticated;
