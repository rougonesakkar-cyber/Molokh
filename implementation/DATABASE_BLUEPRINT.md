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
- `duplicate_account_case_users`
- `duplicate_account_processes`
- `duplicate_account_aliases`
- `trusted_sessions`
- `user_sensitive_action_holds`
- `display_name_audit`
- `age_division_transitions`
- `account_closure_requests`
- `account_data_exports`

Critical constraints:

- partial unique verified normalized phone;
- age 14+ activation check at command layer plus database-consistent birth date;
- duplicate alias cannot self-reference;
- one unresolved access/duplicate case per configured subject scope;
- phone-change approval creates one exact 24-hour sensitive-action hold; trusted old sessions
  remain service-response-only until the hold expires and are then revoked;
- duplicate review stores every affected status/obligation and its explicit disposition;
  choosing a canonical User never rewrites sporting history or transfers status;
- one immutable `YOUTH→ADULT` transition per User; its timer aggregate advances only `0→1`.
- one live `REQUESTED` closure and one live `REQUESTED/READY` data export per User;
- closure pseudonymization event is immutable; export expiry nulls payload but preserves SHA-256.

### social

- `likes`
- `matches`
- `blocks`
- `discovery_pair_suppressions`
- `chats`
- `chat_messages`
- `chat_message_revisions`
- `chat_message_user_visibility`
- `chat_message_reports`

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
- `booking_official_conversions`
- `booking_conversion_confirmations`
- `booking_training_retentions`
- `booking_training_retention_confirmations`
- `booking_coach_replacements`
- `booking_host_rejections`
- `resource_calendar_claims`

Critical constraints:

- one confirmed Booking per Slot;
- one live Booking request per normalized pair;
- exclusion constraint for overlapping active Coach ranges;
- optional Venue resource exclusion;
- commercial snapshot immutable after mutual selection;
- one live Official conversion per Booking and one immutable decision per required role;
- one retention process per booked Official lineage and one immutable decision per Athlete/Coach-host role;
- Booking/Session Coach assignment updated in one transaction.

Example exclusion shape:

```sql
exclude using gist (
  coach_user_id with =,
  tstzrange(start_at, end_at, '[)') with &&
) where (state in ('PUBLISHED', 'BOOKED'));
```

Migration `0016_scheduling_publication.sql` implements `slots`, `group_offerings`, the active
Coach exclusion, publication indexes and structured commercial/contact fields. Migrations
`0017`–`0018` add pair-owned Booking intent, informational GroupPlan, one-live-intent indexes
and database guards for immutable commercial/offering snapshots. Migration
`0019_booking_confirmation_session.sql` adds ordinary Sessions; host confirmation claims the
Slot and creates exactly one Session in the same transaction. `0020_session_lifecycle.sql`
aligns it with the formal state machine: it starts as `SCHEDULED`, receives
`window_opened_at` from a versioned server timer, and only then becomes `READY_FOR_COACH`.
That migration also adds immutable-per-Athlete Attendance facts and separate actual start/end
timestamps. `0021_backfill_session_window_timers.sql` schedules timers for Sessions confirmed
before the lifecycle increment was deployed. `0057_reissue_current_session_window_timers.sql`
repairs any still-`SCHEDULED` Session whose current version has no matching window timer. Normal
Training→Official, pair→solo and Official→Training commits publish that replacement timer in the
same transaction as the version-changing Session event, so the migration is recovery rather than
the steady-state mechanism.

`0022_coach_replacement_and_no_fault_cancellation.sql` adds append-only Booking and Session
Coach assignment history plus explicit cancellation actor/reason timestamps. Replacement keeps
Venue, time and the immutable commercial snapshot unchanged while updating the booked Slot and
Session in one transaction. External or replacement-rejection cancellation keeps all lineage,
but removes the Slot from active capacity and creates no attendance/statistics.

`0028_gym_admin_schedule_mutations.sql` stores one immutable, reasoned host rejection per
Booking. Future Slot and GroupOffering edits/withdrawals continue to use the aggregate version,
domain-event, audit and outbox transaction; active pair intent is checked under the locked
schedule aggregate before a mutation can commit.

`0029_appeal_participation_and_sla.sql` stores immutable response, withdrawal and SLA-extension
facts. The original Appeal deadlines remain source facts; projections expose the extension as the
effective due date. One `(Appeal,responder)` response, one withdrawal and one reasoned 24h/48h
extension are database-enforced for the pilot.

`0047_booking_training_retention.sql` records the B-26…B-29 bridge after a booked Official
Challenge closes before start. It preserves the original Challenge ID outside the converted
Booking/Session, requires three immutable role decisions, and bounds `PENDING` by the earlier of
one hour or scheduled start. Confirmation converts purpose to `TRAINING`; decline/expiry cancels
the physical resources without Competition effects.

`0048_age_division_transition.sql` stores one append-only transition per User and backfills one
UTC 18th-birthday timer for every existing Youth Identity with event lineage. The command moves
Identity and current Membership to Adult, closes not-started Youth Official work no-fault,
expires consent and affected FIFO, releases Youth status without a Result/loss/Cooldown and opens
B-26 for an eligible confirmed future Booking. Started Sessions, competitive snapshots,
Challenges and obligations are intentionally excluded from those pre-start mutations.

