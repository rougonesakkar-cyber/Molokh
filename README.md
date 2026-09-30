# MOLOKH

Molokh — mobile-first продукт для поиска партнёров по тренировкам и прозрачной передачи спортивного статуса внутри Community физического зала.

## Current state

- Core Engine: **v1.0, product decisions closed**;
- state transitions: **300**;
- registered events: **278**;
- acceptance scenarios: **213** (`195 P0`, `17 P1`, `1 P2`);
- executable acceptance traceability: **86/213** (`80/195 P0`);
- open blocking product questions: **0**;
- implementation code: M0/M1, the local Identity/Community/role slices, M3 and the ordinary Training slice M4 are complete; M5 runs optional, GENESIS and strict-FIFO mandatory Official Challenges through Booking/Result, provisional status movement, Cooldown and finalization; M6 includes Appeal submission/waiver, opponent/Coach responses, appellant withdrawal, transparent SLA extension, Central decisions and the complete MissingResultReview path with an independent reviewer-Coach;
- database gate: PostgreSQL 18 migrations `0001`–`0040` and **27/27** integration scenarios pass locally;
- dependency gate: Expo patch releases are aligned and the production audit has no high/critical advisories;
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

### Run the local Discovery/Match/Chat slice

Open four PowerShell terminals in the repository root:

```powershell
docker compose -f infra/compose.yaml up -d --wait postgres
```

```powershell
pnpm.cmd dev:api
```

```powershell
pnpm.cmd dev:worker
```

```powershell
pnpm.cmd --filter @molokh/client web
```

Then open `http://localhost:8081`. The development API creates deterministic local
Athlete, Coach, Gym Admin and Central accounts plus five temporary Discovery profiles.
Use **«Сменить»** in the development-only **«Тестовый аккаунт»** panel to move between
them without restarting Expo. No SMS or production credential is required for this local slice.
The Discovery card now has only two actions: Like and Skip. Mutual Like creates one Match
and its personal Chat atomically; the worker owns the 30-day Like and 15-day suppression
timers. From the Match section, open `/chat` to send and edit personal messages, hide a
message only for yourself, report another User's message and render system action cards as
structured data rather than parsed text.

To test a real mutual Like manually, Like another Athlete, switch to that Athlete through
the same panel, and Like the first account back. Both sides will then see the Match and Chat.
The five temporary profiles are isolated local fixtures in `apps/api/src/server.ts` and can
be removed together after pilot testing.

To create the deterministic two-user Match through real HTTP, keep API and worker running:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\create-local-mutual-match.ps1
```

The script is idempotent. Refresh the client to see the Match. Use **«Сменить»** to view
the opposite side without restarting the client.

To exercise Central verification, press **«Отправить на верификацию»** in the client and,
while the API is running, execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\approve-local-verification.ps1
```

Press **«Проверить обновления»** in the client. The account and Community projections will show
that Official Challenge is available. The local operator uses a separate Central token;
no document or user file is uploaded or stored.

To exercise the two-sided Coach authorization, keep the API running and execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\activate-local-coach.ps1
```

Central creates a 72-hour invitation for the deterministic verified Coach account, and
the script accepts it as that account. Re-running the script is safe and reports the
already active grant. The API always rechecks actual database roles and never trusts a
role claimed by the local token or request body.

To configure the deterministic Gym Admins and ensure one Primary Admin for the pilot
Venue, keep the API running and execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\configure-local-venue-admins.ps1
```

The script is safe to run again. It appoints only missing Venue-scoped grants and uses the
current Primary aggregate version for an atomic appointment or transfer. To inspect Coach,
Gym Admin or Central access in the universal client, use **«Сменить»**. The client opens
Community automatically for those test accounts.

To publish one future personal Slot and one GroupOffering for the local Match Chat, first
activate the Coach and configure the Venue Admins as above, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\publish-local-training-options.ps1
```

The script is idempotent for the current day. Open the Match Chat and press **«Обновить»**
under **«Куда пойдём?»**. One Athlete can propose a personal Slot or GroupOffering and the
other can confirm the highlighted card. To execute both local identities through real HTTP:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\create-local-training-intent.ps1
```

