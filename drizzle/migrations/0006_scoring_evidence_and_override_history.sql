ALTER TABLE public.scoring_rules ADD COLUMN evidence_type text NOT NULL DEFAULT 'qualification';
ALTER TABLE public.scoring_rules ADD CONSTRAINT scoring_evidence_type CHECK (evidence_type IN ('qualification','ad_click'));
CREATE OR REPLACE FUNCTION public.scoring_rule_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (new.evidence_type='ad_click' OR (new.key || ' ' || new.label) ~* '(^|[^a-z])(clicks?|ctr|impressions?)([^a-z]|$)') AND new.points<>0 THEN
  RAISE EXCEPTION 'Ad clicks and impressions cannot contribute qualification points';
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER scoring_evidence_guard BEFORE INSERT OR UPDATE ON public.scoring_rules FOR EACH ROW EXECUTE FUNCTION public.scoring_rule_guard();
CREATE OR REPLACE FUNCTION public.recalc_lead_score(_lead_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s int; r text;
BEGIN
 SELECT coalesce(sum(sr.points),0), string_agg(sr.label || ' (' || CASE WHEN sr.points>0 THEN '+' ELSE '' END || sr.points || ')', ', ' ORDER BY sr.sort_order, sr.key) INTO s,r
 FROM public.lead_signals ls JOIN public.scoring_rules sr ON sr.key=ls.rule_key AND sr.is_active AND sr.evidence_type='qualification'
 WHERE ls.lead_id=_lead_id AND NOT ((sr.key || ' ' || sr.label) ~* '(^|[^a-z])(clicks?|ctr|impressions?)([^a-z]|$)');
 s:=greatest(0,least(100,s));
 PERFORM set_config('verveox.recalc','1',true);
 UPDATE public.leads SET score=s, score_reason=coalesce(r,'No signals recorded') WHERE id=_lead_id;
 PERFORM set_config('verveox.recalc','0',true);
END $$;
CREATE OR REPLACE FUNCTION public.override_mode_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF new.manual_temperature_override IS DISTINCT FROM old.manual_temperature_override AND new.score IS NOT DISTINCT FROM old.score AND new.temperature IS NOT DISTINCT FROM old.temperature THEN
  INSERT INTO public.lead_score_history(lead_id,old_score,new_score,old_temperature,new_temperature,reason,source,changed_by)
  VALUES(new.id,old.score,new.score,old.temperature,new.temperature,CASE WHEN new.manual_temperature_override IS NULL THEN 'Manual override cleared; automatic classification resumed' ELSE 'Manual temperature override: ' || new.manual_temperature_override::text END,'manual',auth.uid());
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER override_mode_history AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.override_mode_history();
CREATE OR REPLACE FUNCTION public.scoring_configuration_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.audit_logs(actor_id,action,entity_type,changes,metadata) VALUES(auth.uid(),lower(tg_op),tg_table_name,jsonb_build_object('old',CASE WHEN tg_op='INSERT' THEN NULL ELSE to_jsonb(old) END,'new',to_jsonb(new)),jsonb_build_object('configuration','lead_scoring'));
 RETURN new;
END $$;
CREATE TRIGGER scoring_configuration_audit AFTER INSERT OR UPDATE ON public.scoring_rules FOR EACH ROW EXECUTE FUNCTION public.scoring_configuration_audit();
CREATE TRIGGER threshold_configuration_audit AFTER UPDATE OF hot_threshold,warm_threshold ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.scoring_configuration_audit();
REVOKE ALL ON FUNCTION public.scoring_rule_guard(), public.override_mode_history(), public.scoring_configuration_audit() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recalc_lead_score(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scoring_rule_guard(), public.override_mode_history(), public.scoring_configuration_audit(), public.recalc_lead_score(uuid) TO service_role;