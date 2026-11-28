# Changelog

For each release, add an English `## <version> — YYYY-MM-DD` entry with a summary and non-empty `###` sections. On pushes to `main`, the release workflow compares `package.json` with the version before the push, validates the lockfile and this entry, runs full verification, publishes the container, and uses this entry as the GitHub Release body.

## 0.1.0 — 2026-11-28

The first release of comic-dl-web: a shelf-first, single-user Web UI for comic-dl, designed to run continuously on a NAS or home server. Downloads and update checks run on the server; closing the browser does not stop them. This release brings together the initial application, download and shelf milestones, source marketplace, comic-dl 4.x integration, administrator authentication, three interface languages, online PWA installation, and container deployment.

### Shelf and automatic updates

- Use the home page as a cross-source shelf, with covers, detailed and compact views, and responsive controls. Add works from source details or by link/short ID; editions from different sources remain separate.
- Configure automatic catalog checks and automatic downloads independently, with global and per-work intervals. Manual checks can include works whose automatic checks are disabled.
- Establish a baseline on the first successful check instead of unexpectedly downloading an entire collection. Explicitly download historical chapters or enqueue discoveries that were recorded while automatic downloading was disabled.
- Persist watcher queues in the core SQLite shelf and resume after restarts. Inspect queued, completed, failed, and restricted chapters, cancel tasks explicitly, and retry after resolving problems.
- Keep completed archives when a work is removed. Run only one watcher per shelf, including when sharing a database with the CLI.

### Sources, browsing, and credentials

- Bundle five source adapters: CopyManga, Zerobyw, DM5, Komga, and Kavita. Browse, search, aggregate results by source, use source-defined sorting/filtering/pagination, and open work details with available covers and metadata.
- Use `comic-dl@4.1.0` through its published APIs rather than invoking the CLI or importing internal modules. Bundled adapter baselines are CopyManga/Komga/Kavita `0.3.0`, Zerobyw `0.3.1`, and DM5 `0.2.1`.
- Provide source settings and address-bound credential storage when Web management is enabled. Saved secrets are not echoed into pages; protected Komga/Kavita covers are read through a same-origin server endpoint.
- Offer a read-only extension market by default. Administrators can opt into installing trusted npm packages, checking updates without applying them, explicitly applying updates, and uninstalling managed packages.
- Let managed versions override bundled adapters. Uninstalling restores the bundled adapter; image upgrades do not implicitly upgrade managed packages. Web-saved bundled-adapter credentials are not injected into managed replacements.

### Downloads, progress, and archives

- Download a complete work, selected chapters, inclusive chapter ranges, or recognized direct chapter links. Validate selections against the current catalog before submitting them.
- Combine manual and watcher activity in a download drawer grouped by source and work, with chapter numbers, stages, page progress, cancellation, retry, and pageable results.
- Deliver live updates through SSE and recover current snapshots after reconnecting. Retry only eligible chapters without redownloading successful ones; a chapter failure does not hide the rest of the batch.
- Write readable `{title}/{number}-{chapter}.cbz` paths by default. Support CBZ/ZIP, number padding, validated path templates, and canonical full-catalog numbering.
- Verify archive identity and integrity before skipping existing files. Preserve recognized older hashed archives; changing a template or format does not rename existing output.
- Preview archive renames for a work or the entire shelf, then apply only after explicit confirmation. Refuse occupied destinations, pause watcher activity during application, and invalidate stale previews.
- Select only existing relative directories beneath the administrator-controlled output root. Optional mount-marker protection defers watcher downloads when the output becomes unavailable instead of creating replacement directories.

### Administrator access, languages, and PWA

- Enable optional administrator sign-in with `COMIC_DL_WEB_ADMIN_PASSWORD`. Business pages, APIs, covers, assets, and SSE require authentication when enabled; installation metadata and icons remain public.
- Check write/login origins, limit repeated login failures, use HTTP-only cookies, and enable Secure cookies for a configured HTTPS origin. Offer browser-session login or 30-day “Remember me”; restart invalidates all sessions.
- Recover expired sessions during page navigation, fetcher actions, and SSE by returning to sign-in. Provide explicit logout for shared devices.
- Support Simplified Chinese, English, and Japanese, with a one-year browser language preference. Translate application-owned UI only, not source content or user input.
- Provide light, dark, and system appearance plus an installable PWA using the project icon. The app opens the shelf in a standalone window and remains subject to administrator authentication.

