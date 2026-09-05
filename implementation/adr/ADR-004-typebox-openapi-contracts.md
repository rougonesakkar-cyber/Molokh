# ADR-004: TypeBox and OpenAPI Contracts

- Status: Accepted
- Date: 2026-09-04

## Context

Web и native client должны получать одинаковые request/response/error contracts. Ручное дублирование DTO, runtime schemas и TypeScript types создаёт drift.

## Decision

Transport schemas хранятся в `packages/contracts` и описываются TypeBox. Fastify использует их для validation/serialization и генерирует OpenAPI 3.1 через `@fastify/swagger`. Expo импортирует статические TypeScript types и маленький typed fetch wrapper.

Domain types не обязаны совпадать с transport DTO.

## Consequences

- Один transport source of truth.
- OpenAPI diff проверяется в CI.
- Тяжёлый generated SDK внутри TypeScript monorepo не требуется.

## Revisit when

Появляются внешние клиенты на другом языке или tooling несовместим с требуемой частью JSON Schema/OpenAPI.
