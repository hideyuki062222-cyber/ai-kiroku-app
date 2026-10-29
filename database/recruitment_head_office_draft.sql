-- REVIEWED DEVELOPMENT DRAFT: apply only after verified backup and explicit approval.
-- Replaces both earlier recruitment drafts. Do not run them together.
-- Additive only: no existing app table, role, auth setting or policy is modified.
BEGIN;
CREATE SCHEMA recruitment_private;
REVOKE ALL ON SCHEMA recruitment_private FROM PUBLIC;
GRANT USAGE ON SCHEMA recruitment_private TO authenticated,service_role;
CREATE TABLE public.recruitment_admins (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.recruitment_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), release_enabled boolean NOT NULL DEFAULT false,
 privacy_text text NOT NULL DEFAULT '' CHECK(length(privacy_text)<=10000),
 contact_text text NOT NULL DEFAULT '' CHECK(length(contact_text)<=1000),
 retention_days integer CHECK(retention_days BETWEEN 1 AND 3650),
 privacy_version text NOT NULL DEFAULT 'draft-1', revision integer NOT NULL DEFAULT 1
);
CREATE TABLE public.recruitment_locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE CHECK(code IN ('gamo','toyonaka','sakai')),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),address text NOT NULL DEFAULT '' CHECK(length(address)<=1000),access text NOT NULL DEFAULT '' CHECK(length(access)<=2000),
 is_active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1
);
CREATE FUNCTION recruitment_private.valid_terms(v jsonb, partial boolean) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_typeof(v)='object' AND NOT EXISTS (
  SELECT 1 FROM jsonb_each(v) e WHERE e.key NOT IN ('title','employment_type','salary','hours','duties','requirements','benefits','holidays')
   OR jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>5000
 ) AND (partial OR v ?& ARRAY['title','employment_type','salary','hours','duties','requirements','benefits','holidays']);
