-- NOT APPLIED. Run only after explicit production approval and recruitment schema setup.
-- This grants recruitment access only; it does not change existing app roles or Auth.
BEGIN;
DO $setup$
DECLARE target_id uuid; account_count integer;
BEGIN
 IF to_regclass('public.recruitment_admins') IS NULL THEN
  RAISE EXCEPTION 'Recruitment schema must be reviewed and installed first';
 END IF;
 SELECT count(*), (array_agg(id))[1] INTO account_count,target_id
 FROM auth.users WHERE lower(email)='brook.nishimoto@gmail.com' AND email_confirmed_at IS NOT NULL;
 IF account_count <> 1 THEN RAISE EXCEPTION 'Expected exactly one confirmed administrator account'; END IF;
 IF EXISTS(SELECT 1 FROM public.recruitment_admins WHERE user_id<>target_id AND is_active) THEN
  RAISE EXCEPTION 'Unexpected existing recruitment administrator; review without changing their access';
 END IF;
 INSERT INTO public.recruitment_admins(user_id,is_active) VALUES(target_id,true)
 ON CONFLICT(user_id) DO UPDATE SET is_active=true;
 IF (SELECT count(*) FROM public.recruitment_admins WHERE is_active) <> 1 THEN
  RAISE EXCEPTION 'Expected exactly one active recruitment administrator';
 END IF;
END
$setup$;
COMMIT;
