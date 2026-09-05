# ADR-005: Graphile Worker and Transactional Outbox

- Status: Accepted
- Date: 2026-09-04

## Context

Challenge deadlines, reminders, finalization и notification delivery требуют фонового выполнения. Второй datastore увеличивает эксплуатационную сложность и не улучшает correctness пилота.

## Decision

Использовать Graphile Worker поверх той же PostgreSQL и собственный transactional outbox. Jobs выполняются at least once; каждый handler идемпотентен и проверяет expected state/version/deadline. Redis в MVP отсутствует.

## Consequences

- Event/outbox commit атомарен с business state.
- Повтор job или notification безопасен.
- API и worker являются отдельными production processes.

## Revisit when

Измеренная нагрузка PostgreSQL jobs не выполняет SLO после индексации и настройки либо появляется workload с принципиально другой моделью доставки.
