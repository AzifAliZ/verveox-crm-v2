ALTER TABLE public.integration_events ADD COLUMN claim_token uuid, ADD COLUMN lease_expires_at timestamptz, ADD COLUMN next_attempt_at timestamptz DEFAULT now(), ADD COLUMN dead_letter_at timestamptz, ADD COLUMN lifetime_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.integration_events DROP CONSTRAINT integration_events_status_check;
ALTER TABLE public.integration_events ADD CONSTRAINT integration_events_status_check CHECK(status IN ('received','processing','processed','failed','duplicate','permanent_failure','dead_letter'));
UPDATE public.integration_events SET lifetime_attempts=attempts, lease_expires_at=CASE WHEN status='processing' THEN now() ELSE NULL END, dead_letter_at=CASE WHEN status='permanent_failure' THEN now() ELSE NULL END;
CREATE INDEX meta_retry_due_idx ON public.integration_events(next_attempt_at,received_at) WHERE provider='meta' AND status IN ('received','failed');
CREATE INDEX meta_stale_lease_idx ON public.integration_events(lease_expires_at) WHERE provider='meta' AND status='processing';
CREATE TABLE public.background_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('meta','cleanup')), status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')), started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, processed integer NOT NULL DEFAULT 0 CHECK(processed>=0), failed integer NOT NULL DEFAULT 0 CHECK(failed>=0), error text);
GRANT SELECT ON public.background_runs TO authenticated;
GRANT ALL ON public.background_runs TO service_role;
ALTER TABLE public.background_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read_runs ON public.background_runs FOR SELECT TO authenticated USING(public.is_admin(auth.uid()));
CREATE INDEX background_runs_started_idx ON public.background_runs(started_at DESC);
CREATE OR REPLACE FUNCTION public.claim_meta_event(_id uuid) RETURNS SETOF public.integration_events LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.integration_events;
BEGIN
 SELECT * INTO e FROM public.integration_events WHERE id=_id AND provider='meta' FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 IF e.status='processing' AND coalesce(e.lease_expires_at,'-infinity')>now() THEN RETURN; END IF;
 IF e.status NOT IN ('received','failed','processing') OR (e.status<>'processing' AND e.next_attempt_at>now()) THEN RETURN; END IF;
 IF e.attempts>=5 THEN UPDATE public.integration_events SET status='dead_letter',dead_letter_at=now(),claim_token=NULL,lease_expires_at=NULL,next_attempt_at=NULL,last_error='Retry limit exhausted' WHERE id=_id; RETURN; END IF;
 RETURN QUERY UPDATE public.integration_events SET status='processing',attempts=attempts+1,lifetime_attempts=lifetime_attempts+1,claim_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes',next_attempt_at=NULL WHERE id=_id RETURNING *;
