# Architecture

- src/main.ts: mobile-friendly browser interface, explicit manual intake/review forms, workspace routing, search, and chapter counts.
- src/options.ts: common record types and verification vocabulary.
- src/store.ts: input validation, persistent SQLite schema, transactions, revision snapshots, evidence graph, and export eligibility.
- src/server.ts: Node HTTP routes, request limits, same-origin checks, immutable file intake, attachments, and static UI serving.
- scripts/build.mjs: native TypeScript-to-JavaScript stripping for browser files.
- tests/archive.test.ts: database and in-process HTTP handler integration tests using temporary data.

## Shared schema

`records`: ancestors, relationships, biographies, events, discoveries, sources, chapters, and mission work items. Each carries verification and work status; creation always sets Unverified. `links`: a record's cited relationship to another record or an original document (exactly one target). `documents`: ID, original name, hash, byte size, intake date. `revisions`: record snapshots, action labels, manually supplied reviewer names, and timestamps.

Relationships are MVP records linked to the relevant ancestors, with relationship type described in the title/body. Cross-project references use stable record/document IDs and citations. There are no separate project containers or duplicate archive stores. Database foreign keys reject missing targets. File hash deduplication is independent of workspace.

Review confirmation requires linked evidence but does not claim the software evaluated that evidence. Source records and linked claims also require human review. Exports walk the linked record graph and exclude approved records whose dependencies are no longer Confirmed. Cycles are traversed once. New links reset the originating record's review. All edits reset verification conservatively, even workflow-only changes. Historical date text is retained without invented precision.

## Scope and limitations

This is a local-first MVP for a small research collection. No account/role system, bulk importer, automatic Clara/Muse integration, OCR, genealogy graph visualization, inline photo layout, revision rollback, or print-ready PDF generator. Chapters are free text with record-level citations; claim-level structure is created manually in Discovery/Timeline records. Reviewing prose and linking every claim are human responsibilities. Completion of tasks is independent from book eligibility. SQLite is persistent and shared between modules but is not a hosted database service.

Browser compilation strips types; it does not run a static TypeScript type checker. tsconfig.json remains for editors and future tsc checks. Records are fetched as a collection and searched client-side; pagination and full-text indexes are deferred. There is no optimistic concurrency control yet; use one active editor per record. Uploaded originals and previous record snapshots remain preserved.
