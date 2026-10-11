# Backup — how it works

`scripts/backup.sh` backs up the Convex deployment(s) to local disk. It has
three modes. "Egress" below refers to Convex's billed data-egress meter —
every exported/downloaded byte counts, and the free tier is 1 GB/month.

## Modes

| Mode | What it does | Egress per run (prod) | Cadence |
|---|---|---|---|
| `docs` (default) | `npx convex export` of database documents only. Archive: `~/backups/open-voucher/open-voucher-backup-<env>-docs-<date>.zip` | ~10 MB | daily |
| `images` | Incremental: lists vouchers created since a watermark (`internal.adminVouchers:getImageUploadsSince`, bounded by the `_creationTime` index) and downloads each image via `curl` into `~/backups/open-voucher/images-<env>/<storageId>` | a few MB | daily |
| `full` | `convex export` documents **+ all file storage** | ~760 MB (scales with image store, ~749 MB today) | rare — baseline/escape hatch |

Usage:

```bash
./scripts/backup.sh dev              # env only; mode defaults to docs
./scripts/backup.sh prd docs         # daily database snapshot
./scripts/backup.sh prd images       # daily incremental image sync
./scripts/backup.sh prd full         # one-time baseline / recovery snapshot
```

Environment argument is `dev` or `prd` (`prd` passes `--prod` to the CLI).
All output goes to `~/backups/open-voucher/logs/backup-<date>-<env>.log`.

## The watermark

The `images` mode needs no database of its own — it uses one file:
`~/backups/open-voucher/state/<env>-images-watermark`, containing the epoch-ms
`createdAt` of the newest voucher whose image was successfully downloaded.

Each run:
1. Reads it; lists only vouchers with `_creationTime` later than that.
2. Downloads each image (skipping files that already exist — the download is
   keyed by `imageStorageId`, so re-runs are idempotent).
3. Writes back the newest **successfully downloaded** `createdAt`. Failures do
   not advance it, so a crashed run retries the same batch next time.

First run with no watermark file: a 31-day lookback (a voucher cannot live
longer than ~1 month). Anything older should be covered by a `full` baseline.

If you delete the watermark file: harmless, triggers a re-pass that skips
already-downloaded files and re-advances the watermark.

## Restoring

- Database: `npx convex import --prod < unzipped docs tables` — or restore via
  the dashboard from a `full` archive, which contain `_storage` files too.
- Images only: files live at `images-<env>/<imageStorageId>`. The `vouchers`
  doc field `imageStorageId` is the key into this directory. (Manual re-upload
  is not currently scripted; the `full` archive is the recovery path for
  storage.)

## Cron (the machine that runs the job)

```cron
# daily database snapshot (~10 MB)
0 3 * * *  cd /path/to/open-voucher && ./scripts/backup.sh prd docs
# daily incremental image sync (~ a few MB)
10 3 * * * cd /path/to/open-voucher && ./scripts/backup.sh prd images
```

`docs` mode logs a `WARNING` if no `full` archive is newer than 14 days —
that is a nudge to take a baseline, not an error.

Run `full` manually, when you want a single-file recovery artifact of the
entire deployment — it re-streams every image, so it is not a cron item.

`docs` mode logs a `WARNING` if no `full` archive is newer than 14 days —
that is a nudge to take a baseline, not an error.

## Retention (per environment)

- `*-docs-*.zip`: deleted after 7 days
- `*-full-*.zip`: deleted after 30 days
- Legacy archives (no mode marker): deleted after 7 days
- `images-<env>/`: kept indefinitely (files are write-once and small)
- Logs: deleted after 7 days

## Monthly egress budget (free tier: 1 GB)

~30 docs runs × 10 MB + a month of new images (~5 MB/day) ≈ **~450 MB**.
A `full` run costs ~760 MB — schedule it for early in the billing month if
you take one, and don't schedule both `full` and heavy downloads in the same
period.

## Migrating from the old backup (pre-dating this doc)

The old script was a single mode that ran
`npx convex export --include-file-storage` (documents + ALL images) daily.
~1.1 GB egress/day — this was the source of the ~8.9 GB/mo egress problem.

To migrate:

1. **Pull this commit on the backup host.** The old archive names
   (`open-voucher-backup-<env>-<date>.zip`, no mode marker) are treated as
   "legacy" by the new retention rule and age out after 7 days.
2. **Take one `full` run now** (`./scripts/backup.sh prd full`). This is your
   image baseline and the last time the full 749 MB streams. Expect the
   egress meter to take the hit — do it early in the billing month.
3. **Switch the cron** from the old single line to the two lines in the Cron
   section above (`docs` + `images`). If you only do this one, `images` still
   works — the watermark logic covers future uploads — but its ~31-day
   lookback means anything older than 31 days at migration time must come
   from the baseline you took in step 2. Order matters: baseline first,
   then cron.
4. Verify on the first `images` run: log should say
   `0 fetched, N already present` a day or two after migration, and
   `images-<env>/` should contain new files whenever uploads happen.
5. Watch `~/backups/open-voucher/logs/backup-*.log` for the
   `WARNING: no full backup ... in 14+ days` line — it should stay silent
   while your baseline is under 14 days old.
