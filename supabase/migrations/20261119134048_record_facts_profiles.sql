-- Optional structured profiles and input snapshots; no backfill, no existing RLS replacement.
begin;
set local lock_timeout='5s';
alter table public.care_records add column daily_facts jsonb;
alter table public.care_records add constraint care_records_daily_facts_size check(daily_facts is null or (jsonb_typeof(daily_facts)='object' and octet_length(daily_facts::text)<=150000 and daily_facts->'version' is not distinct from '1'::jsonb and service_date is not null and daily_facts->>'date' is not distinct from service_date::text));
create table public.client_record_profiles(
 organization_id uuid not null references public.organizations(id),client_id uuid not null references public.clients(id),
 data jsonb not null default '{}',revision bigint not null default 1,
 updated_at timestamptz not null default clock_timestamp(),updated_by uuid not null,
 primary key(organization_id,client_id),check(jsonb_typeof(data)='object' and octet_length(data::text)<=20000)
);
alter table public.client_record_profiles enable row level security;
revoke all on public.client_record_profiles from public,anon,authenticated;
grant select on public.client_record_profiles to authenticated;
create policy profile_member_read on public.client_record_profiles for select to authenticated
 using(private.is_org_member(organization_id) and exists(select 1 from public.organizations o where o.id=organization_id and o.is_active) and exists(select 1 from public.clients c where c.id=client_record_profiles.client_id and c.organization_id=client_record_profiles.organization_id));
create table private.record_profile_history(
 id bigint generated always as identity primary key,organization_id uuid not null,client_id uuid not null,
 actor uuid not null,occurred_at timestamptz not null default clock_timestamp(),previous jsonb,next_record jsonb
);
alter table private.record_profile_history enable row level security;
revoke all on private.record_profile_history from public,anon,authenticated;
create function private.save_record_profile(p_org uuid,p_client uuid,p_revision bigint,p_data jsonb,p_expected_legacy jsonb,p_legacy jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare c public.clients;x public.client_record_profiles;v_old jsonb;entry record;ch jsonb;k text;v_previous jsonb;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501';end if;
 perform 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.role='admin' and o.is_active for share of m,o;
 if not found then raise exception 'profile_admin_required' using errcode='42501';end if;
 select * into c from public.clients where id=p_client and organization_id=p_org and is_active for update;
 if c.id is null then raise exception 'profile_client_not_found';end if;
 v_old:=jsonb_build_object('usual',c.usual,'trait',c.trait,'caution',c.caution,'communication',c.communication,'support_method',c.support_method);
 if p_expected_legacy is distinct from v_old then raise exception 'profile_legacy_conflict';end if;
 if jsonb_typeof(p_legacy) is distinct from 'object' or p_legacy-array['usual','trait','caution','communication','support_method']<>'{}'::jsonb or not p_legacy ?& array['usual','trait','caution','communication','support_method'] then raise exception 'invalid_legacy_profile';end if;
 foreach k in array array['usual','trait','caution','communication','support_method'] loop
  if jsonb_typeof(p_legacy->k) is distinct from 'string' or (p_legacy->k is distinct from v_old->k and length(p_legacy->>k)>10000) then raise exception 'invalid_legacy_text';end if;
 end loop;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>20000 or p_data-array['usual','communication','expression','independent','assistance','mobility','personalCare','traits','cautions','support','other']<>'{}'::jsonb then raise exception 'invalid_profile_fields';end if;
 for entry in select * from jsonb_each(p_data) loop
  if jsonb_typeof(entry.value) is distinct from 'object' or entry.value-array['choices','note']<>'{}'::jsonb or jsonb_typeof(entry.value->'choices') is distinct from 'array' or jsonb_typeof(entry.value->'note') is distinct from 'string' then raise exception 'invalid_profile_section';end if;
  if length(entry.value->>'note')>1000 or jsonb_array_length(entry.value->'choices')>8 then raise exception 'profile_section_too_long';end if;
  for ch in select value from jsonb_array_elements(entry.value->'choices') loop if jsonb_typeof(ch)<>'string' or length(ch#>>'{}')>80 then raise exception 'invalid_profile_choice';end if;end loop;
 end loop;
 select * into x from public.client_record_profiles where organization_id=p_org and client_id=p_client for update;
 if coalesce(x.revision,0) is distinct from p_revision then raise exception 'profile_revision_conflict';end if;
 v_previous:=jsonb_build_object('legacy',v_old,'profile',to_jsonb(x));
 if p_legacy is distinct from v_old then
  update public.clients set usual=p_legacy->>'usual',trait=p_legacy->>'trait',caution=p_legacy->>'caution',communication=p_legacy->>'communication',support_method=p_legacy->>'support_method' where id=p_client and organization_id=p_org;
 end if;
 insert into public.client_record_profiles(organization_id,client_id,data,updated_by) values(p_org,p_client,p_data,auth.uid())
 on conflict(organization_id,client_id) do update set data=excluded.data,revision=client_record_profiles.revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() returning * into x;
 insert into private.record_profile_history(organization_id,client_id,actor,previous,next_record) values(p_org,p_client,auth.uid(),v_previous,jsonb_build_object('legacy',p_legacy,'profile',to_jsonb(x)));
 return to_jsonb(x);
end $$;
revoke all on function private.save_record_profile(uuid,uuid,bigint,jsonb,jsonb,jsonb) from public,anon;
grant execute on function private.save_record_profile(uuid,uuid,bigint,jsonb,jsonb,jsonb) to authenticated;
create function public.save_record_profile(p_org uuid,p_client uuid,p_revision bigint,p_data jsonb,p_expected_legacy jsonb,p_legacy jsonb) returns jsonb
 language sql security invoker set search_path='' as $$select private.save_record_profile(p_org,p_client,p_revision,p_data,p_expected_legacy,p_legacy)$$;
revoke all on function public.save_record_profile(uuid,uuid,bigint,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_record_profile(uuid,uuid,bigint,jsonb,jsonb,jsonb) to authenticated;
commit;
