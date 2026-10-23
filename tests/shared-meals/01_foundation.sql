-- 既存プロジェクトへ追加。既存のテーブル・関数は変更しない。
-- 既存テーブルがあるプロジェクトへの上書きを防ぐためIF NOT EXISTSは付けない。
begin;
create schema sm_private;
revoke all on schema sm_private from public,anon;
grant usage on schema sm_private to authenticated;
create table sm_private.app_owners(user_id uuid primary key references auth.users(id));
alter table sm_private.app_owners enable row level security;
revoke all on sm_private.app_owners from public,anon,authenticated;
create table public.sm_organizations(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 120),is_active boolean not null default true,created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.sm_organization_members(organization_id uuid not null references public.sm_organizations(id),user_id uuid not null references auth.users(id),role text not null check(role in ('admin','staff')),staff_name text not null check(length(trim(staff_name)) between 1 and 80),primary key(organization_id,user_id));
create index sm_members_user on public.sm_organization_members(user_id,organization_id);
create table public.sm_clients(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.sm_organizations(id),code text not null check(length(code) between 1 and 80),room_number text not null check(length(trim(room_number)) between 1 and 40),display_name text not null check(length(trim(display_name)) between 1 and 80),sort_order integer not null default 0,is_active boolean not null default true,unique(organization_id,code));
create unique index sm_clients_active_room on public.sm_clients(organization_id,room_number) where is_active;
create function sm_private.is_app_owner() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from sm_private.app_owners where user_id=auth.uid())$$;
create function sm_private.is_org_member(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and (sm_private.is_app_owner() or exists(select 1 from public.sm_organization_members where organization_id=p_org and user_id=auth.uid()))$$;
create function sm_private.is_org_admin(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and (sm_private.is_app_owner() or exists(select 1 from public.sm_organization_members where organization_id=p_org and user_id=auth.uid() and role='admin'))$$;
revoke all on function sm_private.is_app_owner(),sm_private.is_org_member(uuid),sm_private.is_org_admin(uuid) from public,anon;
grant execute on function sm_private.is_app_owner(),sm_private.is_org_member(uuid),sm_private.is_org_admin(uuid) to authenticated;
alter table public.sm_organizations enable row level security;
alter table public.sm_organization_members enable row level security;
alter table public.sm_clients enable row level security;
revoke all on public.sm_organizations,public.sm_organization_members,public.sm_clients from public,anon,authenticated;
grant select on public.sm_organizations,public.sm_organization_members to authenticated;
grant select,insert,update on public.sm_clients to authenticated;
create policy org_read on public.sm_organizations for select to authenticated using(sm_private.is_org_member(id));
create policy members_read on public.sm_organization_members for select to authenticated using(sm_private.is_org_member(organization_id) and exists(select 1 from public.sm_organizations o where o.id=organization_id and o.is_active));
create policy clients_read on public.sm_clients for select to authenticated using(sm_private.is_org_member(organization_id) and exists(select 1 from public.sm_organizations o where o.id=organization_id and o.is_active));
create policy clients_insert on public.sm_clients for insert to authenticated with check(sm_private.is_org_admin(organization_id) and exists(select 1 from public.sm_organizations o where o.id=organization_id and o.is_active));
create policy clients_update on public.sm_clients for update to authenticated using(sm_private.is_org_admin(organization_id) and exists(select 1 from public.sm_organizations o where o.id=organization_id and o.is_active)) with check(sm_private.is_org_admin(organization_id) and exists(select 1 from public.sm_organizations o where o.id=organization_id and o.is_active));
create function sm_private.freeze_client_identity() returns trigger language plpgsql security invoker set search_path='' as $$begin if (new.id,new.organization_id,new.code) is distinct from (old.id,old.organization_id,old.code) then raise exception '利用者の識別情報は変更できません';end if;return new;end$$;
revoke all on function sm_private.freeze_client_identity() from public,anon,authenticated;
create trigger client_identity before update on public.sm_clients for each row execute function sm_private.freeze_client_identity();
-- Privileged helpers are sm_private. They only perform explicit, authorized membership changes.
create function sm_private.create_facility(p_name text,p_staff text) returns uuid language plpgsql security definer set search_path='' as $$declare id uuid;begin
 if auth.uid() is null or not sm_private.is_app_owner() then raise exception '会社管理者だけが施設を作成できます';end if;
 insert into public.sm_organizations(name,created_by) values(trim(p_name),auth.uid()) returning sm_organizations.id into id;
 insert into public.sm_organization_members values(id,auth.uid(),'admin',trim(p_staff));return id;
end$$;
create function sm_private.set_member(p_org uuid,p_email text,p_staff text,p_role text) returns void language plpgsql security definer set search_path='' as $$declare target uuid;begin
 if auth.uid() is null then raise exception 'ログインが必要です';end if;
 perform 1 from public.sm_organizations where id=p_org and is_active for update;
 if not found or not sm_private.is_org_admin(p_org) then raise exception '管理者権限がありません';end if;
 if p_role not in ('admin','staff') or p_role is null then raise exception '権限が不正です';end if;
 select id into target from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if target is null then raise exception '確認済みアカウントがありません。設置担当者にアカウントの作成・確認を依頼してください';end if;
 if target=auth.uid() and p_role<>'admin' then raise exception '自分の管理者権限は変更できません';end if;
 insert into public.sm_organization_members values(p_org,target,p_role,trim(p_staff)) on conflict(organization_id,user_id) do update set role=excluded.role,staff_name=excluded.staff_name;
end$$;
create function sm_private.remove_member(p_org uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'ログインが必要です';end if;
 perform 1 from public.sm_organizations where id=p_org and is_active for update;
 if not found or not sm_private.is_org_admin(p_org) then raise exception '管理者権限がありません';end if;
 if p_user=auth.uid() then raise exception '自分は解除できません';end if;
 delete from public.sm_organization_members where organization_id=p_org and user_id=p_user;
end$$;
revoke all on function sm_private.create_facility(text,text),sm_private.set_member(uuid,text,text,text),sm_private.remove_member(uuid,uuid) from public,anon;
grant execute on function sm_private.create_facility(text,text),sm_private.set_member(uuid,text,text,text),sm_private.remove_member(uuid,uuid) to authenticated;
create function public.sm_meal_can_create_facility() returns boolean language sql security invoker set search_path='' as $$select sm_private.is_app_owner()$$;
create function public.sm_meal_create_facility(p_name text,p_staff text) returns uuid language sql security invoker set search_path='' as $$select sm_private.create_facility(p_name,p_staff)$$;
create function public.sm_meal_set_member(p_org uuid,p_email text,p_staff text,p_role text) returns void language sql security invoker set search_path='' as $$select sm_private.set_member(p_org,p_email,p_staff,p_role)$$;
create function public.sm_meal_remove_member(p_org uuid,p_user uuid) returns void language sql security invoker set search_path='' as $$select sm_private.remove_member(p_org,p_user)$$;
revoke all on function public.sm_meal_can_create_facility(),public.sm_meal_create_facility(text,text),public.sm_meal_set_member(uuid,text,text,text),public.sm_meal_remove_member(uuid,uuid) from public,anon;
grant execute on function public.sm_meal_can_create_facility(),public.sm_meal_create_facility(text,text),public.sm_meal_set_member(uuid,text,text,text),public.sm_meal_remove_member(uuid,uuid) to authenticated;
commit;
