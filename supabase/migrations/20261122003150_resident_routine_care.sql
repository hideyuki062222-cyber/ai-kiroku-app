-- Additive: existing profile/record data and RLS remain unchanged.
begin;
set local lock_timeout='5s';
do $$begin
 if to_regprocedure('private.lock_facility_feature(uuid,text,boolean)') is null then raise exception 'routine_requires_scoped_permissions';end if;
 if exists(select 1 from pg_attribute where attrelid='public.client_record_profiles'::regclass and attname='routine_care' and not attisdropped) then raise exception 'routine_column_already_present_check_migration_history';end if;
end $$;
alter table public.client_record_profiles add column routine_care jsonb not null default '{}'::jsonb;
alter table public.client_record_profiles add constraint client_record_profiles_routine_care_size check(jsonb_typeof(routine_care)='object' and octet_length(routine_care::text)<=60000);
create function private.routine_item_allowed(p_service text,p_kind text,p_value text) returns boolean
 language sql immutable security invoker set search_path='' as $$
 select coalesce((($catalog${"食事介助":{"action":["食事中の見守りを行った","食事の際に声をかけた","食物を口元へ運ぶ介助を行った","食器の位置を整える介助を行った","食物を食べやすい大きさにする介助を行った","食具の操作を介助した","食事姿勢を整える介助を行った"],"self":["食具を操作した","食物を口元へ運んだ"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"トイレ介助":{"action":["トイレへの移動を介助した","排泄時の衣類の上げ下げを介助した","排泄後の清拭を介助した","排泄中の見守りを行った","トイレの扉の開閉を介助した","排泄後の手洗いを介助した","パッドの交換を介助した","便座への移乗を介助した"],"self":["衣類を下げた","衣類を上げた","排泄後に手を洗った"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"入浴介助":{"action":["洗身を介助した","洗髪を介助した","浴槽の出入りを介助した","入浴中の見守りを行った","洗身後の体を拭く介助を行った","シャワーを持つ動作を介助した","下肢の洗身を介助した","背部の洗身を介助した"],"self":["上半身を洗った","髪を洗った","体を拭いた"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"入浴準備":{"action":["入浴用の物品を準備した","浴室の環境を整えた","着替えを手元に置く支援を行った","入浴用のタオルを準備した"],"self":["自分で選択した"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"更衣介助":{"action":["衣類を準備した","衣類を着る動作を介助した","衣類を脱ぐ動作を介助した","更衣中の見守りを行った","衣類の向きを整える介助を行った","袖に腕を通す介助を行った","衣類の留め具を扱う動作を介助した"],"self":["衣類を脱いだ","衣類を着た","衣類を選んだ"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"服薬介助・確認":{"action":["服薬の声かけを行った","服薬の準備を介助した","服薬したことを確認した","服薬に使う水を準備した","薬を手元に置く介助を行った"],"self":["自分で選択した"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"口腔ケア":{"action":["歯磨きの声かけを行った","歯磨きを介助した","口腔ケア中の見守りを行った","歯ブラシに歯磨き剤を付ける介助を行った","義歯を洗う介助を行った","口をすすぐ動作を介助した"],"self":["歯を磨いた","口をすすいだ"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"起床介助":{"action":["起き上がりを介助した","起床の声かけを行った","掛け物を外す介助を行った","起床時の履物を準備した","端座位になる動作を介助した"],"self":["自分で選択した"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"就寝介助":{"action":["寝具を整えた","ベッドへの移乗を介助した","就寝準備の声かけを行った","枕の位置を整える介助を行った","掛け物を掛ける介助を行った","就寝前の物品を準備した"],"self":["自分で選択した"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"清容・保清":{"action":["洗顔を介助した","整髪を介助した","清拭を行った","タオルを手元へ渡す支援を行った","爪の手入れを介助した","手洗いを介助した"],"self":["自分で選択した"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"移動介助":{"action":["歩行に付き添った","車椅子での移動を介助した","移乗を介助した","歩行器を使う移動に付き添った","段差を越える動作を介助した","立ち上がる動作を介助した"],"self":["立ち上がった","歩いて移動した"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"買い物・外出支援":{"action":["買い物に付き添った","商品選びの声かけを行った","商品をかごに入れる介助を行った","支払いの手続きを支援した"],"self":["自分で選択した"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"通院等介助":{"action":["通院に付き添った","受診の手続きを支援した","受付での手続きを支援した","会計の手続きを支援した","診察室への移動に付き添った"],"self":["自分で選択した"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"家事援助":{"action":["掃除を行った","洗濯を行った","調理を行った","食器を洗う支援を行った","ごみをまとめる支援を行った"],"self":["自分で選択した"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]},"その他":{"action":["本人の見守りを行った","本人に声をかけた","本人が選ぶための物品を並べる支援を行った","本人の依頼で物品を手元へ渡した"],"self":["自分で選択した"],"method":["短い言葉で声をかけた","ゆっくり話した","写真・絵を用いて伝えた","筆談で伝えた","本人のペースを待った","手順を一つずつ伝えた"]}}$catalog$::jsonb)->p_service->p_kind) ? p_value,false) or (p_kind='custom' and length(p_value)<=300 and p_value !~ '[<>「」『』"\n。／;]|体調|反応|表情|笑顔|痛|発熱|血圧|脈拍|拒否|未確認|未実施|しない|せず|していない|なし|場合|とき|際|なら|予定|かも|不明|疑い|できる|できない|普段|通常' and p_value ~ '(介助する|支援する|を通す|を整える|を支える|手を添える|を拭く|を洗う|を準備する|を伝える|を待つ|を行う|を置く)$')
$$;
revoke all on function private.routine_item_allowed(text,text,text) from public,anon,authenticated;
create function private.save_routine_care(p_org uuid,p_client uuid,p_revision bigint,p_service text,p_items jsonb,p_profile_ref text) returns jsonb
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
revoke all on function private.save_routine_care(uuid,uuid,bigint,text,jsonb,text) from public,anon;
grant execute on function private.save_routine_care(uuid,uuid,bigint,text,jsonb,text) to authenticated;
create function public.save_routine_care(p_org uuid,p_client uuid,p_revision bigint,p_service text,p_items jsonb,p_profile_ref text) returns jsonb
 language sql security invoker set search_path='' as $$select private.save_routine_care(p_org,p_client,p_revision,p_service,p_items,p_profile_ref)$$;
revoke all on function public.save_routine_care(uuid,uuid,bigint,text,jsonb,text) from public,anon;
grant execute on function public.save_routine_care(uuid,uuid,bigint,text,jsonb,text) to authenticated;
commit;
