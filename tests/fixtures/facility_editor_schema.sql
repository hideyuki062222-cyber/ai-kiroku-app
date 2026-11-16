-- Metadata-only snapshot of the relevant production schema, constraints, grants and RLS.
-- Synthetic test database only; captured before facility-editor development. No production rows.
create role anon nologin; create role authenticated nologin; create schema auth; create schema private; create schema meal_history;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
-- PGlite-only stub for unused pgcrypto join-code default; fixtures supply explicit codes.
create function public.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
create table auth.users(id uuid primary key,email text);
grant usage on schema auth,private,public to authenticated; grant usage on schema auth,public to anon;
create table meal_history.changes(id bigint generated always as identity primary key,table_name text,changed_at timestamptz default now(),actor uuid,previous jsonb,next_record jsonb);
create table public."care_records"(
 "id" uuid default gen_random_uuid() not null,
 "organization_id" uuid not null,
 "client_id" uuid not null,
 "created_by" uuid not null,
 "service_type" text default ''::text not null,
 "visit_scene" text default ''::text not null,
 "condition" text default ''::text not null,
 "health" text default ''::text not null,
 "length_mode" text default 'normal'::text not null,
 "services" text[] default '{}'::text[] not null,
 "care_input" text default ''::text not null,
 "visit_note" text default ''::text not null,
 "care_note" text default ''::text not null,
 "created_at" timestamp with time zone default now() not null,
 "intervention_level" text default ''::text not null,
 "support_method_snapshot" text default ''::text not null,
 "service_date" date,
 "service_time" time without time zone,
 "assignment_id" uuid,
 "updated_at" timestamp with time zone default now() not null,
 constraint "care_records_intervention_level_check" CHECK ((intervention_level = ANY (ARRAY[''::text, 'active'::text, 'partial'::text, 'prompt'::text, 'watch'::text, 'minimal'::text]))),
 constraint "care_records_pkey" PRIMARY KEY (id),
 constraint "care_records_support_method_snapshot_len" CHECK ((char_length(support_method_snapshot) <= 1000))
);
create table public."client_service_slots"(
 "id" uuid default gen_random_uuid() not null,
 "organization_id" uuid not null,
 "client_id" uuid not null,
 "service_time" time without time zone not null,
 "label" text default ''::text not null,
 "note" text default ''::text not null,
 "days_of_week" smallint[] default ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint] not null,
 "sort_order" integer default 0 not null,
 "is_active" boolean default true not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "service_contents" jsonb,
 constraint "client_service_slots_organization_id_client_id_service_time_key" UNIQUE (organization_id, client_id, service_time),
 constraint "client_service_slots_pkey" PRIMARY KEY (id),
 constraint "service_contents_valid" CHECK (((service_contents IS NULL) OR ((jsonb_typeof(service_contents) = 'array'::text) AND (jsonb_array_length(service_contents) <= 15) AND (service_contents <@ '["起床介助", "就寝介助", "トイレ介助", "食事介助", "入浴準備", "入浴介助", "更衣介助", "服薬介助・確認", "口腔ケア", "清容・保清", "移動介助", "買い物・外出支援", "通院等介助", "家事援助", "その他"]'::jsonb))))
);
create table public."clients"(
 "id" uuid default gen_random_uuid() not null,
 "organization_id" uuid not null,
 "code" text not null,
 "usual" text default ''::text not null,
 "trait" text default ''::text not null,
 "caution" text default ''::text not null,
 "communication" text default ''::text not null,
 "sort_order" integer default 0 not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "display_name" text default ''::text not null,
 "is_active" boolean default true not null,
 "support_method" text default ''::text not null,
 "room_number" text default ''::text not null,
 "care_intro_text" text default '指示内容確認しました。前回のサービス記録確認しました。'::text not null,
 constraint "clients_code_check" CHECK (((char_length(TRIM(BOTH FROM code)) >= 1) AND (char_length(TRIM(BOTH FROM code)) <= 80))),
 constraint "clients_display_name_check" CHECK ((char_length(TRIM(BOTH FROM display_name)) <= 80)),
 constraint "clients_organization_id_code_key" UNIQUE (organization_id, code),
 constraint "clients_pkey" PRIMARY KEY (id),
 constraint "clients_support_method_len" CHECK ((char_length(support_method) <= 1000))
);
create table public."handoff_activity"(
 "id" uuid default gen_random_uuid() not null,
 "organization_id" uuid not null,
 "entry_id" uuid not null,
 "action" text not null,
 "actor_user_id" uuid,
 "actor_staff_id" uuid,
 "actor_name" text,
 "occurred_at" timestamp with time zone default clock_timestamp(),
 "note" text default ''::text not null,
 "workflow_revision" bigint,
 "confirmation_revision" bigint,
 "request_id" uuid,
 "legacy" boolean default false not null,
 constraint "handoff_activity_action_check" CHECK ((action = ANY (ARRAY['confirmed'::text, 'confirmation_cancelled'::text, 'completed'::text, 'reopened'::text, 'carry'::text, 'archived'::text, 'restored'::text, 'legacy_completed'::text]))),
 constraint "handoff_activity_actor_name_check" CHECK ((char_length(actor_name) <= 80)),
 constraint "handoff_activity_check" CHECK (((legacy AND (action = 'legacy_completed'::text) AND (actor_user_id IS NULL) AND (occurred_at IS NULL)) OR ((action <> 'legacy_completed'::text) AND (actor_user_id IS NOT NULL) AND (occurred_at IS NOT NULL)))),
 constraint "handoff_activity_note_check" CHECK ((char_length(note) <= 300)),
 constraint "handoff_activity_organization_id_request_id_key" UNIQUE (organization_id, request_id),
 constraint "handoff_activity_pkey" PRIMARY KEY (id)
);
create table public."handoff_confirmations"(
 "entry_id" uuid not null,
 "user_id" uuid not null,
 "confirmed_at" timestamp with time zone default now() not null,
 "confirmation_revision" bigint default 0 not null,
 "revoked_at" timestamp with time zone,
 "staff_name" text,
 "staff_id" uuid,
 constraint "handoff_confirmations_confirmation_revision_check" CHECK ((confirmation_revision >= 0)),
 constraint "handoff_confirmations_pkey" PRIMARY KEY (entry_id, user_id),
 constraint "handoff_confirmations_staff_name_check" CHECK ((char_length(staff_name) <= 80))
);
create table public."handoff_entries"(
 "id" uuid default gen_random_uuid() not null,
 "organization_id" uuid not null,
 "client_id" uuid,
 "service_date" date not null,
 "shift" text not null,
 "body" text not null,
 "categories" text[] default '{}'::text[] not null,
 "is_important" boolean default false not null,
 "carry_over" boolean default false not null,
 "resolved" boolean default false not null,
 "created_by" uuid not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "scope" text default 'client'::text not null,
 "due_date" date,
 "due_time" time without time zone,
 "source_label" text,
 "workflow_revision" bigint default 0 not null,
 "archived" boolean default false not null,
 constraint "handoff_entries_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500))),
 constraint "handoff_entries_id_org_unique" UNIQUE (id, organization_id),
 constraint "handoff_entries_pkey" PRIMARY KEY (id),
 constraint "handoff_entries_scope_check" CHECK ((scope = ANY (ARRAY['client'::text, 'general'::text]))),
 constraint "handoff_entries_scope_client_check" CHECK ((((scope = 'general'::text) AND (client_id IS NULL)) OR ((scope = 'client'::text) AND (client_id IS NOT NULL)))),
 constraint "handoff_entries_shift_check" CHECK ((shift = ANY (ARRAY['day'::text, 'night'::text]))),
 constraint "handoff_entries_workflow_revision_check" CHECK ((workflow_revision >= 0))
);
create table public."handoff_quick_inputs"(
 "id" uuid default gen_random_uuid() not null,
 "organization_id" uuid not null,
 "label" text not null,
 "category" text default 'その他'::text not null,
 "sort_order" integer default 0 not null,
 "created_at" timestamp with time zone default now() not null,
 constraint "handoff_quick_inputs_category_check" CHECK (((char_length(TRIM(BOTH FROM category)) >= 1) AND (char_length(TRIM(BOTH FROM category)) <= 40))),
 constraint "handoff_quick_inputs_label_check" CHECK (((char_length(TRIM(BOTH FROM label)) >= 1) AND (char_length(TRIM(BOTH FROM label)) <= 80))),
 constraint "handoff_quick_inputs_org_label_unique" UNIQUE (organization_id, label),
 constraint "handoff_quick_inputs_pkey" PRIMARY KEY (id)
);
create table public."meal_entries"(
 "organization_id" uuid not null,
 "client_id" uuid not null,
 "meal_date" date not null,
 "meal" text not null,
 "status" text default 'planned'::text not null,
 "unit_price" integer default 0 not null,
 "food_form" text default ''::text not null,
 "rice_grams" integer default 0 not null,
 "note" text default ''::text not null,
 "served_once" boolean default false not null,
 "revision" bigint default 1 not null,
 "updated_at" timestamp with time zone default now() not null,
 "updated_by" uuid,
 "updated_by_name" text default ''::text not null,
 constraint "meal_entries_meal_check" CHECK ((meal = ANY (ARRAY['morning'::text, 'lunch'::text, 'evening'::text]))),
 constraint "meal_entries_meal_date_check" CHECK (((meal_date >= '2000-01-01'::date) AND (meal_date <= '2100-12-31'::date))),
 constraint "meal_entries_note_check" CHECK ((length(note) <= 500)),
 constraint "meal_entries_pkey" PRIMARY KEY (organization_id, client_id, meal_date, meal),
 constraint "meal_entries_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'served'::text, 'absent'::text]))),
 constraint "meal_entries_unit_price_check" CHECK (((unit_price >= 0) AND (unit_price <= 100000)))
);
create table public."meal_prices"(
 "organization_id" uuid not null,
 "effective_date" date not null,
 "morning" integer not null,
 "lunch" integer not null,
 "evening" integer not null,
 "revision" bigint default 1 not null,
 "updated_at" timestamp with time zone default now() not null,
 "updated_by" uuid,
 constraint "meal_prices_evening_check" CHECK (((evening >= 0) AND (evening <= 100000))),
 constraint "meal_prices_lunch_check" CHECK (((lunch >= 0) AND (lunch <= 100000))),
 constraint "meal_prices_morning_check" CHECK (((morning >= 0) AND (morning <= 100000))),
 constraint "meal_prices_pkey" PRIMARY KEY (organization_id, effective_date)
);
create table public."meal_profiles"(
 "organization_id" uuid not null,
 "client_id" uuid not null,
 "start_date" date not null,
 "end_date" date,
 "food_form" text default '常食'::text not null,
 "rice_morning" integer default 150 not null,
 "rice_lunch" integer default 150 not null,
 "rice_evening" integer default 150 not null,
 "morning" boolean default true not null,
 "lunch" boolean default true not null,
 "evening" boolean default true not null,
 "weekdays" integer[] default ARRAY[0, 1, 2, 3, 4, 5, 6] not null,
 "note" text default ''::text not null,
 "revision" bigint default 1 not null,
 "updated_at" timestamp with time zone default now() not null,
 "updated_by" uuid,
 constraint "meal_profiles_check" CHECK (((end_date IS NULL) OR (end_date >= start_date))),
 constraint "meal_profiles_food_form_check" CHECK (((length(food_form) >= 1) AND (length(food_form) <= 80))),
 constraint "meal_profiles_note_check" CHECK ((length(note) <= 1000)),
 constraint "meal_profiles_pkey" PRIMARY KEY (client_id),
 constraint "meal_profiles_rice_evening_check" CHECK (((rice_evening >= 0) AND (rice_evening <= 2000))),
 constraint "meal_profiles_rice_lunch_check" CHECK (((rice_lunch >= 0) AND (rice_lunch <= 2000))),
 constraint "meal_profiles_rice_morning_check" CHECK (((rice_morning >= 0) AND (rice_morning <= 2000))),
 constraint "meal_profiles_weekdays_check" CHECK ((weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]))
);
create table public."organization_members"(
 "organization_id" uuid not null,
 "user_id" uuid not null,
 "role" text default 'staff'::text not null,
 "created_at" timestamp with time zone default now() not null,
 "staff_name" text default ''::text not null,
 constraint "organization_members_pkey" PRIMARY KEY (organization_id, user_id),
 constraint "organization_members_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'staff'::text]))),
 constraint "organization_members_staff_name_check" CHECK ((char_length(TRIM(BOTH FROM staff_name)) <= 80))
);
create table public."organization_staff"(
 "id" uuid default gen_random_uuid() not null,
 "organization_id" uuid not null,
 "staff_name" text not null,
 "linked_user_id" uuid,
 "is_active" boolean default true not null,
 "sort_order" integer default 0 not null,
 "created_by" uuid not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "office_label" text default '居宅介護 KIZUNA'::text not null,
 "employment_type" text default ''::text not null,
 constraint "organization_staff_employment_type_check" CHECK ((length(employment_type) <= 40)),
 constraint "organization_staff_id_org_unique" UNIQUE (id, organization_id),
 constraint "organization_staff_name_nonblank" CHECK (((char_length(TRIM(BOTH FROM staff_name)) >= 1) AND (char_length(TRIM(BOTH FROM staff_name)) <= 80))),
 constraint "organization_staff_office_label_check" CHECK ((length(office_label) <= 120)),
 constraint "organization_staff_pkey" PRIMARY KEY (id)
);
create table public."organizations"(
 "id" uuid default gen_random_uuid() not null,
 "name" text not null,
 "join_code" text default upper(substr(encode(gen_random_bytes(12), 'hex'::text), 1, 16)) not null,
 "created_by" uuid not null,
 "created_at" timestamp with time zone default now() not null,
 "is_active" boolean default true not null,
 "updated_at" timestamp with time zone default now() not null,
 constraint "organizations_join_code_key" UNIQUE (join_code),
 constraint "organizations_name_check" CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 120))),
 constraint "organizations_pkey" PRIMARY KEY (id)
);
create table public."staff_assignments"(
 "id" uuid default gen_random_uuid() not null,
 "organization_id" uuid not null,
 "client_id" uuid not null,
 "service_date" date not null,
 "service_time" time without time zone not null,
 "assigned_user_id" uuid,
 "assigned_staff_name" text default ''::text not null,
 "memo" text default ''::text not null,
 "created_by" uuid not null,
 "updated_by" uuid not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "assigned_staff_id" uuid,
 constraint "staff_assignments_organization_id_client_id_service_date_se_key" UNIQUE (organization_id, client_id, service_date, service_time),
 constraint "staff_assignments_pkey" PRIMARY KEY (id)
);
CREATE INDEX idx_care_records_org_created ON public.care_records USING btree (organization_id, created_at DESC);
CREATE INDEX idx_care_records_client_created ON public.care_records USING btree (client_id, created_at DESC);
CREATE INDEX idx_care_records_created_by ON public.care_records USING btree (created_by);
CREATE INDEX idx_client_service_slots_org_time ON public.client_service_slots USING btree (organization_id, service_time);
CREATE INDEX idx_clients_org_sort ON public.clients USING btree (organization_id, sort_order, code);
CREATE UNIQUE INDEX clients_id_org_unique ON public.clients USING btree (id, organization_id);
CREATE INDEX clients_org_active_sort_idx ON public.clients USING btree (organization_id, is_active, sort_order, code);
CREATE UNIQUE INDEX clients_one_active_resident_per_room ON public.clients USING btree (organization_id, room_number) WHERE ((is_active = true) AND (btrim(room_number) <> ''::text));
CREATE INDEX handoff_activity_entry_time ON public.handoff_activity USING btree (organization_id, entry_id, occurred_at, id);
CREATE INDEX handoff_activity_actor_time ON public.handoff_activity USING btree (organization_id, actor_user_id, occurred_at DESC);
CREATE INDEX handoff_confirmations_user_idx ON public.handoff_confirmations USING btree (user_id, confirmed_at DESC);
CREATE INDEX handoff_entries_org_date_idx ON public.handoff_entries USING btree (organization_id, service_date DESC);
CREATE INDEX handoff_entries_client_date_idx ON public.handoff_entries USING btree (client_id, service_date DESC);
CREATE INDEX handoff_entries_flags_idx ON public.handoff_entries USING btree (organization_id, is_important, carry_over, resolved);
CREATE INDEX handoff_entries_due_idx ON public.handoff_entries USING btree (organization_id, due_date, resolved) WHERE (due_date IS NOT NULL);
CREATE INDEX handoff_quick_inputs_org_sort_idx ON public.handoff_quick_inputs USING btree (organization_id, sort_order, created_at);
CREATE INDEX meal_entries_month ON public.meal_entries USING btree (organization_id, meal_date, client_id, meal);
CREATE INDEX meal_entries_client ON public.meal_entries USING btree (client_id);
CREATE INDEX meal_profiles_org ON public.meal_profiles USING btree (organization_id);
CREATE INDEX organization_members_user_idx ON public.organization_members USING btree (user_id, organization_id);
CREATE INDEX organization_staff_org_active_idx ON public.organization_staff USING btree (organization_id, is_active, sort_order, staff_name);
CREATE UNIQUE INDEX organization_staff_linked_user_unique ON public.organization_staff USING btree (organization_id, linked_user_id) WHERE (linked_user_id IS NOT NULL);
CREATE UNIQUE INDEX organization_staff_one_login ON public.organization_staff USING btree (organization_id, linked_user_id) WHERE (linked_user_id IS NOT NULL);
CREATE INDEX idx_organizations_created_by ON public.organizations USING btree (created_by);
CREATE INDEX idx_staff_assignments_org_date ON public.staff_assignments USING btree (organization_id, service_date, service_time);
CREATE INDEX idx_staff_assignments_client_date ON public.staff_assignments USING btree (client_id, service_date);
CREATE INDEX staff_assignments_assigned_staff_idx ON public.staff_assignments USING btree (assigned_staff_id);
alter table public."care_records" add constraint "care_records_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES staff_assignments(id) ON DELETE SET NULL;
alter table public."care_records" add constraint "care_records_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;
alter table public."care_records" add constraint "care_records_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."care_records" add constraint "care_records_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public."client_service_slots" add constraint "client_service_slots_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."client_service_slots" add constraint "client_service_slots_client_org_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id);
alter table public."client_service_slots" add constraint "client_service_slots_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public."clients" add constraint "clients_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public."handoff_activity" add constraint "handoff_activity_entry_id_organization_id_fkey" FOREIGN KEY (entry_id, organization_id) REFERENCES handoff_entries(id, organization_id) ON DELETE RESTRICT;
alter table public."handoff_confirmations" add constraint "handoff_confirmations_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES handoff_entries(id) ON DELETE CASCADE;
alter table public."handoff_confirmations" add constraint "handoff_confirmations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."handoff_entries" add constraint "handoff_entries_client_org_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id) ON DELETE CASCADE;
alter table public."handoff_entries" add constraint "handoff_entries_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."handoff_entries" add constraint "handoff_entries_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public."handoff_quick_inputs" add constraint "handoff_quick_inputs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public."meal_entries" add constraint "meal_entries_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."meal_entries" add constraint "meal_entries_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table public."meal_prices" add constraint "meal_prices_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table public."meal_profiles" add constraint "meal_profiles_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."meal_profiles" add constraint "meal_profiles_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table public."organization_members" add constraint "organization_members_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public."organization_members" add constraint "organization_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."organization_staff" add constraint "organization_staff_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."organization_staff" add constraint "organization_staff_linked_user_id_fkey" FOREIGN KEY (linked_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."organization_staff" add constraint "organization_staff_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public."organization_staff" add constraint "staff_login_same_org" FOREIGN KEY (organization_id, linked_user_id) REFERENCES organization_members(organization_id, user_id) ON DELETE SET NULL (linked_user_id);
alter table public."organizations" add constraint "organizations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."staff_assignments" add constraint "staff_assignments_assigned_staff_id_fkey" FOREIGN KEY (assigned_staff_id) REFERENCES organization_staff(id) ON DELETE SET NULL;
alter table public."staff_assignments" add constraint "staff_assignments_assigned_user_id_fkey" FOREIGN KEY (assigned_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."staff_assignments" add constraint "staff_assignments_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."staff_assignments" add constraint "staff_assignments_client_org_fk" FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id);
alter table public."staff_assignments" add constraint "staff_assignments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."staff_assignments" add constraint "staff_assignments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public."staff_assignments" add constraint "staff_assignments_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION private.canonicalize_linked_staff_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_name text; v_actor uuid := auth.uid();
begin
  if new.linked_user_id is not null then
    select m.staff_name into v_name from public.organization_members m
     where m.organization_id = new.organization_id and m.user_id = new.linked_user_id;
    if not found then raise exception 'linked_member_missing'; end if;
    if v_actor is not null and v_actor <> new.linked_user_id and not private.is_org_admin(new.organization_id) then
      raise exception 'admin_required';
    end if;
    if tg_op = 'UPDATE' and old.linked_user_id is not distinct from new.linked_user_id
       and new.staff_name is distinct from old.staff_name and new.staff_name is distinct from v_name then
      raise exception 'use_canonical_staff_name_update';
    end if;
    if private.staff_name_registered(v_name) then new.staff_name := v_name; end if;
  elsif tg_op = 'UPDATE' and old.linked_user_id is not null then
    select m.staff_name into v_name from public.organization_members m
     where m.organization_id = old.organization_id and m.user_id = old.linked_user_id;
    if found and private.staff_name_registered(v_name) then new.staff_name := v_name; end if;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.cashbook_account_audit_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.client_id := old.client_id;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.cashbook_entry_audit_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if tg_op = 'INSERT' then
    select nullif(trim(m.staff_name),'')
      into v_name
    from public.organization_members m
    where m.organization_id = new.organization_id
      and m.user_id = v_uid;

    if not found then
      raise exception 'organization_membership_required';
    end if;

    new.created_by := v_uid;
    new.updated_by := v_uid;
    new.created_by_name := coalesce(v_name,'職員名未登録');
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
  else
    new.organization_id := old.organization_id;
    new.client_id := old.client_id;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    new.updated_by := v_uid;
    new.updated_at := now();
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.handoff_initialize_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or new.created_by is distinct from auth.uid() or not private.is_org_member(new.organization_id) then
  raise exception 'organization_membership_required';
 end if;
 if not exists(select 1 from public.organizations o where o.id=new.organization_id and o.is_active) then raise exception 'organization_inactive'; end if;
 new.workflow_revision:=0;new.archived:=false;new.resolved:=false;
 new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
 if new.due_date is not null then new.carry_over:=true; end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.handoff_set_confirmation(p_org uuid, p_entry uuid, p_confirmed boolean, p_expected_revision bigint, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid();v_name text;v_staff uuid;v_entry public.handoff_entries%rowtype;
 v_row public.handoff_confirmations%rowtype;v_event public.handoff_activity%rowtype;
 v_revision bigint;v_is_confirmed boolean;v_action text;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 select m.staff_name,s.id into v_name,v_staff from public.organization_members m
 left join public.organization_staff s on s.organization_id=m.organization_id and s.linked_user_id=m.user_id
 where m.organization_id=p_org and m.user_id=v_uid;
 if not found then raise exception 'organization_membership_required'; end if;
 if not exists(select 1 from public.organizations o where o.id=p_org and o.is_active) then raise exception 'organization_inactive'; end if;
 if p_request_id is null or p_confirmed is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_request'; end if;
 select e.* into v_entry from public.handoff_entries e where e.id=p_entry and e.organization_id=p_org for update;
 if not found then raise exception 'entry_not_found'; end if;
 v_action:=case when p_confirmed then 'confirmed' else 'confirmation_cancelled' end;
 select a.* into v_event from public.handoff_activity a where a.organization_id=p_org and a.request_id=p_request_id;
 if found then
  if v_event.entry_id<>p_entry or v_event.actor_user_id<>v_uid or v_event.action<>v_action then raise exception 'request_conflict'; end if;
  select c.* into v_row from public.handoff_confirmations c where c.entry_id=p_entry and c.user_id=v_uid;
  return jsonb_build_object('organization_id',p_org,'entry_id',p_entry,'user_id',v_uid,'confirmation',to_jsonb(v_row),'event_id',v_event.id,'already_applied',true);
 end if;
 if v_entry.archived then raise exception 'entry_archived'; end if;
 select c.* into v_row from public.handoff_confirmations c where c.entry_id=p_entry and c.user_id=v_uid for update;
 v_revision:=coalesce(v_row.confirmation_revision,0);
 v_is_confirmed:=v_row.entry_id is not null and v_row.revoked_at is null;
 if v_revision<>p_expected_revision then raise exception 'confirmation_conflict'; end if;
 if v_is_confirmed=p_confirmed then
  return jsonb_build_object('organization_id',p_org,'entry_id',p_entry,'user_id',v_uid,'confirmation',to_jsonb(v_row),'event_id',null,'already_applied',true);
 end if;
 if p_confirmed then
  insert into public.handoff_confirmations(entry_id,user_id,confirmed_at,revoked_at,confirmation_revision,staff_id,staff_name)
  values(p_entry,v_uid,clock_timestamp(),null,v_revision+1,v_staff,v_name)
  on conflict(entry_id,user_id) do update set confirmed_at=excluded.confirmed_at,revoked_at=null,
   confirmation_revision=excluded.confirmation_revision,staff_id=excluded.staff_id,staff_name=excluded.staff_name
  returning * into v_row;
 else
  update public.handoff_confirmations c set revoked_at=clock_timestamp(),confirmation_revision=v_revision+1
  where c.entry_id=p_entry and c.user_id=v_uid returning * into v_row;
 end if;
 insert into public.handoff_activity(organization_id,entry_id,action,actor_user_id,actor_staff_id,actor_name,confirmation_revision,request_id)
 values(p_org,p_entry,v_action,v_uid,v_staff,v_name,v_revision+1,p_request_id) returning * into v_event;
 return jsonb_build_object('organization_id',p_org,'entry_id',p_entry,'user_id',v_uid,'confirmation',to_jsonb(v_row),'event_id',v_event.id,'already_applied',false);
end $function$
;
CREATE OR REPLACE FUNCTION private.handoff_transition(p_org uuid, p_entry uuid, p_action text, p_expected_revision bigint, p_request_id uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid();v_name text;v_staff uuid;v_entry public.handoff_entries%rowtype;
 v_event public.handoff_activity%rowtype;v_note text:=btrim(coalesce(p_note,''));v_change boolean;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 select m.staff_name,s.id into v_name,v_staff from public.organization_members m
 left join public.organization_staff s on s.organization_id=m.organization_id and s.linked_user_id=m.user_id
 where m.organization_id=p_org and m.user_id=v_uid;
 if not found then raise exception 'organization_membership_required'; end if;
 if not exists(select 1 from public.organizations o where o.id=p_org and o.is_active) then raise exception 'organization_inactive'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_action is null
  or p_action not in ('completed','reopened','carry','archived','restored') or char_length(v_note)>300 then raise exception 'invalid_request'; end if;
 select e.* into v_entry from public.handoff_entries e where e.id=p_entry and e.organization_id=p_org for update;
 if not found then raise exception 'entry_not_found'; end if;
 if p_action in ('archived','restored') and v_entry.created_by<>v_uid and not private.is_org_admin(p_org) then raise exception 'author_or_admin_required'; end if;
 select a.* into v_event from public.handoff_activity a where a.organization_id=p_org and a.request_id=p_request_id;
 if found then
  if v_event.entry_id<>p_entry or v_event.actor_user_id<>v_uid or v_event.action<>p_action or v_event.note<>v_note then raise exception 'request_conflict'; end if;
  return jsonb_build_object('entry',to_jsonb(v_entry),'event_id',v_event.id,'already_applied',true);
 end if;
 if v_entry.archived and p_action<>'restored' then raise exception 'entry_archived'; end if;
 if v_entry.workflow_revision<>p_expected_revision then raise exception 'workflow_conflict'; end if;
 if p_action='carry' and v_entry.resolved then raise exception 'entry_resolved'; end if;
 v_change:=case p_action when 'completed' then not v_entry.resolved when 'reopened' then v_entry.resolved
  when 'carry' then not v_entry.carry_over when 'archived' then not v_entry.archived when 'restored' then v_entry.archived end;
 if not v_change then return jsonb_build_object('entry',to_jsonb(v_entry),'event_id',null,'already_applied',true); end if;
 update public.handoff_entries e set
  resolved=case p_action when 'completed' then true when 'reopened' then false else e.resolved end,
  carry_over=case when p_action='carry' then true else e.carry_over end,
  archived=case p_action when 'archived' then true when 'restored' then false else e.archived end,
  workflow_revision=e.workflow_revision+1
 where e.id=p_entry and e.organization_id=p_org returning * into v_entry;
 insert into public.handoff_activity(organization_id,entry_id,action,actor_user_id,actor_staff_id,actor_name,note,workflow_revision,request_id)
 values(p_org,p_entry,p_action,v_uid,v_staff,v_name,v_note,v_entry.workflow_revision,p_request_id) returning * into v_event;
 return jsonb_build_object('entry',to_jsonb(v_entry),'event_id',v_event.id,'already_applied',false);
end $function$
;
CREATE OR REPLACE FUNCTION private.handoff_workflow_audit_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.is_org_admin(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.role = 'admin'
  );
$function$
;
CREATE OR REPLACE FUNCTION private.is_org_member(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION private.meal_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION private.protect_assignment_immutable_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.service_date IS DISTINCT FROM OLD.service_date
     OR NEW.service_time IS DISTINCT FROM OLD.service_time
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'immutable_assignment_fields';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.rename_staff_canonical(p_org uuid, p_staff uuid, p_name text, p_expected_user uuid, p_expected_name text)
 RETURNS TABLE(id uuid, organization_id uuid, linked_user_id uuid, staff_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_staff public.organization_staff%rowtype; v_current text; v_name text; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_org is null or not private.is_org_admin(p_org) then raise exception 'admin_required'; end if;
  if not exists(select 1 from public.organizations o where o.id = p_org and o.is_active) then
    raise exception 'organization_inactive';
  end if;
  v_name := pg_catalog.btrim(pg_catalog.translate(coalesce(p_name,''),
    pg_catalog.chr(8203)||pg_catalog.chr(8204)||pg_catalog.chr(8205)||pg_catalog.chr(8288)||pg_catalog.chr(65279),''),
    E' \t\n\r'||pg_catalog.chr(12288));
  if not private.staff_name_registered(v_name) then raise exception 'invalid_staff_name'; end if;
  select s.* into v_staff from public.organization_staff s where s.id = p_staff and s.organization_id = p_org;
  if not found then raise exception 'staff_not_found'; end if;
  if v_staff.linked_user_id is distinct from p_expected_user then raise exception 'staff_identity_changed'; end if;
  if p_expected_user is not null then
    select m.staff_name into v_current from public.organization_members m
     where m.organization_id = p_org and m.user_id = p_expected_user for update;
    if not found then raise exception 'linked_member_missing'; end if;
  end if;
  select s.* into v_staff from public.organization_staff s
   where s.id = p_staff and s.organization_id = p_org for update;
  if not found then raise exception 'staff_not_found'; end if;
  if v_staff.linked_user_id is distinct from p_expected_user then raise exception 'staff_identity_changed'; end if;
  if p_expected_user is null then v_current := v_staff.staff_name; end if;
  if v_current is distinct from p_expected_name then raise exception 'staff_name_changed'; end if;
  if p_expected_user is null then
    update public.organization_staff s set staff_name = v_name, updated_at = pg_catalog.clock_timestamp()
     where s.id = p_staff and s.organization_id = p_org;
  else
    update public.organization_members m set staff_name = v_name
     where m.organization_id = p_org and m.user_id = p_expected_user;
  end if;
  return query select d.id, d.organization_id, d.linked_user_id, d.staff_name
    from public.organization_staff_directory d where d.id = p_staff and d.organization_id = p_org;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.staff_name_registered(p_name text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_name is not null and pg_catalog.char_length(pg_catalog.btrim(p_name)) between 1 and 80
    and pg_catalog.btrim(p_name) not in ('氏名未設定','職員名未登録','名前未登録','未登録','未設定');
$function$
;
CREATE OR REPLACE FUNCTION private.sync_member_staff_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_user uuid; v_name text; v_actor uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    v_org := old.organization_id; v_user := old.user_id; v_name := old.staff_name;
  else
    if new.staff_name is not distinct from old.staff_name then return new; end if;
    v_org := new.organization_id; v_user := new.user_id; v_name := new.staff_name;
  end if;
  -- NULL is possible for trusted DB maintenance; unauthenticated API writes remain denied by RLS.
  if v_actor is not null and v_actor <> v_user and not private.is_org_admin(v_org) then
    raise exception 'admin_required';
  end if;
  if private.staff_name_registered(v_name) then
    update public.organization_staff s
       set staff_name = v_name, updated_at = pg_catalog.clock_timestamp()
     where s.organization_id = v_org and s.linked_user_id = v_user
       and s.staff_name is distinct from v_name;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.handoff_set_confirmation(p_org uuid, p_entry uuid, p_confirmed boolean, p_expected_revision bigint, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select private.handoff_set_confirmation(p_org,p_entry,p_confirmed,p_expected_revision,p_request_id);
$function$
;
CREATE OR REPLACE FUNCTION public.handoff_transition(p_org uuid, p_entry uuid, p_action text, p_expected_revision bigint, p_request_id uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select private.handoff_transition(p_org,p_entry,p_action,p_expected_revision,p_request_id,p_note);
$function$
;
CREATE OR REPLACE FUNCTION public.list_organization_staff(p_org uuid)
 RETURNS TABLE(user_id uuid, email text, staff_name text, role text, joined_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_org is null or not private.is_org_admin(p_org) then
    raise exception 'admin_required';
  end if;

  return query
  select om.user_id, u.email::text, om.staff_name::text, om.role::text, om.created_at
  from public.organization_members om
  join auth.users u on u.id = om.user_id
  where om.organization_id = p_org
  order by case when om.role='admin' then 0 else 1 end,
           lower(coalesce(nullif(trim(om.staff_name),''),u.email,'')),
           om.created_at;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.meal_fill_month(p_org uuid, p_month date, p_client uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.remove_organization_staff(p_org uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_org is null or p_user_id is null then
    raise exception 'invalid_argument';
  end if;
  if not private.is_org_admin(p_org) then
    raise exception 'admin_required';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_remove_self';
  end if;

  select role into v_target_role
  from public.organization_members
  where organization_id=p_org and user_id=p_user_id;

  if v_target_role is null then
    raise exception 'staff_not_found';
  end if;
  if v_target_role='admin' then
    raise exception 'cannot_remove_admin';
  end if;

  delete from public.organization_members
  where organization_id=p_org and user_id=p_user_id;

  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_organization_member_role(p_org uuid, p_user_id uuid, p_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := lower(trim(coalesce(p_role,'')));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_org_admin(p_org) then
    raise exception 'admin_required';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_change_self_role';
  end if;
  if v_role not in ('admin','staff') then
    raise exception 'invalid_role';
  end if;

  update public.organization_members
  set role=v_role
  where organization_id=p_org and user_id=p_user_id;

  if not found then raise exception 'staff_not_found'; end if;
  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION meal_history.capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 insert into meal_history.changes(table_name,actor,previous,next_record) values(TG_TABLE_NAME,auth.uid(),case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $function$
;
revoke all on function private.canonicalize_linked_staff_name() from public,anon,authenticated;
revoke all on function private.handoff_initialize_entry() from public,anon,authenticated;
revoke all on function private.handoff_set_confirmation(p_org uuid, p_entry uuid, p_confirmed boolean, p_expected_revision bigint, p_request_id uuid) from public,anon,authenticated;
grant execute on function private.handoff_set_confirmation(p_org uuid, p_entry uuid, p_confirmed boolean, p_expected_revision bigint, p_request_id uuid) to authenticated;
revoke all on function private.handoff_transition(p_org uuid, p_entry uuid, p_action text, p_expected_revision bigint, p_request_id uuid, p_note text) from public,anon,authenticated;
grant execute on function private.handoff_transition(p_org uuid, p_entry uuid, p_action text, p_expected_revision bigint, p_request_id uuid, p_note text) to authenticated;
revoke all on function private.is_org_admin(p_org uuid) from public,anon,authenticated;
grant execute on function private.is_org_admin(p_org uuid) to authenticated;
revoke all on function private.is_org_member(p_org uuid) from public,anon,authenticated;
grant execute on function private.is_org_member(p_org uuid) to authenticated;
revoke all on function private.meal_validate() from public,anon,authenticated;
revoke all on function private.rename_staff_canonical(p_org uuid, p_staff uuid, p_name text, p_expected_user uuid, p_expected_name text) from public,anon,authenticated;
grant execute on function private.rename_staff_canonical(p_org uuid, p_staff uuid, p_name text, p_expected_user uuid, p_expected_name text) to authenticated;
revoke all on function private.staff_name_registered(p_name text) from public,anon,authenticated;
revoke all on function private.sync_member_staff_name() from public,anon,authenticated;
revoke all on function public.handoff_set_confirmation(p_org uuid, p_entry uuid, p_confirmed boolean, p_expected_revision bigint, p_request_id uuid) from public,anon,authenticated;
grant execute on function public.handoff_set_confirmation(p_org uuid, p_entry uuid, p_confirmed boolean, p_expected_revision bigint, p_request_id uuid) to authenticated;
revoke all on function public.handoff_transition(p_org uuid, p_entry uuid, p_action text, p_expected_revision bigint, p_request_id uuid, p_note text) from public,anon,authenticated;
grant execute on function public.handoff_transition(p_org uuid, p_entry uuid, p_action text, p_expected_revision bigint, p_request_id uuid, p_note text) to authenticated;
revoke all on function public.list_organization_staff(p_org uuid) from public,anon,authenticated;
grant execute on function public.list_organization_staff(p_org uuid) to authenticated;
revoke all on function public.meal_fill_month(p_org uuid, p_month date, p_client uuid) from public,anon,authenticated;
grant execute on function public.meal_fill_month(p_org uuid, p_month date, p_client uuid) to authenticated;
revoke all on function public.remove_organization_staff(p_org uuid, p_user_id uuid) from public,anon,authenticated;
grant execute on function public.remove_organization_staff(p_org uuid, p_user_id uuid) to authenticated;
revoke all on function public.set_organization_member_role(p_org uuid, p_user_id uuid, p_role text) from public,anon,authenticated;
grant execute on function public.set_organization_member_role(p_org uuid, p_user_id uuid, p_role text) to authenticated;
alter table public."care_records" enable row level security;
alter table public."client_service_slots" enable row level security;
alter table public."clients" enable row level security;
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
alter table public."handoff_activity" enable row level security;
alter table public."handoff_confirmations" enable row level security;
alter table public."handoff_entries" enable row level security;
CREATE TRIGGER handoff_initialize_entry BEFORE INSERT ON public.handoff_entries FOR EACH ROW EXECUTE FUNCTION private.handoff_initialize_entry();
CREATE TRIGGER handoff_workflow_audit_stamp BEFORE UPDATE ON public.handoff_entries FOR EACH ROW EXECUTE FUNCTION private.handoff_workflow_audit_stamp();
alter table public."handoff_quick_inputs" enable row level security;
alter table public."meal_entries" enable row level security;
CREATE TRIGGER meal_audit AFTER INSERT OR UPDATE ON public.meal_entries FOR EACH ROW EXECUTE FUNCTION meal_history.capture();
CREATE TRIGGER meal_validate BEFORE INSERT OR UPDATE ON public.meal_entries FOR EACH ROW EXECUTE FUNCTION private.meal_validate();
alter table public."meal_prices" enable row level security;
CREATE TRIGGER meal_audit AFTER INSERT OR UPDATE ON public.meal_prices FOR EACH ROW EXECUTE FUNCTION meal_history.capture();
CREATE TRIGGER meal_validate BEFORE INSERT OR UPDATE ON public.meal_prices FOR EACH ROW EXECUTE FUNCTION private.meal_validate();
alter table public."meal_profiles" enable row level security;
CREATE TRIGGER meal_audit AFTER INSERT OR UPDATE ON public.meal_profiles FOR EACH ROW EXECUTE FUNCTION meal_history.capture();
CREATE TRIGGER meal_validate BEFORE INSERT OR UPDATE ON public.meal_profiles FOR EACH ROW EXECUTE FUNCTION private.meal_validate();
alter table public."organization_members" enable row level security;
CREATE TRIGGER member_staff_name_before_unlink BEFORE DELETE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION private.sync_member_staff_name();
CREATE TRIGGER member_staff_name_updated AFTER UPDATE OF staff_name ON public.organization_members FOR EACH ROW EXECUTE FUNCTION private.sync_member_staff_name();
alter table public."organization_staff" enable row level security;
CREATE TRIGGER staff_canonical_name BEFORE INSERT OR UPDATE OF staff_name, linked_user_id ON public.organization_staff FOR EACH ROW EXECUTE FUNCTION private.canonicalize_linked_staff_name();
alter table public."organizations" enable row level security;
alter table public."staff_assignments" enable row level security;
CREATE TRIGGER protect_assignment_immutable_fields BEFORE UPDATE ON public.staff_assignments FOR EACH ROW EXECUTE FUNCTION private.protect_assignment_immutable_fields();
grant INSERT on public."care_records" to "authenticated";
grant SELECT on public."care_records" to "authenticated";
grant INSERT on public."client_service_slots" to "authenticated";
grant SELECT on public."client_service_slots" to "authenticated";
grant UPDATE on public."client_service_slots" to "authenticated";
grant DELETE on public."client_service_slots" to "authenticated";
grant MAINTAIN on public."client_service_slots" to "authenticated";
grant INSERT on public."clients" to "authenticated";
grant SELECT on public."clients" to "authenticated";
grant UPDATE on public."clients" to "authenticated";
grant DELETE on public."clients" to "authenticated";
grant SELECT on public."handoff_activity" to "authenticated";
grant SELECT on public."handoff_confirmations" to "authenticated";
grant MAINTAIN on public."handoff_confirmations" to "authenticated";
grant INSERT on public."handoff_entries" to "authenticated";
grant SELECT on public."handoff_entries" to "authenticated";
grant MAINTAIN on public."handoff_entries" to "authenticated";
grant INSERT on public."handoff_quick_inputs" to "authenticated";
grant SELECT on public."handoff_quick_inputs" to "authenticated";
grant DELETE on public."handoff_quick_inputs" to "authenticated";
grant MAINTAIN on public."handoff_quick_inputs" to "authenticated";
grant INSERT on public."meal_entries" to "authenticated";
grant SELECT on public."meal_entries" to "authenticated";
grant UPDATE on public."meal_entries" to "authenticated";
grant INSERT on public."meal_prices" to "authenticated";
grant SELECT on public."meal_prices" to "authenticated";
grant UPDATE on public."meal_prices" to "authenticated";
grant INSERT on public."meal_profiles" to "authenticated";
grant SELECT on public."meal_profiles" to "authenticated";
grant UPDATE on public."meal_profiles" to "authenticated";
grant SELECT on public."organization_members" to "authenticated";
grant INSERT on public."organization_staff" to "authenticated";
grant SELECT on public."organization_staff" to "authenticated";
grant UPDATE on public."organization_staff" to "authenticated";
grant DELETE on public."organization_staff" to "authenticated";
grant SELECT on public."organizations" to "authenticated";
grant INSERT on public."staff_assignments" to "authenticated";
grant SELECT on public."staff_assignments" to "authenticated";
grant UPDATE on public."staff_assignments" to "authenticated";
grant DELETE on public."staff_assignments" to "authenticated";
grant MAINTAIN on public."staff_assignments" to "authenticated";
grant UPDATE("staff_name") on public."organization_members" to "authenticated";
grant UPDATE("display_name") on public."clients" to "authenticated";
create policy "records_insert_member" on public."care_records" as PERMISSIVE for INSERT to authenticated with check ((private.is_org_member(organization_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = care_records.client_id) AND (c.organization_id = care_records.organization_id)))) AND ((assignment_id IS NULL) OR (EXISTS ( SELECT 1
   FROM staff_assignments a
  WHERE ((a.id = care_records.assignment_id) AND (a.organization_id = care_records.organization_id) AND (a.client_id = care_records.client_id) AND ((care_records.service_date IS NULL) OR (a.service_date = care_records.service_date)) AND ((care_records.service_time IS NULL) OR (a.service_time = care_records.service_time))))))));
create policy "records_select_member" on public."care_records" as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy "slots_delete_admin" on public."client_service_slots" as PERMISSIVE for DELETE to authenticated using (private.is_org_admin(organization_id));
create policy "slots_insert_admin" on public."client_service_slots" as PERMISSIVE for INSERT to authenticated with check ((private.is_org_admin(organization_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_service_slots.client_id) AND (c.organization_id = client_service_slots.organization_id) AND (c.is_active = true))))));
create policy "slots_select_member" on public."client_service_slots" as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy "slots_update_admin" on public."client_service_slots" as PERMISSIVE for UPDATE to authenticated using (private.is_org_admin(organization_id)) with check ((private.is_org_admin(organization_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_service_slots.client_id) AND (c.organization_id = client_service_slots.organization_id) AND (c.is_active = true))))));
create policy "clients_delete_admin" on public."clients" as PERMISSIVE for DELETE to authenticated using (private.is_org_admin(organization_id));
create policy "clients_insert_admin" on public."clients" as PERMISSIVE for INSERT to authenticated with check (private.is_org_admin(organization_id));
create policy "clients_select_member" on public."clients" as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy "clients_update_admin" on public."clients" as PERMISSIVE for UPDATE to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy "handoff_activity_read_member" on public."handoff_activity" as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy "handoff_confirmations_delete_self" on public."handoff_confirmations" as PERMISSIVE for DELETE to authenticated using (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM handoff_entries e
  WHERE ((e.id = handoff_confirmations.entry_id) AND private.is_org_member(e.organization_id))))));
create policy "handoff_confirmations_insert_self" on public."handoff_confirmations" as PERMISSIVE for INSERT to authenticated with check (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM handoff_entries e
  WHERE ((e.id = handoff_confirmations.entry_id) AND private.is_org_member(e.organization_id))))));
