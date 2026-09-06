# Technical Spike Status

**Date:** 2026-09-06
**Scope:** approved stack baseline plus the first product-owned Identity vertical slice.

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
| Android native build | APK builds, installs and renders the app through Android tooling | Pass on API 36 emulator |
| iOS native build | EAS internal build or macOS runner | External gate; EAS login and Apple credentials required |
| Source control | local repository supports isolated branches | Pass locally: baseline commit `d8bc793` and CI workflow; remote protection remains external |

## Installed host toolchain

- Node.js 24.19.0, pnpm 11.19.0 and Git 2.55.0.
- Eclipse Temurin JDK 17.0.20.1 at `D:\DevTools\Java\jdk-17.0.20.1+1`.
- Android SDK at `D:\DevTools\Android\Sdk`: API 36, Build Tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, Platform Tools 37.0.1 and Emulator 37.1.11.
- Hardware-accelerated `medium_phone` API 36 AVD under `D:\DevTools\Android\User`; WHPX acceleration passes.
- Expo 57.0.20, Expo Router 57.0.19, Expo development client and EAS CLI 23.2.0.
- WSL 2.7.12, Docker Desktop 29.7.2 and Docker Compose 5.5.0. Docker is installed at `D:\DevTools\Docker\Desktop`, with WSL data configured under `D:\DevTools\Docker\WSL`.

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

WSL 2 and Docker Engine are active. The PostgreSQL 18 container reaches `healthy`, and migration `0001_platform_foundation.sql` applies successfully. The compose volume is mounted at PostgreSQL 18's version-aware data root, `/var/lib/postgresql`.

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

## Boundary

The toolchain, M1 transaction primitive, Sprint 1 Identity exit, Central verification,
Community read/guards and the local Coach/Gym Admin/Primary role lifecycle are implemented.
Production OTP/session handling, account recovery and duplicate-account cases remain M2
hardening. They do not block beginning the local Discovery/Match slice. Training scheduling
has not started yet.

## Verification result

Verified on 2026-09-06:

- frozen lockfile installation and Expo dependency compatibility pass;
- TypeScript checks pass in all seven workspace packages;
- forty-five non-database automated tests pass across Core, DB, API, worker and testkit;
- six additional PostgreSQL transaction/outbox/notification/Identity/Role scenarios pass through the dedicated database gate;
- Fastify publishes OpenAPI 3.1 and both runtime endpoints return HTTP 200;
- Expo produces a static Web export for `/`, `/_sitemap` and `/+not-found`;
- Android native build, install and runtime rendering pass;
- Docker Engine 29.7.2 runs on WSL 2 and the PostgreSQL 18 container is healthy;
- migrations `0001`–`0012`, including Identity, verification, Community and Role integrity guards, apply successfully and are safe to run again;
- the live Web client reads the seeded Athlete, and an actual display-name command replays with the same event and no duplicate mutation;
- the live Web client reads `Molokh Pilot Community`, its active Membership and the exact `ACCOUNT_NOT_VERIFIED` action denial;
- live V-01/V-02 changes that denial to `CREATE_OFFICIAL_CHALLENGE`; exact Central replay returns the original event and no duplicate decision;
- live RG-01/RG-02 authorizes the seeded verified Coach; HTTP retries return the same resource/event and the Coach projection gains `RECORD_COMMUNITY_RESULT` only after acceptance;
- live RG-08/RG-09/RG-10 appoints two Gym Admins, transfers Primary with one active-grant invariant, replays the exact event and restores the deterministic pilot Admin as Primary;
- the Core specification validator reports 300 transitions, 213 acceptance scenarios, zero open questions and zero errors.
