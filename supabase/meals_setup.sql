-- Additive meal management. No existing resident/record/auth data is changed.
create table public.meal_profiles (
 organization_id uuid not null references public.organizations(id), client_id uuid primary key references public.clients(id),
 start_date date not null, end_date date, food_form text not null default '常食' check(length(food_form) between 1 and 80),
 rice_morning integer not null default 150 check(rice_morning between 0 and 2000),
 rice_lunch integer not null default 150 check(rice_lunch between 0 and 2000),
 rice_evening integer not null default 150 check(rice_evening between 0 and 2000),
 morning boolean not null default true, lunch boolean not null default true, evening boolean not null default true,
 weekdays integer[] not null default array[0,1,2,3,4,5,6] check(weekdays <@ array[0,1,2,3,4,5,6]),
 note text not null default '' check(length(note)<=1000), revision bigint not null default 1,
 updated_at timestamptz not null default now(), updated_by uuid,
 check(end_date is null or end_date>=start_date)
);
create index meal_profiles_org on public.meal_profiles(organization_id);
create table public.meal_prices (
 organization_id uuid not null references public.organizations(id), effective_date date not null,
 morning integer not null check(morning between 0 and 100000), lunch integer not null check(lunch between 0 and 100000), evening integer not null check(evening between 0 and 100000),
 revision bigint not null default 1,updated_at timestamptz not null default now(),updated_by uuid,
 primary key(organization_id,effective_date)
);
create table public.meal_entries (
 organization_id uuid not null references public.organizations(id),client_id uuid not null references public.clients(id),
 meal_date date not null check(meal_date between date '2000-01-01' and date '2100-12-31'),
 meal text not null check(meal in ('morning','lunch','evening')),
 status text not null default 'planned' check(status in ('planned','served','absent')),
 unit_price integer not null default 0 check(unit_price between 0 and 100000),
 food_form text not null default '',rice_grams integer not null default 0, note text not null default '' check(length(note)<=500),
 served_once boolean not null default false, revision bigint not null default 1,
 updated_at timestamptz not null default now(),updated_by uuid,updated_by_name text not null default '',
 primary key(organization_id,client_id,meal_date,meal)
);
create index meal_entries_month on public.meal_entries(organization_id,meal_date,client_id,meal);
create index meal_entries_client on public.meal_entries(client_id);
create schema meal_history;
revoke all on schema meal_history from public,anon,authenticated;
create table meal_history.changes(id bigint generated always as identity primary key,table_name text not null,changed_at timestamptz not null default now(),actor uuid,previous jsonb,next_record jsonb);
revoke all on meal_history.changes from public,anon,authenticated;
-- Private audit trigger: no direct EXECUTE grants or public API endpoint.
create function meal_history.capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 insert into meal_history.changes(table_name,actor,previous,next_record) values(TG_TABLE_NAME,auth.uid(),case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function meal_history.capture() from public,anon,authenticated;
-- Invoker validation keeps all normal table reads subject to RLS.
create function private.meal_validate() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.meal_profiles; prices public.meal_prices;
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 if TG_OP='UPDATE' then
  if new.organization_id<>old.organization_id then raise exception '施設を変更できません'; end if;
  new.revision:=old.revision+1;
 else new.revision:=1; end if;
 new.updated_at:=clock_timestamp();new.updated_by:=auth.uid();
 if TG_TABLE_NAME='meal_prices' then
  if TG_OP='UPDATE' and new.effective_date<>old.effective_date then raise exception '適用日を変更できません'; end if;
  if new.effective_date<(now() at time zone 'Asia/Tokyo')::date then raise exception '過去の単価は変更できません'; end if;
  return new;
 end if;
 if TG_OP='UPDATE' and new.client_id<>old.client_id then raise exception '利用者を変更できません'; end if;
 if not exists(select 1 from public.clients c where c.id=new.client_id and c.organization_id=new.organization_id) then raise exception '施設と利用者が一致しません'; end if;
 if TG_TABLE_NAME='meal_entries' then
  if TG_OP='UPDATE' and (new.meal_date,new.meal) is distinct from (old.meal_date,old.meal) then raise exception '食事の識別情報は変更できません'; end if;
  if new.status='served' and new.meal_date>(now() at time zone 'Asia/Tokyo')::date then raise exception '未来の食事は提供済みにできません'; end if;
  select * into p from public.meal_profiles where client_id=new.client_id and organization_id=new.organization_id;
  if p.client_id is null then raise exception '先に食事設定を登録してください'; end if;
  if TG_OP='INSERT' or not old.served_once then
   select * into prices from public.meal_prices where organization_id=new.organization_id and effective_date<=new.meal_date order by effective_date desc limit 1;
   new.unit_price:=case new.meal when 'morning' then coalesce(prices.morning,330) when 'lunch' then coalesce(prices.lunch,440) else coalesce(prices.evening,550) end;
   new.food_form:=p.food_form;
   new.rice_grams:=case new.meal when 'morning' then p.rice_morning when 'lunch' then p.rice_lunch else p.rice_evening end;
   new.served_once:=new.status='served';
  else
   new.unit_price:=old.unit_price;new.food_form:=old.food_form;new.rice_grams:=old.rice_grams;new.served_once:=true;
  end if;
  new.updated_by_name:=coalesce((select nullif(trim(m.staff_name),'') from public.organization_members m where m.organization_id=new.organization_id and m.user_id=auth.uid()),'職員名未登録');
 end if;
 return new;
end $$;
revoke all on function private.meal_validate() from public,anon,authenticated;
alter table public.meal_profiles enable row level security;
revoke all on public.meal_profiles from public,anon,authenticated;
grant select,insert,update on public.meal_profiles to authenticated;
create policy meal_read on public.meal_profiles for select to authenticated using (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active));
create policy meal_insert on public.meal_profiles for insert to authenticated with check (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active) and private.is_org_admin(organization_id));
create policy meal_update on public.meal_profiles for update to authenticated using (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active) and private.is_org_admin(organization_id)) with check (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active) and private.is_org_admin(organization_id));
create trigger meal_validate before insert or update on public.meal_profiles for each row execute function private.meal_validate();
create trigger meal_audit after insert or update on public.meal_profiles for each row execute function meal_history.capture();
alter table public.meal_prices enable row level security;
revoke all on public.meal_prices from public,anon,authenticated;
grant select,insert,update on public.meal_prices to authenticated;
create policy meal_read on public.meal_prices for select to authenticated using (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active));
create policy meal_insert on public.meal_prices for insert to authenticated with check (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active) and private.is_org_admin(organization_id));
create policy meal_update on public.meal_prices for update to authenticated using (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active) and private.is_org_admin(organization_id)) with check (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active) and private.is_org_admin(organization_id));
create trigger meal_validate before insert or update on public.meal_prices for each row execute function private.meal_validate();
create trigger meal_audit after insert or update on public.meal_prices for each row execute function meal_history.capture();
alter table public.meal_entries enable row level security;
revoke all on public.meal_entries from public,anon,authenticated;
grant select,insert,update on public.meal_entries to authenticated;
create policy meal_read on public.meal_entries for select to authenticated using (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active));
create policy meal_insert on public.meal_entries for insert to authenticated with check (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active));
create policy meal_update on public.meal_entries for update to authenticated using (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active)) with check (private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active));
create trigger meal_validate before insert or update on public.meal_entries for each row execute function private.meal_validate();
create trigger meal_audit after insert or update on public.meal_entries for each row execute function meal_history.capture();
-- Fill only missing plans. Existing served/absent/planned rows are never overwritten.
create function public.meal_fill_month(p_org uuid,p_month date,p_client uuid default null) returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if auth.uid() is null or not private.is_org_member(p_org) then raise exception 'この施設を操作する権限がありません'; end if;
 if extract(day from p_month)<>1 or p_month not between date '2000-01-01' and date '2100-12-01' then raise exception '年月を確認してください'; end if;
 insert into public.meal_entries(organization_id,client_id,meal_date,meal,status)
 select p.organization_id,p.client_id,d::date,m.meal,'planned'
 from public.meal_profiles p join public.clients c on c.id=p.client_id and c.organization_id=p.organization_id
 cross join generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day') d
 cross join (values('morning'),('lunch'),('evening')) m(meal)
 where p.organization_id=p_org and (p_client is null or p.client_id=p_client) and c.is_active
 and d::date>=p.start_date and (p.end_date is null or d::date<=p.end_date)
 and extract(dow from d)::integer=any(p.weekdays)
 and case m.meal when 'morning' then p.morning when 'lunch' then p.lunch else p.evening end
 on conflict do nothing;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.meal_fill_month(uuid,date,uuid) from public,anon;
grant execute on function public.meal_fill_month(uuid,date,uuid) to authenticated;
