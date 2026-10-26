# MOLOKH MVP Technical Architecture

## 1. Architectural decision

MVP строится как один universal Expo client, Fastify modular monolith, одна PostgreSQL database, отдельный Graphile Worker process и transactional outbox. Expo выпускает Web/iOS/Android и role-adaptive интерфейсы Athlete, Coach, Gym Admin и Central. Core business transaction не распределяется между микросервисами.

Причина: самые рискованные операции — Booking claim, FIFO activation, Result/status transition и Appeal compensation — требуют row locks, exclusion constraints и атомарного event/outbox commit. Ранние микросервисы сделали бы эти операции сложнее без продуктовой пользы.

## 2. Runtime topology

```text
Web / iOS / Android
  Expo universal client
           │
    HTTPS REST + SSE
           │
           ▼
 Fastify modular monolith
      │             │
      ▼             ▼
 PostgreSQL    Notification adapters
      │
      ▼
 Graphile Worker / timers / outbox
```

Notification, optional SMS and push adapters are ports. Their failure cannot roll back committed business state. Object storage adapter остаётся выключенным, пока в продукте не включено хранение evidence/media.

## 3. Modules

| Module | Owns | May synchronously call |
|---|---|---|
| Identity | User, verification, access recovery, duplicate case | Governance, Notifications |
| Social | Like, Match, Block, Chat/message revisions | Identity query, Notifications |
| Community | Venue, Community, Membership, RoleGrant, config | Identity, Governance |
| Scheduling | GroupOffering, GroupPlan, Slot, Booking | Community permission query, Competition eligibility |
| Session | Session, Coach assignment revision, Attendance | Scheduling, Competition snapshot |
| Competition | Challenge, queue, Competition journal, StatusTenure, Cooldown | Scheduling commands, Governance holds |
| Result | Result, metadata revision, Appeal, correction, IntegrityCase | Competition transition function |
| Governance | ModerationCase, Safety, Enforcement, Evidence, ProcessHold | scoped commands into owning modules |
| Platform | outbox, jobs, notifications, audit, incidents, configuration | adapter ports only |

An aggregate is mutated only by its owning module. Cross-module effects use an application saga with idempotent steps and event causation IDs; no module performs direct SQL updates in another module's tables.

## 4. Transaction boundaries

Atomic transactions required for:

- mutual Like → both Like states + one Match + Chat + outbox;
- host confirm → Slot/resource locks + Booking + Session + outbox;
- accepted Challenge → acknowledgments + participant obligations + deadline + outbox;
- queue head activation → Competition lock + QueueEntry + Challenge/conversion slot;
- Result record → Result + provisional Competition transition + Cooldown + audit/outbox;
- Appeal/Integrity decision → immutable decision + compensation + projection/tenure changes;
- Primary Admin transfer → old/new RoleGrant under Venue lock.

Long-running workflows never hold a database transaction open. They persist state and resume through commands/jobs.

## 5. State engine pattern

Each command handler follows one template:

1. authenticate actor and resolve role/scope;
2. load aggregate with expected version;
3. apply deny/hold/eligibility guards in canonical order;
4. look up an allowed transition by `(machine, state, command)`;
5. calculate immutable event payload and side effects;
6. write aggregate version, event, audit and outbox in one transaction;
7. return a deterministic action-oriented response.

Transition IDs from `STATE_MACHINES.md` are stored in audit/test metadata. Product code must not implement a second hidden transition table in controllers or UI.

## 6. Time and jobs

- canonical time: database/server UTC;
- Venue presentation: IANA timezone;
- intervals: `[start_at,end_at)`;
- every job payload: aggregate ID, expected state/version, deadline_at, policy version, idempotency key;
- worker claim: lease + `FOR UPDATE SKIP LOCKED` or worker-native equivalent;
- stale timer: no domain event, only metric/audit diagnostic;
- pausable clock: deadline adjustment is an explicit event/Impact, not subtraction at query time;
- Cooldown/retention: continuous unless specification explicitly says otherwise.

## 7. Consistency and locking

| Risk | Mechanism |
|---|---|
| two pairs claim one Slot | Slot/resource row locks + unique/exclusion constraints |
| two queue workers activate head | Competition row lock + ordered `SKIP LOCKED` selection |
| duplicate Result | unique effective Result key + idempotency key |
| competing status results | Competition status lock/version |
| command vs timeout | optimistic version + deadline compare-and-set |
| duplicate notifications | outbox ID + consumer InboxReceipt |
| post-final correction | ProcessHold + immutable decision + deterministic journal replay |

## 8. API and client state

The API is command-oriented for mutations and query-oriented for read models. Clients receive:

- current projection;
- `allowed_actions[]` with human render keys;
- actor/deadline summary;
- aggregate version;
- stable error code on rejected commands.

Client does not reconstruct business rules. It can optimistically animate harmless UI, but final state comes from server projection.

Mutations use idempotent HTTPS commands. SSE delivers IDs, versions, counters and invalidation hints only. Reconnect and foreground always refetch canonical query projections; realtime messages are not source of truth. WebSocket requires a separate ADR and measured bidirectional realtime need.

## 9. Security and privacy

- phone/birth date/evidence refs encrypted or access-controlled by field/class;
- no identity-document upload endpoint in MVP;
- evidence media/document upload endpoint отсутствует в MVP;
- trusted device/session IDs stored hashed;
- rate limits by actor, IP/device and command class;
- Central capabilities separate by verification, safety, result integrity and security scopes;
- privileged action requires reason and conflict-of-interest check;
- logs/outbox never include raw evidence, tokens, phone OTP or identity documents.

## 10. Observability

Required dashboards/alerts:

- timer backlog and oldest overdue job;
- outbox delivery delay/failure by adapter;
- Booking claim conflicts;
- queue activation latency and stuck status locks;
- Results pending at 2h/12h/24h;
- Appeals/Safety/Integrity SLA;
- READY_FOR_COACH without Coach action;
- repeated Venue operational failures;
- projection replay hash mismatch;
- evidence quarantine/access failures.

Every trace carries `request_id`, `correlation_id`, `causation_id`, actor and aggregate IDs without sensitive payload.

## 11. Deployment shape

MVP environments: local, preview/test, staging, production. Each environment owns independent database, keys and notification credentials. Local/CI use Docker Compose. Pilot web/API/worker run on one Linux VM behind Caddy; production PostgreSQL moves to a managed service in a Russian region before live pilot. Production API configuration is fail-closed: `DATABASE_URL`, two independent token secrets, pilot Community/Competition IDs, `PUBLIC_WEB_URL`, an HTTPS CORS allowlist and immutable `RELEASE_SHA` are mandatory; local fixtures and static bearer tokens are unavailable. Production migrations are forward-only, reviewed and observable. Rollback of business history uses compensating commands, not database restore or destructive migration.

## 12. Deliberately deferred architecture

- microservices/event broker;
- separate Next.js Admin;
- NestJS / generic CQRS bus / workflow engine;
- WebSocket until measured need;
- Redis-only canonical timers;
- object storage until evidence/media upload is enabled;
- Kubernetes;
- cross-Community/global ranking;
- payment ledger;
- group capacity reservation;
- ML matching/reliability score;
- sport-specific engine plugins;
- external identity-document store.
