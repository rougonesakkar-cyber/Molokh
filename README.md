# MOLOKH

Molokh — mobile-first продукт для поиска партнёров по тренировкам и прозрачной передачи спортивного статуса внутри Community физического зала.

## Current state

- Core Engine: **v1.0, product decisions closed**;
- state transitions: **300**;
- registered events: **278**;
- acceptance scenarios: **213** (`195 P0`, `17 P1`, `1 P2`);
- open blocking product questions: **0**;
- implementation code: M0/M1 and Sprint 1 Identity complete; Sprint 2 now includes the pilot Venue/Community schema, Membership projection and scoped role guard;
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
7. [Roadmap and sprint plan](implementation/ROADMAP_AND_SPRINT_PLAN.md)

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
pnpm.cmd install --frozen-lockfile
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
```

The workspace contains one universal Expo client, Fastify API, Graphile Worker seam,
shared TypeBox contracts, pure Core primitives, PostgreSQL adapter/migrations and testkit.
See [technical spike status](implementation/TECHNICAL_SPIKE_STATUS.md) for environment gates.

### Run the local Identity slice

Open three PowerShell terminals in the repository root:

```powershell
docker compose -f infra/compose.yaml up -d --wait postgres
```

```powershell
pnpm.cmd dev:api
```

```powershell
pnpm.cmd --filter @molokh/client web
```

Then open `http://localhost:8081`. The development API creates one deterministic local
Athlete and authenticates the client through a replaceable local bearer adapter. No SMS
or production credential is required for this local slice.

## Next executable action

Complete Central verification and role-grant commands for the seeded pilot Community, then proceed to Discovery/Match. The technology baseline is fixed by the accepted ADR set and changes through a new ADR.
