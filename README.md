# MOLOKH

Molokh — mobile-first продукт для поиска партнёров по тренировкам и прозрачной передачи спортивного статуса внутри Community физического зала.

## Current state

- Core Engine: **v1.0, product decisions closed**;
- state transitions: **309**;
- registered events: **310**;
- acceptance scenarios: **214** (`196 P0`, `17 P1`, `1 P2`);
- executable acceptance traceability: **167/214** (`161/196 P0`);
- open blocking product questions: **0**;
- implementation code: M0/M1, the local Identity/Community/role slices, M3 and the ordinary Training slice M4 are complete; Home Venue is an editable Discovery/Slot preference with no Membership/status/FIFO/Challenge side effect; M5 runs optional, GENESIS and strict-FIFO mandatory Official Challenges through Booking/Result, provisional status movement, Cooldown and finalization; M6 includes Appeal submission/waiver, opponent/Coach responses, appellant withdrawal, transparent SLA extension, Central decisions and the complete MissingResultReview path with an independent reviewer-Coach; M7 now includes QR/self-request/Admin decision/withdrawal Membership entry, Community pause/closure, voluntary Membership exit, governed Membership removal, the disabled-by-default Youth consent foundation, the deterministic age-18 transition, full PlatformIncident reconciliation, recoverable account closure/self-export, account-access governance and persistent OTP/rotating sessions;
- database gate: PostgreSQL migrations `0001`–`0063` and **53/53** integration scenarios pass locally;
- critical-command audit gate: Coach Result, scoped Gym Admin evidence and assigned Central Appeal
  decisions preserve the DB-authorized actor context, normalized reason, before/after state,
  request/correlation/causation lineage and server time in one append-only transaction;
- production dependency gate: Expo patch releases are aligned; all published production-runtime fixes are installed, and the
  resolved `shell-quote` security release is pinned transitively; the unresolved upstream
  `node-forge` and `braces` advisories are covered by narrow regression-tested local backports that
  expire on 2026-10-16 and reject every other high/critical advisory;
- external deployment/accounts: not configured.

Production API startup is fail-closed and uses the database-backed session model only: local
fixtures/static bearer tokens are disabled, Central endpoints recheck the current active global
role, and secrets, pilot Community/Competition IDs plus HTTPS browser origins must be explicit.
The required variable names are documented in [`.env.example`](.env.example); real values belong
in the deployment secret store and must never be committed.

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
Athlete, Coach, Gym Admin and Central accounts, a Membership applicant without an active
Community relationship, plus five temporary Discovery profiles.
Use **«Сменить»** in the development-only **«Тестовый аккаунт»** panel to move between
them without restarting Expo. No SMS or production credential is required for this local slice.
Switch to **«Кирилл Старт»** to submit a Membership request, then to
**«Пилотный администратор»** to approve it or reject it with a neutral reason from the FIFO
queue. Before an Admin decision Кирилл can withdraw the request without penalty.
For the real database-backed authentication path, open **«Сменить» → «Настоящая сессия»**,
leave the pilot number `+79990000001`, request a code and sign in. Only the development build
shows and pre-fills that code. Web keeps refresh in an HttpOnly cookie and access only in memory;
native clients keep refresh in Expo SecureStore. The same panel ends the managed session.
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
Session. Confirmations for different overlapping Slots are serialized around both Athletes: only
one can create a Session, and the other returns `ATHLETE_SCHEDULE_CONFLICT` without reserving its
Slot or choosing an alternative automatically.

Before Coach/Gym Admin confirmation, the personal Booking remains
`HOST_CONFIRMATION_PENDING`, with a frozen price and terms snapshot, while the Slot remains
unreserved. Either Athlete can cancel that Slot request after an explicit confirmation: the
Booking becomes `CANCELLED`, the peer and any waiting Coach are notified, and an Official
Challenge returns to `ACCEPTED_UNSCHEDULED` with the same obligations and scheduling deadline.
No Result, loss, Forfeit, Cooldown or reschedule is created. The GroupPlan becomes `NOTIFIED`, sends an in-app notice to the Venue Admin and
still makes no capacity or statistics claim.

