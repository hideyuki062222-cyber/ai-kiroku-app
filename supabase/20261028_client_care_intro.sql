alter table public.clients
  add column if not exists care_intro_text text not null
  default '指示内容確認しました。前回のサービス記録確認しました。';

update public.clients
set care_intro_text = '指示内容確認しました。前回のサービス記録確認しました。'
where btrim(coalesce(care_intro_text, '')) = '';
