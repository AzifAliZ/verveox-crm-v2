-- SELECT RETURNING must evaluate the new row, not re-query it through a stable helper.
DROP POLICY "read leads" ON public.leads;
CREATE POLICY "read leads" ON public.leads FOR SELECT TO authenticated USING (
 public.is_active_user(auth.uid()) AND (
  public.is_admin(auth.uid()) OR assigned_to=auth.uid() OR created_by=auth.uid()
  OR EXISTS(SELECT 1 FROM public.lead_shares s WHERE s.lead_id=id AND s.user_id=auth.uid())
  OR (public.is_manager(auth.uid()) AND (public.same_team(assigned_to) OR (assigned_to IS NULL AND public.same_team(created_by))))
 )
);
CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_active_user(auth.uid()) AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=_lead_id AND (
 public.is_admin(auth.uid()) OR l.assigned_to=auth.uid() OR l.created_by=auth.uid()
 OR EXISTS(SELECT 1 FROM public.lead_shares s WHERE s.lead_id=l.id AND s.user_id=auth.uid())
 OR (public.is_manager(auth.uid()) AND (public.same_team(l.assigned_to) OR (l.assigned_to IS NULL AND public.same_team(l.created_by))))))
$$;