$$;
CREATE TABLE public.recruitment_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),terms jsonb NOT NULL CHECK(recruitment_private.valid_terms(terms,false)),revision integer NOT NULL DEFAULT 1
);
CREATE TABLE public.recruitment_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),location_id uuid NOT NULL REFERENCES public.recruitment_locations(id),
 template_id uuid NOT NULL REFERENCES public.recruitment_templates(id),overrides jsonb NOT NULL DEFAULT '{}' CHECK(recruitment_private.valid_terms(overrides,true)),
 is_published boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1,UNIQUE(location_id,template_id)
);
CREATE INDEX recruitment_jobs_template_idx ON public.recruitment_jobs(template_id);
CREATE TABLE public.recruitment_applicants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES public.recruitment_jobs(id),
 full_name text NOT NULL CHECK(length(btrim(full_name)) BETWEEN 1 AND 160),
 email text NOT NULL DEFAULT '' CHECK(length(email)<=254),phone text NOT NULL DEFAULT '' CHECK(length(phone)<=30),
 qualifications text NOT NULL DEFAULT '' CHECK(length(qualifications)<=500),message text NOT NULL DEFAULT '' CHECK(length(message)<=2000),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','interview','offered','hired','rejected','withdrawn')),
 internal_notes text NOT NULL DEFAULT '' CHECK(length(internal_notes)<=5000),
 consent_at timestamptz NOT NULL DEFAULT now(),privacy_version text NOT NULL,terms_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,revision integer NOT NULL DEFAULT 1,
 CHECK(length(btrim(email))>0 OR length(btrim(phone))>0)
);
CREATE INDEX recruitment_applicants_created_idx ON public.recruitment_applicants(created_at DESC);
CREATE INDEX recruitment_applicants_job_idx ON public.recruitment_applicants(job_id);
CREATE INDEX recruitment_applicants_expiry_idx ON public.recruitment_applicants(expires_at);
CREATE TABLE public.recruitment_audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid,action text NOT NULL,entity text NOT NULL,entity_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE recruitment_private.receipts (
 request_id uuid PRIMARY KEY,payload_hash text NOT NULL,contact_hash text NOT NULL,receipt uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE recruitment_private.receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX recruitment_receipts_time_idx ON recruitment_private.receipts(created_at);
CREATE INDEX recruitment_receipts_contact_idx ON recruitment_private.receipts(contact_hash,created_at);
REVOKE ALL ON recruitment_private.receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON recruitment_private.receipts TO service_role;
CREATE FUNCTION recruitment_private.is_hq() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.recruitment_admins WHERE user_id=(SELECT auth.uid()) AND is_active);
$$;
CREATE FUNCTION recruitment_private.bump_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.revision=OLD.revision+1; RETURN NEW; END $$;
-- Fixed trigger destinations; no applicant names, email, messages or notes in audit rows.
CREATE FUNCTION recruitment_private.audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME<>'recruitment_applicants' AND TG_TABLE_NAME NOT IN ('recruitment_locations','recruitment_templates','recruitment_jobs','recruitment_settings') THEN RAISE EXCEPTION 'unsupported audit target'; END IF;
 INSERT INTO public.recruitment_audit_logs(actor_id,action,entity,entity_id)
 VALUES(auth.uid(),TG_OP,TG_TABLE_NAME,CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION recruitment_private.audit_change() FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.recruitment_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_admins FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recruitment_admins TO service_role;
ALTER TABLE public.recruitment_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_settings FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recruitment_settings TO service_role;
ALTER TABLE public.recruitment_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_locations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recruitment_locations TO service_role;
ALTER TABLE public.recruitment_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_templates FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recruitment_templates TO service_role;
ALTER TABLE public.recruitment_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recruitment_jobs TO service_role;
ALTER TABLE public.recruitment_applicants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_applicants FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recruitment_applicants TO service_role;
ALTER TABLE public.recruitment_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_audit_logs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recruitment_audit_logs TO service_role;
CREATE POLICY recruitment_admin_self ON public.recruitment_admins FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
GRANT SELECT ON public.recruitment_admins TO authenticated;
CREATE POLICY recruitment_settings_public ON public.recruitment_settings FOR SELECT TO anon,authenticated USING(release_enabled);
CREATE POLICY recruitment_settings_hq ON public.recruitment_settings FOR SELECT TO authenticated USING((SELECT recruitment_private.is_hq()));
GRANT SELECT ON public.recruitment_settings TO anon,authenticated;
CREATE POLICY recruitment_settings_update ON public.recruitment_settings FOR UPDATE TO authenticated USING((SELECT recruitment_private.is_hq())) WITH CHECK((SELECT recruitment_private.is_hq()));
GRANT UPDATE(privacy_text,contact_text,retention_days,privacy_version) ON public.recruitment_settings TO authenticated;
CREATE POLICY recruitment_locations_hq ON public.recruitment_locations FOR ALL TO authenticated USING((SELECT recruitment_private.is_hq())) WITH CHECK((SELECT recruitment_private.is_hq()));
GRANT SELECT ON public.recruitment_locations TO authenticated;
GRANT UPDATE(name,address,access,is_active) ON public.recruitment_locations TO authenticated;
CREATE POLICY recruitment_templates_hq ON public.recruitment_templates FOR ALL TO authenticated USING((SELECT recruitment_private.is_hq())) WITH CHECK((SELECT recruitment_private.is_hq()));
GRANT SELECT ON public.recruitment_templates TO authenticated;
GRANT UPDATE(terms) ON public.recruitment_templates TO authenticated;
CREATE POLICY recruitment_jobs_hq ON public.recruitment_jobs FOR ALL TO authenticated USING((SELECT recruitment_private.is_hq())) WITH CHECK((SELECT recruitment_private.is_hq()));
GRANT SELECT ON public.recruitment_jobs TO authenticated;
GRANT UPDATE(overrides,is_published) ON public.recruitment_jobs TO authenticated;
CREATE POLICY recruitment_locations_public ON public.recruitment_locations FOR SELECT TO anon,authenticated USING(is_active AND EXISTS(SELECT 1 FROM public.recruitment_settings WHERE release_enabled));
CREATE POLICY recruitment_jobs_public ON public.recruitment_jobs FOR SELECT TO anon,authenticated USING(is_published AND EXISTS(SELECT 1 FROM public.recruitment_settings WHERE release_enabled) AND EXISTS(SELECT 1 FROM public.recruitment_locations l WHERE l.id=location_id AND l.is_active));
CREATE POLICY recruitment_templates_public ON public.recruitment_templates FOR SELECT TO anon,authenticated USING(EXISTS(SELECT 1 FROM public.recruitment_jobs j WHERE j.template_id=recruitment_templates.id AND j.is_published));
GRANT SELECT ON public.recruitment_locations,public.recruitment_jobs,public.recruitment_templates TO anon;
CREATE POLICY recruitment_applicants_read ON public.recruitment_applicants FOR SELECT TO authenticated USING((SELECT recruitment_private.is_hq()));
CREATE POLICY recruitment_applicants_update ON public.recruitment_applicants FOR UPDATE TO authenticated USING((SELECT recruitment_private.is_hq())) WITH CHECK((SELECT recruitment_private.is_hq()));
CREATE POLICY recruitment_applicants_delete ON public.recruitment_applicants FOR DELETE TO authenticated USING((SELECT recruitment_private.is_hq()));
GRANT SELECT,DELETE ON public.recruitment_applicants TO authenticated;
GRANT UPDATE(status,internal_notes) ON public.recruitment_applicants TO authenticated;
CREATE POLICY recruitment_audit_read ON public.recruitment_audit_logs FOR SELECT TO authenticated USING((SELECT recruitment_private.is_hq()));
GRANT SELECT ON public.recruitment_audit_logs TO authenticated;
CREATE TRIGGER recruitment_revision BEFORE UPDATE ON public.recruitment_settings FOR EACH ROW EXECUTE FUNCTION recruitment_private.bump_revision();
CREATE TRIGGER recruitment_audit AFTER INSERT OR UPDATE OR DELETE ON public.recruitment_settings FOR EACH ROW EXECUTE FUNCTION recruitment_private.audit_change();
CREATE TRIGGER recruitment_revision BEFORE UPDATE ON public.recruitment_locations FOR EACH ROW EXECUTE FUNCTION recruitment_private.bump_revision();
CREATE TRIGGER recruitment_audit AFTER INSERT OR UPDATE OR DELETE ON public.recruitment_locations FOR EACH ROW EXECUTE FUNCTION recruitment_private.audit_change();
CREATE TRIGGER recruitment_revision BEFORE UPDATE ON public.recruitment_templates FOR EACH ROW EXECUTE FUNCTION recruitment_private.bump_revision();
CREATE TRIGGER recruitment_audit AFTER INSERT OR UPDATE OR DELETE ON public.recruitment_templates FOR EACH ROW EXECUTE FUNCTION recruitment_private.audit_change();
CREATE TRIGGER recruitment_revision BEFORE UPDATE ON public.recruitment_jobs FOR EACH ROW EXECUTE FUNCTION recruitment_private.bump_revision();
CREATE TRIGGER recruitment_audit AFTER INSERT OR UPDATE OR DELETE ON public.recruitment_jobs FOR EACH ROW EXECUTE FUNCTION recruitment_private.audit_change();
CREATE TRIGGER recruitment_revision BEFORE UPDATE ON public.recruitment_applicants FOR EACH ROW EXECUTE FUNCTION recruitment_private.bump_revision();
CREATE TRIGGER recruitment_audit AFTER INSERT OR UPDATE OR DELETE ON public.recruitment_applicants FOR EACH ROW EXECUTE FUNCTION recruitment_private.audit_change();
CREATE VIEW public.recruitment_public_jobs WITH (security_invoker=true) AS
 SELECT j.id,j.location_id,l.code,l.name,l.address,l.access,t.terms||j.overrides AS terms,
 s.privacy_text,s.contact_text,s.retention_days,s.privacy_version
 FROM public.recruitment_jobs j JOIN public.recruitment_locations l ON l.id=j.location_id
 JOIN public.recruitment_templates t ON t.id=j.template_id CROSS JOIN public.recruitment_settings s
 WHERE s.release_enabled AND j.is_published AND l.is_active
 AND btrim(l.address)<>'' AND btrim(l.access)<>'' AND btrim(s.privacy_text)<>'' AND btrim(s.contact_text)<>'' AND s.retention_days IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM jsonb_each_text(t.terms||j.overrides) e WHERE btrim(e.value)='');
