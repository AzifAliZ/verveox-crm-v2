CREATE TABLE public.followup_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), followup_id uuid NOT NULL REFERENCES public.followups(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE, actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 event text NOT NULL, changes jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.followup_history TO authenticated;
GRANT ALL ON public.followup_history TO service_role;
ALTER TABLE public.followup_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY history_read ON public.followup_history FOR SELECT TO authenticated USING (public.can_access_lead(lead_id));
CREATE INDEX followup_history_task_idx ON public.followup_history(followup_id,created_at DESC);
CREATE INDEX followup_history_lead_idx ON public.followup_history(lead_id);
CREATE INDEX followup_history_actor_idx ON public.followup_history(actor_id);
CREATE INDEX followup_reminders_due_idx ON public.followups(remind_at,id) WHERE status='pending' AND reminder_sent_at IS NULL;
CREATE OR REPLACE FUNCTION public.followup_reminder_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF new.remind_at IS NOT NULL AND new.remind_at>new.due_at THEN RAISE EXCEPTION 'Reminder must be at or before the due time'; END IF;
 IF tg_op='INSERT' THEN new.reminder_sent_at:=NULL;
 ELSIF new.due_at IS DISTINCT FROM old.due_at OR new.remind_at IS DISTINCT FROM old.remind_at OR new.assigned_to IS DISTINCT FROM old.assigned_to OR (new.status='pending' AND old.status<>'pending') THEN
  IF new.due_at IS DISTINCT FROM old.due_at AND new.remind_at IS NOT DISTINCT FROM old.remind_at AND old.remind_at IS NOT NULL THEN new.remind_at:=new.due_at-(old.due_at-old.remind_at); END IF;
  new.reminder_sent_at:=NULL;
 ELSIF auth.uid() IS NOT NULL THEN new.reminder_sent_at:=old.reminder_sent_at;
 END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.followup_reminder_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER followups_reminder_guard BEFORE INSERT OR UPDATE ON public.followups FOR EACH ROW EXECUTE FUNCTION public.followup_reminder_guard();
CREATE OR REPLACE FUNCTION public.sync_next_followup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lid uuid:=coalesce(new.lead_id,old.lead_id); ev text; changes jsonb:='{}'; k text; before_row jsonb; after_row jsonb;
BEGIN
 UPDATE public.leads SET next_followup_at=(SELECT min(due_at) FROM public.followups WHERE lead_id=lid AND status='pending') WHERE id=lid;
 IF tg_op='DELETE' THEN RETURN NULL; END IF;
 IF tg_op='INSERT' THEN ev:='created'; changes:=jsonb_build_object('title',jsonb_build_object('new',new.title),'due_at',jsonb_build_object('new',new.due_at),'assigned_to',jsonb_build_object('new',new.assigned_to));
 ELSE
  before_row:=to_jsonb(old); after_row:=to_jsonb(new);
  FOREACH k IN ARRAY ARRAY['title','description','followup_type','due_at','remind_at','assigned_to','status','outcome'] LOOP
   IF before_row->k IS DISTINCT FROM after_row->k THEN changes:=changes||jsonb_build_object(k,jsonb_build_object('old',before_row->k,'new',after_row->k)); END IF;
  END LOOP;
  IF changes='{}'::jsonb THEN RETURN NULL; END IF;
  ev:=CASE WHEN new.status IS DISTINCT FROM old.status THEN new.status::text WHEN new.due_at IS DISTINCT FROM old.due_at THEN 'rescheduled' WHEN new.assigned_to IS DISTINCT FROM old.assigned_to THEN 'reassigned' ELSE 'edited' END;
 END IF;
 INSERT INTO public.followup_history(followup_id,lead_id,actor_id,event,changes) VALUES(new.id,lid,auth.uid(),ev,changes);
 INSERT INTO public.activities(lead_id,actor_id,activity_type,subject,description,outcome) VALUES(lid,auth.uid(),'system','Follow-up '||ev||': '||new.title,changes::text,new.outcome);
 IF (tg_op='INSERT' OR new.assigned_to IS DISTINCT FROM old.assigned_to) AND new.assigned_to IS NOT NULL AND new.assigned_to IS DISTINCT FROM auth.uid() THEN
  INSERT INTO public.notifications(user_id,title,body,link) VALUES(new.assigned_to,'Follow-up assigned',new.title,'/leads/'||lid);
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.process_followup_reminders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f record; sent integer:=0;
BEGIN
 FOR f IN SELECT t.id,t.title,t.lead_id,t.due_at,t.assigned_to FROM public.followups t JOIN public.leads l ON l.id=t.lead_id JOIN public.profiles p ON p.id=t.assigned_to
 WHERE t.status='pending' AND t.remind_at<=now() AND t.reminder_sent_at IS NULL AND p.is_active AND l.archived_at IS NULL
 AND (public.is_admin(p.id) OR l.assigned_to=p.id OR l.created_by=p.id OR EXISTS(SELECT 1 FROM public.lead_shares s WHERE s.lead_id=l.id AND s.user_id=p.id)
 OR (public.is_manager(p.id) AND p.team_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles owner WHERE owner.id=coalesce(l.assigned_to,l.created_by) AND owner.team_id=p.team_id)))
 ORDER BY t.remind_at,t.id LIMIT 1000 FOR UPDATE OF t SKIP LOCKED LOOP
  INSERT INTO public.notifications(user_id,title,body,link) VALUES(f.assigned_to,CASE WHEN f.due_at<now() THEN 'Follow-up overdue' ELSE 'Follow-up reminder' END,f.title,'/leads/'||f.lead_id);
  UPDATE public.followups SET reminder_sent_at=now() WHERE id=f.id;
  sent:=sent+1;
 END LOOP;
 RETURN sent;
END $$;
REVOKE ALL ON FUNCTION public.process_followup_reminders() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_followup_reminders() TO service_role;
COMMENT ON FUNCTION public.process_followup_reminders() IS 'Hourly database-only internal reminders: atomic insert and sent marker, row locks and retry-safe; no external messages. Up to 1000 reminders per invocation.';