After both Athletes select the same personal Slot, switch to **«Пилотный тренер»** and open
Community. **«Подтвердить тренировку»** atomically claims the Slot and creates a
`SCHEDULED` Session. At the scheduled time the server opens `READY_FOR_COACH`; only then can
the assigned Coach record actual Start and Attendance. Switch back to either Athlete to see the
confirmed plan. A second pair racing for the same Slot is rejected without creating a second
Session.

Before Coach/Gym Admin confirmation, the personal Booking remains
`HOST_CONFIRMATION_PENDING`, with a frozen price and terms snapshot, while the Slot remains
unreserved. The GroupPlan becomes `NOTIFIED`, sends an in-app notice to the Venue Admin and
still makes no capacity or statistics claim.

Gym Admin can edit or remove future personal Slots and GroupOfferings directly from Community.
The action is intentionally refused after a pair has started choosing that publication, so terms
already shown in Chat never change silently. Coach or Gym Admin may also reject a pending host
request only after choosing a reason; both Athletes are notified. For an Official Challenge the
same action returns the participants to Slot selection and preserves the original deadline.

If Docker Desktop reports an inaccessible `sailor-ingest.sock`, do not use factory reset.
First restart Windows. If the socket remains inaccessible, stop Docker Desktop and move only
the exact `%LOCALAPPDATA%\Docker\run` runtime directory aside before one clean restart. The
project and PostgreSQL volume are separate and remain unchanged.

Gym Admin also sees confirmed Sessions in Community. Before actual start the Admin can appoint
the seeded **«Резервный тренер»** without changing Venue, time or commercial terms. Either
Athlete may reject that replacement and close the Session without a penalty; if no operational
replacement exists, Admin can close it as an external no-fault failure. All three records remain
auditable and no cancelled Session contributes to Training statistics.

Before a Training starts, either Athlete can also withdraw from that Training without a loss,
Forfeit, Cooldown or Training statistic. The remaining Athlete and assigned Coach receive one
hour to confirm a solo Session. Two acceptances convert the same Booking/Session to
`CONFIRMED_SOLO`; a decline or timeout atomically cancels the Booking and Session and releases
the Slot. Any pending Training-to-Official conversion is invalidated first, so an ordinary
cancellation can never create a competitive consequence.

Every seeded Athlete is verified and has an active competitive Membership in the single pilot
Community. Open an active Match Chat to create a direct optional **Official Challenge**. The
recipient may accept or decline without a loss, while the initiator may withdraw before the
response. The ruleset is frozen when the invitation is created; acceptance atomically creates
one active obligation for each Athlete and starts the 14-day scheduling deadline. An unanswered
invitation expires after 48 hours through the Worker with no sporting consequence.

After acceptance, either Athlete selects a published personal Slot in the same simple Chat flow.
The Booking is explicitly linked to the Challenge and moves it to `BOOKING_PENDING`; the peer
confirms the same Slot, while the Slot remains unreserved. One Venue/Coach confirmation then
atomically claims the Slot, creates one `OFFICIAL_CHALLENGE` Session and moves the Challenge to
`BOOKED`. Selection expiry or a resource race returns the Challenge to scheduling with its
original deadline and obligations intact.

At the scheduled boundary, the Worker opens the Coach window and freezes one immutable
competitive snapshot with roles, planned/effective stake, rules/config, Venue, Coach and
participants. This does not assert attendance. Coach Start or first Attendance atomically moves
the Session to `IN_PROGRESS` and Challenge through `CH-13` to `IN_SESSION`; Coach End moves the
Session to `ENDED` and Challenge through `CH-14` to `RESULT_PENDING`. Ordinary Training keeps no
Challenge transition and only ended `PRESENT/LATE` attendance contributes to Training statistics.

