# ADR-001: Universal Expo Client

- Status: Accepted
- Date: 2026-09-04

## Context

Один разработчик должен выпустить закрытый MVP на Web, iOS и Android. Раздельные mobile и admin-web приложения создают два UI-стека, две системы маршрутизации и лишний цикл тестирования.

## Decision

Использовать один `apps/client` на Expo SDK 57, React Native 0.86 и Expo Router. Athlete, Coach, Gym Admin и минимальный Central работают в одном role-adaptive приложении. Общими остаются routes, contracts, server state и основные screens; shell и плотные administrative components могут иметь `.web.tsx` варианты.

Отдельный Next.js application в MVP не создаётся.

## Consequences

- Один клиентский release graph и единая терминология.
- Web не обязан визуально копировать mobile: wide layout и keyboard/mouse interaction проектируются отдельно.
- До закрепления новой UI dependency требуется smoke на Web, iOS и Android.

## Revisit when

Central ежедневно выполняет массовые операции с таблицами, экспортом и сложными фильтрами либо требует независимого release cycle.