«Перенести Challenge» — отдельное явное действие. Первый односторонний перенос отменяет
незавершённый Booking, оставляет Slot опубликованным и возвращает Challenge к выбору времени,
но расходует один из двух пользовательских переносов. Инициатор, категория причины, время,
виновная сторона и связанный Booking сохраняются append-only; свободный текст причины остаётся
во внутреннем защищённом журнале. Исходные обязательства и 14-дневный deadline не меняются.
Взаимный перенос сначала создаёт только видимое обоим предложение и ничего не меняет. После
подтверждения второй стороной он расходует один общий перенос без виновного, закрывает связанные
pre-start Booking/Session/Slot по CH-21/B-15/SL-06 и возвращает Challenge к выбору времени с теми
же обязательствами и canonical scheduling deadline.
Если назначенный Coach либо авторизованный представитель зала подтверждает внешнюю недоступность
до actual start, те же ресурсы закрываются no-fault, но пользовательский счётчик не расходуется
даже после двух переносов. Challenge возвращается к выбору времени с исходными обязательствами и
deadline; EXTERNAL-причина и связанная Session сохраняются в прозрачной audit/event lineage.

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
invitation sends stale-safe recipient-only reminders after 12 and 24 hours, then expires after
exactly 48 hours through the Worker with no loss, Result, Cooldown, obligation or additional pair
quiet. The terminal pair may invite again after the ordinary eligibility checks pass again.

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
`NO_SHOW` to the only valid outcome. One absence can be recorded only after the configured grace
and requires a separate Coach-confirmed `NO_SHOW` Result with the present Athlete as winner and
the standard 48-hour Appeal. Two absences normalize only to `NO_CONTEST`, with no winner, status
change, loss or Cooldown. `LATE` remains attendance metadata only: it never creates a
loss, Forfeit, administrative Result or Cooldown, and the Coach may record the ordinary sporting
outcome. The same transaction creates the immutable Result, moves
Challenge through `CH-15`, applies any provisional Champion/Contender transition, starts the
configured pair Cooldown and schedules finalization exactly 48 hours later. The eligible Athlete
may submit Appeal or explicitly waive it. A decisive Result finalizes early when its sole eligible
loser waives; draw/no-contest requires both eligible Athletes. Otherwise the versioned Worker
timer commits `CH-17`, releases obligations and removes the temporary status lock.

The Competition status projection is recoverable rather than authoritative. A Central-only,
versioned rebuild locks the Competition, derives Champion/Contender, status version, tenure
history and Cooldowns from the immutable event journal, replaces only disposable projection
state and verifies the same deterministic hash before commit. Canonical Result, decision,
snapshot and event facts are never deleted or rewritten; a concurrent Result advances the
canonical version and makes the rebuild fail safely before partial effects.

Result photo/video is deliberately unavailable in the MVP. The closed Result request schema,
API surface, database model and client expose sporting facts only: there is no upload capability,
ticket, attachment table or object-storage write, and canonical event/audit/outbox payloads contain
no media reference. The Coach UI states this boundary without presenting a disabled or misleading
upload action. Media can be added later behind a separate capability without changing the current
Result lifecycle.

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

An assigned, actively authorized Coach does not use the Athlete Appeal action to correct a winner
or outcome. The Result card opens a separate Technical Correction form and makes clear that this
only submits an immutable `SUBMITTED` request to Central. The private explanation and evidence
reference stay in protected state and audit metadata; notifications are neutral. The original
Result, Challenge, provisional status, Cooldown and Appeal clock do not change. Concurrent or
replayed submissions create at most one open request for the Result. Central currently receives a
read-only FIFO queue; approve/reject decisions remain a separate later slice.

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

Mandatory notifications now also materialize a provider-independent `CRITICAL/PUSH` delivery
intent. The intent contains only notification/event/User references, never phone or e-mail, and
remains safely pending while no external provider is configured. `SMS` is materialized only when
the User has an explicit `event_sms_opt_in=true` preference; an absent preference means opt-out.
Inbox replay and a database uniqueness constraint prevent duplicate channel intents, while read or
delivery state never changes the server-owned Challenge deadline or rolls back business state.

