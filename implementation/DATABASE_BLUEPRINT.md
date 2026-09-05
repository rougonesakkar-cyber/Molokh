# MOLOKH PostgreSQL Database Blueprint

## 1. Principles

- PostgreSQL is canonical business storage.
- Aggregate tables carry `version bigint not null` and timestamps.
- IDs are UUIDv7 generated application-side or by a vetted database function.
- Domain/competition/audit history is append-only.
- State columns use constrained text/domain enums with forward-compatible migrations.
- All business timestamps are `timestamptz`; birth date is `date`; Venue timezone is IANA text.
- Soft visibility/pseudonymization is not deletion of sporting lineage.

## 2. Suggested schemas

```text
identity   social      community   scheduling
session    competition result      governance
platform   projection
```

Schemas are organizational boundaries inside one database, not permission to create cross-module write shortcuts.

## 3. Core tables

### identity

- `users`
- `athlete_profiles`
- `account_verifications`
- `account_access_cases`
- `duplicate_account_cases`
- `duplicate_account_aliases`
- `trusted_sessions`
- `display_name_audit`

Critical constraints:

- partial unique verified normalized phone;
- age 14+ activation check at command layer plus database-consistent birth date;
- duplicate alias cannot self-reference;
- one unresolved access/duplicate case per configured subject scope.

### social

- `likes`
- `matches`
- `blocks`
- `discovery_pair_suppressions`
- `chats`
- `chat_messages`
- `chat_message_revisions`
- `chat_message_user_visibility`

Critical constraints:

- one active directed Like;
- one ACTIVE/ARCHIVED Match per normalized pair;
- one active directed Block;
- monotonic revision number per message;
- unique `(message_id,user_id)` visibility row.

### community

- `venues`
- `communities`
- `community_memberships`
- `role_grants`
- `community_configuration_versions`
- `venue_configuration_versions`
- `community_closure_plans`

Critical constraints:

- one active Community per Venue in MVP;
- one active competitive Membership per User under feature policy;
- one active PRIMARY_ADMIN grant per Venue;
- configuration rows immutable after effective publication.

### scheduling

- `slots`
- `group_offerings`
- `group_plans`
- `bookings`
- `booking_commercial_snapshots`
- `booking_conversion_confirmations`
- `booking_training_retention_confirmations`
- `booking_coach_replacements`
- `resource_calendar_claims`

Critical constraints:

- one confirmed Booking per Slot;
- one live Booking request per normalized pair;
- exclusion constraint for overlapping active Coach ranges;
- optional Venue resource exclusion;
- commercial snapshot immutable after mutual selection;
- Booking/Session Coach assignment updated in one transaction.

Example exclusion shape:

```sql
exclude using gist (
  coach_user_id with =,
  tstzrange(start_at, end_at, '[)') with &&
) where (state in ('PUBLISHED', 'BOOKED'));
```

### session

- `sessions`
- `session_competitive_snapshots`
- `session_coach_assignment_revisions`
- `attendance`
- `venue_operational_incidents`

Critical constraints:

- one Session per confirmed Booking/current conversion context;
- one competitive snapshot per Session;
- `actual_start_at` requires Session state IN_PROGRESS/ENDED;
- READY has `window_opened_at` but no actual start;
- unique attendance per Session/Athlete;
- no overlapping confirmed/READY/IN_PROGRESS Session ranges for one Athlete.

### competition

- `competitions`
- `challenge_queue_entries`
- `challenges`
- `challenge_participant_obligations`
- `challenge_reschedules`
- `ruleset_snapshots`
- `ruleset_acknowledgments`
- `competition_events`
- `status_tenures`
- `pair_cooldowns`
- `voluntary_status_releases`
- `process_holds`

Critical constraints:

- one Competition per Community/age division/future discipline;
- Champion != Contender;
- one live queue entry per Athlete/target slot;
- one live Challenge per Competition/pair;
- one active accepted Official obligation per Athlete globally in MVP;
- one open tenure per Competition/status and one status per User/Competition;
- monotonic unique Competition event sequence;
- one active hold per aggregate/reason.

FIFO index:

