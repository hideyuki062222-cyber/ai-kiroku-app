-- Per-meal single items and dated rates. Existing servings keep their original price.
begin;
set local lock_timeout='5s';

alter table public.meal_profiles
 add column morning_kind text not null default 'regular' check(morning_kind in ('regular','miso_soup','rice_ball')),
 add column lunch_kind text not null default 'regular' check(lunch_kind in ('regular','miso_soup','rice_ball')),
 add column evening_kind text not null default 'regular' check(evening_kind in ('regular','miso_soup','rice_ball')),
 add column morning_quantity smallint not null default 1 check(morning_quantity between 1 and 100),
 add column lunch_quantity smallint not null default 1 check(lunch_quantity between 1 and 100),
 add column evening_quantity smallint not null default 1 check(evening_quantity between 1 and 100);

alter table public.meal_prices
 add column miso_soup integer check(miso_soup between 0 and 100000),
 add column rice_ball integer check(rice_ball between 0 and 100000);

alter table public.meal_entries
 add column serving_kind text check(serving_kind in ('regular','miso_soup','rice_ball')),
 add column serving_quantity smallint check(serving_quantity between 1 and 100),
 add column serving_prices jsonb not null default '{}'::jsonb,
 add constraint meal_entries_serving_pair check((serving_kind is null)=(serving_quantity is null));

-- Runs after meal_validate has resolved the ordinary meal price and before audit.
create function private.meal_validate_serving() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
 p public.meal_profiles;
 standard_price integer;
 miso_price integer;
 rice_ball_price integer;
 total bigint;
begin
 if (new.serving_kind is null)<>(new.serving_quantity is null)
    or new.serving_kind is not null and new.serving_kind not in ('regular','miso_soup','rice_ball')
    or new.serving_quantity is not null and new.serving_quantity not between 1 and 100 then
  raise exception '提供区分と数量を確認してください';
 end if;

 if TG_OP='UPDATE' and old.served_once then
  new.serving_prices:=old.serving_prices;
  if (new.serving_kind,new.serving_quantity) is not distinct from (old.serving_kind,old.serving_quantity) then
   return new;
  end if;
  if new.status<>'served' or new.serving_kind is null then
   raise exception '提供済みの食事を選んで訂正してください';
  end if;
  -- The existing past-correction rules also apply to changes of serving item.
  if new.meal_date<(now() at time zone 'Asia/Tokyo')::date
     and (not private.is_org_admin(new.organization_id) or length(trim(coalesce(current_setting('nexia.meal_reason',true),'')))=0) then
   raise exception 'past_correction_admin_reason_required';
  end if;
 else
  new.serving_prices:='{}'::jsonb;
  if new.status<>'served' then return new;end if;

  if new.serving_kind is null then
   select * into p from public.meal_profiles where client_id=new.client_id and organization_id=new.organization_id;
   new.serving_kind:=case new.meal when 'morning' then p.morning_kind when 'lunch' then p.lunch_kind else p.evening_kind end;
   new.serving_quantity:=case new.meal when 'morning' then p.morning_quantity when 'lunch' then p.lunch_quantity else p.evening_quantity end;
  end if;
 end if;

 if new.serving_kind='regular' then new.serving_quantity:=1;end if;
 if new.serving_prices='{}'::jsonb then
  standard_price:=new.unit_price;
  select (select miso_soup from public.meal_prices
          where organization_id=new.organization_id and effective_date<=new.meal_date and miso_soup is not null
          order by effective_date desc limit 1),
         (select rice_ball from public.meal_prices
          where organization_id=new.organization_id and effective_date<=new.meal_date and rice_ball is not null
          order by effective_date desc limit 1)
  into miso_price,rice_ball_price;
  new.serving_prices:=jsonb_build_object('regular',standard_price,'miso_soup',coalesce(miso_price,50),'rice_ball',coalesce(rice_ball_price,100));
 end if;

 total:=(new.serving_prices->>new.serving_kind)::bigint*new.serving_quantity;
 if total is null or total not between 0 and 100000 then raise exception '食事料金または数量を確認してください';end if;
 new.unit_price:=total;
 return new;
end $$;
revoke all on function private.meal_validate_serving() from public,anon,authenticated;
create trigger meal_validate_serving before insert or update on public.meal_entries
 for each row execute function private.meal_validate_serving();

