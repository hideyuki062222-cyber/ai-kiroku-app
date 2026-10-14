begin;

alter table public.clients
  add column if not exists room_number text not null default '';

update public.clients
set room_number = code
where btrim(coalesce(room_number,'')) = ''
  and btrim(coalesce(code,'')) <> '';

create unique index if not exists clients_one_active_resident_per_room
on public.clients (organization_id, room_number)
where is_active = true and btrim(room_number) <> '';

-- Legacy placeholder in COZY蒲生: keep every old record linked to this client,
-- but remove the placeholder from current selectable residents.
update public.clients c
set is_active = false,
    updated_at = now()
where c.code = '101'
  and c.display_name = '空室'
  and c.organization_id in (
    select id from public.organizations where name = 'COZY蒲生'
  );

commit;
