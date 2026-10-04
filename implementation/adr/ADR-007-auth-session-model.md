# ADR-007: Phone OTP and Rotating Sessions

- Status: Accepted
- Date: 2026-09-04

## Context

Molokh использует phone-first access, но SMS отправляется только по выбору пользователя. Verification, recovery, duplicate-account и enforcement являются domain workflows и не должны принадлежать внешнему auth SaaS.

## Decision

Использовать сменный OTP transport adapter и собственную server session model: short-lived access token, opaque rotating refresh token, hash в базе и session-family revocation. Web хранит refresh в Secure/HttpOnly/SameSite cookie; native — в Expo SecureStore.

## Реализация MVP

- OTP challenge: 10 минут, максимум 5 попыток; в БД сохраняется только HMAC verifier.
- Access token: opaque, 15 минут; refresh token: opaque, 30 дней с одноразовой ротацией.
- Повторное использование rotated refresh token отзывает всё session family.
- `LOCAL_DEVELOPMENT` возвращает код только вне production; SMS остаётся opt-in adapter.
- Session, созданная до подтверждённой смены телефона, во время 24-часового hold имеет только
  `SERVICE_RESPONSE_ONLY`; для Challenge это чтение и accept/decline существующего обязательства.
- Web получает refresh только через `HttpOnly; SameSite=Lax` cookie (`Secure` в production), native
  хранит refresh в Expo SecureStore. Universal client восстанавливает session при старте и ротирует
  access за минуту до истечения; Web access token остаётся только в памяти.
- Production не загружает local fixtures или статические bearer-токены. Central adapter сначала
  проверяет database session, затем актуальный `ACTIVE/GLOBAL/CENTRAL_ADMIN` grant; отзыв роли
  прекращает привилегированный доступ без ожидания истечения access token.

## Consequences

- Auth transport можно заменить без изменения Identity Core.
- OTP endpoints требуют multi-dimensional rate limits.
- Verification status отдельно управляет правом на Challenge.

## Revisit when

Enterprise/social federation становится продуктовой необходимостью. Внешний IdP тогда подключается как identity adapter, а не заменяет Core profile.
