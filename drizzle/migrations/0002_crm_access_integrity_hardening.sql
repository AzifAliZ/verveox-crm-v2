-- Converge privileges and enforce activation on every operational table.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',t.tablename);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  IF t.tablename <> 'profiles' THEN
   EXECUTE format('CREATE POLICY active_account_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()))',t.tablename);
  END IF;
 END LOOP;
END $$;
CREATE POLICY active_profile_mutation ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_active_user(auth.uid())) WITH CHECK (public.is_active_user(auth.uid()));
DROP POLICY "read profiles" ON public.profiles;
CREATE POLICY "read profiles" ON public.profiles FOR SELECT TO authenticated USING (id=auth.uid() OR public.is_admin(auth.uid()) OR (public.is_active_user(auth.uid()) AND public.same_team(id)));
DROP POLICY "read roles" ON public.user_roles;
CREATE POLICY "read roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.is_admin(auth.uid()) OR (public.is_manager(auth.uid()) AND public.same_team(user_id)));

CREATE OR REPLACE FUNCTION public.can_assign_user(_target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _target IS NULL OR (public.is_active_user(_target) AND (public.is_admin(auth.uid()) OR _target=auth.uid() OR (public.is_manager(auth.uid()) AND public.same_team(_target))))
$$;
CREATE OR REPLACE FUNCTION public.leads_before_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF tg_op='INSERT' THEN
  IF auth.uid() IS NOT NULL THEN
   new.created_by := auth.uid();
   new.created_at := now();
   new.last_contacted_at := NULL; new.next_followup_at := NULL; new.conversion_at := NULL;
   IF NOT public.can_assign_user(new.assigned_to) THEN RAISE EXCEPTION 'Assignment requires an active user in your permitted team'; END IF;
  END IF;
  new.score := 0; new.score_reason := NULL;
 ELSE
  IF auth.uid() IS NOT NULL AND pg_trigger_depth()=1 THEN
   IF new.id IS DISTINCT FROM old.id OR new.created_by IS DISTINCT FROM old.created_by OR new.created_at IS DISTINCT FROM old.created_at THEN RAISE EXCEPTION 'Lead identity and creator cannot be changed'; END IF;
   IF new.score IS DISTINCT FROM old.score OR new.score_reason IS DISTINCT FROM old.score_reason OR new.last_contacted_at IS DISTINCT FROM old.last_contacted_at OR new.next_followup_at IS DISTINCT FROM old.next_followup_at OR new.conversion_at IS DISTINCT FROM old.conversion_at THEN RAISE EXCEPTION 'Derived lead fields are maintained by database triggers'; END IF;
   IF new.marketing_opt_out IS DISTINCT FROM old.marketing_opt_out THEN RAISE EXCEPTION 'Change marketing permission through consent records'; END IF;
   IF new.meta_lead_id IS DISTINCT FROM old.meta_lead_id OR new.meta_page_id IS DISTINCT FROM old.meta_page_id OR new.meta_form_id IS DISTINCT FROM old.meta_form_id OR new.external_lead_id IS DISTINCT FROM old.external_lead_id THEN RAISE EXCEPTION 'Integration identifiers cannot be changed'; END IF;
   IF new.assigned_to IS DISTINCT FROM old.assigned_to THEN
    IF NOT (public.is_admin(auth.uid()) OR public.is_manager(auth.uid())) THEN RAISE EXCEPTION 'Only managers and admins can reassign leads'; END IF;
    IF NOT public.can_assign_user(new.assigned_to) THEN RAISE EXCEPTION 'Assignment requires an active user in your permitted team'; END IF;
   END IF;
  END IF;
  IF new.score IS DISTINCT FROM old.score AND coalesce(current_setting('verveox.recalc',true),'')<>'1' THEN new.score:=old.score; END IF;
 END IF;
 IF new.manual_temperature_override IS NOT NULL THEN new.classification_mode:='manual'; new.temperature:=new.manual_temperature_override;
 ELSE new.classification_mode:='auto'; new.temperature:=public.temp_for_score(new.score); END IF;
 IF new.stage='enrolled' AND new.conversion_at IS NULL THEN new.conversion_at:=now(); END IF;
 IF new.stage<>'enrolled' THEN new.conversion_at:=NULL; END IF;
 RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.guard_lead_child() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR pg_trigger_depth()>1 THEN RETURN new; END IF;
 IF NOT public.can_access_lead(new.lead_id) THEN RAISE EXCEPTION 'No access to this lead'; END IF;
 IF tg_op='UPDATE' AND new.lead_id IS DISTINCT FROM old.lead_id THEN RAISE EXCEPTION 'The parent lead cannot be changed'; END IF;
 IF tg_table_name='followups' THEN
  IF tg_op='INSERT' THEN new.created_by:=auth.uid();
  ELSE
   IF new.id IS DISTINCT FROM old.id OR new.created_by IS DISTINCT FROM old.created_by OR new.created_at IS DISTINCT FROM old.created_at THEN RAISE EXCEPTION 'Follow-up provenance is immutable'; END IF;
   IF new.assigned_to IS DISTINCT FROM old.assigned_to AND NOT (public.is_admin(auth.uid()) OR public.is_manager(auth.uid())) THEN RAISE EXCEPTION 'Only managers and admins can reassign follow-ups'; END IF;
  END IF;
  IF (tg_op='INSERT' OR new.assigned_to IS DISTINCT FROM old.assigned_to) AND NOT public.can_assign_user(new.assigned_to) THEN RAISE EXCEPTION 'Follow-up assignee must be active and within your permitted team'; END IF;
  IF new.assigned_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id=new.lead_id AND (l.assigned_to=new.assigned_to OR l.created_by=new.assigned_to OR EXISTS (SELECT 1 FROM public.lead_shares s WHERE s.lead_id=l.id AND s.user_id=new.assigned_to))) AND NOT public.is_admin(new.assigned_to) AND NOT (public.is_manager(new.assigned_to) AND EXISTS(SELECT 1 FROM public.leads l JOIN public.profiles a ON a.id=l.assigned_to JOIN public.profiles p ON p.id=new.assigned_to WHERE l.id=new.lead_id AND p.team_id IS NOT NULL AND p.team_id=a.team_id)) THEN RAISE EXCEPTION 'Follow-up assignee must have access to the lead'; END IF;
  new.completed_at:=CASE WHEN new.status='completed' THEN coalesce(new.completed_at,now()) ELSE NULL END;
 ELSIF tg_table_name='activities' THEN
  IF tg_op='INSERT' THEN
   new.actor_id:=auth.uid();
   IF new.activity_type NOT IN ('note','call','email','whatsapp','meeting') THEN RAISE EXCEPTION 'System activities can only be generated by the database'; END IF;
  ELSE
   IF new.id IS DISTINCT FROM old.id OR new.actor_id IS DISTINCT FROM old.actor_id OR new.created_at IS DISTINCT FROM old.created_at OR new.activity_type<>'note' THEN RAISE EXCEPTION 'Only note content can be edited'; END IF;
  END IF;
 ELSIF tg_table_name='lead_signals' THEN new.added_by:=auth.uid();
 ELSIF tg_table_name='consent_records' THEN new.recorded_by:=auth.uid(); new.recorded_at:=now();
 ELSIF tg_table_name='lead_shares' THEN
  IF NOT public.can_assign_user(new.user_id) OR new.user_id IS NULL THEN RAISE EXCEPTION 'Share recipient must be active and within your permitted team'; END IF;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER followups_integrity BEFORE INSERT OR UPDATE ON public.followups FOR EACH ROW EXECUTE FUNCTION public.guard_lead_child();
