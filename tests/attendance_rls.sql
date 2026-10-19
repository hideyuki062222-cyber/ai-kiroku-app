-- Run inside a transaction with attendance_setup.sql, then ROLLBACK.
create temp table attendance_test_ids as
select m.organization_id org, max(m.user_id::text) filter(where m.role='admin')::uuid admin,
 (array_agg(m.user_id order by m.user_id) filter(where m.role='staff'))[1] a,
 (array_agg(m.user_id order by m.user_id) filter(where m.role='staff'))[2] b
from public.organization_members m group by m.organization_id having count(*) filter(where m.role='staff')>=2 and count(*) filter(where m.role='admin')>0 limit 1;
alter table attendance_test_ids add column staff_a uuid;
alter table attendance_test_ids add column staff_b uuid;
update attendance_test_ids t set staff_a=(select s.id from public.organization_staff s where s.organization_id=t.org and s.linked_user_id=t.a),staff_b=(select s.id from public.organization_staff s where s.organization_id=t.org and s.linked_user_id=t.b);
grant select on attendance_test_ids to authenticated,anon;
create function pg_temp.assert_attendance(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',message;end if;end$$;
select pg_temp.assert_attendance((select count(*)=1 from attendance_test_ids),'Need two staff and an admin');
select set_config('request.jwt.claim.sub',(select admin::text from attendance_test_ids),true);
set local role authenticated;
insert into public.attendance_months(organization_id,staff_id,period,rows)
select t.org,s.staff_id,date '2099-01-01',(select jsonb_agg(jsonb_build_object('t','','s',null,'e',null,'b',0,'g','','h','','night','')) from generate_series(1,31))
from attendance_test_ids t cross join lateral(values(t.staff_a),(t.staff_b))s(staff_id);
select pg_temp.assert_attendance((select count(*)=2 from public.attendance_months),'Admin reads both');
select set_config('request.jwt.claim.sub',(select a::text from attendance_test_ids),true);
select pg_temp.assert_attendance((select count(*)=1 from public.attendance_months),'Staff reads only self');
update public.attendance_months set memo='own test' where staff_id=(select staff_a from attendance_test_ids);
select pg_temp.assert_attendance((select memo='own test' and revision=2 from public.attendance_months),'Own save and revision');
do $$declare n integer;begin update public.attendance_months set memo='forbidden' where staff_id=(select staff_b from attendance_test_ids);get diagnostics n=row_count;if n<>0 then raise exception 'Other staff update allowed';end if;end$$;
do $$begin
 begin insert into public.attendance_months(organization_id,staff_id,period,rows) select org,staff_b,date '2099-02-01',(select rows from public.attendance_months limit 1) from attendance_test_ids;raise exception 'Other staff insert allowed';exception when insufficient_privilege then null;end;
 begin update public.attendance_months set staff_id=(select staff_b from attendance_test_ids);raise exception 'Identity reassignment allowed';exception when raise_exception then if SQLERRM='Identity reassignment allowed' then raise;end if;end;
 begin update public.organization_members set role='admin' where user_id=(select a from attendance_test_ids);raise exception 'Privilege escalation allowed';exception when insufficient_privilege then null;end;
end$$;
do $$declare n integer;begin update public.organization_staff set linked_user_id=(select a from attendance_test_ids) where id=(select staff_b from attendance_test_ids);get diagnostics n=row_count;if n<>0 then raise exception 'Self-linking allowed';end if;end$$;
-- Stale revision must update zero rows.
do $$declare n integer;begin update public.attendance_months set memo='stale' where revision=1;get diagnostics n=row_count;if n<>0 then raise exception 'Stale write allowed';end if;end$$;
reset role;
update public.organization_staff set is_active=false where id=(select staff_a from attendance_test_ids);
set local role authenticated;
select pg_temp.assert_attendance((select count(*)=0 from public.attendance_months),'Stopped staff blocked');
reset role;
update public.organization_staff set is_active=true where id=(select staff_a from attendance_test_ids);
delete from public.organization_members where organization_id=(select org from attendance_test_ids) and user_id=(select a from attendance_test_ids);
select pg_temp.assert_attendance((select linked_user_id is null from public.organization_staff where id=(select staff_a from attendance_test_ids)),'Member removal preserves staff and clears login');
set local role authenticated;
select pg_temp.assert_attendance((select count(*)=0 from public.attendance_months),'Revoked membership blocked');
reset role;
select set_config('request.jwt.claim.sub',coalesce((select user_id::text from public.organization_members where organization_id<>(select org from attendance_test_ids) and user_id not in(select user_id from public.organization_members where organization_id=(select org from attendance_test_ids)) limit 1),gen_random_uuid()::text),true);
set local role authenticated;
select pg_temp.assert_attendance((select count(*)=0 from public.attendance_months),'Other organization blocked');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$begin begin perform * from public.attendance_months;raise exception 'Anonymous access allowed';exception when insufficient_privilege then null;end;end$$;
reset role;
select pg_temp.assert_attendance((select count(*)=3 from attendance_backup.month_revisions),'Recovery audit retains revisions');
select 'PASS: admin, self, other staff, other org, anonymous, inactive, link tamper, revision conflict, audit' as attendance_tests;
