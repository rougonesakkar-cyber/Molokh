# MOLOKH

Molokh — mobile-first продукт для поиска партнёров по тренировкам и прозрачной передачи спортивного статуса внутри Community физического зала.

## Current state

- Core Engine: **v1.0, product decisions closed**;
- state transitions: **300**;
- registered events: **278**;
- acceptance scenarios: **213** (`195 P0`, `17 P1`, `1 P2`);
- open blocking product questions: **0**;
- implementation code: technical stack and M1 critical-command transaction foundation implemented; product vertical slices not started;
- external deployment/accounts: not configured.

Run the consistency check:

```powershell
./tools/validate-spec.ps1
```

## Start here

1. [Product and Core rules](core-engine-spec/CORE_ENGINE_SPEC.md)
2. [Mobile UX/Core handoff v1.0](MOLOKH_MOBILE_UX_CORE_HANDOFF_v1.0.md)
3. [Implementation pack](implementation/README.md)
4. [Implementation backlog](implementation/IMPLEMENTATION_BACKLOG.md)
5. [Test strategy](implementation/TEST_STRATEGY.md)
6. [Technical spike status](implementation/TECHNICAL_SPIKE_STATUS.md)

## Canonical Core pack

- [Domain model](core-engine-spec/DOMAIN_MODEL.md)
- [State machines](core-engine-spec/STATE_MACHINES.md)
- [Events and invariants](core-engine-spec/EVENTS_AND_INVARIANTS.md)
- [Permissions matrix](core-engine-spec/PERMISSIONS_MATRIX.md)
- [Acceptance scenarios](core-engine-spec/ACCEPTANCE_SCENARIOS.md)
- [Decision register and assumptions](core-engine-spec/OPEN_QUESTIONS.md)

## Implementation preparation

- [Technical architecture](implementation/ARCHITECTURE.md)
- [API contracts](implementation/API_CONTRACTS.md)
- [Database blueprint](implementation/DATABASE_BLUEPRINT.md)
- [Milestones and backlog](implementation/IMPLEMENTATION_BACKLOG.md)
- [Test strategy](implementation/TEST_STRATEGY.md)

## Archived/reference artifacts

- `MOLOKH_MOBILE_UX_CORE_HANDOFF_v0.2.md` — archived decision-history snapshot;
- `MOLOKH Core Engine Specification.pdf` — earlier exported snapshot;
- `Molokh MVP User Experience Map.pdf` — earlier UX visualization;
- `Molokh_MVP_Developer_Spec_v1_0.docx` — earlier developer handoff.

The PDF/DOCX artifacts predate the current Core v1.0 and must not override the Markdown source of truth. Regenerate exports only after the implementation team reviews the v1.0 pack.

## Technical workspace

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

The workspace contains one universal Expo client, Fastify API, Graphile Worker seam,
shared TypeBox contracts, pure Core primitives, PostgreSQL adapter/migrations and testkit.
See [technical spike status](implementation/TECHNICAL_SPIKE_STATUS.md) for environment gates.

## Next executable action

Finish the remaining M1 notification projection and observability seams, then implement Identity/Community prerequisites and deliver the ordinary Training vertical slice before the Competition slice. The technology baseline is fixed by the accepted ADR set and changes through a new ADR.
