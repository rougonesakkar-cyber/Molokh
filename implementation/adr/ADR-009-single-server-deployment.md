# ADR-009: Pilot Deployment Shape

- Status: Accepted
- Date: 2026-09-04

## Context

Закрытый MVP одного зала не оправдывает orchestration cluster. При этом production data и timers требуют backup, process isolation и наблюдаемого deploy.

## Decision

Local/CI используют Docker Compose. Закрытая alpha может работать на одном Linux VM с Caddy, web export, API, worker и PostgreSQL. До живого пилота PostgreSQL выносится в managed service в российском регионе; API/worker остаются на одном VM. Kubernetes не используется.

## Consequences

- Малое число компонентов и автоматический HTTPS.
- Provider-specific configuration остаётся в `infra` и adapters.
- Backup/restore drill обязателен до пилота.

## Revisit when

Несколько independently scaled services и высокая deployment frequency делают Compose измеримо дороже в эксплуатации.
