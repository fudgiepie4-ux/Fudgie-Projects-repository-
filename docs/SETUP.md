# Setup and operations

## Local use

Node 24+ is required for native SQLite and TypeScript execution. Run `npm run build`, `npm test`, then `npm start` in the repository root. No npm install is necessary. Browser code is stripped to JavaScript by Node's build utility, with no bundler. SQLite and TypeScript stripping currently produce experimental API notices in Node 24.

The app defaults to localhost. It has **no user authentication or access roles yet**; reviewer names are manually entered, not authenticated identities. Use it locally until private authenticated hosting is configured.

## Hosting still needed

Choose one long-running Node 24 host with a persistent local disk. Set DATA_DIR to a private persistent volume outside the source checkout, preserve the working directory, build on deployment, and start the server. A reverse proxy or hosting identity gateway must require authenticated family access on **every path, including /api and downloads**, and provide HTTPS. Set HOST=0.0.0.0 only behind that protected gateway. Match forwarded Host/Origin values so same-origin checks work. Apply upload and request limits at the proxy too.

Do not deploy this SQLite/local-file version on an ephemeral serverless filesystem. The application explicitly refuses to initialize on Vercel Functions while it depends on local SQLite and filesystem originals; the Vercel pilot's protected preview is **not** a persistent family archive. Do not run several copies with separate data volumes. For larger distributed hosting, migrate the shared schema to managed PostgreSQL and the originals to a private object store, with immutable objects and stable IDs. This is a future migration, not a configured service in this MVP. No persistent hosting, database account, storage account, or assistant connection has been provisioned.

### Required network safeguards before hosting

Local-only default: `npm start` binds to `127.0.0.1` without account authentication. **Never forward that unprotected endpoint to the internet.** To bind `HOST=0.0.0.0` or another non-loopback interface, startup refuses to launch until all of these are set privately by the hosting operator:

- `FUDGIE_AUTH_USER`: an account name for temporary HTTP Basic authentication
- `FUDGIE_AUTH_PASSWORD`: a unique password of at least 16 characters
- `FUDGIE_HTTPS_PROXY_CONFIRMED=YES`: operator acknowledgment that a real TLS/HTTPS reverse proxy or private ingress is in place and direct HTTP access to the Node port is blocked

The acknowledgment **does not implement or verify TLS**. The hosting operator must ensure the ingress actually enforces HTTPS on every route, including `/api` and file downloads, and that the Node port is not directly reachable outside the private ingress. HTTP Basic authentication is only a temporary single-owner gate; it is not a replacement for per-user identities, access roles, sessions, login throttling, or audited sharing. Never paste credentials into chat, documentation, command histories, commits, URLs, or CI logs. Configure secrets through the host's protected environment-variable mechanism.

**Vercel pilot:** The pilot was set to Vercel Authentication `All Deployments` in October 2026. This secures that project's URLs but does not provide persistent database/file storage or turn this local-first Node server into a supported Vercel application. Keep it free of family data until an appropriate persistent architecture is implemented and tested.

## Database and originals

The first server start creates DATA_DIR/archive.sqlite plus DATA_DIR/originals/. SQLite uses foreign keys and WAL. Both modules use the same tables. Originals are named by SHA-256 hash; the database preserves the intake filename and byte size. Downloads use attachment disposition, including for scans and images; browser previews are deferred.

Back up the whole DATA_DIR while the app is stopped, including any WAL/SHM files. Keep encrypted backups outside the server and test restoring them to another DATA_DIR. Backing up only the database does not preserve original files. Never commit DATA_DIR or actual family research to this public repository.

Do not modify originals in place. Upload an altered scan as a new file, link both, and explain the revision in a research record. No delete or overwrite endpoint exists. Record creation, editing, review, and evidence links retain snapshots; user identity enforcement and document metadata revision tooling remain future work.

## Manual assistant intake

Choose Handoff for Muse or Audit for Clara, paste the exact findings, add date and assignee, and upload any original handoff files. Create individual Discovery/Timeline claims from the handoff as separate Unverified records. Link sources and the handoff. Review each claim before including it in a chapter. Completed investigations do not automatically verify their claims.

## Previous stall and recovery

The initial npm install made no progress and produced no installed dependencies. Subsequent network-permission attempts were canceled while waiting; no npm logs appeared in the requested cache. A local probe could not connect to the configured proxy. The execution sandbox also denied localhost listening (`EPERM`) and Chromium socket creation. The existing TypeScript interface, schema, and archive design were preserved and adapted to Node built-ins, avoiding package downloads. Original pre-repair runtime files are saved locally at /workspace/scratch/fudgie-before-dependency-repair (not included in the repo). vite.config.ts is retained as an unused scaffold note.
