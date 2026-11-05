-- MANUAL TEST ONLY: requires explicit production-test approval; never run automatically.
-- Validated on a local fixture, then on production with user approval on 2026-11-05.
-- All writes occur in a subtransaction that is deliberately rolled back.
-- Successful execution: applicant persistence/idempotency, HQ visibility, non-HQ isolation,
-- anonymous denial, and exact restoration of settings/jobs and counts all passed.
-- Separate post-check: applicants=0, receipts=0, public_jobs=0; release remains false.
-- Does not test the full browser form-to-inbox flow.
DO $test$
DECLARE
 admin_id uuid; staff_id uuid; job_id uuid; request_id uuid:=gen_random_uuid(); receipt uuid; again uuid;
 payload jsonb; state_before jsonb; state_after jsonb; checked boolean:=false;
BEGIN
 IF EXISTS(SELECT 1 FROM public.recruitment_settings WHERE release_enabled) OR EXISTS(SELECT 1 FROM public.recruitment_jobs WHERE is_published) OR EXISTS(SELECT 1 FROM public.recruitment_applicants) THEN
  RAISE EXCEPTION 'Precondition changed; test stopped';
 END IF;
 SELECT user_id INTO STRICT admin_id FROM public.recruitment_admins WHERE is_active;
 SELECT u.id INTO staff_id FROM auth.users u WHERE NOT EXISTS(SELECT 1 FROM public.recruitment_admins a WHERE a.user_id=u.id AND a.is_active) LIMIT 1;
 IF staff_id IS NULL THEN RAISE EXCEPTION 'No non-HQ account available; test stopped'; END IF;
 SELECT j.id INTO STRICT job_id FROM public.recruitment_jobs j JOIN public.recruitment_locations l ON l.id=j.location_id WHERE l.code='sakai';
 SELECT jsonb_build_object(
 'settings',(SELECT jsonb_agg(to_jsonb(s)) FROM public.recruitment_settings s),
 'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.recruitment_jobs j),
 'applicants',(SELECT count(*) FROM public.recruitment_applicants),
 'receipts',(SELECT count(*) FROM recruitment_private.receipts),
 'audit',(SELECT count(*) FROM public.recruitment_audit_logs)) INTO state_before;
 BEGIN
  UPDATE public.recruitment_settings SET release_enabled=true WHERE id;
  UPDATE public.recruitment_jobs SET is_published=true WHERE id=job_id;
  SELECT jsonb_build_object('request_id',request_id,'job_id',job_id,'full_name','BROOK内部接続テスト（架空）','email','brook-check@example.invalid','phone','','qualifications','テスト','message','保存・権限確認後に全変更を取り消すテスト','consent',true,'privacy_version',privacy_version) INTO payload FROM public.recruitment_settings WHERE id;
  PERFORM set_config('role','service_role',true);
  receipt:=public.recruitment_receive(payload,repeat('a',64),repeat('b',64));
  again:=public.recruitment_receive(payload,repeat('a',64),repeat('b',64));
  IF receipt IS NULL OR receipt<>again OR (SELECT count(*) FROM public.recruitment_applicants)<>1 THEN RAISE EXCEPTION 'Persistence/idempotency failed'; END IF;
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  IF NOT EXISTS(SELECT 1 FROM public.recruitment_applicants WHERE id=receipt AND full_name=payload->>'full_name' AND status='new' AND terms_snapshot->>'location'='COZY堺' AND expires_at>created_at) THEN RAISE EXCEPTION 'HQ visibility/snapshot failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',staff_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated')::text,true);
  IF EXISTS(SELECT 1 FROM public.recruitment_applicants) THEN RAISE EXCEPTION 'Non-HQ visibility failed'; END IF;
  IF has_table_privilege('anon','public.recruitment_applicants','SELECT') OR has_function_privilege('anon','public.recruitment_receive(jsonb,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.recruitment_receive(jsonb,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Public privileges failed'; END IF;
  -- This deliberate exception rolls back every write above, including audit/revisions.
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback successful test';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN checked:=true;
 END;
 IF NOT checked THEN RAISE EXCEPTION 'Test did not complete'; END IF;
 SELECT jsonb_build_object(
 'settings',(SELECT jsonb_agg(to_jsonb(s)) FROM public.recruitment_settings s),
 'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.recruitment_jobs j),
 'applicants',(SELECT count(*) FROM public.recruitment_applicants),
 'receipts',(SELECT count(*) FROM recruitment_private.receipts),
 'audit',(SELECT count(*) FROM public.recruitment_audit_logs)) INTO state_after;
 IF state_before IS DISTINCT FROM state_after THEN RAISE EXCEPTION 'Rollback verification failed'; END IF;
END $test$;
SELECT 'passed: persistence, idempotency, HQ read, non-HQ isolation, anonymous denial, full rollback' AS verification,
 (SELECT count(*) FROM public.recruitment_applicants) AS applicants,
 (SELECT count(*) FROM public.recruitment_jobs WHERE is_published) AS published_jobs,
 (SELECT bool_or(release_enabled) FROM public.recruitment_settings) AS release_enabled;