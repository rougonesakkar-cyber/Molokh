# ADR-006: HTTP Commands and SSE Hints

- Status: Accepted
- Date: 2026-09-04

## Context

Realtime нужен для Chat, Booking и Challenge updates, но не должен становиться источником истины или отдельным command protocol.

## Decision

Все mutations выполняются идемпотентными HTTPS commands. SSE доставляет только invalidation hints и counters. После reconnect или foreground client refetches canonical projection. Critical background awareness обеспечивается push adapter.

WebSocket в MVP не используется.

## Consequences

- Одинаковый command path на Web/iOS/Android.
- Потеря realtime connection не ломает business state.
- SSE обязательно проверяется technical spike на трёх платформах.

## Revisit when

Нужны высокочастотные bidirectional presence/typing events либо HTTP+SSE не выполняет измеренный SLO.