create function private.meal_amend_serving(p_org uuid,p_client uuid,p_date date,p_meal text,p_revision bigint,p_kind text,p_quantity smallint,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare previous_row jsonb; saved_row jsonb;
begin
 if auth.uid() is null or not private.is_org_admin(p_org) then raise exception 'meal_permission_denied' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'past_correction_admin_reason_required';end if;
 select to_jsonb(e) into previous_row from public.meal_entries e
 where (organization_id,client_id,meal_date,meal,revision)=(p_org,p_client,p_date,p_meal,p_revision) and status='served' for update;
 perform private.meal_extra_access(p_org,true);
 perform set_config('nexia.meal_reason',trim(p_reason),true);
 update public.meal_entries e set serving_kind=p_kind,serving_quantity=p_quantity
 where (organization_id,client_id,meal_date,meal,revision)=(p_org,p_client,p_date,p_meal,p_revision) and status='served'
 returning to_jsonb(e) into saved_row;
 if not found then raise exception 'meal_state_conflict_reload';end if;
 insert into private.meal_extra_history(organization_id,actor,reason,previous,next_record)
 values(p_org,auth.uid(),trim(p_reason),previous_row,saved_row);
end $$;
create function public.meal_amend_serving(p_org uuid,p_client uuid,p_date date,p_meal text,p_revision bigint,p_kind text,p_quantity smallint,p_reason text)
returns void language sql security invoker set search_path='' as $$
 select private.meal_amend_serving(p_org,p_client,p_date,p_meal,p_revision,p_kind,p_quantity,p_reason)
$$;
revoke all on function private.meal_amend_serving(uuid,uuid,date,text,bigint,text,smallint,text) from public,anon,authenticated;
revoke all on function public.meal_amend_serving(uuid,uuid,date,text,bigint,text,smallint,text) from public,anon,authenticated;
grant execute on function private.meal_amend_serving(uuid,uuid,date,text,bigint,text,smallint,text) to authenticated;
grant execute on function public.meal_amend_serving(uuid,uuid,date,text,bigint,text,smallint,text) to authenticated;

CREATE OR REPLACE FUNCTION private.guard_facility_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_org uuid;v_feature text;v_allowed text[];
begin
 -- Preserve trusted maintenance roles; anonymous/authenticated API callers never take this path.
 if private.is_trusted_facility_maintenance() then if TG_OP='DELETE' then return old;end if;return new;end if;
 v_org:=case when TG_OP in ('UPDATE','DELETE') then old.organization_id else new.organization_id end;
 if TG_OP='UPDATE' and new.organization_id is distinct from old.organization_id and not(private.is_org_admin(old.organization_id) and private.is_org_admin(new.organization_id)) then raise exception 'immutable_facility_fields' using errcode='42501';end if;
 if TG_TABLE_NAME='client_service_slots' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||'/'||new.client_id::text,913));
 end if;
 if private.is_org_admin(v_org) then if TG_OP='DELETE' then return old;end if;return new;end if;
 v_feature:=case TG_TABLE_NAME when 'clients' then 'resident_info' when 'handoff_quick_inputs' then 'handoff_settings' when 'meal_profiles' then 'meal_settings' when 'client_service_slots' then 'assignment_settings' end;
 perform private.lock_facility_editor(v_org,v_feature);
 if TG_OP='DELETE' then
  if TG_TABLE_NAME<>'handoff_quick_inputs' then raise exception 'editor_delete_not_allowed' using errcode='42501'; end if;
  return old;
 end if;
 if TG_TABLE_NAME='clients' then
  v_allowed:=array['display_name','room_number','updated_at'];
  if private.has_facility_permission(v_org,'resident_info',true) then v_allowed:=v_allowed||array['usual','trait','caution','communication','support_method'];end if;
  if not new.is_active or length(trim(new.display_name)) not between 1 and 80 or length(trim(new.room_number)) not between 1 and 40 then raise exception 'invalid_resident_edit';end if;
  if TG_OP='INSERT' and (coalesce(new.usual,'')<>'' or coalesce(new.trait,'')<>'' or coalesce(new.caution,'')<>'' or coalesce(new.communication,'')<>'' or coalesce(new.support_method,'')<>'' or new.care_intro_text is distinct from '指示内容確認しました。前回のサービス記録確認しました。') then raise exception 'resident_basic_fields_only' using errcode='42501';end if;
 elsif TG_TABLE_NAME='handoff_quick_inputs' then
  v_allowed:=array['label','category','sort_order'];
  if new.category not in ('体調','食事','服薬','入浴','排泄','睡眠','受診','物品','家族連絡','予定','コール','その他') then raise exception 'invalid_quick_category';end if;
 elsif TG_TABLE_NAME='client_service_slots' then
  v_allowed:=array['label','note','days_of_week','sort_order','is_active','service_contents','updated_at'];
  if TG_OP='INSERT' and (new.service_time>=time '24:00' or extract(second from new.service_time)<>0) then raise exception 'invalid_service_settings';end if;
  if not new.days_of_week <@ array[0,1,2,3,4,5,6]::smallint[] or length(new.label)>200 or length(new.note)>1000 then raise exception 'invalid_service_settings';end if;
 elsif TG_TABLE_NAME='meal_profiles' then
  v_allowed:=array['start_date','end_date','food_form','rice_morning','rice_lunch','rice_evening','morning','lunch','evening','weekdays','note','revision','updated_at','updated_by','morning_kind','lunch_kind','evening_kind','morning_quantity','lunch_quantity','evening_quantity'];
 end if;
 if TG_OP='UPDATE' and (to_jsonb(new)-v_allowed) is distinct from (to_jsonb(old)-v_allowed) then raise exception 'immutable_facility_fields' using errcode='42501';end if;
 if TG_OP='INSERT' and TG_TABLE_NAME in ('clients','handoff_quick_inputs','client_service_slots') then new.created_at:=clock_timestamp();end if;
 return new;