### Deployment and first run

- Provide a Node.js 24 multi-stage Docker image for `linux/amd64` and `linux/arm64`, running as a non-root user with a credential-free local HTTP health check.
- Include Compose with configurable numeric UID/GID, a read-only root filesystem, temporary `/tmp`, persistent `/data` and `/downloads`, loopback-only port publication by default, and a 90-second shutdown grace period.
- Require an explicit administrator password and pre-existing bind directories in Compose. Include `.env.example` and a host-Nginx HTTPS/SSE configuration.
- Publish a fixed-version GHCR image and a GitHub Release when the package version changes on `main`, after application and native dual-architecture container verification. No floating `latest` image is published.

After publication, use the Compose and documentation files from the `v0.1.0` source tag:

```sh
git clone --branch v0.1.0 https://github.com/yinyanfr/comic-dl-web.git
cd comic-dl-web
cp .env.example .env
chmod 600 .env
# Edit .env: IMAGE=ghcr.io/yinyanfr/comic-dl-web:0.1.0
# Set existing data/comic directories, numeric UID/GID, and a strong password.
docker compose config --quiet
docker compose pull
docker compose up -d
```

The default endpoint is `http://127.0.0.1:3000` on the host. Prefer localhost, a trusted LAN, or a VPN; direct public exposure is not recommended. For HTTPS reverse proxies, explicitly set `COMIC_DL_WEB_ADMIN_ORIGIN` to the exact browser-facing origin.

### Documentation and verification

- Provide separate usage and deployment guides in Simplified Chinese, English, and Japanese, with NAS storage, credentials, proxying, PWA installation, backup, upgrades, rollback, and migration instructions.
- Documentation entry points: [Usage](https://yinyanfr.github.io/comic-dl/en/webui/usage/) and [Deployment](https://yinyanfr.github.io/comic-dl/en/webui/deployment/). If the main documentation site has not yet synchronized, use the [versioned usage guide](https://github.com/yinyanfr/comic-dl-web/blob/v0.1.0/docs/en/webui/usage.md) and [deployment guide](https://github.com/yinyanfr/comic-dl-web/blob/v0.1.0/docs/en/webui/deployment.md).
- Cover downloads, shelf recovery, settings, credentials, extension lifecycles, authentication/session recovery, languages, PWA metadata, archive migration, and output guards with offline unit and browser tests.
- Exercise the actual container with Compose protections, persistence, background downloads without a browser, local-registry npm installation/update/uninstall, graceful shutdown, and Nginx TLS/Origin/Secure-cookie/SSE checks.
- Local pre-release validation passed 31 unit tests, including release-version and changelog validation, 23 browser tests including the optional output-marker scenario, and four container scenarios each on native arm64 and emulated amd64. Native amd64 CI, registry publication/pulls, and real-device/NAS acceptance are separate checks, not implied by those local results.

### Compatibility, upgrades, and known limits

- Requires Node.js 24 for source deployments. Container platforms are amd64 and arm64, not ARMv7. This is a single-user, single-process application, not an online reader or a multi-instance scheduler.
- Manual queues and task history are process-local and do not survive restart. Completed files remain; watcher queues persist. Live page counters restart with a new attempt.
- PWA use is online-only: no Service Worker, offline cache, or offline reading. Installation generally requires HTTPS, except localhost/loopback.
- When upgrading a pre-release installation using a 3.x core shelf, stop all writers and back up SQLite, settings, managed extensions, and archives. The core migrates the database to schema v3; older cores require restoring a matching backup to roll back. Archive renames require a separate preview/confirmation and are not a batch transaction.
- Zerobyw chapter access requires a valid Cookie. Real source access depends on upstream availability, account permissions, and network conditions; real Komga/Kavita instances, NAS storage recovery, external-reader page order, and desktop/mobile PWA behavior still need environment-specific acceptance.
- A healthy container only means the local HTTP manifest responds, not that sources, output storage, or the watcher are healthy. Install only trusted extensions: packages execute with the service's permissions.

[Development history](https://github.com/yinyanfr/comic-dl-web/commits/v0.1.0/).
