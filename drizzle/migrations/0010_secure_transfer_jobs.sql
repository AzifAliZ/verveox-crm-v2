CREATE TABLE public.transfer_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requested_by uuid NOT NULL REFERENCES public.profiles(id), kind text NOT NULL CHECK(kind IN ('upload','import','export')), status text NOT NULL DEFAULT 'pending', file_name text NOT NULL, file_path text, expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'), payload jsonb NOT NULL DEFAULT '{}'::jsonb, total_rows integer NOT NULL DEFAULT 0, processed_rows integer NOT NULL DEFAULT 0, imported_rows integer NOT NULL DEFAULT 0, updated_rows integer NOT NULL DEFAULT 0, skipped_rows integer NOT NULL DEFAULT 0, failed_rows integer NOT NULL DEFAULT 0, errors jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 CHECK(total_rows>=0 AND processed_rows>=0 AND processed_rows<=total_rows)
);
GRANT SELECT ON public.transfer_jobs TO authenticated;
GRANT ALL ON public.transfer_jobs TO service_role;
ALTER TABLE public.transfer_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY transfer_owner_read ON public.transfer_jobs FOR SELECT TO authenticated USING(requested_by=auth.uid() AND public.is_active_user(auth.uid()));
CREATE INDEX transfer_owner_date_idx ON public.transfer_jobs(requested_by,created_at DESC);
CREATE POLICY transfer_private_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='crm-transfers' AND public.is_active_user(auth.uid()) AND EXISTS(SELECT 1 FROM public.transfer_jobs j WHERE j.file_path=name AND j.requested_by=auth.uid() AND j.expires_at>now()));
CREATE OR REPLACE FUNCTION public.process_import_batch(_job_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.transfer_jobs; r jsonb; d jsonb; matches uuid[]; target uuid; rec public.leads; err text; n integer:=0;
BEGIN
 IF NOT (public.is_admin(auth.uid()) OR public.is_manager(auth.uid())) THEN RAISE EXCEPTION 'Import requires an active Manager or Super Admin'; END IF;
 SELECT * INTO j FROM public.transfer_jobs WHERE id=_job_id AND requested_by=auth.uid() AND kind='import' FOR UPDATE;
 IF NOT FOUND OR j.expires_at<=now() THEN RAISE EXCEPTION 'Import not available'; END IF;
 IF j.status='completed' THEN RETURN to_jsonb(j)-'payload'; END IF;
 PERFORM pg_advisory_xact_lock(928471);
 FOR r IN SELECT value FROM jsonb_array_elements(j.payload->'rows') WITH ORDINALITY a(value,ordinality) WHERE ordinality>j.processed_rows ORDER BY ordinality LIMIT 50 LOOP
 BEGIN
 d:=r->'data'; err:=r->>'error';
 IF err IS NOT NULL THEN RAISE EXCEPTION '%',err; END IF;
 SELECT array_agg(id) INTO matches FROM public.leads WHERE (d->>'email' IS NOT NULL AND normalized_email=lower(trim(d->>'email'))) OR (length(regexp_replace(coalesce(d->>'phone',''),'\D','','g'))>=7 AND normalized_phone=right(regexp_replace(d->>'phone','\D','','g'),10));
 IF cardinality(matches)>1 THEN RAISE EXCEPTION 'Ambiguous duplicate; review manually'; END IF;
 target:=matches[1];
 IF target IS NOT NULL THEN
 IF NOT public.can_access_lead(target) THEN RAISE EXCEPTION 'Duplicate cannot be processed with your permissions'; END IF;
 IF j.payload->>'mode'='skip' THEN j.skipped_rows:=j.skipped_rows+1;
 ELSE
 SELECT * INTO rec FROM public.leads WHERE id=target FOR UPDATE;
 IF rec.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Archived duplicate; restore and review manually'; END IF;
 rec:=jsonb_populate_record(rec,d-'source'-'utm_source'-'utm_campaign');
 UPDATE public.leads SET full_name=rec.full_name,email=rec.email,phone=rec.phone,whatsapp_number=rec.whatsapp_number,college=rec.college,degree=rec.degree,department=rec.department,graduation_year=rec.graduation_year,skills=rec.skills,interest=rec.interest WHERE id=target;
 j.updated_rows:=j.updated_rows+1;
 END IF;
 ELSE
 rec:=jsonb_populate_record(NULL::public.leads,d);
 INSERT INTO public.leads(full_name,email,phone,whatsapp_number,college,degree,department,graduation_year,skills,interest,source,utm_source,utm_campaign,created_by) VALUES(rec.full_name,rec.email,rec.phone,rec.whatsapp_number,rec.college,rec.degree,rec.department,rec.graduation_year,rec.skills,rec.interest,coalesce(rec.source,'import'),rec.utm_source,rec.utm_campaign,auth.uid());
 j.imported_rows:=j.imported_rows+1;
 END IF;
 EXCEPTION WHEN OTHERS THEN
 j.failed_rows:=j.failed_rows+1;
 j.errors:=j.errors||jsonb_build_array(jsonb_build_object('row',r->'row','error',SQLERRM));
 END;
 n:=n+1;
 END LOOP;
 j.processed_rows:=j.processed_rows+n;
 UPDATE public.transfer_jobs SET processed_rows=j.processed_rows,imported_rows=j.imported_rows,updated_rows=j.updated_rows,skipped_rows=j.skipped_rows,failed_rows=j.failed_rows,errors=j.errors,status=CASE WHEN j.processed_rows=j.total_rows THEN 'completed' ELSE 'running' END,completed_at=CASE WHEN j.processed_rows=j.total_rows THEN now() ELSE NULL END WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j)-'payload';
END $$;
REVOKE ALL ON FUNCTION public.process_import_batch(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.process_import_batch(uuid) TO authenticated,service_role;