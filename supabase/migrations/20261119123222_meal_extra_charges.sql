-- Additive only. No rates are seeded; no existing meal row is rewritten.
begin;
set local lock_timeout='5s';
create table public.meal_extra_prices(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 effective_date date not null check(effective_date between date '2000-01-01' and date '2100-12-31'),
 enabled boolean not null, free_limit integer not null check(free_limit between 0 and 2000),
 bands jsonb not null, rice_refill_price integer not null check(rice_refill_price between 0 and 100000),
 soup_refill_price integer not null check(soup_refill_price between 0 and 100000),
 created_at timestamptz not null default clock_timestamp(), created_by uuid not null
);
create index meal_extra_prices_lookup on public.meal_extra_prices(organization_id,effective_date desc,created_at desc,id);
create table public.meal_entry_extras(
 organization_id uuid not null, client_id uuid not null, meal_date date not null, meal text not null,
 actual_rice integer check(actual_rice between 0 and 2000), rice_refills integer not null default 0 check(rice_refills between 0 and 100),
 soup_refills integer not null default 0 check(soup_refills between 0 and 100),
 price_id uuid references public.meal_extra_prices(id), tariff jsonb not null,
 state text not null check(state in ('ready','needs_review','disabled')),
 rice_amount integer not null default 0, rice_refill_amount integer not null default 0, soup_refill_amount integer not null default 0,
 revision bigint not null default 1, updated_by uuid not null, updated_by_name text not null, updated_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,client_id,meal_date,meal),
 foreign key(organization_id,client_id,meal_date,meal) references public.meal_entries(organization_id,client_id,meal_date,meal)
);
create index meal_entry_extras_month on public.meal_entry_extras(organization_id,meal_date);
create table public.meal_bill_versions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),month date not null,
 version bigint not null, is_final boolean not null, entries jsonb not null,clients jsonb not null,
 reason text not null check(length(trim(reason)) between 1 and 500),actor uuid not null,occurred_at timestamptz not null default clock_timestamp(),
 unique(organization_id,month,version),check(extract(day from month)=1)
);
create table private.meal_extra_history(
 id bigint generated always as identity primary key,organization_id uuid not null, actor uuid not null,
 occurred_at timestamptz not null default clock_timestamp(),reason text not null,previous jsonb,next_record jsonb
);
alter table private.meal_extra_history enable row level security;
revoke all on private.meal_extra_history from public,anon,authenticated;
-- Every write is through narrowly scoped RPCs or the meal-entry trigger, never direct REST updates.
do $$declare t text;begin foreach t in array array['meal_extra_prices','meal_entry_extras','meal_bill_versions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy facility_read on public.%I for select to authenticated using(private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active))',t);
end loop;end $$;
create function private.meal_extra_access(p_org uuid,p_admin boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501';end if;
 perform 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
 where m.organization_id=p_org and m.user_id=auth.uid() and o.is_active and (not p_admin or m.role='admin') for share of m;
 if not found then raise exception 'meal_permission_denied' using errcode='42501';end if;
 -- Serialize configuration, provided-state, extras and finalization for this facility.
 perform 1 from public.organizations where id=p_org for update;
end $$;
create function private.validate_meal_extra_price(p_free integer,p_bands jsonb,p_enabled boolean) returns void language plpgsql set search_path='' as $$
declare b jsonb; prev integer:=p_free;lo integer;hi integer;amt integer;
begin
 if p_free is null or p_free not between 0 and 2000 or jsonb_typeof(p_bands) is distinct from 'array' or jsonb_array_length(p_bands)>100 then raise exception 'invalid_bands';end if;
 for b in select value from jsonb_array_elements(p_bands) order by (value->>'from')::integer loop
  if jsonb_typeof(b->'from') is distinct from 'number' or jsonb_typeof(b->'amount') is distinct from 'number' or (b->>'from')!~'^\d+$' or (b->>'amount')!~'^\d+$' then raise exception 'invalid_band_value';end if;
  lo:=(b->>'from')::integer;amt:=(b->>'amount')::integer;
  if b->'to'='null'::jsonb then hi:=2000;else
   if jsonb_typeof(b->'to') is distinct from 'number' or (b->>'to')!~'^\d+$' then raise exception 'invalid_band_end';end if;hi:=(b->>'to')::integer;
  end if;
  if lo<=prev or hi<lo or hi>2000 or amt not between 0 and 100000 then raise exception 'duplicate_or_invalid_band';end if;
  if p_enabled and lo<>prev+1 then raise exception 'band_gap_%_%',prev+1,lo-1;end if;
  prev:=hi;
 end loop;
 if p_enabled and prev<>2000 then raise exception 'band_gap_%_2000',prev+1;end if;
end $$;
create function private.save_meal_extra_price(p_org uuid,p_expected uuid,p_date date,p_enabled boolean,p_free integer,p_bands jsonb,p_rice integer,p_soup integer) returns uuid language plpgsql security definer set search_path='' as $$
declare latest uuid;result uuid;
begin
 perform private.meal_extra_access(p_org,true);
 select id into latest from public.meal_extra_prices where organization_id=p_org order by created_at desc,id desc limit 1;
 if latest is distinct from p_expected then raise exception 'price_conflict_reload';end if;
 if p_date is null or p_date<(now() at time zone 'Asia/Tokyo')::date or p_date>date '2100-12-31' or p_enabled is null or p_rice is null or p_soup is null then raise exception 'invalid_effective_date_or_price';end if;
 perform private.validate_meal_extra_price(p_free,p_bands,p_enabled);
 insert into public.meal_extra_prices(organization_id,effective_date,enabled,free_limit,bands,rice_refill_price,soup_refill_price,created_by)
 values(p_org,p_date,p_enabled,p_free,p_bands,p_rice,p_soup,auth.uid()) returning id into result;
 return result;
end $$;
create function private.meal_bill_locked(p_org uuid,p_date date) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select is_final from public.meal_bill_versions where organization_id=p_org and month=date_trunc('month',p_date)::date order by version desc limit 1),false)
$$;
create function private.guard_meal_bill() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.meal_extra_access(new.organization_id,false);
 if private.meal_bill_locked(new.organization_id,new.meal_date) then raise exception 'bill_finalized_reopen_required';end if;
 if TG_OP='UPDATE' and new.status is distinct from old.status and old.served_once and old.meal_date<(now() at time zone 'Asia/Tokyo')::date and exists(select 1 from public.meal_entry_extras x where (x.organization_id,x.client_id,x.meal_date,x.meal)=(old.organization_id,old.client_id,old.meal_date,old.meal)) then
  if not private.is_org_admin(old.organization_id) or length(trim(coalesce(current_setting('nexia.meal_reason',true),'')))=0 then raise exception 'past_correction_admin_reason_required';end if;
 end if;
 return new;