Central now has an executable Community lifecycle control. `PAUSE_COMMUNITY` atomically pauses
the Community and every live Competition, writes one durable pause interval and blocks new
Official actions. On reactivation, every still-valid Challenge response/scheduling deadline moves
by the exact pause duration, while Pair Cooldown endpoints stay unchanged. Confirmed Sessions keep
their state and scheduled time. Timer workers re-read the current projection deadline, so a timer
created before the pause cannot fire early after reactivation. The Central UI requires a reason and
shows these consequences before the versioned command is available.

Scoped Gym Admin and Central can now publish a new Pair Cooldown value from 7 to 30 days through
`CO-06`. The client shows the current public configuration version and explains that publication
affects only new processes. PostgreSQL appends an immutable configuration row and switches the
Community pointer atomically with event/audit/outbox; previous Challenge and Session snapshots,
Results and already-created Cooldowns keep their original configuration and dates.

Permanent closure now follows a separate versioned `Closure Plan`; it is never an overloaded
pause. Central records a future effective time (or an explicit emergency), a reason/category and
one disposition for every confirmed Official Session, including physically ended Sessions whose
Result or Appeal is still open. Scheduling the plan moves Community to `CLOSING`, closes every
Competition to new actions, cancels pending Challenges no-fault and preserves only explicitly
retained Sessions. Finalization is rejected before the effective time or while any retained
Session/Result/Appeal path is unresolved. A successful finalization archives live Memberships,
closes Competitions and current Champion/Contender records with `COMMUNITY_CLOSED`, and performs
no loss, succession or status migration. The Central UI exposes the same two-step review and
confirmation flow; migration `0042_community_closure_foundation.sql` stores the immutable plan and
Session/status dispositions.

Voluntary Membership exit now has its own two-step lifecycle instead of reusing status-only
release. The Athlete first receives a token-bound 15-minute preview with exact succession or
vacancy consequences. Confirmation closes optional unanswered Challenges no-fault, invalidates
the Athlete's live FIFO intents, applies deterministic ST-09/ST-10/ST-14 when needed and moves the
Membership to `LEFT` without Result, loss or Cooldown. Migration
`0043_voluntary_membership_exit.sql` stores immutable preview/confirmation history. Migration
`0044_membership_exit_accepted_forfeit.sql` extends the same preview for an accepted Challenge:
confirmation cancels any not-started Booking/Session/Slot, records and immediately finalizes an
administrative Forfeit, creates the pair Cooldown, stores an immutable voluntary-resignation
Appeal waiver, releases obligations and then removes any status temporarily assigned to the
departing Athlete. A started Session remains under the Coach and frozen ruleset path.

Membership removal is now a separate governed contour. Gym Admin sees active Community members
and may remove only an Ordinary immediately; the operation cancels incomplete Challenge/Booking
work no-fault, preserves history and opens an exact 48-hour Appeal window. An overturned removal
creates a new active Membership and never resurrects cancelled processes. For Champion or
Contender the same Admin action only creates `UNDER_REVIEW` plus a Competition `STATUS_REVIEW`
hold. Central independently confirms or rejects the request; confirmation applies transparent
succession/vacancy without a Result or sporting loss. While the hold is active, status Challenge
deadlines are retained and an already booked Official Session cannot start; an in-progress or
Result-pending Session must first complete its Coach-governed path. Migration
`0045_membership_removal_governance.sql` stores the immutable case and reusable ProcessHold.

