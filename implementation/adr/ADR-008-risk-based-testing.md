# ADR-008: Risk-Based Test Pyramid

- Status: Accepted
- Date: 2026-09-04

## Context

Основные риски — state transitions, time boundaries и races. Процент покрытия или большое количество UI E2E не доказывают их корректность.

## Decision

Использовать Vitest для pure Core, Fastify inject для API, Testcontainers с PostgreSQL 18 для migrations/locks/constraints/races, Playwright для critical Web journeys и 3-5 Maestro smoke flows для native.

Acceptance scenarios распределяются по самому нижнему уровню, который способен доказать правило.

## Consequences

- Все concurrency invariants проверяются на реальной PostgreSQL.
- E2E остаётся малым и стабильным.
- Test clock обязателен для deadline tests.

## Revisit when

Появляется новый runtime boundary или defect class, который текущая pyramid не обнаруживает.