end $$;
create trigger meal_extra_bill_guard before insert or update on public.meal_entries for each row execute function private.guard_meal_bill();
create function private.snapshot_meal_extra() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.meal_extra_prices;st text;
begin
 -- Existing served-once rows are historical: never infer new charges for them.
 if new.status<>'served' then return null;end if;
 if TG_OP='UPDATE' and old.served_once then return null;end if;
 select * into p from public.meal_extra_prices where organization_id=new.organization_id and effective_date<=new.meal_date order by effective_date desc,created_at desc,id desc limit 1;
 st:=case when coalesce(p.enabled,false) then 'needs_review' else 'disabled' end;
 insert into public.meal_entry_extras(organization_id,client_id,meal_date,meal,price_id,tariff,state,updated_by,updated_by_name)
 values(new.organization_id,new.client_id,new.meal_date,new.meal,p.id,coalesce(to_jsonb(p),'{}'),st,auth.uid(),new.updated_by_name) on conflict do nothing;
 return null;
end $$;
create trigger meal_extra_snapshot after insert or update on public.meal_entries for each row execute function private.snapshot_meal_extra();
create function private.save_meal_extra(p_org uuid,p_client uuid,p_date date,p_meal text,p_revision bigint,p_entry_revision bigint,p_grams integer,p_rice integer,p_soup integer,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.meal_entries;x public.meal_entry_extras;before_row jsonb;b jsonb;amt integer:=null;st text;
begin
 -- Match direct UPDATE lock order: meal row, membership, facility, then extras.
 if auth.uid() is null or not private.is_org_member(p_org) then raise exception 'meal_permission_denied' using errcode='42501';end if;
 select * into e from public.meal_entries where (organization_id,client_id,meal_date,meal)=(p_org,p_client,p_date,p_meal) for update;
 perform private.meal_extra_access(p_org,false);
 if private.meal_bill_locked(p_org,p_date) then raise exception 'bill_finalized_reopen_required';end if;
 if e.status is distinct from 'served' then raise exception 'served_meal_required';end if;
 if e.revision is distinct from p_entry_revision then raise exception 'meal_state_conflict_reload';end if;
 select * into x from public.meal_entry_extras where (organization_id,client_id,meal_date,meal)=(p_org,p_client,p_date,p_meal) for update;
 if x.organization_id is null then raise exception 'legacy_meal_no_automatic_charge';end if;
 if x.revision is distinct from p_revision then raise exception 'extra_conflict_reload';end if;
 if p_date<(now() at time zone 'Asia/Tokyo')::date and (not private.is_org_admin(p_org) or length(trim(coalesce(p_reason,'')))=0) then raise exception 'past_correction_admin_reason_required';end if;
 if p_rice is null or p_soup is null or p_rice not between 0 and 100 or p_soup not between 0 and 100 or p_grams is not null and p_grams not between 0 and 2000 or length(coalesce(p_reason,''))>500 then raise exception 'invalid_serving';end if;
 before_row:=to_jsonb(x);
 st:=case when x.tariff->>'enabled'='true' then 'needs_review' else 'disabled' end;
 if st='needs_review' and p_grams is not null then
  if p_grams<=(x.tariff->>'free_limit')::integer then amt:=0;else
   for b in select value from jsonb_array_elements(x.tariff->'bands') loop
    if p_grams>=(b->>'from')::integer and p_grams<=coalesce((b->>'to')::integer,2000) then amt:=(b->>'amount')::integer;exit;end if;
   end loop;
  end if;
  if amt is not null then st:='ready';end if;
 end if;
 update public.meal_entry_extras set actual_rice=p_grams,rice_refills=p_rice,soup_refills=p_soup,state=st,
 rice_amount=case when st='ready' then amt else 0 end,
 rice_refill_amount=case when st='ready' then p_rice*(x.tariff->>'rice_refill_price')::integer else 0 end,
 soup_refill_amount=case when st='ready' then p_soup*(x.tariff->>'soup_refill_price')::integer else 0 end,
 revision=revision+1,updated_by=auth.uid(),updated_by_name=coalesce((select staff_name from public.organization_members where organization_id=p_org and user_id=auth.uid()),'職員名未登録'),updated_at=clock_timestamp()
 where (organization_id,client_id,meal_date,meal)=(p_org,p_client,p_date,p_meal) returning * into x;
 insert into private.meal_extra_history(organization_id,actor,reason,previous,next_record) values(p_org,auth.uid(),coalesce(p_reason,''),before_row,to_jsonb(x));
 return to_jsonb(x);
end $$;
create function private.meal_bill_action(p_org uuid,p_month date,p_expected bigint,p_final boolean,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare prev public.meal_bill_versions;result uuid;es jsonb;cs jsonb;
begin
 perform private.meal_extra_access(p_org,true);
 if p_month is null or extract(day from p_month)<>1 or p_month<date '2000-01-01' or p_month>=date_trunc('month',(now() at time zone 'Asia/Tokyo')::date)::date or p_final is null or length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'closed_month_and_reason_required';end if;
 select * into prev from public.meal_bill_versions where organization_id=p_org and month=p_month order by version desc limit 1;
 if coalesce(prev.version,0) is distinct from p_expected or coalesce(prev.is_final,false)=p_final then raise exception 'bill_version_conflict';end if;
 if p_final then
  if exists(select 1 from public.meal_entries e left join public.meal_entry_extras x using(organization_id,client_id,meal_date,meal) where e.organization_id=p_org and e.meal_date>=p_month and e.meal_date<p_month+interval '1 month' and (e.status='planned' or e.status='served' and x.state='needs_review')) then raise exception 'unconfirmed_meals_remain';end if;
  if exists(select 1 from public.meal_profiles p join public.clients c on c.id=p.client_id and c.organization_id=p.organization_id cross join generate_series(p_month::timestamp,p_month+interval '1 month - 1 day',interval '1 day') d cross join (values('morning'),('lunch'),('evening')) m(meal) where p.organization_id=p_org and c.is_active and d::date>=p.start_date and (p.end_date is null or d::date<=p.end_date) and extract(dow from d)::int=any(p.weekdays) and case m.meal when 'morning' then p.morning when 'lunch' then p.lunch else p.evening end and not exists(select 1 from public.meal_entries e where (e.organization_id,e.client_id,e.meal_date,e.meal)=(p_org,p.client_id,d::date,m.meal))) then raise exception 'unregistered_meals_remain';end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('extra',to_jsonb(x)) order by e.client_id,e.meal_date,e.meal),'[]') into es from public.meal_entries e left join public.meal_entry_extras x using(organization_id,client_id,meal_date,meal) where e.organization_id=p_org and e.meal_date>=p_month and e.meal_date<p_month+interval '1 month';
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'display_name',display_name,'room_number',room_number,'is_active',is_active)),'[]') into cs from public.clients where organization_id=p_org;
 insert into public.meal_bill_versions(organization_id,month,version,is_final,entries,clients,reason,actor) values(p_org,p_month,coalesce(prev.version,0)+1,p_final,es,cs,trim(p_reason),auth.uid()) returning id into result;
 return result;
