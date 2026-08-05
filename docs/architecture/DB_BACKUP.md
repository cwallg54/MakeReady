# Database Backups — Runbook

MakeReady has **two** layers of protection for the Neon Postgres database:

1. **Neon Point-in-Time Restore (PITR)** — built into Neon (paid tier). Covers
   accidental deletes / bad migrations within the retention window. Nothing to
   configure in this repo.
2. **Nightly encrypted offsite backup** — a GitHub Actions workflow
   (`.github/workflows/db-backup.yml`) that runs `pg_dump`, verifies it,
   AES-256-encrypts it, and stores it off Neon. This covers provider-level loss
   and gives portable, long-lived snapshots.

## What the nightly job does

- Runs at **08:15 UTC (~02:15 Mountain)** every day; can also be run on demand
  (Actions → "Encrypted offsite DB backup" → Run workflow).
- `pg_dump --format=custom` (compressed, supports selective restore).
- Integrity-checks the dump (`pg_restore --list`) and fails if it's too small.
- Encrypts with **GPG AES-256** using a passphrase secret (the passphrase never
  touches disk).
- Uploads the `.gpg` as a **GitHub artifact** (30-day retention) — offsite from
  Neon, no extra account needed.
- **Optionally** mirrors to S3-compatible storage (AWS S3 / Cloudflare R2) for
  longer retention, if those secrets are set.

## Required setup (one-time) — GitHub → Settings → Secrets and variables → Actions

> Status: these secrets were configured when the workflow was first set up (a
> real run produced an encrypted artifact). This section is the reference for
> verifying or rotating them. Confirm the latest run is green (see below).

The job **will not run** without these two repository secrets:

| Secret | Value |
|---|---|
| `BACKUP_DATABASE_URL` | The Neon connection string. Use the **unpooled/direct** URL (`...-pooler` removed) — e.g. the value of `DATABASE_URL_UNPOOLED`. Include `?sslmode=require`. |
| `BACKUP_PASSPHRASE` | A strong random passphrase used to encrypt/decrypt the dump. **Store it in your password manager** — without it the backups can't be restored. |

### Optional — mirror to object storage (longer retention)

Set these to also push each backup to S3 / R2 (see the dependency map for the
account you'd create):

`BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`,
`BACKUP_S3_REGION`, and (for R2/other) `BACKUP_S3_ENDPOINT`.

## Verify it's working

- GitHub → **Actions** → "Encrypted offsite DB backup" → the latest run is green.
- The run's **Artifacts** section shows `makeready-db-<timestamp>` (the `.gpg`).
- To test now: click **Run workflow** and confirm it completes.

## Restore procedure

1. Download the `.gpg` artifact from the desired run.
2. Decrypt: `gpg --batch --output makeready.dump --passphrase "<BACKUP_PASSPHRASE>" --decrypt makeready-<stamp>.dump.gpg`
3. Restore into a target database (a fresh Neon branch is safest — never restore
   straight over production without a plan):
   `pg_restore --no-owner --no-privileges --dbname "<TARGET_DATABASE_URL>" makeready.dump`
4. Point the app at the restored database (or promote the Neon branch).

> Test a restore periodically — an untested backup isn't a backup.
