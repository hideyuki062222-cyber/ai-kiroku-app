-- Relevant production baseline, synthetic data only. Load staff_names_schema.sql first.
alter table public.organization_staff add column office_label text not null default '確認事業所',add column employment_type text not null default '';
alter table public.organization_staff add constraint staff_login_same_org foreign key(organization_id,linked_user_id) references public.organization_members(organization_id,user_id) on delete set null(linked_user_id);
create unique index staff_one_login on public.organization_staff(organization_id,linked_user_id) where linked_user_id is not null;
create table public.clients(id uuid primary key,organization_id uuid references public.organizations(id),code text,display_name text,is_active boolean default true,unique(id,organization_id));
alter table public.clients enable row level security;
grant select on public.clients to authenticated;
create policy client_read on public.clients for select to authenticated using(private.is_org_member(organization_id));
create table public.handoff_entries(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 client_id uuid,service_date date not null,shift text not null check(shift in ('day','night')),
 body text not null check(char_length(body) between 1 and 500),categories text[] not null default '{}',
 is_important boolean not null default false,carry_over boolean not null default false,resolved boolean not null default false,
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 scope text not null default 'client' check(scope in ('client','general')),due_date date,due_time time,source_label text,
 foreign key(client_id,organization_id) references public.clients(id,organization_id) on delete cascade,
 check((scope='general' and client_id is null) or (scope='client' and client_id is not null))
);
create table public.handoff_confirmations(
 entry_id uuid not null references public.handoff_entries(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 confirmed_at timestamptz not null default now(),primary key(entry_id,user_id)
);
alter table public.handoff_entries enable row level security;
alter table public.handoff_confirmations enable row level security;
grant select,insert,update,delete on public.handoff_entries to authenticated;
grant select,insert,delete on public.handoff_confirmations to authenticated;
create policy entries_select on public.handoff_entries for select to authenticated using(private.is_org_member(organization_id));
create policy entries_insert on public.handoff_entries for insert to authenticated with check(auth.uid()=created_by and private.is_org_member(organization_id) and ((scope='general' and client_id is null) or (scope='client' and exists(select 1 from public.clients c where c.id=client_id and c.organization_id=handoff_entries.organization_id))));
create policy entries_update on public.handoff_entries for update to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy entries_delete on public.handoff_entries for delete to authenticated using(private.is_org_admin(organization_id) or created_by=auth.uid());
create policy confirmations_select on public.handoff_confirmations for select to authenticated using(exists(select 1 from public.handoff_entries e where e.id=entry_id and private.is_org_member(e.organization_id)));
create policy confirmations_insert on public.handoff_confirmations for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.handoff_entries e where e.id=entry_id and private.is_org_member(e.organization_id)));
create policy confirmations_delete on public.handoff_confirmations for delete to authenticated using(user_id=auth.uid() and exists(select 1 from public.handoff_entries e where e.id=entry_id and private.is_org_member(e.organization_id)));
