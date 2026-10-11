# Staged Airtable onboarding (October 2026)

This application can import the **existing** Bell & Fudge Airtable staging handoff. The importer adds the data to a local SQLite archive. It never researches new facts, edits the original staging files, or uploads source documents.

## Inputs

Download the following three files from My Drive → Fudgie Projects → Import-Staging:

- `AIRTABLE_EXPORT.json` — all Airtable records, linked IDs, original statuses, and QC detail.
- `IMPORT_CROSSWALK.json` — mapping into application workspaces.
- `SOURCE_INVENTORY.csv` — source-document locations, IDs, hashes where available, and oversize flags.

`ONBOARDING_REPORT.md` is the human report; it is not a required import parameter.

From the repository root, with Node.js 24 or newer:

```sh
node scripts/import-staging.mjs ./data ./AIRTABLE_EXPORT.json ./IMPORT_CROSSWALK.json ./SOURCE_INVENTORY.csv --dry-run
node scripts/import-staging.mjs ./data ./AIRTABLE_EXPORT.json ./IMPORT_CROSSWALK.json ./SOURCE_INVENTORY.csv
npm run build
npm test
npm start
```

`DATA_DIR` must match the directory used by `npm start` (default `./data`). The importer opens and closes SQLite, so run it while the server is stopped. Existing records and documents are left unchanged; rerunning the same import is idempotent. A changed staging file is rejected rather than silently overwriting prior data or reviews.

## Exact mapping and review treatment

- All **1,185 Airtable records** and all three original input-file texts are preserved verbatim in the new SQLite `import_payloads` table; every record and crosswalk mapping is indexed in `external_rows`.
- **505 searchable application records** are created from ancestors (10), relationships (10), sources (22), assignments (34), results and leads (278), and substantive timeline events (151).
- 314 QC reviews, one excluded candidate, and 365 routine heartbeats are retained in the raw archive but omitted from the main research view. The 2,374 original linked-record references remain in `external_edges` and are not automatically treated as evidence citations.
- The crosswalk term `MissionWork` becomes the app's `Assignment` record kind, while the original term is retained in the preserved mapping.
- Every imported research record starts **Unverified**, with `book_approved=0`. Original approval decisions and evidence tiers stay in the preserved export; `Approved` in Airtable is not treated as a verified historical fact. Assignment completion is stored as task progress, not evidence confirmation.
- The 147 source inventory entries become reference-only `external_inventory` rows. Six over-25 MB PDFs remain at their existing Drive locations; the importer neither splits nor copies them.
- Both records bearing the human key `MDS-0008` remain separate because their stable Airtable record IDs differ.

## Verification and boundaries

A local test against Muse's 2026-10-11 handoff produced 505 imported app records and retained all 1,185 raw records, 2,374 reference edges, and 147 inventory entries. A second run produced zero duplicate records.

This is **a local import utility**, not a live hosted application, remote sync, or print-ready birthday book. To work in a browser, run the Node application against the imported data directory. The current user interface displays searchable imported records, but it does not yet expose a specialized UI for browsing preserved QC audit tables. Independent reviews, evidence links, and chapter drafting still need dedicated follow-up work.