CREATE TRIGGER activities_integrity BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.guard_lead_child();
CREATE TRIGGER signals_integrity BEFORE INSERT ON public.lead_signals FOR EACH ROW EXECUTE FUNCTION public.guard_lead_child();
CREATE TRIGGER consent_integrity BEFORE INSERT ON public.consent_records FOR EACH ROW EXECUTE FUNCTION public.guard_lead_child();
CREATE TRIGGER shares_integrity BEFORE INSERT OR UPDATE ON public.lead_shares FOR EACH ROW EXECUTE FUNCTION public.guard_lead_child();
REVOKE UPDATE ON public.lead_signals FROM authenticated;
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE(read_at) ON public.notifications TO authenticated;
DROP POLICY "own edit" ON public.activities;
DROP POLICY "own delete" ON public.activities;
CREATE POLICY "own edit" ON public.activities FOR UPDATE TO authenticated USING (actor_id=auth.uid() AND activity_type='note' AND public.can_access_lead(lead_id)) WITH CHECK (actor_id=auth.uid() AND activity_type='note' AND public.can_access_lead(lead_id));
CREATE POLICY "own delete" ON public.activities FOR DELETE TO authenticated USING (actor_id=auth.uid() AND activity_type='note' AND public.can_access_lead(lead_id));
DROP POLICY "read" ON public.followups;
DROP POLICY "update" ON public.followups;
CREATE POLICY "read" ON public.followups FOR SELECT TO authenticated USING (public.can_access_lead(lead_id));
CREATE POLICY "update" ON public.followups FOR UPDATE TO authenticated USING (public.can_access_lead(lead_id)) WITH CHECK (public.can_access_lead(lead_id));

