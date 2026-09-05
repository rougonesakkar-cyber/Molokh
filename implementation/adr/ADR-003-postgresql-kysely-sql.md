# ADR-003: PostgreSQL, Kysely and Explicit SQL

- Status: Accepted
- Date: 2026-09-04

## Context

Booking, FIFO, Status, Result и Appeal имеют конкурентные инварианты. Они требуют row locks, range/exclusion constraints, partial indexes и атомарной записи event/audit/outbox.

## Decision

Использовать PostgreSQL 18 как canonical business storage, `pg` как driver, Kysely как typed query builder и нумерованные forward-only `.sql` migrations. Критические locks и constraints пишутся явным SQL.

## Consequences

- База активно защищает инварианты, а не только хранит объекты.
- Local, CI, staging и production используют одну major version PostgreSQL.
- ORM abstraction не имеет права скрывать lock order или SQL constraints.

## Revisit when

Только при смене canonical datastore; такое изменение требует отдельного migration plan и доказательства эквивалентных concurrency guarantees.
