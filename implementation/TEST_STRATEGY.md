# MOLOKH MVP Test Strategy

## 1. Objective

Tests prove sporting fairness and recoverability, not only endpoint responses. The most important property is that no concurrency, retry, Appeal or administrative action can create an impossible status/history.

## 2. Test layers

| Layer | Purpose | Runtime |
|---|---|---|
| schema/contract | payloads, error codes, event versions | fast CI |
| pure domain | transition guards, status function, deadlines | fast CI |
| repository/integration | PostgreSQL constraints, locks, transactions | CI PostgreSQL |
| workflow | multi-aggregate saga and timers | CI PostgreSQL + worker |
| API | auth, permissions, idempotency, projections | CI |
| universal client component | action/card states, responsive Web and accessibility | CI |
| end-to-end | critical P0 vertical journeys | gated CI/staging |
| operational rehearsal | incident/replay/backup/runbooks | pre-release |

## 3. Machine conformance

Generate a registry from `STATE_MACHINES.md` or a checked-in machine-readable derivative.

Required gates:

- every allowed transition has one handler/test/event schema;
- no handler emits an unregistered event;
- every non-allowed `(state,command)` returns stable rejection and changes nothing;
- duplicate transition IDs/event names fail CI;
- terminal states reject ordinary mutation;
- same command with same idempotency key is observationally equivalent;
- same idempotency key with changed payload is rejected.
- universal-client TSX requires explicit control roles, field labels, heading hierarchy and
  selected/checked/disabled accessibility state; static Web output must declare the pilot locale.

## 4. Status algebra properties

Property/model tests enumerate role/stake/outcome combinations:

- Champion changes only through TITLE, founding GENESIS, Succession or governed administrative/age event;
- Ordinary beating Contender becomes Contender;
- Champion beating Ordinary in OPEN changes no status;
- TITLE Contender win swaps roles;
- DRAW/NO_CONTEST never changes status;
- no Competition has same User as Champion and Contender;
- one replay and repeated replay yield the same projection hash;
- compensation followed by replay yields the expected effective history without source deletion.

## 5. Concurrency suite

Mandatory database-level races:

1. two pairs host-confirm one Slot;
2. two workers activate one FIFO head;
3. response command races its timeout;
4. two Coaches attempt Result for one context;
5. two status-changing Results become eligible simultaneously;
6. Primary Admin transfer races another transfer;
7. evidence upload intents race the 5-file/100MB limit;
8. PlatformIncident compensation worker retries;
9. Appeal/Integrity decision races ordinary finalizer;
10. Block/Unmatch cleanup races optional Challenge acceptance.
11. closure request with export races a standalone export request; at most one live payload exists
    and the closure path reuses it without a duplicate event/timer.

Expected result is not merely one HTTP success: exact aggregate/event/audit/outbox counts and final projection must be asserted.

## 6. Time tests

Use a controllable injected clock for domain tests and real PostgreSQL timestamps for integration assertions.

Boundaries to test at `t-1ms`, `t`, `t+1ms`:

- Like/archive/suppression expiry;
- optional/mandatory/GENESIS response;
- queue reconfirmation;
- Slot selection and minimum booking notice;
- scheduling + extension;
- Session window, operational/no-show grace and actual Coach start;
- equivalent Coach replacement at the operational-grace boundary and Athlete no-fault opt-out;
- Appeal/waiver;
- birthday Youth→Adult;
- phone-change hold;
- evidence URL/retention;
- exact PlatformIncident overlap.
- account closure cancellation at the 30-day boundary and export payload deletion at +48h.

DST tests use Venue IANA timezone for display while business comparisons remain UTC.

## 7. Permission and privacy tests

For every privileged endpoint:

- no role;
- right role, wrong scope;
- right scope, self-conflict;
- revoked/expired grant;
- active hold/restriction;
- allowed actor;
- audit reason missing/present.

Privacy snapshots assert that public/member/participant/Coach/Admin/Central views expose different fields. Raw Safety evidence, reporter identity, birth date, phone, private invalidation reasons and old display names must never leak into public projections, push, logs or outbox payloads.

## 8. Acceptance scenario execution

`ACCEPTANCE_SCENARIOS.md` is the release catalogue. Tag each automated test with exact `AC-###`.

Run `pnpm coverage:acceptance` to validate those tags and generate
`tmp/acceptance-coverage.md`. The generated `MAPPED` status means that a scenario
is traceable to at least one executable test; it does not claim complete coverage
at every required test layer.

- P0: required before MVP release;
- P1: required before broad rollout unless explicitly accepted for pilot;
- P2: schema/feature-flag contract only.

Create a generated coverage report:

```text
AC ID → test file → status → last run → environment
```

No scenario may be marked covered only by a unit test when it asserts transaction/concurrency/privacy behavior.

## 9. Client UX tests

Golden component states for each action card:

- who acts next;
- deadline and timezone copy;
- pending/expired/terminal;
- irreversible consequence preview;
- BLOCK service-only mode;
- provisional/review marker;
- READY_FOR_COACH vs actual Session;
- Admin replacement options, immutable terms copy and Athlete no-fault cancellation action;
- direct Official Challenge availability, initiator/recipient actions, no-loss terminal copy and accepted scheduling deadline;
- accepted Challenge Slot selection, visible Official purpose, Venue/Coach confirmation and linked Session;
- offline/reconnect/refetch;
- duplicate tap/idempotent response.

Accessibility gates: screen-reader labels, dynamic text, contrast, touch size, focus order and non-color-only status communication.

## 10. Failure injection

In staging/CI simulate:

- notification provider down after commit;
- worker crash after event before delivery receipt;
- database serialization/deadlock retry;
- object scan timeout/quarantine;
- API retry with lost response;
- scheduler delayed beyond deadline;
- projection table dropped and rebuilt;
- PlatformIncident retroactively confirmed after timeout;
- stale mobile client submits prior version.

Business state must remain deterministic and recoverable.

The executable PlatformIncident suite covers AC-195/AC-196 with a real PostgreSQL clock and
append-only facts: exact partial overlap, no-overlap exclusion, duplicate impact replay, active
timer suppression, every pausable-deadline adapter, mandatory timeout compensation and PI-05
only after a zero-candidate rescan. Challenge scheduling separately proves the CH-24 first
deadline extension and CH-25 second-deadline no-fault cancellation.

Official Session lifecycle integration additionally proves that the scheduled boundary creates
one immutable competitive snapshot without actual attendance, actual Start creates `CH-13` once,
End creates `CH-14` once, and the resulting Challenge stays `RESULT_PENDING` until a separate
authorized Coach Result command. Ordinary Training remains statistically and competitively
isolated from this path.

Result integration additionally proves that one authorized Coach write creates exactly one
Result and Cooldown, transfers Contender from the immutable Session snapshot, exposes the change
as provisional and rejects a second Result. The real PostgreSQL path now also submits Appeal,
assigns an independent Central reviewer, reverses the winner, restores the corrected Contender,
unlocks the Competition and preserves both the source transition and compensation record.
Worker tests prove that recorded/waiver timer payloads are accepted only for `FINALIZE_RESULT`;
the common timer processor rejects stale state/version snapshots before executing a mutation.

## 11. Release gates

- all P0 mapped and passing;
- no missing transition/event/error schema;
- zero forbidden direct status/Result mutation paths;
- concurrency suite green repeatedly;
- replay hash verified from clean projection;
- no high-severity security/privacy findings;
- timer/outbox/case dashboards and alerts tested;
- backup restore and projection rebuild rehearsed;
- Central can resolve every stuck process without database editing.
