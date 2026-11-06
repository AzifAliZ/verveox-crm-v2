CREATE TABLE public.lead_merges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_lead_id uuid NOT NULL REFERENCES public.leads(id), source_lead_id uuid NOT NULL REFERENCES public.leads(id), merged_by uuid REFERENCES public.profiles(id), merged_at timestamptz NOT NULL DEFAULT now(), source_snapshot jsonb NOT NULL, UNIQUE(source_lead_id), CHECK(target_lead_id<>source_lead_id)
);
GRANT SELECT ON public.lead_merges TO authenticated;
GRANT ALL ON public.lead_merges TO service_role;
ALTER TABLE public.lead_merges ENABLE ROW LEVEL SECURITY;
CREATE POLICY authorized_merge_read ON public.lead_merges FOR SELECT TO authenticated USING(public.can_access_lead(target_lead_id) AND public.can_access_lead(source_lead_id));
CREATE OR REPLACE FUNCTION public.merge_leads(_target uuid,_source uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.leads; s public.leads;
BEGIN
 IF NOT (public.is_admin(auth.uid()) OR public.is_manager(auth.uid())) THEN RAISE EXCEPTION 'Only managers and Super Admins can merge candidates'; END IF;
 IF _target=_source OR NOT public.can_access_lead(_target) OR NOT public.can_access_lead(_source) THEN RAISE EXCEPTION 'Both distinct candidates must be accessible'; END IF;
 PERFORM id FROM public.leads WHERE id IN (_target,_source) ORDER BY id FOR UPDATE;
 SELECT * INTO t FROM public.leads WHERE id=_target; SELECT * INTO s FROM public.leads WHERE id=_source;
 IF t.archived_at IS NOT NULL OR s.archived_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.lead_merges WHERE source_lead_id IN (_target,_source) OR target_lead_id=_source) THEN RAISE EXCEPTION 'Archived or previously merged candidates cannot be merged again'; END IF;
 -- Retain the survivor's attribution and all conflicting values. Original source stays archived with its histories and external IDs.
 UPDATE public.leads SET email=coalesce(t.email,s.email),phone=coalesce(t.phone,s.phone),whatsapp_number=coalesce(t.whatsapp_number,s.whatsapp_number),college=coalesce(t.college,s.college),degree=coalesce(t.degree,s.degree),department=coalesce(t.department,s.department),graduation_year=coalesce(t.graduation_year,s.graduation_year),skills=coalesce(t.skills,s.skills),interest=coalesce(t.interest,s.interest),experience_level=coalesce(t.experience_level,s.experience_level),preferred_batch=coalesce(t.preferred_batch,s.preferred_batch),availability=coalesce(t.availability,s.availability) WHERE id=_target;
 INSERT INTO public.lead_tags(lead_id,tag_id) SELECT _target,tag_id FROM public.lead_tags WHERE lead_id=_source ON CONFLICT DO NOTHING;
 IF s.marketing_opt_out AND NOT t.marketing_opt_out THEN INSERT INTO public.consent_records(lead_id,purpose,consent_status,consent_source,recorded_by) VALUES(_target,'marketing','withdrawn','reviewed_merge',auth.uid()); END IF;
 INSERT INTO public.lead_merges(target_lead_id,source_lead_id,merged_by,source_snapshot) VALUES(_target,_source,auth.uid(),to_jsonb(s));
 UPDATE public.leads SET archived_at=now() WHERE id=_source;
 INSERT INTO public.activities(lead_id,actor_id,activity_type,subject,description) VALUES(_target,auth.uid(),'note','Candidate merged after review','Merged candidate: '||s.full_name||'. Original attribution, activities and follow-ups remain on the archived source profile.');
 INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'merge','lead',_target,jsonb_build_object('source_lead_id',_source));
 RETURN _target;
END $$;
REVOKE EXECUTE ON FUNCTION public.merge_leads(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.merge_leads(uuid,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.lead_audit_timeline() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF new.entity_type='lead' AND new.action IN ('create','update','archive','restore') AND EXISTS(SELECT 1 FROM public.leads WHERE id=new.entity_id) THEN
  INSERT INTO public.activities(lead_id,actor_id,activity_type,subject,description) VALUES(new.entity_id,new.actor_id,'system',CASE new.action WHEN 'create' THEN 'Candidate created' WHEN 'archive' THEN 'Candidate archived' WHEN 'restore' THEN 'Candidate restored' ELSE 'Candidate updated' END,new.changes::text);
 END IF;
 RETURN new;
END $$;
REVOKE EXECUTE ON FUNCTION public.lead_audit_timeline() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lead_audit_timeline() TO service_role;
CREATE TRIGGER audit_lead_timeline AFTER INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.lead_audit_timeline();