-- No public bootstrap: every ordinary signup awaits an administrator.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.profiles(id,full_name,email,is_active) VALUES(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.email,''),false);
 INSERT INTO public.user_roles(user_id,role) VALUES(new.id,'employee');
 RETURN new;
END $$;
CREATE UNIQUE INDEX user_roles_single_role_idx ON public.user_roles(user_id);
CREATE OR REPLACE FUNCTION public.guard_last_admin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(8264024);
 IF tg_table_name='user_roles' THEN
  affected:=old.user_id;
  IF old.role<>'super_admin' OR (tg_op='UPDATE' AND new.role='super_admin') THEN RETURN coalesce(new,old); END IF;
 ELSE
  affected:=old.id;
  IF NOT old.is_active OR (tg_op='UPDATE' AND new.is_active) THEN RETURN coalesce(new,old); END IF;
 END IF;
 IF public.is_admin(affected) AND NOT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id WHERE r.role='super_admin' AND p.is_active AND p.id<>affected) THEN RAISE EXCEPTION 'The last active Super Admin cannot be removed or deactivated'; END IF;
 RETURN coalesce(new,old);
END $$;
CREATE TRIGGER roles_last_admin BEFORE UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();
CREATE TRIGGER profiles_last_admin BEFORE UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid,_role public.app_role) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(8264024);
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only Super Admins can manage roles'; END IF;
 IF _user_id=auth.uid() THEN RAISE EXCEPTION 'You cannot change your own role'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=_user_id) THEN RAISE EXCEPTION 'User not found'; END IF;
 INSERT INTO public.user_roles(user_id,role) VALUES(_user_id,_role) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role;
END $$;

-- Foreign-key lookup coverage and upsert-compatible nullable external IDs.
CREATE UNIQUE INDEX campaigns_external_id_full_uq ON public.campaigns(external_campaign_id);
CREATE INDEX profiles_team_idx ON public.profiles(team_id);
CREATE INDEX ad_sets_campaign_idx ON public.ad_sets(campaign_id);
CREATE INDEX ads_ad_set_idx ON public.ads(ad_set_id);
CREATE INDEX lead_forms_campaign_idx ON public.lead_forms(campaign_id);
CREATE INDEX leads_ad_set_idx ON public.leads(ad_set_id);
CREATE INDEX leads_ad_idx ON public.leads(ad_id);
CREATE INDEX leads_creator_idx ON public.leads(created_by);
CREATE INDEX shares_recipient_idx ON public.lead_shares(user_id);
CREATE INDEX lead_tags_tag_idx ON public.lead_tags(tag_id);
CREATE INDEX signals_rule_idx ON public.lead_signals(rule_key);
CREATE INDEX signals_actor_idx ON public.lead_signals(added_by);
CREATE INDEX activities_actor_idx ON public.activities(actor_id);
CREATE INDEX followups_creator_idx ON public.followups(created_by);
CREATE INDEX followups_pending_lead_due_idx ON public.followups(lead_id,due_at) WHERE status='pending';
CREATE INDEX consent_lead_idx ON public.consent_records(lead_id);
CREATE INDEX events_lead_idx ON public.integration_events(lead_id);
CREATE INDEX imports_requester_idx ON public.import_jobs(requested_by);
CREATE INDEX exports_requester_idx ON public.export_jobs(requested_by);
CREATE INDEX saved_views_user_idx ON public.saved_views(user_id);
ALTER TABLE public.leads ADD CONSTRAINT leads_source_reference_fk FOREIGN KEY(source) REFERENCES public.lead_sources(key);
ALTER TABLE public.campaigns ADD CONSTRAINT campaign_date_order CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date);
ALTER TABLE public.integration_events ADD CONSTRAINT integration_attempts_nonnegative CHECK(attempts>=0);
ALTER TABLE public.import_jobs ADD CONSTRAINT import_counters_nonnegative CHECK(total_rows>=0 AND imported_rows>=0 AND updated_rows>=0 AND skipped_rows>=0 AND failed_rows>=0);

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.prosecdef OR p.proname='dashboard_metrics') LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid),public.has_role(uuid,public.app_role),public.is_admin(uuid),public.is_manager(uuid),public.my_team_id(),public.same_team(uuid),public.can_access_lead(uuid),public.can_assign_user(uuid),public.admin_set_user_role(uuid,public.app_role),public.dashboard_metrics(timestamptz,timestamptz,uuid,text,uuid,uuid) TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;