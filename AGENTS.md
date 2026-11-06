<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Architecture rules

- Permissions are enforced in Postgres RLS + security-definer helpers (`can_access_lead`, `is_admin`, `is_manager`); the UI only hides controls. Why: frontend checks are bypassable.
- Roles live only in `user_roles`; changes go through admin-checked server functions in `src/lib/team.functions.ts` and the transactional `admin_set_user_role` RPC. Why: prevents self-escalation.
- Lead score/temperature are computed by DB triggers from `lead_signals` + `scoring_rules` + `app_settings` thresholds; clients never write `score`. Why: one source of truth, manual override preserved.
- Stage/score history, audit logs, notifications and next_followup_at are written by DB triggers, not app code. Why: can't be skipped or forged.
- Meta Lead Ads arrive at `/api/public/meta-webhook` (signature-verified), are stored in `integration_events` first, then processed idempotently in `src/lib/meta.server.ts`. Why: safe retries, no duplicate leads.
- Meta shows Connected only after a stored, server-run Graph API test (`integration_checks`) passes with all secrets set. Why: secrets alone do not prove Page access or permissions.
- Dashboard metrics come from the SECURITY INVOKER `dashboard_metrics` RPC so RLS scopes aggregates. Why: users only count rows they may see.
- tsconfig relaxes exactOptionalPropertyTypes / index-signature / unchecked-index flags. Why: they fight generated DB types without adding safety here.

- SQL-first Drizzle custom migrations are authoritative; never generate schema diffs from the intentionally empty Drizzle schema. Why: it cannot represent the live SQL schema or its security objects.
- Operational policies include a restrictive active-account gate; relationship/provenance changes are validated in database triggers. Why: row visibility alone does not protect ownership or parent changes.

- Reviewed merges run transactionally in the merge_leads RPC, retain the survivor attribution, and archive the source with an immutable snapshot and linked history. Why: duplicate matching is not proof of identity and conflicting attribution must not be lost.
- Scoring evidence excludes click/impression rules in database guards and recalculation; override-mode-only changes have append-only history. Why: attribution alone must not qualify a candidate and overrides must remain auditable.
- Pipeline moves serialize client writes, condition on the previous stage and archive state, cancel stale reads and refetch after rollback. Why: failed or concurrent moves must not silently overwrite a newer position.
- Internal follow-up reminders run in a bounded, atomic SQL-only scheduler with locked task rows and delivery markers; task history is append-only and derived from triggers. Why: processing works without publishing, retries cannot duplicate reminders, and client edits cannot forge history or delivery.
- Transfers use authenticated server functions, immutable server-written plans, locked transactional import batches and owner-only expiring storage; exports read with caller RLS and recheck snapshot access before download. Why: forged counters, retries and permission changes must not leak or duplicate candidate records.
- Meta webhook security primitives live in a browser-safe pure module; bound incoming bytes before buffering, verify HMAC before schema validation or writes. Why: unauthenticated oversized bodies must not exhaust memory, and validation must be independently testable.
- SheetJS uses the patched upstream distribution pinned in the lockfile; security overrides pin validation/serialization transitive dependencies. Why: the registry SheetJS release and older transitive versions contain known advisories.