create policy "handoff_confirmations_select_member" on public."handoff_confirmations" as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM handoff_entries e
  WHERE ((e.id = handoff_confirmations.entry_id) AND private.is_org_member(e.organization_id)))));
create policy "handoff_entries_delete_member" on public."handoff_entries" as PERMISSIVE for DELETE to authenticated using ((private.is_org_admin(organization_id) OR (( SELECT auth.uid() AS uid) = created_by)));
create policy "handoff_entries_insert_member" on public."handoff_entries" as PERMISSIVE for INSERT to authenticated with check (((( SELECT auth.uid() AS uid) = created_by) AND private.is_org_member(organization_id) AND (((scope = 'general'::text) AND (client_id IS NULL)) OR ((scope = 'client'::text) AND (client_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = handoff_entries.client_id) AND (c.organization_id = handoff_entries.organization_id))))))));
create policy "handoff_entries_select_member" on public."handoff_entries" as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy "handoff_entries_update_member" on public."handoff_entries" as PERMISSIVE for UPDATE to authenticated using (private.is_org_member(organization_id)) with check ((private.is_org_member(organization_id) AND (((scope = 'general'::text) AND (client_id IS NULL)) OR ((scope = 'client'::text) AND (client_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = handoff_entries.client_id) AND (c.organization_id = handoff_entries.organization_id))))))));
create policy "handoff_quick_inputs_delete_admin" on public."handoff_quick_inputs" as PERMISSIVE for DELETE to authenticated using (private.is_org_admin(organization_id));
create policy "handoff_quick_inputs_insert_admin" on public."handoff_quick_inputs" as PERMISSIVE for INSERT to authenticated with check (private.is_org_admin(organization_id));
create policy "handoff_quick_inputs_select_member" on public."handoff_quick_inputs" as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy "meal_insert" on public."meal_entries" as PERMISSIVE for INSERT to authenticated with check ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_entries.organization_id) AND o.is_active)))));
create policy "meal_read" on public."meal_entries" as PERMISSIVE for SELECT to authenticated using ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_entries.organization_id) AND o.is_active)))));
create policy "meal_update" on public."meal_entries" as PERMISSIVE for UPDATE to authenticated using ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_entries.organization_id) AND o.is_active))))) with check ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_entries.organization_id) AND o.is_active)))));
create policy "meal_insert" on public."meal_prices" as PERMISSIVE for INSERT to authenticated with check ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_prices.organization_id) AND o.is_active))) AND private.is_org_admin(organization_id)));
create policy "meal_read" on public."meal_prices" as PERMISSIVE for SELECT to authenticated using ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_prices.organization_id) AND o.is_active)))));
create policy "meal_update" on public."meal_prices" as PERMISSIVE for UPDATE to authenticated using ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_prices.organization_id) AND o.is_active))) AND private.is_org_admin(organization_id))) with check ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_prices.organization_id) AND o.is_active))) AND private.is_org_admin(organization_id)));
create policy "meal_insert" on public."meal_profiles" as PERMISSIVE for INSERT to authenticated with check ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_profiles.organization_id) AND o.is_active))) AND private.is_org_admin(organization_id)));
create policy "meal_read" on public."meal_profiles" as PERMISSIVE for SELECT to authenticated using ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_profiles.organization_id) AND o.is_active)))));
create policy "meal_update" on public."meal_profiles" as PERMISSIVE for UPDATE to authenticated using ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_profiles.organization_id) AND o.is_active))) AND private.is_org_admin(organization_id))) with check ((private.is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = meal_profiles.organization_id) AND o.is_active))) AND private.is_org_admin(organization_id)));
create policy "members update own staff name" on public."organization_members" as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check (((( SELECT auth.uid() AS uid) = user_id) AND private.is_org_member(organization_id)));
create policy "members_select_same_org" on public."organization_members" as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy "organization_staff_delete_admin" on public."organization_staff" as PERMISSIVE for DELETE to authenticated using (private.is_org_admin(organization_id));
create policy "organization_staff_insert_admin" on public."organization_staff" as PERMISSIVE for INSERT to authenticated with check ((private.is_org_admin(organization_id) AND (created_by = ( SELECT auth.uid() AS uid))));
create policy "organization_staff_select_member" on public."organization_staff" as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy "organization_staff_update_admin" on public."organization_staff" as PERMISSIVE for UPDATE to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy "org_select_member" on public."organizations" as PERMISSIVE for SELECT to authenticated using (private.is_org_member(id));
create policy "assignments_delete_member" on public."staff_assignments" as PERMISSIVE for DELETE to authenticated using (private.is_org_member(organization_id));
create policy "assignments_insert_member" on public."staff_assignments" as PERMISSIVE for INSERT to authenticated with check ((private.is_org_member(organization_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND (updated_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = staff_assignments.client_id) AND (c.organization_id = staff_assignments.organization_id) AND (c.is_active = true)))) AND ((assigned_user_id IS NULL) OR (EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = staff_assignments.organization_id) AND (m.user_id = staff_assignments.assigned_user_id))))) AND ((assigned_staff_id IS NULL) OR (EXISTS ( SELECT 1
   FROM organization_staff s
  WHERE ((s.id = staff_assignments.assigned_staff_id) AND (s.organization_id = staff_assignments.organization_id) AND (s.is_active = true)))))));
create policy "assignments_select_member" on public."staff_assignments" as PERMISSIVE for SELECT to authenticated using (private.is_org_member(organization_id));
create policy "assignments_update_member" on public."staff_assignments" as PERMISSIVE for UPDATE to authenticated using (private.is_org_member(organization_id)) with check ((private.is_org_member(organization_id) AND (updated_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = staff_assignments.client_id) AND (c.organization_id = staff_assignments.organization_id) AND (c.is_active = true)))) AND ((assigned_user_id IS NULL) OR (EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = staff_assignments.organization_id) AND (m.user_id = staff_assignments.assigned_user_id))))) AND ((assigned_staff_id IS NULL) OR (EXISTS ( SELECT 1
   FROM organization_staff s
  WHERE ((s.id = staff_assignments.assigned_staff_id) AND (s.organization_id = staff_assignments.organization_id) AND (s.is_active = true)))))));
