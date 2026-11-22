-- Only versioned RPCs; no table/data/RLS replacement or backfill.
begin;
set local lock_timeout='5s';
create function private.save_routine_care_v2(p_org uuid,p_client uuid,p_revision bigint,p_service text,p_items jsonb,p_profile_ref text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare c public.clients;x public.client_record_profiles;item jsonb;next_routine jsonb;previous_row jsonb;v_legacy jsonb;v_entry jsonb;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501';end if;
 perform private.lock_facility_feature(p_org,'resident_info',true);
 select * into c from public.clients where id=p_client and organization_id=p_org and is_active for update;
 if c.id is null then raise exception 'profile_client_not_found';end if;
 if p_service is null or p_service not in('食事介助','トイレ介助','入浴介助','入浴準備','更衣介助','服薬介助・確認','口腔ケア','起床介助','就寝介助','清容・保清','移動介助','買い物・外出支援','通院等介助','家事援助','その他') then raise exception 'invalid_routine_service';end if;
 if p_profile_ref is null or p_profile_ref not in('','support','personalCare','mobility','communication','legacy.support_method','legacy.communication') then raise exception 'invalid_routine_reference';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>80 then raise exception 'invalid_routine_items';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object' or item-array['kind','value','category']<>'{}'::jsonb or not(item ?& array['kind','value']) or jsonb_typeof(item->'kind') is distinct from 'string' or jsonb_typeof(item->'value') is distinct from 'string' then raise exception 'invalid_routine_item';end if;
  if item->>'kind' not in('action','self','method','custom','step','raw') or length(btrim(item->>'value'))=0 or length(item->>'value')>5000 then raise exception 'invalid_routine_item';end if;
  if item ? 'category' and (jsonb_typeof(item->'category') is distinct from 'string' or item->>'category' not in('prepare','work','self','related','method','communication','precaution','custom')) then raise exception 'invalid_routine_category';end if;
  if item->>'kind' in('action','self','method','custom') and not private.routine_item_allowed(p_service,item->>'kind',item->>'value') then raise exception 'invalid_routine_item';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value) from jsonb_array_elements(p_items)) then raise exception 'duplicate_routine_item';end if;
 select * into x from public.client_record_profiles where organization_id=p_org and client_id=p_client for update;
 if p_revision is null or coalesce(x.revision,0) is distinct from p_revision then raise exception 'profile_revision_conflict';end if;
 previous_row:=to_jsonb(x);
 v_entry:=jsonb_build_object('version',2,'items',p_items,'profile_ref',p_profile_ref,'updated_at',clock_timestamp(),'updated_by',auth.uid());
 next_routine:=coalesce(x.routine_care,'{}'::jsonb)||jsonb_build_object(p_service,v_entry);
 if octet_length(next_routine::text)>60000 then raise exception 'routine_settings_too_long';end if;
 -- PATCH one service only. Other profile fields, services, IDs and care records remain.
 insert into public.client_record_profiles(organization_id,client_id,routine_care,updated_by) values(p_org,p_client,next_routine,auth.uid())
 on conflict(organization_id,client_id) do update set routine_care=excluded.routine_care,revision=client_record_profiles.revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() returning * into x;
 v_legacy:=jsonb_build_object('usual',c.usual,'trait',c.trait,'caution',c.caution,'communication',c.communication,'support_method',c.support_method);
 insert into private.record_profile_history(organization_id,client_id,actor,previous,next_record) values(p_org,p_client,auth.uid(),jsonb_build_object('legacy',v_legacy,'profile',previous_row),jsonb_build_object('legacy',v_legacy,'profile',to_jsonb(x)));
 return to_jsonb(x);
end $$;
create or replace function private.save_routine_care(p_org uuid,p_client uuid,p_revision bigint,p_service text,p_items jsonb,p_profile_ref text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare c public.clients;x public.client_record_profiles;item jsonb;next_routine jsonb;previous_row jsonb;v_legacy jsonb;v_entry jsonb;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501';end if;
 perform private.lock_facility_feature(p_org,'resident_info',true);
 select * into c from public.clients where id=p_client and organization_id=p_org and is_active for update;
 if c.id is null then raise exception 'profile_client_not_found';end if;
 if p_service is null or p_service not in('食事介助','トイレ介助','入浴介助','入浴準備','更衣介助','服薬介助・確認','口腔ケア','起床介助','就寝介助','清容・保清','移動介助','買い物・外出支援','通院等介助','家事援助','その他') then raise exception 'invalid_routine_service';end if;
 if p_profile_ref is null or p_profile_ref not in('','support','personalCare','mobility','communication','legacy.support_method','legacy.communication') then raise exception 'invalid_routine_reference';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>20 then raise exception 'invalid_routine_items';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object' or item-array['kind','value']<>'{}'::jsonb or not(item ?& array['kind','value']) or jsonb_typeof(item->'kind') is distinct from 'string' or jsonb_typeof(item->'value') is distinct from 'string' or not private.routine_item_allowed(p_service,item->>'kind',item->>'value') then raise exception 'invalid_routine_item';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value) from jsonb_array_elements(p_items)) then raise exception 'duplicate_routine_item';end if;
 select * into x from public.client_record_profiles where organization_id=p_org and client_id=p_client for update;
 if p_revision is null or coalesce(x.revision,0) is distinct from p_revision then raise exception 'profile_revision_conflict';end if;
 if coalesce((x.routine_care->p_service->>'version')::integer,1)>=2 then raise exception 'routine_settings_require_current_screen';end if;
 previous_row:=to_jsonb(x);
 v_entry:=jsonb_build_object('version',1,'items',p_items,'profile_ref',p_profile_ref,'updated_at',clock_timestamp(),'updated_by',auth.uid());
 next_routine:=coalesce(x.routine_care,'{}'::jsonb)||jsonb_build_object(p_service,v_entry);
 if octet_length(next_routine::text)>60000 then raise exception 'routine_settings_too_long';end if;
 -- PATCH one service only. Other profile fields, services, IDs and care records remain.
 insert into public.client_record_profiles(organization_id,client_id,routine_care,updated_by) values(p_org,p_client,next_routine,auth.uid())
 on conflict(organization_id,client_id) do update set routine_care=excluded.routine_care,revision=client_record_profiles.revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() returning * into x;
 v_legacy:=jsonb_build_object('usual',c.usual,'trait',c.trait,'caution',c.caution,'communication',c.communication,'support_method',c.support_method);
 insert into private.record_profile_history(organization_id,client_id,actor,previous,next_record) values(p_org,p_client,auth.uid(),jsonb_build_object('legacy',v_legacy,'profile',previous_row),jsonb_build_object('legacy',v_legacy,'profile',to_jsonb(x)));
 return to_jsonb(x);
end $$;

revoke all on function private.save_routine_care_v2(uuid,uuid,bigint,text,jsonb,text) from public,anon;
grant execute on function private.save_routine_care_v2(uuid,uuid,bigint,text,jsonb,text) to authenticated;
create function public.save_routine_care_v2(p_org uuid,p_client uuid,p_revision bigint,p_service text,p_items jsonb,p_profile_ref text) returns jsonb
 language sql security invoker set search_path='' as $$select private.save_routine_care_v2(p_org,p_client,p_revision,p_service,p_items,p_profile_ref)$$;
revoke all on function public.save_routine_care_v2(uuid,uuid,bigint,text,jsonb,text) from public,anon;
grant execute on function public.save_routine_care_v2(uuid,uuid,bigint,text,jsonb,text) to authenticated;
commit;