`0023_competition_challenge_foundation.sql` creates the first Competition contour and direct
optional Challenge persistence: immutable ruleset snapshots and acknowledgments, one live
Challenge per pair, one globally active accepted obligation per Athlete, append-only optional
decline quiet periods and the pair-cooldown seam used by later Result processing.

`0024_official_challenge_booking_link.sql` adds explicit nullable Challenge lineage to Booking
and Session. Database checks require `TRAINING` rows to have no Challenge and
`OFFICIAL_CHALLENGE` rows to have one; an index permits only one active Slot request per
Challenge while retaining rejected/expired Booking history.

`0025_official_session_competitive_snapshot.sql` creates the one-per-Session immutable
competitive snapshot. It records both planned and scheduled-boundary effective stakes together
with status holders/version, frozen rules/config references, Venue, Coach, pair and logical time.
The snapshot is created at `READY_FOR_COACH`, referenced by actual Start/End events and cannot be
updated or deleted.

`0026_result_appeal_status_foundation.sql` adds one Result per Challenge cycle, immutable source
facts, Appeal/waiver records, append-only provisional status transitions and append-only
finalization proofs. It also links decisive Results to pair Cooldown, locks Competition status
while the 48-hour Appeal window is open and indexes both the finalization timer and Central queue.

`0027_central_appeal_decisions.sql` adds independent review start metadata, immutable Appeal
decisions and immutable status-transition compensations. Source Result fields remain protected;
`UPHOLD` appends finalization proof, while reverse/annul/repeat append an exact from/to status
record tied to the decision. Cooldown invalidation and a repeated Challenge cycle remain ordinary
transactional projections rather than history rewrites.

`0028_gym_admin_schedule_mutations.sql` and `0029_appeal_participation_and_sla.sql` add reasoned
schedule mutation history plus append-only Appeal responses, withdrawal and one-time visible SLA
extension. `0030_missing_result_review.sql` adds one structured review per Challenge/Session,
append-only Athlete statements and one append-only Venue confirmation. Assignment and resolution
shape checks prevent Central from becoming a Result author and constrain the independent Coach to
  the evidence-derived outcome.

`0031_final_result_integrity_case.sql` adds the exceptional post-Final contour: immutable
IntegrityCase source facts, one live case per Result, an independent reviewer assignment,
append-only decisions and append-only status compensation with deterministic replay hash. A
Competition carries at most one active integrity hold. Challenge obligations gain an explicit
cycle number so an eligible post-Final repeat creates a new cycle without deleting the released
history of the previous one.

`0032_status_queue_foundation.sql` aligns the Competition phase vocabulary with the canonical
state machine and creates `challenge_queue_entries`. A partial unique index permits only one live
intent per Athlete/target, while the partial FIFO index fixes ordering to immutable server
`submitted_at` plus `queue_entry_id`. Direct intents have no hidden expiry; terminal withdrawal is
explicit and retains its audit/event history.

`0033_genesis_mutual_response.sql` adds append-only per-candidate GENESIS decisions with one
decision per Challenge/User and exact linkage back to the FIFO entry. `0034_genesis_booking_without_match.sql`
allows an accepted official Booking to originate from the Challenge service Chat without fabricating
a Discovery Match; ordinary training Bookings still require their real Match lineage.

`0035_booking_match_or_challenge_guard.sql` makes that lineage invariant explicit: every Booking
must reference either a real Match or an Official Challenge. `0036_administrative_forfeit_context.sql`
permits a mandatory-response Forfeit Result and its status transition without inventing a Session,
competitive snapshot, Venue, Coach or recorder; Session-origin Results retain all of those required
facts. Both forms remain immutable, appealable and auditable.

`0037_voluntary_status_release.sql` adds the two-step Champion/Contender status-only release.
The PREVIEWED row freezes the current holders, status version, exact ST-09/ST-10/ST-14 consequence
and a SHA-256 confirmation-token hash. CONFIRMED is terminal and immutable. The transactional
command changes only the Competition projection, retains ACTIVE Membership, creates no Result,
loss or Cooldown, and converts waiting direct entries to GENESIS candidates without changing
their FIFO identity or submission time.

`0038_genesis_single_candidate_window.sql` adds a nullable solo-window timestamp to a WAITING
GENESIS queue entry and rejects every incompatible state/kind shape. The Worker records the
window through a versioned queue event, publishes an exact three-day timer and clears it whenever
the entry pairs or closes. The due command locks the Competition and queue, requires exactly one
still-valid candidate and applies `GenesisWithoutOpponent` or `SuccessionWithoutOpponent` without
creating a Result, loss or Cooldown.

`0039_booking_official_conversion.sql` adds the canonical Training-to-Official conversion and
its immutable Athlete/Coach decisions. Direct requests have an exact capped deadline;
Contender-bearing requests link one `PREBOOKED_CONVERSION` QueueEntry and remain ordinary until
strict-head activation. Terminal decline/expiry/invalidation preserves the source Training,
whereas the final required acceptance atomically links the existing Booking and Session to a new
BOOKED Challenge. The migration is checksum-managed and passes the live PostgreSQL gate.