REVOKE ALL ON public.recruitment_public_jobs FROM PUBLIC;
GRANT SELECT ON public.recruitment_public_jobs TO anon,authenticated,service_role;
-- Callable only by the server. Caller-controlled metadata cannot grant HQ access.
CREATE FUNCTION public.recruitment_receive(p_payload jsonb,p_payload_hash text,p_contact_hash text) RETURNS uuid
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j record; r record; receipt uuid; settings record;
BEGIN
 IF p_payload_hash !~ '^[a-f0-9]{64}$' OR p_contact_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid digest'; END IF;
 -- A single transaction serializes duplicate checks, quotas and insertion.
 PERFORM pg_advisory_xact_lock(20261029,763);
 DELETE FROM recruitment_private.receipts WHERE created_at<now()-interval '1 day';
 SELECT * INTO r FROM recruitment_private.receipts WHERE request_id=(p_payload->>'request_id')::uuid;
 IF FOUND THEN
  IF r.payload_hash<>p_payload_hash THEN RAISE EXCEPTION 'request conflict'; END IF;
  RETURN r.receipt;
 END IF;
 SELECT * INTO settings FROM public.recruitment_settings WHERE id FOR SHARE;
 IF NOT settings.release_enabled OR settings.retention_days IS NULL OR (p_payload->>'privacy_version') IS DISTINCT FROM settings.privacy_version OR (p_payload->>'consent') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'intake closed or consent changed'; END IF;
 SELECT * INTO j FROM public.recruitment_public_jobs WHERE id=(p_payload->>'job_id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'job unavailable'; END IF;
 -- Lock source rows so publication/conditions cannot change between snapshot and commit.
 PERFORM 1 FROM public.recruitment_jobs WHERE id=j.id FOR SHARE;
 PERFORM 1 FROM public.recruitment_locations WHERE id=j.location_id FOR SHARE;
 PERFORM 1 FROM public.recruitment_templates WHERE id=(SELECT template_id FROM public.recruitment_jobs WHERE id=j.id) FOR SHARE;
 SELECT * INTO j FROM public.recruitment_public_jobs WHERE id=j.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'job unavailable'; END IF;
 IF (SELECT count(*) FROM recruitment_private.receipts WHERE contact_hash=p_contact_hash AND created_at>now()-interval '1 hour')>=3 OR
    (SELECT count(*) FROM recruitment_private.receipts WHERE created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'rate limit'; END IF;
 INSERT INTO public.recruitment_applicants(job_id,full_name,email,phone,qualifications,message,privacy_version,terms_snapshot,expires_at)
 VALUES(j.id,p_payload->>'full_name',p_payload->>'email',p_payload->>'phone',p_payload->>'qualifications',p_payload->>'message',settings.privacy_version,
 jsonb_build_object('location',j.name,'address',j.address,'terms',j.terms,'privacy_text',settings.privacy_text),now()+settings.retention_days*interval '1 day') RETURNING id INTO receipt;
 INSERT INTO recruitment_private.receipts VALUES((p_payload->>'request_id')::uuid,p_payload_hash,p_contact_hash,receipt,now());
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.recruitment_receive(jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_receive(jsonb,text,text) TO service_role;
REVOKE ALL ON FUNCTION recruitment_private.is_hq(),recruitment_private.valid_terms(jsonb,boolean),recruitment_private.bump_revision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recruitment_private.is_hq(),recruitment_private.valid_terms(jsonb,boolean) TO authenticated,service_role;
INSERT INTO public.recruitment_settings(id) VALUES(true);
INSERT INTO public.recruitment_locations(code,name) VALUES('gamo','COZY蒲生'),('toyonaka','COZY豊中'),('sakai','COZY堺');
INSERT INTO public.recruitment_templates(terms) VALUES('{"title":"","employment_type":"","salary":"","hours":"","duties":"","requirements":"","benefits":"","holidays":""}');
INSERT INTO public.recruitment_jobs(location_id,template_id) SELECT l.id,t.id FROM public.recruitment_locations l CROSS JOIN public.recruitment_templates t;
COMMIT;
