# Secure lead imports and exports

- Accept bounded CSV and Excel files in private storage, validate them on the server, preview the first rows, and map supported candidate columns.
- Run duplicate checks without changing candidates; offer skip or update existing, reject ambiguous and repeated rows, and preserve existing attribution.
- Save import plans and process locked, resumable batches with real progress, per-row failures and downloadable error reports.
- Generate selected or filtered exports on the server using current record permissions, approved columns and formula-safe cells; retain private, expiring files and export history.
- Test malformed uploads, duplicate choices, resume safety, saved records and unauthorized access.

## Technical details

Use authenticated TanStack server functions, existing database role helpers and RLS, private Lovable Cloud storage, bounded spreadsheet parsing, and transactional batch processing. Import requires Manager or Super Admin; exports are scoped to each active user's readable leads. Temporary files expire after 24 hours, with short-lived download links.