Youth Official now has an isolated consent foundation behind the disabled `YOUTH_OFFICIAL`
feature flag. Every Youth Athlete needs a separate Challenge-scoped consent. The Athlete supplies
an e-mail (or explicitly opts into SMS), and the guardian uses a token-scoped web page to grant,
decline or revoke without creating an account or uploading documents. The domain table stores a
keyed contact hash/mask, declared name/relationship and an audit hash; the raw destination exists only
in the transactional delivery outbox. Missing or revoked consent blocks Challenge acceptance,
Slot selection and host confirmation. Adult flows are unchanged. Migration
`0046_youth_consent_foundation.sql` also introduces the constrained `EXTERNAL` event actor. The
flag must remain off until pilot legal wording, privacy/retention and delivery operations are
approved.

A guardian revocation after an Official Session is booked now closes only the competitive
Challenge and releases its obligations. Migration `0047_booking_training_retention.sql` holds the
physical Slot for at most one hour or until scheduled start. The same Session becomes ordinary
Training only after both Athletes and the assigned Coach or Venue host explicitly accept; decline
or timeout cancels the Booking/Session no-fault. The retained lineage stays auditable while no
Result, status, loss or Cooldown is created.

The 18th-birthday boundary is now a single idempotent `AgeDivisionTransition` (`0→1`) scheduled
at UTC server-date midnight. Migration `0048_age_division_transition.sql` records immutable
lineage, moves the User and current Membership to Adult Ordinary, expires Youth consent and FIFO,
vacates Youth status without a loss and closes every not-started Youth Official no-fault. A
confirmed future Booking reuses B-26 instead of discarding the physical training. An already
started Youth Session, its competitive snapshot, Challenge and obligations remain untouched and
finish under the frozen Youth rules.

The PlatformIncident contour now runs PI-01…PI-05 end to end. An objectively detected incident
requires Central confirmation, suppresses only registered affected timers while active and, after
resolution, extends each pausable deadline by its exact overlap. A mandatory timeout that already
created a Forfeit is preserved in history and receives append-only no-fault Result/status/Cooldown
compensation. Worker reconciliation is idempotent and marks the incident `COMPENSATED` only after
all candidates are exhausted. Central has a role-gated incident queue and confirm/reject/resolve
actions. Challenge scheduling follows CH-24/CH-25: 14 days, one visible 7-day extension with
expanded options, then `CANCELLED_NO_FAULT` if capacity is still unavailable.

Account lifecycle now runs ACR-01…ACR-03 and ADE-01…ADE-03 end to end. A User may request
closure and an optional private export, cancel closure strictly inside the 30-day recovery window,
and download a prepared JSON snapshot for 48 hours. Central sees exact blocker counts and may
execute only after recovery with no accepted obligation, status, active Session/Membership/role or
FIFO entry. Final closure pseudonymizes public identity while preserving immutable sporting/audit
lineage. The Worker prepares exports and deletes expired payloads without deleting their checksum
or event/audit history; a live standalone export is reused by closure instead of duplicated.

## Next executable action

The Athlete, Coach, Gym Admin and Central role-switch walkthrough plus the isolated PostgreSQL
backup/restore plus notification shadow-rebuild rehearsal are complete. Continue with M8
real-browser zoom and real-device screen-reader checks. The static accessibility gate is now part of
`pnpm check`. The read-only pilot monitor is executable and currently reports only the
two deliberately unstarted Sessions awaiting Coach action. External OTP and private object/scan providers
remain explicit deployment inputs rather than hidden local substitutes.
The technology baseline is fixed by the accepted ADR set and changes through a new ADR.

Migration `0058` and the daily Worker now enforce 12-month personal and three-year service Chat
payload retention in bounded audited batches. Report/Case snapshots, revision checksums and all
business/audit history remain intact; attachment cleanup stays off with the disabled media feature.

Before rolling application code back, run `pnpm check:rollback -TargetRef <known-good-git-ref>`.
It rejects a target that does not contain the exact immutable migration history already applied to
PostgreSQL; ordinary rollback never uses down migrations or rewrites sporting history.

After deploying a candidate, run `pnpm check:canary -ApiBaseUrl <api-url>
-ExpectedRelease <full-git-sha> -ExpectedWebOrigin <web-origin>`. Production refuses to boot without
an immutable `RELEASE_SHA`, and the canary rejects a healthy but unexpected artifact.
