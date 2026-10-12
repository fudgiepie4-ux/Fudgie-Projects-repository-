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
- Under **Crosswalk v3**, **350 application records** are eligible for import: ancestors (10), relationships (10), sources (22), assignments (34), and discoveries/leads (274). There are no imported Timeline records from the Activity Log.
- **835 audit-only records** remain in the raw archive: all 516 Activity Log items (365 heartbeats plus 151 operational events), 314 QC reviews, 4 excluded/rejected research results, and 1 excluded candidate. The 2,374 original linked-record references remain in `external_edges` and are not automatically treated as evidence citations.
- The crosswalk term `MissionWork` becomes the app's `Assignment` record kind, while the original term is retained in the preserved mapping.
- Every imported research record starts **Unverified**, with `book_approved=0`. Proposed and final evidence-tier metadata are retained, and the importer includes the final tier and its source in Discovery record details; this is **not** automatic app verification. An `ACCESS GAP` value is labeled as an access condition, not an evidence-strength tier. `Approved` in Airtable is not treated as a confirmed historical fact. Assignment completion remains separate from evidence confirmation.
- The 147 source inventory entries become reference-only `external_inventory` rows. Six over-25 MB PDFs remain at their existing Drive locations; the importer neither splits nor copies them.
- Both records bearing the human key `MDS-0008` remain separate because their stable Airtable record IDs differ.

## Verification and boundaries

An **earlier v1 local import** produced 505 app records, preserving all 1,185 raw records, 2,374 reference edges, and 147 inventory entries; it is superseded by v3. For v3, the expected import is **350 eligible app records plus 835 audit-only**. The regression suite uses synthetic fixtures; a full family-data database import and live browser acceptance test are still pending.

This is **a local import utility**, not a live hosted application, remote sync, or print-ready birthday book. To work in a browser, run the Node application against the imported data directory. The current user interface displays searchable imported records, but it does not yet expose a specialized UI for browsing preserved QC audit tables. Independent reviews, evidence links, and chapter drafting still need dedicated follow-up work.