`0040_booking_solo_continuation.sql` adds the one-hour, two-party decision after an Athlete
withdraws from a not-yet-started ordinary Training. The cancelling Athlete receives no loss,
Forfeit, Cooldown or statistic. The remaining Athlete and assigned Coach each decide once;
both accepts preserve the same resources as `CONFIRMED_SOLO`, while decline or expiry closes the
Booking and Session and releases the Slot atomically. A live Training-to-Official conversion is
invalidated before the solo decision opens. All branches are versioned, audited and covered by
real PostgreSQL scenarios.

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
- `genesis_candidate_responses`
- `challenges`
- `challenge_participant_obligations`
- `challenge_reschedules`
- `ruleset_snapshots`
- `challenge_ruleset_acknowledgments`
- `competition_events`
- `status_tenures`
- `pair_cooldowns`
- `status_transitions`
- `status_transition_finalizations`
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
  (competition_id, target_status, submitted_at, queue_entry_id)
  where state in ('WAITING', 'RECONFIRMATION_REQUIRED', 'PAIRED_PENDING_ACCEPTANCE', 'ACTIVATED');
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
- `missing_result_statements`
- `missing_result_venue_confirmations`
- `integrity_cases`
- `integrity_decisions`
- `integrity_status_compensations`

Critical constraints:

- one effective Result per Challenge cycle/context;
- original outcome columns immutable after insert;
- one Appeal history per Result/appellant;
- waiver unique per Result/User;
- one open IntegrityCase per Final Result;
- Integrity evidence/source facts, decision and status compensation are append-only;
- correction uses IntegrityDecision plus deterministic replay, never update of source Result;
- one Competition integrity hold points to the case currently under review;
- one MissingResultReview per Challenge and Session;
- Athlete statements and Venue confirmations are append-only and unique per role-owned source;
- review source facts are immutable; resolution and the resulting Challenge/Result transition
  commit in one transaction.

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
- Youth consent persists only a token-keyed contact hash/mask plus consent audit hash; the raw delivery
  destination is transient outbox data and guardian accounts/documents remain absent;
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
- `incident_timeout_compensations`
- `system_configuration_versions`

Critical constraints:

- unique event ID and idempotency key per command scope;
- unique consumer/event InboxReceipt;
- one IncidentImpact per incident/aggregate/deadline kind;
- immutable timeout compensation linked to the source timeout event, Result, optional status
  transition, exact replay hash and compensating event;
- append-only audit/domain-event permissions;
- outbox inserted in the same transaction as business change.

Migrations `0049`–`0052` materialize the incident contour. Pausable deadlines remain on their
own aggregates and are updated under the same optimistic version lock as their
`IncidentImpact`: Challenge response/scheduling, Booking selection, status-queue reconfirmation,
Training-conversion confirmation and persisted GENESIS `single_candidate_deadline_at`.
`competition.challenges.scheduling_extension_count` is constrained to `0..1`, making CH-24's
single seven-day extension and CH-25's later no-capacity cancellation database-observable.

Migration `0053_account_closure_export_retention.sql` adds versioned retention policies,
`identity.account_closure_requests` and `identity.account_data_exports`. Closure and optional
export request commit atomically; an existing live export is reused. Worker preparation stores a
private JSONB snapshot and schedules exact +48h expiry. Expiry nulls only `export_payload`, while
SHA-256, policy version, domain event and audit lineage remain. Final closure locks the User and
request, rechecks every blocker and pseudonymizes public identity in the same transaction as U-04.

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
- account-export payload: 48 hours after READY; checksum and audit/event lineage remain.

Migration `0058_chat_payload_retention.sql` makes revision payloads independently erasable while
retaining SHA-256, deletion time and the exact policy version. The daily Worker uses whole-Chat
last activity, locks eligible Chat/message/revision rows, skips every message captured by a moderation
report and cleans at most 500 rows per class/run. Personal and Challenge-service payloads therefore
follow their 12-month/3-year policies without deleting message identity, Case evidence or audit and
sporting history.

Migration `0059_membership_invites.sql` stores only SHA-256 invite-token digests. Venue QR and
direct invite resources have an explicit expiry, optional use limit and atomic use counter; raw
tokens never enter domain events, audit metadata, projections or API responses.

Membership rejection uses the original `community_memberships` privacy split: the Athlete-facing
projection, event and notification contain only a neutral public category and the seven-day
`reapply_not_before_at`; the internal reason code and optional Case reference remain in the private
row/audit path. Request withdrawal moves only the PENDING record to `LEFT` and creates no loss,
cooldown or reapply delay.

Use time partitioning only after measured volume. Early partitioning is appropriate for `audit_events`, `domain_events`, `outbox_messages` and `notifications`, not every aggregate table.

`athlete_profiles.home_venue_id` is a preference pointer, not Competition ownership. A versioned
Home Venue change writes one Identity event/audit/outbox line and leaves Membership, status tenure,
FIFO entries, Challenge and sporting history untouched; those remain scoped by Community.

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
