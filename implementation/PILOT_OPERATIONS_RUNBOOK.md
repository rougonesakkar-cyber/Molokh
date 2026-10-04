# Molokh Pilot Operations Runbook

This runbook covers the single-Venue closed pilot. It does not grant new product authority:
sporting history is corrected through compensating commands, never by editing or restoring old
rows over the live database.

## 1. Service checks

1. `GET /health/live` proves that the API process can answer.
2. `GET /health/ready` must return `200` before traffic is sent; it includes the PostgreSQL probe.
3. Confirm PostgreSQL is healthy with `docker compose -f infra/compose.yaml ps` locally or the
   managed-service health view in production.
4. Confirm API and Worker logs carry `request_id`, `correlation_id`, actor and aggregate IDs but
   no OTP, bearer/refresh token, phone, guardian contact or evidence payload.

Escalate immediately when readiness is down, the oldest outbox/job delay exceeds five minutes,
an overdue `SCHEDULED` Session has no current-version window timer, or a status/Appeal lock is
stuck after its terminal event. Central may pause affected contours through PlatformIncident; it
must not invent a merits decision.

Run the read-only local monitor with:

```powershell
pnpm monitor:pilot
```

The monitor exits nonzero for liveness/readiness, pipeline, overdue Session/Result or terminal
status-lock failures. Delayed Coach action, Appeal SLA, Missing Result review and backup freshness
are warnings by default; use `./tools/check-pilot-health.ps1 -FailOnWarning` for a strict scheduled
alert. Production should export the same queries as metrics rather than screen-scraping this CLI.

## 2. Backup policy

- Production target: managed PostgreSQL automated backups plus daily logical custom-format dump.
- Pilot objective: RPO at most 24 hours and documented recovery before inviting real users.
- Keep seven daily and four weekly verified backups in encrypted storage outside the application
  VM. Provider-side retention/encryption configuration is a deployment gate, not a repository
  default.
- Alert on backup failure, missing daily backup, checksum failure and restore-rehearsal failure.
- Backup files and checksum sidecars are runtime artifacts under `artifacts/backups/` and are
  ignored by Git.

Create and validate a local custom-format archive:

```powershell
./tools/backup-postgres.ps1
```

The command uses PostgreSQL's consistent snapshot, validates the archive with `pg_restore --list`
and writes a SHA-256 sidecar. It does not stop or mutate the source database.

## 3. Restore rehearsal

Run while the local pilot is quiescent so critical-table count comparison is exact:

```powershell
./tools/rehearse-db-recovery.ps1
```

The rehearsal refuses the live database name, creates only a new `molokh_restore_*` database,
validates SHA-256, restores with `--exit-on-error`, compares canonical critical-table counts and
removes only the successfully verified rehearsal database. A failed rehearsal database remains
available for diagnosis and is never silently overwritten.

For disaster recovery, restore into a new database/service, run migrations and smoke tests there,
then switch the application connection under an approved incident plan. Never use restore as an
ordinary deploy rollback. Code rollback must remain compatible with forward migrations; business
rollback uses explicit compensating events.

## 4. Recovery acceptance record

Record for each pre-pilot rehearsal:

- UTC start/end, operator and source backup timestamp;
- SHA-256 and protected storage reference;
- PostgreSQL/application versions and migration ceiling;
- restore target identity, critical-table counts and smoke-test result;
- measured RPO/RTO, failure notes and follow-up owner.

Projection rebuild remains a separate rehearsal: each rebuildable projection must first declare
its canonical event source, deterministic command and hash comparison. Canonical aggregate,
domain-event, audit and sporting-history tables are never dropped for that exercise.
