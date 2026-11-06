CREATE TABLE public.integration_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  ok boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  checked_by uuid,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integration_checks TO authenticated;
GRANT ALL ON public.integration_checks TO service_role;
ALTER TABLE public.integration_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read checks" ON public.integration_checks FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX integration_checks_provider_idx ON public.integration_checks(provider, checked_at DESC);