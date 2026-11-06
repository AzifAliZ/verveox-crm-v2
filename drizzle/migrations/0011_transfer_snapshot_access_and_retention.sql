CREATE OR REPLACE FUNCTION public.can_download_transfer(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.transfer_jobs j WHERE j.file_path=_path AND j.requested_by=auth.uid() AND j.expires_at>now() AND public.is_active_user(auth.uid()) AND (j.kind='upload' OR (j.kind='export' AND j.status='completed' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(j.payload->'leadIds','[]'::jsonb)) x(id) WHERE NOT public.can_access_lead(x.id::uuid)))))
$$;
REVOKE ALL ON FUNCTION public.can_download_transfer(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_download_transfer(text) TO authenticated,service_role;
DROP POLICY transfer_private_read ON storage.objects;
CREATE POLICY transfer_private_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='crm-transfers' AND public.can_download_transfer(name));
COMMENT ON TABLE public.import_jobs IS 'DEPRECATED: new workflows use transfer_jobs; retained for historical records';
COMMENT ON TABLE public.export_jobs IS 'DEPRECATED: new workflows use transfer_jobs; retained for historical records';