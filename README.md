# Fudgie-Projects-repository-

## FudgiePie Family Research & Mission Control

A small mobile-friendly TypeScript application focused on completing the family book for Mother's 80th birthday on **November 14, 2026**. It starts empty: no invented ancestors, sample family history, or automatically verified research.

### Run locally

Use **Node.js 24 or newer**. There are no external dependencies or npm downloads required.

```sh
npm run build
npm test
npm start
```

Open http://127.0.0.1:3000. `npm run dev` builds and starts the app; restart it after edits. `npm start` expects a build first. Optional environment variables: `PORT` (3000), `HOST` (127.0.0.1), `DATA_DIR` (data/). Keep the application working directory at the repository root.

### What works

- **Family Research Center:** ancestor, relationship, biography, timeline, discovery, source, and chapter records; dates, investigator ownership, work progress, and chapter approval counts.
- **Clara + Muse Mission Control:** assignments, questions, audits, handoffs, approvals, and completed investigations. Paste original handoff/review text manually. Existing Airtable research can be imported with the local [staging importer](docs/IMPORT.md); there is no automatic assistant integration.
- **Shared Master Archive:** one persistent SQLite database and immutable original file storage. Upload PDFs, newspaper scans, photographs, and research files up to 25 MB. Exact duplicate files reuse one document ID, and both workspaces link the same document or record without copying it.
- Search titles, research text, reviewers' verification statuses, assignees, and citations; the document list filters by filename.
- Named human reviews with a rationale and all five statuses: Confirmed, Probable, Unverified, Conflicting, Disproven. All new records start Unverified, regardless of values supplied to intake.
- Record revisions are kept in the database. Editing a record or adding evidence clears that record's review and book approval. Original uploads cannot be overwritten or deleted through this app.
- Markdown downloads for approved chapters, approved timeline records, and deduplicated source citations. Unconfirmed linked research also prevents a record from being exported, even if its own approval remains set.

### Book-first workflow

1. Upload existing original files. Create Source records for source descriptions and URLs, and link originals with full citations including pages and archive identifiers.
2. Create ancestors and relationships. Use one Discovery or Timeline record **per historical claim**, so each claim has its own verification status. Link each to cited sources. The app does not infer relationships or establish truth.
3. Review source and claim records manually. Confirmation requires linked evidence, a named reviewer, and a rationale. Cite a link-only source by linking it to its relevant research record with a complete citation; upload the underlying original when available.
4. Draft biographies and chapters, linking the individual reviewed claims. The reviewer must check all prose; the software cannot extract uncited claims from free text. Approve a chapter only after its whole text is supported.
5. Track unresolved questions and research work in Mission Control. A work item's Completed status is separate from evidence verification and book approval.
6. Export approved book material and sources, then proofread and typeset for printing. Historical dates are stored as entered (including uncertain dates); timeline ordering uses date text, so use ISO-style dates when possible and manually check chronology.

The approval counter shows chapter approvals, not a guarantee that their evidence is still eligible for export. Revisit linked evidence after research changes. See [setup and operations](docs/SETUP.md), [architecture](docs/ARCHITECTURE.md), and [validation results](docs/TEST_RESULTS.md).

### Next priorities

The staged Airtable handoff can now be imported using [docs/IMPORT.md](docs/IMPORT.md). Outline the book next. Then add chapter ordering/print layout and richer claim-to-paragraph citations. Before family-wide access, configure authenticated private hosting and backups. Typed relationship endpoints, historical date sorting, in-app import UI, concurrent editing protection, and pagination can follow the book's immediate needs.
