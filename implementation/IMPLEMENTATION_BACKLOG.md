# MOLOKH MVP Implementation Backlog

## 1. Delivery rule

Работа идёт вертикальными slices. Каждый slice включает database migration, domain command, API contract, permissions, audit/outbox, client state, operator path и automated tests. «Backend готов, UI потом» не считается завершённым пользовательским сценарием.

## 2. Milestones

### M0 — Repository and quality foundation

Deliverables:

- Git repository and protected main policy when remote exists;
- pnpm monorepo skeleton;
- `apps/client`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/core`, `packages/db` and `packages/testkit`;
- formatting, lint, typecheck, unit/integration test commands;
- PostgreSQL local environment;
- migration runner;
- CI pipeline template;
- environment/secret conventions.

Exit: clean clone can boot API, database, worker and universal Expo shell; the same client route renders on Web, iOS and Android with one documented workflow.

### M1 — Platform transaction foundation

Deliverables:

- command envelope, actor context, expected version and idempotency;
- aggregate repository pattern;
- domain event/audit/outbox tables and transaction helper;
- worker/timer claim and stale-timer behavior;
- notification inbox projection;
- structured logs/traces.

Exit: sample aggregate command proves commit, replay, conflict, outbox and idempotent consumer behavior.

### M2 — Identity, Community and roles

Deliverables:

- phone authentication adapter boundary;
- User/Athlete profile, arbitrary display name and avatar scan port;
- Central verification without document upload;
- Venue/Community/Membership/config versions;
- Coach/Admin/Primary Admin grants;
- AccountAccessCase and DuplicateAccountCase;
- Central queues for verification, recovery and duplicates.

Exit: verified Adult User joins one Community, sees capabilities and cannot bypass scope/role guards.

### M3 — Discovery, Match and Chat

Deliverables:

- discovery hard gates/tier ordering projection;
- Like/Skip/Match/archive/Unmatch/Block;
- personal/service Chat and structured action cards;
- message edit revisions, delete-for-self and Report freeze;
- 15-day suppression and 30-day Like/archive timers.

Exit: two Users discover, match, chat, block/unmatch with optional cleanup and no accepted/status obligation loss.

### M4 — Scheduling and ordinary Training vertical slice

Deliverables:

- Slot/GroupOffering/GroupPlan;
- mutual selection and immutable commercial snapshot;
- atomic host confirmation/resource conflict handling;
- Coach replacement and external no-fault option;
- Session READY_FOR_COACH, Coach actual Start, Attendance and Training stats;
- solo continuation and Venue operational failure path.

Exit: first complete non-competitive journey works in the universal client, including responsive Web and Coach path, and passes Booking race tests.

### M5 — Challenge, FIFO and Status Engine

Deliverables:

- Challenge matrix/response policies/acknowledgments;
- one accepted Official obligation constraint;
- scheduling/reschedule/Forfeit lifecycle;
- public FIFO, reconfirmation and prebooked conversion;
- GENESIS/Succession/vacancy;
- immutable Session competitive snapshot;
- Competition journal, StatusTenure and Cooldown projections.

Exit: deterministic scenarios cover Ordinary→Contender, TITLE, founding/vacant GENESIS and status transfer under concurrent results.

### M6 — Result, Appeal and governance

Deliverables:

- Coach Result and metadata revisions;
- provisional public status/review marker;
- Appeal/waiver/withdraw/response/SLA;
- compensation and repeat;
- MissingResultReview and reviewer-Coach scope;
- IntegrityCase for Final Result;
- Safety, enforcement, evidence scan/disclosure/retention;
- Central case work queues.

Exit: result can finalize, reverse, annul and repeat without deleting history; replay hash remains deterministic.

### M7 — Youth, lifecycle and incident hardening

Deliverables:

- Youth/Adult hard separation;
- per-Challenge guardian consent without documents;
- 18th-birthday transition;
- Community pause/closure;
- status-only release/Membership exit/removal;
- PlatformIncident exact-overlap compensation;
- account closure/export/retention jobs.

Exit: all lifecycle P0 scenarios pass with no cross-age/status leakage.

### M8 — Release hardening and pilot

Deliverables:

- all P0 acceptance scenarios automated or explicitly mapped to reviewed manual operational tests where automation is impossible;
- load/concurrency/failure testing;
- security/privacy review;
- accessibility/localization review;
- monitoring dashboards/runbooks;
- backup/restore and projection rebuild rehearsal;
- pilot Venue/Coach/Central training.

Exit: Definition of Done in Core Engine v1.0 is satisfied.

## 3. Priority within each milestone

1. P0 integrity and irreversible consequences.
2. Happy path necessary for an end-to-end slice.
3. Recovery/timeout/concurrency path.
4. Admin/observability path.
5. P1 polish.
6. P2 schema seam only; feature stays disabled.

## 4. First sprint-sized backlog

No estimates are assigned before team capacity is known. Recommended order:

| Order | Story | Acceptance |
|---:|---|---|
| 1 | workspace boots API/worker/Postgres and shared contracts | documented local command |
| 2 | critical command envelope with version/idempotency | duplicate returns same event; stale version 409 |
| 3 | event/audit/outbox transaction helper | rollback leaves none; commit leaves all |
| 4 | User/profile/phone capability | no raw OTP/document in logs/data |
| 5 | Venue/Community/Member/Coach/Admin seeds | role/scope guards server-side |
| 6 | Slot publish/query | overlap constraint tested |
| 7 | pair mutual Slot selection | no reservation before host confirm |
| 8 | atomic host confirm | one of two racing pairs wins |
| 9 | READY_FOR_COACH and Coach Start | scheduled time alone creates no attendance |
| 10 | Attendance/end/Training stat | only PRESENT/LATE ended Session counts |

This sprint produces a demonstrable Training slice while establishing the same foundations Competition will use.

### Current implementation progress (2026-09-06)

- Story 1: complete for the local environment; API, Worker, PostgreSQL and universal Expo shell boot successfully.
- Story 2: complete at the Core/platform layer; command envelope, actor snapshot, expected version, stable request hash and actor-command idempotency scope are implemented.
- Story 3: complete at the PostgreSQL primitive layer; aggregate mutation, domain event, audit, outbox and saved idempotent response commit atomically. Concurrent replay, changed-payload rejection, stale version, rollback and consumer Inbox deduplication pass real PostgreSQL integration tests.
- Outbox delivery increment: complete; leased `SKIP LOCKED` claim, bounded retry, crash-safe lease recovery, Graphile job deduplication and Inbox receipt handling are implemented.
- Timer foundation increment: complete; canonical payload, exact deadline boundary, state/version stale guard, early reschedule and diagnostic-only stale path are implemented. Product handlers register with their owning modules.
- Notification/observability increment: complete; event-to-inbox projection is atomic and duplicate-safe, notification reads enforce recipient ownership, and API request/correlation/causation IDs propagate through response headers and structured logs.
- M1 exit: complete at the platform layer.
- Story 4 Sprint 1 increment: complete. The 14+ User/AthleteProfile activation, arbitrary display name, private name audit, local replaceable auth adapter, public capability projection, typed API and minimal universal client run end to end. Phone-confirmed but Central-unverified Athletes can use Discovery and ordinary Training but receive an explicit Official Challenge denial.
- Story 4 remaining production work: real OTP and rotating session adapter, Central account verification workflow, avatar malware/scan port and account recovery/duplicate cases. These do not block local Story 5 work.
- Story 5 foundation: in progress. One deterministic pilot Venue/Community and active Membership now render in the universal client. Database constraints enforce one current Community per Venue, one active competitive Membership per Athlete, immutable configuration ownership and one active Primary Admin. Pure Core guards enforce exact Venue/Community/Global role scope.
- Story 5 remaining: audited/idempotent Coach invitation and acceptance, Central Admin/Primary appointment and transfer commands, deterministic Coach/Admin accounts and an operator path.

## 5. Work that needs product/external input later

- final brand/design system assets;
- OTP/push provider accounts;
- hosting region/vendor and production budget;
- legal terms/privacy/Youth consent wording;
- initial Venue onboarding data and Coach agreements;
- sport-specific recommended ruleset wording;
- App Store/Google Play accounts;
- pilot support staffing and SLAs.

None of these should block local domain/API/database/test implementation.

## 6. Definition of a completed story

- linked canonical transition/invariant/AC IDs;
- migration and rollback-safe forward plan;
- positive, denied, stale-version and duplicate-idempotency tests;
- permission/conflict checks;
- domain event + audit + outbox;
- user-facing next action/error copy key;
- Central handling when applicable;
- observability signal;
- no new unregistered state/event/error code.
