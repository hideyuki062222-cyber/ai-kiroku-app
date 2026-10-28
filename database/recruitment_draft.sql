-- DRAFT ONLY: do not apply to production without review and backup.
-- Separate recruitment tables; no access to clients or care_records.
create extension if not exists pgcrypto;
create table if not exists public.recruitment_jobs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 title text not null check (char_length(title) between 1 and 160),
 location_text text,
 employment_type text not null default 'full_time',
 description text,
 published boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.recruitment_applicants (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 job_id uuid references public.recruitment_jobs(id),
 full_name text not null,
 email text,
 phone text,
 source text,
 status text not null default 'new' check (status in ('new','contacted','interview','offered','hired','rejected')),
 created_at timestamptz not null default now()
);
create index if not exists recruitment_jobs_org_idx on public.recruitment_jobs(organization_id);
create index if not exists recruitment_applicants_org_idx on public.recruitment_applicants(organization_id,created_at desc);
alter table public.recruitment_jobs enable row level security;
alter table public.recruitment_applicants enable row level security;
-- Only logged-in organization admins can access records.
-- No public applicant INSERT policy: intake must be implemented through a validated,
-- rate-limited server endpoint, never direct anonymous table writes.
create policy recruitment_jobs_admin_all on public.recruitment_jobs
 for all to authenticated
 using (exists(select 1 from public.organization_members m where m.organization_id=recruitment_jobs.organization_id and m.user_id=(select auth.uid()) and m.role='admin'))
 with check (exists(select 1 from public.organization_members m where m.organization_id=recruitment_jobs.organization_id and m.user_id=(select auth.uid()) and m.role='admin'));
create policy recruitment_applicants_admin_all on public.recruitment_applicants
 for all to authenticated
 using (exists(select 1 from public.organization_members m where m.organization_id=recruitment_applicants.organization_id and m.user_id=(select auth.uid()) and m.role='admin'))
 with check (exists(select 1 from public.organization_members m where m.organization_id=recruitment_applicants.organization_id and m.user_id=(select auth.uid()) and m.role='admin'));
-- TODO: confirm cross-org job_id consistency, retention, spam controls,
-- access grants, admin memberships, backups and privacy notice before migration.
