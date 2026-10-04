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
status-lock failures. Delayed Coach action, Appeal SLA, Missing Result review, overdue Chat
retention and backup freshness are warnings by default; use
`./tools/check-pilot-health.ps1 -FailOnWarning` for a strict scheduled alert. Production should
export the same queries as metrics rather than screen-scraping this CLI.

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
performs a notification shadow rebuild from `notification.in_app.v1` outbox events. The generated
count/hash and Inbox receipts must match the stored projection. `read_at` is deliberately excluded
from the rebuild hash because it is user-owned state, not generated event data. The command removes
only the successfully verified rehearsal database. A failed rehearsal database remains available
for diagnosis and is never silently overwritten.

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

Every additional rebuildable projection must likewise declare its canonical event source,
deterministic command and hash comparison. Canonical aggregate, domain-event, audit and sporting-
history tables are never dropped for that exercise.

## 5. Accessibility and localization

Run the static universal-client gate on every change:

```powershell
pnpm check:a11y
```

It requires explicit roles for every `Pressable`, labels for every `TextInput`, heading levels,
selected/checked state and an announced disabled state. Web static output declares `lang="ru"`,
and interactive controls use at least a 44-point target in the shared compact styles. Text scaling
remains enabled.

Before inviting pilot users, complete the remaining device checks with real assistive technology:

- keyboard-only Web navigation with visible focus and no focus trap;
- browser zoom at 200% without lost actions or horizontal content clipping;
- VoiceOver on the supported iOS build and TalkBack on the supported Android build;
- Dynamic Type / largest system text, reduce-motion and light/dark system settings;
- one Athlete, Coach, Gym Admin and Central critical journey with Russian announcements.

Record device/OS/browser versions and defects. Static conformance is a gate, but it is not a
substitute for screen-reader and dynamic-layout testing on real devices.

## 6. Release rollback

Molokh uses forward-only, immutable database migrations. A code rollback must never delete or
rewrite already-applied schema or business history. Before deploying a previous application
revision, validate it against the live migration ledger:

```powershell
pnpm check:rollback -TargetRef <known-good-git-ref>
```

The gate resolves the target commit, requires every applied migration to exist there, and compares
the exact SHA-256 of every SQL blob with `platform.schema_migrations`. It fails closed when the
target predates an applied migration or contains altered migration history. Passing this check is
necessary, not sufficient: the target revision must still pass its build, startup smoke, API
readiness and `pnpm monitor:pilot` after deployment.

Rollback sequence:

1. stop new application rollout and record the failed and last-known-good Git SHAs;
2. keep PostgreSQL and Worker history intact; take and verify a backup if the incident permits;
3. run the compatibility gate against the last-known-good SHA;
4. redeploy only that immutable application artifact when the gate passes;
5. verify `/health/live`, `/health/ready`, critical role journeys and `pnpm monitor:pilot`;
6. reconcile any in-flight domain work through existing append-only incident/case flows.

If the gate rejects the target, do not use a down migration. Fix forward or deploy a newer
compatible revision. Database restore is disaster recovery into an isolated or replacement
database, not a normal application rollback. Sporting statuses, Results and Appeals are reversed
only through their governed domain transitions.

## 7. Release canary

Every production API process requires `RELEASE_SHA` with the full lower-case Git commit SHA. After
deploying the candidate without yet inviting pilot traffic, run:

```powershell
pnpm check:canary -ApiBaseUrl https://api.example `
  -ExpectedRelease <deployed-git-sha> `
  -ExpectedWebOrigin https://app.example
```

The read-only canary proves process liveness, PostgreSQL-backed readiness, exact release identity,
the universal runtime contract, baseline security headers, the configured browser origin and a
closed unauthenticated boundary on `/api/v1/me`. A release mismatch fails even when health checks
are green, preventing an old or mixed artifact from being mistaken for the candidate.

Only after the canary passes, run `pnpm monitor:pilot` and the four-role critical walkthrough.
Stop traffic promotion on any failure. The local rehearsal must pass once with the correct SHA and
fail once with an intentionally different SHA; this proves the release-identity check itself.

## 8. Chat payload retention

The Worker schedules `cleanup_chat_payloads` daily at 03:15 worker time; keep the pilot VM clock in
UTC. Each run independently reads the currently effective immutable `PERSONAL_CHAT` and
`SERVICE_CHAT` policies and processes at most 500 revision payloads per class with row locks and
`SKIP LOCKED`.

Cleanup never deletes message identity, participants, domain/audit history or moderation Case
snapshots. It nulls only eligible uncaptured payloads and keeps SHA-256, deletion time and policy
version on the revision. Re-running after the same batch is a no-op. `pnpm monitor:pilot` warns when
eligible payloads remain more than 26 hours beyond their retention boundary; investigate Worker
cron/logs and rerun the task through the normal Graphile queue rather than issuing manual SQL.

Attachment evidence remains unavailable in MVP. Do not create a cleanup substitute until the
private object/scan provider and canonical attachment model are enabled together.
