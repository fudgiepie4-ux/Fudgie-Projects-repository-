# Validation results — October 11, 2026

- `npm run build`: passed. Browser TypeScript is compiled into dist; no external packages needed. This is type stripping and syntax validation, not a static type check.
- `npm test`: passed, 2 tests with multiple assertions. Covers Unverified intake, rejection of invalid types, evidence prerequisites, prohibition of approving nonconfirmed material, dependency checks in exports, source-list deduplication, revision snapshots, edit review reset, foreign-key validation, original upload/download byte equality, file deduplication, SQLite persistence after reopening, cross-origin rejection, manual Muse handoff intake, static HTML serving, and API responses.
- Tests use temporary SQLite databases and clearly labeled synthetic test records, removed afterward. No test family history is seeded in the application.
- Real localhost HTTP smoke testing was attempted but blocked by sandbox `listen EPERM`. HTTP integration was therefore tested by emitting requests through the actual server's request handler with in-memory request/response streams, without network sockets.
- Browser launch was attempted with installed Chromium and blocked by sandbox socket permissions. Responsive CSS is implemented, but interactive browser and visual verification remain uncompleted. Test the full upload → evidence link → human review → chapter export flow in a browser after running on an unrestricted local machine or protected host.
- No external hosting, authentication, storage service, or assistant connection was tested or provisioned.

GitHub Actions runs the build and the same dependency-free tests on Node 24 on pushes and pull requests. Its results must be checked after the workflow runs; local success is not a claim of CI success.

## Repository save blocker

The connected GitHub read APIs succeeded, but creating the application tree returned HTTP 403, `Resource not accessible by integration`. The remote repository was not changed. The implementation is preserved as a local Git commit and downloadable archive. Reconnect GitHub with content-write access to fudgiepie4-ux/Fudgie-Projects-repository- (and workflow-write access if saving the prepared CI workflow), then push from an authenticated checkout or retry through the connector. Account-level push permission in repository metadata does not establish the integration's write scope.
