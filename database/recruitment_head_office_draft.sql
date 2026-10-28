-- REVIEW DRAFT ONLY. DO NOT EXECUTE IN PRODUCTION WITHOUT EXPLICIT APPROVAL.
-- BROOK headquarters recruitment authorization, independent of care-record admin roles.
-- The initial admin must be assigned manually after verifying auth.users identity.
create extension if not exists pgcrypto;

create table public.recruitment_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.recruitment_departments (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (length(trim(name)) between 1 and 100),
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.recruitment_jobs (
 id uuid primary key default gen_random_uuid(),
 department_id uuid not null references public.recruitment_departments(id),
 title text not null check (length(trim(title)) between 1 and 160),
 employment_type text,
 location_text text,
 description text,
 is_published boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.recruitment_applicants (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.recruitment_jobs(id),
 full_name text not null check (length(trim(full_name)) between 1 and 160),
 email text,
 phone text,
 status text not null default 'new'
   check (status in ('new','contacted','interview','offered','hired','rejected','withdrawn')),
 source text,
 created_at timestamptz not null default now()
);
create table public.recruitment_school_contacts (
 id uuid primary key default gen_random_uuid(),
 school_name text not null,
 contact_name text,
 contact_email text,
 last_sent_at timestamptz,
 reply_status text not null default 'not_sent',
 notes text,
 created_at timestamptz not null default now()
);
create index recruitment_jobs_department_idx on public.recruitment_jobs(department_id);
create index recruitment_applicants_job_idx on public.recruitment_applicants(job_id,created_at desc);

alter table public.recruitment_admins enable row level security;
alter table public.recruitment_departments enable row level security;
alter table public.recruitment_jobs enable row level security;
alter table public.recruitment_applicants enable row level security;
alter table public.recruitment_school_contacts enable row level security;

-- Users may only read their own membership row; nobody may self-grant access.
create policy recruitment_admins_self_read on public.recruitment_admins
 for select to authenticated using (user_id=(select auth.uid()));
grant select on public.recruitment_admins to authenticated;
revoke all on public.recruitment_admins from anon;

-- All other recruitment data requires active headquarters membership.
create policy recruitment_departments_staff on public.recruitment_departments
 for all to authenticated
 using (exists(select 1 from public.recruitment_admins a where a.user_id=(select auth.uid()) and a.is_active))
 with check (exists(select 1 from public.recruitment_admins a where a.user_id=(select auth.uid()) and a.is_active));
create policy recruitment_jobs_staff on public.recruitment_jobs
 for all to authenticated
 using (exists(select 1 from public.recruitment_admins a where a.user_id=(select auth.uid()) and a.is_active))
 with check (exists(select 1 from public.recruitment_admins a where a.user_id=(select auth.uid()) and a.is_active));
create policy recruitment_applicants_staff on public.recruitment_applicants
 for all to authenticated
 using (exists(select 1 from public.recruitment_admins a where a.user_id=(select auth.uid()) and a.is_active))
 with check (exists(select 1 from public.recruitment_admins a where a.user_id=(select auth.uid()) and a.is_active));
create policy recruitment_school_contacts_staff on public.recruitment_school_contacts
 for all to authenticated
 using (exists(select 1 from public.recruitment_admins a where a.user_id=(select auth.uid()) and a.is_active))
 with check (exists(select 1 from public.recruitment_admins a where a.user_id=(select auth.uid()) and a.is_active));

grant select,insert,update,delete on public.recruitment_departments, public.recruitment_jobs,
 public.recruitment_applicants, public.recruitment_school_contacts to authenticated;
revoke all on public.recruitment_departments, public.recruitment_jobs,
 public.recruitment_applicants, public.recruitment_school_contacts from anon;

-- No anonymous application submission in this migration.
-- TODO before production: server-side anti-spam intake, data retention/deletion,
-- audit log, grants review, explicit bootstrap administrator, end-to-end RLS tests.