end $function$;

create or replace function private.save_meal_extra(p_org uuid,p_client uuid,p_date date,p_meal text,p_revision bigint,p_entry_revision bigint,p_grams integer,p_rice integer,p_soup integer,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.meal_entries;x public.meal_entry_extras;before_row jsonb;amt integer;st text;
begin
 -- Match direct UPDATE lock order: meal row, membership, facility, then extras.
 if auth.uid() is null or not private.is_org_member(p_org) then raise exception 'meal_permission_denied' using errcode='42501';end if;
 select * into e from public.meal_entries where (organization_id,client_id,meal_date,meal)=(p_org,p_client,p_date,p_meal) for update;
 perform private.meal_extra_access(p_org,false);
 if private.meal_bill_locked(p_org,p_date) then raise exception 'bill_finalized_reopen_required';end if;
 if e.status is distinct from 'served' then raise exception 'served_meal_required';end if;
 if coalesce(e.serving_kind,'regular')<>'regular' then raise exception '通常食の提供実績でのみ追加料金を入力できます';end if;
 if e.revision is distinct from p_entry_revision then raise exception 'meal_state_conflict_reload';end if;
 select * into x from public.meal_entry_extras where (organization_id,client_id,meal_date,meal)=(p_org,p_client,p_date,p_meal) for update;
 if x.organization_id is null then raise exception 'legacy_meal_no_automatic_charge';end if;
 if x.revision is distinct from p_revision then raise exception 'extra_conflict_reload';end if;
 if p_date<(now() at time zone 'Asia/Tokyo')::date and (not private.is_org_admin(p_org) or length(trim(coalesce(p_reason,'')))=0) then raise exception 'past_correction_admin_reason_required';end if;
 if p_rice is null or p_soup is null or p_rice not between 0 and 100 or p_soup not between 0 and 100 or p_grams is not null and p_grams not between 0 and 2000 or length(coalesce(p_reason,''))>500 then raise exception 'invalid_serving';end if;
 before_row:=to_jsonb(x);
 st:=case when x.tariff->>'enabled'='true' then 'needs_review' else 'disabled' end;
 if st='needs_review' then
  amt:=private.meal_rice_surcharge(x.tariff,p_grams);
  -- Refill-only edits must keep the original automatic, unmeasured rice charge.
  if p_grams is null and x.state='ready' and x.actual_rice is null then amt:=x.rice_amount;end if;
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

create or replace function private.meal_bill_action(p_org uuid,p_month date,p_expected bigint,p_final boolean,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare prev public.meal_bill_versions;result uuid;es jsonb;cs jsonb;
begin
 perform private.meal_extra_access(p_org,true);
 if p_month is null or extract(day from p_month)<>1 or p_month<date '2000-01-01' or p_month>=date_trunc('month',(now() at time zone 'Asia/Tokyo')::date)::date or p_final is null or length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'closed_month_and_reason_required';end if;
 select * into prev from public.meal_bill_versions where organization_id=p_org and month=p_month order by version desc limit 1;
 if coalesce(prev.version,0) is distinct from p_expected or coalesce(prev.is_final,false)=p_final then raise exception 'bill_version_conflict';end if;
 if p_final then
  if exists(select 1 from public.meal_entries e left join public.meal_entry_extras x using(organization_id,client_id,meal_date,meal) where e.organization_id=p_org and e.meal_date>=p_month and e.meal_date<p_month+interval '1 month' and (e.status='planned' or e.status='served' and coalesce(e.serving_kind,'regular')='regular' and x.state='needs_review')) then raise exception 'unconfirmed_meals_remain';end if;
  if exists(select 1 from public.meal_profiles p join public.clients c on c.id=p.client_id and c.organization_id=p.organization_id cross join generate_series(p_month::timestamp,p_month+interval '1 month - 1 day',interval '1 day') d cross join (values('morning'),('lunch'),('evening')) m(meal) where p.organization_id=p_org and c.is_active and d::date>=p.start_date and (p.end_date is null or d::date<=p.end_date) and extract(dow from d)::int=any(p.weekdays) and case m.meal when 'morning' then p.morning when 'lunch' then p.lunch else p.evening end and not exists(select 1 from public.meal_entries e where (e.organization_id,e.client_id,e.meal_date,e.meal)=(p_org,p.client_id,d::date,m.meal))) then raise exception 'unregistered_meals_remain';end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('extra',to_jsonb(x)) order by e.client_id,e.meal_date,e.meal),'[]') into es from public.meal_entries e left join public.meal_entry_extras x using(organization_id,client_id,meal_date,meal) where e.organization_id=p_org and e.meal_date>=p_month and e.meal_date<p_month+interval '1 month';
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'display_name',display_name,'room_number',room_number,'is_active',is_active)),'[]') into cs from public.clients where organization_id=p_org;
 insert into public.meal_bill_versions(organization_id,month,version,is_final,entries,clients,reason,actor) values(p_org,p_month,coalesce(prev.version,0)+1,p_final,es,cs,trim(p_reason),auth.uid()) returning id into result;
 return result;
end $$;

commit;