end $$;
create function private.meal_set_status(p_org uuid,p_client uuid,p_date date,p_meal text,p_revision bigint,p_status text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;
begin
 if auth.uid() is null or not private.is_org_member(p_org) then raise exception 'meal_permission_denied' using errcode='42501';end if;
 select to_jsonb(e) into before_row from public.meal_entries e where (organization_id,client_id,meal_date,meal)=(p_org,p_client,p_date,p_meal) for update;
 perform private.meal_extra_access(p_org,false);
 if length(coalesce(p_reason,''))>500 then raise exception 'invalid_reason';end if;
 perform set_config('nexia.meal_reason',coalesce(p_reason,''),true);
 update public.meal_entries set status=p_status where (organization_id,client_id,meal_date,meal,revision)=(p_org,p_client,p_date,p_meal,p_revision);
 if not found then raise exception 'meal_state_conflict_reload';end if;
 select to_jsonb(e) into after_row from public.meal_entries e where (organization_id,client_id,meal_date,meal)=(p_org,p_client,p_date,p_meal);
 insert into private.meal_extra_history(organization_id,actor,reason,previous,next_record) values(p_org,auth.uid(),coalesce(p_reason,''),before_row,after_row);
end $$;
-- Only public SECURITY INVOKER wrappers are exposed; all authorization is rechecked in private code.
create function public.save_meal_extra_price(p_org uuid,p_expected uuid,p_date date,p_enabled boolean,p_free integer,p_bands jsonb,p_rice integer,p_soup integer) returns uuid language sql security invoker set search_path='' as $$select private.save_meal_extra_price(p_org,p_expected,p_date,p_enabled,p_free,p_bands,p_rice,p_soup)$$;
create function public.save_meal_extra(p_org uuid,p_client uuid,p_date date,p_meal text,p_revision bigint,p_entry_revision bigint,p_grams integer,p_rice integer,p_soup integer,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.save_meal_extra(p_org,p_client,p_date,p_meal,p_revision,p_entry_revision,p_grams,p_rice,p_soup,p_reason)$$;
create function public.meal_bill_action(p_org uuid,p_month date,p_expected bigint,p_final boolean,p_reason text) returns uuid language sql security invoker set search_path='' as $$select private.meal_bill_action(p_org,p_month,p_expected,p_final,p_reason)$$;
create function public.meal_set_status(p_org uuid,p_client uuid,p_date date,p_meal text,p_revision bigint,p_status text,p_reason text) returns void language sql security invoker set search_path='' as $$select private.meal_set_status(p_org,p_client,p_date,p_meal,p_revision,p_status,p_reason)$$;
do $$declare r record;begin
 for r in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname in ('meal_extra_access','validate_meal_extra_price','save_meal_extra_price','meal_bill_locked','guard_meal_bill','snapshot_meal_extra','save_meal_extra','meal_bill_action','meal_set_status') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);
 if r.proname in ('save_meal_extra_price','save_meal_extra','meal_bill_action','meal_set_status') then execute format('grant execute on function %s to authenticated',r.signature);end if;
 end loop;
end $$;
commit;
