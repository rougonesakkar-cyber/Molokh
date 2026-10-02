# Technical Spike Status

**Date:** 2026-10-02
**Scope:** stack baseline through governed Membership removal, booked Youth Training retention and the age-18 transition.

## Gates

| Gate | Expected proof | Current state |
|---|---|---|
| Reproducible workspace | Node/pnpm pins and frozen lockfile install | Pass |
| Universal client | one Expo route builds for Web and native | Pass for Web and Android |
| Typed API | Fastify inject test plus OpenAPI 3.1 document | Pass |
| API runtime | real HTTP readiness and runtime projection return 200 | Pass |
| Core isolation | pure concurrency primitive has no framework dependency | Pass |
| Worker seam | Graphile task registry unit test | Pass |
| PostgreSQL foundation | migration applies on PostgreSQL 18 | Pass |
| Critical command transaction | concurrent commit/replay/conflict/rollback plus event/audit/outbox/inbox | Pass |
| Outbox delivery | concurrent lease, retry and Graphile enqueue/deduplication | Pass |
| Timer guard foundation | due boundary, early reschedule and diagnostic-only stale path | Pass |
| Notification projection | atomic event-to-inbox projection, duplicate delivery and read ownership | Pass |
| Request context | validated request/correlation/causation headers, response propagation and safe error mapping | Pass |
| Identity vertical slice | 14+ activation, arbitrary display name, no-document Central verification, public capability projection, API/client path and private audit | Pass |
| Community scope foundation | pilot Venue/Community/Membership, immutable config ownership, role scope guard and universal client projection | Pass |
| Coach authorization slice | scoped 72h invite, invitee-only acceptance, audit/in-app notification and role-adaptive client path | Pass |
| Venue Admin role lifecycle | verified Gym Admin appointment plus serialized first/transfer Primary command and local operator path | Pass |
| Discovery read slice | hard gates, radius-first deterministic order, typed API and universal-client candidate card | Pass |
| Discovery mutation slice | idempotent Like/Skip, expiry timers, atomic Match/Chat and Block/Unmatch preservation | Pass in Core/API/client and real PostgreSQL |
| Personal Chat slice | participant-only history/send, append-only edits, local visibility, Report freeze and typed system actions | Pass in Core/API/client and real PostgreSQL |
| Scheduling publication slice | role-scoped Slot/GroupOffering publish, overlap guard, expiry timers and active-Match Chat cards | Pass in Core/API/client/worker and real PostgreSQL |
| API edge baseline | official CORS/Helmet/rate-limit plugins, DB-backed readiness and secret log redaction | Pass |
| Migration integrity | SHA-256 drift detection for every applied migration | Pass |
| Acceptance traceability | executable `AC-###` tag validation and generated coverage matrix | Pass; 104/213 mapped (`98/195 P0`) as implementation grows |
| Result/Appeal foundation | atomic Coach Result, provisional status, Cooldown, waiver/Appeal, 48h finalizer and Central compensation | Pass in Core/API/client/worker and real PostgreSQL |
| Final Result integrity | evidence-scoped Central review, Competition hold, immutable decision and deterministic status replay | Pass in Core/API/client and real PostgreSQL |
| Status queue foundation | explicit GENESIS/status intent, server-time FIFO, member/outsider projection and no-loss withdrawal | Pass in Core/API/client and real PostgreSQL |
| GENESIS mutual response | atomic first-two pairing, 48h versioned timer, no-fault survivor FIFO return, two-accept obligation and service-Chat scheduling handoff | Pass in Core/API/client/worker and real PostgreSQL |
| Direct-status FIFO activation | strict valid head, current-holder binding, 72h mandatory response, 48h reminder, accepted obligations and appealable refusal/timeout Forfeit | Pass in Core/API/client/worker and real PostgreSQL |
| Holder-change reconfirmation | final-transition reconciliation, preserved FIFO key, 24h versioned timer, manual reconfirm/exit and no-loss expiry | Pass in Core/API/client/worker and real PostgreSQL |
| Voluntary status release | two-step 15m token/version confirmation, ST-09/ST-10/ST-14 projection, preserved Membership/FIFO and no Result/loss/Cooldown | Pass in Core/API/client and real PostgreSQL |
| Voluntary Membership exit | separate two-step 15m preview, no-fault optional-request closure, FIFO invalidation, deterministic status succession/vacancy and terminal `LEFT` Membership; accepted not-started Challenge becomes FINAL administrative Forfeit with waiver/Cooldown and resource cancellation | Pass for no-obligation and accepted-obligation contours in Core/API/client and real PostgreSQL |
| Vacancy succession | Worker revalidation, atomic first-two pairing, visible three-day solo deadline and stale-safe C-03/C-08 promotion | Pass in Core/client/worker and real PostgreSQL |
| Training conversion | ordinary/Contender conversion, strict FIFO, three-party confirmation and no-fault fallback | Pass in Core/API/client/worker and real PostgreSQL |
| Training cancellation/solo | Athlete no-fault withdrawal, two-party one-hour decision, solo conversion or atomic resource release | Pass in Core/API/client/worker and real PostgreSQL |
| Youth consent, booked retention and age transition | independent Challenge-scoped grants, guardian token page, privacy-minimized persistence, acceptance/Booking guards, B-26…B-29 three-party Training retention and one server-boundary `YOUTH→ADULT` timer that preserves started snapshots | Pass in Core/API/client/worker and real PostgreSQL |
| Dependency severity gate | CI rejects unknown high/critical production advisories; published fixes are installed and the exact Expo-CLI `node-forge` advisory has a regression-tested, expiring local backport | Pass with time-bounded upstream exception through 2026-10-16 |
| Android native build | APK builds, installs and renders the app through Android tooling | Pass on API 36 emulator |
| iOS native build | EAS internal build or macOS runner | External gate; EAS login and Apple credentials required |
| Source control | isolated branch, remote PR and CI | Pass on `codex/gym-admin-dashboard`; branch protection remains an external repository setting |

