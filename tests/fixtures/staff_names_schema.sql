-- Isolated synthetic baseline: relevant existing constraints, grants and RLS.
-- Not a production migration. attendance_setup.sql is executed unchanged by the test.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
grant usage on schema public,auth,private to authenticated;
grant usage on schema public,auth to anon;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create table auth.users(id uuid primary key, email text);
create table public.organizations(id uuid primary key,name text not null,is_active boolean not null default true);
create table public.organization_members(
 organization_id uuid references public.organizations(id),user_id uuid references auth.users(id),
 role text not null check(role in ('admin','staff')),staff_name text not null default '' check(length(trim(staff_name))<=80),
 created_at timestamptz not null default now(),primary key(organization_id,user_id)
);
create table public.organization_staff(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 staff_name text not null check(length(trim(staff_name)) between 1 and 80),
 linked_user_id uuid references auth.users(id) on delete set null,
 is_active boolean not null default true,sort_order integer not null default 0,
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,organization_id)
);
create function private.is_org_member(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid());
$$;
create function private.is_org_admin(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid() and role='admin');
$$;
revoke all on function private.is_org_member(uuid),private.is_org_admin(uuid) from public;
grant execute on function private.is_org_member(uuid),private.is_org_admin(uuid) to authenticated;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_staff enable row level security;
grant select on public.organizations,public.organization_members,public.organization_staff to authenticated;
grant update(staff_name) on public.organization_members to authenticated;
grant insert,update,delete on public.organization_staff to authenticated;
create policy org_read on public.organizations for select to authenticated using(private.is_org_member(id));
create policy members_read on public.organization_members for select to authenticated using(private.is_org_member(organization_id));
create policy members_update_self on public.organization_members for update to authenticated
 using(user_id=(select auth.uid()) and private.is_org_member(organization_id))
 with check(user_id=(select auth.uid()) and private.is_org_member(organization_id));
create policy staff_read on public.organization_staff for select to authenticated using(private.is_org_member(organization_id));
create policy staff_insert on public.organization_staff for insert to authenticated
 with check(private.is_org_admin(organization_id) and created_by=(select auth.uid()));
create policy staff_update on public.organization_staff for update to authenticated
 using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
create policy staff_delete on public.organization_staff for delete to authenticated using(private.is_org_admin(organization_id));
-- Existing manage-page source, represented here without any change to its production RPC.
create function public.list_organization_staff(p_org uuid)
returns table(user_id uuid,staff_name text,role text,email text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_org_admin(p_org) then raise exception 'admin_required'; end if;
 return query select m.user_id,m.staff_name,m.role,u.email from public.organization_members m
 join auth.users u on u.id=m.user_id where m.organization_id=p_org;
end $$;
revoke all on function public.list_organization_staff(uuid) from public,anon;
grant execute on function public.list_organization_staff(uuid) to authenticated;
