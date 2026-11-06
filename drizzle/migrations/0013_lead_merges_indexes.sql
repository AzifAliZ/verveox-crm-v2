CREATE INDEX IF NOT EXISTS lead_merges_target_idx ON public.lead_merges(target_lead_id);
CREATE INDEX IF NOT EXISTS lead_merges_merged_by_idx ON public.lead_merges(merged_by);