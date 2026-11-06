# Verveox CRM security review — 4 November 2026

## Scan status

- The earlier deep scan was already complete, with zero persisted findings; it was stale, not still running.
- A new deep scan completed at 03:29 UTC with zero findings. It was started before this review's edits, so it does not independently certify the subsequent fixes.
- Basic database security checks were rerun after the webhook changes and returned no issues.
- The dedicated dependency scan initially reported 14 advisory rows across six affected dependency families. After updates, it reported no known vulnerabilities in 56 registry-resolved production dependencies. SheetJS's upstream tarball is excluded from that scanner: version 0.20.3 exceeds both reported fixed versions (0.19.3 and 0.20.2), but is not registry-scanner-certified.
- No findings were suppressed and no database policies were weakened.

## Confirmed issues fixed

| Issue / risk                                                                                                                                       | Affected area                                                                    | Fix and evidence                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthenticated webhook body was fully buffered before the size check; oversized traffic could exhaust memory.                                     | `/api/public/meta-webhook`, formerly `request.text()`                            | Stream counts bytes, cancels beyond 1,000,000 bytes, rejects oversized declared lengths before reading. Automated tests cover both paths and invalid UTF-8.                                                                                                                                     |
| Signed webhook JSON lacked runtime structural validation; malformed collections or identifiers could crash processing or supply unexpected fields. | `/api/public/meta-webhook`                                                       | Bounded schema validates nested arrays and numeric identifiers after HMAC verification, strips unknown fields, returns 400 before database writes. Automated nested-shape/bounds tests pass.                                                                                                    |
| Known SheetJS prototype-pollution and regular-expression denial-of-service advisories.                                                             | Excel uploads/exports: `xlsx` 0.18.5                                             | Pinned upstream SheetJS 0.20.3 with lockfile integrity; existing Excel/formula rejection/export safety tests pass. Scanner exclusion remains explicit.                                                                                                                                          |
| Known validator memory exhaustion, serializer script/code injection, YAML CPU exhaustion and source-map CPU exhaustion advisories.                 | `zod`, `seroval`, `js-yaml`, `source-map-js`; direct and transitive dependencies | Upgraded/pinned Zod 4.6.7, Seroval 1.7.7, js-yaml 4.3.2 and source-map-js 1.2.2. Updated record-schema API for Zod 4; all regression tests pass; dependency rescan clear for registry packages. Some YAML/source-map exposure is tooling-related rather than an established public app exploit. |

## Protections independently checked

- **Live catalog:** all 31 public tables have RLS enabled. Anonymous execution is denied for all security-definer functions reviewed. Trigger-only helpers and the reminder processor deny authenticated execution; access helpers and admin-checked transactional RPCs remain callable as intended.
- **Employee negative tests:** a real administrator-owned temporary candidate was invisible and could not be edited. Nine related tables returned no private rows: activities, followups, lead_shares, lead_tags, lead_signals, lead_stage_history, lead_score_history, consent_records and followup_history. Activities and followups held actual fixture rows; other tables were checked without seeded child fixtures.
- **Roles/admin:** employee own role was readable; another user's role was hidden. Direct role changes, self-escalation RPC, account activation changes, privileged reminder processing, Meta status/testing/retry server functions and administrator audit reads were denied. Team page displayed Access denied; candidate page displayed not found/no access. Screenshot evidence was inspected.
- **Export positive/negative flow:** administrator viewed the candidate, generated a selected CSV, downloaded expected content and read saved export history through the UI. Employee could not read that job, call its download function, directly download the actual storage object, create its signed URL, or export the private candidate by ID.
- **Storage:** only `crm-transfers` exists; it is private, capped at 10 MB. Its SELECT policy requires `can_download_transfer(name)`: requester ownership, active account, expiry and current access to every exported candidate. No browser write policy exists. Export links expire after 60 seconds. Existing issued links remain bearer capabilities until expiry; access revocation is not instantaneous for them.
- **CVs:** no CV bucket or CV upload flow exists. Therefore CV permissions cannot be certified; this is missing functionality, not evidence that CVs are exposed.
- **Secrets:** source review/search found service-role access only in server-only code, dynamically loaded after caller authorization or signed-webhook verification. Meta values are read only inside server execution; frontend status exposes configured/missing booleans, not values. No `VITE_` private-key configuration found. This is source/boundary evidence, not a complete published-bundle inspection.
- **Webhook signatures:** unchanged-body valid HMAC passes; modified body, wrong test key, missing signature and malformed signature fail. Tests use non-deployed fixture values only.
- **Duplicate protection:** live catalog confirms UNIQUE `(provider, external_event_id)` on integration_events and partial UNIQUE `meta_lead_id` on leads. The review agent's suspicion that the lead index was missing was rejected using live evidence. Compare-and-set processing claims and uniqueness constraints remain intact; real concurrent Meta delivery was not exercised.
- **Audit provenance:** append-only/server-maintained histories and role guards were inspected. Employee audit read was denied; no audit-write policies added.
- **Anonymous:** candidate reads denied after sign-out.

## Verification results

- 31 automated tests passed across eight files, including five new webhook-security tests.
- Existing transfer tests cover malformed/empty files, bounds, duplicate headers/mapping/contacts, Excel values, formula rejection and injection-safe CSV/Excel output.
- Live employee checks: 27 initial access/UI checks plus actual export-storage denial checks passed.
- Admin candidate/export/read-back flow passed; temporary candidate and child records removed. Test export expired and server cleanup confirmed file_path cleared. Real audit records are retained intentionally.
- Preview build logs repeatedly reported build OK after changes. Every content route was inspected for its own metadata; no metadata edits were necessary.

## Remaining warnings and unresolved risks

1. **Follow-up deep scan needed for these edits.** Completed new deep scan saw the saved pre-edit snapshot; basic checks, dependency rescan, tests and live access checks cover the fixes. A new post-save deep scan can be started in the next turn, not represented as already complete.
2. **Meta external configuration/test:** app secret, shared verification token, Page token, required Page/app permissions, Page subscription and a reachable published callback remain required. No real Graph API retrieval or signed provider delivery was tested. Integration must remain Not connected until the real stored connection test succeeds.
3. **Meta recovery:** scheduled retries/backoff and recovery of events stuck in processing are still missing; a crash can leave an event requiring recovery. Availability risk, not proven privilege bypass.
4. **Published environment:** app is unpublished; published bundle/endpoint behavior, security headers and production traffic limits were not verified.
5. **Exposed test credentials:** previously shared test-account passwords must be changed before production. This review did not rotate them or claim they are safe.
6. **Access matrix:** manager cross-team assignment, inactive account full workflow and simultaneous last-admin changes were not rerun in this review. Prior results are not counted as new evidence.
7. **Infrastructure:** invitation delivery/provider settings, isolated migration replay, backup restore and production-scale performance remain unverified.
8. **Files/retention:** CV uploads are absent; expired transfer cleanup runs on authorized transfer activity rather than a dedicated retention schedule. Expiry denies new access even before physical cleanup.

This review verifies the named checks, not universal production safety or untested integrations.
