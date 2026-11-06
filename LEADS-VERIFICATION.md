# Leads module verification

## Delivered

- Real database create, view, edit, archive and restore; candidate details, classification, consent, follow-ups, tags and history.
- Search, stable sorting with a unique secondary key, 25-row server-side pagination, URL-persisted filters/page/sort, saved views and column controls.
- Complete filtered selection and bounded bulk assignment/stage/temperature/tag/archive/restore/delete actions, with partial-failure reporting.
- Duplicate checks on both creation and editing use normalized exact email/phone queries without interpolated filter syntax. Candidates are never automatically merged.
- Manager/Admin reviewed merge keeps survivor attribution unchanged, fills only missing personal/education values, combines tags, retains opt-out and archives the source with a snapshot and linked original history. Original follow-ups remain on the source profile rather than silently being retargeted.
- Database-generated candidate create/edit/archive/restore events appear in the activity timeline with readable changed fields.

## Executed checks

- Created 27 temporary database candidates; search returned 27, sorting and page 2 survived refresh.
- Tagged all 27 filtered candidates; tag filtering returned all 27.
- Bulk stage update persisted for 25 selected rows; bulk archive hid all 26 remaining active pagination fixtures and archived filtering found 27.
- Created and edited a candidate through the UI; education details survived refresh and changes appeared in Activity.
- Assigned the candidate to an employee and confirmed assignment after refresh.
- Editing to an existing candidate email displayed a duplicate-review warning without saving.
- Single archive/restore persisted; reviewed merge completed through the UI and linked the original source history.
- Database read-back verified survivor campaign identity plus original source campaign snapshot and merge snapshot remained intact.
- Filtered CSV download contained the real selected candidate.
- Employee accessed the assigned profile and recorded a note that survived refresh. Direct unauthorized SELECT/UPDATE, reassignment and merge were denied; merge controls were absent for employees.
- 12 unit tests passed, including original attribution preservation and deliberate campaign changes/removal.
- Latest observed preview build: `build OK`.
- All temporary candidate, tag, campaign and merge test records were removed; read-back confirmed zero test candidates. Audit logs were retained.

## Boundaries

Existing unrelated import execution, asynchronous exports and live Meta connection limitations remain listed in SECURITY-AUDIT.md. The workflow check does not certify every control against every possible dataset size or every manager team configuration.
