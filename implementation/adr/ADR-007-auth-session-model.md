# ADR-007: Phone OTP and Rotating Sessions

- Status: Accepted
- Date: 2026-09-04

## Context

Molokh использует phone-first access, но SMS отправляется только по выбору пользователя. Verification, recovery, duplicate-account и enforcement являются domain workflows и не должны принадлежать внешнему auth SaaS.

## Decision

Использовать сменный OTP transport adapter и собственную server session model: short-lived access token, opaque rotating refresh token, hash в базе и session-family revocation. Web хранит refresh в Secure/HttpOnly/SameSite cookie; native — в Expo SecureStore.

## Consequences

- Auth transport можно заменить без изменения Identity Core.
- OTP endpoints требуют multi-dimensional rate limits.
- Verification status отдельно управляет правом на Challenge.

## Revisit when

Enterprise/social federation становится продуктовой необходимостью. Внешний IdP тогда подключается как identity adapter, а не заменяет Core profile.
