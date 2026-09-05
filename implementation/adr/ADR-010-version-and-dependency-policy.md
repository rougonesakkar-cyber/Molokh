# ADR-010: Version and Dependency Policy

- Status: Accepted
- Date: 2026-09-04

## Context

Свежие major versions могут ломать совместимость трёх платформ. Одновременно слишком старые runtimes увеличивают security и migration risk.

## Decision

Начать spike с Node.js 24 LTS, Expo SDK 57 stable, React Native 0.86, TypeScript 5.9, Fastify 5 и PostgreSQL 18. Package manager и dependency graph фиксируются `packageManager`, runtime file и lockfile. Beta/canary packages запрещены без отдельного ADR.

TypeScript 6.0 рассматривается отдельным upgrade после подтверждения Expo/tooling compatibility.

## Consequences

- Clean install воспроизводим.
- Dependency updates выполняются небольшими отдельными changes с зелёным cross-platform CI.
- Версии повторно проверяются в день scaffold.

## Revisit when

LTS/support status меняется, security advisory требует upgrade или platform store меняет минимальные требования.
