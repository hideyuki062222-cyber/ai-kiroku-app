-- READ-ONLY preflight. Safe to run before any recruitment migration.
-- Expected before migration: recruitment_tables=0.
select count(*) as recruitment_tables
from information_schema.tables
where table_schema='public' and table_name like 'recruitment_%';

-- Verify the existing identity table exists; do not expose member rows.
select
 exists(select 1 from information_schema.tables where table_schema='public' and table_name='organization_members') as existing_membership_table,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='organization_members' and column_name='user_id' and data_type='uuid') as membership_user_uuid,
 exists(select 1 from information_schema.tables where table_schema='public' and table_name='organizations') as existing_organizations_table;

-- Run the next checks ONLY after an approved migration has been applied in a test project:
-- select c.relname, c.relrowsecurity from pg_class c
-- join pg_namespace n on n.oid=c.relnamespace
-- where n.nspname='public' and c.relname like 'recruitment_%';
-- select tablename, policyname, cmd, roles from pg_policies
-- where schemaname='public' and tablename like 'recruitment_%';
-- select table_name, grantee, privilege_type from information_schema.role_table_grants
-- where table_schema='public' and table_name like 'recruitment_%'
-- order by table_name,grantee,privilege_type;
