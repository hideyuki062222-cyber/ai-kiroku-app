create table attendance_backup.service_slots_before_presets_20261020 as select * from public.client_service_slots;
revoke all on attendance_backup.service_slots_before_presets_20261020 from public, anon, authenticated;
alter table public.client_service_slots add column service_contents jsonb;
alter table public.client_service_slots add constraint service_contents_valid check (service_contents is null or (jsonb_typeof(service_contents)='array' and jsonb_array_length(service_contents)<=15 and service_contents <@ '["起床介助","就寝介助","トイレ介助","食事介助","入浴準備","入浴介助","更衣介助","服薬介助・確認","口腔ケア","清容・保清","移動介助","買い物・外出支援","通院等介助","家事援助","その他"]'::jsonb));
comment on column public.client_service_slots.service_contents is 'AI記録のサービス選択初期値。NULLは未設定、[]は明示的に選択なし。';
