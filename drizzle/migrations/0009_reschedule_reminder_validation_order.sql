CREATE OR REPLACE FUNCTION public.followup_reminder_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF tg_op='INSERT' THEN new.reminder_sent_at:=NULL;
 ELSIF new.due_at IS DISTINCT FROM old.due_at OR new.remind_at IS DISTINCT FROM old.remind_at OR new.assigned_to IS DISTINCT FROM old.assigned_to OR (new.status='pending' AND old.status<>'pending') THEN
  IF new.due_at IS DISTINCT FROM old.due_at AND new.remind_at IS NOT DISTINCT FROM old.remind_at AND old.remind_at IS NOT NULL THEN new.remind_at:=new.due_at-(old.due_at-old.remind_at); END IF;
  new.reminder_sent_at:=NULL;
 ELSIF auth.uid() IS NOT NULL THEN new.reminder_sent_at:=old.reminder_sent_at;
 END IF;
 IF new.remind_at IS NOT NULL AND new.remind_at>new.due_at THEN RAISE EXCEPTION 'Reminder must be at or before the due time'; END IF;
 RETURN new;
END $$;