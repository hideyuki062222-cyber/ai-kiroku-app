-- Additive deployment. Existing attendance in the old browser is never read or overwritten.
-- Run once with the Supabase migration API after the transactional verification suite.
create schema if not exists attendance_backup;
revoke all on schema attendance_backup from public, anon, authenticated;
create table attendance_backup.staff_before_integration as table public.organization_staff;
create table attendance_backup.members_before_integration as table public.organization_members;
create table attendance_backup.policies_before_integration as select * from pg_policies where schemaname='public';
revoke all on all tables in schema attendance_backup from public, anon, authenticated;

alter table public.organization_staff add column office_label text not null default '居宅介護 KIZUNA' check(length(office_label)<=120);
alter table public.organization_staff add column employment_type text not null default '' check(length(employment_type)<=40);
create unique index organization_staff_one_login on public.organization_staff(organization_id,linked_user_id) where linked_user_id is not null;
alter table public.organization_staff add constraint staff_login_same_org foreign key(organization_id,linked_user_id) references public.organization_members(organization_id,user_id) on delete set null (linked_user_id);
insert into public.organization_staff(organization_id,staff_name,linked_user_id,created_by)
select m.organization_id,coalesce(nullif(trim(m.staff_name),''),'氏名未設定'),m.user_id,m.user_id from public.organization_members m
where not exists(select 1 from public.organization_staff s where s.organization_id=m.organization_id and s.linked_user_id=m.user_id);

create function public.attendance_rows_valid(data jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare r jsonb; s numeric; e numeric; b numeric;
begin
 if jsonb_typeof(data)<>'array' or jsonb_array_length(data)<>31 then return false; end if;
 for r in select value from jsonb_array_elements(data) loop
  if jsonb_typeof(r)<>'object' or not (r ?& array['t','s','e','b','g','h','night']) then return false; end if;
  if jsonb_typeof(r->'t')<>'string' or jsonb_typeof(r->'g')<>'string' or jsonb_typeof(r->'h')<>'string' then return false; end if;
  if length(r->>'t')>80 or length(r->>'g')>200 or length(r->>'h')>2000 then return false; end if;
  if r->'s'<>'null'::jsonb then
   if jsonb_typeof(r->'s')<>'number' or jsonb_typeof(r->'e')<>'number' or jsonb_typeof(r->'b')<>'number' then return false; end if;
   s:=(r->>'s')::numeric;e:=(r->>'e')::numeric;b:=(r->>'b')::numeric;
   if s<0 or s>=1440 or e<=s or e>2880 or b<0 or b>e-s or s<>trunc(s) or e<>trunc(e) or b<>trunc(b) then return false; end if;
  elsif r->'e'<>'null'::jsonb then return false; end if;
  if coalesce(r->>'night','')<>'' and ((r->>'night')::numeric<0 or (r->>'night')::numeric>24) then return false; end if;
  if r ? 'yellowOther' and jsonb_typeof(r->'yellowOther')<>'boolean' then return false; end if;
  if r ? 'yellowNote' and jsonb_typeof(r->'yellowNote')<>'boolean' then return false; end if;
 end loop;return true;
 exception when others then return false;
end $$;
revoke all on function public.attendance_rows_valid(jsonb) from public,anon;
grant execute on function public.attendance_rows_valid(jsonb) to authenticated;
create table public.attendance_months(
 organization_id uuid not null references public.organizations(id),
 staff_id uuid not null,
 period date not null check(extract(day from period)=1 and period between date '2000-01-01' and date '2100-12-01'),
 rows jsonb not null check(public.attendance_rows_valid(rows)),
 memo text not null default '' check(length(memo)<=4000),
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 primary key(organization_id,staff_id,period),
 foreign key(staff_id,organization_id) references public.organization_staff(id,organization_id)
);
create index attendance_months_period on public.attendance_months(organization_id,period);
alter table public.attendance_months enable row level security;
revoke all on public.attendance_months from public,anon,authenticated;
grant select,insert,update on public.attendance_months to authenticated;
create policy attendance_read on public.attendance_months for select to authenticated using (
 exists(select 1 from public.organizations o where o.id=organization_id and o.is_active)
 and private.is_org_member(organization_id)
 and (private.is_org_admin(organization_id) or exists(select 1 from public.organization_staff s where s.id=staff_id and s.organization_id=attendance_months.organization_id and s.is_active and s.linked_user_id=(select auth.uid())))
);
create policy attendance_insert on public.attendance_months for insert to authenticated with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.is_active)
 and private.is_org_member(organization_id)
 and (private.is_org_admin(organization_id) or exists(select 1 from public.organization_staff s where s.id=staff_id and s.organization_id=attendance_months.organization_id and s.is_active and s.linked_user_id=(select auth.uid())))
);
create policy attendance_update on public.attendance_months for update to authenticated using (
 exists(select 1 from public.organizations o where o.id=organization_id and o.is_active)
 and private.is_org_member(organization_id)
 and (private.is_org_admin(organization_id) or exists(select 1 from public.organization_staff s where s.id=staff_id and s.organization_id=attendance_months.organization_id and s.is_active and s.linked_user_id=(select auth.uid())))
) with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.is_active)
 and private.is_org_member(organization_id)
 and (private.is_org_admin(organization_id) or exists(select 1 from public.organization_staff s where s.id=staff_id and s.organization_id=attendance_months.organization_id and s.is_active and s.linked_user_id=(select auth.uid())))
);
create table attendance_backup.month_revisions(id bigint generated always as identity primary key, changed_at timestamptz not null default now(),actor uuid,previous jsonb,next_record jsonb);
revoke all on attendance_backup.month_revisions from public,anon,authenticated;
-- Private trigger only: no callable public endpoint. Captures revisions for recovery.
create function attendance_backup.capture_month_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authenticated user required'; end if;
 if TG_OP='UPDATE' then
  if (new.organization_id,new.staff_id,new.period) is distinct from (old.organization_id,old.staff_id,old.period) then raise exception 'Attendance identity cannot change'; end if;
  new.revision:=old.revision+1;
 else new.revision:=1;
 end if;
 new.updated_at:=clock_timestamp();new.updated_by:=auth.uid();
 insert into attendance_backup.month_revisions(actor,previous,next_record) values(auth.uid(),case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function attendance_backup.capture_month_revision() from public,anon,authenticated;
create trigger attendance_revision before insert or update on public.attendance_months for each row execute function attendance_backup.capture_month_revision();
