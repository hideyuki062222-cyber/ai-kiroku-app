-- Apply the first-portion surcharge when a meal is first served. No backfill.
begin;
set local lock_timeout='5s';

create or replace function private.snapshot_meal_extra() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.meal_extra_prices;amt integer;st text;
begin
 -- Existing served-once rows are historical: never infer new charges for them.
 if new.status<>'served' then return null;end if;
 if TG_OP='UPDATE' and old.served_once then return null;end if;
 select * into p from public.meal_extra_prices where organization_id=new.organization_id and effective_date<=new.meal_date order by effective_date desc,created_at desc,id desc limit 1;
 -- The stored profile portion is a billing basis, not a measured weight.
 if p.enabled then amt:=private.meal_rice_surcharge(to_jsonb(p),new.rice_grams);end if;
 st:=case
  when not coalesce(p.enabled,false) then 'disabled'
  when amt is not null then 'ready'
  else 'needs_review'
 end;
 insert into public.meal_entry_extras(organization_id,client_id,meal_date,meal,price_id,tariff,state,rice_amount,updated_by,updated_by_name)
 values(new.organization_id,new.client_id,new.meal_date,new.meal,p.id,coalesce(to_jsonb(p),'{}'),st,coalesce(amt,0),auth.uid(),new.updated_by_name) on conflict do nothing;
 return null;
end $$;

create or replace function private.save_meal_extra(p_org uuid,p_client uuid,p_date date,p_meal text,p_revision bigint,p_entry_revision bigint,p_grams integer,p_rice integer,p_soup integer,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.meal_entries;x public.meal_entry_extras;before_row jsonb;amt integer;st text;
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

commit;