## Installed host toolchain

- Node.js 24.19.0, pnpm 11.19.0 and Git 2.55.0.
- Eclipse Temurin JDK 17.0.20.1 at `D:\DevTools\Java\jdk-17.0.20.1+1`.
- Android SDK at `D:\DevTools\Android\Sdk`: API 36, Build Tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, Platform Tools 37.0.1 and Emulator 37.1.11.
- Hardware-accelerated `medium_phone` API 36 AVD under `D:\DevTools\Android\User`; WHPX acceleration passes.
- Expo 57.0.26, Expo Router 57.0.24, Expo Constants 57.0.20, Expo development client and EAS CLI 23.2.0.
- WSL 2.7.12, Docker Engine 29.8.1 and Docker Compose 5.5.1. Docker is installed at `D:\DevTools\Docker\Desktop`, with WSL data configured under `D:\DevTools\Docker\WSL`.

Java, Android and Gradle caches are redirected to drive D through user environment variables. The pnpm workspace uses `nodeLinker: hoisted`, the layout recommended for React Native and required here to keep Windows CMake/Ninja paths below their limit.

## Verified commands

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd check
pnpm.cmd --filter @molokh/client exec expo install --check
./tools/validate-spec.ps1
pnpm.cmd --filter @molokh/client exec expo run:android --no-bundler
docker compose -f infra/compose.yaml up -d postgres
$env:DATABASE_URL = 'postgres://molokh:local-only-password@localhost:5432/molokh'
pnpm.cmd --filter @molokh/db migrate
pnpm.cmd test:db
```

The Android command produced and installed `app-debug.apk` as package `app.molokh.mobile`. A runtime smoke-test reached `MainActivity` through Metro. The current universal route now renders the functional Identity screen; its Web path has been re-verified against the live API.

## Local PostgreSQL gate

The PostgreSQL 18 gate and compose volume at the version-aware `/var/lib/postgresql` data root are
healthy. Migrations through `0040` and all 27 database integration scenarios pass. On 30 September,
Docker Desktop again encountered an inaccessible `Docker\run\sailor-ingest.sock`; with Docker
stopped, only the transient `Docker\run` directory was moved to the recoverable
`run-quarantine-20260930-202046` path before a clean restart. No project file, WSL data, image or
PostgreSQL volume was reset or modified by the recovery.

Use these commands to start or re-check the local database:

```powershell
docker version
docker compose -f infra/compose.yaml up -d postgres
docker compose -f infra/compose.yaml ps
$env:DATABASE_URL = 'postgres://molokh:local-only-password@localhost:5432/molokh'
pnpm.cmd --filter @molokh/db migrate
```

The remaining external iOS gate starts with `pnpm exec eas login`; no Expo account is currently authenticated on this host.

## M1 transaction foundation

The critical-command primitive now provides:

- a validated command envelope with actor/scope snapshot, expected aggregate version and idempotency key;
- deterministic semantic request hashing without storing the raw idempotency key;
- deterministic name-based IDs for resources created by retryable HTTP commands;
- PostgreSQL advisory-lock serialization for duplicate commands and aggregate writes;
- one transaction for aggregate mutation, domain event, audit, outbox and saved response;
- exact replay, changed-payload rejection, stale-version rejection and Inbox consumer deduplication;
- leased `SKIP LOCKED` outbox claim, bounded retry and Graphile job-key deduplication;
- canonical timer payload and deterministic `NOT_DUE`, `STALE` or `DUE` decision;
- atomic, idempotent in-app notification projection with mandatory/service/social/promotional classes;
- transport request/correlation/causation context, safe structured completion logs and stable public conflict errors;
- a dedicated `molokh_test` database gate that never truncates the development database.

The M1 platform foundation is complete. Product-specific timer and notification producers are added with their owning domain modules rather than as platform-only placeholders.

## Sprint 1 Identity increment

The first product-owned slice now provides:

- a `User` and `AthleteProfile` PostgreSQL model with a database-enforced 14+ activation boundary;
- an arbitrary public display name with immediate change and Central-only append-only name history;
- no public exposure of phone number or birth date;
- explicit capabilities for Discovery, profile editing, ordinary Training and Official Challenge;
- the accepted rule that a phone-confirmed, not-yet-Central-verified Athlete may use Discovery and ordinary Training but cannot create an Official Challenge;
- replaceable authentication through a development-only bearer adapter, without coupling Core to SMS;
- `GET /api/v1/me` and an idempotent, versioned `PATCH /api/v1/me/profile` path;
- a minimal responsive Expo screen that loads the real projection and changes the display name.

The first Sprint 2 increment additionally provides one deterministic local pilot Venue and
Community, an active competitive Membership, immutable configuration ownership, database
guards for the MVP uniqueness limits and a single action-level access projection. The same
projection proves that Coach authority never crosses Community scope, Primary Admin has no
hidden transfer privilege and Official Challenge still requires Central account verification.

The V-01/V-02 workflow is now executable: an Athlete starts verification from the client,
Central reads a permission-protected FIFO queue and approves against an opaque checklist
version. The decision is idempotent, audited and published through the outbox. Neither its
table nor event/audit/outbox payloads contain document or evidence fields. A local Central
script provides the current operator path.

The RG-01/RG-02 Coach workflow is also executable. Central or an active Primary/Gym Admin
in the owning Venue can invite only an active verified account. The 72-hour invitation has
no authority until the invitee accepts it. Permission checks read locked database grants,
the invite relationship is serialized, every administrative reason is audited, and a local
script demonstrates a safe repeatable operator/invitee walkthrough.
The universal client renders an actionable pending invitation and shows the active Coach
capability after acceptance.

The RG-08/RG-09/RG-10 Admin workflow is executable as well. Central can appoint only an
active verified account to the owning Venue. Primary assignment uses a dedicated Venue
aggregate, optimistic version and advisory lock; transfer revokes only the former Primary
grant and preserves the ordinary Gym Admin role. The unique partial index is the final
database guard against two active Primary grants. The universal client exposes role-derived
capabilities, and a repeatable local script restores the deterministic pilot Admin as Primary.

The first M3 read slice projects Discovery directly from canonical Identity/Social data for
the single-Venue pilot. Pure Core owns hard-gate and lexicographic order rules. The radius
tier is exhausted before city expansion; inbound interest and sport overlap are explicit
signals, while recent activity/response buckets remain neutral until canonical inputs exist.
There is no composite reliability score. The API omits private rank buckets and returns only
the visible reasons plus `discovery-mvp-v1`, so the order is reproducible and inspectable.

The first M3 mutation slice now owns the social write path. Like and Skip require a visible
Discovery pair plus idempotency and create event/audit/outbox records. A normalized pair lock
serializes opposing Likes; mutual interest updates both Likes and creates exactly one live
Match plus one personal Chat in the same PostgreSQL transaction. Like and suppression timers
carry state/version stale guards. The universal client keeps the action surface to two buttons,
shows inbound interest directly on the card and adds a Match section only after mutual intent.

## Boundary

The toolchain, platform transaction primitive, Identity/Community/roles, Discovery/Match/Chat,
ordinary Training and direct optional Official Challenge through Coach Result are implemented for
the local pilot. Appeal submission/waiver, non-blocking opponent/Coach responses, appellant
withdrawal, visible one-time SLA extension, Central assignment and reasoned
uphold/reverse/annul/repeat decisions are executable. The 2h/12h/24h MissingResultReview path,
private statements, Venue confirmation and constrained independent-Coach Result are executable.
Final Result IntegrityCase is executable with an independent Central reviewer, neutral public
marker and deterministic status compensation. Explicit GENESIS/status intent, the active-member
FIFO projection, no-loss withdrawal and strict direct-head activation against the current
Contender are executable. A mandatory refusal or timeout is represented by an appealable
administrative Forfeit without inventing a Session. Final holder changes move waiting entries into
a visible 24-hour reconfirmation without changing their FIFO keys. Production OTP/session handling,
recovery/duplicate cases, Membership/account lifecycle and incident hardening remain.

## Verification result

Verified on 2026-10-02:

- frozen lockfile installation and Expo dependency compatibility pass;
- TypeScript checks pass in all seven workspace packages;
- 193 non-database automated tests pass across Core, DB, API, worker and testkit;
- the current PostgreSQL gate passes all 35 integration scenarios, including timer creation, two independent Youth grants, booked-Session Training retention and AC-002/184/185 age-boundary behavior;
- event-driven pending-conversion reconciliation restores the same Training without Challenge,
  obligation, loss or Cooldown when current official eligibility is lost;
- Fastify publishes OpenAPI 3.1 and both runtime endpoints return HTTP 200;
- Expo produces a static Web export for `/chat`, `/`, `/_sitemap` and `/+not-found`;
- Android native build, install and runtime rendering pass;
- Docker Engine 29.8.1 and PostgreSQL 18 are healthy after moving only the inaccessible transient host runtime-socket directory into quarantine; no project, WSL disk or Docker data volume was reset;
- migrations `0001`–`0048` apply successfully with checksum verification; `YOUTH_OFFICIAL` remains disabled by default;
- the live universal client renders the empty GENESIS state, submits a position-1 status intent and withdraws it without loss; the queue immediately returns to empty and no browser error is produced by the flow;
- the live Worker revalidates a fresh GENESIS intent, records the exact three-day single-candidate deadline, projects its mandatory notification and makes the pending timer stale after a no-loss withdrawal; the visible queue returns to empty;
- the live Web client reads the seeded Athlete, and an actual display-name command replays with the same event and no duplicate mutation;
- the live Web client reads `Molokh Pilot Community`, its active Membership and the exact `ACCOUNT_NOT_VERIFIED` action denial;
- live V-01/V-02 changes that denial to `CREATE_OFFICIAL_CHALLENGE`; exact Central replay returns the original event and no duplicate decision;
- live RG-01/RG-02 authorizes the seeded verified Coach; HTTP retries return the same resource/event and the Coach projection gains `RECORD_COMMUNITY_RESULT` only after acceptance;
- live RG-08/RG-09/RG-10 appoints two Gym Admins, transfers Primary with one active-grant invariant, replays the exact event and restores the deterministic pilot Admin as Primary;
- live `GET /api/v1/discovery/cards` returns the second seeded Athlete with `WITHIN_RADIUS`, zero-distance Home Venue context, primary-sport overlap and ranking config `discovery-mvp-v1`;
- live Scheduling HTTP commands publish one future Slot and one GroupOffering, and the authenticated Match Chat returns both with `NO_RESERVATION_BEFORE_HOST_CONFIRMATION`;
- live two-identity commands produce `HOST_CONFIRMATION_PENDING` with two Athlete selections and an immutable `1500.00 RUB` snapshot while the Slot remains `PUBLISHED`; the GroupPlan reaches `NOTIFIED` with `capacityReserved=false`;
- live Coach confirmation changes the Booking to `CONFIRMED_PAIR`, claims the Slot exactly once and creates a `SCHEDULED` Session shown in the active Match Chat;
- live three-party Training conversion changes the same Booking and Session to
  `OFFICIAL_CHALLENGE`, creates one BOOKED Challenge and exactly two active obligations;
- live Athlete Training withdrawal followed by remaining-Athlete and Coach acceptance preserves
  the same Session as `CONFIRMED_SOLO` and keeps the Slot booked without a loss or Challenge;
- a durable versioned timer opens `READY_FOR_COACH` at the scheduled boundary; Coach Start/first Attendance records `actual_start_at`, Coach End records `actual_end_at`, and only ended `PRESENT/LATE` attendance contributes to Training count;
- the generated acceptance matrix maps 104 scenarios (`98/195 P0`) and distinguishes traceability from complete coverage;
- Expo dependency compatibility passes at 57.0.26/57.0.24; Fastify and all patchable transitive advisories are updated. The still-unreleased `node-forge` CVE-2026-85393 fix is backported to `1.4.0`; the audit gate verifies the published regression vector, permits only Expo CLI paths, checks that `1.4.1` is not yet published and expires automatically on 2026-10-16;
- the Core specification validator reports 302 transitions, 288 registered events, 213 acceptance scenarios, zero open questions and zero errors.