END $$;
CREATE OR REPLACE FUNCTION public.fail_meta_event(_id uuid,_claim uuid,_error text,_permanent boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.integration_events; result text;
BEGIN
 SELECT * INTO e FROM public.integration_events WHERE id=_id AND claim_token=_claim AND status='processing' AND lease_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN 'lease_lost'; END IF;
 result:=CASE WHEN _permanent OR e.attempts>=5 THEN 'dead_letter' ELSE 'failed' END;
 UPDATE public.integration_events SET status=result,last_error=left(_error,1000),claim_token=NULL,lease_expires_at=NULL,dead_letter_at=CASE WHEN result='dead_letter' THEN now() ELSE NULL END,next_attempt_at=CASE WHEN result='failed' THEN now()+make_interval(secs=>least(3600,60*power(2,e.attempts-1)::integer)) ELSE NULL END WHERE id=_id;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.requeue_meta_event(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.integration_events;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only Super Admins can recover Meta events'; END IF;
 SELECT * INTO e FROM public.integration_events WHERE id=_id AND provider='meta' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF e.status='processing' AND coalesce(e.lease_expires_at,'-infinity')>now() THEN RAISE EXCEPTION 'Event has an active worker'; END IF;
 IF e.status IN ('processed','duplicate') THEN RAISE EXCEPTION 'Completed events cannot be reset'; END IF;
 UPDATE public.integration_events SET status='received',attempts=0,claim_token=NULL,lease_expires_at=NULL,next_attempt_at=now(),dead_letter_at=NULL WHERE id=_id;
 INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'recover','integration_event',_id,jsonb_build_object('old_status',e.status,'lifetime_attempts',e.lifetime_attempts));
END $$;
CREATE OR REPLACE FUNCTION public.complete_meta_event(_id uuid,_claim uuid,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.integration_events; lid uuid; cp uuid; aset uuid; ad uuid; result text; d public.leads;
BEGIN
 SELECT * INTO e FROM public.integration_events WHERE id=_id AND status='processing' AND claim_token=_claim AND lease_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','lease_lost'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(e.payload->>'leadgen_id',739));
 SELECT id INTO lid FROM public.leads WHERE meta_lead_id=e.payload->>'leadgen_id';
 IF lid IS NOT NULL THEN result:='duplicate';
 ELSE
  IF _data->>'campaign_external_id' IS NOT NULL THEN
   INSERT INTO public.campaigns(external_campaign_id,name,source_platform) VALUES(_data->>'campaign_external_id',coalesce(_data->>'campaign_name','Meta campaign'),'facebook') ON CONFLICT(external_campaign_id) DO UPDATE SET name=excluded.name RETURNING id INTO cp;
  END IF;
  IF _data->>'adset_external_id' IS NOT NULL THEN
   INSERT INTO public.ad_sets(external_ad_set_id,campaign_id,name) VALUES(_data->>'adset_external_id',cp,coalesce(_data->>'adset_name','Meta ad set')) ON CONFLICT(external_ad_set_id) DO UPDATE SET campaign_id=excluded.campaign_id,name=excluded.name RETURNING id INTO aset;
  END IF;
  IF _data->>'ad_external_id' IS NOT NULL THEN
   INSERT INTO public.ads(external_ad_id,ad_set_id,name) VALUES(_data->>'ad_external_id',aset,coalesce(_data->>'ad_name','Meta ad')) ON CONFLICT(external_ad_id) DO UPDATE SET ad_set_id=excluded.ad_set_id,name=excluded.name RETURNING id INTO ad;
  END IF;
  d:=jsonb_populate_record(NULL::public.leads,_data);
  INSERT INTO public.leads(full_name,email,phone,college,degree,graduation_year,interest,source,source_details,meta_lead_id,meta_page_id,meta_form_id,external_lead_id,campaign_id,ad_set_id,ad_id,campaign_name_snapshot)
  VALUES(coalesce(d.full_name,'Meta lead'),d.email,d.phone,d.college,d.degree,d.graduation_year,d.interest,'facebook','Meta Lead Ads',e.payload->>'leadgen_id',e.payload->>'page_id',coalesce(_data->>'form_id',e.payload->>'form_id'),e.payload->>'leadgen_id',cp,aset,ad,_data->>'campaign_name') RETURNING id INTO lid;
  result:='processed';
 END IF;
 UPDATE public.integration_events SET status=result,lead_id=lid,processed_at=now(),last_error=NULL,claim_token=NULL,lease_expires_at=NULL,next_attempt_at=NULL,dead_letter_at=NULL WHERE id=_id;
 RETURN jsonb_build_object('status',result,'lead_id',lid);
END $$;
REVOKE ALL ON FUNCTION public.claim_meta_event(uuid),public.fail_meta_event(uuid,uuid,text,boolean),public.complete_meta_event(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_meta_event(uuid),public.fail_meta_event(uuid,uuid,text,boolean),public.complete_meta_event(uuid,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.requeue_meta_event(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.requeue_meta_event(uuid) TO authenticated,service_role;