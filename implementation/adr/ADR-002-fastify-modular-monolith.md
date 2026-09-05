# ADR-002: Fastify Modular Monolith

- Status: Accepted
- Date: 2026-09-04

## Context

Core Molokh требует явных transaction boundaries, стабильного порядка guards и объяснимых переходов. Для одного разработчика DI-контейнер, decorators и framework-specific CQRS увеличивают число слоёв без изменения этих гарантий.

## Decision

Использовать Fastify 5 напрямую. Каждый domain module регистрируется Fastify plugin и содержит явные routes, commands, queries, policy, repository и events. Composition root связывает зависимости без reflection-based container.

NestJS, generic CQRS bus, workflow engine и динамический rule DSL в MVP не используются.

## Consequences

- Command handler и транзакция остаются видимыми в коде.
- Модульность обеспечивается plugin encapsulation и ownership таблиц, а не микросервисами.
- Повторяемый handler template и architectural tests становятся обязательными.

## Revisit when

Команда существенно выросла и единый DI/runtime standard измеримо уменьшает стоимость сопровождения.
