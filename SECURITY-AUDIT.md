# Verveox CRM database and persistence audit

> Historical audit. See `SECURITY-REVIEW-2026-11-04.md` for the current security checks, dependency/webhook fixes, private-export evidence and remaining limitations. The browser-only transfer limitations below were superseded by the secure transfer implementation.

## Scope

Reviewed all 27 public application tables, foreign keys, constraints, indexes, policies, security-definer functions, checked-in migrations, CRUD handlers, role management, import/export, and Meta ingestion. No production mock candidate or statistic fallback was found; seeded lead sources and scoring rules are configuration, not fake results.

## Applied fixes

- All application tables have RLS enabled. Anonymous table access is revoked. Operational policies now include a restrictive active-account gate.
- Profiles and roles are scoped to self, authorized team, or Super Admin rather than exposing the entire directory to every active account.
- Managers no longer inherit access to every unassigned lead. Assignment and sharing targets must be active and inside the actor's permitted scope.
- Direct candidate writes use column allowlists. Creator, score, derived contact/follow-up timestamps, integration identifiers, and consent-derived opt-out cannot be forged through the data API.
- Follow-up parent and provenance are immutable. Assignees must have candidate access; completion timestamps are generated consistently.
- System activities cannot be inserted by clients; notes retain their parent, actor and type. Signal membership cannot be updated without recalculation.
- Notification updates are limited to read receipts.
- Ordinary signup always creates an inactive Employee. Public first-signup administrator bootstrapping was removed.
- Role replacement is transactional, admin-checked, and single-role-per-user. Role/profile guards protect the last active Super Admin.
- Missing foreign-key lookup indexes, pending-follow-up lookup index, lead-source FK, campaign date order, nonnegative counters and completion consistency were added.
- Campaign/ad-set/ad attribution must agree. Nullable external campaign IDs have an upsert-compatible unique index.
- Anonymous execution of every security-definer function was revoked; trigger-only functions are not callable by authenticated clients.
- Lead INSERT RETURNING now uses a row-based SELECT policy, fixing an existing creation failure caused by querying the not-yet-visible row through a stable helper.
- Invitations check each persistence result; zero-row edits fail instead of reporting success. Bulk mutations detect partial affected counts.
- Account transitions clear prior-user cached data. Direct navigation to unauthorized sections is blocked in the shell; database permissions remain authoritative.
- Campaign/team totals and follow-up reports page through complete authorized datasets. Filtered bulk target IDs are no longer silently capped by one API page.
- Import duplicate checks fail on query errors, reject conflicting matches and within-file repeated identifiers, and verify job finalization.
- Meta storage failures return retryable errors, failed redeliveries can resume, processing claims use compare-and-set, attribution errors are checked, and campaign upsert uses the matching unique target.

Changes are versioned in `drizzle/migrations/0002` through `0004`. SQL-first custom migrations remain authoritative; the empty Drizzle schema is not suitable for schema-diff generation.

## Executed verification

- Catalog: all **27** application tables have RLS; all inspected security-definer functions deny anonymous execution.
- Browser: Super Admin created and edited a real temporary candidate; both persisted after full refresh.
- Employee: private candidate page, direct SELECT/UPDATE, creator forgery, score mutation, role escalation, follow-up retargeting, forged system activity and forged audit insert were denied.
- Employee positive flow: own candidate creation, follow-up creation/completion, generated completion/contact timestamps and consent withdrawal succeeded. Dashboard total matched the caller's visible candidate count.
- Manager: private out-of-scope candidate SELECT/UPDATE and role escalation were denied.
- Inactive account: candidate, activity, follow-up, import/export job, saved-view and notification reads returned no records; candidate creation and role escalation were denied.
- Anonymous candidate access was denied after sign-out in every role test.
- Super Admin archive, read-back, restore and permanent deletion succeeded.
- All temporary audit candidates were deleted; catalog read-back confirmed zero remaining fixtures. Audit history is intentionally retained.
- Unit tests: **9 passed** across persistence, pagination, export safety, phone normalization and route matching.
- Live role checks are retained in `src/test/security-browser.py`; run against an explicitly minted account, with the private fixture UUID. Tokens are never logged.
- Latest observed preview build reported `build OK`.

## Remaining limitations — not certified complete

- Imports still execute in the browser. Closing the tab can interrupt a job after partial commits. Durable/resumable import execution remains to be implemented.
- Large exports remain browser-generated rather than asynchronous private-storage jobs with expiring links. Existing audit insertion is checked, but client-readable data cannot be made impossible to copy.
- Meta scheduled retry/backoff and stuck-processing recovery are not yet implemented. Real Graph API ingestion, invalid signed webhook traffic and duplicate delivery end-to-end were not tested because Meta credentials are unavailable.
- Hosted signup/provider configuration, fresh signup confirmation, invitation email delivery, last-administrator concurrent demotion and migration replay on an empty isolated database were not exercised in this audit.
- Manager tests used the existing no-team account. Cross-team assignment guards were inspected and implemented, but a full two-team fixture matrix was not executed.
- Backup restoration, retention execution and production-scale performance were not verified.

This audit closes tested access-control and persistence defects; it does not certify every original production acceptance criterion.