After an Official Session ends, the assigned non-participant Coach chooses the winner, draw or
no-contest directly in the Session card. Recorded Attendance narrows a one- or two-person
`NO_SHOW` to the only valid outcome. The same transaction creates the immutable Result, moves
Challenge through `CH-15`, applies any provisional Champion/Contender transition, starts the
configured pair Cooldown and schedules finalization exactly 48 hours later. The eligible Athlete
may submit Appeal or explicitly waive it. A decisive Result finalizes early when its sole eligible
loser waives; draw/no-contest requires both eligible Athletes. Otherwise the versioned Worker
timer commits `CH-17`, releases obligations and removes the temporary status lock.

When an Athlete submits Appeal, switch to **«Central Operator»** and open Community. Central
sees a small FIFO work queue, takes one Appeal into independent review and records one reasoned
decision. `UPHOLD` finalizes the original transition, `REVERSE` changes the effective winner and
recalculates status from the same immutable Session snapshot, `ANNUL` restores the pre-Result
status and removes the old Cooldown, and `REPEAT` additionally returns the same Challenge to a
new 14-day scheduling cycle. Original Result facts, decisions and compensations remain in the
append-only history.

The opponent and assigned Coach can each add one response during the 24-hour response window;
Central review never waits for either response. The appellant may withdraw before a decision and
cannot file again for the same Result. A decisive Result then finalizes immediately; for a
draw/no-contest, the other eligible Athlete retains the original 48-hour choice. The assigned
Central reviewer may extend the visible 72-hour SLA once by 24 or 48 hours with a mandatory public
reason. The status lock stays active and the system never auto-decides an overdue Appeal.

If no Result is recorded after an Official Session, versioned Worker timers remind the original
Coach after 2 hours, escalate to the Venue after 12 hours and open exactly one structured review
after 24 hours. Each Athlete submits a private statement, the Venue confirms attendance and
Central coordinates the case without choosing a winner. Matching statements plus Venue facts
allow Central to assign an authorized, non-conflicted Coach with one constrained outcome. That
Coach records the normal immutable Result; a late original-Coach Result also closes the review.
Conflicting facts lead to a no-fault repeat, or to constrained `NO_CONTEST` only when a repeat is
objectively impossible.

After a Result is `FINAL`, ordinary Appeal is closed. Central can open an exceptional
`IntegrityCase` only for `FRAUD`, `SYSTEM_ERROR` or `IDENTITY_ERROR` and only with a concrete
private evidence reference. Participants and the original Coach see a neutral review marker and
category, never the private material. An independent Central reviewer may uphold, correct, annul
or request a repeat. The source Result remains immutable; a separate decision and replay hash
rebuild the affected Champion/Contender projection, clear the temporary Competition hold and
append the exact status compensation. If a repeat is no longer eligible, the safe effective
outcome is annulment rather than an impossible new obligation.

The Community screen now contains an executable GENESIS Status Engine slice. A verified active
member explicitly presses **«Бороться за статус»** and receives a public FIFO position based only
on server time and the immutable entry ID. The first two candidates are paired atomically, see the
same 48-hour mutual-response window and create no obligation until both accept. A decline or
timeout creates no loss; a candidate who already accepted returns to the exact original FIFO key.
Before pairing, the existing head is revalidated atomically; an ineligible or already-busy head is
invalidated without loss and cannot hold the next willing Athlete for 48 hours. Pairing, responses,
no-fault return and expiry also produce mandatory in-app notifications from the same transaction.
After mutual acceptance, the service Chat opens the existing personal-slot flow and creates an
Official Challenge obligation for both participants.

## Next executable action

Perform the multi-account Web walkthrough for status release, vacancy GENESIS,
Training-to-Official conversion, Training cancellation/solo continuation and the accepted
personal-Slot flow. Then complete event-driven eligibility-loss reconciliation and the remaining
M7 lifecycle/incident contours before pilot hardening.
The technology baseline is fixed by the accepted ADR set and changes through a new ADR.
