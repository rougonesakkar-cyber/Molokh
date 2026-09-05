# MOLOKH Architecture Decision Records

ADR фиксируют обратимые технические решения для закрытого MVP. Продуктовые правила и Core-инварианты остаются в `core-engine-spec` и имеют более высокий приоритет.

| ADR | Решение | Статус |
|---|---|---|
| [ADR-001](ADR-001-universal-expo-client.md) | Один Expo-клиент для Web, iOS и Android | Accepted |
| [ADR-002](ADR-002-fastify-modular-monolith.md) | Fastify modular monolith без NestJS | Accepted |
| [ADR-003](ADR-003-postgresql-kysely-sql.md) | PostgreSQL 18, Kysely и явные SQL migrations | Accepted |
| [ADR-004](ADR-004-typebox-openapi-contracts.md) | TypeBox и OpenAPI 3.1 как transport contracts | Accepted |
| [ADR-005](ADR-005-graphile-worker-outbox.md) | Graphile Worker и transactional outbox без Redis | Accepted |
| [ADR-006](ADR-006-http-sse-realtime.md) | HTTP commands и SSE invalidation hints | Accepted |
| [ADR-007](ADR-007-auth-session-model.md) | Phone OTP и собственная rotating session model | Accepted |
| [ADR-008](ADR-008-risk-based-testing.md) | Risk-based tests с реальной PostgreSQL | Accepted |
| [ADR-009](ADR-009-single-server-deployment.md) | Compose/Caddy и managed PostgreSQL для пилота | Accepted |
| [ADR-010](ADR-010-version-and-dependency-policy.md) | Stable channels, Node LTS и pinned dependencies | Accepted |

Новое ADR требуется, когда решение меняет runtime topology, source of truth, transaction boundary, security boundary или добавляет новый инфраструктурный компонент.
