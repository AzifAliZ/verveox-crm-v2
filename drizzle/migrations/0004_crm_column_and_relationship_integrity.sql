-- Only user-authored candidate fields may be written directly. Trigger-owned fields stay private.
REVOKE INSERT, UPDATE ON public.leads FROM authenticated;
GRANT INSERT(full_name,email,phone,whatsapp_number,college,degree,department,graduation_year,skills,experience_level,interest,course_id,preferred_batch,availability,eligibility_status,source,source_details,campaign_id,campaign_name_snapshot,utm_source,utm_medium,utm_campaign,landing_page,stage,manual_temperature_override,priority,assigned_to,preferred_channel,lost_reason) ON public.leads TO authenticated;
GRANT UPDATE(full_name,email,phone,whatsapp_number,college,degree,department,graduation_year,skills,experience_level,interest,course_id,preferred_batch,availability,eligibility_status,source,source_details,campaign_id,campaign_name_snapshot,utm_source,utm_medium,utm_campaign,landing_page,stage,manual_temperature_override,priority,assigned_to,preferred_channel,lost_reason,archived_at) ON public.leads TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_campaign_hierarchy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent_set uuid; parent_campaign uuid;
BEGIN
 IF new.ad_id IS NOT NULL THEN
  SELECT ad_set_id INTO parent_set FROM public.ads WHERE id=new.ad_id;
  IF parent_set IS DISTINCT FROM new.ad_set_id THEN RAISE EXCEPTION 'Ad and ad set attribution must agree'; END IF;
 END IF;
 IF new.ad_set_id IS NOT NULL THEN
  SELECT campaign_id INTO parent_campaign FROM public.ad_sets WHERE id=new.ad_set_id;
  IF parent_campaign IS DISTINCT FROM new.campaign_id THEN RAISE EXCEPTION 'Ad set and campaign attribution must agree'; END IF;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER leads_attribution_integrity BEFORE INSERT OR UPDATE OF campaign_id,ad_set_id,ad_id ON public.leads FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_hierarchy();
REVOKE EXECUTE ON FUNCTION public.guard_campaign_hierarchy() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_campaign_hierarchy() TO service_role;
ALTER TABLE public.export_jobs ADD CONSTRAINT export_row_count_nonnegative CHECK(row_count IS NULL OR row_count>=0);
ALTER TABLE public.followups ADD CONSTRAINT followup_completion_consistent CHECK((status='completed' AND completed_at IS NOT NULL) OR (status<>'completed' AND completed_at IS NULL));