```sql
create index queue_fifo_idx
  on competition.challenge_queue_entries
  (competition_id, target_status, submitted_at, id)
  where state in ('WAITING', 'RECONFIRMATION_REQUIRED', 'PAIRED_PENDING_ACCEPTANCE');
```

`submitted_at` and `id` never change when an allowed migration/reconfirmation preserves position.

### result

- `results`
- `result_metadata_revisions`
- `result_decisions`
- `appeals`
- `appeal_responses`
- `appeal_waivers`
- `technical_correction_requests`
- `missing_result_reviews`
- `integrity_cases`

Critical constraints:

- one effective Result per Challenge cycle/context;
- original outcome columns immutable after insert;
- one Appeal history per Result/appellant;
- waiver unique per Result/User;
- one open IntegrityCase per Final Result;
- correction uses ResultDecision, never update of source Result.

### governance

- `moderation_cases`
- `enforcements`
- `enforcement_appeals`
- `youth_challenge_consents`
- `evidence_attachments`
- `evidence_disclosures`
- `membership_removal_decisions`

Critical constraints:

- reviewer conflict checks stored and enforced in command layer;
- one consent per Challenge/Youth Athlete/policy version;
- evidence count/aggregate size enforced transactionally before upload intent;
- disclosure references exact safe derivative/version/recipient/expiry;
- raw identity documents and Result attachments have no tables/endpoints.

### platform

- `domain_events`
- `audit_events`
- `outbox_messages`
- `inbox_receipts`
- `scheduled_jobs`
- `notifications`
- `notification_preferences`
- `platform_incidents`
- `incident_impacts`
- `system_configuration_versions`

Critical constraints:

- unique event ID and idempotency key per command scope;
- unique consumer/event InboxReceipt;
- one IncidentImpact per incident/aggregate/deadline kind;
- append-only audit/domain-event permissions;
- outbox inserted in the same transaction as business change.

## 4. Event envelope columns

```text
event_id uuid primary key
event_name text not null
event_version integer not null
aggregate_type text not null
aggregate_id uuid not null
aggregate_version bigint not null
actor_type text not null
actor_id uuid null
correlation_id uuid not null
causation_id uuid null
idempotency_key text null
pii_class text not null
payload jsonb not null
occurred_at timestamptz not null
```

Payload schemas live in code/version registry. Sensitive payload is separated/encrypted; raw evidence never enters JSON event payload.

## 5. Audit partitioning and retention

- personal Chat revisions: 12 months after last activity unless captured by Case;
- Challenge service Chat/Appeal: 3 years;
- Safety evidence: 3 years after Case close;
- Result/CompetitionEvent/StatusTenure/AuditEvent: indefinite for sporting integrity;
- evidence payload deletion preserves minimal checksum/audit metadata;
- account closure pseudonymizes public identity after 30-day recovery while preserving lineage.

Use time partitioning only after measured volume. Early partitioning is appropriate for `audit_events`, `domain_events`, `outbox_messages` and `notifications`, not every aggregate table.

## 6. Migration rules

1. Forward-only numbered SQL migrations.
2. Add nullable/new representation, backfill idempotently, validate, then enforce.
3. Never rename/remove event meaning without a new schema version.
4. State enum expansion deploys before producers emit the new value.
5. Destructive cleanup is retention-job driven and audited, never part of ordinary deploy rollback.
6. Every migration against queue, status, Booking or Result has replay/concurrency verification in staging.

## 7. Projection strategy

Read-heavy projections may be tables/materialized views:

- discovery candidates;
- current Community status/FIFO;
- profile public stats;
- active user actions/inbox;
- Chat summaries;
- Admin work queues.

Every projection declares canonical source and rebuild command. A projection row may be deleted/rebuilt; canonical aggregate/event rows may not.

## 8. Initial migration sequence

1. platform event/audit/outbox/idempotency foundation;
2. identity/community/roles/config;
3. social/chat;
4. Slot/Booking/resource calendars;
5. Session/Attendance;
6. Competition/Challenge/FIFO/status journal;
7. Result/Appeal/Integrity;
8. Governance/evidence/incidents;
9. projections and retention jobs.
