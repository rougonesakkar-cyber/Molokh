# MOLOKH MVP Implementation Pack

**Baseline:** Core Engine v1.0  
**Purpose:** перейти от продуктовой спецификации к исполняемому MVP без повторного принятия уже закрытых решений.

## 1. Source of truth

При конфликте документов приоритет такой:

1. [CORE_ENGINE_SPEC.md](../core-engine-spec/CORE_ENGINE_SPEC.md)
2. [STATE_MACHINES.md](../core-engine-spec/STATE_MACHINES.md)
3. [EVENTS_AND_INVARIANTS.md](../core-engine-spec/EVENTS_AND_INVARIANTS.md)
4. [PERMISSIONS_MATRIX.md](../core-engine-spec/PERMISSIONS_MATRIX.md)
5. [DOMAIN_MODEL.md](../core-engine-spec/DOMAIN_MODEL.md)
6. [ACCEPTANCE_SCENARIOS.md](../core-engine-spec/ACCEPTANCE_SCENARIOS.md)
7. UX copy/layout artifacts

`OPEN_QUESTIONS.md` является decision register: блокирующих вопросов для v1.0 в нём нет.

## 2. Contents

- [ARCHITECTURE.md](ARCHITECTURE.md) — рекомендуемая техническая форма и границы модулей.
- [API_CONTRACTS.md](API_CONTRACTS.md) — command/query API, ошибки, concurrency и realtime.
- [DATABASE_BLUEPRINT.md](DATABASE_BLUEPRINT.md) — PostgreSQL aggregates, constraints, outbox и jobs.
- [IMPLEMENTATION_BACKLOG.md](IMPLEMENTATION_BACKLOG.md) — вертикальные этапы и критерии готовности.
- [TEST_STRATEGY.md](TEST_STRATEGY.md) — модельные, concurrency, replay и acceptance tests.
- [TECHNICAL_SPIKE_STATUS.md](TECHNICAL_SPIKE_STATUS.md) — исполняемый baseline, результаты проверок и локальные environment gates.
- [adr/README.md](adr/README.md) — принятые технические решения и условия их пересмотра.
- [../MOLOKH_MOBILE_UX_CORE_HANDOFF_v1.0.md](../MOLOKH_MOBILE_UX_CORE_HANDOFF_v1.0.md) — синхронизированный UX/Core handoff.

## 3. Recommended baseline stack

Это утверждённый обратимый baseline закрытого MVP; обоснования и revisit triggers находятся в [ADR](adr/README.md):

- runtime/monorepo: Node.js 24 LTS, TypeScript 5.9, pnpm workspaces;
- universal client: Expo SDK 57, React Native 0.86 и Expo Router для Web/iOS/Android и всех ролей;
- API: Fastify 5 modular monolith без NestJS;
- database: PostgreSQL 18;
- SQL access/migrations: `pg`, Kysely и явные нумерованные SQL migrations;
- background jobs/outbox: Graphile Worker и transactional outbox;
- API contracts: TypeBox schemas и OpenAPI 3.1;
- realtime: HTTPS commands + SSE invalidation hints; reconnect всегда refetches canonical projection;
- client server state: TanStack Query;
- tests: Vitest, Fastify inject, Testcontainers/PostgreSQL, Playwright и минимальный Maestro smoke;
- delivery: Docker Compose, Caddy, static Expo web export и EAS internal builds;
- observability: Pino structured logs, health/readiness и risk-focused metrics; OpenTelemetry подключается постепенно.

PostgreSQL-backed jobs предпочтительнее отдельного Redis на MVP: меньше инфраструктуры, а Booking/FIFO/Status транзакции остаются рядом с canonical data.

Отдельные Next.js Admin, WebSocket, Redis, object storage, микросервисы и Kubernetes добавляются только по измеримым триггерам из ADR. Result media и identity-document storage в MVP отсутствуют.

## 4. What may not be improvised during implementation

- статус нельзя менять CRUD-командой;
- Result/CompetitionEvent/AuditEvent нельзя обновлять или удалять;
- UI state не является authorization;
- timer не имеет права применить переход без expected state/version/deadline;
- notification delivery не управляет business deadline;
- Athlete не подтверждает attendance или Result;
- payment/group capacity/Result media отсутствуют в MVP;
- новый спорный продуктовый выбор оформляется versioned decision, а не скрытым кодовым исключением.

## 5. First executable target

Первый vertical slice:

`User → Community → Discovery → Match → Chat → Slot → Booking → SCHEDULED → READY_FOR_COACH → Coach Start/first Attendance → Attendance → Training completion`

Второй vertical slice добавляет:

`Challenge → Booking → Result → provisional status → Appeal/finalization`

Нельзя начинать с реализации всех 300 переходов одновременно. Каждый slice должен проходить свои P0 acceptance-сценарии и оставлять production-shaped audit/outbox foundation.
